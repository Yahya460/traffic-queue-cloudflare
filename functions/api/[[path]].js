export async function onRequest(context) {
  const stub = context.env.QUEUE.getByName("main");
  const req = context.request;
  return stub.fetch(new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    redirect: "manual",
  }));
}
