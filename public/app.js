/* public/app.js - Stable window.App (token/username/role) */
(function () {
  "use strict";

  var LS_TOKEN = "token";
  var LS_USER  = "username";
  var LS_ROLE  = "role";

  function safeJsonParse(txt){ try{return JSON.parse(txt);}catch(e){return null;} }

  function setStatus(el, msg, ok) {
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = ok === true ? "#16a34a" : ok === false ? "#dc2626" : "#334155";
  }

  function getToken(){ return localStorage.getItem(LS_TOKEN) || ""; }
  function setToken(t){ if(t) localStorage.setItem(LS_TOKEN, String(t)); else localStorage.removeItem(LS_TOKEN); }

  function getMe(){
    return {
      username: localStorage.getItem(LS_USER) || "",
      role: localStorage.getItem(LS_ROLE) || ""
    };
  }
  function setMe(username, role){
    if (username) localStorage.setItem(LS_USER, username); else localStorage.removeItem(LS_USER);
    if (role) localStorage.setItem(LS_ROLE, role); else localStorage.removeItem(LS_ROLE);
  }

  function authHeaders(){
    var h = { "content-type": "application/json; charset=utf-8" };
    var t = getToken();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }

  function fetchJson(path, opts){
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {});
    return fetch(path, opts).then(function(res){
      return res.text().then(function(text){
        var data = safeJsonParse(text);
        if (!data || typeof data !== "object") data = { ok:false, raw:text };
        data._status = res.status;
        if (!res.ok) data.ok = false;
        return data;
      });
    });
  }

  var API = {
    health: function(){ return fetchJson("/api/health"); },

    login: function(username, password){
      return fetchJson("/api/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ username: username, password: password })
      }).then(function(r){
        if (!r || !r.ok) throw new Error("فشل تسجيل الدخول");
        var token = r.token || "";
        var uname = r.username || (r.user && r.user.username) || "";
        var role  = r.role || (r.user && r.user.role) || "";
        if (!uname || !role) throw new Error("رد API ناقص (username/role)");
        return { token: token, username: uname, role: role };
      });
    },

    logout: function(){
      return fetchJson("/api/logout", { method:"POST", headers: authHeaders() });
    },

    state: function(){ return fetchJson("/api/state"); },

    next: function(number, gender){
      return fetchJson("/api/next", {
        method:"POST",
        headers: authHeaders(),
        body: JSON.stringify({ number: number, gender: gender })
      });
    },

    prev: function(){
      return fetchJson("/api/prev", { method:"POST", headers: authHeaders() });
    },

    // إدارة الموظفين
    usersList: function(){
      return fetchJson("/api/users", { method:"GET", headers: authHeaders() });
    },
    usersAdd: function(username, password, role){
      return fetchJson("/api/users", {
        method:"POST",
        headers: authHeaders(),
        body: JSON.stringify({ username: username, password: password, role: role || "staff" })
      });
    },
    usersDelete: function(username){
      return fetchJson("/api/users/" + encodeURIComponent(username), {
        method:"DELETE",
        headers: authHeaders()
      });
    },
    usersResetPassword: function(username, password){
      return fetchJson("/api/users/" + encodeURIComponent(username) + "/password", {
        method:"PUT",
        headers: authHeaders(),
        body: JSON.stringify({ password: password })
      });
    }
  };

  function go(path){ window.location.href = path; }

  window.App = {
    API: API,
    setStatus: setStatus,
    getToken: getToken,
    setToken: setToken,
    getMe: getMe,
    setMe: setMe,
    go: go
  };
})();
