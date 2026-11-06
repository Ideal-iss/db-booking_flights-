/**
 * Рельеф подземелья: высота пола в любой точке, лестницы, бассейны, пропасти,
 * двери и треснувший пол. Общий для симуляции и клиента.
 */
import { CELL, Cell, type Dungeon } from "./generate";

/** На сколько поднимается одна клетка лестницы (м). */
export const STAIR_RISE = 1.2;
/** Глубина пропасти: дно, где упавшего ловит симуляция. */
export const CHASM_Y = -9;
/** Глубина бассейна: поверхность жидкости над дном. */
export const LIQUID_DEPTH = 0.45;
/** Наибольший перепад, который существа перешагивают без лестницы. */
export const STEP_MAX = 0.45;

export const enum Liquid { None = 0, Water = 1, Blood = 2, Lava = 3, Void = 4 }

const stairCache = new WeakMap<Dungeon, Map<number, NonNullable<Dungeon["stairs"]>[number]>>();
function stairIndex(d: Dungeon) {
  let m = stairCache.get(d);
  if (!m || m.size !== (d.stairs?.length || 0)) {
    m = new Map();
    for (const s of d.stairs || []) m.set(s.cy * d.w + s.cx, s);
    stairCache.set(d, m);
  }
  return m;
}

export function stairAt(d: Dungeon, cx: number, cy: number) {
  if (!d.stairs?.length) return undefined;
  return stairIndex(d).get(cy * d.w + cx);
}

/** Направление лестницы как вектор по клеткам (вверх по склону). */
export const DIRS: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/** Высота пола клетки (для лестницы — нижний край). */
export function cellFloor(d: Dungeon, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= d.w || cy >= d.h) return 0;
  const i = cy * d.w + cx;
  if (d.cells[i] === Cell.Chasm) return CHASM_Y;
  const s = stairAt(d, cx, cy);
  if (s) return s.h0;
  return d.floor ? d.floor[i] : 0;
}

/** Высота пола в точке мира: учитывает наклон лестниц и пропасти. */
export function groundAt(d: Dungeon, x: number, z: number): number {
  const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  if (cx < 0 || cy < 0 || cx >= d.w || cy >= d.h) return 0;
  const i = cy * d.w + cx;
  if (d.cells[i] === Cell.Chasm) return CHASM_Y;
  const s = stairAt(d, cx, cy);
  if (s) {
    const fx = x / CELL - cx, fz = z / CELL - cy;
    const t = s.dir === 0 ? 1 - fz : s.dir === 1 ? fz : s.dir === 2 ? 1 - fx : fx;
    return s.h0 + STAIR_RISE * Math.max(0, Math.min(1, t));
  }
  return d.floor ? d.floor[i] : 0;
}

/** Высота пола на краю клетки, обращённом в сторону (dx, dy). */
export function edgeHeight(d: Dungeon, cx: number, cy: number, dx: number, dy: number): number {
  const s = stairAt(d, cx, cy);
  if (!s) return cellFloor(d, cx, cy);
  const [ux, uy] = DIRS[s.dir];
  if (ux === dx && uy === dy) return s.h0 + STAIR_RISE; // верхний край
  if (ux === -dx && uy === -dy) return s.h0; // нижний край
  return s.h0 + STAIR_RISE / 2; // боком на лестницу не зайти
}

export function liquidAt(d: Dungeon, x: number, z: number): Liquid {
  if (!d.liquid) return Liquid.None;
  const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  if (cx < 0 || cy < 0 || cx >= d.w || cy >= d.h) return Liquid.None;
  return d.liquid[cy * d.w + cx] as Liquid;
}

export function isChasm(d: Dungeon, x: number, z: number) {
  const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
  return cx >= 0 && cy >= 0 && cx < d.w && cy < d.h && d.cells[cy * d.w + cx] === Cell.Chasm;
}

/**
 * Можно ли существу шагнуть из клетки a в соседнюю b: обе проходимы и края
 * совпадают по высоте (лестницей или ровным полом). Лаву враги обходят.
 */
export function passable(d: Dungeon, ax: number, ay: number, bx: number, by: number, walk: (x: number, y: number) => boolean, avoidLava = true): boolean {
  if (!walk(bx, by)) return false;
  if (avoidLava && d.liquid && d.liquid[by * d.w + bx] === Liquid.Lava) return false;
  const dx = bx - ax, dy = by - ay;
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    // по диагонали — только если ровно на одном уровне
    return Math.abs(cellFloor(d, ax, ay) - cellFloor(d, bx, by)) < 0.05 && !stairAt(d, ax, ay) && !stairAt(d, bx, by);
  }
  return Math.abs(edgeHeight(d, ax, ay, dx, dy) - edgeHeight(d, bx, by, -dx, -dy)) <= STEP_MAX;
}

/** Открыть дверь или решётку: клетка становится полом (идемпотентно). */
export function openDoorCell(d: Dungeon, id: string) {
  const door = d.doors?.find((o) => o.id === id);
  if (!door) return false;
  const i = door.cy * d.w + door.cx;
  if (d.cells[i] !== Cell.Door) return false;
  d.cells[i] = Cell.Floor;
  return true;
}

/** Обрушить треснувший пол: клетки опускаются в яму, у края появляется пандус наверх (идемпотентно). */
export function collapseCrack(d: Dungeon, id: string) {
  const c = d.cracks?.find((o) => o.id === id);
  if (!c || !d.floor) return false;
  const [fx, fy] = c.cells[0];
  if (Math.abs(d.floor[fy * d.w + fx] - c.pitH) < 0.01) return false;
  for (const [x, y] of c.cells) d.floor[y * d.w + x] = c.pitH;
  // пандус из обломков: несколько ступеней от дна ямы к краю
  const rises = Math.round(-c.pitH / STAIR_RISE);
  const [ux, uy] = DIRS[c.ramp.dir];
  d.stairs = d.stairs || [];
  for (let k = 0; k < rises; k++) {
    const sx = c.ramp.cx - ux * (rises - 1 - k), sy = c.ramp.cy - uy * (rises - 1 - k);
    if (!d.stairs.some((s) => s.cx === sx && s.cy === sy)) d.stairs.push({ cx: sx, cy: sy, dir: c.ramp.dir, h0: c.pitH + k * STAIR_RISE });
  }
  return true;
}

/** Высота потолка над полом не меньше этой — иначе голова в камне. */
export const HEADROOM = 3.2;
