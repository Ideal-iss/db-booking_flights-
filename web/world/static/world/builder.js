/* Конструктор персонажа: используется при регистрации и в личном кабинете. */
(function () {
  "use strict";
  const A = window.SkyArt;
  const HAIR = { short: "Короткие", long: "Длинные", bun: "Пучок", spiky: "Ёжик", curly: "Кудри", bald: "Без волос" };
  const SLOTS = { hat: "Головной убор", glasses: "Очки", outfit: "Одежда", extra: "Аксессуар" };

  function preview(canvas, getAvatar) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function loop(ms) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = ms / 1000;
      const sc = Math.min(w, h) / 120;
      A.drawAvatar(ctx, getAvatar(), w / 2, h * 0.86, { scale: sc, phase: t, moving: Math.floor(t / 3) % 2 === 1 });
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function swatches(container, colors, key, av, onChange) {
    container.replaceChildren(...colors.map((c, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (av[key] === i ? " is-on" : "");
      b.style.background = c;
      b.setAttribute("aria-label", `${key} ${i + 1}`);
      b.addEventListener("click", () => { av[key] = i; onChange(); });
      return b;
    }));
  }

  document.querySelectorAll("[data-builder]").forEach((root) => {
    const input = root.dataset.target ? document.getElementById(root.dataset.target) : null;
    const initialEl = root.dataset.initial && document.getElementById(root.dataset.initial);
    let av = initialEl ? JSON.parse(initialEl.textContent) : {};
    if (input && input.value) { try { av = JSON.parse(input.value); } catch (_) {} }
    av = { skin: 1, hair: "short", hair_color: 0, top: 0, bottom: 0, ...av };
    if (!initialEl && !(input && input.value)) {
      // Случайный старт, чтобы все не выглядели одинаково
      av.skin = Math.floor(Math.random() * 6); av.hair_color = Math.floor(Math.random() * 7);
      av.top = Math.floor(Math.random() * 9); av.bottom = Math.floor(Math.random() * 7);
      av.hair = Object.keys(HAIR)[Math.floor(Math.random() * 5)];
    }
    const owned = root.dataset.items ? JSON.parse(document.getElementById(root.dataset.items).textContent) : [];

    preview(root.querySelector("canvas"), () => av);

    function render() {
      swatches(root.querySelector("[data-skin]"), A.PAL.skin, "skin", av, render);
      swatches(root.querySelector("[data-hair-color]"), A.PAL.hair, "hair_color", av, render);
      swatches(root.querySelector("[data-top]"), A.PAL.top, "top", av, render);
      swatches(root.querySelector("[data-bottom]"), A.PAL.bottom, "bottom", av, render);
      root.querySelector("[data-hair]").replaceChildren(...Object.entries(HAIR).map(([k, label]) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "chip" + (av.hair === k ? " is-on" : ""); b.textContent = label;
        b.addEventListener("click", () => { av.hair = k; render(); });
        return b;
      }));
      const itemsBox = root.querySelector("[data-items]");
      if (itemsBox) {
        const bySlot = {};
        owned.forEach((it) => (bySlot[it.slot] = bySlot[it.slot] || []).push(it));
        itemsBox.replaceChildren(...Object.entries(SLOTS).filter(([s]) => bySlot[s]).map(([slot, label]) => {
          const row = document.createElement("div");
          row.className = "builder__row";
          const title = document.createElement("span"); title.textContent = label; row.append(title);
          const wrap = document.createElement("div"); wrap.className = "chips";
          [{ code: "", name: "Нет" }, ...bySlot[slot]].forEach((it) => {
            const b = document.createElement("button");
            b.type = "button"; b.className = "chip" + ((av[slot] || "") === it.code ? " is-on" : ""); b.textContent = it.name;
            b.addEventListener("click", () => { if (it.code) av[slot] = it.code; else delete av[slot]; render(); });
            wrap.append(b);
          });
          row.append(wrap);
          return row;
        }));
        if (!itemsBox.children.length) itemsBox.innerHTML = '<p class="muted small">Вещи из магазина появятся здесь после покупки.</p>';
      }
      if (input) input.value = JSON.stringify(av);
    }
    render();

    const save = root.querySelector("[data-save]");
    if (save) {
      save.addEventListener("click", async () => {
        const csrf = document.querySelector("[name=csrfmiddlewaretoken]").value;
        const r = await fetch(root.dataset.saveUrl, {
          method: "POST", headers: { "X-CSRFToken": csrf, "Content-Type": "application/json" }, body: JSON.stringify(av),
        });
        const d = await r.json();
        save.textContent = d.ok ? "Сохранено ✓" : "Ошибка";
        setTimeout(() => (save.textContent = "Сохранить персонажа"), 1800);
      });
    }
  });

  // Маленькие аватары в списках (кабинет, магазин): <canvas data-avatar='{...}'>
  document.querySelectorAll("canvas[data-avatar]").forEach((c) => {
    const av = JSON.parse(c.dataset.avatar);
    preview(c, () => av);
  });
})();
