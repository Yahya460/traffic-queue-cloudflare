import { DurableObject } from "cloudflare:workers";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function text(data, status = 200, extraHeaders = {}) {
  return new Response(data, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
  };
}

async function safeJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function randomToken(len = 40) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureTables(sql) {
  await sql.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  await sql.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

async function ensureAdmin(sql) {
  // أنشئ حساب admin الافتراضي إذا ما موجود
  const exists = await sql.exec(`SELECT 1 FROM users WHERE username = 'admin' LIMIT 1;`).toArray();
  if (!exists.length) {
    const hash = await sha256("admin1234");
    await sql.exec(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
      ["admin", hash, "admin"]
    );
    console.log("Default admin created");
  }
}

async function authFromToken(sql, request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "NO_TOKEN" };

  const row = await sql
    .exec(
      `
    SELECT u.id, u.username, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
    LIMIT 1;
  `,
      [token]
    )
    .toArray();

  if (!row.length) return { ok: false, status: 401, error: "INVALID_TOKEN" };
  return { ok: true, user: row[0] };
}

async function requireRole(sql, request, roles = []) {
  const a = await authFromToken(sql, request);
  if (!a.ok) return { ok: false, res: json({ ok: false, error: a.error }, a.status, corsHeaders()) };
  if (roles.length && !roles.includes(a.user.role))
    return { ok: false, res: json({ ok: false, error: "FORBIDDEN" }, 403, corsHeaders()) };
  return { ok: true, user: a.user };
}

export class QueueDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;

    this.sql = ctx.storage.sql;

    // حالة النظام
    this.state = {
      current: null,
      historyMale: [],
      historyFemale: [],
      historyMax: 15,

      // رسالة المدير في العمود الأوسط (مؤقتة)
      centerMessage: "",
      centerMessageAt: null,

      // شريط الملاحظة الأصفر (مستقل)
      noteText: "",
      noteAt: null,

      // رسائل الموظفين للمدير
      lastStaffMessage: null,
    };
  }

  async init() {
    await ensureTables(this.sql);
    await ensureAdmin(this.sql);

    // تحميل الحالة من التخزين
    const saved = await this.ctx.storage.get("app_state");
    if (saved) {
      this.state = { ...this.state, ...saved };
    }
  }

  async persist() {
    await this.ctx.storage.put("app_state", this.state);
  }

  async fetch(request) {
    await this.init();

    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // health
    if (path === "/api/health") {
      return json({ ok: true, ts: new Date().toISOString() }, 200, corsHeaders());
    }

    // -------------------------
    // AUTH
    // -------------------------
    if (path === "/api/login" && request.method === "POST") {
      const body = await safeJson(request);
      const username = (body?.username || "").trim();
      const password = (body?.password || "").toString();

      if (!username || !password)
        return json({ ok: false, error: "INVALID_CREDENTIALS" }, 400, corsHeaders());

      const rows = await this.sql
        .exec(`SELECT id, username, role, password_hash FROM users WHERE username = ? LIMIT 1;`, [
          username,
        ])
        .toArray();
      if (!rows.length) return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401, corsHeaders());

      const user = rows[0];
      const hash = await sha256(password);
      if (hash !== user.password_hash)
        return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401, corsHeaders());

      const token = randomToken(32);
      await this.sql.exec(`INSERT INTO sessions (token, user_id) VALUES (?, ?)`, [token, user.id]);

      return json(
        { ok: true, token, user: { id: user.id, username: user.username, role: user.role } },
        200,
        corsHeaders()
      );
    }

    if (path === "/api/logout" && request.method === "POST") {
      const auth = request.headers.get("authorization") || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
      if (token) {
        await this.sql.exec(`DELETE FROM sessions WHERE token = ?`, [token]);
      }
      return json({ ok: true }, 200, corsHeaders());
    }

    if (path === "/api/me" && request.method === "GET") {
      const a = await authFromToken(this.sql, request);
      if (!a.ok) return json({ ok: false, error: a.error }, a.status, corsHeaders());
      return json({ ok: true, user: a.user }, 200, corsHeaders());
    }

    // -------------------------
    // USERS MANAGEMENT (Admin فقط)
    // -------------------------
    if (path === "/api/users" && request.method === "GET") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const rows = await this.sql.exec(`SELECT id, username, role, created_at FROM users ORDER BY id DESC;`).toArray();
      return json({ ok: true, users: rows }, 200, corsHeaders());
    }

    // إضافة مستخدم (staff/admin)
    if (path === "/api/users" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const body = await safeJson(request);
      const username = (body?.username || "").trim();
      const password = (body?.password || "").toString();
      const role = (body?.role || "staff").toString();

      if (!username || username.length < 2) return json({ ok: false, error: "INVALID_USERNAME" }, 400, corsHeaders());
      if (!password || password.length < 4) return json({ ok: false, error: "INVALID_PASSWORD" }, 400, corsHeaders());
      if (!["staff", "admin"].includes(role)) return json({ ok: false, error: "INVALID_ROLE" }, 400, corsHeaders());

      const exists = await this.sql.exec(`SELECT 1 FROM users WHERE username = ? LIMIT 1;`, [username]).toArray();
      if (exists.length) return json({ ok: false, error: "USER_EXISTS" }, 409, corsHeaders());

      const passwordHash = await sha256(password);
      await this.sql.exec(
        `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
        [username, passwordHash, role]
      );

      return json({ ok: true }, 200, corsHeaders());
    }

    // حذف مستخدم (ما يحذف admin نفسه)
    if (path.startsWith("/api/users/") && request.method === "DELETE") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const idStr = path.split("/").pop();
      const id = Number(idStr);

      if (!Number.isFinite(id)) return json({ ok: false, error: "INVALID_ID" }, 400, corsHeaders());

      const rows = await this.sql.exec(`SELECT id, username, role FROM users WHERE id = ? LIMIT 1;`, [id]).toArray();
      if (!rows.length) return json({ ok: false, error: "NOT_FOUND" }, 404, corsHeaders());

      const user = rows[0];
      if (user.username === "admin") return json({ ok: false, error: "CANNOT_DELETE_ADMIN" }, 400, corsHeaders());

      await this.sql.exec(`DELETE FROM sessions WHERE user_id = ?`, [id]);
      await this.sql.exec(`DELETE FROM users WHERE id = ?`, [id]);

      return json({ ok: true }, 200, corsHeaders());
    }

    // -------------------------
    // QUEUE / DISPLAY STATE
    // -------------------------
    if (path === "/api/state" && request.method === "GET") {
      // تُستخدم في شاشة العرض/الموظف/المدير بدون اشتراط (حسب تصميمكم)
      return json({ ok: true, state: this.state }, 200, corsHeaders());
    }

    // نداء تلميذ جديد (من الموظف)
    if (path === "/api/call" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["staff", "admin"]);
      if (!auth.ok) return auth.res;

      const body = await safeJson(request);
      const number = (body?.number || "").toString().trim();
      const gender = (body?.gender || "men").toString(); // men / women

      if (!number) return json({ ok: false, error: "INVALID_NUMBER" }, 400, corsHeaders());
      if (!["men", "women"].includes(gender)) return json({ ok: false, error: "INVALID_GENDER" }, 400, corsHeaders());

      // حفظ السابق في التاريخ
      if (this.state.current?.number) {
        const prev = this.state.current;
        if (prev.gender === "men") {
          this.state.historyMale.unshift(prev.number);
          this.state.historyMale = this.state.historyMale.slice(0, this.state.historyMax);
        } else {
          this.state.historyFemale.unshift(prev.number);
          this.state.historyFemale = this.state.historyFemale.slice(0, this.state.historyMax);
        }
      }

      this.state.current = {
        number,
        gender,
        by: auth.user.username,
        at: new Date().toISOString(),
      };

      await this.persist();
      return json({ ok: true, state: this.state }, 200, corsHeaders());
    }

    // رجوع للتلميذ السابق (من الموظف)
    if (path === "/api/prev" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["staff", "admin"]);
      if (!auth.ok) return auth.res;

      const body = await safeJson(request);
      const gender = (body?.gender || "").toString(); // optional
      let g = gender;

      if (!g) {
        // لو ما انرسل، خذ جنس الحالي
        g = this.state.current?.gender || "men";
      }

      if (g === "men") {
        const n = this.state.historyMale.shift();
        if (n) this.state.current = { number: n, gender: "men", by: auth.user.username, at: new Date().toISOString() };
      } else {
        const n = this.state.historyFemale.shift();
        if (n) this.state.current = { number: n, gender: "women", by: auth.user.username, at: new Date().toISOString() };
      }

      await this.persist();
      return json({ ok: true, state: this.state }, 200, corsHeaders());
    }

    // تصفير الدور (Admin)
    if (path === "/api/reset" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      this.state.current = null;
      this.state.historyMale = [];
      this.state.historyFemale = [];
      await this.persist();

      return json({ ok: true, state: this.state }, 200, corsHeaders());
    }

    // -------------------------
    // رسالة المدير (العمود الأوسط) - لا تُحدث تلقائياً إلا بزر إرسال
    // -------------------------
    if (path === "/api/center-message" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const body = await safeJson(request);
      const message = (body?.message || "").toString().trim();

      this.state.centerMessage = message;
      this.state.centerMessageAt = message ? new Date().toISOString() : null;

      await this.persist();
      return json({ ok: true }, 200, corsHeaders());
    }

    if (path === "/api/center-message" && request.method === "DELETE") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      this.state.centerMessage = "";
      this.state.centerMessageAt = null;

      await this.persist();
      return json({ ok: true }, 200, corsHeaders());
    }

    // -------------------------
    // شريط الملاحظة الأصفر (مستقل) - مدير يكتب ويرسل
    // -------------------------
    if (path === "/api/note" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      const body = await safeJson(request);
      const note = (body?.note || "").toString().trim();

      this.state.noteText = note;
      this.state.noteAt = note ? new Date().toISOString() : null;

      await this.persist();
      return json({ ok: true }, 200, corsHeaders());
    }

    if (path === "/api/note" && request.method === "DELETE") {
      const auth = await requireRole(this.sql, request, ["admin"]);
      if (!auth.ok) return auth.res;

      this.state.noteText = "";
      this.state.noteAt = null;

      await this.persist();
      return json({ ok: true }, 200, corsHeaders());
    }

    // -------------------------
    // رسالة الموظف للمدير
    // -------------------------
    if (path === "/api/staff-message" && request.method === "POST") {
      const auth = await requireRole(this.sql, request, ["staff", "admin"]);
      if (!auth.ok) return auth.res;

      const body = await safeJson(request);
      const message = (body?.message || "").toString().trim();

      this.state.lastStaffMessage = {
        by: auth.user.username,
        message,
        at: new Date().toISOString(),
      };

      await this.persist();
      return json({ ok: true }, 200, corsHeaders());
    }

    // fallback
    return json({ ok: false, error: "NOT_FOUND", path }, 404, corsHeaders());
  }
}

export default {
  async fetch(request, env, ctx) {
    // Router بسيط:
    // كل API تتوجه لنفس Durable Object instance
    const url = new URL(request.url);
    const name = env.QUEUE_DO.idFromName("main");
    const stub = env.QUEUE_DO.get(name);

    // اعمل proxy للـ DO
    return await stub.fetch(request);
  },
};
