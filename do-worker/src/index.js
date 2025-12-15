import { sha256 } from "./utils.js";

function nowIso() {
  return new Date().toISOString();
}

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
    // users
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        passhash TEXT NOT NULL,
        role     TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // sessions
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
    // ✅ Admin: يوسف / 2626
    const adminExists = this.sql
      .exec("SELECT 1 FROM users WHERE username = ?", "يوسف")
      .toArray();

    if (!adminExists.length) {
      const hash = await sha256("2626");
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        "يوسف",
        hash,
        "admin",
        nowIso()
      );
    }

    // ✅ Staff: خالد / 1234 (اختياري لكن مفيد للاختبار)
    const staffExists = this.sql
      .exec("SELECT 1 FROM users WHERE username = ?", "خالد")
      .toArray();

    if (!staffExists.length) {
      const hash = await sha256("1234");
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        "خالد",
        hash,
        "staff",
        nowIso()
      );
    }
  }

  getAuthToken(request) {
    const h = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
  }

  requireAuth(request) {
    const t = this.getAuthToken(request);
    if (!t) return null;

    const row = this.sql
      .exec("SELECT token, username, role FROM sessions WHERE token = ?", t)
      .toArray()[0];

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

    // 🩺 Health
    if (path === "/api/health") {
      return this.json({ ok: true });
    }

    // 🔐 Login
    if (path === "/api/login" && request.method === "POST") {
      let body;
      try { body = await request.json(); } catch { body = {}; }

      const username = (body.username || "").trim();
      const password = (body.password || "");

      if (!username || !password) {
        return this.json({ ok: false, error: "MISSING_FIELDS" }, 400);
      }

      const row = this.sql
        .exec("SELECT username, passhash, role FROM users WHERE username = ?", username)
        .toArray()[0];

      if (!row) return this.json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const hash = await sha256(password);
      if (hash !== row.passhash) return this.json({ ok: false, error: "INVALID_LOGIN" }, 401);

      // اصدار توكن جديد وتخزينه
      const token = makeToken();
      this.sql.exec(
        "INSERT INTO sessions (token, username, role, created_at) VALUES (?,?,?,?)",
        token,
        row.username,
        row.role,
        nowIso()
      );

      return this.json({
        ok: true,
        token,
        user: { username: row.username, role: row.role },
      });
    }

    // 🚪 Logout
    if (path === "/api/logout" && request.method === "POST") {
      const t = this.getAuthToken(request);
      if (t) this.sql.exec("DELETE FROM sessions WHERE token = ?", t);
      return this.json({ ok: true });
    }

    // 👥 Users list (ADMIN فقط)
    if (path === "/api/users" && request.method === "GET") {
      const auth = this.requireAuth(request);
      if (!auth) return this.json({ ok: false, error: "UNAUTHORIZED" }, 401);
      if (auth.role !== "admin") return this.json({ ok: false, error: "FORBIDDEN" }, 403);

      const rows = this.sql
        .exec("SELECT username, role, created_at FROM users ORDER BY created_at DESC")
        .toArray();

      return this.json({ ok: true, users: rows });
    }

    // ➕ Add user (ADMIN فقط)
    if (path === "/api/users" && request.method === "POST") {
      const auth = this.requireAuth(request);
      if (!auth) return this.json({ ok: false, error: "UNAUTHORIZED" }, 401);
      if (auth.role !== "admin") return this.json({ ok: false, error: "FORBIDDEN" }, 403);

      let body;
      try { body = await request.json(); } catch { body = {}; }

      const username = (body.username || "").trim();
      const password = (body.password || "");
      const role = (body.role || "").trim(); // admin / staff

      if (!username || !password || !role) {
        return this.json({ ok: false, error: "MISSING_FIELDS" }, 400);
      }
      if (role !== "admin" && role !== "staff") {
        return this.json({ ok: false, error: "INVALID_ROLE" }, 400);
      }

      const exists = this.sql.exec("SELECT 1 FROM users WHERE username = ?", username).toArray();
      if (exists.length) return this.json({ ok: false, error: "USER_EXISTS" }, 409);

      const hash = await sha256(password);
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        username,
        hash,
        role,
        nowIso()
      );

      return this.json({ ok: true });
    }

    // ❌ Not found
    return this.json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}