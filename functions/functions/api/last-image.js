export async function onRequest(context) {
  const stub = context.env.QUEUE.getByName("main");

  const res = await stub.fetch("https://queue/last-image");

  return new Response(await res.text(), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
