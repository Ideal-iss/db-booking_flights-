/** Отрисовка уровня: стены, пол, потолок, декорации, сундуки, тайники, ловушки, порталы. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL, Cell, WALL_H, ceilAt, type Dungeon } from "@shared/dungeon/generate";
import type { Snapshot } from "@shared/sim/types";
import { LightField, litMaterial, probeAt, staticLights } from "./lighting";
import { ceilingTexture, floorTexture, wallTexture, glowTexture, metalTexture, crateTexture, paperTexture, woodTexture, liquidTexture, stoneTexture, decalTexture } from "./textures";
import { CHASM_Y, DIRS, LIQUID_DEPTH, STAIR_RISE, cellFloor, edgeHeight, groundAt, stairAt } from "@shared/dungeon/terrain";
import { dressLevel } from "./dressing";
import { humanoid, makeChest, makeFlame, makeProp, makeWeapon, type Rig } from "./models";

interface Flame {
  sprite: THREE.Sprite;
  base: number;
  phase: number;
}

export class LevelView {
  group = new THREE.Group();
  field: LightField;
  d: Dungeon;
  flames: Flame[] = [];
  chests = new Map<string, { lid: THREE.Group; open: number; target: number; obj: THREE.Group }>();
  secrets = new Map<string, { mesh: THREE.Mesh; sink: number; open: boolean }>();
  traps = new Map<string, THREE.Group>();
  shrines = new Map<string, THREE.Object3D>();
  animated: THREE.Object3D[] = [];
  exitPortal: THREE.Group;
  npcRigs: { rig: Rig; id: string }[] = [];
  explored: Uint8Array;
  flamePos: THREE.Vector3[] = [];
  breakables = new Map<string, { whole: THREE.Object3D; broken: THREE.Object3D; done: boolean }>();
  notes = new Map<string, { obj: THREE.Group; glow: THREE.Sprite; read: boolean }>();
  chandeliers = new Map<string, { obj: THREE.Group; chain: THREE.Object3D; rope: THREE.Object3D; flames: THREE.Sprite[]; y: number; fallT: number; vy: number; landed: boolean }>();
  levers = new Map<string, { handle: THREE.Group; vents: THREE.Mesh[] }>();
  doors = new Map<string, { pivot: THREE.Group; kind: "key" | "gate"; open: number; target: number }>();
  keys = new Map<string, THREE.Group>();
  plates = new Map<string, { obj: THREE.Mesh; down: boolean }>();
  cracks = new Map<string, { slab: THREE.Group; ramp: THREE.Group; t: number; pit: number; parts: { m: THREE.Object3D; vy: number; spin: number }[] }>();
  liquidTex: THREE.Texture[] = [];
  private gy(x: number, z: number) {
    return groundAt(this.d, x, z);
  }

  constructor(d: Dungeon) {
    this.d = d;
    const pal = d.theme.palette;
    const ambient = new THREE.Color(pal.fog).multiplyScalar(2).add(d.theme.id === "hub" ? new THREE.Color(0.34, 0.29, 0.22) : new THREE.Color(0.17, 0.145, 0.12));
    this.field = new LightField(d, staticLights(d), ambient);
    this.explored = new Uint8Array(d.w * d.h);
    // логово хозяина этажа видно на карте сразу — понятно, куда идти
    const boss = d.rooms[d.bossRoom];
    if (boss) for (let y = boss.y; y < boss.y + boss.h; y++) for (let x = boss.x; x < boss.x + boss.w; x++) this.explored[y * d.w + x] = 1;
    this.buildShell();
    this.buildProps();
    dressLevel(d, this.field, this.group);
    this.buildBreakables();
    this.buildNotes();
    this.buildChests();
    this.buildChandeliers();
    this.buildLevers();
    this.buildSecrets();
    this.buildTraps();
    this.buildTerrainMechanics();
    this.exitPortal = this.buildExit();
  }

  private isFloor(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.d.w || y >= this.d.h) return false;
    return this.d.cells[y * this.d.w + x] === Cell.Floor;
  }

  private buildShell() {
    const d = this.d;
    const pal = d.theme.palette;
    // несколько вариантов текстур: трещины, мох, выпавшие кирпичи — стены перестают быть одинаковыми
    // наборы 0–3 — кладка с вариантами, 4 — скала пещер; пол 0–2 + 3 — земля пещер
    const wallSets = Array.from({ length: 5 }, () => ({ p: [] as number[], u: [] as number[], n: [] as number[] }));
    const floorSets = Array.from({ length: 4 }, () => ({ p: [] as number[], u: [] as number[], n: [] as number[] }));
    const caveCells = new Uint8Array(d.w * d.h);
    for (const r of d.rooms) if (r.kind === "cave") for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) caveCells[y * d.w + x] = 1;
    const hash = (a: number, b: number, c: number) => {
      let h = (a * 374761393 + b * 668265263 + c * 2147483647 + d.seed * 97) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) % 100;
    };
    const wv = (x: number, y: number, side: number) => {
      const h = hash(x, y, side);
      return h < 55 ? 0 : h < 72 ? 1 : h < 90 ? 2 : 3;
    };
    const fv = (x: number, y: number) => {
      const h = hash(x, y, 9);
      return h < 62 ? 0 : h < 84 ? 1 : 2;
    };
    const ceils: number[] = [], ceilUv: number[] = [], ceilN: number[] = [];
    // Квад, разбитый на сетку, чтобы запечённый свет давал плавный градиент.
    const quad = (pos: number[], uv: number[], nor: number[], o: THREE.Vector3, ux: THREE.Vector3, vy: THREE.Vector3, n: THREE.Vector3, su: number, sv: number, uvScale: [number, number], uvOff: [number, number]) => {
      for (let j = 0; j < sv; j++)
        for (let i = 0; i < su; i++) {
          const p = (a: number, b: number) => {
            const u = (i + a) / su, v = (j + b) / sv;
            pos.push(o.x + ux.x * u + vy.x * v, o.y + ux.y * u + vy.y * v, o.z + ux.z * u + vy.z * v);
            uv.push(uvOff[0] + u * uvScale[0], uvOff[1] + v * uvScale[1]);
            nor.push(n.x, n.y, n.z);
          };
          p(0, 0); p(1, 0); p(1, 1);
          p(0, 0); p(1, 1); p(0, 1);
        }
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const ceilOf = (x: number, y: number) => d.ceil[y * d.w + x];
    // открытые клетки: пол, двери, пропасти (у пропасти стены уходят вниз)
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < d.w && y < d.h && d.cells[y * d.w + x] !== Cell.Wall && d.cells[y * d.w + x] !== Cell.Secret;
    const crackOf = new Map<number, number>();
    for (const c of d.cracks || []) for (const [cx, cy] of c.cells) crackOf.set(cy * d.w + cx, c.pitH);
    const deep = (x: number, y: number) => d.cells[y * d.w + x] === Cell.Chasm || !!d.bridge?.[y * d.w + x];
    // статический низ клетки: под треснувшей плитой — уже дно ямы, под мостом — дно пропасти
    const base = (x: number, y: number) => (deep(x, y) ? CHASM_Y : crackOf.has(y * d.w + x) ? crackOf.get(y * d.w + x)! : cellFloor(d, x, y));
    const edge = (x: number, y: number, dx: number, dy: number) => (deep(x, y) ? CHASM_Y : crackOf.has(y * d.w + x) ? crackOf.get(y * d.w + x)! : edgeHeight(d, x, y, dx, dy));
    const abyss: number[] = [], abyssUv: number[] = [], abyssN: number[] = [];
    const liquids = new Map<number, { p: number[]; u: number[]; n: number[] }>();
    const steps: THREE.BufferGeometry[] = [];
    for (let y = 0; y < d.h; y++)
      for (let x = 0; x < d.w; x++) {
        if (!open(x, y)) continue;
        const x0 = x * CELL, z0 = y * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        const h = ceilOf(x, y);
        const inCave = caveCells[y * d.w + x] === 1;
        const F = floorSets[inCave ? 3 : fv(x, y)];
        const st = stairAt(d, x, y);
        const g = st ? st.h0 : base(x, y);
        if (st) {
          // ступени: четыре коробки, низ — до самого низкого соседа сбоку
          const [ux, uy] = DIRS[st.dir];
          let bottom = st.h0;
          for (const [sx, sy] of [[uy, ux], [-uy, -ux]]) if (open(x + sx, y + sy)) bottom = Math.min(bottom, edge(x + sx, y + sy, -sx, -sy));
          bottom = Math.max(CHASM_Y, bottom) - 0.02;
          for (let k = 0; k < 4; k++) {
            const top = st.h0 + (k + 1) * (STAIR_RISE / 4);
            const along = (k + 0.5) * (CELL / 4) - CELL / 2;
            const bg = new THREE.BoxGeometry(ux ? CELL / 4 : CELL, top - bottom, uy ? CELL / 4 : CELL).toNonIndexed();
            bg.translate((x + 0.5) * CELL + ux * along, (top + bottom) / 2, (y + 0.5) * CELL + uy * along);
            steps.push(bg);
          }
        } else if (deep(x, y)) {
          quad(abyss, abyssUv, abyssN, V(x0, CHASM_Y, z1), V(CELL, 0, 0), V(0, 0, -CELL), V(0, 1, 0), 1, 1, [1, 1], [0, 0]);
        } else {
          quad(F.p, F.u, F.n, V(x0, g, z1), V(CELL, 0, 0), V(0, 0, -CELL), V(0, 1, 0), 2, 2, [1, 1], [0, 0]);
          const lq = d.liquid?.[y * d.w + x] || 0;
          if (lq) {
            if (!liquids.has(lq)) liquids.set(lq, { p: [], u: [], n: [] });
            const L = liquids.get(lq)!;
            quad(L.p, L.u, L.n, V(x0, g + LIQUID_DEPTH - 0.04, z1), V(CELL, 0, 0), V(0, 0, -CELL), V(0, 1, 0), 2, 2, [1, 1], [x * 0.37, y * 0.53]);
          }
        }
        quad(ceils, ceilUv, ceilN, V(x0, h, z0), V(CELL, 0, 0), V(0, 0, CELL), V(0, -1, 0), 2, 2, [1, 1], [0, 0]);
        // стены смотрят внутрь клетки; их высота — от пола клетки до потолка
        const faces: [number, number, THREE.Vector3, THREE.Vector3, THREE.Vector3, number][] = [
          [0, -1, V(x0, 0, z0), V(CELL, 0, 0), V(0, 0, 1), 0],
          [0, 1, V(x1, 0, z1), V(-CELL, 0, 0), V(0, 0, -1), 1],
          [-1, 0, V(x0, 0, z1), V(0, 0, -CELL), V(1, 0, 0), 2],
          [1, 0, V(x1, 0, z0), V(0, 0, CELL), V(-1, 0, 0), 3],
        ];
        for (const [dx, dy, o, ux, n, side] of faces) {
          const W = wallSets[inCave ? 4 : wv(x, y, side)];
          if (!open(x + dx, y + dy)) {
            const bot = g, hh = h - bot;
            quad(W.p, W.u, W.n, o.clone().setY(bot), ux, V(0, hh, 0), n, 2, Math.max(3, Math.round(hh / 1.15)), [1, hh / CELL], [0, bot / CELL]);
            continue;
          }
          // соседний пол с потолком ниже: перемычка над проходом (арка в коридор)
          const h2 = ceilOf(x + dx, y + dy);
          if (h2 < h - 0.05) {
            const oo = o.clone().setY(h2);
            quad(W.p, W.u, W.n, oo, ux, V(0, h - h2, 0), n, 2, Math.max(1, Math.round((h - h2) / 1.15)), [1, (h - h2) / CELL], [0, h2 / CELL]);
          }
          // уступ: сосед ниже — каменный срез смотрит на него
          if (st) {
            const [sx, sy] = DIRS[st.dir];
            if (dx !== sx && dx !== -sx) continue;
            if (dy !== sy && dy !== -sy) continue;
          }
          const me = st ? edgeHeight(d, x, y, dx, dy) : g;
          const nb = edge(x + dx, y + dy, -dx, -dy);
          if (nb < me - 0.01) {
            const hh = me - nb;
            const oo = o.clone().add(ux).setY(nb);
            quad(W.p, W.u, W.n, oo, ux.clone().negate(), V(0, hh, 0), n.clone().negate(), 2, Math.max(1, Math.round(hh / 1.15)), [1, hh / CELL], [0, nb / CELL]);
          }
        }
      }
    const mk = (pos: number[], uv: number[], nor: number[], map: THREE.Texture, color = "#ffffff") => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      this.field.bakeGeometry(g);
      const mesh = new THREE.Mesh(g, litMaterial({ map, color, baked: true }));
      this.group.add(mesh);
      return mesh;
    };
    // скала в пещерах: сдвигаем вершины плавным шумом от позиции (у общих вершин сдвиг одинаковый — без щелей)
    const cave = new Uint8Array(d.w * d.h);
    for (const r of d.rooms) if (r.kind === "cave") for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cave[y * d.w + x] = 1;
    const isCave = (cx: number, cz: number) => cx >= 0 && cz >= 0 && cx < d.w && cz < d.h && cave[cz * d.w + cx] === 1;
    const amp = (x: number, z: number) => {
      const cx = Math.round(x / CELL), cz = Math.round(z / CELL);
      let n = 0;
      for (const [ox, oz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) if (isCave(cx + ox, cz + oz)) n++;
      return n ? 0.42 : 0;
    };
    const noise = (x: number, y: number, z: number, k: number) =>
      Math.sin(x * 1.31 + z * 0.73 + y * 0.97 + k * 1.7) * 0.55 + Math.sin(x * 0.47 - z * 1.63 + y * 0.41 + k * 3.1) * 0.45;
    const rockify = (pos: number[], keepFloor: boolean) => {
      for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        const a = amp(x, z);
        if (!a) continue;
        pos[i] += noise(x, y, z, 1) * a;
        pos[i + 2] += noise(x, y, z, 2) * a;
        if (!keepFloor || y > 0.01) pos[i + 1] = Math.max(y > 0.01 ? 2.6 : 0, y + noise(x, y, z, 3) * a * (y > 0.01 ? 1.4 : 0));
      }
    };
    wallSets.forEach((w) => rockify(w.p, true));
    floorSets.forEach((f) => rockify(f.p, true));
    rockify(ceils, true);
    wallSets.forEach((w, i) => w.p.length && mk(w.p, w.u, w.n, i === 4 ? wallTexture("rock", pal.wall, pal.wall2) : wallTexture(d.theme.wallStyle, pal.wall, pal.wall2, i)));
    floorSets.forEach((f, i) => f.p.length && mk(f.p, f.u, f.n, i === 3 ? floorTexture("dirt", pal.floor, pal.floor2) : floorTexture(d.theme.floorStyle, pal.floor, pal.floor2, i)));
    mk(ceils, ceilUv, ceilN, ceilingTexture(pal.ceil));
    if (steps.length) {
      const g = mergeGeometries(steps, false)!;
      this.field.bakeGeometry(g, 0.2);
      this.group.add(new THREE.Mesh(g, litMaterial({ map: floorTexture(d.theme.floorStyle, pal.floor, pal.floor2, 1), baked: true, color: "#d8d0c4" })));
    }
    if (abyss.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(abyss, 3));
      this.group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: d.theme.id === "abyss" ? "#0c0614" : "#040302" })));
    }
    const LQ: Record<number, "water" | "blood" | "lava" | "void"> = { 1: "water", 2: "blood", 3: "lava", 4: "void" };
    for (const [k, L] of liquids) {
      const kind = LQ[k];
      const tex = liquidTexture(kind).clone();
      tex.needsUpdate = true;
      this.liquidTex.push(tex);
      tex.userData.speed = kind === "lava" ? 0.05 : kind === "void" ? 0.03 : 0.08;
      if (kind === "lava" || kind === "void") {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(L.p, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(L.u, 2));
        this.group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, color: kind === "lava" ? "#ffffff" : "#c8b0ff", transparent: kind === "void", opacity: 0.92 })));
      } else {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(L.p, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(L.u, 2));
        g.setAttribute("normal", new THREE.Float32BufferAttribute(L.n, 3));
        this.field.bakeGeometry(g, 0.3);
        const m = litMaterial({ map: tex, baked: true, transparent: true, opacity: kind === "water" ? 0.72 : 0.86, color: kind === "water" ? "#9ab8c4" : "#c03028" });
        m.depthWrite = false;
        const mesh = new THREE.Mesh(g, m);
        mesh.renderOrder = 2;
        this.group.add(mesh);
      }
    }
  }

  private buildProps() {
    const pal = this.d.theme.palette;
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.d.props) {
      if (p.kind.startsWith("npc:")) continue;
      const { obj, flames } = makeProp(p.kind, pal);
      obj.position.set(p.x, this.gy(p.x, p.z), p.z);
      // настенные вещи развёрнуты от стены
      obj.rotation.y = p.wall ? p.rot + Math.PI : p.rot;
      if (p.kind === "portal") obj.rotation.y = p.rot;
      obj.updateMatrixWorld(true);
      for (const f of flames || []) this.addFlame(f.clone().applyMatrix4(obj.matrixWorld), p.kind === "candles" || p.kind === "niche" || p.kind === "altar" ? 0.45 : p.kind === "brazier" ? 2.0 : 1.0);
      const keep: THREE.Object3D[] = [];
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (o.name) {
          keep.push(o);
          return;
        }
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        for (const key of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(key)) g.deleteAttribute(key);
        if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
        const mat = m.material as THREE.Material;
        if (!buckets.has(mat)) buckets.set(mat, []);
        buckets.get(mat)!.push(g);
      });
      for (const k of keep) {
        const wp = new THREE.Vector3();
        k.getWorldPosition(wp);
        k.removeFromParent();
        k.position.copy(wp);
        this.group.add(k);
        this.animated.push(k);
      }
    }
    for (const [mat, geos] of buckets) {
      const g = mergeGeometries(geos, false);
      if (!g) continue;
      if ((mat as THREE.MeshLambertMaterial).isMeshLambertMaterial) this.field.bakeGeometry(g, 0.3);
      this.group.add(new THREE.Mesh(g, mat));
    }
    for (const s of this.d.shrines) {
      const gem = this.animated.find((a) => a.name === "gem" && Math.hypot(a.position.x - s.x, a.position.z - s.z) < 0.5);
      if (gem) this.shrines.set(s.id, gem);
    }
  }

  addFlame(pos: THREE.Vector3, scale: number) {
    if (scale >= 0.9) this.flamePos.push(pos.clone());
    const sprite = makeFlame(scale);
    sprite.position.copy(pos);
    sprite.position.y += 0.15 * scale;
    this.group.add(sprite);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ff9a40", transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.setScalar(1.6 * scale);
    halo.position.copy(sprite.position);
    this.group.add(halo);
    this.flames.push({ sprite, base: scale, phase: Math.random() * 10 });
  }

  private buildBreakables() {
    const clay = (probe: { value: THREE.Color }) => litMaterial({ color: "#8a5a3a", probe });
    for (const b of this.d.breakables) {
      const probe = { value: probeAt(this.field, b.x, b.z, new THREE.Color()) };
      const whole = new THREE.Group();
      const broken = new THREE.Group();
      if (b.kind === "urn") {
        const m = clay(probe);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.5, 7), m);
        body.position.y = 0.25;
        const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.22, 7), m);
        belly.position.y = 0.32;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.14, 7), m);
        neck.position.y = 0.56;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.04, 7), litMaterial({ color: "#3a2416", probe }));
        band.position.y = 0.4;
        whole.add(body, belly, neck, band);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.12, 7, 1, true), m);
        base.position.y = 0.06;
        broken.add(base);
        for (let i = 0; i < 5; i++) {
          const sh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.08), m);
          sh.position.set(Math.cos(i * 1.3) * 0.35, 0.015, Math.sin(i * 1.3) * 0.35);
          sh.rotation.y = i;
          broken.add(sh);
        }
      } else if (b.kind === "crate") {
        const m = litMaterial({ map: crateTexture(), probe });
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), m);
        c.position.y = 0.31;
        whole.add(c);
        for (let i = 0; i < 4; i++) {
          const pl = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.14), m);
          pl.position.set(Math.cos(i * 1.7) * 0.3, 0.02 + i * 0.03, Math.sin(i * 1.7) * 0.3);
          pl.rotation.y = i * 0.8;
          broken.add(pl);
        }
      } else {
        const oil = b.kind === "oil";
        // масляная бочка: тёмная, с красными обручами и потёками — её видно издалека
        const m = litMaterial({ map: woodTexture(), color: oil ? "#6a3a2a" : "#9a7a5a", probe });
        const ring = litMaterial({ color: oil ? "#a82a1a" : "#3a3a3e", probe });
        if (oil) {
          const stain = new THREE.Mesh(new THREE.CircleGeometry(0.55, 10), new THREE.MeshBasicMaterial({ color: "#120a06", transparent: true, opacity: 0.6, depthWrite: false }));
          stain.rotation.x = -Math.PI / 2;
          stain.position.y = 0.015;
          whole.add(stain);
          const mark = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.02), new THREE.MeshBasicMaterial({ color: "#e0c070" }));
          mark.position.set(0, 0.42, -0.315);
          mark.rotation.z = Math.PI / 4;
          whole.add(mark);
          const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.4, 12), new THREE.MeshBasicMaterial({ color: "#050302", transparent: true, opacity: 0.7, depthWrite: false }));
          scorch.rotation.x = -Math.PI / 2;
          scorch.position.y = 0.016;
          broken.add(scorch);
        }
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 8), m);
        c.position.y = 0.4;
        const bulge = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.4, 8), m);
        bulge.position.y = 0.4;
        whole.add(c, bulge);
        for (const y of [0.12, 0.68]) {
          const r = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.05, 8), ring);
          r.position.y = y;
          whole.add(r);
        }
        for (let i = 0; i < 5; i++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.7), m);
          st.position.set(Math.cos(i * 1.25) * 0.3, 0.02, Math.sin(i * 1.25) * 0.3);
          st.rotation.y = i * 1.25;
          broken.add(st);
        }
      }
      broken.visible = false;
      for (const o of [whole, broken]) {
        o.position.set(b.x, this.gy(b.x, b.z), b.z);
        o.rotation.y = b.rot;
        this.group.add(o);
      }
      this.breakables.set(b.id, { whole, broken, done: false });
    }
  }

  private buildNotes() {
    for (const n of this.d.notes) {
      const g = new THREE.Group();
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44), litMaterial({ map: paperTexture(), probe: { value: probeAt(this.field, n.x, n.z, new THREE.Color()).addScalar(0.15) } }));
      paper.rotation.x = -Math.PI / 2;
      paper.position.y = 0.02;
      g.add(paper);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#e8d8a8", transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(0.9);
      glow.position.y = 0.15;
      g.add(glow);
      g.position.set(n.x, this.gy(n.x, n.z), n.z);
      g.rotation.y = n.rot;
      this.group.add(g);
      this.notes.set(n.id, { obj: g, glow, read: false });
    }
  }

  markNoteRead(id: string) {
    const n = this.notes.get(id);
    if (n) {
      n.read = true;
      n.glow.visible = false;
    }
  }

  private buildChests() {
    for (const c of this.d.chests) {
      const probe = { value: probeAt(this.field, c.x, c.z, new THREE.Color()) };
      const { obj, lid } = makeChest(c.tier, probe);
      obj.position.set(c.x, this.gy(c.x, c.z), c.z);
      obj.rotation.y = c.rot;
      this.group.add(obj);
      this.chests.set(c.id, { lid, open: 0, target: 0, obj });
    }
  }

  private buildChandeliers() {
    const iron = litMaterial({ color: "#3a3430", map: metalTexture("#4a4440") });
    const wax = new THREE.MeshBasicMaterial({ color: "#e8dcc0" });
    for (const c of this.d.chandeliers) {
      const obj = new THREE.Group();
      obj.position.set(c.x, c.y, c.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 4, 10), iron);
      ring.rotation.x = Math.PI / 2;
      obj.add(ring);
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.04), iron);
        sp.rotation.y = (i * Math.PI) / 4;
        obj.add(sp);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.3, 6), iron);
      obj.add(hub);
      const flames: THREE.Sprite[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 5), wax);
        cd.position.set(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75);
        obj.add(cd);
        const f = makeFlame(0.45);
        f.position.set(cd.position.x, 0.28, cd.position.z);
        obj.add(f);
        flames.push(f);
      }
      const top = ceilAt(this.d, c.x, c.z);
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1, 0.04), iron);
      chain.scale.y = Math.max(0.1, top - c.y);
      chain.position.set(c.x, c.y + chain.scale.y / 2, c.z);
      this.group.add(chain);
      // верёвка от люстры к крюку на стене: её можно перерезать
      const rope = new THREE.Group();
      const anchor = new THREE.Vector3(c.ax, this.gy(c.ax, c.az) + 1.5, c.az);
      const pulley = new THREE.Vector3(c.ax, top - 0.3, c.az);
      const ropeMat = new THREE.MeshBasicMaterial({ color: "#8a6a42" });
      const seg = (a: THREE.Vector3, b: THREE.Vector3) => {
        const len = a.distanceTo(b);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, len), ropeMat);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.lookAt(b);
        rope.add(m);
      };
      seg(anchor, pulley);
      seg(pulley, new THREE.Vector3(c.x, top - 0.3, c.z));
      const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.12), iron);
      cleat.position.copy(anchor);
      rope.add(cleat);
      this.group.add(rope);
      this.group.add(obj);
      this.chandeliers.set(c.id, { obj, chain, rope, flames, y: this.gy(c.x, c.z), fallT: -1, vy: 0, landed: false });
    }
  }

  private buildLevers() {
    const iron = litMaterial({ color: "#4a4440", map: metalTexture("#5a5450") });
    const grateMat = new THREE.MeshBasicMaterial({ color: "#0c0806" });
    for (const lv of this.d.levers) {
      const plate = new THREE.Group();
      plate.position.set(lv.x, this.gy(lv.x, lv.z) + 1.25, lv.z);
      plate.rotation.y = lv.rot;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), iron);
      plate.add(back);
      const handle = new THREE.Group();
      handle.position.z = 0.08;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), iron);
      bar.position.y = 0.25;
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), litMaterial({ color: "#8a2a1a" }));
      knob.position.y = 0.5;
      handle.add(bar, knob);
      handle.rotation.x = -0.5;
      plate.add(handle);
      this.group.add(plate);
      const vents: THREE.Mesh[] = [];
      for (const v of lv.vents) {
        const g = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), grateMat.clone());
        g.rotation.x = -Math.PI / 2;
        g.position.set(v.x, this.gy(v.x, v.z) + 0.018, v.z);
        this.group.add(g);
        for (let i = -2; i <= 2; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.12), iron);
          b.position.set(v.x, this.gy(v.x, v.z) + 0.03, v.z + i * 0.42);
          this.group.add(b);
        }
        vents.push(g);
      }
      this.levers.set(lv.id, { handle, vents });
    }
  }

  private buildSecrets() {
    const pal = this.d.theme.palette;
    for (const s of this.d.secrets) {
      // тайная стена чуть отличается: трещины и более тёмный камень — внимательный игрок заметит
      const tex = wallTexture(this.d.theme.wallStyle, pal.wall2, pal.wall2);
      let sh = 4.6;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.isFloor(s.cx + dx, s.cy + dy)) sh = Math.max(sh, this.d.ceil[(s.cy + dy) * this.d.w + s.cx + dx]);
      const g = new THREE.BoxGeometry(CELL, sh, CELL);
      g.translate((s.cx + 0.5) * CELL, sh / 2, (s.cy + 0.5) * CELL);
      this.field.bakeGeometry(g, 1.6);
      const mesh = new THREE.Mesh(g, litMaterial({ map: tex, baked: true, color: "#c8bca8" }));
      this.group.add(mesh);
      this.secrets.set(s.id, { mesh, sink: 0, open: false });
    }
  }

  private buildTraps() {
    const iron = litMaterial({ color: "#9a9a9e", map: metalTexture("#7a7a7e"), probe: { value: new THREE.Color(0.25, 0.2, 0.15) } });
    const plate = litMaterial({ color: "#3a3430", probe: { value: new THREE.Color(0.2, 0.17, 0.14) } });
    for (const t of this.d.traps) {
      const g = new THREE.Group();
      g.position.set(t.x, this.gy(t.x, t.z), t.z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 2.2), plate);
      base.position.y = 0.02;
      g.add(base);
      const spikes = new THREE.Group();
      spikes.name = "spikes";
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 5; j++) {
          const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.6, 4), iron);
          s.position.set(-0.8 + i * 0.4, 0.3, -0.8 + j * 0.4);
          spikes.add(s);
        }
      spikes.position.y = -0.62;
      g.add(spikes);
      this.group.add(g);
      this.traps.set(t.id, spikes);
    }
  }

  /** Двери, решётки, ключи, плиты, треснувший пол, мосты. */
  private buildTerrainMechanics() {
    const d = this.d;
    const pal = d.theme.palette;
    const probeOf = (x: number, z: number) => ({ value: probeAt(this.field, x, z, new THREE.Color()) });
    const iron = (x: number, z: number) => litMaterial({ color: "#5a5a60", map: metalTexture("#5a5a60"), probe: probeOf(x, z) });
    // двери и решётки
    for (const o of d.doors || []) {
      const cx = (o.cx + 0.5) * CELL, cz = (o.cy + 0.5) * CELL;
      const g0 = cellFloor(d, o.cx, o.cy);
      const holder = new THREE.Group();
      holder.position.set(cx, g0, cz);
      if (o.axis === "z") holder.rotation.y = Math.PI / 2;
      const DH = 3.0;
      // перемычка над проёмом до потолка
      const top = d.ceil[o.cy * d.w + o.cx];
      if (top - g0 > DH + 0.05) {
        const lg = new THREE.BoxGeometry(CELL, top - g0 - DH, 0.9);
        lg.translate(0, DH + (top - g0 - DH) / 2, 0);
        holder.add(new THREE.Mesh(lg, litMaterial({ map: wallTexture(d.theme.wallStyle, pal.wall, pal.wall2, 1), probe: probeOf(cx, cz) })));
      }
      // косяки
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, DH, 0.5), litMaterial({ map: stoneTexture(pal.wall2), probe: probeOf(cx, cz) }));
        post.position.set(s * (CELL / 2 - 0.15), DH / 2, 0);
        holder.add(post);
      }
      const pivot = new THREE.Group();
      holder.add(pivot);
      const W = CELL - 0.6;
      if (o.kind === "key") {
        // дубовая дверь на петлях с железными полосами и замком
        pivot.position.x = -W / 2;
        const wood = litMaterial({ map: woodTexture(), color: "#a07850", probe: probeOf(cx, cz) });
        const slab = new THREE.Mesh(new THREE.BoxGeometry(W, DH - 0.05, 0.18), wood);
        slab.position.set(W / 2, (DH - 0.05) / 2, 0);
        pivot.add(slab);
        const m = iron(cx, cz);
        for (const y of [0.45, 1.5, 2.55]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.12, 0.24), m);
          band.position.set(W / 2, y, 0);
          pivot.add(band);
        }
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.3), litMaterial({ color: "#b08a3a", probe: probeOf(cx, cz) }));
        lock.position.set(W - 0.35, 1.3, 0);
        pivot.add(lock);
        const hole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.32), new THREE.MeshBasicMaterial({ color: "#0a0604" }));
        hole.position.set(W - 0.35, 1.27, 0);
        pivot.add(hole);
      } else {
        // решётка: прутья и поперечины, уходит вверх
        const m = iron(cx, cz);
        for (let i = 0; i <= 8; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, DH, 0.07), m);
          bar.position.set(-W / 2 + (i / 8) * W, DH / 2, 0);
          pivot.add(bar);
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 4), m);
          tip.position.set(bar.position.x, -0.05, 0);
          tip.rotation.x = Math.PI;
          pivot.add(tip);
        }
        for (const y of [0.5, 1.6, 2.7]) {
          const cross = new THREE.Mesh(new THREE.BoxGeometry(W, 0.09, 0.1), m);
          cross.position.set(0, y, 0);
          pivot.add(cross);
        }
      }
      this.group.add(holder);
      this.doors.set(o.id, { pivot, kind: o.kind, open: 0, target: 0 });
    }
    // ключи: золото и свет — видно издалека
    const gold = new THREE.MeshBasicMaterial({ color: "#e8c050" });
    for (const k of d.keys || []) {
      const g = new THREE.Group();
      g.position.set(k.x, this.gy(k.x, k.z) + 0.9, k.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 4, 10), gold);
      ring.position.y = 0.22;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), gold);
      shaft.position.y = -0.05;
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), gold);
      t1.position.set(0.06, -0.18, 0);
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), gold);
      t2.position.set(0.045, -0.08, 0);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#ffd060", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(1.3);
      g.add(ring, shaft, t1, t2, glow);
      this.group.add(g);
      this.keys.set(k.id, g);
    }
    // нажимные плиты
    for (const p of d.plates || []) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 1.5), litMaterial({ map: stoneTexture("#8a8070"), color: "#b0a690", probe: probeOf(p.x, p.z) }));
      m.position.set(p.x, this.gy(p.x, p.z) + 0.06, p.z);
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: decalTexture("crack", 1), color: "#c9a46a", transparent: true, depthWrite: false }));
      rune.rotation.x = -Math.PI / 2;
      rune.position.y = 0.065;
      m.add(rune);
      this.group.add(m);
      this.plates.set(p.id, { obj: m, down: false });
    }
    // треснувший пол: плита сверху, под ней яма и пандус из обломков
    const crackTex = floorTexture(d.theme.floorStyle, pal.floor, pal.floor2, 2);
    for (const c of d.cracks || []) {
      const slab = new THREE.Group();
      const parts: { m: THREE.Object3D; vy: number; spin: number }[] = [];
      const mat = litMaterial({ map: crackTex, color: "#c8bcaa", probe: probeOf((c.cells[0][0] + 0.5) * CELL, (c.cells[0][1] + 0.5) * CELL) });
      const crackMat = new THREE.MeshBasicMaterial({ map: decalTexture("crack", 0), color: "#000000", transparent: true, opacity: 0.85, depthWrite: false });
      for (const [x, y] of c.cells) {
        // каждую клетку — четырьмя кусками, чтобы обвал выглядел обвалом
        for (let i = 0; i < 4; i++) {
          const piece = new THREE.Mesh(new THREE.BoxGeometry(CELL / 2 - 0.02, 0.3, CELL / 2 - 0.02), mat);
          piece.position.set((x + 0.25 + (i % 2) * 0.5) * CELL, -0.15, (y + 0.25 + (i >> 1) * 0.5) * CELL);
          const cr = new THREE.Mesh(new THREE.PlaneGeometry(CELL / 2, CELL / 2), crackMat);
          cr.rotation.x = -Math.PI / 2;
          cr.rotation.z = i * 1.3;
          cr.position.y = 0.152;
          piece.add(cr);
          slab.add(piece);
          parts.push({ m: piece, vy: 0, spin: (Math.random() - 0.5) * 3 });
        }
      }
      this.group.add(slab);
      const ramp = new THREE.Group();
      const rock = litMaterial({ map: stoneTexture(pal.wall2), color: "#a89c8c", probe: probeOf((c.ramp.cx + 0.5) * CELL, (c.ramp.cy + 0.5) * CELL) });
      const rises = Math.round(-c.pitH / STAIR_RISE);
      const [ux, uy] = DIRS[c.ramp.dir];
      for (let k = 0; k < rises; k++) {
        const sx = c.ramp.cx - ux * (rises - 1 - k), sy = c.ramp.cy - uy * (rises - 1 - k);
        const h0 = c.pitH + k * STAIR_RISE;
        for (let j = 0; j < 4; j++) {
          const top = h0 + (j + 1) * (STAIR_RISE / 4);
          const along = (j + 0.5) * (CELL / 4) - CELL / 2;
          const b = new THREE.Mesh(new THREE.BoxGeometry(ux ? CELL / 4 + 0.1 : CELL - 0.2, top - c.pitH, uy ? CELL / 4 + 0.1 : CELL - 0.2), rock);
          b.position.set((sx + 0.5) * CELL + ux * along, (top + c.pitH) / 2, (sy + 0.5) * CELL + uy * along);
          b.rotation.y = (Math.random() - 0.5) * 0.12;
          ramp.add(b);
        }
      }
      ramp.visible = false;
      this.group.add(ramp);
      this.cracks.set(c.id, { slab, ramp, t: -1, pit: c.pitH, parts });
    }
    // мосты: доски поперёк, балки и верёвочные перила
    if (d.bridge) {
      const wood: THREE.BufferGeometry[] = [];
      const rope: THREE.BufferGeometry[] = [];
      const put = (arr: THREE.BufferGeometry[], w: number, h: number, dd: number, x: number, y: number, z: number, ry = 0) => {
        const g = new THREE.BoxGeometry(w, h, dd).toNonIndexed();
        g.rotateY(ry);
        g.translate(x, y, z);
        arr.push(g);
      };
      for (let y = 0; y < d.h; y++)
        for (let x = 0; x < d.w; x++) {
          if (!d.bridge[y * d.w + x]) continue;
          const solidSide = (xx: number, yy: number) => d.cells[yy * d.w + xx] !== Cell.Chasm && d.cells[yy * d.w + xx] !== Cell.Wall;
          const alongX = solidSide(x - 1, y) || solidSide(x + 1, y) || (!solidSide(x, y - 1) && !solidSide(x, y + 1) && (!!d.bridge[y * d.w + x - 1] || !!d.bridge[y * d.w + x + 1]));
          const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL;
          const ry = alongX ? 0 : Math.PI / 2;
          const hy = groundAt(d, cx, cz);
          // доски поперёк пролёта
          for (let i = 0; i < 7; i++) {
            const off = -CELL / 2 + 0.22 + i * 0.43;
            put(wood, 0.36, 0.08, CELL - 0.3, alongX ? cx + off : cx, hy - 0.04, alongX ? cz : cz + off, ry);
          }
          for (const s of [-1, 1]) {
            put(wood, CELL, 0.16, 0.18, alongX ? cx : cx + s * (CELL / 2 - 0.2), hy - 0.14, alongX ? cz + s * (CELL / 2 - 0.2) : cz, ry);
            const px = alongX ? cx - CELL / 2 + 0.1 : cx + s * (CELL / 2 - 0.2), pz = alongX ? cz + s * (CELL / 2 - 0.2) : cz - CELL / 2 + 0.1;
            put(wood, 0.12, 1.1, 0.12, px, hy + 0.45, pz);
            put(rope, CELL, 0.04, 0.04, alongX ? cx : cx + s * (CELL / 2 - 0.2), hy + 0.95, alongX ? cz + s * (CELL / 2 - 0.2) : cz, ry);
          }
        }
      if (wood.length) {
        const g = mergeGeometries(wood, false)!;
        this.field.bakeGeometry(g, 0.3);
        this.group.add(new THREE.Mesh(g, litMaterial({ map: woodTexture(), baked: true, color: "#b89a74" })));
      }
      if (rope.length) {
        const g = mergeGeometries(rope, false)!;
        this.group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#6a5232" })));
      }
    }
  }

  private buildExit(): THREE.Group {
    const g = new THREE.Group();
    if (this.d.exit.x < 0) return g;
    g.position.set(this.d.exit.x, this.gy(this.d.exit.x, this.d.exit.z), this.d.exit.z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 6, 20), new THREE.MeshBasicMaterial({ color: "#8fd0ff" }));
    ring.position.y = 1.5;
    g.add(ring);
    const veil = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 20),
      new THREE.MeshBasicMaterial({ color: "#5f9fe8", transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    veil.position.y = 1.5;
    g.add(veil);
    g.visible = false;
    g.scale.setScalar(0.01);
    this.group.add(g);
    return g;
  }

  /** Фигуры NPC лагеря. */
  addNpcs(npcs: { id: string; kind: string; x: number; z: number; yaw: number }[]) {
    for (const n of npcs) {
      const g = new THREE.Group();
      g.position.set(n.x, 0, n.z);
      g.rotation.y = n.yaw;
      let rig: Rig | null = null;
      if (n.kind === "merchant") {
        rig = humanoid({ skin: "#c9a07a", cloth: "#4a3a5a", trim: "#c9a46a", head: "hood", eyes: "#2a1a10", bulk: 1.15 });
        const stall = makeChest("chest");
        stall.obj.position.set(0, 0, -0.9);
        g.add(stall.obj);
        stall.lid.rotation.x = -1.6;
      } else if (n.kind === "smith") {
        rig = humanoid({ skin: "#b07d52", cloth: "#3a2a1e", trim: "#5a4030", head: "human", hair: "braid", hairColor: "#a8763a", bulk: 1.25 });
        rig.hand.add(makeWeapon("mace", rig.probe));
        const anvil = new THREE.Group();
        const iron = litMaterial({ color: "#4a4a4e", map: metalTexture("#4a4a4e"), probe: rig.probe });
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.4), iron);
        a.position.y = 0.75;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.3), iron);
        b.position.y = 0.3;
        anvil.add(a, b);
        anvil.position.set(0, 0, -1.0);
        g.add(anvil);
        this.addFlame(new THREE.Vector3(n.x + Math.sin(n.yaw) * -1.6 + 0.8, 0.6, n.z), 1.6);
      } else if (n.kind === "priest") {
        rig = humanoid({ skin: "#e0c0a0", cloth: "#d8cdb2", trim: "#7a2a24", robe: true, head: "human", hair: "bald", bulk: 1 });
        const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.08), litMaterial({ color: "#6a4a2a", probe: rig.probe }));
        board.position.set(1.0, 1.6, 0.4);
        g.add(board);
        for (let i = 0; i < 4; i++) {
          const note = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.32), new THREE.MeshBasicMaterial({ color: "#d8cdb2" }));
          note.position.set(0.6 + (i % 2) * 0.4 + (i > 1 ? 0.1 : 0), 1.75 - Math.floor(i / 2) * 0.4, 0.35);
          note.rotation.y = Math.PI;
          g.add(note);
        }
      } else if (n.kind === "stash") {
        const chest = makeChest("boss");
        chest.obj.scale.setScalar(1.3);
        g.add(chest.obj);
      } else if (n.kind === "gate") {
        const { obj } = makeProp("portal", this.d.theme.palette);
        obj.scale.set(1.2, 1.15, 1);
        g.add(obj);
        obj.traverse((o) => {
          if (o.name === "veil") this.animated.push(o);
        });
      } else if (n.kind === "altar") {
        const stone = litMaterial({ color: "#5a4a5a", map: null, probe: { value: new THREE.Color(0.4, 0.3, 0.45) } });
        const a = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.8, 8), stone);
        a.position.y = 0.4;
        g.add(a);
        const f = makeFlame(1.6);
        (f.material as THREE.SpriteMaterial).color.set("#c46aff");
        f.position.y = 1.25;
        g.add(f);
        this.flames.push({ sprite: f, base: 1.6, phase: 1 });
      }
      if (rig) {
        g.add(rig.root);
        probeAt(this.field, n.x, n.z, rig.probe.value);
        this.npcRigs.push({ rig, id: n.id });
      }
      this.group.add(g);
    }
  }

  update(t: number, dt: number, opened?: Partial<Snapshot["opened"]>, trapActive?: (id: string) => boolean, exitOpen?: boolean, levers?: Record<string, number>) {
    for (const f of this.flames) {
      const frame = Math.floor(t * 10 + f.phase * 3) % 4;
      const map = (f.sprite.material as THREE.SpriteMaterial).map!;
      map.offset.x = frame * 0.25;
      const k = 0.9 + 0.15 * Math.sin(t * 11 + f.phase);
      f.sprite.scale.set(0.35 * f.base * k, 0.55 * f.base * (2 - k), 1);
    }
    for (const n of this.notes.values()) if (!n.read) (n.glow.material as THREE.SpriteMaterial).opacity = 0.25 + 0.15 * Math.sin(t * 3);
    for (const a of this.animated) {
      if (a.name === "gem") {
        a.rotation.y = t * 1.5;
        a.position.y = 1.7 + Math.sin(t * 2) * 0.08;
      }
      if (a.name === "veil") ((a as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.1 * Math.sin(t * 2.4);
    }
    if (opened) {
      for (const id of opened.chests || []) {
        const c = this.chests.get(id);
        if (c) c.target = 1;
      }
      // мимик выбрался из сундука: на его месте теперь враг
      for (const id of opened.mimics || []) {
        const c = this.chests.get(id);
        if (c) c.obj.visible = false;
      }
      for (const id of opened.chandeliers || []) {
        const c = this.chandeliers.get(id);
        if (c && c.fallT < 0) {
          c.fallT = t;
          c.rope.visible = false;
        }
      }
      for (const id of opened.secrets || []) {
        const s = this.secrets.get(id);
        if (s && !s.open) s.open = true;
      }
      for (const id of opened.broken || []) {
        const b = this.breakables.get(id);
        if (b && !b.done) {
          b.done = true;
          b.whole.visible = false;
          b.broken.visible = true;
        }
      }
      for (const id of opened.shrines || []) {
        const gem = this.shrines.get(id);
        if (gem) ((gem as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set("#3a3a3a");
      }
    }
    for (const c of this.chandeliers.values()) {
      if (c.fallT >= 0 && !c.landed) {
        // полсекунды раскачивается, потом летит вниз
        const k = t - c.fallT;
        if (k < 0.5) {
          c.obj.rotation.z = Math.sin(k * 40) * 0.08;
        } else {
          c.chain.visible = false;
          c.vy += 22 * dt;
          c.obj.position.y = Math.max(c.y + 0.12, c.obj.position.y - c.vy * dt);
          if (c.obj.position.y <= c.y + 0.12) {
            c.landed = true;
            c.obj.rotation.set(0.25, 0, 0.18);
          }
        }
      }
      if (c.landed) for (const f of c.flames) f.scale.multiplyScalar(Math.max(0, 1 - dt * 0.6));
      else
        for (const f of c.flames) {
          const map = f.material.map;
          if (map) map.offset.x = Math.floor((t * 10 + f.position.x * 7) % 4) * 0.25;
        }
    }
    for (const [id, lv] of this.levers) {
      const cd = levers?.[id] || 0;
      const target = cd > 0 ? 0.6 : -0.5;
      lv.handle.rotation.x += (target - lv.handle.rotation.x) * Math.min(1, dt * 12);
      // решётки тлеют, пока рычаг перезаряжается
      for (const v of lv.vents) (v.material as THREE.MeshBasicMaterial).color.setRGB(0.05 + Math.min(1, cd / 12) * 0.35, 0.03 + Math.min(1, cd / 12) * 0.08, 0.02);
    }
    for (const tex of this.liquidTex) {
      const sp = tex.userData.speed as number;
      tex.offset.set(Math.sin(t * 0.3) * 0.04 + t * sp * 0.3, t * sp);
    }
    if (opened) {
      for (const id of opened.doors || []) {
        const o = this.doors.get(id);
        if (o) o.target = 1;
      }
      for (const id of opened.keys || []) {
        const k = this.keys.get(id);
        if (k) k.visible = false;
      }
      for (const id of opened.plates || []) {
        const p = this.plates.get(id);
        if (p && !p.down) { p.down = true; p.obj.position.y -= 0.08; }
      }
      for (const id of opened.cracks || []) {
        const c = this.cracks.get(id);
        if (c && c.t < 0) { c.t = t; c.ramp.visible = true; }
      }
    }
    for (const o of this.doors.values()) {
      if (o.open === o.target) continue;
      o.open = Math.min(1, o.open + dt * (o.kind === "gate" ? 0.7 : 1.4));
      const k = 1 - (1 - o.open) ** 2;
      if (o.kind === "key") o.pivot.rotation.y = -k * 1.75;
      else o.pivot.position.y = k * 2.95;
    }
    for (const k of this.keys.values()) {
      if (!k.visible) continue;
      k.rotation.y = t * 2;
      k.position.y += Math.sin(t * 2.4) * 0.002;
    }
    for (const c of this.cracks.values()) {
      if (c.t < 0 || t - c.t > 3) continue;
      // обломки падают на дно ямы и остаются там грудой
      for (const p of c.parts) {
        if (p.m.position.y <= c.pit + 0.16) continue;
        p.vy += 18 * dt;
        p.m.position.y = Math.max(c.pit + 0.16, p.m.position.y - p.vy * dt);
        p.m.rotation.x += p.spin * dt * 0.4;
        p.m.rotation.z += p.spin * 0.3 * dt;
      }
    }
    for (const c of this.chests.values()) {
      c.open += (c.target - c.open) * Math.min(1, dt * 6);
      c.lid.rotation.x = -c.open * 1.9;
    }
    for (const s of this.secrets.values()) {
      if (s.open && s.sink < 1) {
        s.sink = Math.min(1, s.sink + dt * 0.5);
        s.mesh.position.y = -8 * s.sink;
        s.mesh.position.x = Math.sin(t * 60) * 0.03 * (1 - s.sink);
        if (s.sink >= 1) s.mesh.visible = false;
      }
    }
    if (trapActive)
      for (const [id, spikes] of this.traps) {
        const target = trapActive(id) ? 0 : -0.62;
        spikes.position.y += (target - spikes.position.y) * Math.min(1, dt * (target === 0 ? 30 : 4));
      }
    if (exitOpen && this.exitPortal.children.length) {
      this.exitPortal.visible = true;
      const s = this.exitPortal.scale.x;
      this.exitPortal.scale.setScalar(Math.min(1, s + dt * 0.8));
      this.exitPortal.rotation.y = t * 0.6;
    }
  }

  /** Отмечает открытые клетки карты вокруг игрока. */
  explore(x: number, z: number) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    // вошли в комнату — она открывается на карте целиком (вместе со стенами по краю)
    for (const r of this.d.rooms) {
      if (cx < r.x || cz < r.y || cx >= r.x + r.w || cz >= r.y + r.h || r.kind === "secret") continue;
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let xx = r.x - 1; xx <= r.x + r.w; xx++)
        if (xx >= 0 && y >= 0 && xx < this.d.w && y < this.d.h) this.explored[y * this.d.w + xx] = 1;
    }
    for (let j = -3; j <= 3; j++)
      for (let i = -3; i <= 3; i++) {
        const xx = cx + i, zz = cz + j;
        if (xx >= 0 && zz >= 0 && xx < this.d.w && zz < this.d.h && i * i + j * j <= 10) this.explored[zz * this.d.w + xx] = 1;
      }
  }
}
