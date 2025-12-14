const API = {
  async request(path, opts = {}) {
    const token = localStorage.getItem("token") || "";
    const headers = new Headers(opts.headers || {});
    if (!headers.has("content-type") && opts.body && typeof opts.body === "string") {
      headers.set("content-type", "application/json; charset=utf-8");
    }
    if (token) headers.set("authorization", "Bearer " + token);

    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const msg = data.error || data.message || ("HTTP " + res.status);
      throw new Error(msg);
    }
    return data;
  },
  login(username, password) {
    return this.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ username, password }),
    });
  },
  logout() { return this.request("/api/logout", { method: "POST" }); },
  state() { return this.request("/api/state"); },
  next(number, gender) {
    return this.request("/api/next", { method:"POST", headers:{ "content-type":"application/json; charset=utf-8" }, body: JSON.stringify({ number, gender }) });
  },
  prev() { return this.request("/api/prev", { method: "POST" }); },
  toAdmin(text) { return this.request("/api/message/to-admin", { method:"POST", headers:{ "content-type":"application/json; charset=utf-8" }, body: JSON.stringify({ text }) }); },
  toStaff(to, text) { return this.request("/api/message/to-staff", { method:"POST", headers:{ "content-type":"application/json; charset=utf-8" }, body: JSON.stringify({ to, text }) }); },
  setDisplayMessage(text, active=true) { return this.request("/api/display-message", { method:"POST", headers:{ "content-type":"application/json; charset=utf-8" }, body: JSON.stringify({ text, active }) }); },
  clearDisplayMessage() { return this.request("/api/display-message/clear", { method:"POST" }); },
  setTicker(text) { return this.request("/api/ticker", { method:"POST", headers:{ "content-type":"application/json; charset=utf-8" }, body: JSON.stringify({ text }) }); },
  clearTicker() { return this.request("/api/ticker/clear", { method:"POST" }); },
  pingDisplay() { return this.request("/api/display/ping", { method:"POST" }); },
  resetQueue() { return this.request("/api/queue/reset", { method:"POST" }); },
  usersList() { return this.request("/api/users"); }
}
  ,usersAdd(data){ return this.request("/api/users", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(data) }); }
  ,usersDelete(username){ return this.request("/api/users/" + encodeURIComponent(username), { method:"DELETE" }); }
  ,usersResetPassword(username, newPassword){ 
      return this.request("/api/users/" + encodeURIComponent(username) + "/password", { method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ password: newPassword }) });
  }

};

function setStatus(el, text, good=true){
  el.textContent = text;
  el.style.borderColor = good ? "rgba(37,99,235,.35)" : "rgba(220,38,38,.35)";
  el.style.background = good ? "rgba(37,99,235,.07)" : "rgba(220,38,38,.07)";
  el.style.color = "#111827";
}
function fmtTime(iso){
  if(!iso) return "-";
  try{ return new Date(iso).toLocaleString("ar-OM"); }catch(e){ return iso; }
}
function fmtHHMM(iso){
  if(!iso) return "";
  try{
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    return `${hh}:${mm}`;
  }catch(e){ return ""; }
}
window.App = { API, setStatus, fmtTime, fmtHHMM };
