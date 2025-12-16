export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // استخراج المسار بعد /api/
  const path = url.pathname.replace("/api/", "");

  // health check
  if (path === "health") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // login route (مؤقت – للتأكد أن النظام يعمل)
  if (path === "login" && request.method === "POST") {
    return new Response(
      JSON.stringify({ ok: true, user: "يوسف" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // باقي الطلبات تذهب للـ Durable Object
  const stub = env.QUEUE.getByName("main");
  return stub.fetch(request);
}
