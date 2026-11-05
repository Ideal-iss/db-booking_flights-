/* 3D-модели мира SkyBook: персонажи, вещи, здания, самолёт, достопримечательности.
   Всё собрано из простых фигур Three.js в стиле low-poly — без загрузки моделей. */
import * as THREE from "three";

export const PAL = {
  skin: ["#f6d7b8", "#eec39a", "#d9a066", "#b97a48", "#8d5524", "#5c3a1e"],
  hair: ["#2b1d14", "#5a3a22", "#a0522d", "#e0b04a", "#e8e0cf", "#c0392b", "#3b5bdb"],
  top: ["#ff5a1f", "#3ecf8e", "#4da3ff", "#ffd23f", "#c77dff", "#ff6b9e", "#2ec4d6", "#1f2937", "#f8fafc"],
  bottom: ["#1f3a68", "#374151", "#7c5c3b", "#111827", "#6b7280", "#9f1239", "#065f46"],
};

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...opts }));
  }
  return matCache.get(key);
}

export function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, shadow = true } = {}) {
  const m = new THREE.Mesh(geo, typeof material === "string" ? mat(material) : material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg),
  sph: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  cap: (r, l, seg = 8) => new THREE.CapsuleGeometry(r, l, 4, seg),
  cone: (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg),
  torus: (r, t, seg = 16) => new THREE.TorusGeometry(r, t, 6, seg),
};

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return "#" + c.getHexString();
}

// ---------------------------------------------------------------------------
// Персонаж. Начало координат — между ступнями, лицо смотрит в +Z. Рост ≈ 1.75.
// ---------------------------------------------------------------------------
export function buildAvatar(av = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // всё, что покачивается при ходьбе
  root.add(body);
  const skin = PAL.skin[av.skin] || PAL.skin[1];
  const hairC = PAL.hair[av.hair_color] || PAL.hair[0];
  let topC = PAL.top[av.top] || PAL.top[0];
  const botC = PAL.bottom[av.bottom] || PAL.bottom[0];
  if (av.outfit === "uniform") topC = "#1e2f5c";
  if (av.outfit === "hoodie") topC = shade(topC, 0.85);
  const shoe = "#2d2d2d";

  // ноги: бедро + голень, чтобы можно было сесть
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0.86, 0);
    const thigh = mesh(G.cap(0.1, 0.3), botC, { y: -0.2 });
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    knee.add(mesh(G.cap(0.09, 0.26), botC, { y: -0.18 }));
    knee.add(mesh(G.box(0.17, 0.09, 0.27), shoe, { y: -0.4, z: 0.05 }));
    hip.add(thigh, knee);
    body.add(hip);
    legs.push({ hip, knee });
  }

  // туловище
  const torso = mesh(G.cap(0.24, 0.32, 10), topC, { y: 1.12, sx: 1.12, sz: 0.85 });
  body.add(torso);
  if (av.outfit === "hawaii") {
    const dots = ["#ffe066", "#ff6b9e", "#ffe066", "#7ee8fa"];
    [[-0.12, 1.22], [0.1, 1.05], [-0.05, 0.96], [0.14, 1.3], [-0.16, 1.07]].forEach(([dx, dy], i) =>
      body.add(mesh(G.sph(0.045, 8, 6), dots[i % 4], { x: dx, y: dy, z: 0.215, shadow: false })));
  }
  if (av.outfit === "uniform") {
    body.add(mesh(G.box(0.5, 0.025, 0.42), "#f4c542", { y: 0.98, shadow: false }));
    body.add(mesh(G.box(0.5, 0.025, 0.42), "#f4c542", { y: 1.03, shadow: false }));
    body.add(mesh(G.cone(0.07, 0.16, 3), "#ffffff", { y: 1.33, z: 0.19, rx: Math.PI, shadow: false }));
  }
  if (av.outfit === "hoodie") body.add(mesh(G.torus(0.2, 0.07), shade(topC, 0.8), { y: 1.38, z: -0.06, rx: Math.PI / 2.4 }));

  // руки
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(side * 0.33, 1.32, 0);
    sh.add(mesh(G.cap(0.075, 0.36), shade(topC, 0.92), { y: -0.24 }));
    sh.add(mesh(G.sph(0.08, 8, 6), skin, { y: -0.5 }));
    sh.rotation.z = side * 0.08;
    body.add(sh);
    arms.push(sh);
  }

  // голова
  const head = new THREE.Group();
  head.position.y = 1.58;
  head.add(mesh(G.sph(0.25, 16, 12), skin));
  head.add(mesh(G.sph(0.035, 8, 6), "#222", { x: -0.09, y: 0.02, z: 0.225, shadow: false }));
  head.add(mesh(G.sph(0.035, 8, 6), "#222", { x: 0.09, y: 0.02, z: 0.225, shadow: false }));
  const smile = mesh(new THREE.TorusGeometry(0.06, 0.013, 4, 10, Math.PI), "#7a3b2e", { y: -0.07, z: 0.225, rz: Math.PI, shadow: false });
  head.add(smile);
  head.add(mesh(G.sph(0.04, 8, 6), "#ff8a8a", { x: -0.15, y: -0.05, z: 0.18, sz: 0.4, shadow: false }));
  head.add(mesh(G.sph(0.04, 8, 6), "#ff8a8a", { x: 0.15, y: -0.05, z: 0.18, sz: 0.4, shadow: false }));
  body.add(head);

  // волосы (под головным убором пышные причёски прячутся)
  let hair = av.hair || "short";
  if (av.hat && ["spiky", "curly", "bun"].includes(hair)) hair = "short";
  const cap = () => mesh(new THREE.SphereGeometry(0.265, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.1), hairC, { y: 0.02, rx: -0.25 });
  if (hair === "short") head.add(cap());
  if (hair === "long") { head.add(cap()); head.add(mesh(G.box(0.48, 0.42, 0.18), hairC, { y: -0.12, z: -0.14 })); }
  if (hair === "bun") { head.add(cap()); head.add(mesh(G.sph(0.11, 10, 8), hairC, { y: 0.27, z: -0.08 })); }
  if (hair === "spiky") {
    head.add(cap());
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      head.add(mesh(G.cone(0.07, 0.2, 5), hairC, { x: Math.cos(a) * 0.15, y: 0.22, z: Math.sin(a) * 0.15 - 0.03, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 }));
    }
  }
  if (hair === "curly") {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, b = i % 2 ? 0.15 : 0.05;
      head.add(mesh(G.sph(0.09, 8, 6), hairC, { x: Math.cos(a) * 0.2, y: 0.12 + b, z: Math.sin(a) * 0.2 - 0.03 }));
    }
  }

  // очки
  if (av.glasses === "sunglasses") {
    head.add(mesh(G.box(0.15, 0.08, 0.03), "#111", { x: -0.09, y: 0.03, z: 0.24, shadow: false }));
    head.add(mesh(G.box(0.15, 0.08, 0.03), "#111", { x: 0.09, y: 0.03, z: 0.24, shadow: false }));
  } else if (av.glasses === "round_glasses") {
    head.add(mesh(G.torus(0.055, 0.01, 12), "#333", { x: -0.09, y: 0.02, z: 0.24, shadow: false }));
    head.add(mesh(G.torus(0.055, 0.01, 12), "#333", { x: 0.09, y: 0.02, z: 0.24, shadow: false }));
  }

  // головные уборы
  const hat = av.hat;
  if (hat === "cap") {
    head.add(mesh(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#e63946", { y: 0.05 }));
    head.add(mesh(G.box(0.3, 0.025, 0.22), "#e63946", { y: 0.07, z: 0.3 }));
  } else if (hat === "beanie") {
    head.add(mesh(new THREE.SphereGeometry(0.275, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#2a9d8f", { y: 0.04 }));
    head.add(mesh(G.cyl(0.28, 0.28, 0.07, 16), "#e9c46a", { y: 0.05 }));
    head.add(mesh(G.sph(0.06, 8, 6), "#e9c46a", { y: 0.33 }));
  } else if (hat === "panama") {
    head.add(mesh(G.cyl(0.42, 0.42, 0.02, 18), "#f1e3c6", { y: 0.12 }));
    head.add(mesh(G.cyl(0.22, 0.25, 0.18, 16), "#f1e3c6", { y: 0.22 }));
    head.add(mesh(G.cyl(0.255, 0.255, 0.04, 16), "#3d5a80", { y: 0.15 }));
  } else if (hat === "pilot") {
    head.add(mesh(G.cyl(0.3, 0.26, 0.16, 16), "#1e2f5c", { y: 0.24 }));
    head.add(mesh(G.box(0.3, 0.025, 0.16), "#111", { y: 0.14, z: 0.26 }));
    head.add(mesh(G.sph(0.04, 8, 6), "#f4c542", { y: 0.24, z: 0.3 }));
  } else if (hat === "cowboy") {
    head.add(mesh(G.cyl(0.5, 0.5, 0.025, 18), "#8b5a2b", { y: 0.14, sz: 0.8 }));
    head.add(mesh(G.cyl(0.2, 0.25, 0.24, 12), "#8b5a2b", { y: 0.27 }));
    head.add(mesh(G.cyl(0.255, 0.255, 0.05, 12), "#5c3a1e", { y: 0.17 }));
  } else if (hat === "crown") {
    head.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 10, 1, true), mat("#f4c542", { metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }), { y: 0.25 }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      head.add(mesh(G.cone(0.05, 0.12, 4), mat("#f4c542", { metalness: 0.6, roughness: 0.3 }), { x: Math.cos(a) * 0.2, y: 0.35, z: Math.sin(a) * 0.2 }));
    }
    head.add(mesh(G.sph(0.035, 8, 6), "#e63946", { y: 0.26, z: 0.21 }));
  }

  // аксессуары
  if (av.extra === "scarf") {
    body.add(mesh(G.torus(0.19, 0.06), "#e63946", { y: 1.4, rx: Math.PI / 2 }));
    body.add(mesh(G.box(0.1, 0.3, 0.05), "#e63946", { x: 0.1, y: 1.22, z: 0.2 }));
  }
  if (av.extra === "backpack") body.add(mesh(G.box(0.36, 0.42, 0.18), "#8b5e34", { y: 1.12, z: -0.27 }));
  if (av.extra === "camera") {
    body.add(mesh(G.box(0.18, 0.12, 0.08), "#222", { y: 1.0, z: 0.25 }));
    body.add(mesh(G.cyl(0.04, 0.04, 0.06, 10), "#8ecae6", { y: 1.0, z: 0.31, rx: Math.PI / 2 }));
  }
  let balloon = null;
  if (av.extra === "balloon") {
    balloon = new THREE.Group();
    balloon.position.set(0.45, 0.85, -0.05);
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 1.2, 0)];
    balloon.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#555" })));
    balloon.add(mesh(G.sph(0.22, 14, 10), mat("#ff4d6d", { roughness: 0.3 }), { y: 1.42, sy: 1.15 }));
    root.add(balloon);
  }

  root.userData = { body, legs, arms, head, balloon, sitting: false };
  return root;
}

/** Анимация персонажа: ходьба, дыхание, сидячая поза. */
export function animateAvatar(av3d, t, { moving = false, sitting = false } = {}) {
  const u = av3d.userData;
  const swing = moving ? Math.sin(t * 9) * 0.7 : 0;
  if (sitting) {
    u.legs.forEach(({ hip, knee }) => { hip.rotation.x = -Math.PI / 2; knee.rotation.x = Math.PI / 2; });
    u.arms.forEach((a, i) => { a.rotation.x = -0.6; a.rotation.z = (i ? 1 : -1) * 0.12; });
    u.body.position.y = -0.38;
  } else {
    u.legs.forEach(({ hip, knee }, i) => { hip.rotation.x = (i ? 1 : -1) * swing; knee.rotation.x = Math.max(0, (i ? -1 : 1) * swing) * 0.8; });
    u.arms.forEach((a, i) => { a.rotation.x = (i ? -1 : 1) * swing * 0.8; a.rotation.z = (i ? 1 : -1) * 0.08; });
    u.body.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 2) * 0.01;
  }
  u.head.rotation.y = moving ? 0 : Math.sin(t * 0.7) * 0.25;
  if (u.balloon) u.balloon.rotation.z = Math.sin(t * 1.6) * 0.08;
}

// ---------------------------------------------------------------------------
// Надписи: имя, облачко с текстом, эмоция — спрайты, всегда смотрят в камеру
// ---------------------------------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeLabel(text, { bg = "rgba(20,33,61,.8)", color = "#fff", size = 30, height = 0.42, pad = 14, font = "700" } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  ctx.font = `${font} ${size}px Manrope, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2, hgt = size + pad;
  c.width = w; c.height = hgt;
  ctx.font = `${font} ${size}px Manrope, sans-serif`;
  ctx.fillStyle = bg; roundRect(ctx, 0, 0, w, hgt, hgt / 2); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, hgt / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set((height * w) / hgt, height, 1);
  sp.renderOrder = 10;
  return sp;
}

export function makeBubble(text) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const size = 30, maxW = 420;
  ctx.font = `600 ${size}px Manrope, sans-serif`;
  const lines = [];
  let line = "";
  for (const word of String(text).split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
  }
  lines.push(line);
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 40;
  const hgt = lines.length * (size + 8) + 30 + 18;
  c.width = w; c.height = hgt;
  ctx.font = `600 ${size}px Manrope, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,.97)";
  roundRect(ctx, 0, 0, w, hgt - 18, 22); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w / 2 - 14, hgt - 19); ctx.lineTo(w / 2, hgt); ctx.lineTo(w / 2 + 14, hgt - 19); ctx.fill();
  ctx.fillStyle = "#14213d"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 15 + i * (size + 8)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const k = 0.0042;
  sp.scale.set(w * k, hgt * k, 1);
  sp.center.set(0.5, 0);
  sp.renderOrder = 11;
  return sp;
}

export function makeEmoji(ch) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.font = "100px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(ch, 64, 72);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.set(0.7, 0.7, 1);
  sp.renderOrder = 12;
  return sp;
}

// ---------------------------------------------------------------------------
// Окружение
// ---------------------------------------------------------------------------
export function buildTree(seed = 0) {
  const g = new THREE.Group();
  const h = 1.6 + (seed % 5) * 0.25;
  g.add(mesh(G.cyl(0.14, 0.2, h, 7), "#6b4f3a", { y: h / 2 }));
  const greens = ["#3a8f4b", "#4fae5f", "#2f7d43", "#5bbf6a"];
  if (seed % 3 === 0) {
    for (let i = 0; i < 3; i++) g.add(mesh(G.cone(1.2 - i * 0.28, 1.4, 8), greens[(seed + i) % 4], { y: h + 0.3 + i * 0.75 }));
  } else {
    g.add(mesh(new THREE.IcosahedronGeometry(1.15, 0), greens[seed % 4], { y: h + 0.8 }));
    g.add(mesh(new THREE.IcosahedronGeometry(0.75, 0), greens[(seed + 1) % 4], { x: 0.5, y: h + 1.4, z: 0.2 }));
  }
  return g;
}

export function buildBench() {
  const g = new THREE.Group();
  g.add(mesh(G.box(2, 0.1, 0.55), "#8d6e63", { y: 0.48 }));
  g.add(mesh(G.box(2, 0.45, 0.08), "#8d6e63", { y: 0.8, z: -0.25 }));
  [-0.85, 0.85].forEach((x) => g.add(mesh(G.box(0.08, 0.48, 0.5), "#424242", { x, y: 0.24 })));
  return g;
}

export function buildCoin(value) {
  const g = new THREE.Group();
  const m = mat(value >= 10 ? "#ff9f1c" : "#ffd23f", { metalness: 0.7, roughness: 0.25, emissive: value >= 10 ? "#6b3a00" : "#5a4500" });
  const c = mesh(G.cyl(0.32, 0.32, 0.07, 20), m, { rx: Math.PI / 2 });
  g.add(c);
  g.add(mesh(G.cyl(0.2, 0.2, 0.08, 16), mat("#e0a100", { metalness: 0.7, roughness: 0.3 }), { rx: Math.PI / 2, shadow: false }));
  return g;
}

/** Самолёт снаружи: нос смотрит в +X, длина ≈ 30. */
export function buildPlane({ livery = "#ff5a1f" } = {}) {
  const g = new THREE.Group();
  const white = mat("#f3f5f9", { roughness: 0.4 });
  const grey = mat("#c9d2de", { roughness: 0.5 });
  const fus = mesh(G.cap(1.8, 24, 16), white, { rz: Math.PI / 2 });
  g.add(fus);
  g.add(mesh(G.cone(1.8, 4, 16), white, { x: 13.8, rz: -Math.PI / 2, sy: 1 }));
  g.add(mesh(G.box(28, 0.25, 0.08), livery, { y: 0.15, z: 1.79, shadow: false }));
  g.add(mesh(G.box(28, 0.25, 0.08), livery, { y: 0.15, z: -1.79, shadow: false }));
  // окна кабины
  g.add(mesh(G.box(1.4, 0.5, 2.6), "#1d3a6e", { x: 13.2, y: 0.8, rz: -0.3, shadow: false }));
  // иллюминаторы
  for (let x = -10; x <= 10; x += 1.2) {
    g.add(mesh(G.box(0.5, 0.45, 0.06), "#1d3a6e", { x, y: 0.6, z: 1.8, shadow: false }));
    g.add(mesh(G.box(0.5, 0.45, 0.06), "#1d3a6e", { x, y: 0.6, z: -1.8, shadow: false }));
  }
  // крылья
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(-5, 16); wingShape.lineTo(-7.5, 16); wingShape.lineTo(-6, 0); wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.35, bevelEnabled: false });
  for (const side of [1, -1]) {
    // Форма крыла лежит в плоскости XY; поворот вокруг X кладёт её горизонтально
    // и разворачивает в нужную сторону (+Z или −Z).
    const w = mesh(wingGeo, white, { x: 3, y: side > 0 ? -0.45 : -0.8 });
    w.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(w);
    g.add(mesh(G.cyl(0.75, 0.65, 3.2, 14), grey, { x: 1.2, y: -1.7, z: side * 6.5, rz: Math.PI / 2 }));
    g.add(mesh(G.box(0.4, 1.2, 0.4), grey, { x: 1.2, y: -1.1, z: side * 6.5, shadow: false }));
  }
  // стабилизаторы
  const tail = new THREE.Shape();
  tail.moveTo(0, 0); tail.lineTo(-4.5, 6); tail.lineTo(-6.5, 6); tail.lineTo(-5.5, 0); tail.closePath();
  const fin = mesh(new THREE.ExtrudeGeometry(tail, { depth: 0.3, bevelEnabled: false }), livery, { x: -9.5, y: 1.2, z: -0.15 });
  g.add(fin);
  const hs = new THREE.Shape();
  hs.moveTo(0, 0); hs.lineTo(-2.5, 6); hs.lineTo(-4, 6); hs.lineTo(-3.5, 0); hs.closePath();
  const hGeo = new THREE.ExtrudeGeometry(hs, { depth: 0.2, bevelEnabled: false });
  for (const side of [1, -1]) {
    const st = mesh(hGeo, white, { x: -10.5, y: side > 0 ? 0.8 : 0.6 });
    st.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(st);
  }
  // шасси
  const gear = new THREE.Group();
  [[10, 0], [1.5, 1.6], [1.5, -1.6]].forEach(([x, z]) => {
    gear.add(mesh(G.cyl(0.12, 0.12, 1.4, 6), grey, { x, y: -2.2, z }));
    gear.add(mesh(G.cyl(0.45, 0.45, 0.35, 12), "#222", { x, y: -2.9, z, rx: Math.PI / 2 }));
  });
  g.add(gear);
  g.userData.gear = gear;
  return g;
}

// ---------------------------------------------------------------------------
// Достопримечательности. Основание в (0,0,0), высота 8–16 единиц.
// ---------------------------------------------------------------------------
const L = {};
const C = { stone: "#d8c7a8", sand: "#e0bb76", white: "#f4f4f2", glass: "#9fc6e8", red: "#c0392b", gold: "#e0a100" };

function frustum(g, rb, rt, h, y, color, seg = 4, rot = Math.PI / 4) {
  g.add(mesh(G.cyl(rt, rb, h, seg), color, { y: y + h / 2, ry: rot }));
}

L.lattice = (g, red) => {
  const c = red ? "#d62828" : "#8a6a45";
  frustum(g, 3.2, 1.6, 3.5, 0, c);
  g.add(mesh(G.box(3.8, 0.35, 3.8), red ? "#f8f9fa" : "#6f5436", { y: 3.6 }));
  frustum(g, 1.5, 0.7, 4, 3.8, c);
  g.add(mesh(G.box(1.7, 0.3, 1.7), red ? "#f8f9fa" : "#6f5436", { y: 7.9 }));
  frustum(g, 0.65, 0.12, 5.5, 8.1, c);
  g.add(mesh(G.cyl(0.05, 0.05, 1.2, 4), c, { y: 14.2 }));
  // арки между ножками
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.TorusGeometry(1.2, 0.18, 4, 10, Math.PI), c, { y: 0.2, ry: (i * Math.PI) / 2, x: Math.sin((i * Math.PI) / 2) * 2.3, z: Math.cos((i * Math.PI) / 2) * 2.3 }));
};
L.lattice_red = (g) => L.lattice(g, true);
L.statue = (g, t, anim) => {
  g.add(mesh(G.box(3.6, 3, 3.6), C.stone, { y: 1.5 }));
  g.add(mesh(G.box(2.6, 1.4, 2.6), "#c9b28d", { y: 3.7 }));
  const green = "#6fb5a1";
  g.add(mesh(G.cyl(0.6, 1.0, 4.2, 10), green, { y: 6.5 }));
  g.add(mesh(G.sph(0.55, 12, 10), green, { y: 9.1 }));
  for (let i = 0; i < 7; i++) g.add(mesh(G.cone(0.1, 0.6, 4), green, { y: 9.65, x: Math.cos(i - 1.5) * 0.4, z: Math.sin(i - 1.5) * 0.3 + 0.1, rz: -Math.cos(i - 1.5) * 0.6 }));
  g.add(mesh(G.cyl(0.18, 0.2, 2.6, 8), green, { x: 0.75, y: 9.6, rz: -0.25 }));
  const flame = mesh(G.cone(0.32, 0.8, 8), mat("#ffb703", { emissive: "#ff7b00", emissiveIntensity: 0.8 }), { x: 1.1, y: 11.2 });
  g.add(flame);
  anim.push((tt) => { flame.scale.y = 1 + Math.sin(tt * 8) * 0.12; });
};
L.wheel = (g, t, anim) => {
  const R = 6;
  [-1, 1].forEach((s) => {
    g.add(mesh(G.cyl(0.2, 0.25, 7.6, 6), "#e9ecef", { x: -2.2, y: 3.6, z: s * 1.3, rz: -0.32 }));
    g.add(mesh(G.cyl(0.2, 0.25, 7.6, 6), "#e9ecef", { x: 2.2, y: 3.6, z: s * 1.3, rz: 0.32 }));
  });
  const wheel = new THREE.Group();
  wheel.position.y = 7.2;
  [-0.6, 0.6].forEach((z) => wheel.add(mesh(G.torus(R, 0.12, 36), "#e9ecef", { z })));
  const cabins = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    wheel.add(mesh(G.cyl(0.05, 0.05, R, 4), "#ced4da", { x: Math.cos(a) * R / 2, y: Math.sin(a) * R / 2, rz: a + Math.PI / 2, shadow: false }));
    const cab = mesh(G.box(0.9, 0.8, 0.9), ["#ff5a1f", "#ffd23f", "#4da3ff", "#3ecf8e"][i % 4], { x: Math.cos(a) * R, y: Math.sin(a) * R });
    wheel.add(cab);
    cabins.push(cab);
  }
  wheel.add(mesh(G.cyl(0.5, 0.5, 1.6, 10), "#adb5bd", { rx: Math.PI / 2 }));
  g.add(wheel);
  anim.push((tt) => { wheel.rotation.z = tt * 0.15; cabins.forEach((c) => (c.rotation.z = -tt * 0.15)); });
};
L.skyscraper = (g) => {
  const glass = mat("#a9c7e4", { metalness: 0.6, roughness: 0.15 });
  [[3.4, 4], [2.7, 3.6], [2.1, 3.2], [1.5, 2.8], [0.9, 2.4]].reduce((y, [w, h]) => { g.add(mesh(G.cyl(w * 0.7, w * 0.78, h, 6), glass, { y: y + h / 2 })); return y + h; }, 0);
  g.add(mesh(G.cyl(0.05, 0.3, 3.5, 6), glass, { y: 17.7 }));
};
L.supertrees = (g, t, anim) => {
  const tops = [];
  [[-3, 7], [0, 9], [3, 7.5]].forEach(([x, h]) => {
    g.add(mesh(G.cyl(0.25, 0.6, h, 8), "#6b4f7a", { x, y: h / 2 }));
    const top = mesh(new THREE.ConeGeometry(2.2, 1.6, 12, 1, true), mat("#9d4edd", { side: THREE.DoubleSide, emissive: "#3c096c" }), { x, y: h + 0.6, rx: Math.PI });
    g.add(top); tops.push(top);
  });
  anim.push((tt) => tops.forEach((m, i) => m.material.emissive.setHSL(((tt * 0.08 + i * 0.3) % 1), 0.7, 0.25)));
  tops.forEach((m) => (m.material = m.material.clone()));
};
L.opera = (g) => {
  g.add(mesh(G.box(12, 1, 6), "#e9d8a6", { y: 0.5 }));
  [[-4, 3.5], [-1.5, 5], [1.5, 6], [4, 4]].forEach(([x, h]) => {
    const shell = mesh(new THREE.SphereGeometry(h, 12, 8, 0, Math.PI, 0, Math.PI / 2), mat(C.white, { side: THREE.DoubleSide }), { x, y: 1, ry: Math.PI / 2, sz: 0.55 });
    g.add(shell);
  });
};
L.clocktower = (g, t, anim) => {
  g.add(mesh(G.box(2.4, 12, 2.4), "#d4b483", { y: 6 }));
  for (let y = 1.5; y < 12; y += 1.6) g.add(mesh(G.box(2.5, 0.12, 2.5), "#c19a5b", { y, shadow: false }));
  g.add(mesh(G.box(2.8, 2.6, 2.8), "#c9a86c", { y: 13.2 }));
  const hands = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const face = new THREE.Group();
    face.position.set(Math.sin(a) * 1.42, 13.2, Math.cos(a) * 1.42);
    face.rotation.y = a;
    face.add(mesh(G.cyl(0.95, 0.95, 0.05, 20), "#fff", { rx: Math.PI / 2, shadow: false }));
    const hand = mesh(G.box(0.08, 0.75, 0.04), "#222", { z: 0.05, y: 0.3, shadow: false });
    const pivot = new THREE.Group(); pivot.position.z = 0.04; pivot.add(hand); face.add(pivot); hands.push(pivot);
    g.add(face);
  }
  g.add(mesh(G.cone(2.1, 4, 4), "#3d405b", { y: 16.5, ry: Math.PI / 4 }));
  g.add(mesh(G.cyl(0.05, 0.08, 1.4, 4), C.gold, { y: 19.1 }));
  anim.push((tt) => hands.forEach((h) => (h.rotation.z = -tt * 0.3)));
};
L.houses = (g) => {
  ["#f4a261", "#e9c46a", "#e76f51", "#90be6d", "#f1faee"].forEach((c, i) => {
    const x = -5.2 + i * 2.6, h = 3.6 + (i % 2) * 0.8;
    g.add(mesh(G.box(2.5, h, 3), c, { x, y: h / 2 }));
    g.add(mesh(G.cyl(1.75, 1.75, 3, 3), "#7f3d27", { x, y: h + 0.85, rx: Math.PI / 2, rz: Math.PI / 2, sx: 1, sy: 1, sz: 0.85 }));
    g.add(mesh(G.box(0.5, 0.7, 0.05), "#cde7f0", { x: x - 0.5, y: h - 1, z: 1.52, shadow: false }));
    g.add(mesh(G.box(0.5, 0.7, 0.05), "#cde7f0", { x: x + 0.5, y: h - 1, z: 1.52, shadow: false }));
  });
};
L.windmill = (g, t, anim) => {
  g.add(mesh(G.cyl(1.2, 2, 7, 8), "#8d6e63", { y: 3.5 }));
  g.add(mesh(G.cone(1.5, 2, 8), "#5d4037", { y: 8 }));
  g.add(mesh(G.box(0.8, 1.6, 0.1), "#fff", { y: 0.8, z: 1.85, shadow: false }));
  const blades = new THREE.Group();
  blades.position.set(0, 6.8, 1.6);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group(); b.rotation.z = (i * Math.PI) / 2;
    b.add(mesh(G.box(0.18, 4.4, 0.1), "#6d4c41", { y: 2.2 }));
    b.add(mesh(G.box(0.9, 3.4, 0.05), "#f8f9fa", { x: 0.55, y: 2.6 }));
    blades.add(b);
  }
  g.add(blades);
  g.add(mesh(G.box(9, 0.15, 1.4), "#4ea8de", { y: 0.08, z: 4 }));
  anim.push((tt) => (blades.rotation.z = tt * 0.7));
};
L.temple_round = (g) => {
  [[4.5, 0.6], [3.8, 0.6], [3.1, 0.6]].reduce((y, [r, h]) => { g.add(mesh(G.cyl(r, r, h, 24), C.white, { y: y + h / 2 })); return y + h; }, 0);
  [[2.4, 1.8, 2.8], [2, 1.5, 2.2], [1.6, 1.2, 1.6]].reduce((y, [r, h, roof]) => {
    g.add(mesh(G.cyl(r * 0.8, r * 0.8, h, 16), "#b5442c", { y: y + h / 2 }));
    g.add(mesh(G.cone(roof, 1, 24), "#1d4e89", { y: y + h + 0.5 }));
    return y + h + 0.9;
  }, 1.8);
  g.add(mesh(G.sph(0.35, 10, 8), C.gold, { y: 10.6 }));
};
L.skyline = (g, t, anim) => {
  const winMat = mat("#2b2d6e", { emissive: "#ffd166", emissiveIntensity: 0.25 });
  [[-5, 1.6, 6], [-3, 1.3, 10], [-1.2, 1.5, 7], [0.8, 1.7, 13], [2.8, 1.4, 8], [4.6, 1.5, 11]].forEach(([x, w, h], i) =>
    g.add(mesh(G.box(w, h, w), i % 2 ? winMat : mat("#4361ee", { metalness: 0.5, roughness: 0.2 }), { x, y: h / 2, z: (i % 3) - 1 })));
  g.add(mesh(G.box(13, 0.1, 3), "#48b5c4", { y: 0.05, z: 3 }));
  anim.push((tt) => (winMat.emissiveIntensity = 0.25 + 0.2 * Math.sin(tt * 1.5)));
};
L.pagoda = (g) => {
  g.add(mesh(G.box(9, 0.6, 5), "#c9b79c", { y: 0.3 }));
  g.add(mesh(G.box(7, 3, 3.6), "#b23a48", { y: 2.1 }));
  for (let x = -3; x <= 3; x += 1.5) g.add(mesh(G.cyl(0.15, 0.15, 3, 6), "#8a2b38", { x, y: 2.1, z: 1.85 }));
  g.add(mesh(G.cone(5.4, 1.8, 4), "#2f3e46", { y: 4.5, ry: Math.PI / 4, sz: 0.62 }));
  g.add(mesh(G.box(4.4, 1.6, 2.4), "#b23a48", { y: 5.9 }));
  g.add(mesh(G.cone(3.8, 1.5, 4), "#2f3e46", { y: 7.4, ry: Math.PI / 4, sz: 0.62 }));
};
L.stupa = (g) => {
  for (let i = 0; i < 6; i++) {
    const r = 3.6 - i * 0.55, h = 1.4;
    g.add(mesh(G.cyl(r - 0.3, r, h, 8), i % 2 ? "#f1e9da" : "#e9e3d5", { y: i * h + h / 2 }));
    g.add(mesh(G.cyl(r - 0.2, r - 0.2, 0.12, 8), i % 2 ? "#f4a261" : "#90e0ef", { y: i * h + h * 0.6, shadow: false }));
  }
  g.add(mesh(G.cone(0.7, 4, 8), "#e9e3d5", { y: 10.4 }));
};
L.arch = (g) => {
  g.add(mesh(G.box(2.2, 9, 2.6), "#c97b63", { x: -2.6, y: 4.5 }));
  g.add(mesh(G.box(2.2, 9, 2.6), "#c97b63", { x: 2.6, y: 4.5 }));
  g.add(mesh(G.box(7.6, 2.4, 2.8), "#b5654f", { y: 10 }));
  g.add(mesh(G.box(5, 1, 2.2), "#b5654f", { y: 11.7 }));
  g.add(mesh(new THREE.TorusGeometry(1.5, 0.35, 6, 14, Math.PI), "#c97b63", { y: 7.4 }));
};
L.onion = (g) => {
  g.add(mesh(G.box(9, 3.5, 6), "#c0392b", { y: 1.75 }));
  [[-3, 4, "#27ae60"], [-1.2, 6, "#e67e22"], [0.6, 8, "#d4ac0d"], [2.4, 6, "#2e86c1"], [3.8, 4.5, "#16a085"]].forEach(([x, h, c], i) => {
    const z = (i % 2) - 0.5;
    g.add(mesh(G.cyl(0.7, 0.8, h, 8), "#e6b0aa", { x, y: 3.5 + h / 2 - 1, z }));
    g.add(mesh(G.sph(1.1, 12, 10), c, { x, y: 3.5 + h - 0.6, z, sy: 1.05 }));
    g.add(mesh(G.cone(0.65, 1.4, 10), c, { x, y: 3.5 + h + 0.7, z }));
    g.add(mesh(G.cyl(0.04, 0.04, 0.9, 4), C.gold, { x, y: 3.5 + h + 1.8, z }));
  });
};
L.domes = (g) => {
  g.add(mesh(G.box(9, 3.5, 9), "#d8a48f", { y: 1.75 }));
  g.add(mesh(new THREE.SphereGeometry(3.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), "#b7887a", { y: 3.5 }));
  [[-3.2, 0], [3.2, 0], [0, -3.2], [0, 3.2]].forEach(([x, z]) => g.add(mesh(new THREE.SphereGeometry(1.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#b7887a", { x, y: 3.5, z })));
  [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]].forEach(([x, z]) => {
    g.add(mesh(G.cyl(0.35, 0.4, 10, 8), "#ead7c3", { x, y: 5, z }));
    g.add(mesh(G.cone(0.42, 1.6, 8), "#8d6e63", { x, y: 10.8, z }));
  });
};
L.pyramids = (g) => {
  [[-6, 0, 3.5, 5], [5, -2, 4.5, 6.5], [-0.5, 2.5, 6, 8.5]].forEach(([x, z, r, h]) => g.add(mesh(G.cone(r * 1.414, h, 4), C.sand, { x, y: h / 2, z, ry: Math.PI / 4 })));
};
L.savanna = (g, t, anim) => {
  g.add(mesh(G.cyl(0.25, 0.35, 5, 7), "#6b4226", { x: -3, y: 2.5 }));
  g.add(mesh(G.sph(3.2, 10, 6), "#606c38", { x: -3, y: 5.6, sy: 0.25 }));
  const gir = new THREE.Group();
  gir.position.set(2.5, 0, 0);
  const sp = "#e9a23b";
  gir.add(mesh(G.box(2.2, 1.3, 1), sp, { y: 3 }));
  [[-0.8, 0.35], [-0.8, -0.35], [0.8, 0.35], [0.8, -0.35]].forEach(([x, z]) => gir.add(mesh(G.cyl(0.12, 0.1, 2.4, 6), sp, { x, y: 1.2, z })));
  const neck = new THREE.Group(); neck.position.set(0.9, 3.4, 0); neck.rotation.z = -0.35;
  neck.add(mesh(G.cyl(0.18, 0.28, 3, 6), sp, { y: 1.5 }));
  neck.add(mesh(G.box(0.9, 0.45, 0.45), sp, { x: 0.25, y: 3.1 }));
  gir.add(neck);
  gir.add(mesh(G.sph(0.2, 6, 4), "#8c5a2b", { y: 3.2, z: 0.51, x: -0.3, sz: 0.2 }));
  gir.add(mesh(G.sph(0.2, 6, 4), "#8c5a2b", { y: 2.8, z: 0.51, x: 0.4, sz: 0.2 }));
  g.add(gir);
  anim.push((tt) => (neck.rotation.z = -0.35 + Math.sin(tt) * 0.05));
};
L.needle = (g, t, anim, tall) => {
  const h = tall ? 16 : 12;
  g.add(mesh(G.cyl(0.35, 1, h, 6), "#cfd8dc", { y: h / 2 }));
  g.add(mesh(G.cyl(1.6, 1.3, 1.4, 12), "#90a4ae", { y: h * 0.72 }));
  g.add(mesh(G.cyl(1.62, 1.62, 0.35, 12), mat("#4fc3f7", { emissive: "#0b5d7a", emissiveIntensity: 0.4 }), { y: h * 0.72 + 0.2, shadow: false }));
  g.add(mesh(G.cyl(0.08, 0.15, 4, 6), "#b0bec5", { y: h + 2 }));
  const light = mesh(G.sph(0.15, 8, 6), mat("#ff5050", { emissive: "#ff0000" }), { y: h + 4.1, shadow: false });
  g.add(light);
  anim.push((tt) => (light.material.emissiveIntensity = 0.5 + 0.5 * Math.sin(tt * 4)));
  light.material = light.material.clone();
};
L.needle_tall = (g, t, anim) => L.needle(g, t, anim, true);
L.bridge = (g) => {
  g.add(mesh(G.box(16, 0.3, 3), "#5ab4e5", { y: 0.15, z: 3 }));
  g.add(mesh(G.box(16, 0.6, 2.2), "#adb5bd", { y: 1.5 }));
  g.add(mesh(G.box(0.5, 13, 0.5), "#e9ecef", { y: 6.5, rz: 0.28 }));
  g.add(mesh(G.box(0.5, 13, 0.5), "#e9ecef", { y: 6.5, rz: -0.28 }));
  const pts = [];
  for (let i = 1; i <= 8; i++) {
    pts.push(new THREE.Vector3(0, 11 - i * 0.6, 0), new THREE.Vector3(-i * 0.95, 1.8, 0));
    pts.push(new THREE.Vector3(0, 11 - i * 0.6, 0), new THREE.Vector3(i * 0.95, 1.8, 0));
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#f8f9fa" })));
};
L.obelisk = (g) => {
  g.add(mesh(G.box(2.4, 0.6, 2.4), C.stone, { y: 0.3 }));
  frustum(g, 0.75, 0.5, 12, 0.6, "#eceff1");
  g.add(mesh(G.cone(0.71, 1.2, 4), "#cfd8dc", { y: 13.2, ry: Math.PI / 4 }));
};
L.mountain = (g) => {
  g.add(mesh(new THREE.ConeGeometry(7, 10, 7), "#52796f", { y: 5 }));
  g.add(mesh(new THREE.ConeGeometry(4, 6, 6), "#354f52", { x: 4, y: 3, z: -1.5 }));
  g.add(mesh(G.box(1.3, 1.2, 1.8), C.white, { y: 10.4 }));
  g.add(mesh(G.cone(1, 1, 4), "#c1121f", { y: 11.5, ry: Math.PI / 4 }));
  g.add(mesh(G.box(0.12, 0.9, 0.12), "#ffd60a", { y: 12.4 }));
  g.add(mesh(G.box(0.5, 0.12, 0.12), "#ffd60a", { y: 12.55 }));
};
L.step_pyramid = (g) => {
  for (let i = 0; i < 5; i++) { const w = 10 - i * 1.8; g.add(mesh(G.box(w, 1.3, w), i % 2 ? "#a68a64" : "#b89b72", { y: i * 1.3 + 0.65 })); }
  g.add(mesh(G.box(1.2, 6.5, 2), "#7f6a4f", { y: 3.25, z: 4.4, rx: -0.9 }));
  g.add(mesh(G.box(2, 1.2, 2), "#936639", { y: 7.1 }));
};

export function buildLandmark(kind) {
  const g = new THREE.Group();
  const anim = [];
  (L[kind] || L.obelisk)(g, 0, anim);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.animate = (t) => anim.forEach((f) => f(t));
  return g;
}

/** Вывеска-табличка: та же надпись, что у makeLabel, но плоская и закреплённая на здании. */
export function makeSign(text, opts = {}) {
  const sp = makeLabel(text, opts);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: sp.material.map, transparent: true }));
  m.scale.set(sp.scale.x, sp.scale.y, 1);
  return m;
}
