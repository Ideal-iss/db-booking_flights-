/** Отображение сущностей из снимков симуляции: враги, союзники, снаряды, зоны, добыча, эффекты. */
import * as THREE from "three";
import type { Snapshot } from "@shared/sim/types";
import { RARITIES } from "@shared/data/items";
import { makeAvatar, makeEnemy, makeWeapon, poseRig, setAvatarWeapons, type EnemyModel, type Rig } from "./models";
import { decalTexture, glowTexture, pixelTexture, ringTexture, textTexture } from "./textures";
import { probeAt, type LightField } from "./lighting";
import type { Appearance } from "@shared/data/stats";

export const ELEMENT_COLOR: Record<string, string> = {
  physical: "#e8dcc0", fire: "#ff8a2a", cold: "#8fd0ff", dark: "#b06aff", holy: "#ffe9a0", arcane: "#d87aff", poison: "#8aff6a",
};

type SnapEnemy = Snapshot["enemies"][number];
type SnapPlayer = Snapshot["players"][number];

interface EnemyView {
  model: EnemyModel;
  prev: SnapEnemy;
  cur: SnapEnemy;
  phase: number;
  flash: number;
  deadAt: number;
  x: number;
  z: number;
  yaw: number;
}

interface PlayerView {
  rig: Rig;
  label: THREE.Sprite;
  prev: SnapPlayer;
  cur: SnapPlayer;
  phase: number;
  gear: string;
  x: number;
  z: number;
  yaw: number;
}

interface Particle {
  s: THREE.Sprite;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  g: number;
  size: number;
}

const shadowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#000000", transparent: true, opacity: 0.55, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** Мягкое пятно тени — без него фигуры «парят» над полом. */
function blobShadow(size: number) {
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.scale.set(size, 1, size);
  m.position.y = 0.025;
  m.renderOrder = 2;
  return m;
}

export class Entities {
  scene: THREE.Scene;
  field: LightField;
  selfId: string;
  enemies = new Map<string, EnemyView>();
  players = new Map<string, PlayerView>();
  projectiles = new Map<number, { obj: THREE.Object3D; vx: number; vy: number; vz: number; x: number; y: number; z: number; t: number }>();
  grounds = new Map<number, { obj: THREE.Group; fill?: THREE.Mesh; data: Snapshot["grounds"][number] }>();
  drops = new Map<string, { obj: THREE.Group; label?: THREE.Sprite; kind: string; name?: string; rarity?: string; x: number; z: number }>();
  particles: Particle[] = [];
  numbers: { s: THREE.Sprite; life: number; vy: number }[] = [];
  rings: { m: THREE.Mesh; life: number; max: number; r: number }[] = [];
  splats: THREE.Mesh[] = [];
  private snapA: Snapshot | null = null;
  private snapB: Snapshot | null = null;
  private tA = 0;
  private tB = 0;
  private particleMat = new Map<string, THREE.SpriteMaterial>();

  /** Постоянный пул «летающих» огней: число источников не меняется — шейдеры не пересобираются. */
  private dynLights: THREE.PointLight[] = [];
  private flashes: { x: number; y: number; z: number; color: THREE.Color; power: number; radius: number; life: number; max: number }[] = [];

  constructor(scene: THREE.Scene, field: LightField, selfId: string) {
    this.scene = scene;
    this.field = field;
    this.selfId = selfId;
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 1.4);
      scene.add(l);
      this.dynLights.push(l);
    }
  }

  /** Короткая вспышка света: взрыв, кольцо льда, удар святым светом. */
  flash(x: number, y: number, z: number, color: string, power = 2, radius = 12, dur = 0.45) {
    this.flashes.push({ x, y, z, color: new THREE.Color(color), power, radius, life: dur, max: dur });
    if (this.flashes.length > 12) this.flashes.shift();
  }

  private updateLights(dt: number, t: number, cam: { x: number; z: number }) {
    type Cand = { x: number; y: number; z: number; color: THREE.Color; i: number; radius: number; d: number };
    const cands: Cand[] = [];
    for (const [id, p] of this.projectiles) {
      const L = p.obj.userData.light as { color: THREE.Color; power: number; radius: number } | undefined;
      if (!L) continue;
      const pos = p.obj.position;
      // живое мерцание огня
      const fl = 0.85 + 0.15 * Math.sin(t * 31 + id) * Math.sin(t * 17 + id * 0.7);
      cands.push({ x: pos.x, y: pos.y, z: pos.z, color: L.color, i: 12 * L.power * fl, radius: L.radius, d: Math.hypot(pos.x - cam.x, pos.z - cam.z) });
    }
    this.flashes = this.flashes.filter((f) => (f.life -= dt) > 0);
    for (const f of this.flashes) {
      const k = f.life / f.max;
      cands.push({ x: f.x, y: f.y, z: f.z, color: f.color, i: 14 * f.power * k * k, radius: f.radius, d: Math.hypot(f.x - cam.x, f.z - cam.z) - 3 });
    }
    cands.sort((a, b) => a.d - b.d);
    this.dynLights.forEach((l, i) => {
      const c = cands[i];
      if (!c || c.d > 30) {
        l.intensity = 0;
        return;
      }
      l.position.set(c.x, c.y, c.z);
      l.color.copy(c.color);
      l.intensity = c.i;
      l.distance = c.radius;
    });
  }

  /** Новый снимок от симуляции (локальной или сетевой). */
  push(s: Snapshot, now: number) {
    this.snapA = this.snapB;
    this.tA = this.tB;
    this.snapB = s;
    this.tB = now;
    this.syncEnemies(s, now);
    this.syncPlayers(s);
    this.syncProjectiles(s, now);
    this.syncGrounds(s);
    this.syncDrops(s);
  }

  get latest() {
    return this.snapB;
  }

  private syncEnemies(s: Snapshot, now: number) {
    const seen = new Set<string>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        const model = makeEnemy(e.type, e.elite);
        model.rig.root.add(blobShadow(model.rig.height * 0.75 + 0.4));
        model.rig.root.position.set(e.x, 0, e.z);
        model.rig.root.rotation.y = e.yaw;
        this.scene.add(model.rig.root);
        v = { model, prev: e, cur: e, phase: Math.random() * 6, flash: 0, deadAt: e.state === "dead" ? now - 1 : 0, x: e.x, z: e.z, yaw: e.yaw };
        this.enemies.set(e.id, v);
      }
      v.prev = v.cur;
      v.cur = e;
      // время — по тем же часам игры, что и анимация (раньше бралось performance.now и труп «стоял»)
      if (e.state === "dead" && !v.deadAt) v.deadAt = now;
    }
    for (const [id, v] of this.enemies) {
      if (!seen.has(id)) {
        this.scene.remove(v.model.rig.root);
        this.enemies.delete(id);
      }
    }
  }

  private syncPlayers(s: Snapshot) {
    const seen = new Set<string>();
    for (const p of s.players) {
      if (p.id === this.selfId) continue;
      seen.add(p.id);
      let v = this.players.get(p.id);
      if (!v) {
        const rig = makeAvatar(p.cls, p.app as Appearance);
        rig.root.add(blobShadow(1.2));
        this.scene.add(rig.root);
        const { tex, w, h } = textTexture(p.name, "#d8cdb2", 14);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        label.scale.set(w / 70, h / 70, 1);
        label.position.y = 2.15;
        label.renderOrder = 10;
        rig.root.add(label);
        v = { rig, label, prev: p, cur: p, phase: 0, gear: "", x: p.x, z: p.z, yaw: p.yaw };
        this.players.set(p.id, v);
      }
      v.prev = v.cur;
      v.cur = p;
      const gear = p.weapon + "|" + p.offhand;
      if (gear !== v.gear) {
        setAvatarWeapons(v.rig, p.weapon, p.offhand);
        v.gear = gear;
      }
    }
    for (const [id, v] of this.players) {
      if (!seen.has(id)) {
        this.scene.remove(v.rig.root);
        this.players.delete(id);
      }
    }
  }

  private projectileObj(kind: string, el: string): THREE.Object3D {
    const color = ELEMENT_COLOR[el] || "#fff";
    if (kind === "arrow") {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.7), new THREE.MeshBasicMaterial({ color: "#8a6a4a" }));
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: "#c8c8c8" }));
      tip.position.z = -0.38;
      g.add(shaft, tip);
      return g;
    }
    if (kind === "bone_spear") {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.1, 4), new THREE.MeshBasicMaterial({ color: "#e8e0d0" }));
      m.rotation.x = -Math.PI / 2;
      const g = new THREE.Group();
      g.add(m);
      return g;
    }
    const g = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(kind === "fireball" ? 1.4 : 0.9);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(kind === "fireball" ? 0.2 : 0.11), new THREE.MeshBasicMaterial({ color }));
    core.name = "core";
    g.add(glow, core);
    // свет снаряда раздаётся из общего пула (см. updateLights)
    g.userData.light = { color: new THREE.Color(color), power: kind === "fireball" ? 1.6 : kind === "ebolt" ? 0.8 : 1.0, radius: kind === "fireball" ? 13 : 8 };
    return g;
  }

  private syncProjectiles(s: Snapshot, now: number) {
    const seen = new Set<number>();
    for (const p of s.projectiles) {
      seen.add(p.id);
      let v = this.projectiles.get(p.id);
      if (!v) {
        const obj = this.projectileObj(p.kind, p.el);
        this.scene.add(obj);
        v = { obj, vx: p.vx, vy: p.vy, vz: p.vz, x: p.x, y: p.y, z: p.z, t: now };
        this.projectiles.set(p.id, v);
      }
      Object.assign(v, { vx: p.vx, vy: p.vy, vz: p.vz, x: p.x, y: p.y, z: p.z, t: now });
    }
    for (const [id, v] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(v.obj);
        this.projectiles.delete(id);
      }
    }
  }

  private syncGrounds(s: Snapshot) {
    const seen = new Set<number>();
    for (const g of s.grounds) {
      seen.add(g.id);
      if (this.grounds.has(g.id)) continue;
      const grp = new THREE.Group();
      grp.position.set(g.x, 0.04, g.z);
      let color = "#ff3a2a";
      let fill: THREE.Mesh | undefined;
      const flat = (geo: THREE.BufferGeometry, c: string, o: number, map?: THREE.Texture) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, map: map ?? null, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2;
        grp.add(m);
        return m;
      };
      if (g.kind === "warn_line") {
        const len = g.data.len, ang = Math.atan2(g.data.dx, g.data.dz);
        const plane = new THREE.PlaneGeometry(g.r * 2, len);
        plane.translate(0, len / 2, 0);
        const m1 = flat(plane, color, 0.22);
        const m2 = flat(plane.clone(), color, 0.5);
        m1.rotation.z = m2.rotation.z = -ang + Math.PI;
        m1.rotation.order = m2.rotation.order = "XYZ";
        m2.scale.set(1, 0.01, 1);
        fill = m2;
      } else {
        if (g.kind === "sanctuary") color = "#ffe9a0";
        else if (g.kind === "curse") color = "#9a4aff";
        else if (g.kind === "blood_pool") color = "#8a0a10";
        else if (g.kind === "meteor") color = "#ff7a2a";
        else if (g.kind === "smite") color = "#ffe9a0";
        else if (g.data.el === 1) color = "#ffe9a0";
        const ring = flat(new THREE.PlaneGeometry(g.r * 2, g.r * 2), color, g.kind === "blood_pool" ? 0.0 : 0.85, ringTexture());
        if (g.kind === "blood_pool") {
          const pool = new THREE.Mesh(new THREE.CircleGeometry(g.r, 12), new THREE.MeshBasicMaterial({ color: "#3a0306", transparent: true, opacity: 0.85, depthWrite: false }));
          pool.rotation.x = -Math.PI / 2;
          grp.add(pool);
        }
        void ring;
        if (g.kind.startsWith("warn") || g.kind === "meteor" || g.kind === "smite") {
          fill = flat(new THREE.CircleGeometry(g.r, 24), color, 0.35);
          fill.scale.setScalar(0.01);
        }
        if (g.kind === "warn_ring" && g.data.inner) {
          const hole = new THREE.Mesh(new THREE.CircleGeometry(g.data.inner, 20), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.5, depthWrite: false }));
          hole.rotation.x = -Math.PI / 2;
          hole.position.y = 0.01;
          grp.add(hole);
        }
      }
      this.scene.add(grp);
      this.grounds.set(g.id, { obj: grp, fill, data: g });
    }
    for (const [id, v] of this.grounds) {
      if (!seen.has(id)) {
        this.scene.remove(v.obj);
        this.grounds.delete(id);
      }
    }
  }

  private syncDrops(s: Snapshot) {
    const seen = new Set<string>();
    for (const d of s.drops) {
      seen.add(d.id);
      if (this.drops.has(d.id)) continue;
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      let label: THREE.Sprite | undefined;
      if (d.kind === "item") {
        const color = RARITIES[d.rarity as keyof typeof RARITIES]?.color || "#fff";
        const icon = d.icon || "";
        const isWeapon = ["sword", "axe", "mace", "dagger", "bow", "staff", "wand", "shield", "tome", "skull", "symbol"].includes(icon);
        const obj = isWeapon ? makeWeapon(icon) : new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.3), new THREE.MeshBasicMaterial({ color: "#6a5a4a" }));
        obj.name = "spin";
        obj.position.y = 0.35;
        if (isWeapon) obj.rotation.z = Math.PI / 2.4;
        g.add(obj);
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.25, d.rarity === "common" ? 0.8 : 2.4, 6, 1, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: d.rarity === "common" ? 0.12 : 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        );
        beam.position.y = d.rarity === "common" ? 0.4 : 1.2;
        g.add(beam);
        const { tex, w, h } = textTexture(d.name || "?", color, 14);
        label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
        label.scale.set(w / 80, h / 80, 1);
        label.position.y = 1.0;
        label.renderOrder = 10;
        g.add(label);
      } else if (d.kind === "gold") {
        const m = new THREE.MeshBasicMaterial({ color: "#e0b040" });
        for (let i = 0; i < 5; i++) {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 6), m);
          c.position.set(Math.cos(i * 2.4) * 0.12, 0.03 + i * 0.02, Math.sin(i * 2.4) * 0.12);
          g.add(c);
        }
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#e0b040", transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
        glow.scale.setScalar(0.8);
        glow.position.y = 0.15;
        g.add(glow);
      } else {
        const c = d.icon === "mana" ? "#4a6fe0" : "#d02a2a";
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: c }));
        b.position.y = 0.15;
        b.name = "spin";
        const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: "#d8cdb2" }));
        neck.position.y = 0.29;
        g.add(b, neck);
      }
      g.add(blobShadow(d.kind === "item" ? 0.8 : 0.5));
      this.scene.add(g);
      this.drops.set(d.id, { obj: g, label, kind: d.kind, name: d.name, rarity: d.rarity, x: d.x, z: d.z });
    }
    for (const [id, v] of this.drops) {
      if (!seen.has(id)) {
        this.scene.remove(v.obj);
        this.drops.delete(id);
      }
    }
  }

  // ------------------------------------------------------------ эффекты
  private pmat(color: string, additive: boolean) {
    const key = color + additive;
    let m = this.particleMat.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: additive ? glowTexture() : pixelTexture(), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive });
      this.particleMat.set(key, m);
    }
    return m;
  }

  burst(x: number, y: number, z: number, color: string, n: number, o: { speed?: number; up?: number; g?: number; size?: number; life?: number; additive?: boolean } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 600) break;
      const s = new THREE.Sprite(this.pmat(color, !!o.additive));
      const size = (o.size ?? 0.08) * (0.6 + Math.random() * 0.8);
      s.scale.setScalar(size);
      s.position.set(x, y, z);
      this.scene.add(s);
      const sp = o.speed ?? 3;
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.8);
      this.particles.push({
        s, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp * 0.6 + (o.up ?? 1.5), vz: Math.sin(a) * Math.cos(b) * sp,
        life, max: life, g: o.g ?? 9, size,
      });
    }
  }

  ring(x: number, z: number, r: number, color: string) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.15, z);
    m.scale.setScalar(0.3);
    this.scene.add(m);
    this.rings.push({ m, life: 0.45, max: 0.45, r });
  }

  number(x: number, y: number, z: number, text: string, color: string, big = false) {
    const { tex, w, h } = textTexture(text, color, big ? 22 : 16);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
    const k = big ? 70 : 90;
    s.scale.set(w / k, h / k, 1);
    s.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
    s.renderOrder = 20;
    this.scene.add(s);
    this.numbers.push({ s, life: 1, vy: 1.4 });
  }

  /** Пятно на полу, которое остаётся после боя (кровь, костная пыль, ожог). */
  splat(x: number, z: number, kind: "blood" | "bonedust" | "soot", size = 1.6) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: decalTexture(kind, Math.floor(Math.random() * 3)), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, color: "#9a9088" }),
    );
    m.rotation.y = Math.random() * Math.PI * 2;
    m.position.set(x, 0.018 + (this.splats.length % 9) * 0.001, z);
    m.renderOrder = 1;
    this.scene.add(m);
    this.splats.push(m);
    if (this.splats.length > 70) {
      const old = this.splats.shift()!;
      this.scene.remove(old);
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }
  }

  flashEnemy(id: string) {
    const v = this.enemies.get(id);
    if (v) v.flash = 1;
  }

  enemyPos(id: string) {
    const v = this.enemies.get(id);
    return v ? { x: v.x, z: v.z, h: v.model.rig.height } : null;
  }

  // ------------------------------------------------------------ кадр
  update(now: number, dt: number, cam: { x: number; z: number }) {
    const t = now;
    // интерполяция между двумя последними снимками
    const span = Math.max(0.016, this.tB - this.tA);
    const k = Math.min(1.25, (now - this.tB) / span + 1) - 1;
    const alpha = Math.max(0, Math.min(1, k + 0.0));
    const lerpYaw = (a: number, b: number, f: number) => {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a + d * f;
    };
    const probe = new THREE.Color();
    for (const [, v] of this.enemies) {
      const a = v.prev, b = v.cur;
      v.x = a.x + (b.x - a.x) * alpha;
      v.z = a.z + (b.z - a.z) * alpha;
      v.yaw = lerpYaw(a.yaw, b.yaw, alpha);
      const rig = v.model.rig;
      rig.root.position.set(v.x, 0, v.z);
      rig.root.rotation.y = v.yaw;
      const moved = Math.hypot(b.x - a.x, b.z - a.z) / span;
      const moving = Math.min(1, moved / 2);
      v.phase += dt * (4 + moved * 2.2);
      const dead = b.state === "dead" ? now - v.deadAt : 0;
      poseRig(rig, { t, moving: b.frozen ? 0 : moving, phase: v.phase, state: b.state, st: b.st, atk: b.atk, dead: dead > 0 ? dead : 0, stun: b.stun });
      // свет в точке + вспышка от удара, синева от заморозки
      probeAt(this.field, v.x, v.z, probe);
      if (b.frozen) probe.lerp(new THREE.Color(0.4, 0.7, 1.2), 0.6);
      if (v.flash > 0) {
        probe.lerp(new THREE.Color(1.6, 0.4, 0.3), v.flash);
        v.flash = Math.max(0, v.flash - dt * 6);
      }
      if (b.state === "windup") probe.lerp(new THREE.Color(1.0, 0.5, 0.2), 0.25 + 0.2 * Math.sin(t * 30));
      rig.probe.value.copy(probe);
      for (const e of rig.eyes) e.visible = b.state !== "dead";
      if (v.model.extra) v.model.extra.rotation.z = t;
      if (b.state === "dead" && dead > 25) rig.root.position.y = -Math.min(1.5, (dead - 25) * 0.1);
    }
    for (const [, v] of this.players) {
      const a = v.prev, b = v.cur;
      v.x = a.x + (b.x - a.x) * alpha;
      v.z = a.z + (b.z - a.z) * alpha;
      v.yaw = lerpYaw(a.yaw, b.yaw, alpha);
      v.rig.root.position.set(v.x, 0, v.z);
      v.rig.root.rotation.y = v.yaw;
      const moved = Math.hypot(b.x - a.x, b.z - a.z) / span;
      v.phase += dt * (3 + moved * 2.4);
      poseRig(v.rig, {
        t, moving: Math.min(1, moved / 2), phase: v.phase, state: b.atk ? "windup" : "idle", st: 0.2, atk: "melee",
        dead: b.alive ? 0 : 1, stun: false, block: b.blocking, bow: b.aiming,
      });
      probeAt(this.field, v.x, v.z, probe);
      v.rig.probe.value.copy(probe);
      v.rig.root.visible = b.connected;
    }
    for (const [, p] of this.projectiles) {
      const age = Math.min(0.15, now - p.t);
      p.obj.position.set(p.x + p.vx * age, p.y + p.vy * age, p.z + p.vz * age);
      p.obj.lookAt(p.obj.position.x + p.vx, p.obj.position.y + p.vy, p.obj.position.z + p.vz);
      const core = p.obj.getObjectByName("core");
      if (core) core.rotation.set(t * 8, t * 6, 0);
    }
    this.updateLights(dt, t, cam);
    const simT = this.snapB ? this.snapB.time + (now - this.tB) : 0;
    for (const [, g] of this.grounds) {
      const d = g.data;
      const k2 = Math.max(0, Math.min(1, (simT - d.t0) / Math.max(0.01, d.until - d.t0)));
      if (g.fill) {
        if (d.kind === "warn_line") g.fill.scale.set(1, Math.max(0.01, k2), 1);
        else g.fill.scale.setScalar(Math.max(0.01, k2));
      }
      if (d.kind === "sanctuary" || d.kind === "curse") g.obj.rotation.y = t * 0.5;
    }
    for (const [, d] of this.drops) {
      const spin = d.obj.getObjectByName("spin");
      if (spin) {
        spin.rotation.y = t * 1.5;
        spin.position.y = 0.35 + Math.sin(t * 2 + d.x) * 0.05;
      }
      if (d.label) d.label.visible = Math.hypot(d.x - cam.x, d.z - cam.z) < 9;
    }
    // частицы
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.s);
        return false;
      }
      p.vy -= p.g * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.y = Math.max(0.02, p.s.position.y + p.vy * dt);
      p.s.position.z += p.vz * dt;
      if (p.s.position.y <= 0.02) { p.vx *= 0.8; p.vz *= 0.8; p.vy = 0; }
      p.s.scale.setScalar(p.size * Math.min(1, (p.life / p.max) * 2));
      return true;
    });
    this.numbers = this.numbers.filter((n) => {
      n.life -= dt;
      n.s.position.y += n.vy * dt;
      n.vy *= 0.96;
      (n.s.material as THREE.SpriteMaterial).opacity = Math.min(1, n.life * 2);
      if (n.life <= 0) {
        this.scene.remove(n.s);
        (n.s.material as THREE.SpriteMaterial).map?.dispose();
        n.s.material.dispose();
        return false;
      }
      return true;
    });
    this.rings = this.rings.filter((r) => {
      r.life -= dt;
      const k3 = 1 - r.life / r.max;
      r.m.scale.setScalar(0.3 + k3 * r.r);
      (r.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k3);
      if (r.life <= 0) {
        this.scene.remove(r.m);
        return false;
      }
      return true;
    });
  }

  /** Ближайший к прицелу враг (для рамки цели в интерфейсе). */
  aimed(cx: number, cz: number, yaw: number, max = 14): SnapEnemy | null {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let best: SnapEnemy | null = null, bs = 0.95;
    for (const [, v] of this.enemies) {
      const e = v.cur;
      if (e.state === "dead" || e.ally) continue;
      const dx = v.x - cx, dz = v.z - cz;
      const d = Math.hypot(dx, dz);
      if (d > max) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > bs) { bs = dot; best = e; }
    }
    return best;
  }

  clear() {
    for (const v of this.enemies.values()) this.scene.remove(v.model.rig.root);
    for (const v of this.players.values()) this.scene.remove(v.rig.root);
    for (const v of this.projectiles.values()) this.scene.remove(v.obj);
    for (const v of this.grounds.values()) this.scene.remove(v.obj);
    for (const v of this.drops.values()) this.scene.remove(v.obj);
    for (const p of this.particles) this.scene.remove(p.s);
    for (const n of this.numbers) this.scene.remove(n.s);
    for (const r of this.rings) this.scene.remove(r.m);
    for (const m of this.splats) this.scene.remove(m);
    this.splats = [];
    this.flashes = [];
    for (const l of this.dynLights) l.intensity = 0;
    this.enemies.clear();
    this.players.clear();
    this.projectiles.clear();
    this.grounds.clear();
    this.drops.clear();
    this.particles = [];
    this.numbers = [];
    this.rings = [];
  }
}
