export async function onRequest(context) {
  const { request, env } = context;

  const inUrl = new URL(request.url);

  // remove "/api" prefix so DO receives "/login" "/health" "/last-image" "/upload"
  let p = inUrl.pathname;
  if (p.startsWith("/api")) p = p.slice(4);
  if (!p) p = "/";

  const outUrl = new URL(request.url);
  outUrl.pathname = p;

  // Durable Object stub
  const id = env.QUEUE.idFromName("main");
  const stub = env.QUEUE.get(id);

  return stub.fetch(
    new Request(outUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "manual",
    })
  );
}
