/* traffic-queue-cloudflare - app.js (fixed) */
/* Provides a small global helper: window.App + window.go */
(function () {
  "use strict";

  const LS_TOKEN = "tq_token";
  const LS_USER  = "tq_user";

  function safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const txt = await res.text();
    const data = safeJsonParse(txt);
    // Always return an object
    const out = data && typeof data === "object" ? data : { ok: false, raw: txt };

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
      const raw = localStorage.getItem(LS_USER);
      return raw ? safeJsonParse(raw) : null;
    },
    setUser(u) {
      if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
      else localStorage.removeItem(LS_USER);
    },

    async api(path, { method = "GET", body, headers } = {}) {
      const h = new Headers(headers || {});
      // Only set JSON header when we're sending a body
      if (body !== undefined && !h.has("Content-Type")) {
        h.set("Content-Type", "application/json");
      }

      const tok = App.token();
      if (tok && !h.has("Authorization")) {
        h.set("Authorization", "Bearer " + tok);
      }

      const opts = { method, headers: h };
      if (body !== undefined) opts.body = typeof body === "string" ? body : JSON.stringify(body);

      return await fetchJson(path, opts);
    },

    async login(username, password) {
      const data = await App.api("/api/login", {
        method: "POST",
        body: { username, password }
      });

      if (data && data.ok && data.token) {
        App.setToken(data.token);
      }
      // Some backends also return user info
      if (data && data.ok && data.user) {
        App.setUser(data.user);
      }
      return data;
    },

    logout() {
      App.setToken("");
      App.setUser(null);
    },

    async me() {
      return await App.api("/api/me");
    },

    go(url) {
      window.location.href = url;
    }
  };

  // Expose globally (pages expect this)
  window.App = App;

  // Some pages call go(...) directly
  window.go = function (url) {
    App.go(url);
  };

  // Convenience: global logout redirect
  window.doLogout = function (redirectTo = "/تسجيل-الدخول/") {
    App.logout();
    App.go(redirectTo);
  };
})();
