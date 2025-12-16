export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const formData = await context.request.formData();
  const file = formData.get("file");

  if (!file) {
    return new Response(JSON.stringify({ ok: false, error: "NO_FILE" }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = btoa(
    String.fromCharCode(...new Uint8Array(arrayBuffer))
  );

  // تخزين الصورة في Durable Object
  const stub = context.env.QUEUE.getByName("main");
  await stub.fetch("https://queue/upload-image", {
    method: "POST",
    body: JSON.stringify({
      image: data:${file.type};base64,${base64}
    })
  });

  return new Response(JSON.stringify({
    ok: true
  }), {
    headers: { "Content-Type": "application/json" }
  });
}
