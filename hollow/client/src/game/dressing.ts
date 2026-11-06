/** Мелкие детали уровня: цоколь, крепи, пятна, паутина, щебень, корни и цепи + живой воздух (пыль, искры, капли).
 *  Всё детерминировано сидом подземелья, поэтому у всех игроков отряда одинаково. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Rng } from "@shared/rng";
import { CELL, Cell, ceilAt, type Dungeon } from "@shared/dungeon/generate";
import { litMaterial, type LightField } from "./lighting";
import { cellFloor, groundAt, stairAt } from "@shared/dungeon/terrain";
import { cobwebTexture, decalTexture, glowTexture, pixelTexture, stoneTexture, woodTexture, metalTexture } from "./textures";

type Bucket = Map<THREE.Material, THREE.BufferGeometry[]>;

const DECALS: Record<string, [string, number][]> = {
  crypt: [["grime", 4], ["bonedust", 2], ["crack", 2], ["blood", 1], ["puddle", 1]],
  catacombs: [["bonedust", 4], ["grime", 3], ["crack", 1], ["moss", 1]],
  cathedral: [["crack", 3], ["grime", 2], ["puddle", 2], ["moss", 1], ["blood", 1]],
  sanctum: [["blood", 5], ["grime", 2], ["crack", 1], ["puddle", 1]],
  hub: [["grime", 3], ["crack", 2], ["soot", 1]],
};

export function dressLevel(d: Dungeon, field: LightField, group: THREE.Group) {
  const rng = new Rng((d.seed * 2654435761) >>> 0 ^ 0x9e37);
  const W = d.w, H = d.h;
  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && d.cells[y * W + x] === Cell.Floor;
  const wallAt = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || d.cells[y * W + x] === Cell.Wall;
  // высота пола клетки; «плоский» пол — без воды, лестниц, мостов и трещин (там мусор не лежит)
  const gf = (x: number, y: number) => cellFloor(d, x, y);
  const crackSet = new Set<number>();
  for (const c of d.cracks || []) for (const [cx, cy] of c.cells) crackSet.add(cy * W + cx);
  const flat = (x: number, y: number) => floor(x, y) && !d.liquid?.[y * W + x] && !d.bridge?.[y * W + x] && !stairAt(d, x, y) && !crackSet.has(y * W + x);
  const theme = d.theme.id;
  const pal = d.theme.palette;
  const solid: Bucket = new Map();
  const put = (b: Bucket, m: THREE.Material, g: THREE.BufferGeometry) => {
    const gg = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(gg.attributes)) if (!["position", "normal", "uv"].includes(k)) gg.deleteAttribute(k);
    if (!b.has(m)) b.set(m, []);
    b.get(m)!.push(gg);
  };
  const box = (b: Bucket, m: THREE.Material, w: number, h: number, dd: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, dd);
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(mtx);
    put(b, m, g);
  };

  const stone = litMaterial({ color: pal.wall, map: stoneTexture(pal.wall2), baked: true });
  const darkStone = litMaterial({ color: pal.wall2, map: stoneTexture(pal.wall2), baked: true });
  const wood = litMaterial({ color: "#7a5a3a", map: woodTexture(), baked: true });
  const bone = litMaterial({ color: "#d8cfb8", baked: true });
  const iron = litMaterial({ color: "#4a4a4e", map: metalTexture("#4a4a4e"), baked: true });
  const root = litMaterial({ color: "#3a2a1c", baked: true });

  // ---------------------------------------------------------- цоколь вдоль стен
  const sides: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floor(x, y) || d.bridge?.[y * W + x]) continue;
      const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL;
      const g = gf(x, y);
      for (const [dx, dy] of sides) {
        if (!wallAt(x + dx, y + dy)) continue;
        const px = cx + dx * (CELL / 2 - 0.06), pz = cz + dy * (CELL / 2 - 0.06);
        if (dx) box(solid, darkStone, 0.14, 0.26, CELL, px, g + 0.13, pz);
        else box(solid, darkStone, CELL, 0.26, 0.14, px, g + 0.13, pz);
      }
    }

  // ---------------------------------------------------------- крепи в коридорах и балки в залах
  const support = theme === "cathedral" ? stone : wood;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!flat(x, y) || theme === "hub") continue;
      const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL;
      const g = gf(x, y);
      const ns = wallAt(x, y - 1) && wallAt(x, y + 1) && floor(x - 1, y) && floor(x + 1, y);
      const ew = wallAt(x - 1, y) && wallAt(x + 1, y) && floor(x, y - 1) && floor(x, y + 1);
      const hc = d.ceil[y * W + x];
      if ((ns || ew) && (x + y) % 3 === 0) {
        const t = 0.24;
        if (ns) {
          box(solid, support, t, hc - 0.5 - g, t, cx, g + (hc - 0.5 - g) / 2, cz - CELL / 2 + t / 2 + 0.02);
          box(solid, support, t, hc - 0.5 - g, t, cx, g + (hc - 0.5 - g) / 2, cz + CELL / 2 - t / 2 - 0.02);
          box(solid, support, t + 0.06, 0.3, CELL, cx, hc - 0.55, cz);
        } else {
          box(solid, support, t, hc - 0.5 - g, t, cx - CELL / 2 + t / 2 + 0.02, g + (hc - 0.5 - g) / 2, cz);
          box(solid, support, t, hc - 0.5 - g, t, cx + CELL / 2 - t / 2 - 0.02, g + (hc - 0.5 - g) / 2, cz);
          box(solid, support, CELL, 0.3, t + 0.06, cx, hc - 0.55, cz);
        }
      }
    }
  for (const r of d.rooms) {
    if (r.w < 4 && r.h < 4) continue;
    const alongX = r.w <= r.h;
    const span = alongX ? r.w : r.h;
    const count = alongX ? r.h : r.w;
    for (let i = 1; i < count; i += 2) {
      const len = span * CELL;
      const rh = ceilAt(d, (r.x + r.w / 2) * CELL, (r.y + r.h / 2) * CELL);
      if (r.kind === "cave") continue;
      if (alongX) box(solid, support, len, 0.32, 0.3, (r.x + r.w / 2) * CELL, rh - 0.16, (r.y + i) * CELL);
      else box(solid, support, 0.3, 0.32, len, (r.x + i) * CELL, rh - 0.16, (r.y + r.h / 2) * CELL);
    }
  }

  // ---------------------------------------------------------- щебень, кости, корни, цепи
  const rock = new THREE.IcosahedronGeometry(1, 0);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floor(x, y) || !rng.chance(0.3)) continue;
      if (!flat(x, y)) continue;
      const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL;
      const gy = gf(x, y);
      const walls = sides.filter(([dx, dy]) => wallAt(x + dx, y + dy));
      if (!walls.length) continue;
      const [dx, dy] = rng.pick(walls);
      const n = rng.int(2, 6);
      for (let i = 0; i < n; i++) {
        const along = rng.range(-1.3, 1.3), off = rng.range(0.1, 0.55);
        const px = cx + dx * (CELL / 2 - off) + (dx ? 0 : along), pz = cz + dy * (CELL / 2 - off) + (dy ? 0 : along);
        const s = rng.range(0.06, 0.17);
        const g = rock.clone();
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, gy + s * 0.6, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 3), 0)), new THREE.Vector3(s, s * 0.7, s * 1.2)));
        put(solid, rng.chance(0.7) ? darkStone : stone, g);
      }
      if ((theme === "crypt" || theme === "catacombs") && rng.chance(0.5)) {
        for (let i = 0; i < rng.int(1, 3); i++) {
          box(solid, bone, rng.range(0.25, 0.45), 0.05, 0.06, cx + dx * (CELL / 2 - 0.5) + rng.range(-1, 1) * (dx ? 0.2 : 1), gy + 0.03, cz + dy * (CELL / 2 - 0.5) + rng.range(-1, 1) * (dy ? 0.2 : 1), rng.range(0, 3));
        }
      }
    }
  for (const r of d.rooms) {
    const n = theme === "hub" ? 0 : rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const x = (r.x + rng.range(0.3, r.w - 0.3)) * CELL, z = (r.y + rng.range(0.3, r.h - 0.3)) * CELL;
      if (!floor(Math.floor(x / CELL), Math.floor(z / CELL))) continue;
      const top = ceilAt(d, x, z);
      if (theme === "sanctum" || theme === "cathedral") {
        const len = rng.range(0.8, 2.0);
        for (let k = 0; k < len / 0.17; k++) box(solid, iron, 0.05, 0.15, 0.05, x + Math.sin(k) * 0.02, top - 0.08 - k * 0.17, z, (k % 2) * 1.57);
        if (rng.chance(0.5)) box(solid, iron, 0.18, 0.18, 0.04, x, top - 0.2 - len, z);
      } else {
        // корни свисают сквозь потолок
        let px = x, pz = z;
        const len = rng.range(0.6, 1.8);
        for (let k = 0; k < 5; k++) {
          const seg = len / 5;
          box(solid, root, 0.05 - k * 0.006, seg, 0.05 - k * 0.006, px, top - seg * (k + 0.5), pz, 0, rng.range(-0.3, 0.3), rng.range(-0.3, 0.3));
          px += rng.range(-0.06, 0.06);
          pz += rng.range(-0.06, 0.06);
        }
      }
    }
  }
  for (const [m, geos] of solid) {
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    field.bakeGeometry(g, 0.25);
    group.add(new THREE.Mesh(g, m));
  }

  // ---------------------------------------------------------- пятна на полу и стенах
  const decals = new Map<string, THREE.BufferGeometry[]>();
  const addDecal = (key: string, g: THREE.BufferGeometry) => {
    if (!decals.has(key)) decals.set(key, []);
    decals.get(key)!.push(g.toNonIndexed());
  };
  const pool = DECALS[theme] || DECALS.crypt;
  let layer = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floor(x, y) || !rng.chance(theme === "hub" ? 0.22 : 0.38)) continue;
      if (!flat(x, y)) continue;
      const kind = rng.weighted(pool, (p) => p[1])[0];
      const size = rng.range(1.0, kind === "puddle" ? 2.2 : 2.6);
      const g = new THREE.PlaneGeometry(size, size);
      g.rotateX(-Math.PI / 2);
      g.rotateY(rng.range(0, Math.PI * 2));
      g.translate((x + rng.range(0.25, 0.75)) * CELL, gf(x, y) + 0.012 + (layer++ % 7) * 0.002, (y + rng.range(0.25, 0.75)) * CELL);
      addDecal(`${kind}:${rng.int(0, 2)}`, g);
    }
  // подтёки и сажа на стенах
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floor(x, y)) continue;
      for (const [dx, dy] of sides) {
        if (!wallAt(x + dx, y + dy) || !rng.chance(0.14)) continue;
        const kind = theme === "sanctum" || rng.chance(0.3) ? "drip" : rng.chance(0.5) ? "moss" : "grime";
        const w = rng.range(1.0, 2.2), h = kind === "moss" ? rng.range(0.6, 1.2) : rng.range(1.4, 2.6);
        const g = new THREE.PlaneGeometry(w, h);
        const cx = (x + 0.5) * CELL + dx * (CELL / 2 - 0.02), cz = (y + 0.5) * CELL + dy * (CELL / 2 - 0.02);
        g.rotateY(Math.atan2(-dx, -dy));
        const along = rng.range(-0.8, 0.8);
        const g0 = gf(x, y);
        g.translate(cx + (dx ? 0 : along), kind === "moss" ? g0 + h / 2 + 0.05 : Math.max(g0 + h / 2 + 0.3, d.ceil[y * W + x] - h / 2 - rng.range(0, 1.2)), cz + (dy ? 0 : along));
        addDecal(`${kind}:${rng.int(0, 2)}`, g);
      }
    }
  // сажа над факелами
  for (const p of d.props) {
    if (p.kind !== "torch") continue;
    const g = new THREE.PlaneGeometry(1.1, 1.6);
    g.rotateY(p.rot);
    const dx = Math.sin(p.rot), dz = Math.cos(p.rot);
    g.translate(p.x - dx * 0.2, groundAt(d, p.x, p.z) + 3.7, p.z - dz * 0.2);
    addDecal("soot:0", g);
  }
  for (const [key, geos] of decals) {
    const [kind, seed] = key.split(":");
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    field.bakeGeometry(g, 0.3);
    const m = litMaterial({ map: decalTexture(kind, Number(seed)), transparent: true, baked: true, side: THREE.DoubleSide });
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  // ---------------------------------------------------------- паутина в верхних углах
  const webs: THREE.BufferGeometry[] = [];
  const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!floor(x, y)) continue;
      for (const [sx, sy] of corners) {
        if (!wallAt(x + sx, y) || !wallAt(x, y + sy) || !rng.chance(theme === "hub" ? 0.2 : 0.45)) continue;
        const cx = (x + 0.5 + sx * 0.5) * CELL - sx * 0.03, cz = (y + 0.5 + sy * 0.5) * CELL - sy * 0.03;
        const s = rng.range(0.9, 1.6);
        const top = d.ceil[y * W + x] - 0.02;
        const pos = [cx, top, cz, cx - sx * s, top - rng.range(0, 0.25), cz, cx, top - s, cz - sy * s * 0.6];
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
        g.computeVertexNormals();
        webs.push(g);
        // второй треугольник по другой стене
        const pos2 = [cx, top, cz, cx, top - rng.range(0, 0.25), cz - sy * s, cx - sx * s * 0.6, top - s, cz];
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute("position", new THREE.Float32BufferAttribute(pos2, 3));
        g2.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
        g2.computeVertexNormals();
        webs.push(g2);
      }
    }
  if (webs.length) {
    const g = mergeGeometries(webs, false)!;
    field.bakeGeometry(g, 0.4);
    const m = litMaterial({ map: cobwebTexture(), transparent: true, baked: true, side: THREE.DoubleSide, color: "#bdb6a6" });
    m.depthWrite = false;
    group.add(new THREE.Mesh(g, m));
  }
}

// ------------------------------------------------------------------ живой воздух
interface Mote { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; kind: number }

export class AmbientFx {
  points: THREE.Points;
  embers: THREE.Points;
  private motes: Mote[] = [];
  private sparks: Mote[] = [];
  private flames: THREE.Vector3[];
  private d: Dungeon;
  private field: LightField;
  private rng = new Rng(12345);
  private posA: Float32Array;
  private colA: Float32Array;
  private posE: Float32Array;
  private colE: Float32Array;
  private splash: (x: number, z: number) => void;
  private dripAcc = 0;

  constructor(scene: THREE.Group, d: Dungeon, field: LightField, flames: THREE.Vector3[], splash: (x: number, z: number) => void) {
    this.d = d;
    this.field = field;
    this.flames = flames;
    this.splash = splash;
    const N = 160, E = 120;
    this.posA = new Float32Array(N * 3);
    this.colA = new Float32Array(N * 3);
    this.posE = new Float32Array(E * 3);
    this.colE = new Float32Array(E * 3);
    const mk = (pos: Float32Array, col: Float32Array, size: number, tex: THREE.Texture, additive: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const m = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false;
      scene.add(p);
      return p;
    };
    this.points = mk(this.posA, this.colA, 0.018, pixelTexture(), true);
    this.embers = mk(this.posE, this.colE, 0.05, glowTexture(), true);
    for (let i = 0; i < N; i++) this.motes.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, kind: 0 });
    for (let i = 0; i < E; i++) this.sparks.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, kind: 1 });
  }

  private floorAt(x: number, z: number) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    return cx >= 0 && cz >= 0 && cx < this.d.w && cz < this.d.h && this.d.cells[cz * this.d.w + cx] === Cell.Floor;
  }

  update(dt: number, t: number, px: number, pz: number) {
    const r = this.rng;
    const c = new THREE.Color();
    // пыль в воздухе вокруг игрока, видна там, где светло
    this.motes.forEach((m, i) => {
      m.life -= dt;
      if (m.life <= 0) {
        // не ближе метра к глазам, чтобы пылинка не становилась «квадратом» на весь экран
        let x = px + r.range(-9, 9), z = pz + r.range(-9, 9);
        if (Math.hypot(x - px, z - pz) < 1.2) x += 2;
        if (!this.floorAt(x, z)) { m.y = -10; m.life = 0.3; }
        else Object.assign(m, { x, y: r.range(groundAt(this.d, x, z) + 0.3, ceilAt(this.d, x, z) - 0.4), z, vx: r.range(-0.06, 0.06), vy: r.range(-0.03, 0.04), vz: r.range(-0.06, 0.06), life: r.range(4, 9), max: 8 });
      }
      m.x += (m.vx + Math.sin(t * 0.7 + i) * 0.03) * dt;
      m.y += m.vy * dt;
      m.z += (m.vz + Math.cos(t * 0.6 + i) * 0.03) * dt;
      this.posA.set([m.x, m.y, m.z], i * 3);
      this.field.sample(m.x, m.y, m.z, 0, 0, 0, c);
      const fade = Math.min(1, m.life, (m.max - m.life) * 2) * 0.3;
      const k = Math.max(0, Math.min(1.2, (c.r + c.g + c.b) / 3 - 0.12)) * fade;
      this.colA.set([c.r * k, c.g * k, c.b * k], i * 3);
    });
    // искры над огнём поблизости
    const near = this.flames.filter((f) => Math.abs(f.x - px) < 14 && Math.abs(f.z - pz) < 14);
    this.sparks.forEach((s, i) => {
      s.life -= dt;
      if (s.life <= 0 && near.length && r.chance(0.08)) {
        const f = r.pick(near);
        Object.assign(s, { kind: 1, x: f.x + r.range(-0.1, 0.1), y: f.y + 0.1, z: f.z + r.range(-0.1, 0.1), vx: r.range(-0.25, 0.25), vy: r.range(0.6, 1.4), vz: r.range(-0.25, 0.25), life: r.range(0.6, 1.6), max: 1.6 });
      }
      if (s.life > 0 && s.kind === 2) {
        s.vy -= 14 * dt;
        s.y += s.vy * dt;
        if (s.y <= groundAt(this.d, s.x, s.z) + 0.03) {
          this.splash(s.x, s.z);
          s.life = 0;
        }
      } else if (s.life > 0) {
        s.x += (s.vx + Math.sin(t * 5 + i) * 0.2) * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
      } else s.y = -10;
      this.posE.set([s.x, s.y, s.z], i * 3);
      if (s.kind === 2) this.colE.set([0.35, 0.45, 0.55], i * 3);
      else {
        const k = Math.max(0, Math.min(1, s.life / 0.8));
        this.colE.set([1.0 * k, 0.55 * k, 0.18 * k], i * 3);
      }
    });
    // капли с потолка
    this.dripAcc += dt;
    if (this.dripAcc > 1.4) {
      this.dripAcc = 0;
      const x = px + r.range(-6, 6), z = pz + r.range(-6, 6);
      const free = this.sparks.find((q) => q.life <= 0);
      if (free && this.floorAt(x, z)) Object.assign(free, { kind: 2, x, y: ceilAt(this.d, x, z) - 0.05, z, vx: 0, vy: 0, vz: 0, life: 3, max: 3 });
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.embers.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.embers.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
