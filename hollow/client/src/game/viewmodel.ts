/** Руки и оружие от первого лица: покачивание, удары, блок, натяжение лука, заклинания. */
import * as THREE from "three";
import { makeWeapon, makeFlame } from "./models";
import { glowTexture } from "./textures";
import type { Gesture } from "./fx";
import { litMaterial } from "./lighting";
import { SKIN, CLOTH } from "./models";
import type { Appearance } from "@shared/data/stats";

/** Смещение руки: позиция (x, y, z) и поворот (x, y, z) относительно базовой позы. */
type Off = [number, number, number, number, number, number];
/** Ключ жеста: доля времени, правая и левая рука, «o» — резкий выход в позу (удар). */
type Key = [number, Off | 0, Off | 0, ("o" | "s")?];
interface GestureDef {
  dur: number;
  keys: Key[];
  /** Окно следа оружия (доли времени). */
  trail?: [number, number];
  /** Момент выпуска силы: вспышка ладони. */
  release: number;
}

const Z: Off = [0, 0, 0, 0, 0, 0];
const G: Record<Gesture, GestureDef> = {
  slash: { dur: 0.36, release: 0.32, trail: [0.18, 0.62], keys: [[0, Z, Z], [0.2, [0.1, 0.1, 0.06, -0.7, 0, 0.9], Z], [0.5, [-0.32, -0.05, -0.14, 1.0, 0, -1.3], Z, "o"], [1, Z, Z]] },
  chop: { dur: 0.5, release: 0.42, trail: [0.24, 0.56], keys: [[0, Z, Z], [0.25, [0.02, 0.16, 0.02, -1.0, 0, 0.25], [0, -0.04, 0.04, 0, 0, 0]], [0.45, [-0.04, -0.27, -0.12, 1.45, 0, 0], [0, -0.06, 0, 0, 0, 0], "o"], [0.62, [-0.04, -0.26, -0.11, 1.4, 0, 0], Z], [1, Z, Z]] },
  spin: { dur: 0.36, release: 0.32, trail: [0.18, 0.62], keys: [[0, Z, Z], [0.2, [0.1, 0.1, 0.06, -0.7, 0, 0.9], Z], [0.5, [-0.32, -0.05, -0.14, 1.0, 0, -1.3], Z, "o"], [1, Z, Z]] },
  thrust: { dur: 0.42, release: 0.36, trail: [0.18, 0.5], keys: [[0, Z, Z], [0.18, [0.02, 0, 0.12, -0.3, 0, 0], [0, 0, 0.06, 0, 0, 0]], [0.38, [-0.1, 0.03, -0.32, 0.25, 0, 0], [0.06, 0, -0.1, 0, 0, 0], "o"], [0.62, [-0.09, 0.02, -0.3, 0.22, 0, 0], [0.05, 0, -0.08, 0, 0, 0]], [1, Z, Z]] },
  push: { dur: 0.44, release: 0.3, keys: [[0, Z, Z], [0.18, [0.02, 0.04, 0.1, -0.35, 0, 0], [0.08, 0.04, 0.02, 0, 0, 0]], [0.34, [-0.08, 0.08, -0.24, 0.5, 0, 0], [0.04, 0.02, -0.06, 0, 0, 0], "o"], [0.62, [-0.07, 0.07, -0.22, 0.45, 0, 0], [0.03, 0.02, -0.05, 0, 0, 0]], [1, Z, Z]] },
  slam: { dur: 0.6, release: 0.42, keys: [[0, Z, Z], [0.22, [-0.06, 0.13, -0.04, -0.55, 0, 0], [0.06, 0.13, -0.04, -0.55, 0, 0]], [0.42, [0.12, -0.14, -0.12, 0.9, 0, -0.3], [-0.12, -0.14, -0.12, 0.9, 0, 0.3], "o"], [0.68, [0.12, -0.13, -0.11, 0.85, 0, -0.3], [-0.12, -0.13, -0.11, 0.85, 0, 0.3]], [1, Z, Z]] },
  raise: { dur: 0.8, release: 0.3, keys: [[0, Z, Z], [0.3, [-0.12, 0.09, -0.06, 0.95, 0, 0.18], Z, "o"], [0.72, [-0.12, 0.1, -0.06, 1.0, 0, 0.18], Z], [1, Z, Z]] },
  roar: { dur: 0.7, release: 0.38, keys: [[0, Z, Z], [0.2, [0.06, -0.08, 0.12, 0.4, 0, -0.2], [-0.06, -0.08, 0.12, 0.4, 0, 0.2]], [0.4, [0.14, 0.06, -0.08, -0.4, 0, -0.6], [-0.14, 0.06, -0.08, -0.4, 0, 0.6], "o"], [0.75, [0.14, 0.05, -0.07, -0.35, 0, -0.6], [-0.14, 0.05, -0.07, -0.35, 0, 0.6]], [1, Z, Z]] },
  claw: { dur: 0.6, release: 0.45, keys: [[0, Z, Z], [0.25, Z, [0.06, 0.02, 0.06, 0.3, 0, 0]], [0.45, Z, [0.18, 0.12, -0.22, -0.5, 0, 0.4], "o"], [0.75, Z, [0.17, 0.11, -0.2, -0.45, 0, 0.4]], [1, Z, Z]] },
  beckon: { dur: 0.75, release: 0.5, keys: [[0, Z, Z], [0.25, Z, [0.1, -0.08, -0.08, 0.9, 0, 0]], [0.55, Z, [0.12, 0.18, -0.14, -1.0, 0, 0], "o"], [0.8, Z, [0.12, 0.17, -0.13, -0.95, 0, 0]], [1, Z, Z]] },
  flick: { dur: 0.36, release: 0.45, keys: [[0, Z, Z], [0.28, [0, 0.06, 0.05, -0.5, 0, 0.3], Z], [0.5, [-0.1, 0.1, -0.2, 0.5, 0, -0.4], Z, "o"], [1, Z, Z]] },
  throw: { dur: 0.38, release: 0.45, trail: [0.25, 0.56], keys: [[0, Z, Z], [0.25, [0.12, 0.1, 0.1, -0.7, 0, 0.6], Z], [0.5, [-0.2, 0, -0.2, 0.9, 0, -0.9], Z, "o"], [1, Z, Z]] },
  toss: { dur: 0.5, release: 0.52, keys: [[0, Z, Z], [0.3, [0.02, -0.14, 0.1, 0.8, 0, 0], Z], [0.55, [-0.04, 0.08, -0.2, -0.6, 0, 0], Z, "o"], [1, Z, Z]] },
  call: { dur: 0.72, release: 0.45, keys: [[0, Z, Z], [0.25, [-0.08, 0.1, -0.04, 0.95, 0, 0.1], Z], [0.45, [-0.04, -0.02, -0.22, -0.45, 0, 0], Z, "o"], [0.72, [-0.04, -0.02, -0.2, -0.42, 0, 0], Z], [1, Z, Z]] },
  bash: { dur: 0.45, release: 0.42, keys: [[0, Z, Z], [0.22, Z, [0.04, 0.04, 0.08, 0, 0, 0]], [0.42, [0.04, -0.04, 0.06, 0, 0, 0], [0.18, 0.1, -0.24, 0, 0.4, 0], "o"], [0.65, Z, [0.17, 0.1, -0.22, 0, 0.4, 0]], [1, Z, Z]] },
  sweep: { dur: 0.7, release: 0.3, keys: [[0, Z, Z], [0.2, [0.1, -0.04, -0.06, 0.3, 0, 0.6], Z], [0.6, [-0.32, -0.04, -0.14, 0.3, 0, -0.6], Z], [1, Z, Z]] },
  fling: { dur: 0.5, release: 0.42, trail: [0.22, 0.5], keys: [[0, Z, Z], [0.22, [-0.1, 0.02, 0.06, -0.3, 0, 0.8], [0.1, 0.02, 0.06, -0.3, 0, -0.8]], [0.45, [0.16, 0.04, -0.12, 0.6, 0, -0.9], [-0.16, 0.04, -0.12, 0.6, 0, 0.9], "o"], [1, Z, Z]] },
};

const smooth = (x: number) => x * x * (3 - 2 * x);
const outC = (x: number) => 1 - Math.pow(1 - x, 3);

/** Сколько кадров следа оружия хранить. */
const TRAIL_N = 16;
const TRAIL_LIFE = 0.13;

export class ViewModel {
  root = new THREE.Group();
  right = new THREE.Group();
  left = new THREE.Group();
  weapon: THREE.Group | null = null;
  offhand: THREE.Group | null = null;
  probe = { value: new THREE.Color(0.5, 0.42, 0.32) };
  light: THREE.PointLight;
  weaponIcon = "";
  offIcon = "";
  mode: "melee" | "bolt" | "bow" = "melee";
  private swing = 0;
  private swingHeavy = false;
  private swingDur = 0.4;
  private cast = 0;
  private recoil = 0;
  private drink = 0;
  private hurtShake = 0;
  private blockK = 0;
  private drawK = 0;
  private bobT = 0;
  private sway = { x: 0, y: 0 };
  private castColor = new THREE.Color("#9ad0ff");
  // текущий жест навыка
  private gest: { def: GestureDef; t: number; mirror: boolean; color: THREE.Color; hand: "R" | "L" | "both" | "none"; fired: boolean } | null = null;
  private freezeT = 0;
  // свечение ладоней
  private glowR: THREE.Sprite;
  private glowL: THREE.Sprite;
  private motes: THREE.Sprite[] = [];
  private glowK = { R: 0, L: 0 };
  private flashK = 0;
  // след оружия
  private tip = new THREE.Object3D();
  private base = new THREE.Object3D();
  private trail: THREE.Mesh;
  private trailPts: { tip: THREE.Vector3; base: THREE.Vector3; age: number }[] = [];
  private trailColor = new THREE.Color("#fff4e0");
  private trailOn = false;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene, app: Appearance, cls: string) {
    scene.add(this.root);
    this.light = new THREE.PointLight(0xffc080, 0.25, 2, 2);
    this.light.position.set(0.3, 0.2, 0.2);
    scene.add(this.light);
    const skin = litMaterial({ color: SKIN[app.skin] || SKIN[0], probe: this.probe, fog: false });
    const sleeveColor = cls === "knight" ? "#8a8d92" : CLOTH[app.cloth] || CLOTH[0];
    const sleeve = litMaterial({ color: sleeveColor, probe: this.probe, fog: false });
    const arm = (g: THREE.Group, side: number) => {
      // рука уходит вниз-назад, за край кадра, а не сквозь камеру
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), sleeve);
      s.position.set(0, -0.09, 0.17);
      s.rotation.x = 0.55;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.075, 0.1), skin);
      g.add(s, h);
      g.position.set(side * 0.24, -0.26, -0.42);
      this.root.add(g);
    };
    arm(this.right, 1);
    arm(this.left, -1);
    this.scene = scene;
    const glow = (g: THREE.Group) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff", transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.position.set(0, 0.03, -0.07);
      sp.scale.setScalar(0.001);
      sp.renderOrder = 5;
      g.add(sp);
      return sp;
    };
    this.glowR = glow(this.right);
    this.glowL = glow(this.left);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#fff", transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }));
      m.scale.setScalar(0.018);
      m.renderOrder = 6;
      this.root.add(m);
      this.motes.push(m);
    }
    // след: лента из пар точек «кончик — середина клинка»
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(TRAIL_N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 4;
    scene.add(this.trail);
    this.right.add(this.tip, this.base);
    this.tip.position.set(0, 0.02, -0.16);
    this.base.position.set(0, 0.02, -0.06);
  }

  /** Ставит точки следа на кончик и середину клинка по габаритам модели оружия. */
  private fitTrail(weapon: THREE.Group | null, scale: number, rotX: number, pos: THREE.Vector3) {
    if (!weapon) {
      this.tip.position.set(0, 0.02, -0.16);
      this.base.position.set(0, 0.02, -0.06);
      return;
    }
    const box = new THREE.Box3();
    const saved = { r: weapon.rotation.clone(), p: weapon.position.clone(), s: weapon.scale.clone(), parent: weapon.parent };
    if (saved.parent) saved.parent.remove(weapon);
    weapon.rotation.set(0, 0, 0); weapon.position.set(0, 0, 0); weapon.scale.setScalar(1);
    weapon.updateMatrixWorld(true);
    box.setFromObject(weapon);
    weapon.rotation.copy(saved.r); weapon.position.copy(saved.p); weapon.scale.copy(saved.s);
    if (saved.parent) saved.parent.add(weapon);
    const top = box.max.y, bottom = Math.max(box.min.y, top * 0.35);
    const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0)), new THREE.Vector3(scale, scale, scale));
    this.tip.position.set(0, top, 0).applyMatrix4(m);
    this.base.position.set(0, bottom + (top - bottom) * 0.62, 0).applyMatrix4(m);
  }

  setGear(weapon: string, offhand: string, mode: "melee" | "bolt" | "bow", boltColor: string) {
    this.mode = mode;
    this.castColor.set(boltColor);
    if (weapon !== this.weaponIcon) {
      if (this.weapon) this.right.remove(this.weapon);
      this.weapon = weapon && weapon !== "fist" ? makeWeapon(weapon, this.probe) : null;
      if (this.weapon) {
        this.weapon.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) (m as THREE.MeshLambertMaterial).fog = false;
        });
        if (weapon === "bow") {
          this.weapon.rotation.set(0, Math.PI / 2, 0);
          this.weapon.position.set(0, 0.02, -0.02);
          this.left.add(this.weapon);
        } else {
          this.weapon.rotation.set(-1.1, 0, 0);
          this.weapon.position.set(0, 0.02, -0.04);
          // длинное оружие в руке укорачиваем, иначе оно перекрывает пол-экрана
          this.weapon.scale.setScalar(weapon === "staff" ? 0.42 : weapon === "wand" ? 0.8 : 0.72);
          if (weapon === "staff") this.weapon.position.set(0, -0.12, 0.05);
          this.right.add(this.weapon);
          this.fitTrail(this.weapon, this.weapon.scale.x, -1.1, this.weapon.position);
        }
      }
      if (!this.weapon || weapon === "bow") this.fitTrail(null, 1, 0, new THREE.Vector3());
      this.weaponIcon = weapon;
    }
    // свободная левая рука держит факел (кроме лучника — ему нужны обе руки)
    if (!offhand && mode !== "bow") offhand = "torch";
    if (offhand !== this.offIcon) {
      if (this.offhand) this.left.remove(this.offhand);
      this.torchFlame = null;
      this.offhand = offhand === "torch" ? this.makeTorch() : offhand ? makeWeapon(offhand, this.probe) : null;
      if (this.offhand) {
        if (offhand === "torch") {
          this.offhand.position.set(-0.04, -0.06, -0.02);
          this.offhand.rotation.set(-0.5, 0, 0.25);
          this.offhand.scale.setScalar(0.5);
        } else if (offhand === "shield") {
          this.offhand.position.set(0.02, 0.05, -0.08);
          this.offhand.scale.setScalar(0.8);
        } else {
          this.offhand.position.set(0.02, 0.05, -0.1);
          this.offhand.rotation.x = -0.6;
          this.offhand.scale.setScalar(0.55);
        }
        this.left.add(this.offhand);
      }
      this.offIcon = offhand;
    }
  }

  private torchFlame: THREE.Sprite | null = null;

  private makeTorch(): THREE.Group {
    const g = new THREE.Group();
    const wood = litMaterial({ color: "#6b4a2a", probe: this.probe, fog: false });
    const iron = litMaterial({ color: "#3a3a3e", probe: this.probe, fog: false });
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), wood);
    stick.position.y = 0.1;
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), litMaterial({ color: "#2a1a10", probe: this.probe, fog: false }));
    wrap.position.y = 0.3;
    const cup = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.07), iron);
    cup.position.y = 0.26;
    g.add(stick, wrap, cup);
    const flame = makeFlame(0.55);
    (flame.material as THREE.SpriteMaterial).fog = false;
    flame.position.y = 0.42;
    g.add(flame);
    this.torchFlame = flame;
    return g;
  }

  attack(heavy: boolean, interval: number) {
    this.swing = 1;
    this.swingHeavy = heavy;
    this.swingDur = Math.max(0.25, interval);
  }
  castAnim() { this.cast = 1; }

  /** Жест навыка: своя поза рук, свечение ладони, след оружия. */
  gesture(g: Gesture, color: string, hand: "R" | "L" | "both" | "none", mirror = false, slow = 1) {
    const def = slow === 1 ? G[g] : { ...G[g], dur: G[g].dur * slow };
    this.gest = { def, t: 0, mirror, color: new THREE.Color(color), hand, fired: false };
    this.swing = 0;
    this.cast = 0;
    this.trailColor.set(color);
    if (hand !== "none") this.castColor.set(color);
  }

  /** Короткая заморозка рук при сильном попадании: удар «застревает» в цели. */
  freeze(s: number) { this.freezeT = Math.max(this.freezeT, s); }
  shoot() { this.recoil = 1; this.drawK = 0; }
  potion() { this.drink = 1; }
  hurt() { this.hurtShake = 1; }

  update(dtIn: number, t: number, s: { moving: boolean; sprint: boolean; speed: number; block: boolean; draw: number; dx: number; dy: number; bob: boolean; whirl: boolean }) {
    let dt = dtIn;
    if (this.freezeT > 0) {
      this.freezeT -= dtIn;
      dt = dtIn * 0.08;
    }
    this.bobT += dt * (s.moving ? (s.sprint ? 13 : 9) : 2);
    const bobAmp = s.bob ? (s.moving ? (s.sprint ? 0.028 : 0.016) : 0.004) : 0;
    const bx = Math.sin(this.bobT * 0.5) * bobAmp;
    const by = Math.abs(Math.cos(this.bobT * 0.5)) * bobAmp;
    this.sway.x += (-s.dx * 0.0004 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (s.dy * 0.0004 - this.sway.y) * Math.min(1, dt * 8);
    this.root.position.set(bx + this.sway.x, -by + this.sway.y, 0);
    this.root.rotation.set(0, 0, 0);
    this.blockK += ((s.block ? 1 : 0) - this.blockK) * Math.min(1, dt * 14);
    this.drawK += (s.draw - this.drawK) * Math.min(1, dt * 12);

    // правая рука: базовая поза
    const R = this.right, L = this.left;
    R.position.set(0.24, -0.26, -0.42);
    R.rotation.set(0, 0, 0);
    L.position.set(-0.24, -0.28, -0.44);
    L.rotation.set(0, 0, 0);

    if (this.mode === "bow") {
      // лук в левой руке, правая тянет тетиву
      L.position.set(-0.08, -0.16, -0.5);
      L.rotation.set(0.05, 0.1, -0.15);
      R.position.set(0.06 + this.drawK * 0.02, -0.18, -0.44 + this.drawK * 0.2);
      R.rotation.set(0, 0, 0.4);
    }
    if (this.swing > 0) {
      const p = 1 - this.swing;
      // замах → удар по диагонали
      const k = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
      const strike = p < 0.3 ? -p / 0.3 : (p - 0.3) / 0.7;
      const amp = this.swingHeavy ? 1.4 : 1;
      R.rotation.x = (-0.9 * k + 1.2 * Math.max(0, strike)) * amp;
      R.rotation.z = (0.5 * k - 0.9 * Math.max(0, strike)) * amp;
      R.position.x = 0.24 - 0.18 * Math.max(0, strike) * amp;
      R.position.y = -0.26 + 0.12 * k;
      R.position.z = -0.42 - 0.12 * Math.max(0, strike);
      this.swing = Math.max(0, this.swing - dt / this.swingDur);
    }
    let trail = this.swing > 0 && 1 - this.swing > 0.28 && 1 - this.swing < 0.8;
    if (this.swing > 0 && !this.gest) this.trailColor.set(this.swingHeavy ? "#ffe2b0" : "#a89f90");
    if (s.whirl) {
      // вихрь: клинок ходит широкими кругами, кадр покачивается
      const w = t * 16;
      this.root.rotation.z = Math.sin(t * 20) * 0.12;
      R.rotation.set(0.6 + Math.sin(w) * 0.3, 0, -1.3 + Math.cos(w) * 0.5);
      R.position.set(0.1 + Math.cos(w) * 0.16, -0.22 + Math.sin(w * 2) * 0.03, -0.46 + Math.sin(w) * 0.06);
      this.trailColor.set("#f0e6d0");
      trail = true;
    }
    // жест навыка поверх базовой позы
    const gs = this.gest;
    if (gs) {
      gs.t += dt / gs.def.dur;
      const p = Math.min(1, gs.t);
      const keys = gs.def.keys;
      let i = 0;
      while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
      const a = keys[i], b = keys[i + 1];
      const f0 = Math.max(0, Math.min(1, (p - a[0]) / Math.max(1e-4, b[0] - a[0])));
      const f = b[3] === "o" ? outC(f0) : smooth(f0);
      const sgn = gs.mirror ? -1 : 1;
      const apply = (g: THREE.Group, oa: Off | 0, ob: Off | 0) => {
        const A = oa || Z, B = ob || Z;
        const v = (n: number) => A[n] + (B[n] - A[n]) * f;
        g.position.x += v(0) * sgn; g.position.y += v(1); g.position.z += v(2);
        g.rotation.x += v(3); g.rotation.y += v(4) * sgn; g.rotation.z += v(5) * sgn;
      };
      apply(R, a[1], b[1]);
      apply(L, a[2], b[2]);
      const tw = gs.def.trail;
      if (tw && p > tw[0] && p < tw[1]) trail = true;
      // свечение: копится до выпуска, вспыхивает и гаснет
      const rel = gs.def.release;
      const charge = p < rel ? Math.pow(p / rel, 1.5) : Math.max(0, 1 - (p - rel) / (1 - rel) * 1.3);
      if (!gs.fired && p >= rel) { gs.fired = true; this.flashK = 1; }
      const hr = gs.hand === "R" || gs.hand === "both" ? charge : 0;
      const hl = gs.hand === "L" || gs.hand === "both" ? charge : 0;
      this.glowK.R = Math.max(this.glowK.R, hr);
      this.glowK.L = Math.max(this.glowK.L, hl);
      if (gs.t >= 1) this.gest = null;
    }
    if (this.cast > 0) {
      const k = Math.sin(this.cast * Math.PI);
      R.position.z = -0.42 - 0.18 * k;
      R.position.y = -0.26 + 0.08 * k;
      R.rotation.x = 0.5 * k;
      L.position.z = -0.44 - 0.14 * k;
      L.position.x = -0.2;
      this.cast = Math.max(0, this.cast - dt * 3.2);
    }
    if (this.recoil > 0) {
      R.position.z += 0.06 * this.recoil;
      this.recoil = Math.max(0, this.recoil - dt * 5);
    }
    if (this.blockK > 0.01 && this.mode !== "bow") {
      const k = this.blockK;
      if (this.offIcon === "shield") {
        L.position.set(-0.24 + 0.2 * k, -0.28 + 0.14 * k, -0.44 + 0.08 * k);
        L.rotation.set(0, 0.2 * k, 0);
      } else if (this.mode === "bolt") {
        // магический заслон: ладони вперёд
        L.position.set(-0.24 + 0.12 * k, -0.28 + 0.12 * k, -0.44 - 0.06 * k);
        R.position.set(0.24 - 0.12 * k, -0.26 + 0.12 * k, -0.42 - 0.06 * k);
      } else {
        R.rotation.set(0.3 * k, 0, 1.2 * k);
        R.position.set(0.24 - 0.2 * k, -0.26 + 0.12 * k, -0.42);
      }
    }
    if (this.drink > 0) {
      const k = Math.sin(this.drink * Math.PI);
      L.position.set(-0.24 + 0.2 * k, -0.28 + 0.16 * k, -0.44 + 0.1 * k);
      L.rotation.x = 0.8 * k;
      this.drink = Math.max(0, this.drink - dt * 1.4);
    }
    if (this.hurtShake > 0) {
      this.root.position.x += (Math.random() - 0.5) * 0.03 * this.hurtShake;
      this.root.position.y += (Math.random() - 0.5) * 0.03 * this.hurtShake;
      this.hurtShake = Math.max(0, this.hurtShake - dt * 4);
    }
    if (this.torchFlame) {
      const map = (this.torchFlame.material as THREE.SpriteMaterial).map!;
      map.offset.x = (Math.floor(t * 10) % 4) * 0.25;
      const k = 0.9 + 0.15 * Math.sin(t * 11);
      this.torchFlame.scale.set(0.2 * k, 0.32 * (2 - k), 1);
    }
        // сияние навершия посоха
    this.root.traverse((o) => {
      if (o.name === "orb") {
        o.rotation.y = t * 2;
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(this.castColor);
        o.scale.setScalar(1 + this.cast * 0.8 + Math.sin(t * 6) * 0.08);
      }
    });
    // ладони
    const col = this.gest ? this.gest.color : this.castColor;
    const flash = this.flashK;
    this.flashK = Math.max(0, this.flashK - dt * 5);
    for (const [sp, key] of [[this.glowR, "R"], [this.glowL, "L"]] as const) {
      const k = this.glowK[key];
      const mat = sp.material as THREE.SpriteMaterial;
      mat.color.copy(col);
      mat.opacity = Math.min(1, k * 1.2);
      sp.scale.setScalar(0.001 + k * (0.11 + 0.02 * Math.sin(t * 30)) + (k > 0.05 ? flash * 0.14 : 0));
      this.glowK[key] = Math.max(0, k - dt * 2.5);
    }
    // искры, кружащие вокруг светящейся ладони
    const hand = this.glowK.R >= this.glowK.L ? this.right : this.left;
    const hk = Math.max(this.glowK.R, this.glowK.L);
    const hp = new THREE.Vector3();
    hand.updateMatrixWorld();
    (hand === this.right ? this.glowR : this.glowL).getWorldPosition(hp);
    this.root.worldToLocal(hp);
    this.motes.forEach((m, i) => {
      const a = t * (5 + i) + i * 1.7;
      const r = 0.04 + 0.025 * Math.sin(t * 7 + i);
      m.position.set(hp.x + Math.cos(a) * r, hp.y + Math.sin(a * 1.3) * r, hp.z + Math.sin(a) * r * 0.6);
      const mat = m.material as THREE.SpriteMaterial;
      mat.color.copy(col);
      mat.opacity = hk;
    });
    this.updateTrail(dt, trail);
    const glowAll = Math.max(this.glowK.R, this.glowK.L);
    this.light.intensity = 0.15 + this.cast * 1.5 + glowAll * 1.4 + flash * 1.2;
    this.light.color.copy(this.cast > 0.05 || glowAll > 0.05 ? col : new THREE.Color(0xffc080));
  }

  private updateTrail(dt: number, on: boolean) {
    for (const p of this.trailPts) p.age += dt;
    if (on) {
      this.root.updateMatrixWorld(true);
      this.trailPts.unshift({ tip: this.tip.getWorldPosition(new THREE.Vector3()), base: this.base.getWorldPosition(new THREE.Vector3()), age: 0 });
    }
    while (this.trailPts.length > TRAIL_N || (this.trailPts.length && this.trailPts[this.trailPts.length - 1].age > TRAIL_LIFE)) this.trailPts.pop();
    const n = this.trailPts.length;
    this.trail.visible = n >= 2;
    if (n < 2) return;
    const pos = this.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colA = this.trail.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = this.trailPts[Math.min(i, n - 1)];
      pos.setXYZ(i * 2, p.tip.x, p.tip.y, p.tip.z);
      pos.setXYZ(i * 2 + 1, p.base.x, p.base.y, p.base.z);
      const k = i >= n ? 0 : Math.pow(Math.max(0, 1 - p.age / TRAIL_LIFE) * (1 - i / TRAIL_N), 1.5) * 0.7;
      colA.setXYZ(i * 2, this.trailColor.r * k, this.trailColor.g * k, this.trailColor.b * k);
      colA.setXYZ(i * 2 + 1, 0, 0, 0);
    }
    pos.needsUpdate = true;
    colA.needsUpdate = true;
  }
}
