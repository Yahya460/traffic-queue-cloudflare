/* public/app.js (COMPAT FIX) - defines window.App safely + supports legacy storage keys */
(() => {
  "use strict";

  // NEW keys (recommended)
  const LS_TOKEN = "tq_token";
  const LS_USER  = "tq_user";

  // OLD keys (your pages used before)
  const OLD_TOKEN = "token";
  const OLD_USERNAME = "username";
  const OLD_ROLE = "role";

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
    return (
      localStorage.getItem(LS_TOKEN) ||
      localStorage.getItem(OLD_TOKEN) ||
      ""
    );
  }

  function setToken(t) {
    if (t) {
      localStorage.setItem(LS_TOKEN, t);
      localStorage.setItem(OLD_TOKEN, t); // compatibility
    } else {
      localStorage.removeItem(LS_TOKEN);
      localStorage.removeItem(OLD_TOKEN);
    }
  }

  function getUser() {
    const u = safeJsonParse(localStorage.getItem(LS_USER) || "null");
    if (u && typeof u === "object") return u;

    // fallback from legacy keys
    const username = localStorage.getItem(OLD_USERNAME) || "";
    const role = localStorage.getItem(OLD_ROLE) || "";
    if (username || role) return { username, role };
    return null;
  }

  function setUser(u) {
    if (u) {
      localStorage.setItem(LS_USER, JSON.stringify(u));
      // legacy mirror
      if (u.username != null) localStorage.setItem(OLD_USERNAME, String(u.username));
      if (u.role != null) localStorage.setItem(OLD_ROLE, String(u.role));
    } else {
      localStorage.removeItem(LS_USER);
      localStorage.removeItem(OLD_USERNAME);
      localStorage.removeItem(OLD_ROLE);
    }
  }

  // setStatus supports both:
  // App.setStatus(el,"msg","info")  OR  App.setStatus(el,"msg",true/false)
  function setStatus(el, msg = "", kind = "info") {
    if (!el) return;
    el.textContent = msg || "";

    // normalize kind
    let k = kind;
    if (typeof kind === "boolean") k = kind ? "ok" : "err";
    k = String(k || "info").toLowerCase();
    if (k === "error") k = "err";
    if (k === "success") k = "ok";

    try {
      el.classList.remove("ok", "err", "info", "warn");
      el.classList.add(k);
    } catch {}
  }

  const API = {
    async request(path, opts = {}) {
      const headers = Object.assign({}, opts.headers || {});
      const t = token();
      if (t) headers["Authorization"] = Bearer ${t};
      opts.headers = headers;
      return fetchJson(path, opts);
    },

    // Auth
    async login(username, password) {
      const r = await this.request("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username, password })
      });

      // If login ok, auto-save token/user here (so pages become simpler)
      if (r && r.ok && r.token) {
        setToken(r.token);
        setUser({ username: r.username, role: r.role });
      }
      return r;
    },

    logout() {
      setToken("");
      setUser(null);
      return this.request("/api/logout", { method: "POST" });
    },

    // Queue
    state() { return this.request("/api/state"); },
    next(number, gender) {
      return this.request("/api/next", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ number, gender })
      });
    },
    prev() { return this.request("/api/prev", { method: "POST" }); },
    resetQueue() { return this.request("/api/queue/reset", { method: "POST" }); },

    // Users (admin)
    usersList() { return this.request("/api/users"); },
    usersAdd(username, password, role = "staff") {
      return this.request("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username, password, role })
      });
    },
    usersDelete(username) {
      return this.request("/api/users/" + encodeURIComponent(username), { method: "DELETE" });
    },

    // Ticker / messages (if your backend has them)
    setTicker(text) {
      return this.request("/api/ticker", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text })
      });
    }
  };

  function go(path) { window.location.href = path; }

  window.App = { API, token, setToken, getUser, setUser, setStatus, go };
})();