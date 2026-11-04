/* «Кругосветка»: экран игры. Опрашивает сервер раз в пару секунд и перерисовывает
   табло вылетов, игроков, события и глобус. Игровое время между опросами
   досчитывается в браузере, чтобы часы и самолёты двигались плавно. */
(function () {
  "use strict";

  const root = document.getElementById("game");
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const AIRPORTS = Object.fromEntries(
    JSON.parse($("game-airports").textContent).map((a) => [a.code, a])
  );
  const CONTINENTS = { EU: "Европа", AS: "Азия", AF: "Африка", NA: "Сев. Америка", SA: "Юж. Америка", OC: "Океания" };
  const csrf = root.querySelector("[name=csrfmiddlewaretoken]").value;
  const POLL_MS = 2500;
  const START_HOUR = 6; // игра начинается в 06:00 первого дня

  let state = null;
  let stateAt = 0;
  let globe = null;
  let filterTo = null; // выбранный на глобусе город
  let busy = false;
  let boardKey = null;
  let pendingKey = null;

  function tickCountdowns() {
    const now = clockNow();
    root.querySelectorAll("[data-dep]").forEach((el) => {
      const left = Math.max(0, Number(el.dataset.dep) - now);
      el.textContent = el.dataset.short ? fmtShort(left) : fmtIn(left);
    });
  }

  // ---------- helpers ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const point = (code) => [AIRPORTS[code].lon, AIRPORTS[code].lat];
  const city = (code) => (AIRPORTS[code] ? AIRPORTS[code].city : code);

  function clockNow() {
    if (!state) return 0;
    if (state.status !== "running") return state.clock;
    const h = state.clock + ((performance.now() - stateAt) / 60000) * state.speed;
    return Math.min(h, state.duration);
  }
  function fmtTime(gh) {
    const abs = gh + START_HOUR;
    const day = Math.floor(abs / 24) + 1;
    const hh = Math.floor(abs % 24);
    const mm = Math.floor(((abs % 1) * 60) / 15) * 15;
    return { day, time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
  }
  function fmtDur(hours) {
    const h = Math.floor(hours), m = Math.round((hours - h) * 60);
    return m ? `${h} ч ${m} мин` : `${h} ч`;
  }
  function fmtShort(hours) {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} мин`;
    const q = Math.round(hours * 4) / 4, h = Math.floor(q), m = Math.round((q - h) * 60);
    return m ? `${h}ч ${m}м` : `${h} ч`;
  }
  function fmtIn(hours) {
    if (hours < 1) return `через ${Math.max(1, Math.round(hours * 60))} мин`;
    return `через ${fmtDur(Math.round(hours * 4) / 4)}`;
  }

  let toastTimer = null;
  function toast(text, bad) {
    const t = $("toast");
    t.textContent = text;
    t.className = "toast is-shown" + (bad ? " toast--bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = "toast"), 3200);
  }

  async function post(url) {
    if (busy) return null;
    busy = true;
    try {
      const r = await fetch(url, { method: "POST", headers: { "X-CSRFToken": csrf } });
      const data = await r.json().catch(() => ({ ok: false, error: "Ошибка сервера" }));
      if (data.ok) toast(data.message || "Готово");
      else toast(data.error || "Не получилось", true);
      await poll();
      return data;
    } finally {
      busy = false;
    }
  }

  // ---------- render ----------
  function me() {
    return state && state.me ? state.players.find((p) => p.id === state.me.id) : null;
  }

  function renderClock() {
    const now = clockNow();
    const t = fmtTime(now);
    $("clock-day").textContent = state.status === "lobby" ? "До старта" : `День ${t.day}`;
    $("clock-time").textContent = state.status === "lobby" ? "06:00" : t.time;
    $("clock-bar").style.width = `${(now / state.duration) * 100}%`;
  }

  function renderPlayers() {
    const list = $("players");
    list.replaceChildren(
      ...state.players.map((p) => {
        const where = p.flight
          ? `летит ${p.flight.from} → ${p.flight.to}`
          : `${city(p.at)} (${p.at})`;
        return h("li", { class: state.me && p.id === state.me.id ? "is-me" : "" },
          h("i", { class: "dot", style: `background:${p.color}` }),
          h("span", { class: "players__name" }, p.name, p.host ? h("small", {}, " · создатель") : null),
          h("span", { class: "players__where muted" }, state.status === "lobby" ? "готов" : where),
          h("b", { class: "players__score" }, p.score),
        );
      })
    );
  }

  function renderEvents() {
    $("events").replaceChildren(
      ...state.events.map((e) => {
        const t = fmtTime(e.h);
        return h("li", {}, h("span", { class: "mono muted" }, `Д${t.day} ${t.time}`), " ", e.text);
      })
    );
  }

  function renderMe() {
    const p = me();
    $("my-stats").hidden = !p || state.status === "lobby";
    if (!p) return;
    $("my-score").textContent = p.score;
    $("my-airports").textContent = p.airports;
    $("my-continents").textContent = `${p.continents} / 6`;
    $("my-money").textContent = `$${p.money}`;
  }

  function renderWhere() {
    const p = me();
    const el = $("where");
    if (state.status === "lobby") { el.textContent = `Старт: ${city(state.start)} (${state.start})`; return; }
    if (!p) { el.textContent = "Вы наблюдаете за игрой"; return; }
    if (p.flight) {
      const left = p.flight.arr - clockNow();
      el.textContent = `В полёте → ${city(p.flight.to)} · посадка ${fmtIn(Math.max(0, left))}`;
    } else {
      el.textContent = `Вы в аэропорту ${city(p.at)} (${p.at})`;
    }
  }

  function renderPending() {
    const box = $("pending");
    const pend = state.me && state.me.pending;
    box.hidden = !pend || state.status !== "running";
    if (box.hidden) { pendingKey = null; return; }
    const key = JSON.stringify(pend);
    if (key === pendingKey) { tickCountdowns(); return; }
    pendingKey = key;
    const t = fmtTime(pend.dep);
    box.replaceChildren(
      h("div", { class: "ticket__label" }, "Ваш следующий рейс"),
      h("div", { class: "ticket__route mono" }, `${pend.from} → ${pend.to}`),
      h("div", {}, `${city(pend.to)} · ${pend.number} · вылет: день ${t.day}, ${t.time} (`,
        h("span", { "data-dep": pend.dep }, fmtIn(pend.dep - clockNow())), ")"),
      h("button", { class: "btn btn--ghost btn--wide", type: "button", onclick: () => post(root.dataset.cancelUrl) },
        `Сдать билет (вернут $${pend.refund})`),
    );
  }

  function renderBoard() {
    const panel = $("board-panel");
    const running = state.status === "running" && state.me;
    panel.hidden = !running;
    if (!running) return;
    const from = state.me.from;
    const filterBtn = $("board-filter");
    if (!from) {
      boardKey = null;
      $("board-title").textContent = "Вылеты";
      $("board").replaceChildren(h("li", { class: "board__empty muted" }, "У вас уже есть билет. Слетайте или сдайте его, чтобы выбрать другой рейс."));
      filterBtn.hidden = true;
      return;
    }
    const p = me();
    $("board-title").textContent = p && p.flight ? `Пересадка: ${city(from)}` : `Вылеты: ${city(from)}`;
    let rows = state.departures;
    filterBtn.hidden = !filterTo;
    if (filterTo) {
      rows = rows.filter((d) => d.to === filterTo);
      filterBtn.textContent = `Только → ${city(filterTo)} ✕`;
    }
    const now = clockNow();
    const key = JSON.stringify([rows, from, filterTo, p && p.money, p && p.visited]);
    if (key === boardKey) {
      tickCountdowns();
      return;
    }
    boardKey = key;
    const visitedContinents = new Set((p ? p.visited : []).map((c) => AIRPORTS[c] && AIRPORTS[c].continent));
    if (!rows.length) {
      boardKey = null;
      $("board").replaceChildren(h("li", { class: "board__empty muted" },
        filterTo ? `Ближайших рейсов → ${city(filterTo)} нет, попробуйте с пересадкой.` : "Ближайших рейсов нет."));
      return;
    }
    $("board").replaceChildren(
      ...rows.map((d) => {
        const t = fmtTime(d.dep);
        const soldOut = d.seats_left === 0;
        const tooPoor = p && p.money < d.price;
        const newContinent = !visitedContinents.has(d.continent);
        const seats = [];
        for (let i = 0; i < d.seats; i++) {
          const c = d.riders[i];
          seats.push(h("i", { class: "seat-pip" + (c ? " is-taken" : ""), style: c ? `background:${c}` : null }));
        }
        return h("li", { class: "board__row" + (soldOut ? " is-sold" : "") + (d.dep - now < 1 ? " is-soon" : "") },
          h("div", { class: "board__time" }, h("b", { class: "mono" }, t.time),
            h("small", { class: "muted" }, "через ", h("span", { "data-dep": d.dep, "data-short": 1 }, fmtShort(d.dep - now)))),
          h("div", { class: "board__dest" },
            h("b", {}, h("span", { class: "mono" }, d.to), " ", d.city),
            h("small", { class: "muted" }, `${fmtDur(d.arr - d.dep)} · ${d.number}`),
            h("span", { class: "board__tags" },
              d.new ? h("em", { class: "tag tag--new" }, "+100 новый") : null,
              newContinent ? h("em", { class: "tag tag--cont" }, `+300 ${CONTINENTS[d.continent]}`) : null,
              d.to === state.start && !p.flight ? h("em", { class: "tag" }, "домой") : null),
          ),
          h("div", { class: "board__buy" },
            h("span", { class: "board__seats", title: `Свободно ${d.seats_left} из ${d.seats}` }, seats),
            h("button", {
              class: "btn btn--accent btn--sm", type: "button", disabled: soldOut || tooPoor,
              onclick: () => post(root.dataset.bookUrl.replace("/0/", `/${d.id}/`)),
            }, soldOut ? "Нет мест" : `$${d.price}`),
          ),
        );
      })
    );
  }

  function renderLobby() {
    $("lobby").hidden = state.status !== "lobby";
    const host = state.me && state.me.host;
    $("start-btn").hidden = !host;
    $("wait-host").hidden = host || !state.me;
  }

  function renderFinal() {
    const box = $("final");
    box.hidden = state.status !== "finished";
    if (box.hidden) return;
    $("podium").replaceChildren(
      ...state.players.map((p, i) =>
        h("li", {},
          h("span", { class: "podium__place" }, ["🥇", "🥈", "🥉"][i] || `${i + 1}.`),
          h("i", { class: "dot", style: `background:${p.color}` }),
          h("b", {}, p.name),
          h("span", { class: "muted" }, ` ${p.airports} аэроп. · ${p.continents} конт.${p.home_bonus ? " · вернулся домой" : ""}`),
          h("b", { class: "podium__score" }, p.score),
        ))
    );
  }

  function globeData() {
    const p = me();
    const visited = new Set(p ? p.visited : []);
    const reachable = new Set(state.departures.map((d) => d.to));
    const current = p && !p.flight ? p.at : null;
    const airports = Object.values(AIRPORTS).map((a) => ({
      code: a.code, lon: a.lon, lat: a.lat,
      kind: a.code === current ? "current" : visited.has(a.code) ? "visited" : reachable.has(a.code) ? "main" : "dim",
    }));
    const arcs = [];
    if (p) p.path.forEach((f) => arcs.push({ from: point(f.from), to: point(f.to), kind: "done", color: p.color }));
    if (state.me && state.me.from && state.status === "running") {
      for (const to of reachable) {
        arcs.push({ from: point(state.me.from), to: point(to), kind: to === filterTo ? "selected" : "option" });
      }
    }
    if (state.me && state.me.pending) {
      const f = state.me.pending;
      arcs.push({ from: point(f.from), to: point(f.to), kind: "selected" });
    }
    const planes = state.players.filter((x) => x.flight).map((x) => {
      const mine = p && x.id === p.id;
      return {
        from: point(x.flight.from), to: point(x.flight.to), mode: "timed",
        dep: x.flight.dep, arr: x.flight.arr, color: x.color, me: mine,
        size: mine ? 24 : 17, trail: mine ? "full" : "short", follow: mine,
      };
    });
    const center = current ? point(current) : !p ? point(state.start) : null;
    return {
      airports, arcs, planes,
      clock: { h: state.clock, speed: state.status === "running" ? state.speed : 0 },
      camera: center ? { mode: "focus", center } : { mode: "focus" },
    };
  }

  function render() {
    renderClock();
    renderLobby();
    renderMe();
    renderWhere();
    renderPending();
    renderBoard();
    renderPlayers();
    renderEvents();
    renderFinal();
    const data = globeData();
    if (!globe) globe = SkyGlobe.mount($("game-globe"), data);
    else globe.update(data);
  }

  // ---------- loop ----------
  let lastStatus = null;
  async function poll() {
    try {
      const r = await fetch(root.dataset.stateUrl, { headers: { Accept: "application/json" } });
      if (!r.ok) return;
      state = await r.json();
      stateAt = performance.now();
      if (lastStatus && lastStatus !== state.status) {
        toast(state.status === "running" ? "Поехали! Игра началась" : "Время вышло!");
      }
      lastStatus = state.status;
      render();
    } catch (e) {
      /* сеть моргнула — попробуем на следующем шаге */
    }
  }

  // Часы и «через N мин» тикают каждую секунду, данные — по опросу.
  setInterval(() => {
    if (!state) return;
    renderClock();
    renderWhere();
    if (state.status === "running") {
      renderBoard();
      renderPending();
    }
  }, 1000);
  setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });

  $("start-btn").addEventListener("click", () => post(root.dataset.startUrl));
  $("board-filter").addEventListener("click", () => { filterTo = null; render(); });
  $("game-globe").addEventListener("globe:airport", (e) => {
    if (!state || state.status !== "running") return;
    filterTo = filterTo === e.detail ? null : e.detail;
    if (filterTo && !state.departures.some((d) => d.to === filterTo)) {
      toast(`Отсюда нет прямых рейсов → ${city(filterTo)}`, true);
      filterTo = null;
    }
    render();
  });
  $("copy-link").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(e.currentTarget.dataset.url);
      toast("Ссылка скопирована — отправьте её друзьям");
    } catch (_) {
      toast(e.currentTarget.dataset.url);
    }
  });

  window.addEventListener("load", poll);
})();
