import { DurableObject } from "cloudflare:workers";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
async function readJson(request) {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await request.json();
  return {};
}
function nowIso() { return new Date().toISOString(); }
function makeToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class QueueDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users(username TEXT PRIMARY KEY, passhash TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, username TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);

    const st = this.sql.exec("SELECT v FROM kv WHERE k='state'").toArray()[0];
    if (!st) {
      const initState = {
        current: null,
        previous: [],
        updatedAt: nowIso(),
        staffToAdmin: { text: "", by: "", at: "" },
        adminToStaff: {},
        displayMessage: { text: "", by: "admin", at: "", active: false },
        tickerMessage: { text: "", by: "admin", at: "" },
        displayPing: 0
      };
      this.sql.exec("INSERT INTO kv(k,v) VALUES(?,?)", "state", JSON.stringify(initState));
    }
  }

  async ensureAdminAsync() {
    const admin = this.sql.exec("SELECT username FROM users WHERE username='admin'").toArray()[0];
    if (admin) return;
    const passhash = await sha256("admin1234");
    this.sql.exec("INSERT INTO users(username, passhash, role, created_at) VALUES(?,?,?,?)", "admin", passhash, "admin", nowIso());
  }

  getState() {
    const row = this.sql.exec("SELECT v FROM kv WHERE k='state'").one();
    return JSON.parse(row.v);
  }
  setState(s) { this.sql.exec("UPDATE kv SET v=? WHERE k='state'", JSON.stringify(s)); }

  getAuthToken(request) {
    const h = request.headers.get("authorization") || "";
    if (!h.toLowerCase().startsWith("bearer ")) return "";
    return h.slice(7).trim();
  }
  getSession(token) {
    if (!token) return null;
    const row = this.sql.exec("SELECT token, username, role, expires_at FROM sessions WHERE token=?", token).toArray()[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      this.sql.exec("DELETE FROM sessions WHERE token=?", token);
      return null;
    }
    return row;
  }
  requireRole(request, roles) {
    const token = this.getAuthToken(request);
    const ses = this.getSession(token);
    if (!ses) return { ok: false, res: json({ ok: false, error: "UNAUTHORIZED" }, 401) };
    if (!roles.includes(ses.role)) return { ok: false, res: json({ ok: false, error: "FORBIDDEN" }, 403) };
    return { ok: true, ses };
  }

  async fetch(request) {
    await this.ensureAdminAsync();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/login" && request.method === "POST") {
      const body = await readJson(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) return json({ ok: false, error: "MISSING_FIELDS" }, 400);

      const row = this.sql.exec("SELECT username, passhash, role FROM users WHERE username=?", username).toArray()[0];
      if (!row) return json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const passhash = await sha256(password);
      if (passhash !== row.passhash) return json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const token = makeToken();
      const created_at = nowIso();
      const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
      this.sql.exec("INSERT INTO sessions(token, username, role, created_at, expires_at) VALUES(?,?,?,?,?)", token, row.username, row.role, created_at, expires_at);
      return json({ ok: true, token, username: row.username, role: row.role });
    }

    if (path === "/api/logout" && request.method === "POST") {
      const token = this.getAuthToken(request);
      if (token) this.sql.exec("DELETE FROM sessions WHERE token=?", token);
      return json({ ok: true });
    }

    if (path === "/api/state" && request.method === "GET") {
      return json({ ok: true, state: this.getState() });
    }

    if (path === "/api/next" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin", "staff"]);
      if (!auth.ok) return auth.res;
      const body = await readJson(request);
      const number = String(body.number || "").trim();
      const gender = body.gender === "female" ? "female" : "male";
      if (!number) return json({ ok: false, error: "MISSING_NUMBER" }, 400);

      const s = this.getState();
      const prev = Array.isArray(s.previous) ? s.previous : [];
      if (s.current) prev.unshift(s.current);
      s.previous = prev.slice(0, 15);
      s.current = { number, gender, by: auth.ses.username, at: nowIso() };
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/prev" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin", "staff"]);
      if (!auth.ok) return auth.res;
      const s = this.getState();
      const prev = Array.isArray(s.previous) ? s.previous : [];
      const back = prev.shift();
      if (!back) return json({ ok: false, error: "NO_PREVIOUS" }, 400);
      if (s.current) prev.unshift(s.current);
      s.current = back;
      s.previous = prev.slice(0, 15);
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/message/to-admin" && request.method === "POST") {
      const auth = this.requireRole(request, ["staff"]);
      if (!auth.ok) return auth.res;
      const body = await readJson(request);
      const text = String(body.text || "").trim();
      const s = this.getState();
      s.staffToAdmin = { text, by: auth.ses.username, at: nowIso() };
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/message/to-staff" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const body = await readJson(request);
      const to = String(body.to || "").trim();
      const text = String(body.text || "").trim();
      if (!to) return json({ ok: false, error: "MISSING_TO" }, 400);
      const s = this.getState();
      if (!s.adminToStaff || typeof s.adminToStaff !== "object") s.adminToStaff = {};
      s.adminToStaff[to] = { text, by: auth.ses.username, at: nowIso() };
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/display-message" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const body = await readJson(request);
      const text = String(body.text || "").trim();
      const active = body.active === false ? false : true;
      const s = this.getState();
      s.displayMessage = { text, by: auth.ses.username, at: nowIso(), active: active && !!text };
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/display-message/clear" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const s = this.getState();
      s.displayMessage.active = false;
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/ticker" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const body = await readJson(request);
      const text = String(body.text || "").trim();
      const s = this.getState();
      s.tickerMessage = { text, by: auth.ses.username, at: nowIso() };
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/ticker/clear" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const s = this.getState();
      s.tickerMessage = { text: "", by: auth.ses.username, at: nowIso() };
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/display/ping" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const s = this.getState();
      s.displayPing = (s.displayPing || 0) + 1;
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true, ping: s.displayPing });
    }

    if (path === "/api/queue/reset" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const s = this.getState();
      s.current = null;
      s.previous = [];
      s.displayMessage = { text: "", by: auth.ses.username, at: nowIso(), active: false };
      s.updatedAt = nowIso();
      this.setState(s);
      return json({ ok: true });
    }

    if (path === "/api/users" && request.method === "GET") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;
      const rows = this.sql.exec("SELECT username, role, created_at FROM users ORDER BY created_at DESC").toArray();
      return json({ ok: true, users: rows });
    }

    
    // --- إدارة المستخدمين (Admin فقط) ---
    if (path === "/api/users" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const body = await safeJson(request);
      const username = (body?.username || "").trim();
      const password = (body?.password || "").toString();
      const role = (body?.role || "staff").toString();

      if (!username || username.length < 2) return json({ ok: false, error: "INVALID_USERNAME" }, 400);
      if (!password || password.length < 4) return json({ ok: false, error: "INVALID_PASSWORD" }, 400);
      if (!["staff", "admin"].includes(role)) return json({ ok: false, error: "INVALID_ROLE" }, 400);

      const exists = this.sql.exec("SELECT 1 FROM users WHERE username = ?", [username]).toArray();
      if (exists.length) return json({ ok: false, error: "USER_EXISTS" }, 409);

      const passwordHash = await sha256(password);
      this.sql.exec("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username, passwordHash, role]);

      return json({ ok: true });
    }

    // DELETE /api/users/:username
    if (path.startsWith("/api/users/") && request.method === "DELETE" && !path.endsWith("/password")) {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const username = decodeURIComponent(path.slice("/api/users/".length));
      if (!username) return json({ ok: false, error: "INVALID_USERNAME" }, 400);
      if (username === "admin") return json({ ok: false, error: "CANNOT_DELETE_ADMIN" }, 400);

      this.sql.exec("DELETE FROM users WHERE username = ?", [username]);
      // تنظيف أي جلسات قديمة لهذا المستخدم
      this.sql.exec("DELETE FROM sessions WHERE username = ?", [username]);

      return json({ ok: true });
    }

    // PUT /api/users/:username/password  (تغيير كلمة المرور)
    if (path.startsWith("/api/users/") && path.endsWith("/password") && request.method === "PUT") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const base = path.slice("/api/users/".length, -"/password".length);
      const username = decodeURIComponent(base);
      const body = await safeJson(request);
      const password = (body?.password || "").toString();
      if (!username) return json({ ok: false, error: "INVALID_USERNAME" }, 400);
      if (!password || password.length < 4) return json({ ok: false, error: "INVALID_PASSWORD" }, 400);

      const passwordHash = await sha256(password);
      this.sql.exec("UPDATE users SET password_hash = ? WHERE username = ?", [passwordHash, username]);
      // قد تكون هناك جلسات قديمة، نحذفها ليُطلب تسجيل دخول جديد
      this.sql.exec("DELETE FROM sessions WHERE username = ?", [username]);

      return json({ ok: true });
    }

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

export default {
  async fetch() {
    return new Response("traffic-queue-do v4-ar2 OK");
  }
};
