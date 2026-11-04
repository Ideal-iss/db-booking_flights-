/* Мир SkyBook — игровой экран.
   Режимы: «территория» (гуляем по аэропорту) и «полёт» (салон самолёта).
   С сервером общаемся опросом (tick) раз в 1–2 секунды; движение других игроков
   плавно досчитывается в браузере между ответами. */
(function () {
  "use strict";

  const root = document.getElementById("world");
  if (!root) return;
  const A = window.SkyArt;
  const $ = (id) => document.getElementById(id);
  const canvas = $("scene");
  const ctx = canvas.getContext("2d");
  const URLS = JSON.parse($("world-urls").textContent);
  const csrf = root.querySelector("[name=csrfmiddlewaretoken]").value;
  const SPEED = 230; // пикселей в секунду
  const PICK_R = 46, STAMP_R = 120;

  let W = 0, H = 0, dpr = 1;
  let srvOffset = 0; // серверное время − время браузера, сек
  const now = () => Date.now() / 1000 + srvOffset;

  let tick = null; // последний ответ сервера
  let map = null; // карта текущего аэропорта
  let mode = "loading";
  const me = { x: 800, y: 520, facing: 1, moving: false, target: null, avatar: {}, nick: "" };
  const others = new Map(); // id -> {x, y, tx, ty, data}
  let coins = [];
  const picked = new Set();
  const bubbles = new Map(); // id игрока -> {text, until}
  let lastChatId = 0;
  const keys = new Set();
  let boardOpen = false;
  let t0 = performance.now();

  // ---------- сеть ----------
  async function api(name, body, method) {
    const opts = { method: method || (body ? "POST" : "GET"), headers: { "X-CSRFToken": csrf } };
    if (body) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
    const r = await fetch(URLS[name], opts);
    const data = await r.json().catch(() => ({ ok: false, error: "Ошибка сервера" }));
    if (r.status === 403) location.href = URLS.login;
    return data;
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  let toastTimer;
  function toast(text, bad) {
    const t = $("toast");
    t.textContent = text;
    t.className = "toast is-shown" + (bad ? " toast--bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = "toast"), 3000);
  }

  function notice(ev) {
    const card = h("div", { class: "notice" },
      h("span", { class: "notice__icon" }, ev.icon || "⭐"),
      h("div", {}, h("b", {}, ev.title), ev.fact ? h("small", {}, ev.fact) : null),
      ev.reward ? h("span", { class: "notice__reward" }, `+${ev.reward} 🪙`) : null);
    $("notices").append(card);
    setTimeout(() => card.classList.add("is-out"), ev.fact ? 7000 : 4500);
    setTimeout(() => card.remove(), ev.fact ? 7600 : 5100);
  }
  const notices = (list) => (list || []).forEach(notice);

  // ---------- размеры ----------
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  new ResizeObserver(resize).observe(canvas);

  // ---------- карта аэропорта ----------
  async function loadMap() {
    map = await api("map");
    coins = [];
    others.clear();
    $("hud-place").textContent = `${map.city} · ${map.code}`;
  }

  function blockedAt(x, y) {
    if (!map) return false;
    if (x < 16 || y < map.runway[3] + 12 || x > map.w - 16 || y > map.h - 12) return true;
    return map.blocked.some(([a, b, w, hh]) => x > a - 10 && x < a + w + 10 && y > b - 6 && y < b + hh + 8);
  }
  const inRect = (x, y, [a, b, w, hh], pad = 0) => x >= a - pad && x <= a + w + pad && y >= b - pad && y <= b + hh + pad;

  function camera() {
    const zoom = Math.max(0.62, Math.min(1.1, H / 640));
    const vw = W / zoom, vh = H / zoom;
    const cx = Math.max(vw / 2, Math.min(map.w - vw / 2, me.x));
    const cy = Math.max(vh / 2, Math.min(map.h - vh / 2, me.y - 40));
    return { zoom, x: (map.w < vw ? map.w / 2 : cx) - vw / 2, y: (map.h < vh ? map.h / 2 : cy) - vh / 2 };
  }

  // ---------- движение ----------
  function step(dt) {
    let dx = 0, dy = 0;
    if (keys.has("ArrowLeft") || keys.has("a")) dx -= 1;
    if (keys.has("ArrowRight") || keys.has("d")) dx += 1;
    if (keys.has("ArrowUp") || keys.has("w")) dy -= 1;
    if (keys.has("ArrowDown") || keys.has("s")) dy += 1;
    if (dx || dy) me.target = null;
    else if (me.target) {
      const tx = me.target.x - me.x, ty = me.target.y - me.y;
      const d = Math.hypot(tx, ty);
      if (d < 6) me.target = null; else { dx = tx / d; dy = ty / d; }
    }
    const len = Math.hypot(dx, dy);
    me.moving = len > 0;
    if (!len) return;
    dx /= len; dy /= len;
    const nx = me.x + dx * SPEED * dt, ny = me.y + dy * SPEED * dt;
    if (!blockedAt(nx, me.y)) me.x = nx; else if (me.target) me.target = null;
    if (!blockedAt(me.x, ny)) me.y = ny; else if (me.target) me.target = null;
    if (dx) me.facing = dx > 0 ? 1 : -1;
  }

  async function checkCoins() {
    for (const c of coins) {
      if (picked.has(c.i)) continue;
      if (Math.hypot(me.x - c.x, me.y - c.y) < PICK_R) {
        picked.add(c.i);
        sendTick(); // сначала сообщим серверу, где мы стоим
        const r = await api("coin", { i: c.i });
        if (r.ok) { toast(`+${r.value} 🪙`); $("hud-coins").textContent = Number($("hud-coins").textContent) + r.value; notices(r.events); }
      }
    }
  }

  // ---------- отрисовка территории ----------
  function drawTerritory(t) {
    const cam = camera();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b1730";
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, -cam.x * cam.zoom * dpr, -cam.y * cam.zoom * dpr);
    const P = map.palette;

    ctx.fillStyle = P.grass; ctx.fillRect(0, 0, map.w, map.h);
    ctx.fillStyle = "rgba(0,0,0,.04)";
    for (let x = 20; x < map.w; x += 46) for (let y = 180 + ((x / 46) % 2) * 20; y < map.h; y += 46) ctx.fillRect(x, y, 3, 3);

    // дорожки
    ctx.strokeStyle = P.path; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 62;
    const g = map.gate, gx = g[0] + g[2] / 2, gy = g[1] + g[3];
    const sz = map.shop_zone, lm = map.landmark;
    ctx.beginPath(); ctx.moveTo(gx, gy - 20); ctx.lineTo(gx, 560);
    ctx.lineTo(sz[0] + sz[2] / 2, 560); ctx.lineTo(sz[0] + sz[2] / 2, sz[1] + sz[3] / 2);
    ctx.moveTo(gx, 560); ctx.lineTo(lm.x, 560); ctx.lineTo(lm.x, lm.y + 30); ctx.stroke();
    ctx.fillStyle = P.path; ctx.beginPath(); ctx.arc(gx, 540, 90, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.06)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(gx, 540, 60, 0, 2 * Math.PI); ctx.stroke();

    // пруд
    if (map.pond) {
      const [px, py, pw, ph] = map.pond;
      ctx.fillStyle = P.water; ctx.beginPath(); ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.3 + i / 3) % 1);
        ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(px + pw * (0.3 + i * 0.2), py + ph / 2, 10 + k * 30, 4 + k * 10, 0, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // взлётная полоса
    const rw = map.runway;
    ctx.fillStyle = "#3d4451"; ctx.fillRect(rw[0], rw[1], rw[2], rw[3]);
    ctx.fillStyle = "#f8f9fa";
    for (let x = 20; x < map.w; x += 70) ctx.fillRect(x, rw[3] / 2 - 3, 38, 6);
    for (let x = 10; x < map.w; x += 40) {
      ctx.fillStyle = (Math.floor(t * 2) + x / 40) % 2 < 1 ? "#ffd23f" : "#6c757d";
      ctx.fillRect(x, 8, 5, 5); ctx.fillRect(x, rw[3] - 13, 5, 5);
    }
    const takeoff = ((t * 160) % (map.w + 600)) - 300;
    A.drawPlaneTop(ctx, takeoff, rw[3] / 2, 1.3);
    A.drawPlaneTop(ctx, gx + 260, rw[3] - 28, 1.1); // самолёт у гейта

    // терминал
    const tm = map.terminal;
    ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.fillRect(tm[0] + 8, tm[1] + 10, tm[2], tm[3]);
    const glass = ctx.createLinearGradient(0, tm[1], 0, tm[1] + tm[3]);
    glass.addColorStop(0, "#cfe8ff"); glass.addColorStop(1, "#7fb3e6");
    ctx.fillStyle = glass; ctx.fillRect(tm[0], tm[1], tm[2], tm[3]);
    ctx.fillStyle = "#e9eef5"; ctx.fillRect(tm[0] - 10, tm[1] - 14, tm[2] + 20, 22);
    ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 2;
    for (let x = tm[0] + 30; x < tm[0] + tm[2]; x += 40) { ctx.beginPath(); ctx.moveTo(x, tm[1] + 10); ctx.lineTo(x, tm[1] + tm[3]); ctx.stroke(); }
    ctx.fillStyle = "#1d3a6e"; A.rr(ctx, tm[0] + tm[2] / 2 - 170, tm[1] + 18, 340, 44, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = '800 22px "Manrope", sans-serif'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`${map.city.toUpperCase()} · ${map.code}`, tm[0] + tm[2] / 2, tm[1] + 41);
    ctx.fillStyle = "#334155"; ctx.fillRect(gx - 40, tm[1] + tm[3] - 50, 80, 50);
    ctx.fillStyle = "#94d2ff"; ctx.fillRect(gx - 36, tm[1] + tm[3] - 46, 34, 46); ctx.fillRect(gx + 2, tm[1] + tm[3] - 46, 34, 46);

    // выход на посадку
    const ready = tick && tick.status === "boarding";
    ctx.fillStyle = ready ? `rgba(255,90,31,${0.25 + 0.15 * Math.sin(t * 5)})` : "rgba(255,90,31,.16)";
    A.rr(ctx, g[0], g[1], g[2], g[3], 14); ctx.fill();
    ctx.setLineDash([8, 6]); ctx.strokeStyle = "#ff5a1f"; ctx.lineWidth = 2.5; A.rr(ctx, g[0], g[1], g[2], g[3], 14); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#c2410c"; ctx.font = '800 15px "Manrope", sans-serif';
    ctx.fillText("✈ ВЫХОД НА ПОСАДКУ", gx, g[1] + g[3] / 2);

    // магазин
    const sh = map.shop;
    ctx.fillStyle = "#fff4e6"; ctx.fillRect(sh[0], sh[1], sh[2], sh[3]);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? "#fff" : "#ff5a1f"; ctx.fillRect(sh[0] - 6 + i * ((sh[2] + 12) / 6), sh[1] - 8, (sh[2] + 12) / 6, 26); }
    ctx.fillStyle = "#1d3a6e"; ctx.font = '800 17px "Manrope", sans-serif';
    ctx.fillText("🛍 МАГАЗИН", sh[0] + sh[2] / 2, sh[1] + 52);
    ctx.fillStyle = "#8ecae6"; ctx.fillRect(sh[0] + sh[2] / 2 - 18, sh[1] + sh[3] - 34, 36, 34);
    ctx.fillStyle = "rgba(255,90,31,.12)"; A.rr(ctx, sz[0], sz[1], sz[2], sz[3], 12); ctx.fill();

    // скамейки
    map.benches.forEach(([bx, by, bw, bh]) => {
      ctx.fillStyle = "#8d6e63"; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = "#6d4c41"; ctx.fillRect(bx, by - 6, bw, 5);
    });

    // достопримечательность
    const L = map.landmark;
    if (!L.stamped) {
      ctx.setLineDash([10, 8]); ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(t * 3)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(L.x, L.y + 10, STAMP_R, STAMP_R * 0.45, 0, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    }

    // объекты по глубине: деревья, монеты, люди, достопримечательность
    const items = [];
    map.trees.forEach(([tx, ty, tw]) => items.push({ y: ty + tw, draw: () => drawTree(tx + tw / 2, ty + tw, t) }));
    items.push({ y: L.y, draw: () => {
      A.drawLandmark(ctx, L.kind, L.x, L.y, t, 1);
      ctx.fillStyle = "rgba(20,33,61,.85)"; ctx.font = '700 14px "Manrope", sans-serif';
      const w = ctx.measureText(L.name).width + 20;
      A.rr(ctx, L.x - w / 2, L.y + 22, w, 26, 13); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText((L.stamped ? "✅ " : "📸 ") + L.name, L.x, L.y + 35);
    } });
    coins.forEach((c) => {
      if (picked.has(c.i)) return;
      items.push({ y: c.y, draw: () => drawCoin(c, t) });
    });
    others.forEach((o) => items.push({ y: o.y, draw: () => drawPerson(o.data, o.x, o.y, t, false) }));
    items.push({ y: me.y, draw: () => drawPerson({ ...tick.me, id: tick.me.id, facing: me.facing, moving: me.moving, emote: myEmote() }, me.x, me.y, t, true) });
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());

    // цель клика
    if (me.target) {
      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(me.target.x, me.target.y, 12 + Math.sin(t * 8) * 2, 5, 0, 0, 2 * Math.PI); ctx.stroke();
    }
  }

  function drawTree(x, y, t) {
    ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.beginPath(); ctx.ellipse(x, y, 20, 6, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#6b4f3a"; ctx.fillRect(x - 4, y - 26, 8, 26);
    const sway = Math.sin(t * 1.5 + x) * 1.5;
    ctx.fillStyle = "#3a8f4b"; ctx.beginPath(); ctx.arc(x + sway, y - 44, 24, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = "#4fae5f"; ctx.beginPath(); ctx.arc(x - 8 + sway, y - 52, 14, 0, 2 * Math.PI); ctx.fill();
  }

  function drawCoin(c, t) {
    const w = Math.abs(Math.cos(t * 3 + c.i)) * 11 + 2;
    const yy = c.y - 18 - Math.sin(t * 4 + c.i) * 3;
    ctx.fillStyle = "rgba(0,0,0,.15)"; ctx.beginPath(); ctx.ellipse(c.x, c.y, 10, 3.5, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = c.v >= 10 ? "#ff9f1c" : "#ffd23f"; ctx.beginPath(); ctx.ellipse(c.x, yy, w, 13, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = "#e0a100"; ctx.lineWidth = 2; ctx.stroke();
  }

  function drawPerson(p, x, y, t, isMe) {
    A.drawAvatar(ctx, p.avatar, x, y, { facing: p.facing, moving: p.moving, phase: t + (p.id || 0) });
    A.drawName(ctx, x, y + 6, p.nick, isMe);
    const b = bubbles.get(p.id);
    if (p.emote) {
      ctx.font = "30px sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.emote, x, y - 92 - Math.sin(t * 6) * 3);
    } else if (b && b.until > performance.now()) {
      A.drawBubble(ctx, x, y - 78, b.text);
    }
  }

  // ---------- салон самолёта ----------
  const clouds = Array.from({ length: 14 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), v: 0.04 + Math.random() * 0.06, k: i }));
  const fields = Array.from({ length: 18 }, () => ({ x: Math.random(), y: Math.random(), w: 0.05 + Math.random() * 0.12, h: 0.04 + Math.random() * 0.1, c: ["#7fb069", "#a7c957", "#d4a373", "#6a994e", "#bc6c25"][Math.floor(Math.random() * 5)] }));

  function drawCabin(t) {
    const trip = tick.trip;
    const p = Math.max(0, Math.min(1, (now() - trip.dep) / (trip.arr - trip.dep)));
    const altitude = Math.min(1, p / 0.12, (1 - p) / 0.12); // 0 на земле, 1 на эшелоне
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // земля далеко внизу
    const ground = ctx.createLinearGradient(0, 0, 0, H);
    ground.addColorStop(0, altitude > 0.5 ? "#4f8fc9" : "#6a994e"); ground.addColorStop(1, altitude > 0.5 ? "#2a6fb0" : "#588157");
    ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
    const drift = t * (0.02 + 0.03 * altitude);
    fields.forEach((f) => {
      const x = (((f.x - drift) % 1) + 1) % 1;
      ctx.globalAlpha = 0.35 + 0.4 * (1 - altitude);
      ctx.fillStyle = f.c; ctx.fillRect(x * W * 1.2 - W * 0.1, f.y * H, f.w * W * (1.6 - altitude * 0.6), f.h * H);
    });
    ctx.globalAlpha = 1;
    if (altitude < 1) { // взлётная полоса при взлёте и посадке
      ctx.globalAlpha = 1 - altitude;
      const rx = p < 0.5 ? W * (0.5 - p * 6) : W * (1.5 - (p - 0.88) * 8);
      ctx.fillStyle = "#3d4451"; ctx.fillRect(rx - W, H * 0.42, W * 2, H * 0.16);
      ctx.fillStyle = "#fff"; for (let x = rx - W; x < rx + W; x += 80) ctx.fillRect(x, H * 0.5 - 3, 40, 6);
      ctx.globalAlpha = 1;
    }
    // облака под самолётом
    clouds.forEach((c) => {
      const x = ((((c.x - t * c.v * (0.3 + altitude)) % 1.3) + 1.3) % 1.3) * W - W * 0.15;
      ctx.globalAlpha = 0.25 + 0.55 * altitude;
      ctx.fillStyle = "#fff";
      const r = 40 * c.s;
      ctx.beginPath(); ctx.arc(x, c.y * H, r, 0, 2 * Math.PI); ctx.arc(x + r, c.y * H + 6, r * 0.8, 0, 2 * Math.PI); ctx.arc(x - r * 0.9, c.y * H + 8, r * 0.7, 0, 2 * Math.PI); ctx.fill();
    });
    ctx.globalAlpha = 1;

    // самолёт сверху, без крыши
    // На узком экране приближаем салон: нос и хвост уходят за край, кресла крупнее.
    const S = W < 700 ? (W * 0.98) / 860 : Math.min(W * 0.92, 1100) / 1100;
    const cx = W / 2, cy = H / 2 + Math.sin(t * 1.3) * 3 * altitude;
    const tilt = p < 0.12 ? -0.04 * altitude : p > 0.88 ? 0.03 * (1 - altitude) : Math.sin(t * 0.7) * 0.006;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt); ctx.scale(S, S);
    // тень
    ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.1 * (1 - altitude)})`;
    ctx.save(); ctx.translate(40 + 120 * altitude, 60 + 160 * altitude); drawAirframe(true); ctx.restore();
    drawAirframe(false);
    // кресла
    const rows = 6, rowW = 92, startX = -300;
    const ys = [-96, -54, 54, 96];
    const bySeat = new Map(tick.cabin.map((c) => [c.seat, c]));
    const seated = [];
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < 4; k++) {
        const seat = r * 4 + k, sx = startX + r * rowW, sy = ys[k];
        ctx.fillStyle = "#355c9a"; A.rr(ctx, sx - 24, sy - 22, 48, 44, 9); ctx.fill();
        ctx.fillStyle = "#2a4a80"; A.rr(ctx, sx - 30, sy - 22, 12, 44, 5); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.12)"; A.rr(ctx, sx - 16, sy - 16, 34, 32, 7); ctx.fill();
        const pax = bySeat.get(seat);
        if (pax) seated.push({ pax, sx, sy, seat });
        else {
          ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.font = '700 11px "JetBrains Mono", monospace'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(`${r + 1}${"ABCD"[k]}`, sx + 2, sy);
        }
      }
    }
    // Пассажиры поверх всех кресел, подписи и реплики — поверх пассажиров
    seated.forEach(({ pax, sx, sy, seat }) => A.drawAvatar(ctx, pax.avatar, sx + 2, sy + 30, { scale: 0.78, sitting: true, phase: t + seat }));
    seated.forEach(({ pax, sx, sy }) => {
      A.drawName(ctx, sx + 2, sy + 22, pax.nick, pax.id === tick.me.id);
      const b = bubbles.get(pax.id);
      if (pax.emote) { ctx.font = "28px sans-serif"; ctx.textAlign = "center"; ctx.fillText(pax.emote, sx + 2, sy - 52); }
      else if (b && b.until > performance.now()) A.drawBubble(ctx, sx + 2, sy - 40, b.text);
    });
    ctx.restore();

    // приборы
    const left = Math.max(0, trip.arr - now());
    $("cabin-route").textContent = `${trip.number} · ${trip.from_city} → ${trip.to_city}`;
    $("cabin-left").textContent = left > 0 ? `до посадки ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` : "Посадка…";
    $("cabin-alt").textContent = `${Math.round(altitude * 11000).toLocaleString("ru")} м · ${Math.round(250 + altitude * 650)} км/ч`;
    $("cabin-bar").style.width = `${p * 100}%`;
  }

  function drawAirframe(shadow) {
    const c = shadow ? null : "#f3f5f9";
    if (c) ctx.fillStyle = "#e3e8ef";
    // крылья
    ctx.beginPath(); ctx.moveTo(-60, -130); ctx.lineTo(-170, -430); ctx.lineTo(-90, -430); ctx.lineTo(120, -130); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-60, 130); ctx.lineTo(-170, 430); ctx.lineTo(-90, 430); ctx.lineTo(120, 130); ctx.closePath(); ctx.fill();
    // хвост
    ctx.beginPath(); ctx.moveTo(-430, -40); ctx.lineTo(-520, -210); ctx.lineTo(-470, -210); ctx.lineTo(-380, -40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-430, 40); ctx.lineTo(-520, 210); ctx.lineTo(-470, 210); ctx.lineTo(-380, 40); ctx.fill();
    if (!shadow) {
      ctx.fillStyle = "#c9d2de";
      ctx.beginPath(); ctx.ellipse(-20, -290, 26, 12, -0.3, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-20, 290, 26, 12, 0.3, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = "#f3f5f9";
    }
    // фюзеляж
    ctx.beginPath();
    ctx.moveTo(-520, -40); ctx.quadraticCurveTo(-520, -150, -360, -150); ctx.lineTo(380, -150);
    ctx.quadraticCurveTo(560, -150, 560, 0); ctx.quadraticCurveTo(560, 150, 380, 150);
    ctx.lineTo(-360, 150); ctx.quadraticCurveTo(-520, 150, -520, 40); ctx.closePath();
    ctx.fill();
    if (shadow) return;
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 3; ctx.stroke();
    // пол салона
    ctx.fillStyle = "#e9edf3"; A.rr(ctx, -380, -128, 830, 256, 30); ctx.fill();
    ctx.fillStyle = "#c0392b"; ctx.fillRect(-370, -12, 810, 24); // ковровая дорожка
    ctx.fillStyle = "rgba(255,255,255,.2)"; for (let x = -360; x < 440; x += 30) ctx.fillRect(x, -2, 14, 4);
    // кабина пилотов и окна
    ctx.fillStyle = "#1d3a6e"; ctx.beginPath(); ctx.ellipse(500, 0, 40, 70, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = "#94d2ff"; ctx.beginPath(); ctx.ellipse(520, 0, 18, 46, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
    ctx.fillStyle = "#b8c4d6";
    for (let x = -350; x < 420; x += 46) { A.rr(ctx, x, -146, 22, 10, 5); ctx.fill(); A.rr(ctx, x, 136, 22, 10, 5); ctx.fill(); }
    ctx.fillStyle = "#ff5a1f"; ctx.fillRect(-470, -6, 50, 12);
    ctx.fillStyle = "#cbd5e1"; ctx.fillRect(-395, -100, 10, 200); ctx.fillRect(440, -100, 10, 200); // перегородки
  }

  // ---------- главный цикл ----------
  let last = performance.now();
  function frame(nowMs) {
    const dt = Math.min(0.05, (nowMs - last) / 1000);
    last = nowMs;
    const t = (nowMs - t0) / 1000;
    if (tick && mode === "ground" && map) {
      step(dt);
      others.forEach((o) => { o.x += (o.tx - o.x) * Math.min(1, dt * 6); o.y += (o.ty - o.y) * Math.min(1, dt * 6); });
      drawTerritory(t);
      zones();
      checkCoins();
    } else if (tick && mode === "flying" && tick.trip) {
      drawCabin(t);
      if (now() >= tick.trip.arr + 0.5 && !landingAsked) { landingAsked = true; sendTick(); }
    }
    renderTicket();
    requestAnimationFrame(frame);
  }
  let landingAsked = false;

  // ---------- зоны и кнопки действий ----------
  let zoneState = "";
  function zones() {
    const atGate = inRect(me.x, me.y, map.gate, 40);
    const L = map.landmark;
    const nearLm = !L.stamped && Math.hypot(me.x - L.x, me.y - L.y) < STAMP_R;
    const atShop = inRect(me.x, me.y, map.shop_zone, 30);
    const key = `${atGate}|${nearLm}|${atShop}`;
    if (key === zoneState) return;
    zoneState = key;
    $("act-photo").hidden = !nearLm;
    $("act-shop").hidden = !atShop;
    $("act-board").classList.toggle("is-hot", atGate);
    if (atGate && !boardOpen && !(tick && tick.trip)) openBoard();
    if (!atGate && boardOpen && !(tick && tick.trip)) $("board-hint").hidden = false;
    if (atGate) $("board-hint").hidden = true;
  }

  // ---------- табло вылетов ----------
  let boardTimer = null;
  async function refreshBoard() {
    const r = await api("departures");
    if (!r.ok) return;
    const list = $("board-list");
    const t = now();
    if (!r.departures.length) { list.replaceChildren(h("li", { class: "muted" }, "Ближайших вылетов нет.")); return; }
    list.replaceChildren(...r.departures.map((d) => {
      const left = d.dep - t;
      return h("li", { class: "dep" },
        h("div", { class: "dep__time" }, h("b", { class: "mono", "data-dep": d.dep }, fmtLeft(left)), h("small", {}, d.number)),
        h("div", { class: "dep__to" },
          h("b", {}, h("span", { class: "mono" }, d.to), ` ${d.city}`),
          h("small", {}, `${d.km.toLocaleString("ru")} км · полёт ${Math.round(d.duration / 6) / 10} мин · ${d.taken}/${d.seats} мест`),
          d.new ? h("em", { class: "tag tag--new" }, "новый аэропорт") : null,
          d.riders.length ? h("small", { class: "dep__riders" }, `👥 ${d.riders.join(", ")}`) : null),
        h("button", { class: "btn btn--accent btn--sm", type: "button", onclick: () => doBoard(d) }, `${d.price} 🪙`));
    }));
  }
  function fmtLeft(s) {
    if (s <= 0) return "вылет";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }
  function openBoard() {
    boardOpen = true;
    $("board").hidden = false;
    refreshBoard();
    clearInterval(boardTimer);
    boardTimer = setInterval(() => { if (boardOpen) refreshBoard(); }, 5000);
  }
  function closeBoard() { boardOpen = false; $("board").hidden = true; clearInterval(boardTimer); }
  async function doBoard(d) {
    await sendTick();
    const r = await api("board", { route: d.route, dep: d.dep });
    if (r.ok) { toast(r.message); closeBoard(); sendTick(); } else toast(r.error, true);
  }
  setInterval(() => {
    document.querySelectorAll("[data-dep]").forEach((el) => { el.textContent = fmtLeft(Number(el.dataset.dep) - now()); });
  }, 500);

  // ---------- билет ----------
  function renderTicket() {
    const box = $("ticket");
    const trip = tick && tick.trip;
    const show = trip && tick.status === "boarding";
    box.hidden = !show;
    if (!show) return;
    const left = trip.dep - now();
    $("ticket-text").textContent = `${trip.number} → ${trip.to_city} · место ${trip.seat + 1}`;
    $("ticket-left").textContent = left > 0 ? `вылет через ${fmtLeft(left)}` : "посадка…";
  }

  // ---------- режимы ----------
  async function setMode(next) {
    if (next === mode) return;
    mode = next;
    root.dataset.mode = next;
    if (next === "flying") {
      closeBoard();
      landingAsked = false;
      cabinGlobe();
    }
  }

  let miniGlobe = null;
  function cabinGlobe() {
    const tr = tick.trip;
    const data = {
      airports: [{ code: tr.from, lon: tr.from_pt[0], lat: tr.from_pt[1], kind: "visited" }, { code: tr.to, lon: tr.to_pt[0], lat: tr.to_pt[1], kind: "main" }],
      arcs: [{ from: tr.from_pt, to: tr.to_pt, kind: "route" }],
      planes: [{ from: tr.from_pt, to: tr.to_pt, mode: "timed", dep: tr.dep, arr: tr.arr, trail: "full", size: 20, follow: true, me: true }],
      clock: { h: now(), speed: 60 },
      camera: { mode: "follow" },
    };
    if (!miniGlobe) miniGlobe = SkyGlobe.mount($("mini-globe"), data); else miniGlobe.update(data);
  }

  // ---------- tick ----------
  let sending = false;
  async function sendTick() {
    if (sending) return;
    sending = true;
    try {
      const prevAirport = tick && tick.me.airport;
      const data = await api("tick", { pos: { x: Math.round(me.x), y: Math.round(me.y), facing: me.facing, moving: me.moving } });
      if (!data || data.ok === false) return;
      srvOffset = data.now - Date.now() / 1000;
      const first = !tick;
      tick = data;
      $("hud-coins").textContent = data.me.coins;
      $("hud-online").textContent = data.online;
      me.nick = data.me.nick; me.avatar = data.me.avatar;

      if (data.status === "flying") {
        await setMode("flying");
      } else {
        if (first || data.me.airport !== prevAirport || !map) {
          await loadMap();
          me.x = data.me.x; me.y = data.me.y; me.target = null;
          if (!first) arrive();
        }
        await setMode("ground");
        coins = (data.coins || []).filter((c) => !picked.has(c.i));
        const seen = new Set();
        for (const o of data.others) {
          seen.add(o.id);
          const cur = others.get(o.id);
          if (cur) { cur.tx = o.x; cur.ty = o.y; cur.data = o; } else others.set(o.id, { x: o.x, y: o.y, tx: o.x, ty: o.y, data: o });
        }
        for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id);
      }
      notices(data.events);
      renderChat(data.chat);
    } finally {
      sending = false;
    }
  }

  function arrive() {
    picked.clear();
    const s = $("arrival");
    $("arrival-city").textContent = map.city;
    $("arrival-sub").textContent = `${map.airport_name} · ${map.code}`;
    s.hidden = false;
    s.classList.remove("is-out");
    setTimeout(() => s.classList.add("is-out"), 2600);
    setTimeout(() => (s.hidden = true), 3200);
  }

  function myEmote() {
    return myEmoteUntil > performance.now() ? myEmoteVal : "";
  }
  let myEmoteVal = "", myEmoteUntil = 0;

  // ---------- чат ----------
  function renderChat(list) {
    const box = $("chat-log");
    for (const m of list || []) {
      if (m.id <= lastChatId) continue;
      lastChatId = m.id;
      box.append(h("li", {}, h("b", {}, m.nick + ": "), m.text));
      if (now() - m.at < 8) bubbles.set(m.pid, { text: m.text, until: performance.now() + 6000 });
    }
    while (box.children.length > 8) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
  }
  $("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("chat-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.blur();
    const r = await api("say", { text });
    if (!r.ok) toast(r.error, true); else { notices(r.events); sendTick(); }
  });
  document.querySelectorAll("[data-emote]").forEach((b) =>
    b.addEventListener("click", async () => {
      myEmoteVal = b.dataset.emote; myEmoteUntil = performance.now() + 4000;
      $("emotes").hidden = true;
      await api("emote", { emote: b.dataset.emote });
    }));
  $("emote-btn").addEventListener("click", () => ($("emotes").hidden = !$("emotes").hidden));

  // ---------- действия ----------
  $("act-board").addEventListener("click", () => (boardOpen ? closeBoard() : openBoard()));
  $("board-close").addEventListener("click", closeBoard);
  $("act-photo").addEventListener("click", async () => {
    await sendTick();
    const r = await api("stamp", {});
    if (r.ok) { map.landmark.stamped = true; zoneState = ""; notices(r.events); flash(); sendTick(); } else toast(r.error, true);
  });
  $("act-shop").addEventListener("click", () => (location.href = URLS.shop));
  $("ticket-cancel").addEventListener("click", async () => {
    const r = await api("cancel", {});
    toast(r.ok ? r.message : r.error, !r.ok);
    sendTick();
  });
  function flash() {
    const f = $("flash");
    f.hidden = false; f.classList.remove("is-on"); void f.offsetWidth; f.classList.add("is-on");
    setTimeout(() => (f.hidden = true), 700);
  }

  // ---------- карта мира ----------
  let worldGlobe = null;
  async function openWorld() {
    $("worldmap").hidden = false;
    const w = await api("world");
    const visited = w.airports.filter((a) => a.visited).length;
    $("world-count").textContent = `Посещено ${visited} из ${w.airports.length} аэропортов`;
    const cur = tick && tick.me.airport;
    const data = {
      airports: w.airports.map((a) => ({ code: a.code, lon: a.lon, lat: a.lat, kind: a.code === cur ? "current" : a.visited ? "visited" : "unvisited" })),
      arcs: [],
      planes: w.planes.map((p) => ({ from: p.from, to: p.to, mode: "timed", dep: p.dep, arr: p.arr, trail: "short", size: 16 })),
      clock: { h: w.now, speed: 60 },
      camera: { mode: "focus", center: (w.airports.find((a) => a.code === cur) || w.airports[0]) && [w.airports.find((a) => a.code === cur).lon, w.airports.find((a) => a.code === cur).lat] },
    };
    if (!worldGlobe) worldGlobe = SkyGlobe.mount($("world-globe"), data); else worldGlobe.update(data);
  }
  $("btn-world").addEventListener("click", openWorld);
  $("world-close").addEventListener("click", () => ($("worldmap").hidden = true));

  // ---------- ввод ----------
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d", "ц", "ф", "ы", "в"].includes(k)) {
      keys.add({ ц: "w", ф: "a", ы: "s", в: "d" }[k] || k);
      e.preventDefault();
    }
    if (k === "Enter") { $("chat-input").focus(); e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete({ ц: "w", ф: "a", ы: "s", в: "d" }[k] || k);
  });
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "ground" || !map) return;
    const r = canvas.getBoundingClientRect();
    const cam = camera();
    me.target = { x: cam.x + (e.clientX - r.left) / cam.zoom, y: cam.y + (e.clientY - r.top) / cam.zoom };
  });

  // ---------- запуск ----------
  resize();
  sendTick().then(() => requestAnimationFrame(frame));
  // На земле — чаще (видно, как ходят другие), в полёте — реже, чтобы беречь сервер.
  let lastTickAt = 0;
  setInterval(() => {
    if (document.hidden) return;
    if (mode === "flying" && Date.now() - lastTickAt < 2500) return;
    lastTickAt = Date.now();
    sendTick();
  }, 1100);
})();
