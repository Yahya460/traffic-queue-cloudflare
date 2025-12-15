/* public/app.js - traffic queue (clean) */
(() => {
  "use strict";

  const LS_TOKEN = "tq_token";
  const LS_USER  = "tq_user";

  const $ = (sel, el=document) => el.querySelector(sel);

  function safeJsonParse(txt){ try{ return JSON.parse(txt); }catch{ return null; } }

  function setStatus(el, msg="", kind="info"){
    if(!el) return;
    el.textContent = msg || "";
    el.style.color = (kind==="ok") ? "#16a34a" : (kind==="err") ? "#dc2626" : (kind==="warn") ? "#d97706" : "#334155";
  }

  function token(){ return localStorage.getItem(LS_TOKEN) || ""; }
  function setToken(t){ t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); }

  function getUser(){ return safeJsonParse(localStorage.getItem(LS_USER) || "null"); }
  function setUser(u){ u ? localStorage.setItem(LS_USER, JSON.stringify(u)) : localStorage.removeItem(LS_USER); }

  async function fetchJson(url, opts={}){
    const headers = Object.assign({}, opts.headers || {});
    const t = token();
    if(t) headers["Authorization"] = `Bearer ${t}`;
    opts.headers = headers;

    const res = await fetch(url, opts);
    const text = await res.text();
    const data = safeJsonParse(text);
    const out = (data && typeof data === "object") ? data : { ok:false, raw:text };
    out._status = res.status;
    if(!res.ok) out.ok = false;
    return out;
  }

  const API = {
    health(){ return fetchJson("/api/health"); },

    async login(username, password){
      const r = await fetchJson("/api/login", {
        method:"POST",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ username, password })
      });
      if(!r.ok) throw new Error(r.error || "LOGIN_FAILED");
      if(r.token) setToken(r.token);
      setUser({ username: r.username, role: r.role });
      return r;
    },

    async logout(){
      await fetchJson("/api/logout", { method:"POST" });
      setToken("");
      setUser(null);
      return true;
    },

    me(){ return fetchJson("/api/me"); },

    // users (admin)
    usersList(){ return fetchJson("/api/users"); },
    usersAdd(username, password, role="staff"){
      return fetchJson("/api/users", {
        method:"POST",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ username, password, role })
      });
    },
    usersDelete(username){
      return fetchJson("/api/users/" + encodeURIComponent(username), { method:"DELETE" });
    },
    usersResetPassword(username, password){
      return fetchJson("/api/users/" + encodeURIComponent(username) + "/password", {
        method:"PUT",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ password })
      });
    },
    usersSetRole(username, role){
      return fetchJson("/api/users/" + encodeURIComponent(username) + "/role", {
        method:"PUT",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ role })
      });
    },

    // queue
    state(){ return fetchJson("/api/state"); },
    next(number, gender){
      return fetchJson("/api/next", {
        method:"POST",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ number, gender })
      });
    },
    prev(){ return fetchJson("/api/prev", { method:"POST" }); },

    // display controls (admin)
    setTicker(text){
      return fetchJson("/api/ticker", {
        method:"POST",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ text })
      });
    },
    getTicker(){ return fetchJson("/api/ticker"); },

    setCenterImage(dataUrl){
      return fetchJson("/api/center-image", {
        method:"POST",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ dataUrl })
      });
    },
    getCenterImage(){ return fetchJson("/api/center-image"); },
  };

  function go(path){ location.href = path; }

  // expose
  window.App = { $, API, token, setToken, getUser, setUser, setStatus, go };
})();