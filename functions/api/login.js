export async function onRequestPost() {
  return new Response(
    JSON.stringify({
      ok: true,
      role: "admin",
      name: "يوسف"
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
