export class QueueDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // health check
    if (path === "/api/health") {
      return json({ ok: true, status: "alive" });
    }

    // login
    if (path === "/api/login" && request.method === "POST") {
      const body = await request.json();

      if (
        body.username === "يوسف" &&
        body.password === "2626"
      ) {
        return json({
          ok: true,
          role: "admin",
          name: "يوسف"
        });
      }

      return json({ ok: false, error: "INVALID_LOGIN" }, 401);
    }

    // upload image
    if (path === "/api/upload" && request.method === "POST") {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file) {
        return json({ ok: false, error: "NO_FILE" }, 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      await this.state.storage.put("lastImage", {
        type: file.type,
        data: base64,
        time: Date.now()
      });

      return json({ ok: true });
    }

    // get last image
    if (path === "/api/last-image") {
      const img = await this.state.storage.get("lastImage");

      if (!img) {
        return json({ ok: true, image: null });
      }

      return json({ ok: true, image: img });
    }

    // fallback
    return json({ ok: false, error: "NOT_FOUND" }, 404);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
