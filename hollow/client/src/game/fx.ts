/**
 * Зрелищные эффекты навыков героя в мире: серпы ударов, ударные волны, столбы света,
 * руны на полу. Всё чисто визуальное — расчёт урона живёт в общей симуляции.
 */
import * as THREE from "three";
import type { SkillDef } from "@shared/data/skills";

// ------------------------------------------------------------ какой жест и цвет у навыка

export type Gesture =
  | "slash" | "chop" | "spin" | "thrust" | "push" | "slam" | "raise" | "roar"
  | "claw" | "beckon" | "flick" | "throw" | "toss" | "call" | "bash" | "sweep" | "fling";

export const ELEMENT_FX: Record<string, string> = {
  physical: "#e8e2d4", fire: "#ff8a2a", cold: "#8ad8ff", lightning: "#cfe6ff", poison: "#7fe05a",
  holy: "#ffe9a0", dark: "#b06aff", arcane: "#d87aff",
};

export interface SkillLook {
  gesture: Gesture;
  color: string;
  /** Сила «отдачи» на экран: 0 — тихий навык, 1 — крупный. */
  power: number;
  hand: "R" | "L" | "both" | "none";
}

/** Подбирает жест рук и цвет эффекта по типу навыка. */
export function skillLook(sk: SkillDef): SkillLook {
  const e = sk.effect(1) as Record<string, unknown> & { type: string };
  const el = (e.element as string) || (e.auraEl as string) || "";
  const color = ELEMENT_FX[el] || (sk.cls === "cleric" ? ELEMENT_FX.holy : sk.cls === "necromancer" ? "#9aff9a" : sk.cls === "mage" ? ELEMENT_FX.arcane : sk.cls === "rogue" ? "#c9d0d8" : "#ffc070");
  const id = sk.id;
  const caster = sk.cls === "mage" || sk.cls === "necromancer" || sk.cls === "cleric";
  const L = (gesture: Gesture, power: number, hand: SkillLook["hand"] = "none", c = color): SkillLook => ({ gesture, color: c, power, hand });
  switch (e.type) {
    case "arc":
      if (id.includes("shield")) return L("bash", 0.6, "none", "#e8e2d4");
      if (e.execute || e.guaranteedCrit || (e.stun && !e.hits) || id === "crushing_blow" || id === "execution") return L("chop", 0.8, "none", el ? color : "#f0e6d0");
      return L("slash", 0.5, el && el !== "physical" ? "R" : "none", el ? color : "#f0e6d0");
    case "whirl": return L("spin", 0.6, "none", "#f0e6d0");
    case "dash": return L("thrust", 0.7, "none", sk.cls === "rogue" ? "#b06aff" : "#f0e6d0");
    case "leap": return L("chop", 1, "none", "#f0c890");
    case "projectile": return e.weapon ? L("throw", 0.4, "none", "#e8ecf2") : L("push", e.size || id.includes("orb") || id === "fireball" || id === "glacial_spike" ? 0.6 : 0.4, "R");
    case "nova":
      if (e.weapon && sk.cls === "rogue") return L("fling", 0.6, "none");
      if (e.weapon) return L("chop", 1, "none", "#f0c890");
      return L("slam", 0.9, "both");
    case "ground": return L("call", 0.9, "R");
    case "field": return sk.cls === "rogue" ? L("toss", 0.4, "none") : L("sweep", 0.7, "R");
    case "sentry": return sk.cls === "rogue" ? L("toss", 0.4, "none") : L("push", 0.5, "R");
    case "chain": return e.weapon ? L("throw", 0.5, "none", "#e8ecf2") : L("flick", 0.6, "R");
    case "blink": return L("flick", 0.6, "R", color);
    case "warcry": return L("roar", 0.9, "none", e.fear ? "#9a6aff" : "#ffb04a");
    case "buff": return L("raise", 0.5, caster ? "R" : "none", el ? color : sk.cls === "rogue" ? "#7fe05a" : sk.cls === "warrior" ? "#ff6a4a" : color);
    case "shield": return L("raise", 0.6, caster ? "both" : "none", sk.cls === "mage" ? "#8ad8ff" : "#ffe9a0");
    case "taunt": return L("roar", 0.7, "none", "#ff8a4a");
    case "sanctuary": return L("raise", 0.9, "R", "#ffe9a0");
    case "heal": return L("raise", 0.6, "R", "#9aff9a");
    case "summon": return L("beckon", 0.6, "L", sk.cls === "cleric" ? "#ffe9a0" : sk.cls === "rogue" ? "#b06aff" : e.unit === "blood_golem" ? "#ff4a5a" : "#9aff9a");
    case "corpse": return L("beckon", 0.8, "L", "#ff6a3a");
    case "curse": return L("claw", 0.5, "L", "#b06aff");
    case "blind": return L("toss", 0.5, "none", "#8a8a8a");
  }
  return L("raise", 0.4, "R");
}

// ------------------------------------------------------------ текстуры и шейдеры

let runeTex: THREE.CanvasTexture | null = null;
/** Круг с рунами для земли: призыв, проклятие, бафф. */
export function runeTexture() {
  if (runeTex) return runeTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#fff";
  g.fillStyle = "#fff";
  g.lineWidth = 3;
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 16, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(s / 2, s / 2, s / 4, 0, Math.PI * 2); g.stroke();
  // треугольники звезды
  for (const off of [0, Math.PI / 3]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off + (i * Math.PI * 2) / 3 - Math.PI / 2;
      const x = s / 2 + Math.cos(a) * (s / 2 - 16), y = s / 2 + Math.sin(a) * (s / 2 - 16);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  // глифы по кольцу
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = s / 2 + Math.cos(a) * (s / 2 - 9.5), y = s / 2 + Math.sin(a) * (s / 2 - 9.5);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillRect(-1, -3, 2, 6);
    if (i % 2) g.fillRect(-3, -1, 6, 2);
    else g.fillRect(1, -3, 2, 2);
    g.restore();
  }
  runeTex = new THREE.CanvasTexture(c);
  runeTex.magFilter = THREE.NearestFilter;
  runeTex.minFilter = THREE.NearestFilter;
  runeTex.colorSpace = THREE.SRGBColorSpace;
  return runeTex;
}

const SLASH_VERT = `
attribute float aT;
attribute float aR;
varying float vT;
varying float vR;
void main() { vT = aT; vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Серп: яркая «голова» бежит по дуге, за ней тает хвост; к внешнему краю — ярче.
const SLASH_FRAG = `
uniform vec3 uColor;
uniform float uP;
uniform float uFade;
varying float vT;
varying float vR;
void main() {
  float head = uP - vT;
  if (head < 0.0) discard;
  float tail = exp(-head * 3.2);
  float edge = smoothstep(0.0, 0.45, vR) * smoothstep(1.0, 0.82, vR);
  float core = smoothstep(0.6, 0.92, vR) * smoothstep(1.0, 0.9, vR);
  float a = tail * edge * (1.0 - uFade);
  vec3 c = uColor * (0.55 + 0.45 * tail) + vec3(core * tail * 0.9);
  gl_FragColor = vec4(c * a, a);
}`;

const PILLAR_FRAG = `
uniform vec3 uColor;
uniform float uA;
varying vec2 vUv;
void main() {
  float a = pow(1.0 - vUv.y, 1.6) * uA * (0.75 + 0.25 * sin(vUv.x * 50.0));
  gl_FragColor = vec4(uColor * a, a);
}`;
const PILLAR_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function slashGeometry(arc: number, r0: number, r1: number, segs: number) {
  const pos: number[] = [], aT: number[] = [], aR: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const phi = -arc / 2 + arc * t;
    for (const [r, k] of [[r0, 0], [r1, 1]] as const) {
      pos.push(-Math.sin(phi) * r, 0, -Math.cos(phi) * r);
      aT.push(t);
      aR.push(k);
    }
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute("aR", new THREE.Float32BufferAttribute(aR, 1));
  g.setIndex(idx);
  return g;
}

interface Live {
  obj: THREE.Object3D;
  age: number;
  dur: number;
  delay: number;
  step: (k: number, age: number, dt: number) => void;
  dispose: () => void;
}

export class Fx {
  scene: THREE.Scene;
  private live: Live[] = [];
  private geoCache = new Map<string, THREE.BufferGeometry>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private geo(key: string, make: () => THREE.BufferGeometry) {
    let g = this.geoCache.get(key);
    if (!g) { g = make(); this.geoCache.set(key, g); }
    return g;
  }

  private add(obj: THREE.Object3D, dur: number, step: Live["step"], dispose: () => void, delay = 0) {
    obj.visible = delay <= 0;
    this.scene.add(obj);
    this.live.push({ obj, age: -delay, dur, delay, step, dispose });
    if (this.live.length > 80) this.kill(this.live.shift()!);
  }

  private kill(l: Live) {
    this.scene.remove(l.obj);
    l.dispose();
  }

  /**
   * Серп удара перед героем. tilt — наклон плоскости (0 — горизонтально, π/2 — сверху вниз),
   * mirror — направление взмаха (слева направо).
   */
  slash(x: number, y: number, z: number, yaw: number, pitch: number, o: { color: string; arc?: number; r?: number; width?: number; tilt?: number; mirror?: boolean; dur?: number; delay?: number; dip?: number; yawOff?: number }) {
    const arc = o.arc ?? 2.2, r = o.r ?? 1.9, w = o.width ?? 0.75;
    const geo = this.geo(`s${arc.toFixed(2)}${r}${w}`, () => slashGeometry(arc, r - w, r, 28));
    const mat = new THREE.ShaderMaterial({
      vertexShader: SLASH_VERT, fragmentShader: SLASH_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(o.color) }, uP: { value: 0 }, uFade: { value: 0 } },
    });
    const mesh = new THREE.Mesh(geo, mat);
    // плоскость серпа не должна проходить через глаз — иначе он виден ребром, как тонкая линия:
    // наклоняем дальний край (dip) и поворачиваем плоскость вбок (yawOff)
    mesh.rotation.set(o.dip ?? -0.32, o.yawOff ?? 0, o.tilt ?? 0);
    if (o.mirror) mesh.scale.x = -1;
    const root = new THREE.Group();
    root.rotation.order = "YXZ";
    root.rotation.set(pitch * 0.6, yaw, 0);
    root.position.set(x, y, z);
    root.add(mesh);
    const dur = o.dur ?? 0.32;
    this.add(root, dur, (k) => {
      mat.uniforms.uP.value = Math.min(1.6, k * 2.2);
      mat.uniforms.uFade.value = Math.max(0, (k - 0.45) / 0.55);
      const s = 1 + k * 0.12;
      mesh.scale.set((o.mirror ? -1 : 1) * s, s, s);
    }, () => mat.dispose(), o.delay ?? 0);
  }

  /** Плоское кольцо-волна по земле с мягким краем. */
  shockwave(x: number, z: number, r: number, color: string, o: { dur?: number; y?: number; width?: number; delay?: number } = {}) {
    const geo = this.geo("wave", () => new THREE.RingGeometry(0.72, 1, 48, 1));
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, o.y ?? 0.08, z);
    const dur = o.dur ?? 0.5;
    this.add(m, dur, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      m.scale.setScalar(0.2 + e * r);
      mat.opacity = (1 - k) * (1 - k);
    }, () => mat.dispose(), o.delay ?? 0);
  }

  /** Столб света: исцеление, бафф, призыв, святой удар. */
  pillar(x: number, z: number, color: string, o: { r?: number; h?: number; dur?: number; power?: number; delay?: number } = {}) {
    const geo = this.geo("pillar", () => new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0));
    const mat = new THREE.ShaderMaterial({
      vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 0 } },
    });
    const m = new THREE.Mesh(geo, mat);
    const r = o.r ?? 0.8, h = o.h ?? 4;
    m.position.set(x, 0, z);
    const dur = o.dur ?? 0.8;
    const power = o.power ?? 1;
    this.add(m, dur, (k, age) => {
      const rise = Math.min(1, k * 5);
      m.scale.set(r * (1.2 - 0.4 * rise + k * 0.5), h * rise, r * (1.2 - 0.4 * rise + k * 0.5));
      m.rotation.y = age * 2;
      mat.uniforms.uA.value = power * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
    }, () => mat.dispose(), o.delay ?? 0);
  }

  /** Круг рун на полу: появляется, вращается и гаснет. */
  sigil(x: number, z: number, r: number, color: string, o: { dur?: number; spin?: number; y?: number; delay?: number } = {}) {
    const geo = this.geo("plane", () => new THREE.PlaneGeometry(2, 2));
    const mat = new THREE.MeshBasicMaterial({ map: runeTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, o.y ?? 0.06, z);
    const dur = o.dur ?? 1.1;
    const spin = o.spin ?? 1.2;
    this.add(m, dur, (k, age) => {
      const appear = Math.min(1, k * 6);
      m.scale.setScalar(r * (0.6 + 0.4 * (1 - Math.pow(1 - appear, 3))));
      m.rotation.z = age * spin;
      mat.opacity = Math.min(appear, (1 - k) * 2.5) * 0.95;
    }, () => mat.dispose(), o.delay ?? 0);
  }

  /** Вертикальное кольцо в воздухе, расходящееся от точки: выпуск заклинания из руки. */
  burstRing(x: number, y: number, z: number, yaw: number, pitch: number, color: string, size = 0.9) {
    const geo = this.geo("bring", () => new THREE.RingGeometry(0.86, 1, 32, 1));
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.order = "YXZ";
    m.rotation.set(pitch, yaw, 0);
    m.position.set(x, y, z);
    this.add(m, 0.26, (k) => {
      m.scale.setScalar(0.05 + (1 - Math.pow(1 - k, 2)) * size);
      mat.opacity = (1 - k) * 0.8;
    }, () => mat.dispose());
  }

  update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      l.age += dt;
      if (l.age < 0) continue;
      l.obj.visible = true;
      const k = Math.min(1, l.age / l.dur);
      l.step(k, l.age, dt);
      if (k >= 1) {
        this.kill(l);
        this.live.splice(i, 1);
      }
    }
  }

  clear() {
    for (const l of this.live) this.kill(l);
    this.live = [];
  }
}
