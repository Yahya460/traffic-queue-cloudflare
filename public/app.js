(function(){
  "use strict";

  const LS_TOKEN = "tq_token";
  const LS_USER  = "tq_user";

  function safeJsonParse(t){ try { return JSON.parse(t); } catch { return null; } }

  function setToken(t){
    if (t) localStorage.setItem(LS_TOKEN, t);
    else localStorage.removeItem(LS_TOKEN);
  }
  function token(){ return localStorage.getItem(LS_TOKEN) || ""; }

  function setUser(u){
    if (u) localStorage.setItem(LS_USER, JSON.stringify(u));
    else localStorage.removeItem(LS_USER);
  }
  function getUser(){ return safeJsonParse(localStorage.getItem(LS_USER) || "null"); }

  function setStatus(el, msg, kind="info"){
    if(!el) return;
    el.textContent = msg || "";
    el.style.color = (kind==="ok") ? "#16a34a" : (kind==="err") ? "#dc2626" : "#334155";
  }

  async function request(path, opts={}){
    opts.headers = Object.assign({}, opts.headers || {});
    const t = token();
    if (t) opts.headers["Authorization"] = "Bearer " + t;

    const res = await fetch(path, opts);
    const txt = await res.text();
    const data = safeJsonParse(txt) || { ok:false, raw:txt };
    if (!res.ok) data.ok = false;
    data._status = res.status;
    return data;
  }

  const API = {
    async login(username, password){
      const r = await request("/api/login", {
        method:"POST",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ username, password })
      });
      if(!r.ok) return r;
      if(r.token) setToken(r.token);
      if(r.user) setUser(r.user);
      return r;
    },
    logout(){ setToken(""); setUser(null); return request("/api/logout", { method:"POST" }); },
    state(){ return request("/api/state", { method:"GET" }); },

    // Admin image
    setDisplayImage(dataUrl){
      return request("/api/admin/display-image", {
        method:"POST",
        headers:{ "content-type":"application/json; charset=utf-8" },
        body: JSON.stringify({ dataUrl })
      });
    },
    clearDisplayImage(){
      return request("/api/admin/display-image/clear", { method:"POST" });
    }
  };

  window.App = { API, token, setToken, setUser, getUser, setStatus };
})();
