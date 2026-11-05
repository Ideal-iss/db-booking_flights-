/** Генератор подземелий по сиду.
 *  Планировка — процедурная (комнаты + коридоры + петли), содержимое комнат — из авторских шаблонов. */
import { Rng } from "../rng";
import { DUNGEON_BY_ID, type DungeonTheme } from "../data/dungeons";
import { ELITE_MODS } from "../data/enemies";

export const CELL = 3; // метров в клетке
export const WALL_H = 4.6;

export const enum Cell {
  Wall = 0,
  Floor = 1,
  Secret = 2,
}

export type RoomKind = "start" | "hall" | "gallery" | "crypt" | "shrine" | "treasure" | "small" | "boss" | "secret";

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
  chests: { id: string; x: number; z: number; rot: number; tier: "chest" | "elite" | "boss" }[];
  traps: { id: string; x: number; z: number }[];
  secrets: { id: string; cx: number; cy: number }[];
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
];

export function generateDungeon(themeId: string, seed: number, level: number): Dungeon {
  const theme = DUNGEON_BY_ID[themeId];
  const rng = new Rng(`${themeId}:${seed}`);
  const N = theme.size;
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
    const horizFirst = rng.chance(0.5);
    const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); carve(x, y, false); } };
    const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); carve(x, y, wide); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
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
      if (!isFloor(x, r.y - 1)) spots.push({ x: cellCenter(x), z: r.y * CELL + 0.25, rot: 0 });
      if (!isFloor(x, r.y + r.h)) spots.push({ x: cellCenter(x), z: (r.y + r.h) * CELL - 0.25, rot: Math.PI });
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      if (!isFloor(r.x - 1, y)) spots.push({ x: r.x * CELL + 0.25, z: cellCenter(y), rot: Math.PI / 2 });
      if (!isFloor(r.x + r.w, y)) spots.push({ x: (r.x + r.w) * CELL - 0.25, z: cellCenter(y), rot: -Math.PI / 2 });
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
    for (let i = 0; i < 30; i++) {
      const blocked =
        props.some((o) => o.solid && Math.abs(o.x - p.x) < o.solid[0] + clearance && Math.abs(o.z - p.z) < o.solid[1] + clearance) ||
        chests.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.9 + clearance) ||
        shrines.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.9 + clearance);
      if (!blocked) return p;
      p = randomFloor(r, margin);
    }
    return p;
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
      chests.push({ id: `c${chests.length}`, x: p.x, z: p.z, rot: rng.range(0, 6.28), tier: "chest" });
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
      spawns.push({ id: `e${eid++}`, type: theme.boss, x: cx, z: cz + 2, room: r.id, boss: true });
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

  const boss = rooms[1];
  const entrance = { x: startC.x, z: (start.y + 0.7) * CELL };
  props.push({ kind: "portal", x: entrance.x, z: entrance.z, rot: 0 });
  lights.push({ x: entrance.x, y: 1.6, z: entrance.z + 0.6, color: "#6f9fd8", kind: "magic" });

  return {
    theme, seed, level, w: N, h: N, cells, rooms,
    start: { x: startC.x, z: startC.z + 1.5, yaw: 0 },
    bossRoom: 1,
    spawns, props, lights, chests, traps, secrets, shrines,
    entrance,
    exit: { x: (boss.x + boss.w / 2) * CELL, z: (boss.y + 1.5) * CELL },
  };
}

/** Клетка проходима для существ (тайная стена — нет, пока не открыта). */
export function walkable(d: Dungeon, x: number, y: number, opened?: Set<string>): boolean {
  if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
  const c = d.cells[y * d.w + x];
  if (c === Cell.Floor) return true;
  if (c === Cell.Secret && opened) return d.secrets.some((s) => s.cx === x && s.cy === y && opened.has(s.id));
  return false;
}
