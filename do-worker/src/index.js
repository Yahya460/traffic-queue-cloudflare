import { sha256 } from "./utils.js";

/**
 * Durable Object: QueueDO
 * الاسم في Cloudflare:
 * traffic-queue-do-v3_QueueDO
 */

function nowIso() {
  return new Date().toISOString();
}

export class QueueDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
  }

  // إنشاء الجداول
  async ensureTables() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        passhash TEXT,
        role TEXT,
        created_at TEXT
      );
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS state (
        k TEXT PRIMARY KEY,
        v TEXT
      );
    `);
  }

  // إنشاء المدير الافتراضي
  async ensureAdmin() {
    const exists = this.sql
      .exec("SELECT 1 FROM users WHERE username = ?", "يوسف")
      .toArray();

    if (exists.length) return;

    const hash = await sha256("2626");
    this.sql.exec(
      "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
      "يوسف",
      hash,
      "admin",
      nowIso()
    );
  }

  async fetch(request) {
    await this.ensureTables();
    await this.ensureAdmin();

    const url = new URL(request.url);
    const path = url.pathname;

    // ================= HEALTH =================
    if (path === "/api/health") {
      return Response.json({ ok: true });
    }

    // ================= LOGIN =================
    if (path === "/api/login" && request.method === "POST") {
      const { username, password } = await request.json();

      const row = this.sql
        .exec(
          "SELECT username, passhash, role FROM users WHERE username = ?",
          username
        )
        .toArray()[0];

      if (!row) {
        return Response.json({ ok: false, error: "INVALID_LOGIN" }, { status: 401 });
      }

      const hash = await sha256(password);
      if (hash !== row.passhash) {
        return Response.json({ ok: false, error: "INVALID_LOGIN" }, { status: 401 });
      }

      return Response.json({
        ok: true,
        username: row.username,
        role: row.role
      });
    }

    // ================= STATE =================
    if (path === "/api/state") {
      const rows = this.sql.exec("SELECT k, v FROM state").toArray();
      const data = {};
      for (const r of rows) {
        try {
          data[r.k] = JSON.parse(r.v);
        } catch {
          data[r.k] = r.v;
        }
      }
      return Response.json({ ok: true, data });
    }

    // ================= CENTER IMAGE =================
    if (path === "/api/center-image" && request.method === "POST") {
      const { image } = await request.json();
      this.sql.exec(
        "INSERT OR REPLACE INTO state (k, v) VALUES (?, ?)",
        "centerImage",
        JSON.stringify(image)
      );
      return Response.json({ ok: true });
    }

    if (path === "/api/center-image") {
      const row = this.sql
        .exec("SELECT v FROM state WHERE k = ?", "centerImage")
        .toArray()[0];

      return Response.json({
        ok: true,
        image: row ? JSON.parse(row.v) : null
      });
    }

    // ================= USERS (ADMIN) =================
    if (path === "/api/users" && request.method === "POST") {
      const { username, password, role } = await request.json();

      if (!username || !password || !role) {
        return Response.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
      }

      const exists = this.sql
        .exec("SELECT 1 FROM users WHERE username = ?", username)
        .toArray();

      if (exists.length) {
        return Response.json({ ok: false, error: "USER_EXISTS" }, { status: 409 });
      }

      const hash = await sha256(password);
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        username,
        hash,
        role,
        nowIso()
      );

      return Response.json({ ok: true });
    }

    // ================= DEFAULT =================
    return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
}
