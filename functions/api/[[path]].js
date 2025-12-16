export async function onRequest(context) {
  const { request, env } = context;
  const stub = env.QUEUE.getByName("main");
  return stub.fetch(request);
}
