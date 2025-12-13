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

  logout() {
    return this.request("/api/logout", { method: "POST" });
  },

  state() {
    return this.request("/api/state");
  },

  next(number, gender) {
    return this.request("/api/next", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ number, gender }),
    });
  },

  prev() {
    return this.request("/api/prev", { method: "POST" });
  },

  note(note) {
    return this.request("/api/note", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ note }),
    });
  },

  stats() {
    return this.request("/api/stats");
  },

  resetStats() {
    return this.request("/api/stats/reset", { method: "POST" });
  },

  usersList() {
    return this.request("/api/users");
  },

  userAdd(username, password, role) {
    return this.request("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ username, password, role }),
    });
  },

  userPass(username, password) {
    return this.request(`/api/users/${encodeURIComponent(username)}/password`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ password }),
    });
  },

  userDelete(username) {
    return this.request(`/api/users/${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
  }
};

function setStatus(el, text, good=true){
  el.textContent = text;
  el.style.borderColor = good ? "rgba(52,211,153,.35)" : "rgba(239,68,68,.35)";
  el.style.background = good ? "rgba(52,211,153,.10)" : "rgba(239,68,68,.10)";
  el.style.color = good ? "#d1fae5" : "#fee2e2";
}

function fmtTime(iso){
  if(!iso) return "-";
  try{
    return new Date(iso).toLocaleString("ar-OM");
  }catch(e){ return iso; }
}

window.App = { API, setStatus, fmtTime };
