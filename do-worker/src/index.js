async fetch(request) {
  const url = new URL(request.url);

  if (url.pathname === "/upload-image" && request.method === "POST") {
    const data = await request.json();
    await this.state.storage.put("lastImage", data.image);
    return new Response(JSON.stringify({ ok: true }));
  }

  if (url.pathname === "/last-image") {
    const image = await this.state.storage.get("lastImage");
    return new Response(JSON.stringify({ image }));
  }

  return new Response("NOT_FOUND", { status: 404 });
}
