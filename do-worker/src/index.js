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

function nowIso() {
  return new Date().toISOString();
}

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
      CREATE TABLE IF NOT EXISTS users(
        username TEXT PRIMARY KEY,
        passhash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions(
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kv(
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stats(
        k TEXT PRIMARY KEY,
        v INTEGER NOT NULL
      );
    `);

    const st = this.sql.exec("SELECT v FROM kv WHERE k='state'").toArray()[0];
    if (!st) {
      const initState = {
        current: null,
        previous: [],
        note: "",
        noteBy: "",
        updatedAt: nowIso(),
      };
      this.sql.exec("INSERT INTO kv(k,v) VALUES(?,?)", "state", JSON.stringify(initState));
    }

    const s1 = this.sql.exec("SELECT v FROM stats WHERE k='called_total'").toArray()[0];
    if (!s1) {
      this.sql.exec("INSERT INTO stats(k,v) VALUES('called_total',0)");
      this.sql.exec("INSERT INTO stats(k,v) VALUES('called_male',0)");
      this.sql.exec("INSERT INTO stats(k,v) VALUES('called_female',0)");
    }
  }

  async ensureAdminAsync() {
    const admin = this.sql.exec("SELECT username FROM users WHERE username='admin'").toArray()[0];
    if (admin) return;
    const passhash = await sha256("admin1234");
    this.sql.exec(
      "INSERT INTO users(username, passhash, role, created_at) VALUES(?,?,?,?)",
      "admin",
      passhash,
      "admin",
      nowIso()
    );
  }

  getState() {
    const row = this.sql.exec("SELECT v FROM kv WHERE k='state'").one();
    return JSON.parse(row.v);
  }

  setState(stateObj) {
    this.sql.exec("UPDATE kv SET v=? WHERE k='state'", JSON.stringify(stateObj));
  }

  getAuthToken(request) {
    const h = request.headers.get("authorization") || "";
    if (!h.toLowerCase().startsWith("bearer ")) return "";
    return h.slice(7).trim();
  }

  getSession(token) {
    if (!token) return null;
    const row = this.sql.exec(
      "SELECT token, username, role, expires_at FROM sessions WHERE token=?",
      token
    ).toArray()[0];
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

  bumpStat(k, delta = 1) {
    this.sql.exec("UPDATE stats SET v=v+? WHERE k=?", delta, k);
  }

  async fetch(request) {
    await this.ensureAdminAsync();

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health") return json({ ok: true });

    if (path === "/api/login" && request.method === "POST") {
      const body = await readJson(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) return json({ ok: false, error: "MISSING_FIELDS" }, 400);

      const row = this.sql.exec(
        "SELECT username, passhash, role FROM users WHERE username=?",
        username
      ).toArray()[0];
      if (!row) return json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const passhash = await sha256(password);
      if (passhash !== row.passhash) return json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const token = makeToken();
      const created_at = nowIso();
      const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
      this.sql.exec(
        "INSERT INTO sessions(token, username, role, created_at, expires_at) VALUES(?,?,?,?,?)",
        token, row.username, row.role, created_at, expires_at
      );

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

      const state = this.getState();
      const prev = Array.isArray(state.previous) ? state.previous : [];
      if (state.current) prev.unshift(state.current);
      state.previous = prev.slice(0, 15);

      state.current = { number, gender, by: auth.ses.username, at: nowIso() };
      state.updatedAt = nowIso();
      this.setState(state);

      this.bumpStat("called_total", 1);
      this.bumpStat(gender === "female" ? "called_female" : "called_male", 1);

      return json({ ok: true, state });
    }

    if (path === "/api/prev" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin", "staff"]);
      if (!auth.ok) return auth.res;

      const state = this.getState();
      const prev = Array.isArray(state.previous) ? state.previous : [];
      const back = prev.shift();
      if (!back) return json({ ok: false, error: "NO_PREVIOUS" }, 400);

      if (state.current) prev.unshift(state.current);
      state.current = back;
      state.previous = prev.slice(0, 15);
      state.updatedAt = nowIso();
      this.setState(state);

      return json({ ok: true, state });
    }

    if (path === "/api/note" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin", "staff"]);
      if (!auth.ok) return auth.res;

      const body = await readJson(request);
      const note = String(body.note || "").trim();

      const state = this.getState();
      state.note = note;
      state.noteBy = auth.ses.username;
      state.updatedAt = nowIso();
      this.setState(state);

      return json({ ok: true, state });
    }

    // Admin only
    if (path === "/api/stats" && request.method === "GET") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;

      const rows = this.sql.exec("SELECT k,v FROM stats").toArray();
      const stats = {};
      for (const r of rows) stats[r.k] = r.v;
      return json({ ok: true, stats });
    }

    if (path === "/api/stats/reset" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;

      this.sql.exec("UPDATE stats SET v=0");
      return json({ ok: true });
    }

    if (path === "/api/users" && request.method === "GET") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;

      const rows = this.sql.exec(
        "SELECT username, role, created_at FROM users ORDER BY created_at DESC"
      ).toArray();
      return json({ ok: true, users: rows });
    }

    if (path === "/api/users" && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;

      const body = await readJson(request);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const role = body.role === "admin" ? "admin" : "staff";
      if (!username || !password) return json({ ok: false, error: "MISSING_FIELDS" }, 400);

      const exists = this.sql.exec("SELECT username FROM users WHERE username=?", username).toArray()[0];
      if (exists) return json({ ok: false, error: "USER_EXISTS" }, 409);

      const passhash = await sha256(password);
      this.sql.exec(
        "INSERT INTO users(username, passhash, role, created_at) VALUES(?,?,?,?)",
        username, passhash, role, nowIso()
      );
      return json({ ok: true });
    }

    if (path.startsWith("/api/users/") && path.endsWith("/password") && request.method === "POST") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;

      const parts = path.split("/");
      const username = decodeURIComponent(parts[3] || "");
      const body = await readJson(request);
      const password = String(body.password || "");
      if (!username || !password) return json({ ok: false, error: "MISSING_FIELDS" }, 400);

      const passhash = await sha256(password);
      this.sql.exec("UPDATE users SET passhash=? WHERE username=?", passhash, username);
      return json({ ok: true });
    }

    if (path.startsWith("/api/users/") && request.method === "DELETE") {
      const auth = this.requireRole(request, ["admin"]);
      if (!auth.ok) return auth.res;

      const parts = path.split("/");
      const username = decodeURIComponent(parts[3] || "");
      if (!username) return json({ ok: false, error: "MISSING_USERNAME" }, 400);
      if (username === "admin") return json({ ok: false, error: "CANNOT_DELETE_ADMIN" }, 400);

      this.sql.exec("DELETE FROM users WHERE username=?", username);
      return json({ ok: true });
    }

    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

export default {
  async fetch() {
    return new Response("traffic-queue-do OK");
  }
};
