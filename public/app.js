// public/app.js - CLEAN & SAFE
(() => {
  "use strict";

  function setStatus(el, msg = "") {
    if (!el) return;
    el.textContent = msg;
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "ERROR");
    return data;
  }

  const API = {
    login(username, password) {
      return post("/api/login", { username, password });
    }
  };

  window.App = { API, setStatus };
})();