/* public/app.js - STABLE (Token + User saved) */

(function () {
  "use strict";

  var LS_TOKEN = "tq_token";
  var LS_USER  = "tq_user";

  function safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || "";
    try {
      el.style.color = "";
      if (kind === "ok") el.style.color = "#16a34a";
      else if (kind === "err") el.style.color = "#dc2626";
      else if (kind === "warn") el.style.color = "#d97706";
      else el.style.color = "#334155";
    } catch (e) {}
  }

  function setUser(u) {
    if (!u) localStorage.removeItem(LS_USER);
    else localStorage.setItem(LS_USER, JSON.stringify(u));
  }

  function getUser() {
    return safeJsonParse(localStorage.getItem(LS_USER) || "null");
  }

  function setToken(t) {
    if (!t) localStorage.removeItem(LS_TOKEN);
    else localStorage.setItem(LS_TOKEN, String(t));
  }

  function token() {
    return localStorage.getItem(LS_TOKEN) || "";
  }

  function fetchJson(path, opts) {
    if (!opts) opts = {};
    if (!opts.headers) opts.headers = {};

    var t = token();
    if (t) opts.headers["Authorization"] = "Bearer " + t;

    return fetch(path, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = safeJsonParse(text);
        if (!data || typeof data !== "object") data = { ok: false, raw: text };
        data._status = res.status;
        data._statusText = res.statusText;
        if (!res.ok) data.ok = false;
        return data;
      });
    });
  }

  var API = {
    login: function (username, password) {
      return fetchJson("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username: username, password: password })
      }).then(function (r) {
        // نتوقع الآن: { ok:true, token:"...", user:{username, role} }
        if (!r || !r.ok || !r.user) {
          return { ok: false, error: (r && r.error) ? r.error : "INVALID_LOGIN" };
        }

        // ✅ خزّن التوكن + المستخدم
        if (r.token) setToken(r.token);
        setUser({ username: r.user.username, role: r.user.role });

        return { ok: true, token: r.token || "", username: r.user.username, role: r.user.role };
      });
    },

    logout: function () {
      return fetchJson("/api/logout", { method: "POST" }).then(function (r) {
        setToken("");
        setUser(null);
        return r;
      });
    },

    // مستخدمين (Admin)
    getUsers: function () {
      return fetchJson("/api/users", { method: "GET" });
    },

    addUser: function (username, password, role) {
      return fetchJson("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username: username, password: password, role: role })
      });
    }
  };

  function go(path) { window.location.href = path; }

  window.App = {
    API: API,
    setStatus: setStatus,
    setUser: setUser,
    getUser: getUser,
    setToken: setToken,
    token: token,
    go: go
  };
})();