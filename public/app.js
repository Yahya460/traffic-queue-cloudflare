// public/admin/app.js

const App = {
  getToken() {
    return localStorage.getItem("token") || "";
  },
  getRole() {
    return localStorage.getItem("role") || "";
  },
  getName() {
    return localStorage.getItem("name") || "";
  },
  async api(path, opts = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set("content-type", headers.get("content-type") || "application/json");

    const token = this.getToken();
    if (token) headers.set("authorization", Bearer ${token});

    const res = await fetch(path, { ...opts, headers });

    // لو السيرفر يرجّع HTML/نص، نخليه واضح بدل ما يكسر
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : { ok: false, error: await res.text() };
    if (!res.ok) throw data;
    return data;
  }
};

// حماية صفحة المدير
(function guardAdmin() {
  const role = App.getRole();
  const name = App.getName();

  // تحديث عنوان المستخدم أعلى الصفحة إذا عندك عنصر له id=userInfo
  const userInfo = document.getElementById("userInfo");
  if (userInfo) userInfo.textContent = ${name || "—"} | ${role || "—"};

  if (role !== "admin") {
    document.body.innerHTML = `
      <div style="font-family:system-ui;direction:rtl;padding:20px">
        <h2>❌ لا توجد صلاحية مدير</h2>
        <p>حسابك الحالي ليس Admin. رجّع تسجيل الدخول بحساب مدير.</p>
        <button onclick="location.href='/login/'">الرجوع لتسجيل الدخول</button>
      </div>
    `;
  }
})();

// مثال: زر "تأكد من API" الموجود عندك
window.checkApi = async function () {
  const st = document.getElementById("apiStatus");
  try {
    st.textContent = "جارٍ الفحص...";
    const r = await App.api("/api/health", { method: "GET" });
    st.textContent = r.ok ? "جاهز ✅" : "غير جاهز ❌";
  } catch (e) {
    st.textContent = "خطأ ❌";
    console.log("API ERROR:", e);
  }
};
