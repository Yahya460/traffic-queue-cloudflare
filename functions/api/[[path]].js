export async function onRequest(context) {
  const { request, env } = context;

  // مرّر الطلب كما هو (بدون إعادة بناء Request)
  const stub = env.QUEUE.getByName("main");
  return stub.fetch(request);
}
