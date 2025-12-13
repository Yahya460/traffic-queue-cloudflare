# نظام الدور الآلي (مجاني + دائم) — Cloudflare Pages + Durable Object (SQLite)

هذا مجلد جاهز بدل Render Free:
- ما فيه نوم 15 دقيقة.
- ما فيه ضياع users.json.
- التخزين دائم داخل Durable Object (SQLite).

## ماذا يحتوي؟
- `public/` صفحات جاهزة: login / staff / admin / display
- `functions/api/[[path]].js` تمرير كل `/api/*` إلى Durable Object
- `do-worker/` Worker فيه Durable Object + SQLite

---

## 1) نشر Durable Object (مرة واحدة)
افتح Terminal داخل `do-worker`:

```bash
npm i -g wrangler
wrangler login
wrangler deploy
```

---

## 2) نشر الواجهة على Cloudflare Pages
1) ارفع هذا المجلد كامل إلى GitHub
2) Cloudflare Dashboard → Workers & Pages → Pages → Create project → اربط GitHub
3) Build settings:
   - Framework: None
   - Build command: (فارغ)
   - Output directory: `public`

---

## 3) ربط Durable Object داخل Pages (Binding)
داخل مشروع Pages:
- Settings → Bindings → Add binding → Durable Object
- Variable name: `QUEUE`
- Class: `QueueDO`
- Script: اختر `traffic-queue-do` (اللي نشرته في الخطوة 1)

ثم Redeploy.

---

## بيانات الدخول
أول مرة:
- admin / admin1234

بعد الدخول:
- افتح `admin.html` وغيّر كلمة مرور admin فورًا.

---

جميع الحقوق محفوظة للرقيب أول يحيى آل عبدالسلام
