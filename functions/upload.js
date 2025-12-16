export async function onRequestPost(context) {
  try {
    const formData = await context.request.formData();
    const file = formData.get("file");

    if (!file) {
      return new Response(JSON.stringify({ ok: false, error: "لم يتم إرسال أي ملف" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // قراءة محتوى الصورة كـ Base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // إرسالها إلى Durable Object أو حفظها مؤقتًا (لاحقًا سنفعّل التخزين)
    return new Response(JSON.stringify({
      ok: true,
      message: "تم رفع الصورة بنجاح",
      preview: data:${file.type};base64,${base64}
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
