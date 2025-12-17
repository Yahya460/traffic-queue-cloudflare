export class QueueDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ✅ Health
    if (path === "/api/health") {
      return json({ ok: true, status: "alive" });
    }

    // ✅ Login (يوسف / 2626)
    if (path === "/api/login" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}
      const username = (body.username || "").trim();
      const password = (body.password || "").trim();

      if (username === "يوسف" && password === "2626") {
        return json({ ok: true, role: "admin", name: "يوسف" });
      }
      return json({ ok: false, error: "INVALID_CREDENTIALS" }, 401);
    }

    // ✅ Upload image
    if (path === "/api/upload" && request.method === "POST") {
      try {
        const form = await request.formData();
        const file = form.get("file");

        if (!file || typeof file === "string") {
          return json({ ok: false, error: "NO_FILE" }, 400);
        }

        const mime = file.type || "image/jpeg";
        const buf = new Uint8Array(await file.arrayBuffer());
        const b64 = uint8ToBase64(buf);

        await this.state.storage.put("lastImage", {
          mime,
          b64,
          ts: Date.now(),
          name: file.name || "upload",
        });

        const preview = data:${mime};base64,${b64};
        return json({ ok: true, preview });
      } catch (e) {
        return json({ ok: false, error: "UPLOAD_FAILED", message: String(e) }, 500);
      }
    }

    // ✅ Last uploaded image
    if (path === "/api/last-image") {
      const img = await this.state.storage.get("lastImage");
      if (!img) return json({ ok: true, image: null });

      return json({
        ok: true,
        image: {
          mime: img.mime,
          ts: img.ts,
          name: img.name,
          preview: data:${img.mime};base64,${img.b64},
        },
      });
    }

    // ❌ Anything else
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

/**
 * Default Worker export (Durable Object binding name must be QUEUE)
 * Pages Functions will call the DO stub using /api/*
 */
export default {
  async fetch(request, env) {
    // ثابت: نفس اسمك اللي تستخدمه في Pages Function
    const id = env.QUEUE.idFromName("main");
    const stub = env.QUEUE.get(id);
    return stub.fetch(request);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function uint8ToBase64(u8) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(s);
}
