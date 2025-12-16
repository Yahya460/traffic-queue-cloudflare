export async function onRequestGet() {
  return new Response(
    JSON.stringify({ ok: true, status: "alive" }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
