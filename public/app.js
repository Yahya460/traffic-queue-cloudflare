/* traffic-queue-cloudflare - app.js (stable globals) */
(function () {
  "use strict";

  const LS_TOKEN = "tq_token";
  const LS_USER = "tq_user";

  function $(sel, root = document) { return root.querySelector(sel); }
  function byId(id) { return document.getElementById(id); }

  function safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch { return null; }
  }

  async function fetchJson(url, opts = {}) {
    const res = await fetch(url, opts);
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

  function token() { return localStorage.getItem(LS_TOKEN) || ""; }
  function setToken(t) { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); }
  function setUser(u) { u ? localStorage.setItem(LS_USER, u) : localStorage.removeItem(LS_USER); }
  function getUser() { return localStorage.getItem(LS_USER) || ""; }

  function setStatus(msg, kind = "info") {
    const el = byId("status") || $(".status") || byId("msg");
    if (el) {
      el.textContent = msg || "";
      el.dataset.kind = kind;
      el.style.display = msg ? "" : "none";
    } else if (msg) {
      console[kind === "error" ? "error" : "log"](msg);
    }
  }

  async function request(path, { method = "GET", body, headers } = {}) {
    const h = Object.assign({}, headers || {});
    const t = token();
    if (t) h["authorization"] = `Bearer ${t}`;

    if (body !== undefined && body !== null) {
      if (!(body instanceof FormData)) {
        h["content-type"] = h["content-type"] || "application/json; charset=utf-8";
        body = typeof body === "string" ? body : JSON.stringify(body);
      }
    }
    return fetchJson(path, { method, headers: h, body });
  }

  // Global helper (some pages call go(...) مباشرة)
  function go(url) {
    if (!url) return;
    window.location.href = url;
  }

  const App = {
    // storage
    token, setToken, getUser, setUser,

    // ui
    setStatus,

    // api core
    request,
    health: () => fetchJson("/api/health"),

    login: async (username, password) => {
      setStatus("");
      const data = await request("/api/login", { method: "POST", body: { username, password } });
      if (data && data.ok && data.token) {
        setToken(data.token);
        setUser(username);
      }
      return data;
    },

    logout: async () => {
      const data = await request("/api/logout", { method: "POST" });
      setToken("");
      setUser("");
      return data;
    },

    state: () => request("/api/state"),
    next: (number, gender) => request("/api/next", { method: "POST", body: { number, gender } }),
    prev: () => request("/api/prev", { method: "POST" }),

    resetQueue: () => request("/api/resetQueue", { method: "POST" }),
    resetStats: () => request("/api/resetStats", { method: "POST" }),

    sendCenterMessage: (message) => request("/api/centerMessage", { method: "POST", body: { message } }),
    clearCenterMessage: () => request("/api/centerMessage", { method: "DELETE" }),

    sendTicker: (message) => request("/api/ticker", { method: "POST", body: { message } }),
    clearTicker: () => request("/api/ticker", { method: "DELETE" }),

    // users management
    usersList: () => request("/api/users"),
    usersAdd: (username, password, role = "staff") =>
      request("/api/users", { method: "POST", body: { username, password, role } }),
    usersDelete: (username) =>
      request(`/api/users/${encodeURIComponent(username)}`, { method: "DELETE" }),
  };

  // expose AFTER App is defined (يحل مشكلة: Cannot access 'App' before initialization)
  window.go = go;
  window.App = App;
})();
