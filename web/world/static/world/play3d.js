/* Мир SkyBook в 3D (Three.js).
   Режимы: «территория» — прогулка по аэропорту с камерой от третьего лица,
   «полёт» — салон самолёта с пассажирами или вид снаружи.
   С сервером общаемся опросом (tick) раз в 1–2,5 секунды; координаты на сервере —
   в «пикселях» карты (1600×1040), здесь они переводятся в метры. */
import * as THREE from "three";
import * as M from "sky/models";

const root = document.getElementById("world");
const $ = (id) => document.getElementById(id);
const URLS = JSON.parse($("world-urls").textContent);
const csrf = root.querySelector("[name=csrfmiddlewaretoken]").value;
const canvas = $("scene");

const S = 0.04; // метров в одном пикселе карты
const SPEED = 140; // пикселей в секунду ≈ 5,6 м/с
const PICK_R = 46, STAMP_R = 120;
const isTouch = matchMedia("(pointer: coarse)").matches;

let srvOffset = 0;
const now = () => Date.now() / 1000 + srvOffset;

// ---------- состояние ----------
let tick = null;
let map = null;
let mode = "loading";
const me = { x: 800, y: 520, heading: Math.PI, moving: false, target: null };
const others = new Map(); // id -> {x, y, tx, ty, h, th, data, obj, key}
let coinsData = [];
const picked = new Set();
const bubbles = new Map(); // id -> {text, until}
let lastChatId = 0;
const keys = new Set();
let boardOpen = false;
let cabinView = "inside";
let myEmoteVal = "", myEmoteUntil = 0;

// ---------- рендер ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
const cam = { yaw: Math.PI, pitch: 0.38, dist: 7.5, target: new THREE.Vector3() };

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

const toWorld = (px, py) => new THREE.Vector3((px - (map ? map.w : 1600) / 2) * S, 0, (py - (map ? map.h : 1040) / 2) * S);

// ---------- сеть и интерфейс ----------
async function api(name, body) {
  const opts = { method: body ? "POST" : "GET", headers: { "X-CSRFToken": csrf } };
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

// =====================================================================
// Сцена территории аэропорта
// =====================================================================
const ground = { scene: null, avatar: null, myKey: "", coins: new Map(), landmark: null, landmarkRing: null, gate: null, planes: [], sun: null };

function avatarKey(av) { return JSON.stringify(av || {}); }

function makePerson(data, isMe) {
  const g = new THREE.Group();
  const body = M.buildAvatar(data.avatar);
  g.add(body);
  const label = M.makeLabel(data.nick, { bg: isMe ? "rgba(255,90,31,.92)" : "rgba(20,33,61,.8)", height: 0.34 });
  label.position.y = 2.25;
  g.add(label);
  g.userData = { body, label, bubble: null, bubbleText: "", emoji: null, emojiText: "" };
  return g;
}

function setOverhead(person, text, emoji) {
  const u = person.userData;
  if (emoji !== u.emojiText) {
    if (u.emoji) { person.remove(u.emoji); u.emoji.material.map.dispose(); u.emoji = null; }
    u.emojiText = emoji;
    if (emoji) {
      u.emoji = M.makeEmoji(emoji);
      u.emoji.scale.multiplyScalar(u.k || 1);
      u.emoji.position.y = u.k ? 2.0 : 2.95;
      person.add(u.emoji);
    }
  }
  const t = emoji ? "" : text;
  if (t !== u.bubbleText) {
    if (u.bubble) { person.remove(u.bubble); u.bubble.material.map.dispose(); u.bubble = null; }
    u.bubbleText = t;
    if (t) {
      u.bubble = M.makeBubble(t);
      u.bubble.scale.multiplyScalar(u.k || 1);
      u.bubble.position.y = u.k ? 1.8 : 2.5;
      person.add(u.bubble);
    }
  }
}

function bubbleFor(id) {
  const b = bubbles.get(id);
  return b && b.until > performance.now() ? b.text : "";
}

function buildGroundScene() {
  const scene = new THREE.Scene();
  const P = map.palette;
  scene.background = new THREE.Color("#9ed0ff");
  scene.fog = new THREE.Fog("#bfe0ff", 60, 170);
  const W = map.w * S, H = map.h * S;

  scene.add(new THREE.HemisphereLight("#dff1ff", "#5b7a3a", 0.9));
  const sun = new THREE.DirectionalLight("#fff4e0", 2.1);
  sun.position.set(-25, 45, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 35, bottom: -35, near: 1, far: 140 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  ground.sun = sun;

  // земля: газон внутри карты и пейзаж до горизонта
  const far = M.mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: new THREE.Color(P.grass).multiplyScalar(0.88), roughness: 1 }), { rx: -Math.PI / 2, y: -0.02 });
  scene.add(far);
  const lawn = M.mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: P.grass, roughness: 1 }), { rx: -Math.PI / 2 });
  scene.add(lawn);
  // дальние холмы
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = 120 + (i % 3) * 25;
    scene.add(M.mesh(new THREE.ConeGeometry(18 + (i % 4) * 6, 10 + (i % 5) * 4, 6), M.mat(i % 2 ? "#6f9e59" : "#5d8a4c"), { x: Math.cos(a) * r, y: 4, z: Math.sin(a) * r, shadow: false }));
  }

  const at = (px, py, y = 0) => { const v = toWorld(px, py); v.y = y; return v; };
  const rect = ([x, y, w, hh], height, color, yBase = 0, opts) => {
    const m = M.mesh(new THREE.BoxGeometry(w * S, height, hh * S), typeof color === "string" ? M.mat(color, opts) : color);
    m.position.copy(at(x + w / 2, y + hh / 2, yBase + height / 2));
    scene.add(m);
    return m;
  };

  // дорожки
  const pathMat = new THREE.MeshStandardMaterial({ color: P.path, roughness: 1 });
  const g = map.gate, gx = g[0] + g[2] / 2, gy = g[1] + g[3];
  const sz = map.shop_zone, lm = map.landmark;
  const strip = (x1, y1, x2, y2) => {
    const w = Math.abs(x2 - x1) + 62, hh = Math.abs(y2 - y1) + 62;
    const m = M.mesh(new THREE.PlaneGeometry(w * S, hh * S), pathMat, { rx: -Math.PI / 2, y: 0.01 });
    m.position.copy(at((x1 + x2) / 2, (y1 + y2) / 2, 0.01));
    m.castShadow = false;
    scene.add(m);
  };
  strip(gx, gy - 20, gx, 560);
  strip(gx, 560, sz[0] + sz[2] / 2, 560);
  strip(sz[0] + sz[2] / 2, 560, sz[0] + sz[2] / 2, sz[1] + sz[3] / 2);
  strip(gx, 560, lm.x, 560);
  strip(lm.x, 560, lm.x, lm.y + 30);
  const plaza = M.mesh(new THREE.CircleGeometry(90 * S, 32), pathMat, { rx: -Math.PI / 2 });
  plaza.position.copy(at(gx, 540, 0.015));
  scene.add(plaza);
  // фонтан на площади
  const fountain = new THREE.Group();
  const fr = map.fountain;
  fountain.position.copy(at(fr[0] + fr[2] / 2, fr[1] + fr[3] / 2));
  fountain.add(M.mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.5, 20), "#d6d3cc", { y: 0.25 }));
  const water = M.mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.1, 20), M.mat("#62b6f0", { roughness: 0.1, metalness: 0.2 }), { y: 0.48, shadow: false });
  fountain.add(water, M.mesh(new THREE.CylinderGeometry(0.15, 0.25, 1.2, 8), "#d6d3cc", { y: 0.9 }));
  const jet = M.mesh(new THREE.ConeGeometry(0.35, 1, 10, 1, true), M.mat("#bfe6ff", { transparent: true, opacity: 0.6 }), { y: 1.9, rx: Math.PI, shadow: false });
  fountain.add(jet);
  scene.add(fountain);

  // пруд
  if (map.pond) {
    const [px, py, pw, ph] = map.pond;
    const pond = M.mesh(new THREE.CircleGeometry(1, 32), M.mat(P.water, { roughness: 0.1, metalness: 0.3, flatShading: false }), { rx: -Math.PI / 2, sx: (pw / 2) * S, sy: (ph / 2) * S });
    pond.position.copy(at(px + pw / 2, py + ph / 2, 0.03));
    pond.castShadow = false;
    scene.add(pond);
    const shore = M.mesh(new THREE.RingGeometry(1, 1.12, 32), M.mat("#c9b98f"), { rx: -Math.PI / 2, sx: (pw / 2) * S, sy: (ph / 2) * S });
    shore.position.copy(at(px + pw / 2, py + ph / 2, 0.025));
    scene.add(shore);
  }

  // взлётная полоса и самолёты
  const rw = map.runway;
  rect(rw, 0.05, "#3d4451");
  for (let x = 20; x < map.w; x += 70) rect([x, rw[3] / 2 - 3, 38, 6], 0.06, "#f8f9fa");
  const lights = [];
  for (let x = 10; x < map.w; x += 50) {
    [8, rw[3] - 8].forEach((y) => {
      const l = M.mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshStandardMaterial({ color: "#ffd23f", emissive: "#ffb000", emissiveIntensity: 1 }), { shadow: false });
      l.position.copy(at(x, y, 0.15));
      scene.add(l);
      lights.push(l);
    });
  }
  const takeoff = M.buildPlane();
  takeoff.scale.setScalar(0.32);
  scene.add(takeoff);
  const parked = M.buildPlane({ livery: "#1d3a6e" });
  parked.scale.setScalar(0.32);
  parked.position.copy(at(gx + 330, rw[3] - 40, 0.95));
  parked.rotation.y = Math.PI / 2 + 0.25;
  scene.add(parked);
  ground.planes = { takeoff, lights };

  // терминал
  const tm = map.terminal;
  const glass = new THREE.MeshStandardMaterial({ color: "#a8d4ff", roughness: 0.08, metalness: 0.5, transparent: true, opacity: 0.85 });
  const term = rect(tm, 7, glass);
  term.castShadow = true;
  rect([tm[0] - 15, tm[1] - 15, tm[2] + 30, tm[3] + 30], 0.6, "#e9eef5", 7);
  for (let x = tm[0] + 40; x < tm[0] + tm[2]; x += 80) rect([x, tm[1] + tm[3] - 6, 8, 6], 7, "#dde4ee");
  rect([gx - 50, tm[1] + tm[3] - 4, 100, 4], 3.2, M.mat("#d9f0ff", { emissive: "#5aa9e6", emissiveIntensity: 0.25 }));
  // вывеска
  const sign = M.makeSign(`${map.city.toUpperCase()} · ${map.code}`, { bg: "#1d3a6e", size: 44, height: 1.6, pad: 26, font: "800" });
  sign.position.copy(at(tm[0] + tm[2] / 2, tm[1] + tm[3] + 2, 5.6));
  scene.add(sign);
  // диспетчерская вышка
  const tower = new THREE.Group();
  tower.position.copy(at(tm[0] + tm[2] - 60, tm[1] + 30));
  tower.add(M.mesh(new THREE.CylinderGeometry(0.9, 1.2, 14, 10), "#e9eef5", { y: 7 }));
  tower.add(M.mesh(new THREE.CylinderGeometry(2.2, 1.6, 2, 10), glass, { y: 15 }));
  tower.add(M.mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 10), "#1d3a6e", { y: 16.2 }));
  scene.add(tower);

  // выход на посадку
  const gateMat = new THREE.MeshStandardMaterial({ color: "#ff5a1f", emissive: "#ff5a1f", emissiveIntensity: 0.4, transparent: true, opacity: 0.55 });
  const gatePad = rect(g, 0.04, gateMat);
  gatePad.castShadow = false;
  const gateArch = new THREE.Group();
  gateArch.position.copy(at(gx, g[1] + g[3] / 2));
  [-1, 1].forEach((s) => gateArch.add(M.mesh(new THREE.BoxGeometry(0.3, 3.2, 0.3), "#1d3a6e", { x: s * 3.3, y: 1.6 })));
  gateArch.add(M.mesh(new THREE.BoxGeometry(7, 0.8, 0.35), "#1d3a6e", { y: 3.4 }));
  const gateLabel = M.makeSign("✈ ВЫХОД НА ПОСАДКУ", { bg: "#ff5a1f", size: 34, height: 0.62, font: "800" });
  gateLabel.position.set(0, 3.4, 0.19);
  gateArch.add(gateLabel);
  scene.add(gateArch);
  ground.gate = { mat: gateMat };

  // магазин
  const sh = map.shop;
  rect(sh, 3.6, "#fff4e6");
  for (let i = 0; i < 6; i++) {
    const w = (sh[2] + 20) / 6;
    const aw = M.mesh(new THREE.BoxGeometry(w * S, 0.12, 1.4), i % 2 ? "#ffffff" : "#ff5a1f", { rx: 0.35 });
    aw.position.copy(at(sh[0] - 10 + w * (i + 0.5), sh[1] + sh[3] + 12, 3.1));
    scene.add(aw);
  }
  rect([sh[0] + sh[2] / 2 - 22, sh[1] + sh[3] - 3, 44, 3], 2.4, M.mat("#8ecae6", { emissive: "#3a86c8", emissiveIntensity: 0.25 }));
  const shopSign = M.makeSign("🛍 МАГАЗИН", { bg: "#1d3a6e", size: 36, height: 0.8, font: "800" });
  shopSign.position.copy(at(sh[0] + sh[2] / 2, sh[1] + sh[3] + 1, 2.4));
  scene.add(shopSign);

  // деревья, скамейки, фонари
  map.trees.forEach(([tx, ty, tw], i) => {
    const tree = M.buildTree(i * 7 + tx);
    tree.position.copy(at(tx + tw / 2, ty + tw / 2));
    tree.rotation.y = i;
    scene.add(tree);
  });
  map.benches.forEach(([bx, by, bw, bh]) => {
    const b = M.buildBench();
    b.position.copy(at(bx + bw / 2, by + bh / 2));
    scene.add(b);
  });
  [[gx - 140, 600], [gx + 140, 600], [gx - 140, 480], [gx + 140, 480]].forEach(([x, y]) => {
    const lamp = new THREE.Group();
    lamp.position.copy(at(x, y));
    lamp.add(M.mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), "#37474f", { y: 1.6 }));
    lamp.add(M.mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: "#fff8e1", emissive: "#ffe8a3", emissiveIntensity: 0.6 }), { y: 3.3 }));
    scene.add(lamp);
  });
  // ограда по краю карты
  const fenceMat = M.mat("#ffffff");
  for (let x = 0; x <= map.w; x += 50) [map.h - 2].forEach((y) => {
    const p = M.mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), fenceMat, { shadow: false });
    p.position.copy(at(x, y, 0.45)); scene.add(p);
  });
  [[0, map.h - 2, map.w, 4], [0, map.runway[3], 4, map.h - map.runway[3]], [map.w - 4, map.runway[3], 4, map.h - map.runway[3]]].forEach((r) => rect(r, 0.12, "#ffffff", 0.75));

  // достопримечательность
  const L = map.landmark;
  const lmObj = M.buildLandmark(L.kind);
  lmObj.position.copy(at(L.x, L.y));
  lmObj.scale.setScalar(0.6);
  scene.add(lmObj);
  const lmLabel = M.makeLabel((L.stamped ? "✅ " : "📸 ") + L.name, { bg: "rgba(20,33,61,.85)", height: 0.55 });
  lmLabel.position.copy(at(L.x, L.y + 70, 0.9));
  scene.add(lmLabel);
  const ring = M.mesh(new THREE.RingGeometry(STAMP_R * S - 0.12, STAMP_R * S, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.6 }), { rx: -Math.PI / 2, shadow: false });
  ring.position.copy(at(L.x, L.y + 10, 0.04));
  ring.visible = !L.stamped;
  scene.add(ring);
  ground.landmark = lmObj;
  ground.landmarkRing = ring;
  ground.landmarkLabel = lmLabel;

  // мой персонаж
  ground.scene = scene;
  ground.coins = new Map();
  others.forEach((o) => (o.obj = null));
  others.clear();
  ground.avatar = null;
  ground.myKey = "";
  ground.parts = { fountain: jet, water, takeoff };
}

function ensureMyAvatar() {
  const key = avatarKey(tick.me.avatar);
  if (ground.avatar && ground.myKey === key) return;
  if (ground.avatar) ground.scene.remove(ground.avatar);
  ground.avatar = makePerson({ nick: tick.me.nick, avatar: tick.me.avatar }, true);
  ground.myKey = key;
  ground.scene.add(ground.avatar);
}

function syncCoins() {
  const want = new Set(coinsData.filter((c) => !picked.has(c.i)).map((c) => c.i));
  for (const [i, obj] of ground.coins) if (!want.has(i)) { ground.scene.remove(obj); ground.coins.delete(i); }
  for (const c of coinsData) {
    if (!want.has(c.i) || ground.coins.has(c.i)) continue;
    const obj = M.buildCoin(c.v);
    obj.position.copy(toWorld(c.x, c.y));
    obj.userData.c = c;
    ground.scene.add(obj);
    ground.coins.set(c.i, obj);
  }
}

function blockedAt(x, y) {
  if (!map) return false;
  if (x < 16 || y < map.runway[3] + 12 || x > map.w - 16 || y > map.h - 12) return true;
  return map.blocked.some(([a, b, w, hh]) => x > a - 10 && x < a + w + 10 && y > b - 6 && y < b + hh + 8);
}
const inRect = (x, y, [a, b, w, hh], pad = 0) => x >= a - pad && x <= a + w + pad && y >= b - pad && y <= b + hh + pad;
const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

function stepMe(dt) {
  let fwd = 0, right = 0;
  if (keys.has("w") || keys.has("ArrowUp")) fwd += 1;
  if (keys.has("s") || keys.has("ArrowDown")) fwd -= 1;
  if (keys.has("d") || keys.has("ArrowRight")) right += 1;
  if (keys.has("a") || keys.has("ArrowLeft")) right -= 1;
  if (joy.active) { right = joy.x; fwd = -joy.y; }
  let dx = 0, dy = 0;
  if (fwd || right) {
    me.target = null;
    // «вперёд» — туда, куда смотрит камера; «вправо» — вправо на экране
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    dx = sy * fwd - cy * right;
    dy = cy * fwd + sy * right;
  } else if (me.target) {
    const tx = me.target.x - me.x, ty = me.target.y - me.y;
    const d = Math.hypot(tx, ty);
    if (d < 6) me.target = null; else { dx = tx / d; dy = ty / d; }
  }
  const len = Math.hypot(dx, dy);
  me.moving = len > 0.05;
  if (!me.moving) return;
  const k = Math.min(1, len);
  dx /= len; dy /= len;
  const nx = me.x + dx * SPEED * k * dt, ny = me.y + dy * SPEED * k * dt;
  let moved = false;
  if (!blockedAt(nx, me.y)) { me.x = nx; moved = true; }
  if (!blockedAt(me.x, ny)) { me.y = ny; moved = true; }
  if (!moved && me.target) me.target = null;
  me.heading = angleLerp(me.heading, Math.atan2(dx, dy), Math.min(1, dt * 12));
}

async function checkCoins() {
  for (const c of coinsData) {
    if (picked.has(c.i) || Math.hypot(me.x - c.x, me.y - c.y) > PICK_R) continue;
    picked.add(c.i);
    syncCoins();
    sendTick();
    const r = await api("coin", { i: c.i });
    if (r.ok) {
      toast(`+${r.value} 🪙`);
      $("hud-coins").textContent = Number($("hud-coins").textContent) + r.value;
      notices(r.events);
    }
  }
}

/** Камера от третьего лица: смотрит в направлении yaw, стоит позади и выше цели.
    bounds — ограничение положения камеры (внутри салона, чтобы не вылезать за стенки). */
function updateCamera(dt, target, bounds) {
  cam.target.lerp(target, Math.min(1, dt * 10));
  const f = new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
  const pos = cam.target.clone()
    .addScaledVector(f, -cam.dist * Math.cos(cam.pitch))
    .add(new THREE.Vector3(0, cam.dist * Math.sin(cam.pitch), 0));
  if (bounds) {
    pos.x = Math.max(bounds.x[0], Math.min(bounds.x[1], pos.x));
    pos.y = Math.max(bounds.y[0], Math.min(bounds.y[1], pos.y));
    pos.z = Math.max(bounds.z[0], Math.min(bounds.z[1], pos.z));
  } else {
    pos.y = Math.max(pos.y, 0.6);
  }
  camera.position.lerp(pos, Math.min(1, dt * 12));
  camera.lookAt(cam.target);
}

function renderGround(dt, t) {
  stepMe(dt);
  ensureMyAvatar();
  const pos = toWorld(me.x, me.y);
  const a = ground.avatar;
  a.position.copy(pos);
  a.userData.body.rotation.y = me.heading;
  M.animateAvatar(a.userData.body, t, { moving: me.moving });
  setOverhead(a, bubbleFor(tick.me.id), myEmoteUntil > performance.now() ? myEmoteVal : "");

  // другие игроки
  for (const o of others.values()) {
    o.x += (o.tx - o.x) * Math.min(1, dt * 6);
    o.y += (o.ty - o.y) * Math.min(1, dt * 6);
    o.h = angleLerp(o.h, o.th, Math.min(1, dt * 8));
    const key = avatarKey(o.data.avatar) + o.data.nick;
    if (!o.obj || o.key !== key) {
      if (o.obj) ground.scene.remove(o.obj);
      o.obj = makePerson(o.data, false);
      o.key = key;
      ground.scene.add(o.obj);
    }
    o.obj.position.copy(toWorld(o.x, o.y));
    o.obj.userData.body.rotation.y = o.h;
    const walking = o.data.moving || Math.hypot(o.tx - o.x, o.ty - o.y) > 3;
    M.animateAvatar(o.obj.userData.body, t + o.data.id, { moving: walking });
    setOverhead(o.obj, bubbleFor(o.data.id), o.data.emote || "");
  }

  // монеты, гейт, самолёт на полосе, фонтан, достопримечательность
  for (const obj of ground.coins.values()) {
    obj.rotation.y = t * 2.5 + obj.userData.c.i;
    obj.position.y = 0.75 + Math.sin(t * 3 + obj.userData.c.i) * 0.12;
  }
  const ready = tick.status === "boarding";
  ground.gate.mat.emissiveIntensity = ready ? 0.6 + 0.4 * Math.sin(t * 5) : 0.35 + 0.1 * Math.sin(t * 2);
  const tk = ground.parts.takeoff;
  const cycle = (t % 26) / 26;
  const rwY = map.runway[3] / 2;
  const startX = -200, endX = map.w + 300;
  const px = startX + (endX - startX) * Math.min(1, cycle * 1.25);
  tk.position.copy(toWorld(px, rwY));
  const lift = Math.max(0, cycle * 1.25 - 0.55) * 26;
  tk.position.y = 0.95 + lift;
  tk.rotation.set(0, 0, Math.min(0.25, lift * 0.03));
  tk.userData.gear.visible = lift < 3;
  tk.visible = cycle < 0.8;
  ground.planes.lights.forEach((l, i) => (l.material.emissiveIntensity = ((Math.floor(t * 3) + i) % 4) === 0 ? 2 : 0.4));
  ground.parts.fountain.scale.y = 1 + Math.sin(t * 6) * 0.15;
  ground.landmark.userData.animate(t);
  ground.landmarkRing.material.opacity = 0.35 + 0.3 * Math.sin(t * 3);
  if (me.target && ground.marker) { ground.marker.visible = true; ground.marker.position.copy(toWorld(me.target.x, me.target.y)).setY(0.05); ground.marker.scale.setScalar(1 + Math.sin(t * 8) * 0.1); }
  else if (ground.marker) ground.marker.visible = false;

  // солнце следует за игроком, чтобы тени были чёткими рядом с ним
  ground.sun.position.set(pos.x - 25, 45, pos.z + 30);
  ground.sun.target.position.copy(pos);

  updateCamera(dt, pos.clone().setY(1.5));
  renderer.render(ground.scene, camera);
  zones();
  checkCoins();
}

// =====================================================================
// Полёт: салон и вид снаружи
// =====================================================================
const flight = { scene: null, cabin: null, outside: null, seats: [], pax: new Map(), clouds: [], plane: null, groundPlane: null, windowsMat: null, key: "" };
const ROWS = 6;
const SEAT_Z = [-1.3, -0.6, 0.6, 1.3]; // A B | C D
const ROW_X = (r) => 4.5 - r * 1.6;
const CABIN_BOUNDS = { x: [-6.1, 6.1], y: [0.5, 2.3], z: [-1.85, 1.85] };
// В салоне камера у носа и смотрит назад — на лица пассажиров.
const CABIN_CAM = { yaw: -Math.PI / 2 + 0.35, pitch: 0.28, dist: 3.4 };
const OUTSIDE_CAM = { yaw: Math.PI / 2 + 2.3, pitch: 0.22, dist: 36 };

function buildFlightScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#7fb8f0");
  scene.fog = new THREE.Fog("#a9d2f7", 80, 600);
  scene.add(new THREE.HemisphereLight("#ffffff", "#7a9cc6", 1.1));
  const sun = new THREE.DirectionalLight("#fff4e0", 1.6);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  // --- салон (нос в +X) ---
  const cabin = new THREE.Group();
  const shell = M.mesh(new THREE.CylinderGeometry(2.3, 2.3, 13, 24, 1, true), new THREE.MeshStandardMaterial({ color: "#eef2f7", side: THREE.BackSide, roughness: 0.9 }), { rz: Math.PI / 2, y: 1.15 });
  cabin.add(shell);
  cabin.add(M.mesh(new THREE.BoxGeometry(13, 0.1, 4.2), "#c9d2de", { y: 0 }));
  cabin.add(M.mesh(new THREE.BoxGeometry(13, 0.02, 0.75), "#c0392b", { y: 0.06 }));
  // торцы: кабина пилотов и хвост
  cabin.add(M.mesh(new THREE.CircleGeometry(2.3, 24), new THREE.MeshStandardMaterial({ color: "#d5dce6", side: THREE.DoubleSide }), { x: 6.5, y: 1.15, ry: -Math.PI / 2 }));
  cabin.add(M.mesh(new THREE.CircleGeometry(2.3, 24), new THREE.MeshStandardMaterial({ color: "#d5dce6", side: THREE.DoubleSide }), { x: -6.5, y: 1.15, ry: Math.PI / 2 }));
  cabin.add(M.mesh(new THREE.BoxGeometry(0.1, 2, 0.9), "#9aa7b8", { x: 6.45, y: 1 }));
  // багажные полки и светильники
  [-1, 1].forEach((s) => {
    cabin.add(M.mesh(new THREE.BoxGeometry(12.6, 0.45, 0.8), "#f8fafc", { y: 2.65, z: s * 1.55 }));
    cabin.add(M.mesh(new THREE.BoxGeometry(12.6, 0.04, 0.1), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#bcd7ff", emissiveIntensity: 0.8 }), { y: 2.4, z: s * 1.15, shadow: false }));
  });
  // иллюминаторы: небо за окном анимируется
  const skyTex = makeSkyTexture();
  const winMat = new THREE.MeshBasicMaterial({ map: skyTex });
  flight.windowsMat = winMat;
  for (let r = 0; r < ROWS + 2; r++) {
    [-1, 1].forEach((s) => {
      const w = M.mesh(new THREE.PlaneGeometry(0.42, 0.55), winMat, { x: 5.2 - r * 1.6, y: 1.45, z: s * 2.02, ry: s > 0 ? Math.PI : 0, shadow: false });
      cabin.add(w);
      cabin.add(M.mesh(new THREE.RingGeometry(0.3, 0.36, 16), "#cfd8e3", { x: 5.2 - r * 1.6, y: 1.45, z: s * 2.0, ry: s > 0 ? Math.PI : 0, sy: 1.3, shadow: false }));
    });
  }
  // кресла
  flight.seats = [];
  for (let r = 0; r < ROWS; r++) {
    for (let k = 0; k < 4; k++) {
      const seat = new THREE.Group();
      seat.position.set(ROW_X(r), 0, SEAT_Z[k]);
      seat.add(M.mesh(new THREE.BoxGeometry(0.55, 0.15, 0.55), "#355c9a", { y: 0.48 }));
      seat.add(M.mesh(new THREE.BoxGeometry(0.15, 0.9, 0.55), "#2a4a80", { x: -0.3, y: 0.95, rz: -0.12 }));
      seat.add(M.mesh(new THREE.BoxGeometry(0.12, 0.2, 0.55), "#f8fafc", { x: -0.34, y: 1.45 }));
      seat.add(M.mesh(new THREE.BoxGeometry(0.1, 0.4, 0.05), "#c9d2de", { y: 0.24, z: 0.24 }));
      const num = M.makeSign(`${r + 1}${"ABCD"[k]}`, { bg: "rgba(29,58,110,.7)", size: 24, height: 0.13 });
      num.position.set(-0.27, 1.64, 0);
      num.rotation.y = Math.PI / 2;
      seat.add(num);
      cabin.add(seat);
      flight.seats.push(seat);
    }
  }
  scene.add(cabin);
  flight.cabin = cabin;

  // --- снаружи ---
  const outside = new THREE.Group();
  const plane = M.buildPlane();
  outside.add(plane);
  flight.plane = plane;
  const cloudMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 1, flatShading: true });
  flight.clouds = [];
  for (let i = 0; i < 70; i++) {
    const c = new THREE.Group();
    const n = 3 + (i % 3);
    for (let j = 0; j < n; j++) c.add(M.mesh(new THREE.IcosahedronGeometry(4 + (j % 2) * 2, 0), cloudMat, { x: j * 4.5 - n * 2, y: (j % 2) * 1.5, z: (j % 3) * 2, shadow: false }));
    c.position.set((Math.random() - 0.5) * 600, -30 - Math.random() * 25, (Math.random() - 0.5) * 300);
    c.userData.speed = 0.6 + Math.random() * 0.5;
    outside.add(c);
    flight.clouds.push(c);
  }
  const landTex = makeLandTexture();
  const land = M.mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: landTex, roughness: 1 }), { rx: -Math.PI / 2, y: -140, shadow: false });
  outside.add(land);
  flight.groundPlane = land;
  scene.add(outside);
  flight.outside = outside;
  flight.scene = scene;
  flight.pax = new Map();
}

function makeSkyTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#3f8fe0"); g.addColorStop(0.55, "#9fd0ff"); g.addColorStop(0.56, "#ffffff"); g.addColorStop(1, "#e8f4ff");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255,255,255,.95)";
  for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc((i * 47) % 256, 40 + (i % 4) * 10, 10 + (i % 3) * 6, 0, Math.PI * 2); ctx.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLandTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#6a994e"; ctx.fillRect(0, 0, 512, 512);
  const colors = ["#7fb069", "#a7c957", "#d4a373", "#588157", "#bc6c25", "#90a955"];
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect((i * 97) % 512, (i * 53) % 512, 20 + (i % 7) * 12, 14 + (i % 5) * 10);
  }
  ctx.fillStyle = "#4ea8de";
  ctx.beginPath(); ctx.moveTo(0, 300); ctx.bezierCurveTo(150, 260, 300, 380, 512, 330); ctx.lineTo(512, 345); ctx.bezierCurveTo(300, 395, 150, 275, 0, 315); ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function syncPassengers() {
  const seen = new Set();
  for (const p of tick.cabin) {
    seen.add(p.id);
    const key = avatarKey(p.avatar) + p.nick + p.seat;
    let rec = flight.pax.get(p.id);
    if (!rec || rec.key !== key) {
      if (rec) flight.cabin.remove(rec.obj);
      const obj = makePerson(p, p.id === tick.me.id);
      obj.userData.k = 0.55; // в тесном салоне надписи мельче
      obj.userData.label.scale.multiplyScalar(0.55);
      obj.userData.label.position.y = 1.62;
      const seat = flight.seats[p.seat] || flight.seats[0];
      obj.position.copy(seat.position).add(new THREE.Vector3(0.02, 0.12, 0));
      obj.userData.body.rotation.y = Math.PI / 2; // лицом к носу самолёта
      flight.cabin.add(obj);
      rec = { obj, key, data: p };
      flight.pax.set(p.id, rec);
    }
    rec.data = p;
  }
  for (const [id, rec] of flight.pax) if (!seen.has(id)) { flight.cabin.remove(rec.obj); flight.pax.delete(id); }
}

function renderFlight(dt, t) {
  const trip = tick.trip;
  const p = Math.max(0, Math.min(1, (now() - trip.dep) / (trip.arr - trip.dep)));
  const alt = Math.min(1, p / 0.12, (1 - p) / 0.12); // 0 — у земли, 1 — эшелон
  const climb = p < 0.12 ? 1 : p > 0.88 ? -1 : 0;
  syncPassengers();
  for (const rec of flight.pax.values()) {
    M.animateAvatar(rec.obj.userData.body, t + rec.data.seat, { sitting: true });
    setOverhead(rec.obj, bubbleFor(rec.data.id), rec.data.emote || "");
  }
  flight.windowsMat.map.offset.x = (t * (0.05 + 0.15 * alt)) % 1;
  flight.windowsMat.map.offset.y = (1 - alt) * -0.25;

  // небо темнеет с высотой
  flight.scene.background.setHSL(0.58, 0.75, 0.72 - alt * 0.12);

  const inside = cabinView === "inside";
  flight.cabin.visible = inside;
  flight.outside.visible = !inside;
  // лёгкая качка и наклон при взлёте/посадке
  const roll = Math.sin(t * 0.7) * 0.01 * alt;
  const pitchA = climb * 0.07;
  if (inside) {
    flight.cabin.rotation.set(roll, 0, pitchA);
    const mine = flight.pax.get(tick.me.id);
    const seat = mine ? mine.obj.position : new THREE.Vector3(0, 0, 0);
    updateCamera(dt, new THREE.Vector3(seat.x - 0.6, 1.15, seat.z * 0.5), CABIN_BOUNDS);
  } else {
    const pl = flight.plane;
    pl.position.set(0, 0, 0);
    pl.rotation.set(roll * 3, 0, pitchA + Math.sin(t * 0.5) * 0.01);
    pl.userData.gear.visible = alt < 0.5;
    flight.groundPlane.position.y = -12 - alt * 128;
    flight.groundPlane.material.map.offset.x = (t * 0.02 * (0.5 + alt)) % 1;
    flight.clouds.forEach((c) => {
      c.position.x -= c.userData.speed * (20 + 40 * alt) * dt;
      if (c.position.x < -300) c.position.x += 600;
      c.position.y = (-30 - (c.userData.speed - 0.6) * 50) * alt + (1 - alt) * 40;
    });
    updateCamera(dt, new THREE.Vector3(2, 0, 0));
  }
  renderer.render(flight.scene, camera);

  const left = Math.max(0, trip.arr - now());
  $("cabin-route").textContent = `${trip.number} · ${trip.from_city} → ${trip.to_city}`;
  $("cabin-left").textContent = left > 0 ? `до посадки ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}` : "Посадка…";
  $("cabin-alt").textContent = `${Math.round(alt * 11000).toLocaleString("ru")} м · ${Math.round(250 + alt * 650)} км/ч`;
  $("cabin-bar").style.width = `${p * 100}%`;
  if (now() >= trip.arr + 0.5 && !landingAsked) { landingAsked = true; sendTick(); }
}
let landingAsked = false;

// =====================================================================
// Табло, зоны, билет
// =====================================================================
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
  $("board-hint").hidden = atGate;
}

let boardTimer = null;
function fmtLeft(s) {
  if (s <= 0) return "вылет";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
async function refreshBoard() {
  const r = await api("departures");
  if (!r.ok) return;
  const list = $("board-list");
  const t = now();
  if (!r.departures.length) { list.replaceChildren(h("li", { class: "muted" }, "Ближайших вылетов нет.")); return; }
  list.replaceChildren(...r.departures.map((d) => h("li", { class: "dep" },
    h("div", { class: "dep__time" }, h("b", { class: "mono", "data-dep": d.dep }, fmtLeft(d.dep - t)), h("small", {}, d.number)),
    h("div", { class: "dep__to" },
      h("b", {}, h("span", { class: "mono" }, d.to), ` ${d.city}`),
      h("small", {}, `${d.km.toLocaleString("ru")} км · полёт ${Math.round(d.duration / 6) / 10} мин · ${d.taken}/${d.seats} мест`),
      d.new ? h("em", { class: "tag tag--new" }, "новый аэропорт") : null,
      d.riders.length ? h("small", { class: "dep__riders" }, `👥 ${d.riders.join(", ")}`) : null),
    h("button", { class: "btn btn--accent btn--sm", type: "button", onclick: () => doBoard(d) }, `${d.price} 🪙`))));
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
  document.querySelectorAll("[data-dep]").forEach((el) => (el.textContent = fmtLeft(Number(el.dataset.dep) - now())));
}, 500);

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

// =====================================================================
// Режимы и синхронизация с сервером
// =====================================================================
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
  if (!window.SkyGlobe) return;
  if (!miniGlobe) miniGlobe = window.SkyGlobe.mount($("mini-globe"), data); else miniGlobe.update(data);
}

function setMode(next) {
  if (next === mode) return;
  mode = next;
  root.dataset.mode = next;
  if (next === "flying") {
    closeBoard();
    landingAsked = false;
    if (!flight.scene) buildFlightScene();
    Object.assign(cam, CABIN_CAM);
    cabinView = "inside";
    $("view-toggle").textContent = "Вид снаружи";
    cabinGlobe();
  } else if (next === "ground") {
    cam.dist = 7.5; cam.pitch = 0.38;
  }
}

async function loadMap() {
  map = await api("map");
  $("hud-place").textContent = `${map.city} · ${map.code}`;
  buildGroundScene();
  const marker = M.mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85 }), { rx: -Math.PI / 2, shadow: false });
  ground.scene.add(marker);
  ground.marker = marker;
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

let inflight = null, lastTickAt = 0;
/** Отправить своё положение и получить состояние мира. Если запрос уже идёт,
    дожидаемся его и отправляем новый — так перед покупкой билета сервер точно
    знает, что мы стоим у выхода на посадку. */
async function sendTick() {
  while (inflight) await inflight;
  inflight = doTick();
  try { await inflight; } finally { inflight = null; }
}
async function doTick() {
  lastTickAt = Date.now();
  {
    const prevAirport = tick && tick.me.airport;
    const deg = Math.round((Math.atan2(Math.sin(me.heading), Math.cos(me.heading)) * 180) / Math.PI);
    const data = await api("tick", { pos: { x: Math.round(me.x), y: Math.round(me.y), facing: deg, moving: me.moving } });
    if (!data || data.ok === false) return;
    srvOffset = data.now - Date.now() / 1000;
    const first = !tick;
    tick = data;
    $("hud-coins").textContent = data.me.coins;
    $("hud-online").textContent = data.online;
    if (data.status === "flying") {
      setMode("flying");
    } else {
      if (first || data.me.airport !== prevAirport || !map) {
        await loadMap();
        me.x = data.me.x; me.y = data.me.y; me.target = null; me.heading = Math.PI;
        cam.yaw = Math.PI;
        cam.target.copy(toWorld(me.x, me.y)).setY(1.5);
        if (!first) arrive();
      }
      setMode("ground");
      coinsData = data.coins || [];
      syncCoins();
      const seen = new Set();
      for (const o of data.others) {
        seen.add(o.id);
        const th = ((o.facing || 0) * Math.PI) / 180;
        const cur = others.get(o.id);
        if (cur) { cur.tx = o.x; cur.ty = o.y; cur.th = th; cur.data = o; }
        else others.set(o.id, { x: o.x, y: o.y, tx: o.x, ty: o.y, h: th, th, data: o, obj: null, key: "" });
      }
      for (const [id, o] of others) if (!seen.has(id)) { if (o.obj) ground.scene.remove(o.obj); others.delete(id); }
    }
    notices(data.events);
    renderChat(data.chat);
  }
}

// =====================================================================
// Управление: клавиатура, мышь, касания, джойстик
// =====================================================================
const KEYMAP = { ц: "w", ф: "a", ы: "s", в: "d" };
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  k = KEYMAP[k] || k;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d"].includes(k)) { keys.add(k); e.preventDefault(); }
  if (k === "q") cam.yaw += 0.15;
  if (k === "e") cam.yaw -= 0.15;
  if (k === "Enter") { $("chat-input").focus(); e.preventDefault(); }
});
window.addEventListener("keyup", (e) => {
  let k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  keys.delete(KEYMAP[k] || k);
});
window.addEventListener("blur", () => keys.clear());

// Перетаскивание по сцене — вращение камеры; короткое касание — идти в точку.
const drag = { id: null, x: 0, y: 0, sx: 0, sy: 0, moved: false };
canvas.addEventListener("pointerdown", (e) => {
  if (drag.id !== null) return;
  canvas.setPointerCapture(e.pointerId);
  Object.assign(drag, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false });
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
  if (!drag.moved) return;
  cam.yaw -= dx * 0.006;
  cam.pitch = Math.max(0.05, Math.min(1.25, cam.pitch + dy * 0.005));
  root.classList.add("was-touched");
});
const raycaster = new THREE.Raycaster();
canvas.addEventListener("pointerup", (e) => {
  if (e.pointerId !== drag.id) return;
  drag.id = null;
  if (drag.moved || mode !== "ground" || !map) return;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
    me.target = { x: hit.x / S + map.w / 2, y: hit.z / S + map.h / 2 };
  }
});
canvas.addEventListener("pointercancel", () => (drag.id = null));
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [lo, hi] = mode !== "flying" ? [3, 18] : cabinView === "inside" ? [1.5, 4.5] : [18, 80];
  cam.dist = Math.max(lo, Math.min(hi, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
}, { passive: false });

// Экранный джойстик для телефона
const joy = { active: false, x: 0, y: 0, id: null };
const joyEl = $("joystick"), knob = $("joystick-knob");
if (joyEl) {
  joyEl.addEventListener("pointerdown", (e) => { joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joy.active = true; moveJoy(e); });
  joyEl.addEventListener("pointermove", (e) => { if (e.pointerId === joy.id) moveJoy(e); });
  const end = () => { joy.active = false; joy.x = joy.y = 0; joy.id = null; knob.style.transform = ""; };
  joyEl.addEventListener("pointerup", end);
  joyEl.addEventListener("pointercancel", end);
}
function moveJoy(e) {
  const r = joyEl.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = y;
  knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
}

// ---------- кнопки ----------
$("act-board").addEventListener("click", () => (boardOpen ? closeBoard() : openBoard()));
$("board-close").addEventListener("click", closeBoard);
$("act-photo").addEventListener("click", async () => {
  await sendTick();
  const r = await api("stamp", {});
  if (r.ok) {
    map.landmark.stamped = true;
    ground.landmarkRing.visible = false;
    zoneState = "";
    notices(r.events);
    flash();
    sendTick();
  } else toast(r.error, true);
});
$("act-shop").addEventListener("click", () => (location.href = URLS.shop));
$("ticket-cancel").addEventListener("click", async () => {
  const r = await api("cancel", {});
  toast(r.ok ? r.message : r.error, !r.ok);
  sendTick();
});
$("view-toggle").addEventListener("click", () => {
  cabinView = cabinView === "inside" ? "outside" : "inside";
  $("view-toggle").textContent = cabinView === "inside" ? "Вид снаружи" : "Вид из салона";
  Object.assign(cam, cabinView === "outside" ? OUTSIDE_CAM : CABIN_CAM);
});
function flash() {
  const f = $("flash");
  f.hidden = false; f.classList.remove("is-on"); void f.offsetWidth; f.classList.add("is-on");
  setTimeout(() => (f.hidden = true), 700);
}

// чат и эмоции
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
document.querySelectorAll("[data-emote]").forEach((b) => b.addEventListener("click", async () => {
  myEmoteVal = b.dataset.emote; myEmoteUntil = performance.now() + 4000;
  $("emotes").hidden = true;
  await api("emote", { emote: b.dataset.emote });
}));
$("emote-btn").addEventListener("click", () => ($("emotes").hidden = !$("emotes").hidden));

// карта мира
let worldGlobe = null;
$("btn-world").addEventListener("click", async () => {
  $("worldmap").hidden = false;
  const w = await api("world");
  $("world-count").textContent = `Посещено ${w.airports.filter((a) => a.visited).length} из ${w.airports.length} аэропортов`;
  const cur = tick && tick.me.airport;
  const here = w.airports.find((a) => a.code === cur) || w.airports[0];
  const data = {
    airports: w.airports.map((a) => ({ code: a.code, lon: a.lon, lat: a.lat, kind: a.code === cur ? "current" : a.visited ? "visited" : "unvisited" })),
    arcs: [],
    planes: w.planes.map((p) => ({ from: p.from, to: p.to, mode: "timed", dep: p.dep, arr: p.arr, trail: "short", size: 16 })),
    clock: { h: w.now, speed: 60 },
    camera: { mode: "focus", center: here ? [here.lon, here.lat] : [0, 30] },
  };
  if (!worldGlobe) worldGlobe = window.SkyGlobe.mount($("world-globe"), data); else worldGlobe.update(data);
});
$("world-close").addEventListener("click", () => ($("worldmap").hidden = true));

// =====================================================================
// Главный цикл
// =====================================================================
let lastMs = performance.now();
const startMs = lastMs;
function frame(ms) {
  ms = ms || performance.now();
  const dt = Math.min(0.05, (ms - lastMs) / 1000);
  lastMs = ms;
  const t = (ms - startMs) / 1000;
  if (tick && mode === "ground" && ground.scene) renderGround(dt, t);
  else if (tick && mode === "flying" && tick.trip && flight.scene) renderFlight(dt, t);
  renderTicket();
  requestAnimationFrame(frame);
}

resize();
sendTick().then(() => requestAnimationFrame(frame));
// На земле опрашиваем чаще (видно, как ходят другие), в полёте — реже, чтобы беречь сервер.
setInterval(() => {
  if (document.hidden) return;
  if (inflight) return;
  if (mode === "flying" && Date.now() - lastTickAt < 2500) return;
  sendTick();
}, 1100);
