/** Физика подземелья на Rapier: стены, колонны, саркофаги, тайные стены. */
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { CELL, Cell, MAX_CEIL, type Dungeon } from "./dungeon/generate";
import { CHASM_Y, DIRS, STAIR_RISE, cellFloor, groundAt, stairAt } from "./dungeon/terrain";
const WALL_H = MAX_CEIL;

export type Rapier = typeof RAPIER_NS;

export const GROUP_WALL = 0x0001;
export const GROUP_PLAYER = 0x0002;
export const GROUP_ENEMY = 0x0004;
/** Группа взаимодействия Rapier: (принадлежность << 16) | с чем сталкивается. */
export const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);

export interface DungeonPhysics {
  world: RAPIER_NS.World;
  secretColliders: Map<string, RAPIER_NS.Collider>;
  wallColliders: Set<number>;
  /** Пол, ступени и уступы: игрок по ним ходит, враги их не задевают (у них своя проверка высоты). */
  terrain: Set<number>;
  /** Коллайдеры треснувшего пола — исчезают при обвале. */
  crackColliders: Map<string, RAPIER_NS.Collider[]>;
  d: Dungeon;
}

export function buildDungeonPhysics(R: Rapier, d: Dungeon): DungeonPhysics {
  const world = new R.World({ x: 0, y: -22, z: 0 });
  const wallGroups = groups(GROUP_WALL, 0xffff);
  const wallColliders = new Set<number>();
  const add = (desc: RAPIER_NS.ColliderDesc) => {
    const c = world.createCollider(desc.setCollisionGroups(wallGroups));
    wallColliders.add(c.handle);
    return c;
  };
  const terrain = new Set<number>();
  const addTerrain = (desc: RAPIER_NS.ColliderDesc) => {
    const c = add(desc);
    terrain.add(c.handle);
    return c;
  };
  // потолок
  const size = d.w * CELL;
  add(R.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(size / 2, WALL_H + 0.5, size / 2));
  // пол: столбы от дна до высоты клетки, соседние клетки одной высоты склеены в полосы
  const crackOf = new Map<number, string>();
  for (const c of d.cracks || []) for (const [x, y] of c.cells) crackOf.set(y * d.w + x, c.id);
  const crackColliders = new Map<string, RAPIER_NS.Collider[]>();
  const floorKey = (x: number, y: number) => {
    const i = y * d.w + x;
    const c = d.cells[i];
    if (c === Cell.Wall || c === Cell.Chasm || stairAt(d, x, y) || crackOf.has(i)) return null;
    return cellFloor(d, x, y);
  };
  for (let y = 0; y < d.h; y++) {
    let x = 0;
    while (x < d.w) {
      const h = floorKey(x, y);
      if (h === null) { x++; continue; }
      let e = x + 1;
      while (e < d.w && floorKey(e, y) === h) e++;
      const len = e - x, top = h, bot = CHASM_Y - 1;
      addTerrain(R.ColliderDesc.cuboid((len * CELL) / 2, (top - bot) / 2, CELL / 2).setTranslation((x + len / 2) * CELL, (top + bot) / 2, (y + 0.5) * CELL));
      x = e;
    }
  }
  // треснувший пол: под ним дно ямы, сверху — съёмная плита
  for (const c of d.cracks || []) {
    const list: RAPIER_NS.Collider[] = [];
    for (const [x, y] of c.cells) {
      const top = d.floor ? d.floor[y * d.w + x] : 0, bot = c.pitH;
      addTerrain(R.ColliderDesc.cuboid(CELL / 2, (c.pitH - (CHASM_Y - 1)) / 2, CELL / 2).setTranslation((x + 0.5) * CELL, (c.pitH + CHASM_Y - 1) / 2, (y + 0.5) * CELL));
      list.push(addTerrain(R.ColliderDesc.cuboid(CELL / 2, (top - bot) / 2 + 0.05, CELL / 2).setTranslation((x + 0.5) * CELL, (top + bot) / 2, (y + 0.5) * CELL)));
    }
    crackColliders.set(c.id, list);
    // пандус ямы заранее: пока плита цела, он спрятан под ней
    const rises = Math.round(-c.pitH / STAIR_RISE);
    const [ux, uy] = DIRS[c.ramp.dir];
    for (let k = 0; k < rises; k++) addRamp(c.ramp.cx - ux * (rises - 1 - k), c.ramp.cy - uy * (rises - 1 - k), c.ramp.dir, c.pitH + k * STAIR_RISE);
  }
  // лестницы — наклонные плиты
  function addRamp(cx: number, cy: number, dir: number, h0: number) {
    const [ux, uy] = DIRS[dir];
    const len = Math.hypot(CELL, STAIR_RISE);
    const ang = Math.atan2(STAIR_RISE, CELL);
    // плита толщиной 0.4, центр — посередине клетки на средней высоте
    const q = new R.Quaternion(0, 0, 0, 1);
    const half = ang / 2;
    // поворот вокруг оси, перпендикулярной направлению подъёма
    const ax = uy !== 0 ? 1 : 0, az = ux !== 0 ? 1 : 0;
    const sgn = ux > 0 ? 1 : ux < 0 ? -1 : uy > 0 ? -1 : 1;
    q.x = ax * Math.sin(half) * sgn; q.z = az * Math.sin(half) * sgn; q.w = Math.cos(half);
    const mid = h0 + STAIR_RISE / 2;
    const n = { x: -ux * Math.sin(ang), y: Math.cos(ang), z: -uy * Math.sin(ang) };
    const hx = ux !== 0 ? len / 2 : CELL / 2, hz = uy !== 0 ? len / 2 : CELL / 2;
    addTerrain(R.ColliderDesc.cuboid(hx, 0.2, hz).setRotation(q).setTranslation((cx + 0.5) * CELL - n.x * 0.2, mid - n.y * 0.2, (cy + 0.5) * CELL - n.z * 0.2));
    addTerrain(R.ColliderDesc.cuboid(CELL / 2, (h0 - (CHASM_Y - 1)) / 2, CELL / 2).setTranslation((cx + 0.5) * CELL, (h0 + CHASM_Y - 1) / 2, (cy + 0.5) * CELL));
  }
  for (const s of d.stairs || []) addRamp(s.cx, s.cy, s.dir, s.h0);
  // дно пропасти: упавший приземляется сюда, симуляция возвращает его к краю
  add(R.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(size / 2, CHASM_Y - 0.5, size / 2));

  // стены: склеиваем горизонтальные отрезки соседних со входом клеток
  const isFloorish = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
    return d.cells[y * d.w + x] !== Cell.Wall;
  };
  void groundAt;
  const needsWall = (x: number, y: number) => {
    if (d.cells[y * d.w + x] !== Cell.Wall) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloorish(x + dx, y + dy)) return true;
    return false;
  };
  for (let y = 0; y < d.h; y++) {
    let runStart = -1;
    for (let x = 0; x <= d.w; x++) {
      const w = x < d.w && needsWall(x, y);
      if (w && runStart < 0) runStart = x;
      if (!w && runStart >= 0) {
        const len = x - runStart;
        add(R.ColliderDesc.cuboid((len * CELL) / 2, (WALL_H - CHASM_Y) / 2, CELL / 2).setTranslation((runStart + len / 2) * CELL, (WALL_H + CHASM_Y) / 2, (y + 0.5) * CELL));
        runStart = -1;
      }
    }
  }
  const secretColliders = new Map<string, RAPIER_NS.Collider>();
  for (const s of d.secrets) {
    const c = add(R.ColliderDesc.cuboid(CELL / 2, WALL_H / 2, CELL / 2).setTranslation((s.cx + 0.5) * CELL, WALL_H / 2, (s.cy + 0.5) * CELL));
    secretColliders.set(s.id, c);
  }
  // двери и решётки — как тайные стены, снимаются при открытии
  for (const o of d.doors || []) {
    if (d.cells[o.cy * d.w + o.cx] !== Cell.Door) continue;
    const g = groundAt(d, (o.cx + 0.5) * CELL, (o.cy + 0.5) * CELL);
    const c = add(R.ColliderDesc.cuboid(o.axis === "x" ? CELL / 2 : 0.35, 2.4, o.axis === "x" ? 0.35 : CELL / 2).setTranslation((o.cx + 0.5) * CELL, g + 2.4, (o.cy + 0.5) * CELL));
    secretColliders.set(o.id, c);
  }
  for (const p of d.props) {
    if (!p.solid) continue;
    const g = groundAt(d, p.x, p.z);
    add(R.ColliderDesc.cuboid(p.solid[0], 1.2, p.solid[1]).setTranslation(p.x, g + 1.2, p.z));
  }
  for (const c of d.chests) add(R.ColliderDesc.cuboid(0.6, 0.45, 0.6).setTranslation(c.x, groundAt(d, c.x, c.z) + 0.45, c.z));
  world.step();
  return { world, secretColliders, wallColliders, terrain, crackColliders, d };
}

/** Обвал треснувшего пола: снимаем плиту, дно ямы уже на месте. */
export function collapseCrackPhysics(phys: DungeonPhysics, id: string) {
  const list = phys.crackColliders.get(id);
  if (!list) return;
  for (const c of list) {
    phys.wallColliders.delete(c.handle);
    phys.terrain.delete(c.handle);
    phys.world.removeCollider(c, true);
  }
  phys.crackColliders.delete(id);
}

export function openSecret(phys: DungeonPhysics, id: string) {
  const c = phys.secretColliders.get(id);
  if (!c) return;
  phys.wallColliders.delete(c.handle);
  phys.world.removeCollider(c, true);
  phys.secretColliders.delete(id);
}

/** Есть ли прямая видимость между точками (только стены). */
export function lineOfSight(R: Rapier, phys: DungeonPhysics, ax: number, ayRel: number, az: number, bx: number, byRel: number, bz: number): boolean {
  // высоты точек — над полом в этом месте (уровни бывают на разной высоте)
  const ay = ayRel + groundAt(phys.d, ax, az), by = byRel + groundAt(phys.d, bx, bz);
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return true;
  const ray = new R.Ray({ x: ax, y: ay, z: az }, { x: dx / len, y: dy / len, z: dz / len });
  const hit = phys.world.castRay(ray, len, true, undefined, groups(0xffff, GROUP_WALL));
  return !hit;
}

/** Расстояние до первой стены по лучу (или max). */
export function rayToWall(R: Rapier, phys: DungeonPhysics, oRel: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number, absolute = false): number {
  const o = absolute ? oRel : { x: oRel.x, y: oRel.y + groundAt(phys.d, oRel.x, oRel.z), z: oRel.z };
  const ray = new R.Ray(o, dir);
  const hit = phys.world.castRay(ray, max, true, undefined, groups(0xffff, GROUP_WALL));
  return hit ? hit.timeOfImpact : max;
}
