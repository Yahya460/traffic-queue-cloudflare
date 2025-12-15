import { sha256 } from "./utils.js";

function nowIso() { return new Date().toISOString(); }

function makeToken() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

export class QueueDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
  }

  async ensureSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        passhash TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
  }

  async ensureDefaults() {
    // مدير افتراضي: yusuf / 2626
    const a = this.sql.exec("SELECT 1 FROM users WHERE username = ?", "yusuf").toArray();
    if (!a.length) {
      const h = await sha256("2626");
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        "yusuf", h, "admin", nowIso()
      );
    }

    // موظف تجريبي: khalid / 1234
    const s = this.sql.exec("SELECT 1 FROM users WHERE username = ?", "khalid").toArray();
    if (!s.length) {
      const h = await sha256("1234");
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        "khalid", h, "staff", nowIso()
      );
    }
  }

  getAuthToken(request) {
    const h = request.headers.get("Authorization") || request.headers.get("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
  }

  authUser(request) {
    const t = this.getAuthToken(request);
    if (!t) return null;
    const row = this.sql.exec("SELECT token, username, role FROM sessions WHERE token = ?", t).toArray()[0];
    return row || null;
  }

  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  async fetch(request) {
    await this.ensureSchema();
    await this.ensureDefaults();

    const url = new URL(request.url);
    const path = url.pathname;

    // ✅ health
    if (path === "/api/health") return this.json({ ok: true });

    // ✅ login
    if (path === "/api/login" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}

      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (!username || !password) return this.json({ ok: false, error: "MISSING_FIELDS" }, 400);

      const row = this.sql.exec(
        "SELECT username, passhash, role FROM users WHERE username = ?",
        username
      ).toArray()[0];

      if (!row) return this.json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const h = await sha256(password);
      if (h !== row.passhash) return this.json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const token = makeToken();
      this.sql.exec(
        "INSERT INTO sessions (token, username, role, created_at) VALUES (?,?,?,?)",
        token, row.username, row.role, nowIso()
      );

      return this.json({ ok: true, token, user: { username: row.username, role: row.role } });
    }

    // ✅ logout
    if (path === "/api/logout" && request.method === "POST") {
      const t = this.getAuthToken(request);
      if (t) this.sql.exec("DELETE FROM sessions WHERE token = ?", t);
      return this.json({ ok: true });
    }

    // ✅ state (شاشة العرض تسحب منه)
    if (path === "/api/state" && request.method === "GET") {
      const img = await this.ctx.storage.get("displayImage");
      const imgAt = await this.ctx.storage.get("displayImageAt");
      return this.json({ ok: true, displayImage: img || "", displayImageAt: imgAt || "" });
    }

    // ✅ Admin فقط: إرسال صورة لشاشة العرض
    if (path === "/api/admin/display-image" && request.method === "POST") {
      const auth = this.authUser(request);
      if (!auth) return this.json({ ok: false, error: "UNAUTHORIZED" }, 401);
      if (auth.role !== "admin") return this.json({ ok: false, error: "FORBIDDEN" }, 403);

      let body = {};
      try { body = await request.json(); } catch {}

      const dataUrl = String(body.dataUrl || "");
      if (!dataUrl.startsWith("data:image/")) {
        return this.json({ ok: false, error: "BAD_IMAGE" }, 400);
      }

      await this.ctx.storage.put("displayImage", dataUrl);
      await this.ctx.storage.put("displayImageAt", nowIso());
      return this.json({ ok: true });
    }

    // ✅ Admin فقط: مسح الصورة
    if (path === "/api/admin/display-image/clear" && request.method === "POST") {
      const auth = this.authUser(request);
      if (!auth) return this.json({ ok: false, error: "UNAUTHORIZED" }, 401);
      if (auth.role !== "admin") return this.json({ ok: false, error: "FORBIDDEN" }, 403);

      await this.ctx.storage.delete("displayImage");
      await this.ctx.storage.put("displayImageAt", nowIso());
      return this.json({ ok: true });
    }

    return this.json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}
