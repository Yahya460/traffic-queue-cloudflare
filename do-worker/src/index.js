export class QueueDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // ===============================
    // HEALTH
    // ===============================
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // ===============================
    // LOGIN
    // ===============================
    if (url.pathname === "/login" && request.method === "POST") {
      const body = await request.json();

      if (body.username === "يوسف" && body.password === "2626") {
        return new Response(JSON.stringify({
          ok: true,
          role: "admin",
          name: "يوسف"
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        ok: false,
        error: "INVALID_LOGIN"
      }), { status: 401 });
    }

    // ===============================
    // UPLOAD IMAGE
    // ===============================
    if (url.pathname === "/upload" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file) {
        return new Response(JSON.stringify({
          ok: false,
          error: "NO_FILE"
        }), { status: 400 });
      }

      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(buffer))
      );

      const image = data:${file.type};base64,${base64};

      await this.state.storage.put("lastImage", image);

      return new Response(JSON.stringify({
        ok: true
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // ===============================
    // ✅ LAST IMAGE (هذا كان ناقص)
    // ===============================
    if (url.pathname === "/last-image") {
      const image = await this.state.storage.get("lastImage");

      return new Response(JSON.stringify({
        ok: true,
        image: image || null
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // ===============================
    // NOT FOUND
    // ===============================
    return new Response(JSON.stringify({
      ok: false,
      error: "NOT_FOUND"
    }), { status: 404 });
  }
}
