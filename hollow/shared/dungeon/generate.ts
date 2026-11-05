/** Генератор подземелий по сиду.
 *  Планировка — процедурная (комнаты + коридоры + петли), содержимое комнат — из авторских шаблонов. */
import { Rng } from "../rng";
import { DUNGEON_BY_ID, parseStage, type DungeonTheme } from "../data/dungeons";
import { ELITE_MODS } from "../data/enemies";

export const CELL = 3; // метров в клетке
export const WALL_H = 4.6;

export const enum Cell {
  Wall = 0,
  Floor = 1,
  Secret = 2,
}

export type RoomKind = "start" | "hall" | "gallery" | "crypt" | "shrine" | "treasure" | "small" | "boss" | "secret" | "cave";

export interface Room {
  id: number;
  kind: RoomKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Prop {
  kind: string;
  x: number;
  z: number;
  rot: number;
  /** Твёрдый предмет: половинные размеры коллайдера. */
  solid?: [number, number];
  scale?: number;
  room?: number;
  wall?: boolean;
}

export interface Spawn {
  id: string;
  type: string;
  x: number;
  z: number;
  room: number;
  elite?: string;
  boss?: boolean;
  /** Чемпион с именем: обычный враг, усиленный и охраняющий спуск дальше. */
  champion?: string;
}

export interface Dungeon {
  theme: DungeonTheme;
  seed: number;
  level: number;
  w: number;
  h: number;
  cells: Uint8Array;
  rooms: Room[];
  start: { x: number; z: number; yaw: number };
  bossRoom: number;
  spawns: Spawn[];
  props: Prop[];
  lights: { x: number; y: number; z: number; color: string; kind: "torch" | "brazier" | "candle" | "magic" }[];
  chests: { id: string; x: number; z: number; rot: number; tier: "chest" | "elite" | "boss"; mimic?: boolean }[];
  /** Люстры под сводами: падают от выстрела, взрыва или если перерезать верёвку у стены. */
  chandeliers: { id: string; x: number; z: number; y: number; ax: number; az: number; arot: number }[];
  /** Рычаги огненных решёток: решётки на полу вспыхивают и жгут всех, кто на них стоит. */
  levers: { id: string; x: number; z: number; rot: number; vents: { x: number; z: number }[] }[];
  /** Ключ этапа кампании (a1s1, n:a2s3…) или пусто. */
  stage?: string;
  traps: { id: string; x: number; z: number }[];
  secrets: { id: string; cx: number; cy: number }[];
  /** Разбиваемые урны, ящики и бочки с мелкой добычей. */
  breakables: { id: string; x: number; z: number; kind: "urn" | "crate" | "barrel" | "oil"; rot: number }[];
  /** Высота потолка в каждой клетке (м). */
  ceil: Float32Array;
  /** Записки с историей мира (номер в NOTES). */
  notes: { id: string; x: number; z: number; note: number; rot: number }[];
  shrines: { id: string; x: number; z: number; buff: string }[];
  entrance: { x: number; z: number };
  exit: { x: number; z: number };
}

export const cellCenter = (c: number) => (c + 0.5) * CELL;
export const worldToCell = (v: number) => Math.floor(v / CELL);

/** Авторские шаблоны комнат. */
const TEMPLATES: { kind: RoomKind; w: [number, number]; h: [number, number]; weight: number }[] = [
  { kind: "hall", w: [5, 7], h: [5, 7], weight: 3 },
  { kind: "gallery", w: [3, 3], h: [6, 9], weight: 3 },
  { kind: "gallery", w: [6, 9], h: [3, 3], weight: 3 },
  { kind: "crypt", w: [4, 5], h: [4, 5], weight: 3 },
  { kind: "shrine", w: [3, 4], h: [3, 4], weight: 1 },
  { kind: "treasure", w: [3, 3], h: [3, 3], weight: 1 },
  { kind: "small", w: [3, 4], h: [3, 4], weight: 3 },
  { kind: "cave", w: [5, 8], h: [5, 8], weight: 3 },
];

/** Высота потолка (м) по типу комнаты: в залах — своды, в коридорах — низко. */
const ROOM_CEIL: Record<RoomKind, number> = {
  start: 5.0, hall: 7.2, gallery: 5.4, crypt: 5.6, shrine: 6.2, treasure: 4.6, small: 4.6, boss: 8.0, secret: 4.2, cave: 6.4,
};
export const CORRIDOR_CEIL = 3.6;
/** Максимальная высота потолка — по ней строятся стены физики. */
export const MAX_CEIL = 8.2;

export function generateDungeon(key: string, seed: number, level: number): Dungeon {
  const st = parseStage(key);
  const themeId = st ? st.stage.theme : key;
  const theme = DUNGEON_BY_ID[themeId];
  const bossType = st ? st.stage.boss : theme.boss;
  const champion = st?.stage.champion;
  const rng = new Rng(`${key}:${seed}`);
  // компактные уровни: этап проходится за 5–8 минут
  const N = Math.round(theme.size * 0.72);
  const cells = new Uint8Array(N * N);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? Cell.Wall : cells[y * N + x]);
  const set = (x: number, y: number, v: Cell) => {
    if (x > 0 && y > 0 && x < N - 1 && y < N - 1) cells[y * N + x] = v;
  };
  const rooms: Room[] = [];
  const overlaps = (r: { x: number; y: number; w: number; h: number }, pad = 2) =>
    rooms.some((o) => r.x - pad < o.x + o.w && r.x + r.w + pad > o.x && r.y - pad < o.y + o.h && r.y + r.h + pad > o.y);

  // --- старт у края ---
  const side = rng.int(0, 3);
  const sx = side === 0 ? 2 : side === 1 ? N - 6 : rng.int(4, N - 8);
  const sy = side === 2 ? 2 : side === 3 ? N - 6 : rng.int(4, N - 8);
  rooms.push({ id: 0, kind: "start", x: sx, y: sy, w: 4, h: 4 });

  // --- босс как можно дальше ---
  let best: Room | null = null;
  let bestD = -1;
  for (let i = 0; i < 200; i++) {
    const r = { id: 1, kind: "boss" as RoomKind, x: rng.int(2, N - 11), y: rng.int(2, N - 11), w: 9, h: 9 };
    if (overlaps(r, 3)) continue;
    const d = Math.hypot(r.x + 4.5 - (sx + 2), r.y + 4.5 - (sy + 2));
    if (d > bestD) { bestD = d; best = r; }
  }
  rooms.push(best!);

  // --- остальные комнаты ---
  const target = Math.round(N / 3.2);
  for (let i = 0; i < 600 && rooms.length < target; i++) {
    const t = rng.weighted(TEMPLATES, (x) => x.weight);
    const w = rng.int(t.w[0], t.w[1]);
    const h = rng.int(t.h[0], t.h[1]);
    const r = { id: rooms.length, kind: t.kind, x: rng.int(2, N - w - 2), y: rng.int(2, N - h - 2), w, h };
    if (overlaps(r)) continue;
    rooms.push(r);
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, Cell.Floor);

  // --- формы комнат: пещеры, срезанные углы ---
  for (const r of rooms) {
    if (r.kind === "cave") {
      // клеточный автомат внутри прямоугольника, центр всегда открыт
      const W = r.w, H = r.h;
      let g = Array.from({ length: W * H }, () => rng.chance(0.62));
      const cxr = Math.floor(W / 2), cyr = Math.floor(H / 2);
      for (let k = 0; k < 3; k++) {
        const ng = g.slice();
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              if (g[yy * W + xx]) n++;
            }
            ng[y * W + x] = n >= 5;
          }
        g = ng;
      }
      for (let y = cyr - 1; y <= cyr + 1; y++) for (let x = cxr - 1; x <= cxr + 1; x++) g[y * W + x] = true;
      // оставляем только связную с центром часть
      const keep = new Uint8Array(W * H);
      const q = [cyr * W + cxr];
      keep[q[0]] = 1;
      for (let i = 0; i < q.length; i++) {
        const c = q[i], x = c % W, y = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (g[j] && !keep[j]) { keep[j] = 1; q.push(j); }
        }
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!keep[y * W + x]) set(r.x + x, r.y + y, Cell.Wall);
    } else if (r.kind === "boss" || ((r.kind === "hall" || r.kind === "crypt" || r.kind === "small" || r.kind === "start") && r.w >= 4 && r.h >= 4 && rng.chance(0.65))) {
      // восьмиугольник: срезаем углы (у больших — треугольником в две клетки)
      const big = r.w >= 6 && r.h >= 6;
      const corners: [number, number, number, number][] = [[r.x, r.y, 1, 1], [r.x + r.w - 1, r.y, -1, 1], [r.x, r.y + r.h - 1, 1, -1], [r.x + r.w - 1, r.y + r.h - 1, -1, -1]];
      for (const [x, y, dx, dy] of corners) {
        set(x, y, Cell.Wall);
        if (big) {
          set(x + dx, y, Cell.Wall);
          set(x, y + dy, Cell.Wall);
        }
      }
    }
  }

  // --- коридоры: минимальное остовное дерево + несколько петель ---
  const centers = rooms.map((r) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)]);
  const inTree = new Set([0]);
  const edges: [number, number][] = [];
  while (inTree.size < rooms.length) {
    let bd = Infinity, ba = -1, bb = -1;
    for (const a of inTree) for (let b = 0; b < rooms.length; b++) {
      if (inTree.has(b)) continue;
      const d = Math.abs(centers[a][0] - centers[b][0]) + Math.abs(centers[a][1] - centers[b][1]);
      if (d < bd) { bd = d; ba = a; bb = b; }
    }
    inTree.add(bb);
    edges.push([ba, bb]);
  }
  for (let i = 0; i < 3; i++) {
    const a = rng.int(2, rooms.length - 1), b = rng.int(2, rooms.length - 1);
    if (a !== b) edges.push([a, b]);
  }
  const corridorCells: [number, number][] = [];
  const carve = (x: number, y: number, wide: boolean) => {
    if (at(x, y) === Cell.Wall) corridorCells.push([x, y]);
    set(x, y, Cell.Floor);
    if (wide) set(x + 1, y, Cell.Floor);
  };
  for (const [a, b] of edges) {
    let [x, y] = centers[a];
    const [tx, ty] = centers[b];
    const wide = rng.chance(0.25);
    // извилистый путь: идём к цели, иногда делаем боковой шаг на клетку-две
    let guard = 0;
    let horiz = rng.chance(0.5);
    while ((x !== tx || y !== ty) && guard++ < 400) {
      if (x === tx) horiz = false;
      else if (y === ty) horiz = true;
      else if (rng.chance(0.18)) horiz = !horiz;
      if (rng.chance(0.08) && Math.abs(tx - x) + Math.abs(ty - y) > 4) {
        // боковой шаг поперёк направления
        const jog = rng.chance(0.5) ? 1 : -1;
        for (let k = 0; k < rng.int(1, 2); k++) {
          if (horiz) { const ny = y + jog; if (ny > 1 && ny < N - 2) { y = ny; carve(x, y, false); } }
          else { const nx = x + jog; if (nx > 1 && nx < N - 2) { x = nx; carve(x, y, false); } }
        }
        continue;
      }
      if (horiz) x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
      carve(x, y, false);
      if (wide) {
        if (horiz) set(x, y + 1, Cell.Floor);
        else set(x + 1, y, Cell.Floor);
      }
    }
  }

  // --- тайная комната за ложной стеной ---
  const secrets: Dungeon["secrets"] = [];
  for (let i = 0; i < 300 && secrets.length < 1; i++) {
    const host = rooms[rng.int(2, rooms.length - 1)];
    const dir = rng.int(0, 3);
    const w = 3, h = 3;
    let r: Room, door: [number, number];
    if (dir === 0) { r = { id: rooms.length, kind: "secret", x: host.x + 1, y: host.y - h - 1, w, h }; door = [host.x + 2, host.y - 1]; }
    else if (dir === 1) { r = { id: rooms.length, kind: "secret", x: host.x + 1, y: host.y + host.h + 1, w, h }; door = [host.x + 2, host.y + host.h]; }
    else if (dir === 2) { r = { id: rooms.length, kind: "secret", x: host.x - w - 1, y: host.y + 1, w, h }; door = [host.x - 1, host.y + 2]; }
    else { r = { id: rooms.length, kind: "secret", x: host.x + host.w + 1, y: host.y + 1, w, h }; door = [host.x + host.w, host.y + 2]; }
    if (r.x < 2 || r.y < 2 || r.x + r.w > N - 2 || r.y + r.h > N - 2) continue;
    let free = true;
    for (let y = r.y - 1; y <= r.y + r.h && free; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (at(x, y) !== Cell.Wall) { free = false; break; }
    if (!free || at(door[0], door[1]) !== Cell.Wall) continue;
    rooms.push(r);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, Cell.Floor);
    set(door[0], door[1], Cell.Secret);
    secrets.push({ id: "s0", cx: door[0], cy: door[1] });
  }

  // --- ниши в стенах комнат: тупички на одну клетку ---
  const alcoves: { x: number; y: number; dx: number; dy: number; room: number }[] = [];
  for (const r of rooms) {
    if (r.kind === "secret" || r.kind === "boss") continue;
    const n = rng.int(0, r.kind === "cave" ? 1 : 3);
    for (let i = 0, tries = 0; i < n && tries < 20; tries++) {
      const sideA = rng.int(0, 3);
      const [dx, dy] = [[0, -1], [0, 1], [-1, 0], [1, 0]][sideA];
      const ax = sideA < 2 ? rng.int(r.x + 1, r.x + r.w - 2) : sideA === 2 ? r.x - 1 : r.x + r.w;
      const ay = sideA >= 2 ? rng.int(r.y + 1, r.y + r.h - 2) : sideA === 0 ? r.y - 1 : r.y + r.h;
      if (at(ax - dx, ay - dy) !== Cell.Floor || at(ax, ay) !== Cell.Wall) continue;
      // вокруг ниши должен остаться камень, чтобы она не прорезала соседние залы
      let ok = true;
      for (const [ox, oy] of [[dx, dy], [dy, dx], [-dy, -dx], [dx + dy, dy + dx], [dx - dy, dy - dx]]) if (at(ax + ox, ay + oy) !== Cell.Wall) ok = false;
      if (!ok || ax < 2 || ay < 2 || ax > N - 3 || ay > N - 3) continue;
      set(ax, ay, Cell.Floor);
      alcoves.push({ x: ax, y: ay, dx, dy, room: r.id });
      i++;
    }
  }

  // --- высота потолков ---
  const ceil = new Float32Array(N * N).fill(CORRIDOR_CEIL);
  for (const r of rooms) {
    const h = ROOM_CEIL[r.kind] + (r.kind === "cave" || r.kind === "hall" ? rng.range(-0.4, 0.4) : 0);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) ceil[y * N + x] = h;
  }
  for (const a of alcoves) ceil[a.y * N + a.x] = Math.min(3.4, ceil[(a.y - a.dy) * N + a.x - a.dx]);

  // --- наполнение ---
  const props: Prop[] = [];
  const lights: Dungeon["lights"] = [];
  const spawns: Spawn[] = [];
  const chests: Dungeon["chests"] = [];
  const shrines: Dungeon["shrines"] = [];
  const traps: Dungeon["traps"] = [];
  const isFloor = (x: number, y: number) => at(x, y) === Cell.Floor;
  let eid = 0;

  const wallTorches = (r: Room, count: number) => {
    const spots: { x: number; z: number; rot: number }[] = [];
    for (let x = r.x; x < r.x + r.w; x++) {
      if (isFloor(x, r.y) && !isFloor(x, r.y - 1)) spots.push({ x: cellCenter(x), z: r.y * CELL + 0.25, rot: 0 });
      if (isFloor(x, r.y + r.h - 1) && !isFloor(x, r.y + r.h)) spots.push({ x: cellCenter(x), z: (r.y + r.h) * CELL - 0.25, rot: Math.PI });
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      if (isFloor(r.x, y) && !isFloor(r.x - 1, y)) spots.push({ x: r.x * CELL + 0.25, z: cellCenter(y), rot: Math.PI / 2 });
      if (isFloor(r.x + r.w - 1, y) && !isFloor(r.x + r.w, y)) spots.push({ x: (r.x + r.w) * CELL - 0.25, z: cellCenter(y), rot: -Math.PI / 2 });
    }
    rng.shuffle(spots);
    for (const s of spots.slice(0, count)) {
      props.push({ kind: "torch", ...s, wall: true, room: r.id });
      lights.push({ x: s.x + Math.sin(s.rot) * 0.4, y: 2.9, z: s.z + Math.cos(s.rot) * 0.4, color: theme.palette.light, kind: "torch" });
    }
    return spots.slice(count);
  };

  const wallShelves = (r: Room, spots: { x: number; z: number; rot: number }[], n: number) => {
    for (const s of spots.slice(0, n)) props.push({ kind: theme.wallStyle === "bones" || rng.chance(0.5) ? "shelves" : "niche", ...s, wall: true, room: r.id });
  };

  const pickEnemy = () => rng.weighted(theme.enemies, (e) => e.weight).id;
  const randomFloor = (r: Room, margin = 0.6) => ({
    x: (r.x + margin + rng.next() * (r.w - margin * 2)) * CELL,
    z: (r.y + margin + rng.next() * (r.h - margin * 2)) * CELL,
  });

  /** Случайная точка комнаты, не занятая твёрдыми декорациями и сундуками. */
  const freeFloor = (r: Room, margin: number, clearance: number) => {
    let p = randomFloor(r, margin);
    for (let i = 0; i < 40; i++) {
      const blocked =
        !isFloor(Math.floor(p.x / CELL), Math.floor(p.z / CELL)) ||
        props.some((o) => o.solid && Math.abs(o.x - p.x) < o.solid[0] + clearance && Math.abs(o.z - p.z) < o.solid[1] + clearance) ||
        chests.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.9 + clearance) ||
        shrines.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.9 + clearance);
      if (!blocked) return p;
      p = randomFloor(r, margin);
    }
    // центр комнаты всегда на полу (у пещер он открыт принудительно)
    return { x: (r.x + Math.floor(r.w / 2) + 0.5) * CELL, z: (r.y + Math.floor(r.h / 2) + 0.5) * CELL };
  };

  for (const r of rooms) {
    const cx = (r.x + r.w / 2) * CELL, cz = (r.y + r.h / 2) * CELL;
    const area = r.w * r.h;
    const leftover = wallTorches(r, r.kind === "boss" ? 6 : Math.max(1, Math.round(area / 9)));
    wallShelves(r, leftover, Math.round(leftover.length * (theme.props.includes("shelves") ? 0.45 : 0.15)));

    // декорации шаблона
    if (r.kind === "hall" || r.kind === "boss") {
      const inset = r.kind === "boss" ? 2 : 1.3;
      for (const [px, pz] of [[r.x + inset, r.y + inset], [r.x + r.w - inset, r.y + inset], [r.x + inset, r.y + r.h - inset], [r.x + r.w - inset, r.y + r.h - inset]]) {
        props.push({ kind: "pillar", x: px * CELL, z: pz * CELL, rot: 0, solid: [0.7, 0.7], room: r.id });
      }
    }
    if (r.kind === "crypt") {
      const horiz = r.w >= r.h;
      for (const k of [-1, 1]) {
        props.push({ kind: "sarcophagus", x: cx + (horiz ? 0 : k * 2.4), z: cz + (horiz ? k * 2.4 : 0), rot: horiz ? Math.PI / 2 : 0, solid: horiz ? [1.1, 0.55] : [0.55, 1.1], room: r.id });
      }
    }
    if (r.kind === "gallery") {
      for (let i = 0; i < 3; i++) {
        const p = randomFloor(r, 0.8);
        props.push({ kind: "bones", x: p.x, z: p.z, rot: rng.range(0, 6.28), room: r.id });
      }
    }
    if (r.kind === "shrine") {
      shrines.push({ id: `sh${shrines.length}`, x: cx, z: cz, buff: rng.pick(["power", "fortitude", "haste", "clarity"]) });
      props.push({ kind: "shrine", x: cx, z: cz, rot: 0, solid: [0.6, 0.6], room: r.id });
      lights.push({ x: cx, y: 1.6, z: cz, color: "#7fc4a0", kind: "magic" });
    }
    if (r.kind === "treasure" || r.kind === "secret") {
      chests.push({ id: `c${chests.length}`, x: cx, z: cz, rot: rng.int(0, 3) * (Math.PI / 2), tier: r.kind === "secret" ? "boss" : "elite" });
      props.push({ kind: "candles", x: cx + 1.2, z: cz + 1.1, rot: 0, room: r.id });
      lights.push({ x: cx + 1.2, y: 0.7, z: cz + 1.1, color: "#ffb36a", kind: "candle" });
    } else if (r.kind !== "start" && r.kind !== "boss" && rng.chance(0.18)) {
      const p = freeFloor(r, 0.8, 0.8);
      chests.push({ id: `c${chests.length}`, x: p.x, z: p.z, rot: rng.range(0, 6.28), tier: "chest", mimic: rng.chance(0.3) });
    }

    // жаровни как на референсе — по углам больших комнат
    if (area >= 16 || r.kind === "boss" || r.kind === "start") {
      const n = r.kind === "boss" ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const p = r.kind === "boss"
          ? { x: cx + (i % 2 ? 1 : -1) * 6.5, z: cz + (i < 2 ? 1 : -1) * 6.5 }
          : freeFloor(r, 0.9, 0.8);
        props.push({ kind: "brazier", x: p.x, z: p.z, rot: 0, solid: [0.4, 0.4], room: r.id });
        lights.push({ x: p.x, y: 1.6, z: p.z, color: theme.palette.light, kind: "brazier" });
      }
    }
    for (let i = 0; i < Math.round(area / 10); i++) {
      const kind = rng.pick(theme.props.filter((k) => !["shelves", "pillar", "sarcophagus", "altar"].includes(k)));
      const p = freeFloor(r, 0.5, 0.6);
      if (kind === "candles") lights.push({ x: p.x, y: 0.6, z: p.z, color: "#ffb36a", kind: "candle" });
      props.push({ kind, x: p.x, z: p.z, rot: rng.range(0, 6.28), room: r.id, solid: kind === "urn" || kind === "pews" ? [0.4, 0.4] : undefined });
    }
    if (theme.props.includes("altar") && r.kind === "hall") props.push({ kind: "altar", x: cx, z: cz, rot: 0, solid: [1.0, 0.6], room: r.id });

    // враги
    if (r.kind === "start" || r.kind === "secret") continue;
    if (r.kind === "boss") {
      spawns.push({ id: `e${eid++}`, type: bossType, x: cx, z: cz + 2, room: r.id, boss: true, champion: champion?.name, elite: champion?.elite });
      if (champion) {
        // свита чемпиона
        for (let k = 0; k < 3; k++) {
          const p = freeFloor(r, 1.5, 0.8);
          spawns.push({ id: `e${eid++}`, type: pickEnemy(), x: p.x, z: p.z, room: r.id });
        }
      }
      continue;
    }
    const count = Math.min(7, Math.max(2, Math.round(area / 7 + level * 0.08 + rng.range(-1, 1))));
    const eliteRoom = rng.chance(0.22);
    for (let i = 0; i < count; i++) {
      const p = freeFloor(r, 0.6, 0.7);
      spawns.push({
        id: `e${eid++}`, type: pickEnemy(), x: p.x, z: p.z, room: r.id,
        elite: eliteRoom && i === 0 ? rng.pick(Object.keys(ELITE_MODS)) : undefined,
      });
    }
  }

  // содержимое ниш: свечи, черепа, урны
  for (const a of alcoves) {
    const x = cellCenter(a.x) + a.dx * 0.6, z = cellCenter(a.y) + a.dy * 0.6;
    const kind = rng.pick(["candles", "candles", "skulls", "bones"]);
    props.push({ kind, x, z, rot: rng.range(0, 6.28), room: a.room });
    if (kind === "candles") lights.push({ x, y: 0.6, z, color: "#ffb36a", kind: "candle" });
  }

  // ловушки в коридорах подальше от старта
  const start = rooms[0];
  const startC = { x: (start.x + 2) * CELL, z: (start.y + 2) * CELL };
  rng.shuffle(corridorCells);
  for (const [x, y] of corridorCells) {
    if (traps.length >= Math.round(N / 8)) break;
    const tx = cellCenter(x), tz = cellCenter(y);
    if (Math.hypot(tx - startC.x, tz - startC.z) < 15) continue;
    if (traps.some((t) => Math.hypot(t.x - tx, t.z - tz) < 8)) continue;
    traps.push({ id: `t${traps.length}`, x: tx, z: tz });
  }
  // факелы в длинных коридорах
  for (const [x, y] of corridorCells) {
    if (rng.chance(0.06)) {
      const dirs: [number, number, number][] = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]];
      const d = dirs.find(([dx, dy]) => at(x + dx, y + dy) === Cell.Wall);
      if (!d) continue;
      const px = cellCenter(x) + d[0] * (CELL / 2 - 0.25), pz = cellCenter(y) + d[1] * (CELL / 2 - 0.25);
      props.push({ kind: "torch", x: px, z: pz, rot: d[2], wall: true });
      lights.push({ x: px - d[0] * 0.4, y: 2.9, z: pz - d[1] * 0.4, color: theme.palette.light, kind: "torch" });
    }
  }

  // разбиваемые вещи у стен и записки — отдельный поток случайностей, чтобы не сдвигать остальное
  const r2 = new Rng((seed ^ 0x2f6b1d) >>> 0);
  const breakables: Dungeon["breakables"] = [];
  const notes: Dungeon["notes"] = [];
  const clear = (x: number, z: number, rad: number) =>
    !props.some((o) => o.solid && Math.abs(o.x - x) < o.solid[0] + rad && Math.abs(o.z - z) < o.solid[1] + rad) &&
    !chests.some((c) => Math.hypot(c.x - x, c.z - z) < 1.2 + rad) &&
    !shrines.some((c) => Math.hypot(c.x - x, c.z - z) < 1.2 + rad) &&
    !breakables.some((b) => Math.hypot(b.x - x, b.z - z) < 0.7);
  for (const r of rooms) {
    if (r.kind === "boss") continue;
    const n = r.kind === "secret" || r.kind === "treasure" ? 4 : r2.int(1, 3);
    for (let i = 0, tries = 0; i < n && tries < 30; tries++) {
      // точка вдоль случайной стены комнаты
      const side = r2.int(0, 3);
      const t = r2.range(0.15, 0.85);
      const x = side < 2 ? (r.x + t * r.w) * CELL : side === 2 ? r.x * CELL + 0.6 : (r.x + r.w) * CELL - 0.6;
      const z = side >= 2 ? (r.y + t * r.h) * CELL : side === 0 ? r.y * CELL + 0.6 : (r.y + r.h) * CELL - 0.6;
      if (!isFloor(Math.floor(x / CELL), Math.floor(z / CELL)) || !clear(x, z, 0.5)) continue;
      const cluster = r2.int(1, 3);
      for (let k = 0; k < cluster; k++) {
        const bx = x + (k ? r2.range(-0.7, 0.7) : 0), bz = z + (k ? r2.range(-0.7, 0.7) : 0);
        if (!isFloor(Math.floor(bx / CELL), Math.floor(bz / CELL)) || (k && !clear(bx, bz, 0.4))) continue;
        breakables.push({ id: `b${breakables.length}`, x: bx, z: bz, kind: r2.pick(["urn", "urn", "crate", "barrel", "oil"] as const), rot: r2.range(0, 6.28) });
      }
      i++;
    }
  }
  const noteRooms = r2.shuffle(rooms.filter((r) => r.kind !== "boss" && r.kind !== "start"));
  const noteCount = Math.min(noteRooms.length, r2.int(2, 3) + (noteRooms.some((r) => r.kind === "secret") ? 1 : 0));
  const picked = r2.shuffle(Array.from({ length: 16 }, (_, i) => i));
  for (let i = 0; i < noteCount; i++) {
    const r = noteRooms[i];
    const x = (r.x + r2.range(0.8, r.w - 0.8)) * CELL, z = (r.y + r2.range(0.8, r.h - 0.8)) * CELL;
    if (!isFloor(Math.floor(x / CELL), Math.floor(z / CELL)) || !clear(x, z, 0.4)) continue;
    notes.push({ id: `n${i}`, x, z, note: picked[i], rot: r2.range(0, 6.28) });
  }

  // люстры под высокими сводами, верёвка — к ближайшей стене
  const chandeliers: Dungeon["chandeliers"] = [];
  const levers: Dungeon["levers"] = [];
  for (const r of rooms) {
    const h = ceil[(r.y + (r.h >> 1)) * N + r.x + (r.w >> 1)];
    if (h < 5.3 || r.kind === "cave" || r.kind === "secret") continue;
    const count = r.kind === "boss" ? 2 : r2.chance(0.75) ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const fx = r.kind === "boss" ? (i ? 0.3 : 0.7) : r2.range(0.35, 0.65), fz = r2.range(0.35, 0.65);
      const x = (r.x + r.w * fx) * CELL, z = (r.y + r.h * fz) * CELL;
      if (!isFloor(Math.floor(x / CELL), Math.floor(z / CELL)) || !clear(x, z, 1.2)) continue;
      // ближайшая стена комнаты
      const opts: [number, number, number, number][] = [
        [x, r.y * CELL + 0.2, 0, Math.abs(z - r.y * CELL)],
        [x, (r.y + r.h) * CELL - 0.2, Math.PI, Math.abs((r.y + r.h) * CELL - z)],
        [r.x * CELL + 0.2, z, -Math.PI / 2, Math.abs(x - r.x * CELL)],
        [(r.x + r.w) * CELL - 0.2, z, Math.PI / 2, Math.abs((r.x + r.w) * CELL - x)],
      ];
      opts.sort((a, b) => a[3] - b[3]);
      const [ax, az, arot] = opts.find(([ox, oz]) => isFloor(Math.floor((ox + Math.sin(0) * 0) / CELL), Math.floor(oz / CELL))) || opts[0];
      const y = h - 1.3;
      chandeliers.push({ id: `ch${chandeliers.length}`, x, z, y, ax, az, arot });
      lights.push({ x, y: y - 0.2, z, color: "#ffc070", kind: "torch" });
    }
    // рычаг огненных решёток
    if (r.kind !== "boss" && r.kind !== "start" && r.w * r.h >= 12 && r2.chance(0.4)) {
      const vents: { x: number; z: number }[] = [];
      for (let k = 0, tries = 0; k < 4 && tries < 30; tries++) {
        const vx = (r.x + 0.5 + r2.int(0, r.w - 1)) * CELL, vz = (r.y + 0.5 + r2.int(0, r.h - 1)) * CELL;
        if (!isFloor(Math.floor(vx / CELL), Math.floor(vz / CELL)) || !clear(vx, vz, 1.0) || vents.some((v) => Math.hypot(v.x - vx, v.z - vz) < 2.5)) continue;
        vents.push({ x: vx, z: vz });
        k++;
      }
      const side = r2.int(0, 1);
      const lx = side ? r.x * CELL + 0.25 : (r.x + r.w) * CELL - 0.25;
      const lz = (r.y + r2.range(0.3, r.h - 0.3)) * CELL;
      if (vents.length >= 2 && isFloor(Math.floor((side ? lx + 0.5 : lx - 0.5) / CELL), Math.floor(lz / CELL))) {
        levers.push({ id: `lv${levers.length}`, x: side ? lx + 0.05 : lx - 0.05, z: lz, rot: side ? Math.PI / 2 : -Math.PI / 2, vents });
      }
    }
  }

  const boss = rooms[1];
  const entrance = { x: startC.x, z: (start.y + 0.7) * CELL };
  props.push({ kind: "portal", x: entrance.x, z: entrance.z, rot: 0 });
  lights.push({ x: entrance.x, y: 1.6, z: entrance.z + 0.6, color: "#6f9fd8", kind: "magic" });

  return {
    theme, seed, level, w: N, h: N, cells, rooms,
    start: { x: startC.x, z: startC.z + 1.5, yaw: 0 },
    bossRoom: 1,
    spawns, props, lights, chests, traps, secrets, shrines, breakables, notes, ceil, chandeliers, levers, stage: st ? key : undefined,
    entrance,
    exit: { x: (boss.x + boss.w / 2) * CELL, z: (boss.y + 1.5) * CELL },
  };
}

/** Высота потолка в точке мира. */
export function ceilAt(d: Dungeon, x: number, z: number): number {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  if (cx < 0 || cz < 0 || cx >= d.w || cz >= d.h) return WALL_H;
  return d.ceil ? d.ceil[cz * d.w + cx] : WALL_H;
}

/** Клетка проходима для существ (тайная стена — нет, пока не открыта). */
export function walkable(d: Dungeon, x: number, y: number, opened?: Set<string>): boolean {
  if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
  const c = d.cells[y * d.w + x];
  if (c === Cell.Floor) return true;
  if (c === Cell.Secret && opened) return d.secrets.some((s) => s.cx === x && s.cy === y && opened.has(s.id));
  return false;
}
