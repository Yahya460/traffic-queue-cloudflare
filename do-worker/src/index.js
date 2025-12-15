// ================================
// Cloudflare Worker + Durable Object
// Queue System API (Clean & Ready)
// Admin: يوسف / 2626
// Staff: خالد / 1234
// ================================

function nowIso() {
  return new Date().toISOString();
}

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function randToken() {
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

  // ========= DB Init =========
  async ensureSchema() {
    // users table
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        username   TEXT PRIMARY KEY,
        passhash   TEXT NOT NULL,
        role       TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // insert default admin if not exists
    const adminName = "يوسف";
    const adminExists = this.sql.exec("SELECT 1 FROM users WHERE username = ?", adminName).toArray();
    if (!adminExists.length) {
      const h = await sha256Hex("2626");
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        adminName, h, "admin", nowIso()
      );
    }

    // insert default staff if not exists
    const staffName = "خالد";
    const staffExists = this.sql.exec("SELECT 1 FROM users WHERE username = ?", staffName).toArray();
    if (!staffExists.length) {
      const h = await sha256Hex("1234");
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        staffName, h, "staff", nowIso()
      );
    }

    // default state if not exists
    const st = await this.ctx.storage.get("state");
    if (!st) {
      await this.ctx.storage.put("state", {
        current: null,        // {number, gender, by, at}
        history: [],          // latest first
        men: [],              // called men latest first
        women: [],            // called women latest first
        ticker: "",           // optional
        displayMessage: "",   // optional
        centerImage: null     // dataURL base64
      });
    }
  }

  // ========= Auth Helpers =========
  async readSession(request) {
    const auth = request.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return null;
    const token = m[1].trim();
    if (!token) return null;
    const sess = await this.ctx.storage.get("sess:" + token);
    if (!sess) return null;
    // optional expire
    if (sess.exp && Date.now() > sess.exp) {
      await this.ctx.storage.delete("sess:" + token);
      return null;
    }
    return { token, ...sess }; // {username, role, exp}
  }

  mustRole(sess, role) {
    if (!sess) return false;
    if (role === "admin") return sess.role === "admin";
    if (role === "staff") return sess.role === "staff" || sess.role === "admin";
    return false;
  }

  // ========= State Helpers =========
  async getState() {
    return (await this.ctx.storage.get("state")) || {
      current: null, history: [], men: [], women: [],
      ticker: "", displayMessage: "", centerImage: null
    };
  }

  async putState(st) {
    await this.ctx.storage.put("state", st);
  }

  // ========= Routes =========
  async fetch(request) {
    await this.ensureSchema();

    const url = new URL(request.url);
    const path = url.pathname;

    // Health
    if (path === "/api/health") {
      return json({ ok: true });
    }

    // Login
    if (path === "/api/login" && request.method === "POST") {
      const body = await request.json().catch(() => null);
      const username = body?.username?.trim();
      const password = body?.password ?? "";
      if (!username || !password) return json({ ok: false, error: "MISSING_FIELDS" }, 400);

      const row = this.sql.exec(
        "SELECT username, passhash, role FROM users WHERE username = ?",
        username
      ).toArray()[0];

      if (!row) return json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const h = await sha256Hex(String(password));
      if (h !== row.passhash) return json({ ok: false, error: "INVALID_LOGIN" }, 401);

      const token = randToken();
      // 7 days
      const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await this.ctx.storage.put("sess:" + token, { username: row.username, role: row.role, exp });

      return json({
        ok: true,
        token,
        username: row.username,
        role: row.role
      });
    }

    // Logout
    if (path === "/api/logout" && request.method === "POST") {
      const sess = await this.readSession(request);
      if (sess?.token) await this.ctx.storage.delete("sess:" + sess.token);
      return json({ ok: true });
    }

    // Auth for rest
    const sess = await this.readSession(request);

    // State (public for display)
    if (path === "/api/state" && request.method === "GET") {
      const st = await this.getState();
      return json({ ok: true, state: st });
    }

    // Next (staff/admin)
    if (path === "/api/next" && request.method === "POST") {
      if (!this.mustRole(sess, "staff")) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

      const body = await request.json().catch(() => ({}));
      const number = String(body.number ?? "").trim();
      const gender = String(body.gender ?? "").trim(); // "male" or "female"
      if (!number || !gender) return json({ ok: false, error: "MISSING_FIELDS" }, 400);

      const st = await this.getState();
      const item = { number, gender, by: sess.username, at: nowIso() };

      st.current = item;
      st.history = [item, ...(st.history || [])].slice(0, 200);

      if (gender === "female") st.women = [item, ...(st.women || [])].slice(0, 50);
      else st.men = [item, ...(st.men || [])].slice(0, 50);

      await this.putState(st);
      return json({ ok: true, current: item });
    }

    // Prev (staff/admin) - يرجع آخر واحد قبل الحالي من history
    if (path === "/api/prev" && request.method === "POST") {
      if (!this.mustRole(sess, "staff")) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

      const st = await this.getState();
      const h = st.history || [];
      if (h.length < 2) return json({ ok: true, current: st.current }); // nothing

      // current is h[0], prev is h[1]
      st.current = h[1];
      await this.putState(st);
      return json({ ok: true, current: st.current });
    }

    // Reset Queue (admin only)
    if (path === "/api/queue/reset" && request.method === "POST") {
      if (!this.mustRole(sess, "admin")) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

      const st = await this.getState();
      st.current = null;
      st.history = [];
      st.men = [];
      st.women = [];
      await this.putState(st);
      return json({ ok: true });
    }

    // Center Image (admin only)
    if (path === "/api/center-image" && request.method === "POST") {
      if (!this.mustRole(sess, "admin")) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

      const body = await request.json().catch(() => null);
      const image = body?.image;
      if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
        return json({ ok: false, error: "INVALID_IMAGE" }, 400);
      }

      const st = await this.getState();
      st.centerImage = image;
      await this.putState(st);
      return json({ ok: true });
    }

    if (path === "/api/center-image" && request.method === "DELETE") {
      if (!this.mustRole(sess, "admin")) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
      const st = await this.getState();
      st.centerImage = null;
      await this.putState(st);
      return json({ ok: true });
    }

    // Users list (admin only)
    if (path === "/api/users" && request.method === "GET") {
      if (!this.mustRole(sess, "admin")) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
      const rows = this.sql.exec("SELECT username, role, created_at FROM users ORDER BY created_at DESC").toArray();
      return json({ ok: true, users: rows });
    }

    // Users add (admin only)
    if (path === "/api/users" && request.method === "POST") {
      if (!this.mustRole(sess, "admin")) return json({ ok: false, error: "UNAUTHORIZED" }, 401);

      const body = await request.json().catch(() => null);
      const username = body?.username?.trim();
      const password = body?.password ?? "";
      const role = body?.role?.trim();

      if (!username || !password || !role) return json({ ok: false, error: "MISSING_FIELDS" }, 400);
      if (!["admin", "staff"].includes(role)) return json({ ok: false, error: "INVALID_ROLE" }, 400);

      const exists = this.sql.exec("SELECT 1 FROM users WHERE username = ?", username).toArray();
      if (exists.length) return json({ ok: false, error: "USER_EXISTS" }, 409);

      const h = await sha256Hex(String(password));
      this.sql.exec(
        "INSERT INTO users (username, passhash, role, created_at) VALUES (?,?,?,?)",
        username, h, role, nowIso()
      );

      return json({ ok: true });
    }

    // Not Found
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

// Worker entry: route everything to the same Durable Object instance
export default {
  async fetch(request, env) {
    // use a fixed id so all pages share the same state
    const id = env["traffic-queue-do-v3_QueueDO"].idFromName("main");
    const stub = env.QUEUE_DO.get(id);
    return stub.fetch(request);
  }
};
