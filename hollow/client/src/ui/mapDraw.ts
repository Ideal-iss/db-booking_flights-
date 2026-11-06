/**
 * Отрисовка карты подземелья: общая для большой карты и миникарты.
 * Пол — плитка в цветах текущего акта, стены — тёмные блоки со светлой кромкой,
 * значки — пиксельные глифы, путь к цели — пунктир по разведанному, герой — стрелка с конусом взгляда.
 */
import { CELL, Cell, type Dungeon } from "@shared/dungeon/generate";

export interface MapData {
  d: Dungeon;
  explored: Uint8Array;
  x: number;
  z: number;
  yaw: number;
  allies: { x: number; z: number; name: string }[];
  exitOpen: boolean;
  opened?: { chests: string[]; secrets: string[]; shrines: string[] };
  npcs: { x: number; z: number; name: string; kind: string }[];
  notesRead?: Set<string>;
}

// ---------------------------------------------------------------- глифы 9×9

const GLYPH_PAL: Record<string, string> = {
  k: "#0b0806", w: "#ece6da", W: "#a8a094", r: "#e5484d", g: "#e0b04a", G: "#9a7428", y: "#fff3a0",
  b: "#5aa0e8", B: "#9ad8ff", e: "#5ad08a", E: "#2a8a5a", p: "#b07aff", P: "#d8cdb2", s: "#7a7068", o: "#ff8a2a",
};
const GLYPHS: Record<string, string[]> = {
  boss: ["..kkkkk..", ".kwwwwwk.", "kwwwwwwwk", "kwkkwkkwk", "kwkrwkrwk", "kwwwkwwwk", ".kwwwwwk.", ".kwkwkwk.", "..kkkkk.."],
  chest: [".........", ".kkkkkkk.", "kgggggggk", "kGGGyGGGk", "kkkkykkkk", "kgggggggk", "kgggggggk", "kGGGGGGGk", ".kkkkkkk."],
  chestOpen: [".kkkkkkk.", "kGGGGGGGk", "k.......k", ".kkkkkkk.", "kWWWWWWWk", "kWkkkkkWk", "kWWWWWWWk", "kWWWWWWWk", ".kkkkkkk."],
  portal: ["...kkk...", "..kBBBk..", ".kBbbbBk.", "kBbwwwbBk", "kBbwwwbBk", "kBbwwwbBk", ".kBbbbBk.", "..kBBBk..", "...kkk..."],
  entrance: [".......kk", ".....kkwk", ".....kwwk", "...kkwwwk", "...kwwwwk", ".kkwwwwwk", ".kwwwwwwk", "kwwwwwwwk", "kkkkkkkkk"],
  shrine: ["....k....", "...kek...", "..keyek..", "..kEeEk..", "...kek...", "..kkkkk..", ".ksssssk.", ".ksssssk.", ".kkkkkkk."],
  shrineUsed: ["....k....", "...kWk...", "..kWWWk..", "..kWsWk..", "...kWk...", "..kkkkk..", ".ksssssk.", ".ksssssk.", ".kkkkkkk."],
  note: ["kkkkkkk..", "kPPPPPkk.", "kPkkkPPk.", "kPPPPPPk.", "kPkkkkPk.", "kPPPPPPk.", "kPkkkPPk.", "kPPPPPPk.", "kkkkkkkk."],
  lever: [".......kk", "......krk", ".....krk.", "....kGk..", "...kGk...", "..kkkkk..", ".ksssssk.", ".kkkkkkk.", "........."],
  secret: ["....k....", "...kpk...", "kkkkpkkkk", "kpppwpppk", ".kppppk..", "..kpppk..", ".kppkppk.", ".kpk.kpk.", ".kk...kk."],
  npc: ["...kkk...", "..kgggk..", "..kgggk..", "...kkk...", "..kgggk..", ".kgggggk.", ".kgggggk.", ".kgggggk.", ".kkkkkkk."],
  ally: ["...kkk...", "..keeek..", "..keeek..", "...kkk...", "..keeek..", ".keeeeek.", ".keeeeek.", ".keeeeek.", ".kkkkkkk."],
  fire: ["....k....", "...kok...", "..koyok..", "..koyok..", ".kooyook.", ".koyyyok.", "kkkkkkkkk", "kGkGkGkGk", "kkkkkkkkk"],
};
const glyphCache = new Map<string, HTMLCanvasElement>();

/** Глиф как маленький холст (для легенды и карты). */
export function glyph(name: string): HTMLCanvasElement {
  let c = glyphCache.get(name);
  if (c) return c;
  const m = GLYPHS[name];
  c = document.createElement("canvas");
  c.width = c.height = 9;
  const g = c.getContext("2d")!;
  m.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    g.fillStyle = GLYPH_PAL[ch];
    g.fillRect(x, y, 1, 1);
  }));
  glyphCache.set(name, c);
  return c;
}

// ---------------------------------------------------------------- цвета

function hexRgb(h: string) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixHex(a: string, b: string, t: number) {
  const A = hexRgb(a), B = hexRgb(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

const ROOM_TINT: Partial<Record<string, string>> = { boss: "#8a2a24", shrine: "#2a7a5a", treasure: "#9a7a2a", secret: "#5a2a8a", start: "#4a6a8a" };

// ---------------------------------------------------------------- путь к цели

/** Кратчайший путь по проходимым клеткам (BFS). Возвращает список клеток от героя к цели. */
export function findPath(d: Dungeon, openSecret: (cx: number, cy: number) => boolean, from: [number, number], to: [number, number]): [number, number][] {
  const W = d.w, H = d.h;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (d.cells[y * W + x] === Cell.Floor || (d.cells[y * W + x] === Cell.Secret && openSecret(x, y)));
  if (!ok(from[0], from[1])) return [];
  const prev = new Int32Array(W * H).fill(-1);
  const q = [from[1] * W + from[0]];
  prev[q[0]] = q[0];
  const goal = to[1] * W + to[0];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i === goal) break;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * W + nx;
      if (ok(nx, ny) && prev[j] < 0) { prev[j] = i; q.push(j); }
    }
  }
  if (prev[goal] < 0) return [];
  const out: [number, number][] = [];
  for (let i = goal; ; i = prev[i]) {
    out.push([i % W, (i / W) | 0]);
    if (prev[i] === i) break;
  }
  return out.reverse();
}

/** Куда ведёт карта: открытый портал, иначе логово хранителя. */
export function objective(data: MapData): { cx: number; cy: number; kind: "portal" | "boss" } | null {
  const d = data.d;
  if (d.theme.id === "hub") return null;
  if (data.exitOpen) return { cx: Math.floor(d.exit.x / CELL), cy: Math.floor(d.exit.z / CELL), kind: "portal" };
  const b = d.rooms[d.bossRoom];
  if (!b) return null;
  return { cx: Math.floor(b.x + b.w / 2), cy: Math.floor(b.y + b.h / 2), kind: "boss" };
}

// ---------------------------------------------------------------- отрисовка

export interface DrawOpts {
  /** Пикселей на клетку. */
  S: number;
  /** Клетка (дробная) в центре холста. */
  cx: number;
  cy: number;
  /** Поворот карты (для миникарты «по взгляду»). */
  rotate?: number;
  t: number;
  /** Подписи жителей лагеря и прочие надписи. */
  labels?: boolean;
  path?: boolean;
}

export function drawMap(g: CanvasRenderingContext2D, data: MapData, o: DrawOpts) {
  const { d } = data;
  const W = g.canvas.width, H = g.canvas.height;
  const S = o.S;
  const hub = d.theme.id === "hub";
  const ex = (x: number, y: number) => x >= 0 && y >= 0 && x < d.w && y < d.h && (hub || data.explored[y * d.w + x] === 1);
  const openSecret = (x: number, y: number) => !!data.opened?.secrets.some((id) => d.secrets.some((s) => s.id === id && s.cx === x && s.cy === y));
  const floorAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
    const c = d.cells[y * d.w + x];
    return c === Cell.Floor || (c === Cell.Secret && openSecret(x, y));
  };
  const roomOf = new Int16Array(d.w * d.h).fill(-1);
  d.rooms.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x >= 0 && y >= 0 && x < d.w && y < d.h) roomOf[y * d.w + x] = i; });

  g.save();
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#0e0d0b";
  g.fillRect(0, 0, W, H);
  g.translate(W / 2, H / 2);
  if (o.rotate) g.rotate(o.rotate);
  g.translate(-o.cx * S, -o.cy * S);
  // видимое окно в клетках (с запасом на поворот)
  const reach = Math.ceil(Math.hypot(W, H) / 2 / S) + 2;
  const x0 = Math.max(0, Math.floor(o.cx - reach)), x1 = Math.min(d.w - 1, Math.ceil(o.cx + reach));
  const y0 = Math.max(0, Math.floor(o.cy - reach)), y1 = Math.min(d.h - 1, Math.ceil(o.cy + reach));
  const pal = d.theme.palette;
  const floorBase = mixHex(pal.floor, "#8a7c66", 0.45);
  const wallBody = mixHex(pal.wall, "#1a1714", 0.72);
  const edge = mixHex(pal.wall, "#e8dcc4", 0.55);

  // 1. стены вокруг разведанного пола
  g.fillStyle = wallBody;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (floorAt(x, y)) continue;
    let near = false;
    for (let j = -1; j <= 1 && !near; j++) for (let i = -1; i <= 1; i++) if (floorAt(x + i, y + j) && ex(x + i, y + j)) { near = true; break; }
    if (near) g.fillRect(x * S, y * S, S, S);
  }
  // 2. пол: плитка, оттенок по типу комнаты, швы
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!floorAt(x, y)) continue;
    const i = y * d.w + x;
    if (!ex(x, y)) {
      // неразведанное продолжение рядом с разведанным — точечный «туман»
      let near = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ex(x + dx, y + dy) && floorAt(x + dx, y + dy)) near = true;
      if (!near) continue;
      g.fillStyle = floorBase + "55";
      const step = Math.max(2, Math.round(S / 4));
      for (let py = 0; py < S; py += step) for (let px = (py / step) % 2 ? step / 2 : 0; px < S; px += step) g.fillRect(x * S + px, y * S + py, Math.max(1, step / 2), Math.max(1, step / 2));
      continue;
    }
    const r = roomOf[i] >= 0 ? d.rooms[roomOf[i]] : null;
    let col = r && ROOM_TINT[r.kind] ? mixHex(floorBase, ROOM_TINT[r.kind]!, 0.32) : floorBase;
    if (!r) col = mixHex(col, "#0e0d0b", 0.12); // коридоры чуть темнее комнат
    if (d.cells[i] === Cell.Secret) col = mixHex(col, "#5a2a8a", 0.4);
    if ((x + y) % 2) col = mixHex(col, "#0e0d0b", 0.06);
    g.fillStyle = col;
    g.fillRect(x * S, y * S, S, S);
    if (S >= 9) {
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(x * S, y * S + S - 1, S, 1);
      g.fillRect(x * S + S - 1, y * S, 1, S);
    }
  }
  // 3. светлая кромка там, где пол упирается в стену
  const lw = Math.max(1, Math.round(S / 7));
  g.fillStyle = edge;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!floorAt(x, y) || !ex(x, y)) continue;
    if (!floorAt(x, y - 1)) g.fillRect(x * S, y * S, S, lw);
    if (!floorAt(x, y + 1)) g.fillRect(x * S, y * S + S - lw, S, lw);
    if (!floorAt(x - 1, y)) g.fillRect(x * S, y * S, lw, S);
    if (!floorAt(x + 1, y)) g.fillRect(x * S + S - lw, y * S, lw, S);
  }
  // 4. комната, где стоит герой, — обводка
  const pcx = data.x / CELL, pcy = data.z / CELL;
  const here = roomOf[Math.floor(pcy) * d.w + Math.floor(pcx)];
  if (here >= 0 && !hub) {
    const r = d.rooms[here];
    g.strokeStyle = "rgba(227,164,90,0.55)";
    g.lineWidth = Math.max(1, S / 8);
    g.setLineDash([Math.max(2, S / 3), Math.max(2, S / 4)]);
    g.strokeRect(r.x * S - 1, r.y * S - 1, r.w * S + 2, r.h * S + 2);
    g.setLineDash([]);
  }
  // 5. путь к цели: пунктир по разведанному, стрелка у границы тумана
  const obj = objective(data);
  if (obj && o.path !== false) {
    const path = findPath(d, openSecret, [Math.floor(pcx), Math.floor(pcy)], [obj.cx, obj.cy]);
    const col = obj.kind === "portal" ? "#9ad8ff" : "#e3a45a";
    const dot = Math.max(2, Math.round(S / 5));
    let last: [number, number] | null = null;
    for (let k = 1; k < path.length; k++) {
      const [x, y] = path[k];
      if (!ex(x, y)) {
        if (last) arrow(g, (last[0] + 0.5) * S, (last[1] + 0.5) * S, Math.atan2(y - last[1], x - last[0]), Math.max(5, S * 0.55), col);
        break;
      }
      const pulse = (Math.floor(o.t * 6) - k) % 3 === 0;
      g.fillStyle = pulse ? "#fff3d0" : col;
      g.fillRect((x + 0.5) * S - dot / 2, (y + 0.5) * S - dot / 2, dot, dot);
      last = [x, y];
    }
  }
  // 6. значки
  const gs = Math.max(1, Math.round(S / 9));
  const put = (name: string, wx: number, wz: number, always = false) => {
    const cx = Math.floor(wx / CELL), cy = Math.floor(wz / CELL);
    if (!always && !ex(cx, cy)) return;
    const px = (wx / CELL) * S, py = (wz / CELL) * S;
    g.save();
    g.translate(px, py);
    if (o.rotate) g.rotate(-o.rotate);
    g.drawImage(glyph(name), -4.5 * gs, -4.5 * gs, 9 * gs, 9 * gs);
    g.restore();
  };
  if (!hub) put("entrance", d.entrance.x, d.entrance.z);
  for (const s of d.secrets) if (openSecret(s.cx, s.cy)) put("secret", (s.cx + 0.5) * CELL, (s.cy + 0.5) * CELL);
  for (const n of d.notes) put("note", n.x, n.z);
  for (const l of d.levers) put("lever", l.x, l.z);
  for (const s of d.shrines) put(data.opened?.shrines.includes(s.id) ? "shrineUsed" : "shrine", s.x, s.z);
  for (const c of d.chests) put(data.opened?.chests.includes(c.id) ? "chestOpen" : "chest", c.x, c.z);
  if (obj) {
    const wx = (obj.cx + 0.5) * CELL, wz = (obj.cy + 0.5) * CELL;
    // цель всегда видна и мерцает
    if (Math.floor(o.t * 2) % 2 === 0 || obj.kind === "boss") put(obj.kind === "portal" ? "portal" : "boss", wx, wz, true);
  }
  for (const n of data.npcs) {
    put(n.kind === "cat" ? "fire" : n.kind === "gate" ? "portal" : n.kind === "stash" ? "chest" : "npc", n.x, n.z, true);
  }
  for (const a of data.allies) put("ally", a.x, a.z, true);
  if (o.labels) {
    g.font = `${Math.max(10, Math.round(S * 0.45))}px "IBM Plex Mono", monospace`;
    g.textAlign = "center";
    for (const n of data.npcs) {
      if (n.kind === "cat") continue;
      const px = (n.x / CELL) * S, py = (n.z / CELL) * S - 6 * gs;
      g.save();
      g.translate(px, py);
      if (o.rotate) g.rotate(-o.rotate);
      g.fillStyle = "rgba(14,13,11,0.75)";
      const w = g.measureText(n.name).width + 8;
      g.fillRect(-w / 2, -12, w, 15);
      g.fillStyle = "#ece6da";
      g.fillText(n.name, 0, 0);
      g.restore();
    }
  }
  // 7. герой: конус взгляда и стрелка
  g.save();
  g.translate(pcx * S, pcy * S);
  g.rotate(-data.yaw);
  const cone = S * 3.2;
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, cone);
  grad.addColorStop(0, "rgba(255,230,180,0.32)");
  grad.addColorStop(1, "rgba(255,230,180,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, cone, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  g.closePath();
  g.fill();
  const a = Math.max(5, S * 0.55);
  g.fillStyle = "#0b0806";
  g.beginPath(); g.moveTo(0, -a - 2); g.lineTo(a * 0.8 + 2, a * 0.8 + 1); g.lineTo(0, a * 0.35 + 1); g.lineTo(-a * 0.8 - 2, a * 0.8 + 1); g.closePath(); g.fill();
  g.fillStyle = "#ece6da";
  g.beginPath(); g.moveTo(0, -a); g.lineTo(a * 0.8, a * 0.8); g.lineTo(0, a * 0.35); g.lineTo(-a * 0.8, a * 0.8); g.closePath(); g.fill();
  g.restore();
  g.restore();
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, ang: number, s: number, col: string) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = "#0b0806";
  g.beginPath(); g.moveTo(s + 2, 0); g.lineTo(-s * 0.4 - 1, -s * 0.75 - 1); g.lineTo(-s * 0.4 - 1, s * 0.75 + 1); g.closePath(); g.fill();
  g.fillStyle = col;
  g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.4, -s * 0.7); g.lineTo(-s * 0.4, s * 0.7); g.closePath(); g.fill();
  g.restore();
}

/** Границы разведанного (в клетках) — чтобы карта при обзоре занимала всё окно. */
export function exploredBounds(data: MapData) {
  const d = data.d;
  if (d.theme.id === "hub") return { x0: 0, y0: 0, x1: d.w, y1: d.h };
  let x0 = d.w, y0 = d.h, x1 = 0, y1 = 0;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); };
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (data.explored[y * d.w + x]) add(x, y);
  const b = d.rooms[d.bossRoom];
  if (b) { add(b.x, b.y); add(b.x + b.w - 1, b.y + b.h - 1); }
  if (x1 <= x0) return { x0: 0, y0: 0, x1: d.w, y1: d.h };
  return { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 };
}

/** Сводка для боковой панели: сколько разведано и найдено. */
export function mapStats(data: MapData) {
  const d = data.d;
  let floor = 0, seen = 0;
  for (let i = 0; i < d.cells.length; i++) if (d.cells[i] === Cell.Floor) { floor++; if (data.explored[i]) seen++; }
  const known = (wx: number, wz: number) => data.explored[Math.floor(wz / CELL) * d.w + Math.floor(wx / CELL)] === 1;
  return {
    explored: floor ? Math.round((seen / floor) * 100) : 0,
    chests: { opened: d.chests.filter((c) => data.opened?.chests.includes(c.id)).length, known: d.chests.filter((c) => known(c.x, c.z)).length, total: d.chests.length },
    shrines: { used: d.shrines.filter((s) => data.opened?.shrines.includes(s.id)).length, known: d.shrines.filter((s) => known(s.x, s.z)).length, total: d.shrines.length },
    secrets: { found: data.opened?.secrets.length || 0, total: d.secrets.length },
    notes: { known: d.notes.filter((n) => known(n.x, n.z)).length, total: d.notes.length },
  };
}
