/* public/app.js - Stable App (matches your Worker response) */
(function () {
  "use strict";

  // مفاتيح التخزين (ثابتة)
  var LS_NAME = "tq_name";
  var LS_ROLE = "tq_role";

  function setStatus(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = ok === true ? "#16a34a" : ok === false ? "#dc2626" : "#334155";
  }

  function setMe(name, role) {
    if (name) localStorage.setItem(LS_NAME, name); else localStorage.removeItem(LS_NAME);
    if (role) localStorage.setItem(LS_ROLE, role); else localStorage.removeItem(LS_ROLE);
  }

  function getMe() {
    return {
      name: localStorage.getItem(LS_NAME) || "",
      role: localStorage.getItem(LS_ROLE) || ""
    };
  }

  function clearMe() {
    localStorage.removeItem(LS_NAME);
    localStorage.removeItem(LS_ROLE);
  }

  async function fetchJson(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {});
    var res = await fetch(path, opts);
    var text = await res.text();
    var data;
    try { data = JSON.parse(text); } catch { data = { ok: false, raw: text }; }
    if (!res.ok) data.ok = false;
    data._status = res.status;
    return data;
  }

  var API = {
    health: function () { return fetchJson("/api/health"); },
    login: function (username, password) {
      return fetchJson("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ username: username, password: password })
      });
    }
  };

  function go(path) { location.href = path; }

  window.App = { API: API, setStatus: setStatus, setMe: setMe, getMe: getMe, clearMe: clearMe, go: go };
})();
