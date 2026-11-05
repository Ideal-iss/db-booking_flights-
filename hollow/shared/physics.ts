/** Физика подземелья на Rapier: стены, колонны, саркофаги, тайные стены. */
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { CELL, Cell, MAX_CEIL, type Dungeon } from "./dungeon/generate";
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
  // пол и потолок
  const size = d.w * CELL;
  add(R.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(size / 2, -0.5, size / 2));
  add(R.ColliderDesc.cuboid(size / 2, 0.5, size / 2).setTranslation(size / 2, WALL_H + 0.5, size / 2));

  // стены: склеиваем горизонтальные отрезки соседних со входом клеток
  const isFloorish = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return false;
    return d.cells[y * d.w + x] !== Cell.Wall;
  };
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
        add(R.ColliderDesc.cuboid((len * CELL) / 2, WALL_H / 2, CELL / 2).setTranslation((runStart + len / 2) * CELL, WALL_H / 2, (y + 0.5) * CELL));
        runStart = -1;
      }
    }
  }
  const secretColliders = new Map<string, RAPIER_NS.Collider>();
  for (const s of d.secrets) {
    const c = add(R.ColliderDesc.cuboid(CELL / 2, WALL_H / 2, CELL / 2).setTranslation((s.cx + 0.5) * CELL, WALL_H / 2, (s.cy + 0.5) * CELL));
    secretColliders.set(s.id, c);
  }
  for (const p of d.props) {
    if (!p.solid) continue;
    add(R.ColliderDesc.cuboid(p.solid[0], 1.2, p.solid[1]).setTranslation(p.x, 1.2, p.z));
  }
  for (const c of d.chests) add(R.ColliderDesc.cuboid(0.6, 0.45, 0.6).setTranslation(c.x, 0.45, c.z));
  world.step();
  return { world, secretColliders, wallColliders };
}

export function openSecret(phys: DungeonPhysics, id: string) {
  const c = phys.secretColliders.get(id);
  if (!c) return;
  phys.wallColliders.delete(c.handle);
  phys.world.removeCollider(c, true);
  phys.secretColliders.delete(id);
}

/** Есть ли прямая видимость между точками (только стены). */
export function lineOfSight(R: Rapier, phys: DungeonPhysics, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return true;
  const ray = new R.Ray({ x: ax, y: ay, z: az }, { x: dx / len, y: dy / len, z: dz / len });
  const hit = phys.world.castRay(ray, len, true, undefined, groups(0xffff, GROUP_WALL));
  return !hit;
}

/** Расстояние до первой стены по лучу (или max). */
export function rayToWall(R: Rapier, phys: DungeonPhysics, o: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number): number {
  const ray = new R.Ray(o, dir);
  const hit = phys.world.castRay(ray, max, true, undefined, groups(0xffff, GROUP_WALL));
  return hit ? hit.timeOfImpact : max;
}
