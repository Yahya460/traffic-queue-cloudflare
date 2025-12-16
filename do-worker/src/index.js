export class QueueDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // حفظ صورة مرفوعة
    if (url.pathname === "/upload-image" && request.method === "POST") {
      const data = await request.json();

      if (!data.image) {
        return new Response(JSON.stringify({
          ok: false,
          error: "NO_IMAGE"
        }), { headers: { "Content-Type": "application/json" } });
      }

      await this.state.storage.put("lastImage", data.image);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // جلب آخر صورة
    if (url.pathname === "/last-image") {
      const image = await this.state.storage.get("lastImage") || null;

      return new Response(JSON.stringify({ image }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // فحص
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      ok: false,
      error: "NOT_FOUND"
    }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
}
