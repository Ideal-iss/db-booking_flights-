/** Отрисовка уровня: стены, пол, потолок, декорации, сундуки, тайники, ловушки, порталы. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CELL, Cell, WALL_H, type Dungeon } from "@shared/dungeon/generate";
import { LightField, litMaterial, probeAt, staticLights } from "./lighting";
import { ceilingTexture, floorTexture, wallTexture, glowTexture, metalTexture } from "./textures";
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

  constructor(d: Dungeon) {
    this.d = d;
    const pal = d.theme.palette;
    const ambient = new THREE.Color(pal.fog).multiplyScalar(2).add(d.theme.id === "hub" ? new THREE.Color(0.24, 0.2, 0.16) : new THREE.Color(0.1, 0.085, 0.07));
    this.field = new LightField(d, staticLights(d), ambient);
    this.explored = new Uint8Array(d.w * d.h);
    this.buildShell();
    this.buildProps();
    this.buildChests();
    this.buildSecrets();
    this.buildTraps();
    this.exitPortal = this.buildExit();
  }

  private isFloor(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.d.w || y >= this.d.h) return false;
    return this.d.cells[y * this.d.w + x] === Cell.Floor;
  }

  private buildShell() {
    const d = this.d;
    const pal = d.theme.palette;
    const walls: number[] = [], wallUv: number[] = [], wallN: number[] = [];
    const floors: number[] = [], floorUv: number[] = [], floorN: number[] = [];
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
    const wallV = WALL_H / CELL;
    for (let y = 0; y < d.h; y++)
      for (let x = 0; x < d.w; x++) {
        if (!this.isFloor(x, y)) continue;
        const x0 = x * CELL, z0 = y * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        quad(floors, floorUv, floorN, V(x0, 0, z1), V(CELL, 0, 0), V(0, 0, -CELL), V(0, 1, 0), 2, 2, [1, 1], [0, 0]);
        quad(ceils, ceilUv, ceilN, V(x0, WALL_H, z0), V(CELL, 0, 0), V(0, 0, CELL), V(0, -1, 0), 2, 2, [1, 1], [0, 0]);
        // стены смотрят внутрь клетки
        if (!this.isFloor(x, y - 1)) quad(walls, wallUv, wallN, V(x0, 0, z0), V(CELL, 0, 0), V(0, WALL_H, 0), V(0, 0, 1), 2, 4, [1, wallV], [0, 0]);
        if (!this.isFloor(x, y + 1)) quad(walls, wallUv, wallN, V(x1, 0, z1), V(-CELL, 0, 0), V(0, WALL_H, 0), V(0, 0, -1), 2, 4, [1, wallV], [0, 0]);
        if (!this.isFloor(x - 1, y)) quad(walls, wallUv, wallN, V(x0, 0, z1), V(0, 0, -CELL), V(0, WALL_H, 0), V(1, 0, 0), 2, 4, [1, wallV], [0, 0]);
        if (!this.isFloor(x + 1, y)) quad(walls, wallUv, wallN, V(x1, 0, z0), V(0, 0, CELL), V(0, WALL_H, 0), V(-1, 0, 0), 2, 4, [1, wallV], [0, 0]);
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
    mk(walls, wallUv, wallN, wallTexture(d.theme.wallStyle, pal.wall, pal.wall2));
    mk(floors, floorUv, floorN, floorTexture(d.theme.floorStyle, pal.floor, pal.floor2));
    mk(ceils, ceilUv, ceilN, ceilingTexture(pal.ceil));
  }

  private buildProps() {
    const pal = this.d.theme.palette;
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of this.d.props) {
      if (p.kind.startsWith("npc:")) continue;
      const { obj, flames } = makeProp(p.kind, pal);
      obj.position.set(p.x, 0, p.z);
      // настенные вещи развёрнуты от стены
      obj.rotation.y = p.wall ? p.rot + Math.PI : p.rot;
      if (p.kind === "portal") obj.rotation.y = 0;
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

  private buildChests() {
    for (const c of this.d.chests) {
      const probe = { value: probeAt(this.field, c.x, c.z, new THREE.Color()) };
      const { obj, lid } = makeChest(c.tier, probe);
      obj.position.set(c.x, 0, c.z);
      obj.rotation.y = c.rot;
      this.group.add(obj);
      this.chests.set(c.id, { lid, open: 0, target: 0, obj });
    }
  }

  private buildSecrets() {
    const pal = this.d.theme.palette;
    for (const s of this.d.secrets) {
      // тайная стена чуть отличается: трещины и более тёмный камень — внимательный игрок заметит
      const tex = wallTexture(this.d.theme.wallStyle, pal.wall2, pal.wall2);
      const g = new THREE.BoxGeometry(CELL, WALL_H, CELL);
      g.translate((s.cx + 0.5) * CELL, WALL_H / 2, (s.cy + 0.5) * CELL);
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
      g.position.set(t.x, 0, t.z);
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

  private buildExit(): THREE.Group {
    const g = new THREE.Group();
    if (this.d.exit.x < 0) return g;
    g.position.set(this.d.exit.x, 0, this.d.exit.z);
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

  update(t: number, dt: number, opened?: { chests: string[]; secrets: string[]; shrines: string[] }, trapActive?: (id: string) => boolean, exitOpen?: boolean) {
    for (const f of this.flames) {
      const frame = Math.floor(t * 10 + f.phase * 3) % 4;
      const map = (f.sprite.material as THREE.SpriteMaterial).map!;
      map.offset.x = frame * 0.25;
      const k = 0.9 + 0.15 * Math.sin(t * 11 + f.phase);
      f.sprite.scale.set(0.35 * f.base * k, 0.55 * f.base * (2 - k), 1);
    }
    for (const a of this.animated) {
      if (a.name === "gem") {
        a.rotation.y = t * 1.5;
        a.position.y = 1.7 + Math.sin(t * 2) * 0.08;
      }
      if (a.name === "veil") ((a as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.28 + 0.1 * Math.sin(t * 2.4);
    }
    if (opened) {
      for (const id of opened.chests) {
        const c = this.chests.get(id);
        if (c) c.target = 1;
      }
      for (const id of opened.secrets) {
        const s = this.secrets.get(id);
        if (s && !s.open) s.open = true;
      }
      for (const id of opened.shrines) {
        const gem = this.shrines.get(id);
        if (gem) ((gem as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set("#3a3a3a");
      }
    }
    for (const c of this.chests.values()) {
      c.open += (c.target - c.open) * Math.min(1, dt * 6);
      c.lid.rotation.x = -c.open * 1.9;
    }
    for (const s of this.secrets.values()) {
      if (s.open && s.sink < 1) {
        s.sink = Math.min(1, s.sink + dt * 0.5);
        s.mesh.position.y = -WALL_H * s.sink;
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
    for (let j = -3; j <= 3; j++)
      for (let i = -3; i <= 3; i++) {
        const xx = cx + i, zz = cz + j;
        if (xx >= 0 && zz >= 0 && xx < this.d.w && zz < this.d.h && i * i + j * j <= 10) this.explored[zz * this.d.w + xx] = 1;
      }
  }
}
