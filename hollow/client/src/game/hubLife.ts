/**
 * Жизнь лагеря «Последняя свеча»: подробные фигуры жителей, их занятия,
 * реплики над головой, костёр, снег сквозь дыру в крыше, кот и ворон.
 * Всё чисто визуальное: лавки и окна по-прежнему открываются через Npc.panel.
 */
import * as THREE from "three";
import { CELL } from "@shared/dungeon/generate";
import { humanoid, makeChest, makeFlame, makeProp, makeWeapon, type Rig } from "./models";
import { litMaterial, probeAt } from "./lighting";
import { glowTexture, metalTexture, stoneTexture, woodTexture } from "./textures";
import { runeTexture } from "./fx";
import { audio } from "./audio";
import type { LevelView } from "./level";
import { AGATA_PATH, CAMPFIRE, ROOF_HOLE, type Npc } from "./hub";

type Probe = { value: THREE.Color };
const c = (v: number) => v * CELL;

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}
function cyl(rt: number, rb: number, h: number, seg: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  parent.add(mesh);
  return mesh;
}
const basic = (color: string) => new THREE.MeshBasicMaterial({ color });
function glow(color: string, size: number, opacity = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(size);
  return s;
}
/** Жителей подсвечиваем сильнее стен: они должны читаться на фоне тёмной часовни. */
function lift(c: THREE.Color, k = 1.7) {
  return c.multiplyScalar(k).addScalar(0.06);
}
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// ------------------------------------------------------------ реплики над головой

/** Облачко с текстом над жителем: тёмная плашка, светлые буквы, перенос по словам. */
function bubbleTexture(text: string) {
  const font = `bold 22px "IBM Plex Mono", monospace`;
  const cv = document.createElement("canvas");
  const g = cv.getContext("2d")!;
  g.font = font;
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (g.measureText(next).width > 260 && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  const lw = Math.ceil(Math.max(...lines.map((l) => g.measureText(l).width)));
  cv.width = lw + 24;
  cv.height = lines.length * 26 + 18;
  g.font = font;
  g.fillStyle = "rgba(14,13,11,0.86)";
  g.beginPath();
  g.roundRect(0, 0, cv.width, cv.height - 6, 6);
  g.fill();
  // хвостик облачка
  g.beginPath();
  g.moveTo(cv.width / 2 - 6, cv.height - 6);
  g.lineTo(cv.width / 2, cv.height);
  g.lineTo(cv.width / 2 + 6, cv.height - 6);
  g.fill();
  g.strokeStyle = "rgba(239,233,222,0.14)";
  g.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 7);
  g.fillStyle = "#ece6da";
  g.textBaseline = "top";
  lines.forEach((l, i) => g.fillText(l, 12, 5 + i * 26));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  return { tex, w: cv.width, h: cv.height };
}

interface Bubble { sprite: THREE.Sprite; life: number; max: number }

// ------------------------------------------------------------ жители

interface Resident {
  npc: Npc;
  root: THREE.Group;
  rig?: Rig;
  /** Куда смотреть по умолчанию (поворот головы). */
  headYaw: number;
  lookK: number;
  barkAt: number;
  update?: (t: number, dt: number, near: number) => void;
}

export class HubLife {
  group = new THREE.Group();
  private level: LevelView;
  private residents: Resident[] = [];
  private bubbles = new Map<string, Bubble>();
  private swaying: THREE.Object3D[] = [];
  private sparks: { s: THREE.Sprite; vx: number; vy: number; vz: number; life: number }[] = [];
  private puffs: { s: THREE.Sprite; vy: number; life: number; max: number; grow: number }[] = [];
  private snow: THREE.Points;
  private snowV: Float32Array;
  private crackleAt = 0;
  private petUntil = 0;
  private playerX = 0;
  private playerZ = 0;

  /** Куда выводить слова жителей: в журнал HUD, где текст читается. */
  onLine: (n: Npc, text: string) => void = () => {};

  constructor(level: LevelView, npcs: Npc[]) {
    this.level = level;
    level.group.add(this.group);
    for (const n of npcs) {
      const r = this.build(n);
      if (r) this.residents.push(r);
    }
    this.buildCampfire();
    this.buildCandelabras();
    this.snow = this.buildRoofHole();
    this.snowV = new Float32Array((this.snow.geometry.getAttribute("position") as THREE.BufferAttribute).count);
    for (let i = 0; i < this.snowV.length; i++) this.snowV[i] = 0.5 + Math.random() * 0.5;
  }

  private probe(x: number, z: number): Probe {
    return { value: lift(probeAt(this.level.field, x, z, new THREE.Color()), 1.35) };
  }

  private place(n: Npc) {
    const g = new THREE.Group();
    g.position.set(n.x, 0, n.z);
    g.rotation.y = n.yaw;
    this.group.add(g);
    return g;
  }

  private build(n: Npc): Resident | null {
    switch (n.kind) {
      case "merchant": return this.buildOlgerd(n);
      case "smith": return this.buildBruna(n);
      case "priest": return this.buildMiron(n);
      case "stash": return this.buildStash(n);
      case "gate": return this.buildGate(n);
      case "merc": return this.buildYarosh(n);
      case "nun": return this.buildAgata(n);
      case "cat": return this.buildCat(n);
    }
    return null;
  }

  // ---------------------------------------------------------- Ольгерд, торговец
  private buildOlgerd(n: Npc): Resident {
    const g = this.place(n);
    const rig = humanoid({ skin: "#c9a07a", cloth: "#4a3a5a", pants: "#2e2638", trim: "#c9a46a", head: "hood", eyes: "#2a1a10", bulk: 1.12 });
    g.add(rig.root);
    const p = rig.probe;
    const m = (col: string, map?: THREE.Texture) => litMaterial({ color: col, map: map ?? null, probe: p });
    // сутулый: плечи вперёд, голова приподнята к покупателю
    rig.torso.rotation.x = -0.26;
    rig.head.rotation.x = 0.22;
    const H = rig.head;
    // большой нос, седая борода, усы и круглые очки
    box(0.07, 0.09, 0.08, m("#c98a6a"), 0, 0.18, -0.16, H);
    const beard = m("#b8b0a0");
    box(0.26, 0.12, 0.06, beard, 0, 0.1, -0.15, H);
    box(0.22, 0.14, 0.06, beard, 0, -0.02, -0.15, H);
    box(0.14, 0.12, 0.06, beard, 0, -0.14, -0.14, H);
    box(0.07, 0.08, 0.05, beard, 0, -0.24, -0.13, H);
    box(0.24, 0.035, 0.04, beard, 0, 0.145, -0.17, H);
    const rim = basic("#d8cfa8");
    for (const sx of [-0.065, 0.065]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 4, 12), rim);
      ring.position.set(sx, 0.225, -0.155);
      H.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 10), new THREE.MeshBasicMaterial({ color: "#9ab0c0", transparent: true, opacity: 0.35 }));
      lens.position.set(sx, 0.225, -0.158);
      lens.rotation.y = Math.PI;
      H.add(lens);
    }
    box(0.04, 0.01, 0.01, rim, 0, 0.23, -0.158, H);
    // заплечный короб барахольщика: свёрнутый ковёр, горшки, фонарь
    const T = rig.torso;
    const leather = m("#6a4a2a", woodTexture());
    box(0.56, 0.62, 0.34, leather, 0, 0.36, 0.33, T);
    box(0.6, 0.06, 0.38, m("#3a2a1a"), 0, 0.68, 0.33, T);
    cyl(0.1, 0.1, 0.74, 7, m("#7a2a24"), 0, 0.8, 0.33, T, 0, 0, Math.PI / 2);
    cyl(0.07, 0.09, 0.14, 6, m("#8a5a3a"), -0.3, 0.32, 0.36, T);
    cyl(0.06, 0.05, 0.12, 6, m("#5a6a4a"), -0.31, 0.15, 0.32, T);
    for (const [x, y] of [[-0.08, 0.98], [0.12, 0.95]]) box(0.05, 0.18, 0.05, m("#c8b890"), x, y, 0.33, T, 0, 0, 0.3);
    const lantern = new THREE.Group();
    lantern.position.set(0.34, 0.5, 0.36);
    T.add(lantern);
    const iron = m("#3a3a3e");
    box(0.11, 0.02, 0.11, iron, 0, -0.08, 0, lantern);
    box(0.11, 0.02, 0.11, iron, 0, 0.08, 0, lantern);
    box(0.06, 0.12, 0.06, basic("#ffcf80"), 0, 0, 0, lantern);
    const lg = glow("#ffb050", 0.6, 0.5);
    lantern.add(lg);
    // кошель на поясе
    cyl(0.07, 0.09, 0.14, 6, m("#8a6a3a"), 0.2, -0.02, -0.1, rig.hips);
    // лавка: прилавок с товаром и навес
    const stall = new THREE.Group();
    stall.position.set(0, 0, -1.3);
    g.add(stall);
    const sp = this.probe(n.x - Math.sin(n.yaw) * 1.3, n.z - Math.cos(n.yaw) * 1.3);
    const sm = (col: string, map?: THREE.Texture) => litMaterial({ color: col, map: map ?? null, probe: sp });
    const wood = sm("#7a5a3a", woodTexture());
    box(2.1, 0.08, 0.8, wood, 0, 0.95, 0, stall);
    for (const [x, z] of [[-0.95, -0.32], [0.95, -0.32], [-0.95, 0.32], [0.95, 0.32]]) box(0.08, 0.95, 0.08, wood, x, 0.47, z, stall);
    box(2.0, 0.5, 0.04, sm("#3a2a4a"), 0, 0.72, -0.41, stall);
    box(2.0, 0.05, 0.05, sm("#c9a46a"), 0, 0.5, -0.43, stall);
    for (let i = 0; i < 5; i++) box(0.05, 0.18, 0.02, sm("#c9a46a"), -0.8 + i * 0.4, 0.6, -0.43, stall);
    // зелья светятся: красные, синие, зелёное
    const potions: [number, number, string][] = [[-0.82, -0.12, "#d02a2a"], [-0.68, 0.1, "#d02a2a"], [-0.55, -0.15, "#4a6fe0"], [-0.4, 0.12, "#4a6fe0"], [0.62, -0.1, "#5ac05a"]];
    for (const [x, z, col] of potions) {
      cyl(0.045, 0.06, 0.16, 6, basic(col), x, 1.07, z, stall);
      cyl(0.02, 0.02, 0.06, 5, sm("#d8cfb8"), x, 1.18, z, stall);
      const gl = glow(col, 0.32, 0.35);
      gl.position.set(x, 1.08, z);
      stall.add(gl);
    }
    for (let i = 0; i < 3; i++) cyl(0.04, 0.04, 0.32, 6, sm("#d8c8a0"), -0.1 + i * 0.12, 1.03, 0.15 - i * 0.05, stall, 0, 0.3 * i, Math.PI / 2);
    // череп на продажу и весы
    const bone = sm("#d8cfb8");
    box(0.18, 0.16, 0.2, bone, 0.25, 1.07, 0.05, stall);
    box(0.04, 0.04, 0.02, basic("#100a06"), 0.21, 1.09, -0.06, stall);
    box(0.04, 0.04, 0.02, basic("#100a06"), 0.29, 1.09, -0.06, stall);
    const brass = sm("#c9a46a", metalTexture("#c9a46a"));
    box(0.03, 0.34, 0.03, brass, 0.85, 1.16, 0.12, stall);
    box(0.4, 0.02, 0.02, brass, 0.85, 1.32, 0.12, stall);
    for (const x of [0.67, 1.03]) cyl(0.08, 0.06, 0.03, 8, brass, x, 1.2, 0.12, stall);
    // навес в полоску и пучки трав
    const cv = document.createElement("canvas");
    cv.width = 16; cv.height = 4;
    const cg = cv.getContext("2d")!;
    for (let i = 0; i < 16; i++) { cg.fillStyle = i % 4 < 2 ? "#7a2a24" : "#c8b890"; cg.fillRect(i, 0, 1, 4); }
    const stripes = new THREE.CanvasTexture(cv);
    stripes.magFilter = THREE.NearestFilter;
    stripes.colorSpace = THREE.SRGBColorSpace;
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.1), litMaterial({ map: stripes, probe: sp, side: THREE.DoubleSide }));
    awning.position.set(0, 2.55, 0.35);
    awning.rotation.x = -Math.PI / 2 + 0.32;
    stall.add(awning);
    for (const x of [-1.2, 1.2]) box(0.07, 2.25, 0.07, wood, x, 1.12, -0.6, stall);
    for (let i = 0; i < 5; i++) {
      const herb = box(0.07, 0.24, 0.07, sm(i % 2 ? "#5a6a3a" : "#7a6a3a"), -0.9 + i * 0.45, 2.05, -0.58, stall);
      herb.userData.sway = i;
      this.swaying.push(herb);
    }
    // свеча на прилавке
    this.level.addFlame(new THREE.Vector3(0, 1.17, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(n.yaw)).add(new THREE.Vector3(n.x - Math.sin(n.yaw) * 1.3, 0, n.z - Math.cos(n.yaw) * 1.3)), 0.4);
    box(0.06, 0.14, 0.06, sm("#e8dcc0"), 0, 1.06, 0, stall);
    lift(probeAt(this.level.field, n.x, n.z, p.value));
    return {
      npc: n, root: g, rig, headYaw: 0, lookK: 0, barkAt: 0,
      update: (t) => {
        // потирает руки, иногда поправляет очки
        const cycle = t % 9;
        const rub = Math.sin(t * 9) * 0.12;
        rig.armR.rotation.set(0.75, 0, 0.35 + rub);
        rig.armL.rotation.set(0.75, 0, -0.35 - rub);
        rig.foreR.rotation.x = 0.9;
        rig.foreL.rotation.x = 0.9;
        if (cycle > 6.5 && cycle < 7.6) {
          const k = Math.sin(((cycle - 6.5) / 1.1) * Math.PI);
          rig.armR.rotation.set(0.75 + 1.3 * k, 0, 0.35 - 0.45 * k);
          rig.foreR.rotation.x = 0.9 + 1.0 * k;
        }
        rig.body.position.y = Math.sin(t * 1.4) * 0.01;
        lantern.rotation.z = Math.sin(t * 1.3) * 0.12;
        lg.material.opacity = 0.45 + Math.sin(t * 13) * 0.05;
      },
    };
  }

  // ---------------------------------------------------------- Бруна, кузнец
  private buildBruna(n: Npc): Resident {
    const g = this.place(n);
    const rig = humanoid({ skin: "#b07d52", cloth: "#5a3a26", pants: "#2a1e16", trim: "#3a2a1e", head: "human", hair: "braid", hairColor: "#b0502a", bulk: 1.3 });
    g.add(rig.root);
    const p = rig.probe;
    const m = (col: string, map?: THREE.Texture) => litMaterial({ color: col, map: map ?? null, probe: p });
    const H = rig.head, T = rig.torso;
    // выбритый висок, рыжий гребень, шрам через бровь, сажа на щеке, серьга
    box(0.08, 0.1, 0.26, m("#b0502a"), 0, 0.37, 0.01, H);
    box(0.02, 0.12, 0.02, m("#6a3020"), 0.07, 0.24, -0.136, H, 0, 0, 0.3);
    box(0.08, 0.03, 0.01, m("#2a2420"), -0.07, 0.15, -0.136, H);
    box(0.02, 0.04, 0.02, basic("#e0b040"), -0.14, 0.15, 0, H);
    box(0.14, 0.04, 0.02, m("#6a4030"), 0, 0.29, -0.136, H);
    // кожаный фартук до колен, ремни, наручи
    const apron = m("#5a3a22");
    box(0.5, 1.0, 0.04, apron, 0, 0.0, -0.2, T);
    box(0.62, 0.05, 0.36, m("#2a1e16"), 0, 0.12, 0, T);
    box(0.05, 0.62, 0.02, m("#2a1e16"), -0.16, 0.36, -0.21, T, 0, 0, 0.25);
    box(0.05, 0.62, 0.02, m("#2a1e16"), 0.16, 0.36, -0.21, T, 0, 0, -0.25);
    for (const f of [rig.foreL, rig.foreR]) box(0.22, 0.16, 0.22, m("#4a3020"), 0, -0.14, 0, f);
    // голые мускулистые плечи
    for (const a of [rig.armL, rig.armR]) box(0.24, 0.3, 0.24, m("#b07d52"), 0, -0.16, 0, a);
    // молот кузнеца
    const hammer = new THREE.Group();
    box(0.045, 0.55, 0.045, m("#5a3a22", woodTexture()), 0, 0.2, 0, hammer);
    box(0.22, 0.12, 0.12, m("#4a4a4e", metalTexture("#4a4a4e")), 0, 0.46, 0, hammer);
    hammer.rotation.x = -Math.PI / 2;
    rig.hand.add(hammer);
    // клещи в левой
    const tongs = new THREE.Group();
    box(0.03, 0.5, 0.03, m("#3a3a3e"), -0.02, 0.2, 0, tongs, 0, 0, 0.06);
    box(0.03, 0.5, 0.03, m("#3a3a3e"), 0.02, 0.2, 0, tongs, 0, 0, -0.06);
    tongs.rotation.x = -Math.PI / 2;
    rig.handL.add(tongs);
    // наковальня с раскалённой полосой
    const anvil = new THREE.Group();
    anvil.position.set(0, 0, -1.0);
    g.add(anvil);
    const ap = this.probe(n.x - Math.sin(n.yaw), n.z - Math.cos(n.yaw));
    const ironA = litMaterial({ color: "#4a4a4e", map: metalTexture("#4a4a4e"), probe: ap });
    cyl(0.32, 0.4, 0.32, 8, litMaterial({ color: "#5a4030", map: woodTexture(), probe: ap }), 0, 0.16, 0, anvil);
    box(0.32, 0.36, 0.26, ironA, 0, 0.5, 0, anvil);
    box(0.85, 0.16, 0.34, ironA, 0, 0.76, 0, anvil);
    cyl(0.0, 0.12, 0.34, 6, ironA, -0.58, 0.77, 0, anvil, 0, 0, Math.PI / 2);
    const barMat = new THREE.MeshBasicMaterial({ color: "#ff8a2a" });
    const bar = box(0.42, 0.04, 0.06, barMat, 0.05, 0.86, 0.02, anvil, 0, 0.3, 0);
    const barGlow = glow("#ff7a2a", 0.9, 0.45);
    barGlow.position.set(0.05, 0.9, 0.02);
    anvil.add(barGlow);
    // горн у стены: камень, угли, колпак, мехи
    const fx = c(13.55), fz = c(4.75);
    const fp = this.probe(fx - 1.2, fz);
    const forge = new THREE.Group();
    forge.position.set(fx, 0, fz);
    this.group.add(forge);
    const stone = litMaterial({ color: "#6a5a4a", map: stoneTexture("#6a5a4a"), probe: fp });
    box(1.4, 0.95, 1.6, stone, 0, 0.47, 0, forge);
    box(1.5, 0.12, 1.7, stone, 0, 0.98, 0, forge);
    const coals = new THREE.MeshBasicMaterial({ color: "#ff5a1a" });
    box(0.9, 0.08, 1.1, coals, -0.05, 1.06, 0, forge);
    const coalGlow = glow("#ff6a20", 2.6, 0.55);
    coalGlow.position.set(-0.05, 1.2, 0);
    forge.add(coalGlow);
    box(1.3, 0.6, 1.5, stone, 0.1, 2.6, 0, forge);
    box(0.9, 0.5, 1.0, stone, 0.2, 3.1, 0, forge);
    box(0.6, 3.6, 0.7, stone, 0.3, 5.1, 0, forge);
    const bellows = new THREE.Group();
    bellows.position.set(-0.2, 1.0, 1.05);
    forge.add(bellows);
    const leather = litMaterial({ color: "#5a3a22", probe: fp });
    box(0.5, 0.06, 0.34, litMaterial({ color: "#6a4a2a", map: woodTexture(), probe: fp }), 0, 0.0, 0, bellows);
    const bellowsTop = box(0.5, 0.06, 0.34, litMaterial({ color: "#6a4a2a", map: woodTexture(), probe: fp }), 0, 0.16, 0, bellows);
    const bellowsSkin = box(0.46, 0.14, 0.3, leather, 0, 0.08, 0, bellows);
    this.level.addFlame(new THREE.Vector3(fx - 0.05, 1.12, fz), 1.3);
    // стойка с оружием и бочка для закалки
    const rack = new THREE.Group();
    rack.position.set(c(13.7), 0, c(8.4));
    rack.rotation.y = Math.PI / 2;
    this.group.add(rack);
    const rp = this.probe(c(13.4), c(8.4));
    const rw = litMaterial({ color: "#6a4a2a", map: woodTexture(), probe: rp });
    box(1.3, 0.08, 0.3, rw, 0, 0.3, 0, rack);
    box(1.3, 0.08, 0.3, rw, 0, 1.3, 0.12, rack);
    for (const x of [-0.6, 0.6]) box(0.08, 1.5, 0.08, rw, x, 0.75, 0.1, rack);
    ["sword", "axe", "sword", "mace"].forEach((icon, i) => {
      const w = makeWeapon(icon, rp);
      w.position.set(-0.42 + i * 0.28, 0.35, 0);
      w.rotation.set(-0.12, 0, 0.05 * (i - 1.5));
      rack.add(w);
    });
    const barrel = new THREE.Group();
    barrel.position.set(n.x - 1.6, 0, n.z - 1.4);
    this.group.add(barrel);
    cyl(0.36, 0.32, 0.8, 9, litMaterial({ color: "#6a4a2a", map: woodTexture(), probe: ap }), 0, 0.4, 0, barrel);
    for (const y of [0.15, 0.65]) cyl(0.37, 0.37, 0.05, 9, ironA, 0, y, 0, barrel);
    cyl(0.33, 0.33, 0.02, 9, basic("#1a2a32"), 0, 0.78, 0, barrel);
    lift(probeAt(this.level.field, n.x, n.z, p.value));
    p.value.lerp(new THREE.Color(1.0, 0.55, 0.3), 0.25);
    const anvilTop = new THREE.Vector3(0.05, 0.9, -1.0).applyAxisAngle(new THREE.Vector3(0, 1, 0), n.yaw).add(new THREE.Vector3(n.x, 0, n.z));
    let lastBeat = -1;
    return {
      npc: n, root: g, rig, headYaw: 0, lookK: 0, barkAt: 0,
      update: (t, _dt, near) => {
        // ритм: три удара — пауза, в паузу качает мехи
        const beat = Math.floor(t / 0.9);
        const ph = (t % 0.9) / 0.9;
        const working = beat % 5 < 3;
        if (working) {
          // замах вверх и вперёд → удар по наковальне
          const lift = ph < 0.6 ? Math.sin((ph / 0.6) * Math.PI * 0.5) : 1 - (ph - 0.6) / 0.12;
          const k = Math.max(0, Math.min(1, lift));
          rig.armR.rotation.set(0.95 + 1.9 * k, 0, 0.1);
          rig.foreR.rotation.x = 0.5 + 0.4 * k;
          rig.torso.rotation.x = -0.18 + 0.12 * k;
          if (ph > 0.72 && beat !== lastBeat) {
            lastBeat = beat;
            this.sparkBurst(anvilTop, 14);
            if (near < 22) audio.play("clang", { x: anvilTop.x, z: anvilTop.z }, 0.8);
          }
        } else {
          rig.armR.rotation.set(0.95, 0, 0.1);
          rig.foreR.rotation.x = 0.5;
          rig.torso.rotation.x = -0.12;
        }
        rig.armL.rotation.set(0.85, 0, -0.15);
        rig.foreL.rotation.x = 0.4;
        const b = working ? 0 : Math.abs(Math.sin(t * 4));
        bellowsTop.position.y = 0.1 + b * 0.08;
        bellowsSkin.scale.y = 0.6 + b * 0.6;
        // полоса остывает между ударами и вновь краснеет у горна
        const heat = 0.7 + 0.3 * Math.sin(t * 0.7);
        barMat.color.setRGB(1, 0.35 + heat * 0.25, 0.1 * heat);
        barGlow.material.opacity = 0.3 + heat * 0.25;
        coals.color.setRGB(1, 0.3 + Math.sin(t * 7) * 0.04 + b * 0.15, 0.08);
        coalGlow.material.opacity = 0.45 + b * 0.25 + Math.sin(t * 9) * 0.04;
        void bar;
      },
    };
  }

  // ---------------------------------------------------------- Отец Мирон
  private buildMiron(n: Npc): Resident {
    const g = this.place(n);
    const rig = humanoid({ skin: "#e0c0a0", cloth: "#d8cdb2", trim: "#7a2a24", robe: true, head: "human", hair: "bald", bulk: 0.95, scale: 1.08 });
    g.add(rig.root);
    const p = rig.probe;
    const m = (col: string) => litMaterial({ color: col, probe: p });
    const H = rig.head, T = rig.torso;
    const white = m("#ece6da");
    // седая бахрома вокруг лысины, брови, длинная борода
    box(0.06, 0.12, 0.24, white, -0.14, 0.24, 0.02, H);
    box(0.06, 0.12, 0.24, white, 0.14, 0.24, 0.02, H);
    box(0.26, 0.12, 0.05, white, 0, 0.24, 0.13, H);
    box(0.07, 0.025, 0.02, white, -0.06, 0.265, -0.136, H);
    box(0.07, 0.025, 0.02, white, 0.06, 0.265, -0.136, H);
    box(0.22, 0.14, 0.06, white, 0, 0.1, -0.15, H);
    box(0.18, 0.2, 0.06, white, 0, -0.06, -0.15, H);
    box(0.12, 0.18, 0.05, white, 0, -0.24, -0.14, H);
    box(0.06, 0.1, 0.05, white, 0, -0.36, -0.13, H);
    box(0.05, 0.06, 0.05, m("#d0a888"), 0, 0.18, -0.15, H);
    // красная епитрахиль и медный знак
    const red = m("#8a2a24");
    box(0.08, 0.95, 0.02, red, -0.09, 0.05, -0.14, T);
    box(0.08, 0.95, 0.02, red, 0.09, 0.05, -0.14, T);
    box(0.3, 0.08, 0.27, red, 0, 0.6, 0, T);
    box(0.03, 0.12, 0.02, basic("#c9a46a"), 0, 0.42, -0.155, T);
    box(0.08, 0.03, 0.02, basic("#c9a46a"), 0, 0.45, -0.155, T);
    // свеча в левой руке
    const candle = new THREE.Group();
    rig.handL.add(candle);
    candle.position.set(0, -0.02, -0.04);
    box(0.05, 0.16, 0.05, m("#e8dcc0"), 0, 0.06, 0, candle);
    box(0.12, 0.02, 0.12, m("#c9a46a"), 0, -0.02, 0, candle);
    const flame = makeFlame(0.32);
    flame.position.set(0, 0.2, 0);
    candle.add(flame);
    const cg = glow("#ffb050", 0.7, 0.5);
    cg.position.set(0, 0.2, 0);
    candle.add(cg);
    // доска поручений: рамка, навес, записки с печатями, две свечи сверху
    const board = new THREE.Group();
    board.position.set(1.15, 0, 0.45);
    board.rotation.y = 0.35;
    g.add(board);
    const bp = this.probe(n.x + 1, n.z);
    const bw = litMaterial({ color: "#6a4a2a", map: woodTexture(), probe: bp });
    box(1.5, 1.1, 0.08, bw, 0, 1.6, 0, board);
    for (const x of [-0.72, 0.72]) box(0.1, 2.3, 0.1, bw, x, 1.15, 0, board);
    box(1.8, 0.08, 0.36, bw, 0, 2.3, -0.08, board, 0.2);
    const paper = litMaterial({ color: "#d8cdb2", probe: bp });
    const notes: [number, number, number][] = [[-0.45, 1.85, 0.08], [0.0, 1.88, -0.06], [0.42, 1.8, 0.1], [-0.3, 1.4, -0.08], [0.22, 1.38, 0.05]];
    for (const [x, y, r] of notes) {
      box(0.32, 0.38, 0.01, paper, x, y, -0.05, board, 0, 0, r);
      box(0.05, 0.05, 0.012, basic("#8a1a14"), x, y + 0.12, -0.057, board);
      for (let i = 0; i < 3; i++) box(0.2 - i * 0.04, 0.012, 0.012, basic("#5a4a3a"), x, y + 0.02 - i * 0.07, -0.058, board, 0, 0, r);
    }
    for (const x of [-0.62, 0.62]) {
      box(0.06, 0.16, 0.06, litMaterial({ color: "#e8dcc0", probe: bp }), x, 2.42, -0.15, board);
      const wp = new THREE.Vector3(x, 2.55, -0.15).applyMatrix4(new THREE.Matrix4().makeRotationY(0.35)).add(new THREE.Vector3(1.15, 0, 0.45)).applyMatrix4(new THREE.Matrix4().makeRotationY(n.yaw)).add(new THREE.Vector3(n.x, 0, n.z));
      this.level.addFlame(wp, 0.38);
    }
    // аналой с раскрытой книгой
    const lect = new THREE.Group();
    lect.position.set(c(4.2) + 0.9, 0, c(3.9) + 0.7);
    lect.rotation.y = n.yaw + 0.4;
    this.group.add(lect);
    const lp = this.probe(c(4.2) + 0.9, c(3.9) + 0.7);
    const lw = litMaterial({ color: "#5a3a22", map: woodTexture(), probe: lp });
    box(0.3, 0.1, 0.3, lw, 0, 0.05, 0, lect);
    box(0.1, 1.0, 0.1, lw, 0, 0.55, 0, lect);
    box(0.5, 0.05, 0.4, lw, 0, 1.08, 0, lect, -0.4);
    const pages = litMaterial({ color: "#e8dcc0", probe: lp, side: THREE.DoubleSide });
    box(0.2, 0.012, 0.28, pages, -0.1, 1.13, 0, lect, -0.4, 0, 0.06);
    const page = new THREE.Group();
    page.position.set(0, 1.13, 0);
    page.rotation.x = -0.4;
    lect.add(page);
    box(0.2, 0.012, 0.28, pages, 0.1, 0, 0, page, 0, 0, -0.06);
    lift(probeAt(this.level.field, n.x, n.z, p.value));
    return {
      npc: n, root: g, rig, headYaw: 0, lookK: 0, barkAt: 0,
      update: (t) => {
        // держит свечу у груди; иногда склоняет голову в молитве
        const pray = Math.max(0, Math.sin(t * 0.35)) ** 6;
        rig.armL.rotation.set(0.7 + pray * 0.3, 0, -0.1 + pray * 0.25);
        rig.foreL.rotation.x = 1.1 + pray * 0.3;
        rig.armR.rotation.set(0.15 + pray * 1.0, 0, 0.1 - pray * 0.4);
        rig.foreR.rotation.x = 0.2 + pray * 1.2;
        rig.torso.rotation.x = -0.05 - pray * 0.12;
        rig.head.rotation.x = -pray * 0.45;
        const turn = (t % 11) / 11;
        page.rotation.z = turn > 0.9 ? -Math.sin(((turn - 0.9) / 0.1) * Math.PI) * 2.8 : 0;
        cg.material.opacity = 0.42 + Math.sin(t * 12) * 0.06;
        const map = flame.material.map!;
        map.offset.x = (Math.floor(t * 10) % 4) * 0.25;
      },
    };
  }

  // ---------------------------------------------------------- сундук отряда и ворон Карр
  private buildStash(n: Npc): Resident {
    const g = this.place(n);
    const p = this.probe(n.x, n.z);
    const chest = makeChest("boss", p);
    chest.obj.scale.setScalar(1.3);
    g.add(chest.obj);
    // цепь с замком и знамя отряда над сундуком
    const iron = litMaterial({ color: "#5a5a5e", map: metalTexture("#5a5a5e"), probe: p });
    for (let i = 0; i < 6; i++) box(0.08, 0.04, 0.14, iron, -0.55 + i * 0.22, 0.62, -0.42, g, 0, 0, (i % 2) * 0.6);
    box(0.16, 0.18, 0.06, litMaterial({ color: "#c9a46a", probe: p }), 0, 0.5, -0.47, g);
    // ворон
    const raven = new THREE.Group();
    raven.position.set(0.35, 0.98, 0.05);
    raven.rotation.y = -0.6;
    raven.scale.setScalar(1.45);
    g.add(raven);
    const black = litMaterial({ color: "#1c1c26", probe: p });
    box(0.16, 0.16, 0.3, black, 0, 0.12, 0, raven, -0.35);
    const head = new THREE.Group();
    head.position.set(0, 0.26, -0.12);
    raven.add(head);
    box(0.12, 0.12, 0.13, black, 0, 0, 0, head);
    box(0.04, 0.04, 0.12, litMaterial({ color: "#2a2a30", probe: p }), 0, -0.02, -0.11, head);
    for (const sx of [-0.062, 0.062]) box(0.015, 0.025, 0.025, basic("#e0b040"), sx, 0.02, -0.04, head);
    box(0.1, 0.03, 0.2, black, 0, 0.06, 0.2, raven, 0.5);
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    wingL.position.set(-0.08, 0.17, 0);
    wingR.position.set(0.08, 0.17, 0);
    raven.add(wingL, wingR);
    box(0.02, 0.14, 0.28, black, -0.01, -0.05, 0.02, wingL);
    box(0.02, 0.14, 0.28, black, 0.01, -0.05, 0.02, wingR);
    for (const x of [-0.04, 0.04]) box(0.015, 0.08, 0.015, litMaterial({ color: "#3a3030", probe: p }), x, -0.02, 0, raven);
    let nextCaw = 6 + Math.random() * 8, flap = 0;
    return {
      npc: n, root: g, headYaw: 0, lookK: 0, barkAt: 0,
      update: (t, dt, near) => {
        // вертит головой рывками, раз в полминуты хлопает крыльями и каркает
        const jerk = Math.floor(t * 0.8);
        head.rotation.y = Math.sin(jerk * 12.9898) * 0.8;
        head.rotation.x = Math.sin(jerk * 4.1) * 0.2;
        nextCaw -= dt;
        if (nextCaw <= 0) {
          nextCaw = 18 + Math.random() * 20;
          flap = 1;
          if (near < 20) audio.play("caw", { x: n.x, z: n.z }, 0.8);
        }
        if (flap > 0) flap = Math.max(0, flap - dt * 1.2);
        const w = flap > 0 ? Math.abs(Math.sin(t * 22)) * 1.1 * flap : 0;
        wingL.rotation.z = -w;
        wingR.rotation.z = w;
        raven.position.y = 0.98 + w * 0.05;
      },
    };
  }

  // ---------------------------------------------------------- Врата глубин
  private buildGate(n: Npc): Resident {
    const g = this.place(n);
    const { obj } = makeProp("portal", { wall: "#7a6a58", accent: "#7a2a24" });
    obj.scale.set(1.2, 1.15, 1);
    g.add(obj);
    let veil: THREE.Mesh | null = null;
    obj.traverse((o) => { if (o.name === "veil") veil = o as THREE.Mesh; });
    // руна на полу перед вратами и два стоячих камня с горящими знаками
    const sig = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: runeTexture(), color: "#6f9fd8", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sig.rotation.x = -Math.PI / 2;
    sig.position.set(0, 0.04, 2.0);
    g.add(sig);
    const p = this.probe(n.x, n.z + 2);
    const stone = litMaterial({ color: "#5a5060", map: stoneTexture("#5a5060"), probe: p });
    const runes: THREE.MeshBasicMaterial[] = [];
    for (const x of [-2.2, 2.2]) {
      box(0.5, 1.9, 0.4, stone, x, 0.95, 0.6, g, 0, 0, x > 0 ? -0.05 : 0.05);
      const rm = new THREE.MeshBasicMaterial({ color: "#8fd0ff" });
      runes.push(rm);
      for (let i = 0; i < 3; i++) box(0.16, 0.05 + (i % 2) * 0.08, 0.02, rm, x, 0.7 + i * 0.4, 0.39, g);
    }
    const motes: THREE.Sprite[] = [];
    for (let i = 0; i < 14; i++) {
      const s = glow("#8fd0ff", 0.12, 0.8);
      s.userData = { a: Math.random() * Math.PI * 2, r: 0.4 + Math.random() * 1.3, sp: 0.3 + Math.random() * 0.4, ph: Math.random() };
      g.add(s);
      motes.push(s);
    }
    return {
      npc: n, root: g, headYaw: 0, lookK: 0, barkAt: 0,
      update: (t) => {
        sig.rotation.z = t * 0.15;
        (sig.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 1.3) * 0.12;
        runes.forEach((r, i) => r.color.setRGB(0.4 + 0.2 * Math.sin(t * 2 + i), 0.7 + 0.15 * Math.sin(t * 2 + i), 1));
        if (veil) ((veil as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.12 * Math.sin(t * 2.4);
        for (const s of motes) {
          const u = s.userData as { a: number; r: number; sp: number; ph: number };
          const k = (t * u.sp * 0.25 + u.ph) % 1;
          s.position.set(Math.cos(u.a + t * 0.3) * u.r, 0.2 + k * 3.2, 0.6 + Math.sin(u.a + t * 0.3) * u.r * 0.5);
          s.material.opacity = Math.sin(k * Math.PI) * 0.8;
        }
      },
    };
  }

  // ---------------------------------------------------------- Ярош у костра
  private buildYarosh(n: Npc): Resident {
    const g = this.place(n);
    const rig = humanoid({ skin: "#c49a74", cloth: "#5a4a3a", pants: "#3a3028", trim: "#6a5a48", armor: "#6a6a70", head: "human", hair: "short", hairColor: "#2a1c12", bulk: 1.1 });
    g.add(rig.root);
    const p = rig.probe;
    const m = (col: string, map?: THREE.Texture) => litMaterial({ color: col, map: map ?? null, probe: p });
    const H = rig.head;
    // повязка через лоб с пятном, щетина, шрам
    box(0.28, 0.06, 0.28, m("#d8d0c0"), 0, 0.3, 0, H, 0, 0, 0.12);
    box(0.06, 0.05, 0.02, m("#8a2a24"), 0.06, 0.31, -0.145, H);
    box(0.22, 0.08, 0.02, m("#3a2a20"), 0, 0.09, -0.135, H);
    box(0.02, 0.08, 0.01, m("#8a5040"), -0.08, 0.19, -0.138, H, 0, 0, 0.4);
    // сидит на бревне: одна нога согнута, вторая в лубке вытянута к огню
    rig.body.position.y = -0.38;
    rig.legL.rotation.x = 1.5;
    rig.shinL.rotation.x = -1.45;
    rig.legR.rotation.set(1.42, 0, 0.12);
    rig.shinR.rotation.x = -0.1;
    const splint = m("#8a6a4a", woodTexture());
    for (const x of [-0.1, 0.1]) box(0.03, 0.5, 0.04, splint, x, -0.22, 0, rig.shinR);
    for (const y of [-0.1, -0.32]) box(0.2, 0.05, 0.2, m("#d8d0c0"), 0, y, 0, rig.shinR);
    // фляга
    const flask = new THREE.Group();
    rig.hand.add(flask);
    cyl(0.06, 0.07, 0.18, 7, m("#7a6a5a", metalTexture("#7a6a5a")), 0, -0.05, -0.02, flask);
    cyl(0.025, 0.025, 0.05, 5, m("#3a2a1a"), 0, 0.06, -0.02, flask);
    // бревно и брошенный шлем
    const lp = this.probe(n.x, n.z);
    const logM = litMaterial({ color: "#5a4030", map: woodTexture(), probe: lp });
    cyl(0.2, 0.22, 1.5, 8, logM, 0, 0.2, 0.05, g, 0, 0, Math.PI / 2);
    const helm = new THREE.Group();
    helm.position.set(0.85, 0.14, 0.25);
    helm.rotation.set(0.4, 0.5, 1.2);
    g.add(helm);
    box(0.28, 0.26, 0.3, litMaterial({ color: "#6a6a70", map: metalTexture("#6a6a70"), probe: lp }), 0, 0, 0, helm);
    box(0.2, 0.03, 0.02, basic("#050302"), 0, 0.02, -0.155, helm);
    // свёрнутая постель позади
    cyl(0.18, 0.18, 0.9, 8, litMaterial({ color: "#5a6a4a", probe: lp }), -0.2, 0.18, 0.9, g, 0, 0.3, Math.PI / 2);
    lift(probeAt(this.level.field, n.x, n.z, p.value));
    p.value.lerp(new THREE.Color(1.1, 0.6, 0.3), 0.3);
    return {
      npc: n, root: g, rig, headYaw: 0.25, lookK: 0, barkAt: 0,
      update: (t) => {
        // греет руку у огня, раз в несколько секунд прикладывается к фляге
        const cyc = t % 8;
        const drink = cyc > 5.5 && cyc < 7.2 ? Math.sin(((cyc - 5.5) / 1.7) * Math.PI) : 0;
        rig.armR.rotation.set(0.6 + drink * 1.6, 0, 0.15 - drink * 0.25);
        rig.foreR.rotation.x = 0.8 + drink * 1.3;
        rig.armL.rotation.set(1.2 + Math.sin(t * 0.8) * 0.06, 0, -0.1);
        rig.foreL.rotation.x = 0.2;
        rig.head.rotation.x = drink * -0.35;
        rig.torso.rotation.x = -0.12 + Math.sin(t * 1.1) * 0.02;
      },
    };
  }

  // ---------------------------------------------------------- Сестра Агата
  private agataLeg = 0;
  private agataWait = 3;
  private buildAgata(n: Npc): Resident {
    const g = this.place(n);
    const rig = humanoid({ skin: "#e8c8a8", cloth: "#2e2e3a", trim: "#24242e", robe: true, head: "hood", eyes: "#2a1a10", bulk: 0.85, scale: 0.95 });
    g.add(rig.root);
    const p = rig.probe;
    const m = (col: string) => litMaterial({ color: col, probe: p });
    // белый апостольник вокруг лица, деревянные чётки
    box(0.3, 0.06, 0.04, m("#e8e0d0"), 0, 0.33, -0.16, rig.head);
    box(0.06, 0.3, 0.04, m("#e8e0d0"), -0.15, 0.18, -0.15, rig.head);
    box(0.06, 0.3, 0.04, m("#e8e0d0"), 0.15, 0.18, -0.15, rig.head);
    box(0.36, 0.14, 0.3, m("#e8e0d0"), 0, -0.02, -0.02, rig.head);
    for (let i = 0; i < 7; i++) box(0.035, 0.035, 0.035, m("#6a4a2a"), Math.sin(i * 0.5 - 1.5) * 0.12, 0.3 - Math.cos(i * 0.5 - 1.5) * 0.18, -0.16, rig.torso);
    // длинная лучина с огоньком
    const taper = new THREE.Group();
    rig.hand.add(taper);
    box(0.02, 0.7, 0.02, m("#8a6a4a"), 0, 0.25, 0, taper);
    taper.rotation.x = -1.2;
    const flame = makeFlame(0.22);
    flame.position.set(0, 0.62, 0);
    taper.add(flame);
    const tg = glow("#ffb050", 0.6, 0.55);
    tg.position.set(0, 0.62, 0);
    taper.add(tg);
    let lighting = 0;
    return {
      npc: n, root: g, rig, headYaw: 0, lookK: 0, barkAt: 0,
      update: (t, dt) => {
        const path = AGATA_PATH.map(([x, z]) => [c(x), c(z)] as [number, number]);
        const [tx, tz] = path[(this.agataLeg + 1) % path.length];
        const dx = tx - n.x, dz = tz - n.z, dist = Math.hypot(dx, dz);
        let moving = 0;
        if (this.agataWait > 0) {
          // у подсвечника: поднимает лучину к свечам
          this.agataWait -= dt;
          lighting = Math.min(1, lighting + dt * 2);
          const wall = path[this.agataLeg];
          const face = wall[0] < c(6) ? Math.PI / 2 : wall[0] > c(9) ? -Math.PI / 2 : 0;
          n.yaw += wrap(face - n.yaw) * Math.min(1, dt * 4);
        } else if (dist > 0.08) {
          lighting = Math.max(0, lighting - dt * 3);
          const sp = 1.1;
          n.x += (dx / dist) * Math.min(dist, sp * dt);
          n.z += (dz / dist) * Math.min(dist, sp * dt);
          const want = Math.atan2(-dx, -dz);
          n.yaw += wrap(want - n.yaw) * Math.min(1, dt * 5);
          moving = 1;
        } else {
          this.agataLeg = (this.agataLeg + 1) % path.length;
          this.agataWait = 3.2;
        }
        g.position.set(n.x, 0, n.z);
        g.rotation.y = n.yaw;
        const bob = moving ? Math.abs(Math.sin(t * 7)) * 0.03 : 0;
        rig.body.position.y = bob;
        rig.torso.rotation.z = moving ? Math.sin(t * 7) * 0.04 : 0;
        rig.armR.rotation.set(0.5 + lighting * 1.5, 0, 0.1);
        rig.foreR.rotation.x = 0.6 - lighting * 0.4;
        rig.armL.rotation.set(0.9, 0, -0.5);
        rig.foreL.rotation.x = 1.3;
        tg.material.opacity = 0.5 + Math.sin(t * 14) * 0.08;
        flame.material.map!.offset.x = (Math.floor(t * 10) % 4) * 0.25;
      },
    };
  }

  // ---------------------------------------------------------- кот Уголёк
  private buildCat(n: Npc): Resident {
    const g = this.place(n);
    const p = this.probe(n.x, n.z);
    p.value.lerp(new THREE.Color(1.1, 0.6, 0.3), 0.3);
    // подстилка из шкуры
    const fur = litMaterial({ color: "#c0b090", probe: p });
    const rug = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.04, 9), fur);
    rug.position.y = 0.02;
    rug.scale.z = 0.7;
    g.add(rug);
    const cat = new THREE.Group();
    cat.position.y = 0.04;
    g.add(cat);
    const black = litMaterial({ color: "#221c1e", probe: p });
    cat.scale.setScalar(1.6);
    const body = box(0.2, 0.15, 0.36, black, 0, 0.09, 0, cat);
    box(0.12, 0.08, 0.06, litMaterial({ color: "#d8d0c4", probe: p }), 0, 0.06, -0.17, cat);
    const head = new THREE.Group();
    head.position.set(0, 0.12, -0.2);
    cat.add(head);
    box(0.15, 0.12, 0.13, black, 0, 0, 0, head);
    for (const sx of [-0.05, 0.05]) box(0.04, 0.06, 0.03, black, sx, 0.08, 0.01, head, 0, 0, sx > 0 ? -0.2 : 0.2);
    const eyeM = basic("#e0c040");
    const eyes = [box(0.03, 0.008, 0.01, eyeM, -0.035, 0.015, -0.066, head), box(0.03, 0.008, 0.01, eyeM, 0.035, 0.015, -0.066, head)];
    box(0.02, 0.015, 0.01, basic("#c87a8a"), 0, -0.02, -0.068, head);
    const tail: THREE.Group[] = [];
    let parent: THREE.Object3D = cat;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0.08 : 0, i === 0 ? 0.18 : 0.08);
      parent.add(seg);
      box(0.04, 0.04, 0.09, black, 0, 0, 0.04, seg);
      tail.push(seg);
      parent = seg;
    }
    return {
      npc: n, root: g, headYaw: 0, lookK: 0, barkAt: 0,
      update: (t) => {
        const awake = t < this.petUntil ? 1 : 0;
        // спит клубком; от поглаживания поднимает голову и мурлычет
        body.scale.y = 1 + Math.sin(t * 2.2) * 0.06 * (1 - awake);
        head.position.y = 0.12 + awake * 0.08;
        head.rotation.x = awake ? -0.3 : 0.25;
        head.rotation.y = awake ? Math.sin(t * 2) * 0.2 : 0.5;
        for (const e of eyes) e.scale.y = awake ? 4 : 1;
        tail.forEach((s, i) => {
          s.rotation.y = awake ? Math.sin(t * 3 + i) * 0.25 : -0.45 - Math.sin(t * 0.6) * 0.04 * i;
          s.rotation.x = awake ? -0.25 : 0;
        });
      },
    };
  }

  /** Погладить кота: просыпается и мурлычет. */
  petCat(t: number) {
    this.petUntil = t + 3.5;
    const cat = this.residents.find((r) => r.npc.kind === "cat");
    if (cat) audio.play("purr", { x: cat.npc.x, z: cat.npc.z }, 1);
  }

  // ---------------------------------------------------------- костёр, подсвечники, дыра в крыше
  private buildCampfire() {
    const x = c(CAMPFIRE.x), z = c(CAMPFIRE.z);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.group.add(g);
    const p = this.probe(x, z);
    const stone = litMaterial({ color: "#5a5048", map: stoneTexture("#5a5048"), probe: p });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      box(0.26, 0.18, 0.22, stone, Math.cos(a) * 0.62, 0.09, Math.sin(a) * 0.62, g, 0, a, 0);
    }
    const logM = litMaterial({ color: "#4a3020", map: woodTexture(), probe: p });
    for (let i = 0; i < 3; i++) cyl(0.07, 0.08, 0.8, 6, logM, 0, 0.12, 0, g, 0.25, (i / 3) * Math.PI, Math.PI / 2);
    box(0.6, 0.05, 0.6, basic("#ff5a1a"), 0, 0.1, 0, g, 0, 0.4);
    this.level.addFlame(new THREE.Vector3(x, 0.15, z), 2.4);
    this.level.addFlame(new THREE.Vector3(x + 0.18, 0.1, z - 0.1), 1.2);
    // тренога с котелком
    const iron = litMaterial({ color: "#3a3a3e", map: metalTexture("#3a3a3e"), probe: p });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      box(0.04, 1.5, 0.04, iron, Math.cos(a) * 0.45, 0.72, Math.sin(a) * 0.45, g, Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32);
    }
    box(0.01, 0.4, 0.01, iron, 0, 1.25, 0, g);
    cyl(0.24, 0.2, 0.26, 9, iron, 0, 0.95, 0, g);
    cyl(0.22, 0.22, 0.02, 9, basic("#6a5030"), 0, 1.08, 0, g);
    this.potAt = new THREE.Vector3(x, 1.15, z);
  }
  private potAt = new THREE.Vector3();

  private buildCandelabras() {
    for (const [cx, cz] of AGATA_PATH) {
      const x = cz < 4 ? c(cx) : cx < 7.5 ? c(3) + 0.45 : c(12) - 0.45;
      const z = cz < 4 ? c(3) + 0.45 : c(cz);
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      const p = this.probe(x, z);
      const iron = litMaterial({ color: "#3a3a3e", map: metalTexture("#3a3a3e"), probe: p });
      cyl(0.2, 0.26, 0.08, 6, iron, 0, 0.04, 0, g);
      box(0.05, 1.5, 0.05, iron, 0, 0.78, 0, g);
      box(0.6, 0.04, 0.05, iron, 0, 1.45, 0, g);
      const wax = litMaterial({ color: "#e8dcc0", probe: p });
      for (const dx of [-0.28, 0, 0.28]) {
        const h = dx === 0 ? 0.26 : 0.18;
        box(0.06, h, 0.06, wax, dx, 1.47 + h / 2 + (dx === 0 ? 0.08 : 0), 0, g);
        this.level.addFlame(new THREE.Vector3(x + dx, 1.5 + h + (dx === 0 ? 0.08 : 0), z), 0.4);
      }
      if (dxIsWall(x)) g.rotation.y = Math.PI / 2;
    }
    function dxIsWall(x: number) { return x < c(4) || x > c(11); }
  }

  private buildRoofHole(): THREE.Points {
    const x = c(ROOF_HOLE.x), z = c(ROOF_HOLE.z), r = c(ROOF_HOLE.r) / 2;
    const ceil = 7.55;
    // кусок ночного неба с рваными краями и звёздами
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#0e1a30";
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2, rr = 26 + ((i * 7) % 5) * 1.6 - (i % 3) * 2;
      const px = 32 + Math.cos(a) * rr, py = 32 + Math.sin(a) * rr;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.fill();
    g.fillStyle = "#d8e0ff";
    for (let i = 0; i < 14; i++) g.fillRect(14 + ((i * 37) % 36), 14 + ((i * 53) % 36), 1, 1);
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, fog: false, side: THREE.DoubleSide }));
    sky.rotation.x = Math.PI / 2;
    sky.position.set(x, ceil, z);
    this.group.add(sky);
    // столб лунного света
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.95, r * 1.25, ceil, 20, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 0 } },
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "uniform float uT; varying vec2 vUv; void main(){ float a = (0.05 + 0.13 * vUv.y) * (0.8 + 0.2 * sin(vUv.x * 40.0 + uT)); gl_FragColor = vec4(vec3(0.45, 0.58, 0.9) * a, a); }",
      }),
    );
    shaft.position.set(x, ceil / 2, z);
    shaft.name = "shaft";
    this.group.add(shaft);
    // сугроб на полу под дырой
    const snowM = litMaterial({ color: "#a8b0c4", probe: { value: new THREE.Color(0.2, 0.23, 0.32) } });
    const pile = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 1.05, 0.12, 12), snowM);
    pile.position.set(x, 0.03, z);
    pile.scale.set(0.8, 0.5, 0.7);
    this.group.add(pile);
    for (let i = 0; i < 5; i++) box(0.3 + i * 0.05, 0.08, 0.25, snowM, x + Math.cos(i * 1.9) * r * 0.6, 0.14, z + Math.sin(i * 1.9) * r * 0.5, this.group, 0, i, 0);
    // снежинки
    const N = 220;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r * 1.05;
      pos[i * 3] = x + Math.cos(a) * rr;
      pos[i * 3 + 1] = Math.random() * ceil;
      pos[i * 3 + 2] = z + Math.sin(a) * rr;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#e8eeff", size: 0.06, map: glowTexture(), transparent: true, depthWrite: false, opacity: 0.9 }));
    pts.userData = { x, z, r, ceil };
    this.group.add(pts);
    return pts;
  }

  // ---------------------------------------------------------- частицы
  private sparkBurst(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length > 120) break;
      const s = glow(i % 3 ? "#ffb050" : "#ffe0a0", 0.07 + Math.random() * 0.05, 1);
      s.position.copy(at);
      this.group.add(s);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      this.sparks.push({ s, vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * sp, life: 0.4 + Math.random() * 0.4 });
    }
  }

  private puff(at: THREE.Vector3) {
    if (this.puffs.length > 30) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: "#b8b0a8", transparent: true, opacity: 0, depthWrite: false, fog: true }));
    s.position.set(at.x + (Math.random() - 0.5) * 0.2, at.y, at.z + (Math.random() - 0.5) * 0.2);
    s.scale.setScalar(0.25);
    this.group.add(s);
    this.puffs.push({ s, vy: 0.35 + Math.random() * 0.2, life: 2.4, max: 2.4, grow: 0.5 + Math.random() * 0.3 });
  }
  private puffAcc = 0;

  // ---------------------------------------------------------- реплики
  say(n: Npc, text: string, t: number, toLog = true) {
    if (toLog) this.onLine(n, text);
    const old = this.bubbles.get(n.id);
    if (old) {
      this.group.remove(old.sprite);
      old.sprite.material.map?.dispose();
      old.sprite.material.dispose();
    }
    // в мире — только знак «говорит»: мелкий текст в низком разрешении кадра не читается
    const { tex, w, h } = bubbleTexture(n.kind === "cat" ? "♥" : "…");
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    const k = 1 / 110;
    s.scale.set(w * k, h * k, 1);
    s.renderOrder = 20;
    this.group.add(s);
    const life = 3.5 + text.length * 0.04;
    this.bubbles.set(n.id, { sprite: s, life, max: life });
    const r = this.residents.find((x) => x.npc.id === n.id);
    if (r) r.barkAt = t + 25 + Math.random() * 15;
  }

  /** Разговор с жителем без лавки: реплика над головой, кота — гладим. */
  interact(n: Npc, t: number): string | null {
    if (n.kind === "cat") {
      this.petCat(t);
      this.say(n, "Мрррр…", t, false);
      return null;
    }
    const line = n.lines[Math.floor(Math.random() * n.lines.length)];
    if (line) this.say(n, line, t, false);
    return line || null;
  }

  // ---------------------------------------------------------- кадр
  update(t: number, dt: number, px: number, pz: number) {
    this.playerX = px;
    this.playerZ = pz;
    for (const r of this.residents) {
      const n = r.npc;
      const dist = Math.hypot(px - n.x, pz - n.z);
      r.update?.(t, dt, dist);
      // поворачивают голову к герою, когда он рядом
      if (r.rig) {
        const want = Math.atan2(-(px - n.x), -(pz - n.z));
        const local = Math.max(-1.0, Math.min(1.0, wrap(want - n.yaw)));
        r.lookK += ((dist < 6 ? 1 : 0) - r.lookK) * Math.min(1, dt * 3);
        const idle = r.headYaw + Math.sin(t * 0.4 + n.id.length) * 0.25;
        r.rig.head.rotation.y = idle + (local - idle) * r.lookK;
        // свет вокруг жителя меняется, если он ходит
        if (n.kind === "nun") lift(probeAt(this.level.field, n.x, n.z, r.rig.probe.value));
      }
      // бросает реплику, когда герой подходит
      if (n.barks?.length && dist < 4.5 && t > r.barkAt && !this.bubbles.has(n.id)) {
        if (r.barkAt === 0) r.barkAt = t + 0.6;
        else this.say(n, n.barks[Math.floor(Math.random() * n.barks.length)], t);
      }
      const b = this.bubbles.get(n.id);
      if (b) {
        b.life -= dt;
        const top = n.kind === "cat" ? 0.7 : n.kind === "stash" ? 1.6 : n.kind === "merc" ? 1.9 : 2.45;
        b.sprite.position.set(n.x, top + (1 - Math.min(1, (b.max - b.life) * 4)) * -0.1, n.z);
        b.sprite.material.opacity = Math.min(1, b.life * 2, (b.max - b.life) * 5);
        if (b.life <= 0 || dist > 14) {
          this.group.remove(b.sprite);
          b.sprite.material.map?.dispose();
          b.sprite.material.dispose();
          this.bubbles.delete(n.id);
        }
      }
    }
    // искры с наковальни
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vy -= 9 * dt;
      s.s.position.x += s.vx * dt;
      s.s.position.y = Math.max(0.02, s.s.position.y + s.vy * dt);
      s.s.position.z += s.vz * dt;
      s.s.material.opacity = Math.min(1, s.life * 3);
      if (s.life <= 0) {
        this.group.remove(s.s);
        s.s.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
    // пар над котелком
    this.puffAcc += dt;
    if (this.puffAcc > 0.35) { this.puffAcc = 0; this.puff(this.potAt); }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt;
      p.s.position.y += p.vy * dt;
      p.s.position.x += Math.sin(t + i) * 0.05 * dt;
      const k = 1 - p.life / p.max;
      p.s.scale.setScalar(0.25 + k * p.grow);
      p.s.material.opacity = Math.sin(k * Math.PI) * 0.22;
      if (p.life <= 0) {
        this.group.remove(p.s);
        p.s.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
    // треск костра
    const fx = c(CAMPFIRE.x), fz = c(CAMPFIRE.z);
    if (t > this.crackleAt) {
      this.crackleAt = t + 0.4 + Math.random() * 1.6;
      if (Math.hypot(px - fx, pz - fz) < 14) audio.play("crackle", { x: fx, z: fz }, 0.5 + Math.random() * 0.5);
    }
    // снег: падает медленно, кружится, внизу возвращается под крышу
    const pa = this.snow.geometry.getAttribute("position") as THREE.BufferAttribute;
    const u = this.snow.userData as { x: number; z: number; r: number; ceil: number };
    for (let i = 0; i < pa.count; i++) {
      let y = pa.getY(i) - this.snowV[i] * 0.55 * dt;
      let sx = pa.getX(i) + Math.sin(t * 0.9 + i) * 0.12 * dt;
      let sz = pa.getZ(i) + Math.cos(t * 0.7 + i * 1.3) * 0.12 * dt;
      if (y < 0.1) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * u.r * 1.05;
        sx = u.x + Math.cos(a) * rr;
        sz = u.z + Math.sin(a) * rr;
        y = u.ceil;
      }
      pa.setXYZ(i, sx, y, sz);
    }
    pa.needsUpdate = true;
    const shaft = this.group.getObjectByName("shaft") as THREE.Mesh | undefined;
    if (shaft) (shaft.material as THREE.ShaderMaterial).uniforms.uT.value = t * 0.6;
    // пучки трав под навесом покачиваются
    for (const o of this.swaying) o.rotation.z = Math.sin(t * 1.2 + o.userData.sway) * 0.08;
  }

  get playerPos() { return { x: this.playerX, z: this.playerZ }; }
}
