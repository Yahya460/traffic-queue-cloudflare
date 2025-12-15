/* traffic-queue-cloudflare - public/app.js (FIXED 100%) */
/* هذا الملف يُعرّف window.App ويحل مشاكل: App is not defined / setStatus missing / SyntaxError */

(() => {
  "use strict";

  const LS_TOKEN = "tq_token";
  const LS_USER  = "tq_user";

  function safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  async function fetchJson(url, opts = {}) {
    const res  = await fetch(url, opts);
    const text = await res.text();
    const data = safeJsonParse(text);
    const out  = (data && typeof data === "object") ? data : { ok: false, raw: text };
    out._status = res.status;
    out._statusText = res.statusText;
    if (!res.ok) out.ok = false;
    return out;
  }

  function token() {
    return localStorage.getItem(LS_TOKEN) || "";
  }

  function setToken(t) {
    if (t) localStorage.setItem(LS_TOKEN, t);
    else localStorage.removeItem(LS_TOKEN);
  }

  function getUser() {
    return safeJsonParse(localStorage.getItem(LS_USER) || "null");
  }

  function setUser(u) {
    if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
    else localStorage.removeItem(LS_USER);
  }

  // دالة الحالة (Status) المطلوبة داخل الصفحات
  function setStatus(el, msg = "", kind = "info") {
    if (!el) return;
    el.textContent = msg || "";
    try {
      el.classList.remove("ok", "err", "info", "warn");
      const k = (kind || "info").toLowerCase();
      if (k === "error") el.classList.add("err");
      else el.classList.add(k);
    } catch {}
  }

  const API = {
    async request(path, opts = {}) {
      const headers = Object.assign({}, opts.headers || {});
      const t = token();
      if (t) headers["Authorization"] = `Bearer ${t}`;
      opts.headers = headers;
      return fetchJson(path, opts);
    },

    // ---- Auth ----
    login(username, password) {
      return this.request("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username, password })
      });
    },

    logout() {
      return this.request("/api/logout", { method: "POST" });
    },

    // ---- State / Queue ----
    state() {
      return this.request("/api/state");
    },

    next(number, gender) {
      return this.request("/api/next", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ number, gender })
      });
    },

    prev() {
      return this.request("/api/prev", { method: "POST" });
    },

    resetQueue() {
      return this.request("/api/queue/reset", { method: "POST" });
    },

    // ---- Display message (المربع الأوسط) ----
    setDisplayMessage(text, active = true) {
      return this.request("/api/display-message", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text, active })
      });
    },

    clearDisplayMessage() {
      return this.request("/api/display-message/clear", { method: "POST" });
    },

    pingDisplay() {
      return this.request("/api/display/ping", { method: "POST" });
    },

    // ---- Ticker (الشريط الأصفر) ----
    setTicker(text) {
      return this.request("/api/ticker", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text })
      });
    },

    clearTicker() {
      return this.request("/api/ticker/clear", { method: "POST" });
    },

    // alias (بعض الصفحات قد تستخدم هذا الاسم)
    sendTicker(text) { return this.setTicker(text); },

    // ---- Messages ----
    toAdmin(text) {
      return this.request("/api/message/to-admin", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text })
      });
    },

    toStaff(to, text) {
      return this.request("/api/message/to-staff", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ to, text })
      });
    },

    // aliases
    sendToAdmin(text) { return this.toAdmin(text); },
    sendStaffMessage(to, text) { return this.toStaff(to, text); },

    // ---- Users ----
    usersList() {
      return this.request("/api/users");
    },

    usersAdd(bodyOrUsername, password, role = "staff") {
      const body = (typeof bodyOrUsername === "object" && bodyOrUsername)
        ? bodyOrUsername
        : { username: bodyOrUsername, password, role };

      return this.request("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(body)
      });
    },

    usersDelete(username) {
      return this.request("/api/users/" + encodeURIComponent(username), { method: "DELETE" });
    },

    usersResetPassword(username, password) {
      return this.request("/api/users/" + encodeURIComponent(username) + "/password", {
        method: "PUT",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ password })
      });
    },

    // aliases (للوحة المدير)
    getUsers() { return this.usersList(); },
    addUser(username, password, role = "staff") { return this.usersAdd(username, password, role); },
    deleteUser(username) { return this.usersDelete(username); },
    resetPassword(username, password) { return this.usersResetPassword(username, password); }
  };

  function go(path) {
    window.location.href = path;
  }

  function fmtHHMM(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function fmtTime(ts) {
    if (!ts) return "";
    try { return new Date(ts).toLocaleString("ar-OM"); } catch { return String(ts); }
  }

  // expose
  window.App = { API, token, setToken, getUser, setUser, setStatus, go, fmtTime, fmtHHMM };
  window.setStatus = setStatus; // توافق مع أي كود قديم
})();
window.App = App;
