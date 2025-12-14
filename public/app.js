/* traffic-queue-cloudflare - app.js (FIXED)
   هدف الملف: توفير كائن App عالمي (window.App) تستخدمه صفحات (تسجيل الدخول/المدير/الفاحص/الموظف/العرض)
   ملاحظة: هذا الملف يجب أن يكون JavaScript صالح 100% بدون نصوص عربية "خارج التعليقات".
*/
(() => {
  "use strict";

  const LS_TOKEN = "tq_token";
  const LS_USER  = "tq_user"; // JSON string { username, role }

  function safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  async function fetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
    const txt = await res.text();
    const data = safeJsonParse(txt);
    const out = (data && typeof data === "object") ? data : { ok: false, raw: txt };
    if (!res.ok) {
      out.ok = false;
      out.status = res.status;
      out.statusText = res.statusText;
    }
    return out;
  }

  function getToken() {
    return localStorage.getItem(LS_TOKEN) || "";
  }
  function setToken(token) {
    if (token) localStorage.setItem(LS_TOKEN, token);
    else localStorage.removeItem(LS_TOKEN);
  }

  function getUser() {
    const raw = localStorage.getItem(LS_USER);
    return raw ? safeJsonParse(raw) : null;
  }
  function setUser(user) {
    if (user) localStorage.setItem(LS_USER, JSON.stringify(user));
    else localStorage.removeItem(LS_USER);
  }

  function authHeaders(extra = {}) {
    const h = { ...extra };
    const t = getToken();
    if (t) h["authorization"] = `Bearer ${t}`;
    return h;
  }

  async function request(path, { method = "GET", headers = {}, body = null } = {}) {
    const opts = { method, headers: authHeaders(headers) };
    if (body !== null && body !== undefined) {
      opts.headers["content-type"] = "application/json; charset=utf-8";
      opts.body = JSON.stringify(body);
    }
    const data = await fetchJson(path, opts);

    // لو انتهت الجلسة
    if (data && (data.status === 401 || data.status === 403)) {
      // لا نمسح مباشرة إذا الصفحة ليست محمية، لكن غالباً أفضل تنظيف
      // حتى لا تظل واجهات معينة عالقة.
      setToken("");
      setUser(null);
    }
    return data;
  }

  // ===== API calls =====
  async function login(username, password) {
    const data = await request("/api/login", {
      method: "POST",
      body: { username, password },
    });

    // توقعات الاستجابة:
    // { ok:true, token:"...", user:{username, role} } أو { ok:true, token:"...", role:"admin" }
    if (data && data.ok) {
      if (data.token) setToken(data.token);
      const u = data.user || (data.username ? { username: data.username, role: data.role } : null);
      if (u) setUser(u);
    }
    return data;
  }

  async function logout() {
    const data = await request("/api/logout", { method: "POST" });
    setToken("");
    setUser(null);
    return data;
  }

  async function health() {
    return fetchJson("/api/health");
  }

  async function state() {
    return request("/api/state");
  }

  async function next(number, gender) {
    return request("/api/next", { method: "POST", body: { number, gender } });
  }

  async function prev() {
    return request("/api/prev", { method: "POST" });
  }

  async function resetQueue() {
    return request("/api/reset", { method: "POST" });
  }

  // رسالة المدير في العمود الأوسط (إخفاء أرقام الوسط إن كانت ميزة موجودة بالخلفية)
  async function sendCenterMessage(text) {
    return request("/api/center-message", { method: "POST", body: { text } });
  }

  // الشريط الأصفر للملاحظة
  async function sendTickerNote(text) {
    return request("/api/note", { method: "POST", body: { text } });
  }
  async function clearTickerNote() {
    return request("/api/note/clear", { method: "POST" });
  }

  // رسالة من موظف إلى المدير / أو العكس حسب الخلفية
  async function sendStaffNote(to, text) {
    return request("/api/staff-note", { method: "POST", body: { to, text } });
  }

  // ===== إدارة المستخدمين (الفاحصين) =====
  async function listUsers() {
    return request("/api/users", { method: "GET" });
  }

  async function addUser(username, password, role = "staff") {
    return request("/api/users", {
      method: "POST",
      body: { username, password, role },
    });
  }

  async function deleteUser(username) {
    // بعض الخلفيات تستخدم DELETE /api/users/:username
    return request(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" });
  }

  // ===== أدوات مساعدة للواجهات =====
  function isLoggedIn() {
    return !!getToken();
  }

  function role() {
    const u = getUser();
    return (u && u.role) ? u.role : "";
  }

  // توجيه بسيط (اختياري). بعض الصفحات عندك فيها go() داخل الصفحة،
  // لكن نوفرها هنا أيضاً حتى لو احتاجتها صفحات أخرى.
  function go(target) {
    // target: "admin" | "staff" | "display" | "login"
    const map = {
      admin: "/المدير/",
      staff: "/الفاحص/",
      display: "/العرض/",
      login: "/تسجيل-الدخول/",
    };
    const url = map[target] || target || "/";
    window.location.href = url;
  }

  // تصدير عالمي
  const App = {
    // storage
    getToken, setToken, getUser, setUser,

    // helpers
    request, fetchJson, isLoggedIn, role, go,

    // endpoints
    login, logout, health, state, next, prev, resetQueue,
    sendCenterMessage, sendTickerNote, clearTickerNote, sendStaffNote,

    // users mgmt
    listUsers, addUser, deleteUser,
  };

  window.App = App;
  window.go = go; // للتوافق مع صفحات قديمة
})();
