/* public/app.js - Stable window.App (Cloudflare Pages + DO API) */
(function () {
  "use strict";

  var LS_TOKEN = "tq_token";
  var LS_USER  = "tq_user";

  function safeJsonParse(txt) { try { return JSON.parse(txt); } catch (e) { return null; } }

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

  function setToken(t) {
    if (!t) localStorage.removeItem(LS_TOKEN);
    else localStorage.setItem(LS_TOKEN, String(t));
  }
  function token() { return localStorage.getItem(LS_TOKEN) || ""; }

  function setUser(u) {
    if (!u) localStorage.removeItem(LS_USER);
    else localStorage.setItem(LS_USER, JSON.stringify(u));
  }
  function getUser() { return safeJsonParse(localStorage.getItem(LS_USER) || "null"); }

  function fetchJson(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};

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

  function fmtHHMM(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    return hh + ":" + mm;
  }

  var API = {
    health: function () { return fetchJson("/api/health"); },
    state:  function () { return fetchJson("/api/state"); },

    login: function (username, password) {
      return fetchJson("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username: username, password: password })
      }).then(function (r) {
        // عندك بالسيرفر يرجع: {ok:true, token:"...", username:"...", role:"..."}
        if (!r || !r.ok) throw new Error((r && r.error) ? r.error : "LOGIN_FAILED");
        return r;
      });
    },

    // نداء من الفاحص
    next: function (number, gender) {
      return fetchJson("/api/next", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ number: number, gender: gender })
      });
    },

    prev: function () { return fetchJson("/api/prev", { method: "POST" }); },

    // رسالة المدير (الشريط أو الرسالة)
    setTicker: function (text) {
      return fetchJson("/api/ticker", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text: text })
      });
    },

    // صورة الوسط (مدير فقط) — لو API عندك موجودة
    setCenterImage: function (dataUrl) {
      return fetchJson("/api/center-image", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ dataUrl: dataUrl })
      });
    },
    clearCenterImage: function () {
      return fetchJson("/api/center-image/clear", { method: "POST" });
    }
  };

  function go(path) { window.location.href = path; }

  window.App = {
    API: API,
    setStatus: setStatus,
    setToken: setToken,
    token: token,
    setUser: setUser,
    getUser: getUser,
    go: go,
    fmtHHMM: fmtHHMM
  };
})();
