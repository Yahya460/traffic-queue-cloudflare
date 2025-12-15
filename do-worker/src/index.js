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

    // فحص
    if (path === "/api/health") {
      return Response.json({ ok: true });
    }

    // تسجيل الدخول
    if (path === "/api/login" && request.method === "POST") {
      const { username, password } = await request.json();

      const row = this.sql
        .exec(
          "SELECT username, passhash, role FROM users WHERE username = ?",
          username
        )
        .toArray()[0];

      if (!row) {
        return Response.json({ ok: false }, { status: 401 });
      }

      const hash = await sha256(password);
      if (hash !== row.passhash) {
        return Response.json({ ok: false }, { status: 401 });
      }

      return Response.json({
        ok: true,
        username: row.username,
        role: row.role
      });
    }

    // ✅ API الصورة (المشكلة كانت هنا)
    if (path === "/api/center-image" && request.method === "POST") {
      const { image } = await request.json();

      await this.ctx.storage.put("centerImage", {
        image,
        at: nowIso()
      });

      return Response.json({ ok: true });
    }

    if (path === "/api/state") {
      const centerImage = await this.ctx.storage.get("centerImage");
      return Response.json({
        ok: true,
        centerImage
      });
    }

    return Response.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
}
