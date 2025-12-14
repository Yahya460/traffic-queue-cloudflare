/* traffic-queue-cloudflare - public/app.js (fixed) */
(() => {
  "use strict";

  const LS_TOKEN = "tq_token";
  const LS_USER = "tq_user";

  const $ = (sel, root = document) => root.querySelector(sel);

  function safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    const data = safeJsonParse(text);
    const out = (data && typeof data === "object") ? data : { ok: false, raw: text };
    if (!res.ok) {
      out.ok = false;
      out.status = res.status;
      out.statusText = res.statusText;
    }
    return out;
  }

  const App = {
    token() {
      return localStorage.getItem(LS_TOKEN) || "";
    },
    setToken(token) {
      if (token) localStorage.setItem(LS_TOKEN, token);
      else localStorage.removeItem(LS_TOKEN);
    },

    user() {
      return safeJsonParse(localStorage.getItem(LS_USER) || "null");
    },
    setUser(u) {
      if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
      else localStorage.removeItem(LS_USER);
    },

    // ✅ الدالة اللي كانت ناقصة وتسبب الخطأ
    setStatus(msg = "", kind = "info") {
      const el = $("#status") || $("[data-status]");
      if (el) {
        el.textContent = msg;
        el.style.display = msg ? "" : "none";
        el.dataset.kind = kind;
      } else {
        if (msg) console.log(`[${kind}] ${msg}`);
      }
    },

    async request(path, opts = {}) {
      const method = opts.method || "GET";
      const headers = new Headers(opts.headers || {});
      const body = opts.body ?? null;

      // attach token if exists
      const t = this.token();
      if (t && !headers.has("authorization")) {
        headers.set("authorization", `Bearer ${t}`);
      }

      return fetchJson(path, { method, headers, body });
    },

    async login(username, password) {
      const res = await this.request("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username, password }),
      });

      if (res && res.ok && res.token) {
        this.setToken(res.token);
        this.setUser(res.user || { username });
      }
      return res;
    },

    async logout() {
      const res = await this.request("/api/logout", { method: "POST" });
      this.setToken("");
      this.setUser(null);
      return res;
    },

    async state() {
      return this.request("/api/state");
    },

    async next(number, gender) {
      return this.request("/api/next", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ number, gender }),
      });
    },

    async prev() {
      return this.request("/api/prev", { method: "POST" });
    },

    async sendCenterMessage(text) {
      return this.request("/api/center-message", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text }),
      });
    },

    async setTickerNote(text) {
      return this.request("/api/ticker-note", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text }),
      });
    },

    async users() {
      return this.request("/api/users");
    },

    async addUser(username, password, role = "staff") {
      return this.request("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username, password, role }),
      });
    },

    async deleteUser(username) {
      return this.request("/api/users", {
        method: "DELETE",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username }),
      });
    },
  };

  // مهم: تصدير App للصفحات
  window.App = App;
})();
