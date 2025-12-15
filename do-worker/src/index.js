import { sha256 } from "./utils.js";

function nowIso() {
  return new Date().toISOString();
}

export class QueueDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
  }

  // 🔒 إنشاء المدير الافتراضي (مرة واحدة فقط)
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
    await this.ensureAdmin();

    const url = new URL(request.url);
    const path = url.pathname;

    // 🩺 فحص
    if (path === "/api/health") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 🔐 تسجيل الدخول
    if (path === "/api/login" && request.method === "POST") {
      const body = await request.json();
      const { username, password } = body;

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
        user: { username: row.username, role: row.role }
      });
    }

    // 👥 إضافة موظف (مدير فقط)
    if (path === "/api/users" && request.method === "POST") {
      const body = await request.json();
      const { username, password, role } = body;

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
return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
}