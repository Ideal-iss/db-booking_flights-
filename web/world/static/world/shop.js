/* Магазин: превью вещи на своём персонаже, покупка и надевание. */
(function () {
  "use strict";
  const A = window.SkyArt;
  const root = document.getElementById("shop");
  const csrf = root.querySelector("[name=csrfmiddlewaretoken]").value;
  let avatar = JSON.parse(document.getElementById("avatar-data").textContent);
  const owned = new Set(JSON.parse(document.getElementById("owned-data").textContent));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function toast(text, bad) {
    const t = document.getElementById("toast");
    t.textContent = text; t.className = "toast is-shown" + (bad ? " toast--bad" : "");
    setTimeout(() => (t.className = "toast"), 2600);
  }
  async function post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  }

  const cards = [...root.querySelectorAll(".item")];
  function paintButtons() {
    cards.forEach((card) => {
      const btn = card.querySelector("button");
      const code = card.dataset.code, slot = card.dataset.slot;
      if (!owned.has(code)) { btn.textContent = `${card.dataset.price} 🪙`; btn.dataset.action = "buy"; btn.className = "btn btn--accent btn--sm"; }
      else if (avatar[slot] === code) { btn.textContent = "Надето ✓"; btn.dataset.action = "off"; btn.className = "btn btn--sm"; }
      else { btn.textContent = "Надеть"; btn.dataset.action = "on"; btn.className = "btn btn--sm"; }
    });
  }
  cards.forEach((card) => {
    card.querySelector("button").addEventListener("click", async (e) => {
      const code = card.dataset.code, slot = card.dataset.slot, action = e.currentTarget.dataset.action;
      let r;
      if (action === "buy") {
        r = await post(root.dataset.buyUrl, { code });
        if (r.ok) { owned.add(code); avatar = r.avatar; document.getElementById("coins-pill").textContent = `🪙 ${r.coins}`; toast(r.message); (r.events || []).forEach((ev) => toast(`${ev.icon} ${ev.title} +${ev.reward} 🪙`)); }
      } else {
        r = await post(root.dataset.equipUrl, { slot, code: action === "on" ? code : "" });
        if (r.ok) avatar = r.avatar;
      }
      if (!r.ok) toast(r.error, true);
      paintButtons();
    });
  });
  paintButtons();

  function loop(ms) {
    cards.forEach((card) => {
      const c = card.querySelector("canvas");
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const av = { ...avatar, [card.dataset.slot]: card.dataset.code };
      A.drawAvatar(ctx, av, w / 2, h * 0.9, { scale: h / 115, phase: ms / 1000 });
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
