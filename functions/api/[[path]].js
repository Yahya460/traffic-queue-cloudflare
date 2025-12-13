export async function onRequest(context) {
  // Durable Object binding (added in Cloudflare Pages settings)
  const stub = context.env.QUEUE.getByName("main");

  const req = context.request;
  // Forward the request as-is to the Durable Object
  return stub.fetch(new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    redirect: "manual",
  }));
}
