/** Генератор подземелий по сиду.
 *  Планировка — процедурная (комнаты + коридоры + петли), содержимое комнат — из авторских шаблонов. */
import { Rng } from "../rng";
import { DUNGEON_BY_ID, parseStage, type DungeonTheme } from "../data/dungeons";
import { ELITE_MODS } from "../data/enemies";
import { BOSS_ARENAS, BOSS_CHUNKS, CHUNKS, transformMap, type ChunkDef } from "./chunks";
import { DIRS, HEADROOM, LIQUID_DEPTH, STAIR_RISE, passable } from "./terrain";

export const CELL = 3; // метров в клетке
export const WALL_H = 4.6;

export const enum Cell {
  Wall = 0,
  Floor = 1,
  Secret = 2,
  /** Пропасть: пола нет, упавший возвращается к краю с уроном. */
  Chasm = 3,
  /** Запертая дверь или решётка: проходима, когда открыта. */
  Door = 4,
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
  levers: { id: string; x: number; z: number; rot: number; vents: { x: number; z: number }[]; opens?: string[] }[];
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
  // ---- рельеф и механики окружения (необязательные: у лагеря и старых уровней их нет)
  /** Высота пола в каждой клетке (м). Бассейны — дно, поверхность жидкости выше на LIQUID_DEPTH. */
  floor?: Float32Array;
  /** Лестницы: клетка поднимается на STAIR_RISE в сторону dir (0 — север/−y, 1 — юг/+y, 2 — запад/−x, 3 — восток/+x). */
  stairs?: { cx: number; cy: number; dir: 0 | 1 | 2 | 3; h0: number }[];
  /** Жидкость в клетке: 0 — нет, 1 — вода, 2 — кровь, 3 — лава, 4 — пустота. */
  liquid?: Uint8Array;
  /** Мосты над пропастью (клетка — пол из досок). */
  bridge?: Uint8Array;
  /** Запертые двери (ключ) и решётки (плита или рычаг). */
  doors?: { id: string; cx: number; cy: number; kind: "key" | "gate"; axis: "x" | "z" }[];
  keys?: { id: string; x: number; z: number }[];
  plates?: { id: string; x: number; z: number; opens: string[] }[];
  /** Треснувший пол: проваливается в яму высотой pitH, выход — пандус ramp. */
  cracks?: { id: string; cells: [number, number][]; pitH: number; ramp: { cx: number; cy: number; dir: 0 | 1 | 2 | 3 } }[];
}

export const cellCenter = (c: number) => (c + 0.5) * CELL;
export const worldToCell = (v: number) => Math.floor(v / CELL);

/** Высота потолка (м) по типу комнаты: в залах — своды, в коридорах — низко. */
const ROOM_CEIL: Record<RoomKind, number> = {
  start: 5.0, hall: 7.2, gallery: 5.4, crypt: 5.6, shrine: 6.2, treasure: 4.6, small: 4.6, boss: 8.0, secret: 4.2, cave: 6.4,
};
export const CORRIDOR_CEIL = 3.6;
/** Максимальная высота потолка — по ней строятся стены физики. */
export const MAX_CEIL = 8.2;

// ------------------------------------------------------------ сборка уровня из авторских фрагментов

interface Placed {
  def: ChunkDef;
  map: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  room: Room;
  doors: { x: number; y: number; ox: number; oy: number; used: boolean }[];
}

// уровни пола символов (1.2 = STAIR_RISE; литералом — модули рельефа и генератора импортируют друг друга)
const LEVEL_OF: Record<string, number> = { ".": 0, "1": 1.2, "2": 2.4, "-": -1.2, _: -2.4, "@": 0, "=": 0, x: 0 };
const ARROW_DIR: Record<string, 0 | 1 | 2 | 3> = { "^": 0, v: 1, "<": 2, ">": 3 };

/** Высоты клеток фрагмента: известные символы сразу, вещи и жидкости — от соседей; низ каждой лестницы. */
export function chunkLevels(map: string[]) {
  const H = map.length, W = map[0].length;
  const lv = new Array<number | null>(W * H).fill(null);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = map[y][x];
    if (ch in LEVEL_OF) lv[y * W + x] = LEVEL_OF[ch];
  }
  const isTerrain = (ch: string) => ch === "#" || ch === ":" || ch in ARROW_DIR;
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const ch = map[y][x];
      if (lv[i] !== null || isTerrain(ch)) continue;
      const votes = new Map<number, number>();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = lv[(y + dy) * W + x + dx];
        if (v !== null && v !== undefined) votes.set(v, (votes.get(v) || 0) + 1);
      }
      if (!votes.size) continue;
      lv[i] = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      changed = true;
    }
    if (!changed) break;
  }
  const stairBase = (x: number, y: number, depth = 0): number => {
    const dir = ARROW_DIR[map[y][x]];
    const [ux, uy] = DIRS[dir];
    const bx = x - ux, by = y - uy;
    const bch = map[by]?.[bx];
    if (bch && bch in ARROW_DIR && depth < 6) return stairBase(bx, by, depth + 1) + 1.2;
    return lv[by * W + bx] ?? 0;
  };
  /** Ошибки лестниц: верх не совпадает с клеткой впереди. */
  const errors: string[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const ch = map[y][x];
    if (!(ch in ARROW_DIR)) continue;
    const [ux, uy] = DIRS[ARROW_DIR[ch]];
    const fch = map[y + uy][x + ux];
    const top = stairBase(x, y) + 1.2;
    const front = fch in ARROW_DIR ? stairBase(x + ux, y + uy) : lv[(y + uy) * W + x + ux];
    if (front === null || Math.abs(front - top) > 0.01) errors.push(`лестница (${x},${y}) «${ch}»: верх ${top.toFixed(1)}, впереди ${front}`);
    const back = map[y - uy][x - ux];
    if (back === "#" || back === ":") errors.push(`лестница (${x},${y}) «${ch}»: позади ${back}`);
  }
  return { lv, stairBase, errors };
}

/** Жидкость темы: вода в склепах и соборе, кровь в святилище, пустота в бездне. */
function themeLiquid(theme: string) {
  return theme === "sanctum" ? 2 : theme === "abyss" ? 4 : 1;
}

export function generateDungeon(key: string, seed: number, level: number): Dungeon {
  // если сборка не прошла проверку связности — пробуем ещё раз с другой раскладкой
  for (let attempt = 0; attempt < 12; attempt++) {
    const d = buildLevel(key, seed, level, attempt);
    if (d) return d;
  }
  return buildLevel(key, seed, level, 99, true)!;
}

function buildLevel(key: string, seed: number, level: number, attempt: number, relaxed = false): Dungeon | null {
  const st = parseStage(key);
  const themeId = st ? st.stage.theme : key;
  const theme = DUNGEON_BY_ID[themeId];
  const bossType = st ? st.stage.boss : theme.boss;
  const champion = st?.stage.champion;
  const rng = new Rng(attempt ? `${key}:${seed}:${attempt}` : `${key}:${seed}`);
  // компактные уровни: этап проходится за 5–8 минут
  const N = Math.round(theme.size * 0.92);
  const cells = new Uint8Array(N * N);
  const floor = new Float32Array(N * N);
  const liquid = new Uint8Array(N * N);
  const bridge = new Uint8Array(N * N);
  const stairs: NonNullable<Dungeon["stairs"]> = [];
  const doors: NonNullable<Dungeon["doors"]> = [];
  const keys: NonNullable<Dungeon["keys"]> = [];
  const plates: NonNullable<Dungeon["plates"]> = [];
  const cracks: NonNullable<Dungeon["cracks"]> = [];
  const gateLevers: Dungeon["levers"] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? Cell.Wall : cells[y * N + x]);
  const set = (x: number, y: number, v: Cell) => {
    if (x > 0 && y > 0 && x < N - 1 && y < N - 1) cells[y * N + x] = v;
  };
  const footprint = new Int16Array(N * N).fill(-1);
  const placed: Placed[] = [];
  const rooms: Room[] = [];
  const liq = themeLiquid(themeId);

  const fits = (x0: number, y0: number, w: number, h: number, pad: number) => {
    if (x0 < 1 || y0 < 1 || x0 + w > N - 1 || y0 + h > N - 1) return false;
    for (let y = y0 - pad; y < y0 + h + pad; y++) for (let x = x0 - pad; x < x0 + w + pad; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      if (footprint[y * N + x] >= 0) return false;
    }
    return true;
  };

  /** Ставим фрагмент: клетки, высоты, жидкости, механизмы. */
  const place = (def: ChunkDef, map: string[], x0: number, y0: number, kind: RoomKind) => {
    const H = map.length, W = map[0].length;
    const idx = placed.length;
    const room: Room = { id: rooms.length, kind, x: x0 + 1, y: y0 + 1, w: W - 2, h: H - 2 };
    const { lv, stairBase } = chunkLevels(map);
    const gateIds: string[] = [];
    const crackCells: [number, number][] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = map[y][x];
      const gx = x0 + x, gy = y0 + y, gi = gy * N + gx;
      footprint[gi] = idx;
      if (ch === "#") continue;
      if (ch === "@") continue; // проёмы открываются только если к ним подвели коридор
      if (ch === ":") { cells[gi] = Cell.Chasm; continue; }
      cells[gi] = ch === "D" || ch === "G" ? Cell.Door : Cell.Floor;
      if (ch in ARROW_DIR) {
        stairs.push({ cx: gx, cy: gy, dir: ARROW_DIR[ch], h0: stairBase(x, y) });
        floor[gi] = stairBase(x, y);
        continue;
      }
      let h = lv[y * W + x] ?? 0;
      if (ch === "~" || ch === "L") { liquid[gi] = ch === "L" ? 3 : liq; h -= LIQUID_DEPTH; }
      if (ch === "=") bridge[gi] = 1;
      floor[gi] = h;
      if (ch === "D" || ch === "G") {
        const axis = map[y][x - 1] === "#" || map[y][x + 1] === "#" ? "x" : "z";
        const id = `door${doors.length}`;
        doors.push({ id, cx: gx, cy: gy, kind: ch === "D" ? "key" : "gate", axis });
        if (ch === "G") gateIds.push(id);
      }
      if (ch === "x") crackCells.push([gx, gy]);
    }
    // механизмы фрагмента: плиты и рычаги открывают его решётки
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const ch = map[y][x];
      const wx = (x0 + x + 0.5) * CELL, wz = (y0 + y + 0.5) * CELL;
      if (ch === "P") plates.push({ id: `pl${plates.length}`, x: wx, z: wz, opens: gateIds });
      if (ch === "K") keys.push({ id: `key${keys.length}`, x: wx, z: wz });
      if (ch === "l") {
        const wall = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]].find(([dx, dy]) => map[y + dy][x + dx] === "#");
        if (wall) {
          const [dx, dy, rot] = wall;
          gateLevers.push({ id: `glv${gateLevers.length}`, x: wx + dx * (CELL / 2 - 0.3), z: wz + dy * (CELL / 2 - 0.3), rot, vents: [], opens: gateIds });
        }
      }
    }
    // треснувший пол: группы клеток, у каждой — пандус из ямы к краю
    const seen = new Set<string>();
    for (const [sx, sy] of crackCells) {
      if (seen.has(`${sx},${sy}`)) continue;
      const group: [number, number][] = [];
      const q: [number, number][] = [[sx, sy]];
      seen.add(`${sx},${sy}`);
      while (q.length) {
        const [cx, cy] = q.pop()!;
        group.push([cx, cy]);
        for (const [dx, dy] of DIRS) {
          const k = `${cx + dx},${cy + dy}`;
          if (!seen.has(k) && crackCells.some(([a, b]) => a === cx + dx && b === cy + dy)) { seen.add(k); q.push([cx + dx, cy + dy]); }
        }
      }
      const inGroup = (x: number, y: number) => group.some(([a, b]) => a === x && b === y);
      let ramp: { cx: number; cy: number; dir: 0 | 1 | 2 | 3 } | null = null;
      for (const [cx, cy] of group) {
        for (let dir = 0 as 0 | 1 | 2 | 3; dir < 4; dir = (dir + 1) as 0 | 1 | 2 | 3) {
          const [ux, uy] = DIRS[dir];
          const nx = cx + ux, ny = cy + uy;
          if (inGroup(nx, ny) || cells[ny * N + nx] !== Cell.Floor || Math.abs(floor[ny * N + nx]) > 0.01) continue;
          if (!inGroup(cx - ux, cy - uy)) continue;
          ramp = { cx, cy, dir };
          break;
        }
        if (ramp) break;
      }
      if (ramp && group.length >= 4) cracks.push({ id: `cr${cracks.length}`, cells: group, pitH: -STAIR_RISE * 2, ramp });
    }
    // проёмы
    const ds: Placed["doors"] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (map[y][x] !== "@") continue;
      const ox = x === 0 ? -1 : x === W - 1 ? 1 : 0, oy = y === 0 ? -1 : y === H - 1 ? 1 : 0;
      ds.push({ x: x0 + x, y: y0 + y, ox, oy, used: false });
    }
    rooms.push(room);
    const p: Placed = { def, map, x: x0, y: y0, w: W, h: H, room, doors: ds };
    placed.push(p);
    return p;
  };

  const pickTransform = (m: string[]) => transformMap(m, rng.int(0, 3), rng.chance(0.5));
  const tryPlace = (def: ChunkDef, kind: RoomKind, where: () => [number, number], tries: number, score?: (x: number, y: number, w: number, h: number) => number) => {
    let best: { m: string[]; x: number; y: number; s: number } | null = null;
    for (let i = 0; i < tries; i++) {
      const m = pickTransform(def.map);
      const [x, y] = where();
      if (!fits(x, y, m[0].length, m.length, 2)) continue;
      const s = score ? score(x, y, m[0].length, m.length) : 0;
      if (!best || s > best.s) best = { m, x, y, s };
      if (!score) break;
    }
    if (!best) return null;
    return place(def, best.m, best.x, best.y, kind);
  };

  // --- старт у края карты ---
  const startDef = CHUNKS.find((c) => c.id === "start")!;
  const side = rng.int(0, 3);
  const start = tryPlace(startDef, "start", () => {
    const a = rng.int(2, N - 10);
    return side === 0 ? [1, a] : side === 1 ? [N - 8, a] : side === 2 ? [a, 1] : [a, N - 8];
  }, 60);
  if (!start) return null;
  const sc = { x: start.x + start.w / 2, y: start.y + start.h / 2 };
  // --- логово хозяина — как можно дальше ---
  // у финальных этапов актов — ручная арена, у остальных — логово темы
  const arena = st ? BOSS_ARENAS.find((c) => c.stages?.includes(st.stage.id)) : undefined;
  const bossOptions = BOSS_CHUNKS.filter((c) => c.themes === "*" || c.themes.includes(themeId));
  const bossDef = arena || rng.pick(bossOptions.length ? bossOptions : BOSS_CHUNKS);
  const boss = tryPlace(bossDef, "boss", () => [rng.int(1, N - 14), rng.int(1, N - 14)], 260, (x, y, w, h) => Math.hypot(x + w / 2 - sc.x, y + h / 2 - sc.y));
  if (!boss) return null;
  // --- остальные фрагменты: тема, без повторов, пока есть место ---
  const pool = CHUNKS.filter((c) => c.weight > 0 && (c.themes === "*" || c.themes.includes(themeId)));
  const used = new Map<string, number>();
  const target = Math.round(N / 3.6);
  for (let i = 0, fails = 0; i < 60 && placed.length < target && fails < 12; i++) {
    // фрагменты своей темы — чаще общих
    const def = rng.weighted(pool, (c) => (c.weight * (c.themes === "*" ? 1 : 2.5)) / (1 + (used.get(c.id) || 0) * 4));
    let ok = false;
    for (let k = 0; k < 40 && !ok; k++) {
      const m = pickTransform(def.map);
      const x = rng.int(1, N - m[0].length - 1), y = rng.int(1, N - m.length - 1);
      if (!fits(x, y, m[0].length, m.length, 2)) continue;
      place(def, m, x, y, def.kind);
      used.set(def.id, (used.get(def.id) || 0) + 1);
      ok = true;
    }
    if (!ok) fails++;
  }

  // --- коридоры: A* в обход фрагментов, остовное дерево + пара петель ---
  const corridorCells: [number, number][] = [];
  const corridor = new Uint8Array(N * N);
  const route = (ax: number, ay: number, bx: number, by: number): [number, number][] | null => {
    const open: number[] = [];
    const g = new Float32Array(N * N).fill(Infinity);
    const came = new Int32Array(N * N).fill(-1);
    const dirOf = new Int8Array(N * N).fill(-1);
    const s = ay * N + ax, t = by * N + bx;
    g[s] = 0;
    open.push(s);
    const hcost = (i: number) => Math.abs((i % N) - bx) + Math.abs(((i / N) | 0) - by);
    let guard = 0;
    while (open.length && guard++ < 20000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (g[open[k]] + hcost(open[k]) < g[open[bi]] + hcost(open[bi])) bi = k;
      const cur = open.splice(bi, 1)[0];
      if (cur === t) break;
      const cx = cur % N, cy = (cur / N) | 0;
      for (let dd = 0; dd < 4; dd++) {
        const [dx, dy] = DIRS[dd];
        const nx = cx + dx, ny = cy + dy;
        if (nx < 1 || ny < 1 || nx >= N - 1 || ny >= N - 1) continue;
        const ni = ny * N + nx;
        if (footprint[ni] >= 0 && ni !== t) continue;
        const cost = (corridor[ni] ? 0.55 : 1) + (dirOf[cur] >= 0 && dirOf[cur] !== dd ? 0.35 : 0) + rng.next() * 0.15;
        if (g[cur] + cost < g[ni]) {
          g[ni] = g[cur] + cost;
          came[ni] = cur;
          dirOf[ni] = dd;
          if (!open.includes(ni)) open.push(ni);
        }
      }
    }
    if (came[t] < 0 && s !== t) return null;
    const path: [number, number][] = [];
    for (let i = t; i !== s; i = came[i]) path.push([i % N, (i / N) | 0]);
    path.push([ax, ay]);
    return path.reverse();
  };
  const outer = (dr: Placed["doors"][number]) => [dr.x + dr.ox, dr.y + dr.oy] as [number, number];
  const connect = (a: Placed, b: Placed) => {
    let best: [Placed["doors"][number], Placed["doors"][number], number] | null = null;
    for (const da of a.doors) for (const db of b.doors) {
      const [ax, ay] = outer(da), [bx, by] = outer(db);
      if (ax < 1 || ay < 1 || bx < 1 || by < 1 || ax >= N - 1 || ay >= N - 1 || bx >= N - 1 || by >= N - 1) continue;
      const dist = Math.abs(ax - bx) + Math.abs(ay - by) + (da.used ? 2 : 0) + (db.used ? 2 : 0);
      if (!best || dist < best[2]) best = [da, db, dist];
    }
    if (!best) return false;
    const [da, db] = best;
    const [ax, ay] = outer(da), [bx, by] = outer(db);
    const path = route(ax, ay, bx, by);
    if (!path) return false;
    for (const [x, y] of path) {
      if (cells[y * N + x] === Cell.Wall) { corridorCells.push([x, y]); }
      cells[y * N + x] = Cell.Floor;
      corridor[y * N + x] = 1;
    }
    for (const dr of [da, db]) { dr.used = true; cells[dr.y * N + dr.x] = Cell.Floor; floor[dr.y * N + dr.x] = 0; }
    return true;
  };
  const centers = placed.map((p) => [p.x + p.w / 2, p.y + p.h / 2]);
  const inTree = new Set([0]);
  while (inTree.size < placed.length) {
    let bd = Infinity, ba = -1, bb = -1;
    for (const a of inTree) for (let b = 0; b < placed.length; b++) {
      if (inTree.has(b)) continue;
      const dd = Math.abs(centers[a][0] - centers[b][0]) + Math.abs(centers[a][1] - centers[b][1]);
      if (dd < bd) { bd = dd; ba = a; bb = b; }
    }
    inTree.add(bb);
    if (!connect(placed[ba], placed[bb]) && !relaxed) return null;
  }
  for (let i = 0; i < 2; i++) {
    const a = rng.int(2, placed.length - 1), b = rng.int(2, placed.length - 1);
    if (a !== b) connect(placed[a], placed[b]);
  }
  // неиспользованные проёмы остаются стеной

  // --- лужи в коридорах склепов и стоков ---
  if (themeId !== "abyss") {
    for (let i = 0; i < corridorCells.length; i++) {
      if (!rng.chance(0.035)) continue;
      const len = rng.int(2, 4);
      for (let k = 0; k < len && i + k < corridorCells.length; k++) {
        const [x, y] = corridorCells[i + k];
        liquid[y * N + x] = liq;
        floor[y * N + x] = -LIQUID_DEPTH;
      }
      i += len;
    }
  }

  // --- тайная комната за ложной стеной ---
  const secrets: Dungeon["secrets"] = [];
  for (let i = 0; i < 300 && secrets.length < 1; i++) {
    const host = rooms[rng.int(2, rooms.length - 1)];
    const dir = rng.int(0, 3);
    const w = 3, h = 3;
    let r: Room, door: [number, number];
    if (dir === 0) { r = { id: rooms.length, kind: "secret", x: host.x + 1, y: host.y - h - 2, w, h }; door = [host.x + 2, host.y - 1]; }
    else if (dir === 1) { r = { id: rooms.length, kind: "secret", x: host.x + 1, y: host.y + host.h + 2, w, h }; door = [host.x + 2, host.y + host.h]; }
    else if (dir === 2) { r = { id: rooms.length, kind: "secret", x: host.x - w - 2, y: host.y + 1, w, h }; door = [host.x - 1, host.y + 2]; }
    else { r = { id: rooms.length, kind: "secret", x: host.x + host.w + 2, y: host.y + 1, w, h }; door = [host.x + host.w, host.y + 2]; }
    if (r.x < 2 || r.y < 2 || r.x + r.w > N - 2 || r.y + r.h > N - 2) continue;
    // за дверью — клетка-тамбур до комнаты
    const [ddx, ddy] = dir === 0 ? [0, -1] : dir === 1 ? [0, 1] : dir === 2 ? [-1, 0] : [1, 0];
    const inner: [number, number] = [door[0] - ddx, door[1] - ddy];
    const hall: [number, number] = [door[0] + ddx, door[1] + ddy];
    if (at(inner[0], inner[1]) !== Cell.Floor || Math.abs(floor[inner[1] * N + inner[0]]) > 0.01 || stairs.some((s) => s.cx === inner[0] && s.cy === inner[1])) continue;
    let free = at(door[0], door[1]) === Cell.Wall && at(hall[0], hall[1]) === Cell.Wall;
    for (let y = r.y - 1; y <= r.y + r.h && free; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (at(x, y) !== Cell.Wall || corridor[y * N + x]) { free = false; break; }
    if (!free) continue;
    rooms.push(r);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) set(x, y, Cell.Floor);
    set(hall[0], hall[1], Cell.Floor);
    set(door[0], door[1], Cell.Secret);
    secrets.push({ id: "s0", cx: door[0], cy: door[1] });
  }

  // --- проверка: от старта достижимы логово и все фрагменты (двери и решётки закрыты) ---
  const tmp = { w: N, h: N, cells, floor, stairs, liquid } as unknown as Dungeon;
  const reach = new Uint8Array(N * N);
  {
    const s0 = Math.floor(sc.y) * N + Math.floor(sc.x);
    const q = [s0];
    reach[s0] = 1;
    const walk = (x: number, y: number) => x > 0 && y > 0 && x < N - 1 && y < N - 1 && cells[y * N + x] === Cell.Floor;
    for (let i = 0; i < q.length; i++) {
      const cx = q[i] % N, cy = (q[i] / N) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy, ni = ny * N + nx;
        if (reach[ni] || !passable(tmp, cx, cy, nx, ny, walk, false)) continue;
        reach[ni] = 1;
        q.push(ni);
      }
    }
  }
  const bossC = Math.floor(boss.room.y + boss.room.h / 2) * N + Math.floor(boss.room.x + boss.room.w / 2);
  if (!reach[bossC] && !relaxed) return null;
  for (const p of placed) if (p.doors.some((d) => d.used && !reach[d.y * N + d.x]) && !relaxed) return null;
  // ключи к запертым дверям — в достижимом месте другого фрагмента
  for (const o of doors) {
    if (o.kind !== "key") continue;
    const host = placed.find((p) => o.cx >= p.x && o.cx < p.x + p.w && o.cy >= p.y && o.cy < p.y + p.h);
    if (host && keys.some((k) => Math.floor(k.x / CELL) >= host.x && Math.floor(k.x / CELL) < host.x + host.w && Math.floor(k.z / CELL) >= host.y && Math.floor(k.z / CELL) < host.y + host.h)) continue;
    const spots: [number, number][] = [];
    for (const p of placed) {
      if (p === host || p.room.kind === "start" || p.room.kind === "boss") continue;
      for (let y = p.room.y; y < p.room.y + p.room.h; y++) for (let x = p.room.x; x < p.room.x + p.room.w; x++) {
        const i = y * N + x;
        if (reach[i] && cells[i] === Cell.Floor && !liquid[i] && !stairs.some((s) => s.cx === x && s.cy === y) && !bridge[i]) spots.push([x, y]);
      }
    }
    if (!spots.length) { cells[o.cy * N + o.cx] = Cell.Floor; continue; }
    const [kx, ky] = rng.pick(spots);
    keys.push({ id: `key${keys.length}`, x: (kx + 0.5) * CELL, z: (ky + 0.5) * CELL });
  }

  // всё, куда можно попасть, открыв двери и решётки: только там стоят вещи и враги
  const reachOpen = new Uint8Array(N * N);
  {
    const s0 = Math.floor(sc.y) * N + Math.floor(sc.x);
    const q = [s0];
    reachOpen[s0] = 1;
    const walk = (x: number, y: number) => x > 0 && y > 0 && x < N - 1 && y < N - 1 && (cells[y * N + x] === Cell.Floor || cells[y * N + x] === Cell.Door);
    for (let i = 0; i < q.length; i++) {
      const cx = q[i] % N, cy = (q[i] / N) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy, ni = ny * N + nx;
        if (reachOpen[ni] || !passable(tmp, cx, cy, nx, ny, walk, false)) continue;
        reachOpen[ni] = 1;
        q.push(ni);
      }
    }
  }

  // --- высота потолков: над приподнятым полом хватает места ---
  const ceil = new Float32Array(N * N).fill(CORRIDOR_CEIL);
  for (const p of placed) {
    let top = 0;
    for (let y = p.room.y; y < p.room.y + p.room.h; y++) for (let x = p.room.x; x < p.room.x + p.room.w; x++) top = Math.max(top, floor[y * N + x] + (stairs.some((s) => s.cx === x && s.cy === y) ? STAIR_RISE : 0));
    const h = Math.min(MAX_CEIL - 0.2, Math.max(ROOM_CEIL[p.room.kind] + rng.range(-0.3, 0.3), top + HEADROOM + 0.4));
    for (let y = p.y + 1; y < p.y + p.h - 1; y++) for (let x = p.x + 1; x < p.x + p.w - 1; x++) ceil[y * N + x] = h;
  }
  for (const r of rooms) if (r.kind === "secret") for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) ceil[y * N + x] = ROOM_CEIL.secret;

  // --- наполнение ---
  const props: Prop[] = [];
  const lights: Dungeon["lights"] = [];
  const spawns: Spawn[] = [];
  const chests: Dungeon["chests"] = [];
  const shrines: Dungeon["shrines"] = [];
  const traps: Dungeon["traps"] = [];
  const breakables: Dungeon["breakables"] = [];
  const notes: Dungeon["notes"] = [];
  // разбиваемые вещи и записки — отдельный поток случайностей
  const r2 = new Rng((seed ^ 0x2f6b1d) >>> 0);
  const notePool = r2.shuffle(Array.from({ length: 16 }, (_, i) => i));
  const isFloor = (x: number, y: number) => at(x, y) === Cell.Floor;
  const stairSet = new Set(stairs.map((s) => s.cy * N + s.cx));
  const crackSet = new Set(cracks.flatMap((c) => c.cells.map(([x, y]) => y * N + x)));
  /** Ровный сухой пол: под сундуки, святыни, урны. */
  const solidSpot = (x: number, y: number) => isFloor(x, y) && reachOpen[y * N + x] === 1 && !stairSet.has(y * N + x) && !liquid[y * N + x] && !bridge[y * N + x] && !crackSet.has(y * N + x);
  /** Где может стоять враг: не в лаве и не в пустоте. */
  const standSpot = (x: number, y: number) => isFloor(x, y) && reachOpen[y * N + x] === 1 && liquid[y * N + x] !== 3 && liquid[y * N + x] !== 4 && !crackSet.has(y * N + x);
  let eid = 0;
  const pickEnemy = () => rng.weighted(theme.enemies, (e) => e.weight).id;
  const clear = (x: number, z: number, rad: number) =>
    !props.some((o) => o.solid && Math.abs(o.x - x) < o.solid[0] + rad && Math.abs(o.z - z) < o.solid[1] + rad) &&
    !chests.some((c) => Math.hypot(c.x - x, c.z - z) < 1.0 + rad) &&
    !shrines.some((c) => Math.hypot(c.x - x, c.z - z) < 1.0 + rad) &&
    !breakables.some((b) => Math.hypot(b.x - x, b.z - z) < 0.7);
  /** Случайная точка комнаты на подходящей клетке, свободная от твёрдых вещей. */
  const freeFloor = (r: Room, margin: number, clearance: number, ok = solidSpot) => {
    for (let i = 0; i < 50; i++) {
      const x = (r.x + margin + rng.next() * (r.w - margin * 2)) * CELL, z = (r.y + margin + rng.next() * (r.h - margin * 2)) * CELL;
      if (ok(Math.floor(x / CELL), Math.floor(z / CELL)) && clear(x, z, clearance)) return { x, z };
    }
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (ok(x, y) && clear((x + 0.5) * CELL, (y + 0.5) * CELL, 0.3)) return { x: (x + 0.5) * CELL, z: (y + 0.5) * CELL };
    return null;
  };

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
    // не над лестницей и не над рычагом решётки
    const ok = spots.filter((s) => !stairSet.has(Math.floor(s.z / CELL) * N + Math.floor(s.x / CELL)) && !gateLevers.some((l) => Math.hypot(l.x - s.x, l.z - s.z) < 1));
    rng.shuffle(ok);
    for (const s of ok.slice(0, count)) {
      props.push({ kind: "torch", ...s, wall: true, room: r.id });
      lights.push({ x: s.x + Math.sin(s.rot) * 0.4, y: 2.9, z: s.z + Math.cos(s.rot) * 0.4, color: theme.palette.light, kind: "torch" });
    }
    return ok.slice(count);
  };

  // символы фрагментов: вещи стоят там, где их нарисовал автор
  for (const p of placed) {
    const r = p.room;
    const isBoss = r.kind === "boss";
    let enemies = 0;
    const eliteRoom = rng.chance(0.22);
    for (let y = 1; y < p.h - 1; y++) for (let x = 1; x < p.w - 1; x++) {
      const ch = p.map[y][x];
      const gx = p.x + x, gy = p.y + y;
      const wx = (gx + 0.5) * CELL, wz = (gy + 0.5) * CELL;
      const jit = () => rng.range(-0.5, 0.5);
      // отрезанные пропастью уголки фрагмента остаются пустыми
      if (!reachOpen[gy * N + gx] && "CTEHnubSpawBk".includes(ch)) continue;
      switch (ch) {
        case "C":
        case "T":
          chests.push({ id: `c${chests.length}`, x: wx, z: wz, rot: rng.int(0, 3) * (Math.PI / 2), tier: ch === "T" ? "elite" : "chest", mimic: ch === "C" && rng.chance(0.3) });
          if (ch === "T") { props.push({ kind: "candles", x: wx + 1.0, z: wz + 0.9, rot: 0, room: r.id }); lights.push({ x: wx + 1.0, y: 0.7, z: wz + 0.9, color: "#ffb36a", kind: "candle" }); }
          break;
        case "S": {
          const horiz = p.map[y][x - 1] !== "#" && p.map[y][x + 1] !== "#";
          props.push({ kind: "sarcophagus", x: wx, z: wz, rot: horiz ? Math.PI / 2 : 0, solid: horiz ? [1.1, 0.55] : [0.55, 1.1], room: r.id });
          break;
        }
        case "p": props.push({ kind: "pillar", x: wx, z: wz, rot: 0, solid: [0.7, 0.7], room: r.id }); break;
        case "c":
          props.push({ kind: "candles", x: wx, z: wz, rot: rng.range(0, 6.28), room: r.id });
          lights.push({ x: wx, y: 0.6, z: wz, color: "#ffb36a", kind: "candle" });
          break;
        case "a":
          props.push({ kind: "altar", x: wx, z: wz, rot: 0, solid: [1.0, 0.6], room: r.id });
          lights.push({ x: wx, y: 1.5, z: wz, color: "#ff9a5a", kind: "candle" });
          break;
        case "w": props.push({ kind: "pews", x: wx, z: wz, rot: 0, solid: [0.4, 0.4], room: r.id }); break;
        case "B":
          props.push({ kind: "brazier", x: wx, z: wz, rot: 0, solid: [0.4, 0.4], room: r.id });
          lights.push({ x: wx, y: 1.6, z: wz, color: theme.palette.light, kind: "brazier" });
          break;
        case "H":
          shrines.push({ id: `sh${shrines.length}`, x: wx, z: wz, buff: rng.pick(["power", "fortitude", "haste", "clarity"]) });
          props.push({ kind: "shrine", x: wx, z: wz, rot: 0, solid: [0.6, 0.6], room: r.id });
          lights.push({ x: wx, y: 1.6, z: wz, color: "#7fc4a0", kind: "magic" });
          break;
        case "n":
          notes.push({ id: `n${notes.length}`, x: wx + jit() * 0.6, z: wz + jit() * 0.6, note: notePool[notes.length % 16], rot: r2.range(0, 6.28) });
          break;
        case "k":
          props.push({ kind: rng.chance(0.5) ? "skulls" : "bones", x: wx + jit(), z: wz + jit(), rot: rng.range(0, 6.28), room: r.id });
          break;
        case "u":
        case "b":
          breakables.push({ id: `b${breakables.length}`, x: wx + jit() * 0.6, z: wz + jit() * 0.6, kind: ch === "u" ? r2.pick(["urn", "urn", "oil"] as const) : r2.pick(["crate", "barrel"] as const), rot: r2.range(0, 6.28) });
          break;
        case "E":
          if (isBoss) break;
          spawns.push({ id: `e${eid++}`, type: pickEnemy(), x: wx + jit(), z: wz + jit(), room: r.id, elite: eliteRoom && enemies === 0 ? rng.pick(Object.keys(ELITE_MODS)) : undefined });
          enemies++;
          break;
      }
    }
    // свет и полки у стен
    const area = r.w * r.h;
    const leftover = wallTorches(r, isBoss ? 6 : Math.max(1, Math.round(area / 12)));
    for (const s of leftover.slice(0, Math.round(leftover.length * (theme.props.includes("shelves") ? 0.35 : 0.12))))
      props.push({ kind: theme.wallStyle === "bones" || rng.chance(0.5) ? "shelves" : "niche", ...s, wall: true, room: r.id });
    // немного декораций темы между авторскими вещами
    const deco = theme.props.filter((k) => !["shelves", "pillar", "sarcophagus", "altar", "pews"].includes(k));
    for (let i = 0; i < Math.round(area / 16) && deco.length; i++) {
      const kind = rng.pick(deco);
      const pt = freeFloor(r, 0.5, 0.6);
      if (!pt) break;
      if (kind === "candles") lights.push({ x: pt.x, y: 0.6, z: pt.z, color: "#ffb36a", kind: "candle" });
      props.push({ kind, x: pt.x, z: pt.z, rot: rng.range(0, 6.28), room: r.id, solid: kind === "urn" ? [0.4, 0.4] : undefined });
    }
    if (isBoss) {
      if (!p.map.some((row) => row.includes("B"))) {
        const cx = (r.x + r.w / 2) * CELL, cz = (r.y + r.h / 2) * CELL;
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const bx = cx + sx * (r.w / 2 - 1.2) * CELL, bz = cz + sz * (r.h / 2 - 1.2) * CELL;
          if (!solidSpot(Math.floor(bx / CELL), Math.floor(bz / CELL)) || !clear(bx, bz, 0.6)) continue;
          props.push({ kind: "brazier", x: bx, z: bz, rot: 0, solid: [0.4, 0.4], room: r.id });
          lights.push({ x: bx, y: 1.6, z: bz, color: theme.palette.light, kind: "brazier" });
        }
      }
      // хозяин — у центра логова, лицом к входу
      let bx = (r.x + r.w / 2) * CELL, bz = (r.y + r.h / 2) * CELL;
      if (!standSpot(Math.floor(bx / CELL), Math.floor(bz / CELL)) || !clear(bx, bz, 0.8)) { const f = freeFloor(r, 2, 0.8, standSpot); if (f) ({ x: bx, z: bz } = f); }
      spawns.push({ id: `e${eid++}`, type: bossType, x: bx, z: bz, room: r.id, boss: true, champion: champion?.name, elite: champion?.elite });
      if (champion) for (let k = 0; k < 3; k++) {
        const f = freeFloor(r, 1.5, 0.8, standSpot);
        if (f) spawns.push({ id: `e${eid++}`, type: pickEnemy(), x: f.x, z: f.z, room: r.id });
      }
      continue;
    }
    if (r.kind === "start") continue;
    // если автор поставил мало врагов — добавляем до нормы
    let stand = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (standSpot(x, y)) stand++;
    const want = Math.min(7, Math.max(2, Math.round(stand / 10 + level * 0.08 + rng.range(-1, 1))));
    for (let i = enemies; i < want; i++) {
      const f = freeFloor(r, 0.6, 0.7, standSpot);
      if (!f) break;
      spawns.push({ id: `e${eid++}`, type: pickEnemy(), x: f.x, z: f.z, room: r.id, elite: eliteRoom && i === 0 ? rng.pick(Object.keys(ELITE_MODS)) : undefined });
    }
    // иногда — случайный сундук, если фрагмент без своего
    if (r.kind !== "treasure" && !p.map.some((row) => /[CT]/.test(row)) && rng.chance(0.2)) {
      const f = freeFloor(r, 0.8, 0.8);
      if (f) chests.push({ id: `c${chests.length}`, x: f.x, z: f.z, rot: rng.range(0, 6.28), tier: "chest", mimic: rng.chance(0.3) });
    }
  }
  // лава светится сама
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (liquid[y * N + x] !== 3 || (x + y) % 2) continue;
    lights.push({ x: (x + 0.5) * CELL, y: 0.9, z: (y + 0.5) * CELL, color: "#ff6a2a", kind: "brazier" });
  }
  // тайник: богатый сундук при свечах
  for (const r of rooms) {
    if (r.kind !== "secret") continue;
    const cx = (r.x + r.w / 2) * CELL, cz = (r.y + r.h / 2) * CELL;
    chests.push({ id: `c${chests.length}`, x: cx, z: cz, rot: rng.int(0, 3) * (Math.PI / 2), tier: "boss" });
    props.push({ kind: "candles", x: cx + 1.2, z: cz + 1.1, rot: 0, room: r.id });
    lights.push({ x: cx + 1.2, y: 0.7, z: cz + 1.1, color: "#ffb36a", kind: "candle" });
    wallTorches(r, 1);
    for (let i = 0; i < 3; i++) {
      const bx = (r.x + r2.range(0.3, r.w - 0.3)) * CELL, bz = (r.y + r2.range(0.3, 0.9)) * CELL;
      if (clear(bx, bz, 0.4)) breakables.push({ id: `b${breakables.length}`, x: bx, z: bz, kind: r2.pick(["urn", "crate", "barrel"] as const), rot: r2.range(0, 6.28) });
    }
  }

  // ловушки в коридорах подальше от старта (не в лужах)
  const startRoom = start.room;
  const startC = { x: (startRoom.x + startRoom.w / 2) * CELL, z: (startRoom.y + startRoom.h / 2) * CELL };
  const corr = rng.shuffle(corridorCells.slice());
  for (const [x, y] of corr) {
    if (traps.length >= Math.round(N / 9)) break;
    if (liquid[y * N + x]) continue;
    const tx = cellCenter(x), tz = cellCenter(y);
    if (Math.hypot(tx - startC.x, tz - startC.z) < 15) continue;
    if (traps.some((t) => Math.hypot(t.x - tx, t.z - tz) < 8)) continue;
    traps.push({ id: `t${traps.length}`, x: tx, z: tz });
  }
  // факелы в коридорах
  for (const [x, y] of corridorCells) {
    if (!rng.chance(0.07)) continue;
    const dirs: [number, number, number][] = [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]];
    const dd = dirs.find(([dx, dy]) => at(x + dx, y + dy) === Cell.Wall);
    if (!dd) continue;
    const px = cellCenter(x) + dd[0] * (CELL / 2 - 0.25), pz = cellCenter(y) + dd[1] * (CELL / 2 - 0.25);
    props.push({ kind: "torch", x: px, z: pz, rot: dd[2], wall: true });
    lights.push({ x: px - dd[0] * 0.4, y: 2.9, z: pz - dd[1] * 0.4, color: theme.palette.light, kind: "torch" });
  }
  // урны и ящики вдоль стен
  for (const r of rooms) {
    if (r.kind === "boss" || r.kind === "secret") continue;
    const n = r2.int(0, 2);
    for (let i = 0, tries = 0; i < n && tries < 30; tries++) {
      const side = r2.int(0, 3);
      const t = r2.range(0.15, 0.85);
      const x = side < 2 ? (r.x + t * r.w) * CELL : side === 2 ? r.x * CELL + 0.6 : (r.x + r.w) * CELL - 0.6;
      const z = side >= 2 ? (r.y + t * r.h) * CELL : side === 0 ? r.y * CELL + 0.6 : (r.y + r.h) * CELL - 0.6;
      if (!solidSpot(Math.floor(x / CELL), Math.floor(z / CELL)) || !clear(x, z, 0.5)) continue;
      const cluster = r2.int(1, 3);
      for (let k = 0; k < cluster; k++) {
        const bx = x + (k ? r2.range(-0.7, 0.7) : 0), bz = z + (k ? r2.range(-0.7, 0.7) : 0);
        if (!solidSpot(Math.floor(bx / CELL), Math.floor(bz / CELL)) || (k && !clear(bx, bz, 0.4))) continue;
        breakables.push({ id: `b${breakables.length}`, x: bx, z: bz, kind: r2.pick(["urn", "urn", "crate", "barrel", "oil"] as const), rot: r2.range(0, 6.28) });
      }
      i++;
    }
  }
  // записки: авторские + пара случайных
  const noteRooms = r2.shuffle(rooms.filter((r) => r.kind !== "boss" && r.kind !== "start"));
  for (const r of noteRooms) {
    if (notes.length >= 3 + (secrets.length ? 1 : 0)) break;
    const f = freeFloor(r, 0.8, 0.4);
    if (f) notes.push({ id: `n${notes.length}`, x: f.x, z: f.z, note: notePool[notes.length % 16], rot: r2.range(0, 6.28) });
  }

  // люстры под высокими сводами, верёвка — к ближайшей стене
  const chandeliers: Dungeon["chandeliers"] = [];
  const levers: Dungeon["levers"] = [...gateLevers];
  for (const r of rooms) {
    const h = ceil[(r.y + (r.h >> 1)) * N + r.x + (r.w >> 1)];
    if (h < 5.3 || r.kind === "secret") continue;
    const count = r.kind === "boss" ? 2 : r2.chance(0.7) ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const fx = r.kind === "boss" ? (i ? 0.3 : 0.7) : r2.range(0.35, 0.65), fz = r2.range(0.35, 0.65);
      const x = (r.x + r.w * fx) * CELL, z = (r.y + r.h * fz) * CELL;
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      if (!isFloor(cx, cz) || !clear(x, z, 1.2)) continue;
      // под люстрой должно хватать места: пол не выше ~1.2
      if (floor[cz * N + cx] > 1.3 || stairSet.has(cz * N + cx)) continue;
      const opts: [number, number, number, number][] = [
        [x, r.y * CELL + 0.2, 0, Math.abs(z - r.y * CELL)],
        [x, (r.y + r.h) * CELL - 0.2, Math.PI, Math.abs((r.y + r.h) * CELL - z)],
        [r.x * CELL + 0.2, z, -Math.PI / 2, Math.abs(x - r.x * CELL)],
        [(r.x + r.w) * CELL - 0.2, z, Math.PI / 2, Math.abs((r.x + r.w) * CELL - x)],
      ];
      opts.sort((a, b) => a[3] - b[3]);
      const [ax, az, arot] = opts.find(([ox, oz]) => isFloor(Math.floor(ox / CELL), Math.floor(oz / CELL))) || opts[0];
      const y = h - 1.3;
      chandeliers.push({ id: `ch${chandeliers.length}`, x, z, y, ax, az, arot });
      lights.push({ x, y: y - 0.2 - floor[cz * N + cx], z, color: "#ffc070", kind: "torch" });
    }
    // рычаг огненных решёток
    if (r.kind !== "boss" && r.kind !== "start" && r.w * r.h >= 12 && r2.chance(0.35)) {
      const vents: { x: number; z: number }[] = [];
      for (let k = 0, tries = 0; k < 4 && tries < 30; tries++) {
        const vx = (r.x + 0.5 + r2.int(0, r.w - 1)) * CELL, vz = (r.y + 0.5 + r2.int(0, r.h - 1)) * CELL;
        if (!solidSpot(Math.floor(vx / CELL), Math.floor(vz / CELL)) || !clear(vx, vz, 1.0) || vents.some((v) => Math.hypot(v.x - vx, v.z - vz) < 2.5)) continue;
        vents.push({ x: vx, z: vz });
        k++;
      }
      const side = r2.int(0, 1);
      const lx = side ? r.x * CELL + 0.25 : (r.x + r.w) * CELL - 0.25;
      const lz = (r.y + r2.range(0.3, r.h - 0.3)) * CELL;
      const lcx = Math.floor((side ? lx + 0.5 : lx - 0.5) / CELL), lcz = Math.floor(lz / CELL);
      if (vents.length >= 2 && solidSpot(lcx, lcz) && at(side ? lcx - 1 : lcx + 1, lcz) === Cell.Wall) {
        levers.push({ id: `lv${levers.length}`, x: side ? lx + 0.05 : lx - 0.05, z: lz, rot: side ? Math.PI / 2 : -Math.PI / 2, vents });
      }
    }
  }

  // портал входа — у стены стартового зала, где нет прохода
  const sides: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const usedSide = (dx: number, dy: number) => start.doors.some((o) => o.used && o.ox === dx && o.oy === dy);
  const [sdx, sdy] = sides.find(([dx, dy]) => !usedSide(dx, dy)) || sides[0];
  const entrance = {
    x: startC.x + sdx * (startRoom.w / 2 - 0.7) * CELL,
    z: startC.z + sdy * (startRoom.h / 2 - 0.7) * CELL,
  };
  props.push({ kind: "portal", x: entrance.x, z: entrance.z, rot: sdx ? Math.PI / 2 : 0 });
  lights.push({ x: entrance.x - sdx * 0.6, y: 1.6, z: entrance.z - sdy * 0.6, color: "#6f9fd8", kind: "magic" });
  const br = boss.room;
  // портал выхода — подальше от хозяина, чтобы не открылся в его добыче
  const bossSpawn = spawns.find((e) => e.boss)!;
  let exit = { x: (br.x + br.w / 2) * CELL, z: (br.y + 1.5) * CELL }, bestEx = -1;
  for (let y = br.y; y < br.y + br.h; y++) for (let x = br.x; x < br.x + br.w; x++) {
    const wx = (x + 0.5) * CELL, wz = (y + 0.5) * CELL;
    if (!solidSpot(x, y) || !clear(wx, wz, 1.0)) continue;
    // не вплотную к стене и не в самом углу: соседи — тоже пол
    let around = 0;
    for (const [dx, dy] of DIRS) if (solidSpot(x + dx, y + dy)) around++;
    const dist = Math.hypot(wx - bossSpawn.x, wz - bossSpawn.z);
    const score = Math.min(dist, 12) + around * 2;
    if (score > bestEx) { bestEx = score; exit = { x: wx, z: wz }; }
  }

  return {
    theme, seed, level, w: N, h: N, cells, rooms,
    // герой появляется перед порталом, лицом к нему, — как вышел из него и обернулся
    start: { x: startC.x - sdx * 1.5, z: startC.z - sdy * 1.5, yaw: Math.atan2(-sdx, -sdy) },
    bossRoom: 1,
    spawns, props, lights, chests, traps, secrets, shrines, breakables, notes, ceil, chandeliers, levers, stage: st ? key : undefined,
    entrance, exit,
    floor, stairs, liquid, bridge, doors, keys, plates, cracks,
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
