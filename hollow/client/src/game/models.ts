/** Низкополигональные модели: гуманоиды с риггингом, враги, боссы, оружие, декорации. */
import * as THREE from "three";
import { litMaterial } from "./lighting";
import { metalTexture, stoneTexture, woodTexture, glowTexture, flameTexture } from "./textures";
import type { Appearance } from "@shared/data/stats";

export const SKIN = ["#e8c4a0", "#d6a77a", "#b07d52", "#8a5a3a", "#5e3d28", "#c9b8a8"];
export const HAIR_COLORS = ["#1c1410", "#3b2516", "#6b4426", "#a8763a", "#d8c08a", "#8a8a8a", "#e8e4dc", "#6e1f1f"];
export const CLOTH = ["#5a2a24", "#2e3b4f", "#3d4a2a", "#4a3a5a", "#5a4a32", "#2a2a2a", "#6e6a5e", "#1f3a3a"];
export const TRIM = ["#c9a46a", "#a8a8a8", "#7a3a2a", "#3a5a7a", "#d8cdb2", "#5a7a3a", "#8a2a4a", "#2a2a2a"];

type Mat = THREE.MeshLambertMaterial;

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  hand: THREE.Group;
  handL: THREE.Group;
  height: number;
  float: boolean;
  probe: { value: THREE.Color };
  mats: Mat[];
  eyes: THREE.Object3D[];
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent?.add(mesh);
  return mesh;
}

function cyl(rt: number, rb: number, h: number, seg: number, m: THREE.Material, x = 0, y = 0, z = 0, parent?: THREE.Object3D) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  parent?.add(mesh);
  return mesh;
}

function glowEyes(parent: THREE.Object3D, color: string, y: number, z: number, sep: number, size = 0.05) {
  const m = new THREE.MeshBasicMaterial({ color });
  const a = box(size, size, 0.02, m, -sep, y, z, parent);
  const b = box(size, size, 0.02, m, sep, y, z, parent);
  // ореол: глаза светятся в темноте коридора
  const halo = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (const e of [a, b]) {
    const sp = new THREE.Sprite(halo);
    sp.scale.setScalar(size * 4.5);
    e.add(sp);
  }
  return [a, b];
}

interface HumanSpec {
  scale?: number;
  skin: string;
  cloth: string;
  pants?: string;
  trim?: string;
  bony?: boolean;
  robe?: boolean;
  bulk?: number;
  head?: "human" | "skull" | "hood" | "helm" | "crown" | "none";
  hair?: string;
  hairColor?: string;
  eyes?: string;
  armor?: string;
  float?: boolean;
  opacity?: number;
}

/** Гуманоид с суставами. Смотрит в −Z. */
export function humanoid(s: HumanSpec): Rig {
  const probe = { value: new THREE.Color(0.2, 0.18, 0.15) };
  const mats: Mat[] = [];
  const mat = (color: string, map?: THREE.Texture) => {
    const m = litMaterial({ color, map: map ?? null, probe, transparent: (s.opacity ?? 1) < 1, opacity: s.opacity ?? 1 });
    mats.push(m);
    return m;
  };
  const sc = s.scale ?? 1;
  const bulk = s.bulk ?? 1;
  const skin = mat(s.skin);
  const cloth = mat(s.cloth);
  const pants = mat(s.pants ?? s.cloth);
  const trim = mat(s.trim ?? s.cloth);
  const armor = s.armor ? mat(s.armor, metalTexture(s.armor)) : null;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(sc);
  root.add(body);
  const legLen = 0.85;
  const hips = new THREE.Group();
  hips.position.y = legLen;
  body.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);
  const lw = s.bony ? 0.07 : 0.15 * bulk;
  const tw = (s.bony ? 0.34 : 0.46) * bulk;
  // торс
  if (s.bony) {
    box(0.08, 0.6, 0.08, skin, 0, 0.3, 0.02, torso);
    for (let i = 0; i < 4; i++) box(0.36 - i * 0.03, 0.04, 0.2, skin, 0, 0.28 + i * 0.09, -0.02, torso);
    box(0.26, 0.08, 0.14, skin, 0, 0.02, 0, torso);
    if (s.cloth !== s.skin) box(0.4, 0.14, 0.24, cloth, 0, 0.04, 0, torso);
  } else {
    box(tw, 0.62, 0.26 * bulk, armor || cloth, 0, 0.32, 0, torso);
    box(tw + 0.02, 0.08, 0.28 * bulk, trim, 0, 0.04, 0, torso);
    if (armor) box(tw * 1.1, 0.12, 0.3 * bulk, armor, 0, 0.58, 0, torso);
  }
  if (s.robe) {
    const robe = cyl(0.22 * bulk, 0.42 * bulk, 0.95, 7, cloth, 0, -0.42, 0, hips);
    robe.scale.z = 0.8;
  }
  // голова
  const head = new THREE.Group();
  head.position.y = 0.66;
  torso.add(head);
  const eyes: THREE.Object3D[] = [];
  const headKind = s.head ?? "human";
  if (headKind !== "none") {
    box(0.08, 0.08, 0.08, skin, 0, 0.04, 0, head);
    if (headKind === "skull") {
      box(0.24, 0.24, 0.26, skin, 0, 0.2, 0, head);
      box(0.18, 0.08, 0.18, skin, 0, 0.06, -0.04, head);
      const hole = new THREE.MeshBasicMaterial({ color: "#100a06" });
      box(0.06, 0.06, 0.02, hole, -0.06, 0.22, -0.13, head);
      box(0.06, 0.06, 0.02, hole, 0.06, 0.22, -0.13, head);
      if (s.eyes) eyes.push(...glowEyes(head, s.eyes, 0.22, -0.14, 0.06, 0.035));
    } else if (headKind === "helm") {
      box(0.3, 0.32, 0.3, armor || trim, 0, 0.2, 0, head);
      box(0.22, 0.04, 0.02, new THREE.MeshBasicMaterial({ color: "#050302" }), 0, 0.22, -0.155, head);
      if (s.eyes) eyes.push(...glowEyes(head, s.eyes, 0.22, -0.16, 0.05, 0.03));
    } else {
      box(0.26, 0.28, 0.26, skin, 0, 0.2, 0, head);
      const eyeM = new THREE.MeshBasicMaterial({ color: s.eyes ?? "#1a1210" });
      const e = [box(0.04, 0.04, 0.02, eyeM, -0.06, 0.22, -0.135, head), box(0.04, 0.04, 0.02, eyeM, 0.06, 0.22, -0.135, head)];
      if (s.eyes) eyes.push(...e);
      if (headKind === "hood") {
        const hood = mat(s.trim ?? s.cloth);
        box(0.34, 0.34, 0.32, hood, 0, 0.24, 0.03, head);
        box(0.34, 0.06, 0.06, hood, 0, 0.42, -0.12, head);
      } else if (s.hair && s.hair !== "bald") hairStyle(head, s.hair, mat(s.hairColor ?? "#3b2516"));
      if (headKind === "crown") crown(head, mat("#c9a46a"));
    }
    if (headKind === "skull" && s.hair === "crown") crown(head, mat("#c9a46a"));
  }
  // руки
  const mkArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(side * (tw / 2 + lw / 2 + 0.02), 0.58, 0);
    torso.add(arm);
    const sleeve = s.bony ? skin : armor || cloth;
    box(lw, 0.34, lw, sleeve, 0, -0.17, 0, arm);
    if (armor && !s.bony) box(lw * 1.5, 0.12, lw * 1.5, armor, 0, -0.02, 0, arm);
    const fore = new THREE.Group();
    fore.position.y = -0.34;
    arm.add(fore);
    box(lw * 0.9, 0.3, lw * 0.9, s.bony ? skin : trim, 0, -0.15, 0, fore);
    box(lw, 0.09, lw, skin, 0, -0.33, 0, fore);
    const hand = new THREE.Group();
    hand.position.y = -0.34;
    fore.add(hand);
    return { arm, hand };
  };
  const R = mkArm(1), L = mkArm(-1);
  // ноги
  const mkLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11 * bulk, 0, 0);
    hips.add(leg);
    const lm = s.bony ? skin : armor || pants;
    box(lw * 1.05, 0.42, lw * 1.05, lm, 0, -0.21, 0, leg);
    box(lw, 0.4, lw, lm, 0, -0.62, 0, leg);
    box(lw * 1.2, 0.08, lw * 1.6, s.bony ? skin : trim, 0, -0.81, -0.04, leg);
    return leg;
  };
  const legR = mkLeg(1), legL = mkLeg(-1);
  if (s.float || s.robe) {
    legL.visible = !s.float && !s.robe;
    legR.visible = !s.float && !s.robe;
  }
  root.traverse((o) => {
    o.castShadow = false;
  });
  return { root, body, hips, torso, head, armL: L.arm, armR: R.arm, legL, legR, hand: R.hand, handL: L.hand, height: 1.8 * sc, float: !!s.float, probe, mats, eyes };
}

function hairStyle(head: THREE.Group, kind: string, m: THREE.Material) {
  if (kind === "short") box(0.28, 0.08, 0.28, m, 0, 0.37, 0.01, head);
  if (kind === "long") {
    box(0.28, 0.08, 0.28, m, 0, 0.37, 0.01, head);
    box(0.28, 0.36, 0.08, m, 0, 0.18, 0.14, head);
  }
  if (kind === "braid") {
    box(0.28, 0.08, 0.28, m, 0, 0.37, 0.01, head);
    box(0.08, 0.5, 0.08, m, 0, 0.1, 0.17, head);
  }
  if (kind === "mohawk") box(0.06, 0.14, 0.3, m, 0, 0.42, 0.01, head);
  if (kind === "hood") {
    box(0.34, 0.34, 0.32, m, 0, 0.24, 0.03, head);
  }
}

function crown(head: THREE.Group, m: THREE.Material) {
  box(0.3, 0.06, 0.3, m, 0, 0.36, 0, head);
  for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12], [0, -0.14]]) box(0.04, 0.12, 0.04, m, x, 0.44, z, head);
}

// ------------------------------------------------------------------ оружие
/** Оружие с рукоятью в начале координат, клинок вдоль +Y. */
export function makeWeapon(iconIn: string, probe?: { value: THREE.Color }): THREE.Group {
  const icon = iconIn === "skull" ? "focus" : iconIn === "symbol" ? "holy" : iconIn;
  const g = new THREE.Group();
  const m = (color: string, map?: THREE.Texture) => litMaterial({ color, map: map ?? null, probe });
  const steel = m("#b8bcc4", metalTexture("#9a9ea6"));
  const dark = m("#3a2a1e", woodTexture());
  const gold = m("#c9a46a");
  switch (icon) {
    case "sword":
      box(0.05, 0.2, 0.05, dark, 0, 0, 0, g);
      box(0.24, 0.04, 0.06, gold, 0, 0.11, 0, g);
      box(0.07, 0.75, 0.02, steel, 0, 0.5, 0, g);
      box(0.04, 0.08, 0.02, steel, 0, 0.9, 0, g);
      break;
    case "axe":
      box(0.05, 0.7, 0.05, dark, 0, 0.25, 0, g);
      box(0.04, 0.24, 0.24, steel, 0, 0.52, -0.1, g);
      break;
    case "mace":
      box(0.05, 0.6, 0.05, dark, 0, 0.22, 0, g);
      box(0.16, 0.16, 0.16, steel, 0, 0.56, 0, g);
      for (const [x, z] of [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]]) box(0.06, 0.06, 0.06, steel, x, 0.56, z, g);
      break;
    case "dagger":
      box(0.04, 0.13, 0.04, dark, 0, 0, 0, g);
      box(0.12, 0.03, 0.04, gold, 0, 0.07, 0, g);
      box(0.05, 0.32, 0.015, steel, 0, 0.24, 0, g);
      break;
    case "bow": {
      const wood = m("#6b4a2a", woodTexture());
      box(0.04, 0.12, 0.04, dark, 0, 0, 0, g);
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32;
        const seg = box(0.035, 0.24, 0.035, wood, 0, Math.sin(a) * 0.55, -Math.cos(a) * 0.25 + 0.25, g);
        seg.rotation.x = a;
      }
      box(0.005, 1.05, 0.005, new THREE.MeshBasicMaterial({ color: "#d8cdb2" }), 0, 0, 0.2, g);
      break;
    }
    case "staff":
      box(0.05, 1.5, 0.05, m("#5a3f26", woodTexture()), 0, 0.35, 0, g);
      box(0.12, 0.12, 0.12, gold, 0, 1.1, 0, g);
      {
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: "#9ad0ff" }));
        orb.position.y = 1.22;
        orb.name = "orb";
        g.add(orb);
      }
      break;
    case "wand":
      box(0.035, 0.42, 0.035, m("#d8cdb2"), 0, 0.12, 0, g);
      {
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), new THREE.MeshBasicMaterial({ color: "#9aff9a" }));
        orb.position.y = 0.36;
        orb.name = "orb";
        g.add(orb);
      }
      break;
    case "shield": {
      const wood = m("#5a3f26", woodTexture());
      box(0.5, 0.62, 0.05, wood, 0, 0, 0, g);
      box(0.54, 0.05, 0.06, steel, 0, 0.3, 0, g);
      box(0.54, 0.05, 0.06, steel, 0, -0.3, 0, g);
      box(0.12, 0.12, 0.08, steel, 0, 0, -0.03, g);
      break;
    }
    case "tome":
      box(0.24, 0.3, 0.08, m("#5a2a24"), 0, 0, 0, g);
      box(0.2, 0.26, 0.085, m("#d8cdb2"), 0.01, 0, 0, g);
      break;
    case "focus":
      box(0.16, 0.16, 0.18, m("#d8cdb2"), 0, 0, 0, g);
      box(0.04, 0.04, 0.02, new THREE.MeshBasicMaterial({ color: "#7aff9a" }), -0.04, 0.02, -0.095, g);
      box(0.04, 0.04, 0.02, new THREE.MeshBasicMaterial({ color: "#7aff9a" }), 0.04, 0.02, -0.095, g);
      break;
    case "holy":
      box(0.04, 0.36, 0.04, gold, 0, 0, 0, g);
      box(0.22, 0.04, 0.04, gold, 0, 0.08, 0, g);
      break;
    default:
      break;
  }
  return g;
}

// ------------------------------------------------------------------ враги
export interface EnemyModel {
  rig: Rig;
  weapon?: THREE.Group;
  shield?: THREE.Group;
  extra?: THREE.Object3D;
}

export function makeEnemy(type: string, elite?: string): EnemyModel {
  let rig: Rig;
  let weapon: THREE.Group | undefined;
  let shield: THREE.Group | undefined;
  let extra: THREE.Object3D | undefined;
  const bone = "#d8cfb8";
  switch (type) {
    case "skeleton":
    case "summoned_skeleton":
      rig = humanoid({ skin: bone, cloth: type === "skeleton" ? "#4a3a2a" : bone, bony: true, head: "skull", eyes: type === "summoned_skeleton" ? "#7aff9a" : "#ff6a2a" });
      weapon = makeWeapon(type === "skeleton" ? "sword" : "axe", rig.probe);
      break;
    case "zombie":
      rig = humanoid({ skin: "#8a9a7a", cloth: "#4a4038", pants: "#3a3028", head: "human", hair: "short", hairColor: "#2a2420", eyes: "#d8d860" });
      break;
    case "undead_knight":
      rig = humanoid({ skin: "#6a6a62", cloth: "#2e2a26", armor: "#7a7a7e", head: "helm", eyes: "#6ac8ff", bulk: 1.1 });
      weapon = makeWeapon("sword", rig.probe);
      shield = makeWeapon("shield", rig.probe);
      break;
    case "cultist":
      rig = humanoid({ skin: "#c9a88a", cloth: "#5a1a1e", trim: "#3a0e10", robe: true, head: "hood", eyes: "#ff3a2a" });
      weapon = makeWeapon("dagger", rig.probe);
      break;
    case "wraith":
      rig = humanoid({ skin: "#9aa8b0", cloth: "#1a1c24", trim: "#101218", robe: true, head: "hood", eyes: "#9adfff", float: true, opacity: 0.72 });
      break;
    case "abomination":
      rig = abomination("#9a7a6a", "#6a3a32", 1.45);
      break;
    case "bone_priest":
      rig = humanoid({ skin: bone, cloth: "#3a2a4a", trim: "#c9a46a", bony: true, robe: true, head: "skull", hair: "crown", eyes: "#b06aff", scale: 1.65 });
      weapon = makeWeapon("staff", rig.probe);
      break;
    case "hollow_knight":
      rig = humanoid({ skin: "#3a3a3a", cloth: "#1a1818", armor: "#4a4a50", head: "helm", eyes: "#ffefd0", scale: 1.75, bulk: 1.2 });
      weapon = makeWeapon("sword", rig.probe);
      weapon.scale.setScalar(1.6);
      break;
    case "forgotten_saint":
      rig = humanoid({ skin: "#e8e0d8", cloth: "#d8cdb2", trim: "#c9a46a", robe: true, head: "hood", eyes: "#fff3b0", float: true, scale: 1.7 });
      {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 4, 16), new THREE.MeshBasicMaterial({ color: "#ffe9a0" }));
        halo.position.set(0, 0.32, 0.18);
        rig.head.add(halo);
        extra = halo;
      }
      break;
    case "blood_abomination":
      rig = abomination("#8a2a2a", "#4a0e10", 2.0, true);
      break;
    default:
      rig = humanoid({ skin: bone, cloth: "#333", bony: true, head: "skull" });
  }
  if (weapon) rig.hand.add(weapon), weapon.rotation.x = -Math.PI / 2;
  if (shield) {
    rig.handL.add(shield);
    shield.position.set(-0.06, 0.05, -0.12);
    shield.rotation.y = Math.PI / 2;
  }
  if (elite) {
    const c = elite === "furious" ? "#ff5a2a" : elite === "stone" ? "#9a9a9a" : "#b04aff";
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    aura.scale.set(2.2, 2.6, 1);
    aura.position.y = 1;
    rig.root.add(aura);
    rig.body.scale.multiplyScalar(1.12);
  }
  return { rig, weapon, shield, extra };
}

function abomination(skinC: string, darkC: string, scale: number, spikes = false): Rig {
  const rig = humanoid({ skin: skinC, cloth: darkC, head: "none", scale, bulk: 1.5 });
  // раздутое брюхо и маленькая голова
  const flesh = rig.mats[0];
  const belly = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 0), flesh);
  belly.position.set(0, 0.3, -0.08);
  belly.scale.set(1.1, 1, 1);
  rig.torso.add(belly);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), flesh);
  head.position.set(0, 0.2, -0.12);
  rig.head.add(head);
  rig.eyes.push(...glowEyes(rig.head, spikes ? "#ff2a1a" : "#e0e040", 0.22, -0.26, 0.06, 0.04));
  const stitch = new THREE.MeshBasicMaterial({ color: "#2a1210" });
  for (let i = 0; i < 4; i++) box(0.02, 0.02, 0.3, stitch, 0, 0.1 + i * 0.12, -0.5, rig.torso);
  // огромные руки
  rig.armL.scale.set(1.5, 1.25, 1.5);
  rig.armR.scale.set(1.5, 1.25, 1.5);
  if (spikes) {
    const bone = litMaterial({ color: "#e0d0b0", probe: rig.probe });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 4), bone);
      s.position.set((i % 3 - 1) * 0.2, 0.35 + Math.floor(i / 3) * 0.25, 0.28);
      s.rotation.x = 0.9;
      rig.torso.add(s);
    }
  }
  return rig;
}

// ------------------------------------------------------------------ персонаж игрока
export function makeAvatar(cls: string, app: Appearance): Rig {
  const skin = SKIN[app.skin] || SKIN[0];
  const cloth = CLOTH[app.cloth] || CLOTH[0];
  const trim = TRIM[app.trim] || TRIM[0];
  const spec: HumanSpec = { skin, cloth, trim, head: "human", hair: app.hair, hairColor: HAIR_COLORS[app.hairColor] || HAIR_COLORS[0] };
  if (cls === "knight") Object.assign(spec, { armor: "#8a8d92", bulk: 1.05 });
  if (cls === "warrior") Object.assign(spec, { bulk: 1.1, pants: "#3a2a1e" });
  if (cls === "mage" || cls === "necromancer") Object.assign(spec, { robe: true });
  if (cls === "cleric") Object.assign(spec, { robe: true, trim: "#d8cdb2" });
  if (app.hair === "hood") Object.assign(spec, { head: "hood" });
  const rig = humanoid(spec);
  const acc = app.accessory;
  const dark = new THREE.MeshBasicMaterial({ color: "#1a1210" });
  if (acc === "eyepatch") box(0.28, 0.03, 0.02, dark, 0, 0.24, -0.135, rig.head), box(0.06, 0.06, 0.02, dark, 0.06, 0.22, -0.14, rig.head);
  if (acc === "scar") box(0.02, 0.14, 0.02, new THREE.MeshBasicMaterial({ color: "#8a3a3a" }), -0.07, 0.2, -0.135, rig.head);
  if (acc === "paint") box(0.24, 0.04, 0.02, new THREE.MeshBasicMaterial({ color: "#8a1a1a" }), 0, 0.24, -0.135, rig.head);
  if (acc === "beard") box(0.24, 0.14, 0.06, litMaterial({ color: spec.hairColor!, probe: rig.probe }), 0, 0.08, -0.12, rig.head);
  if (acc === "mask") box(0.27, 0.1, 0.02, litMaterial({ color: "#d8cdb2", probe: rig.probe }), 0, 0.12, -0.14, rig.head);
  return rig;
}

export function setAvatarWeapons(rig: Rig, weapon: string, offhand: string) {
  for (const h of [rig.hand, rig.handL]) for (const c of [...h.children]) if (c.name === "held") h.remove(c);
  if (weapon && weapon !== "fist") {
    const w = makeWeapon(weapon, rig.probe);
    w.name = "held";
    w.rotation.x = weapon === "bow" ? 0 : -Math.PI / 2;
    rig.hand.add(w);
  }
  if (offhand) {
    const o = makeWeapon(offhand, rig.probe);
    o.name = "held";
    if (offhand === "shield") {
      o.position.set(-0.06, 0.05, -0.12);
      o.rotation.y = Math.PI / 2;
    }
    rig.handL.add(o);
  }
}

// ------------------------------------------------------------------ анимация
export interface PoseState {
  t: number;
  moving: number;
  phase: number;
  state: string;
  st: number;
  atk: string;
  dead: number;
  stun: boolean;
  block?: boolean;
  bow?: boolean;
}

export function poseRig(rig: Rig, p: PoseState) {
  const sw = Math.sin(p.phase) * 0.6 * p.moving;
  rig.legL.rotation.x = sw;
  rig.legR.rotation.x = -sw;
  rig.armL.rotation.set(-sw * 0.6, 0, 0);
  rig.armR.rotation.set(sw * 0.6, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.hips.position.y = 0.85 + Math.abs(Math.cos(p.phase)) * 0.04 * p.moving;
  rig.body.position.y = rig.float ? 0.25 + Math.sin(p.t * 2) * 0.08 : 0;
  rig.head.rotation.set(0, 0, 0);
  if (p.state === "idle" && !p.moving) {
    rig.torso.rotation.x = Math.sin(p.t * 1.3) * 0.03;
  }
  if (p.state === "windup") {
    const k = Math.min(1, 1 - p.st / 0.6);
    if (p.atk === "bolt" || p.atk === "volley" || p.atk === "summon" || p.atk === "pillars" || p.atk === "halo" || p.atk === "roar") {
      rig.armR.rotation.x = -2.6 * k;
      rig.armL.rotation.x = -2.6 * k;
      rig.torso.rotation.x = 0.15 * k;
    } else if (p.atk === "slam" || p.atk === "quake" || p.atk === "leap") {
      rig.armR.rotation.x = -2.9 * k;
      rig.armL.rotation.x = -2.9 * k;
      rig.torso.rotation.x = 0.25 * k;
    } else if (p.atk === "charge" || p.atk === "lunge") {
      rig.torso.rotation.x = -0.5 * k;
      rig.armR.rotation.x = -1.2 * k;
    } else {
      rig.armR.rotation.x = -2.3 * k;
      rig.armR.rotation.z = -0.4 * k;
      rig.torso.rotation.y = 0.4 * k;
    }
  } else if (p.state === "recover") {
    rig.armR.rotation.x = 0.9;
    rig.armL.rotation.x = 0.4;
    rig.torso.rotation.x = -0.1;
    rig.torso.rotation.y = -0.3;
  } else if (p.state === "lunge") {
    rig.torso.rotation.x = -0.45;
    rig.armR.rotation.x = -1.5;
    rig.armL.rotation.x = -1.5;
  } else if (p.state === "chase" && rig.float) {
    rig.armR.rotation.x = -1.2;
    rig.armL.rotation.x = -1.2;
  }
  if (p.block) {
    rig.armL.rotation.x = -1.3;
    rig.armL.rotation.y = 0.5;
  }
  if (p.bow) {
    rig.armL.rotation.x = -1.55;
    rig.armR.rotation.x = -1.55;
    rig.armR.rotation.z = 0.3;
  }
  if (p.stun) {
    rig.head.rotation.z = Math.sin(p.t * 6) * 0.3;
    rig.torso.rotation.x = 0.3;
  }
  if (p.dead > 0) {
    const k = Math.min(1, p.dead / 0.5);
    rig.root.rotation.x = 0;
    rig.body.rotation.x = (Math.PI / 2) * k * 0.98;
    rig.body.position.y = rig.float ? -0.3 * k : 0.12 * k;
    rig.armR.rotation.x = -2.5 * k;
    rig.armL.rotation.x = -2.2 * k;
  } else rig.body.rotation.x = 0;
}

// ------------------------------------------------------------------ декорации
const propMats = new Map<string, THREE.Material>();
/** Общие материалы декораций — чтобы потом склеить геометрию в несколько мешей. */
export function propMat(key: string, make: () => THREE.Material): THREE.Material {
  let m = propMats.get(key);
  if (!m) {
    m = make();
    propMats.set(key, m);
  }
  return m;
}

export interface PropBuild {
  obj: THREE.Object3D;
  flames?: THREE.Vector3[];
}

export function makeProp(kind: string, palette: { wall: string; accent: string }): PropBuild {
  const g = new THREE.Group();
  const flames: THREE.Vector3[] = [];
  const stone = propMat(`stone:${palette.wall}`, () => litMaterial({ color: palette.wall, map: stoneTexture(palette.wall), baked: true }));
  const bone = propMat("bone", () => litMaterial({ color: "#d8cfb8", baked: true }));
  const wood = propMat("wood", () => litMaterial({ color: "#8a6a4a", map: woodTexture(), baked: true }));
  const iron = propMat("iron", () => litMaterial({ color: "#5a5a5e", map: metalTexture("#5a5a5e"), baked: true }));
  const wax = propMat("wax", () => litMaterial({ color: "#e8dcc0", baked: true }));
  const accent = propMat(`accent:${palette.accent}`, () => litMaterial({ color: palette.accent, baked: true, side: THREE.DoubleSide }));
  const hole = propMat("hole", () => new THREE.MeshBasicMaterial({ color: "#0a0705" }));
  const skull = (x: number, y: number, z: number, s = 1) => {
    box(0.22 * s, 0.2 * s, 0.24 * s, bone, x, y, z, g);
    box(0.05 * s, 0.05 * s, 0.02, hole, x - 0.05 * s, y + 0.02 * s, z - 0.12 * s, g);
    box(0.05 * s, 0.05 * s, 0.02, hole, x + 0.05 * s, y + 0.02 * s, z - 0.12 * s, g);
  };
  switch (kind) {
    case "torch":
      box(0.08, 0.5, 0.08, wood, 0, 2.4, -0.15, g).rotation.x = -0.35;
      box(0.16, 0.12, 0.16, iron, 0, 2.66, -0.25, g);
      flames.push(new THREE.Vector3(0, 2.9, -0.26));
      break;
    case "shelves":
      // ниши с черепами, как на референсе
      for (let row = 0; row < 3; row++) {
        const y = 0.5 + row * 1.15;
        box(2.6, 0.1, 0.55, stone, 0, y, -0.28, g);
        for (let i = 0; i < 5; i++) if ((row * 7 + i * 3) % 4 !== 0) skull(-1 + i * 0.5, y + 0.15, -0.3, 0.9);
        box(2.4, 0.08, 0.1, bone, 0, y + 0.06, -0.5, g);
      }
      box(0.12, 3.4, 0.6, stone, -1.3, 1.7, -0.3, g);
      box(0.12, 3.4, 0.6, stone, 1.3, 1.7, -0.3, g);
      break;
    case "niche":
      box(1.2, 0.1, 0.45, stone, 0, 1.2, -0.22, g);
      skull(0, 1.37, -0.25, 1.1);
      box(0.12, 0.16, 0.12, wax, 0.35, 1.33, -0.25, g);
      flames.push(new THREE.Vector3(0.35, 1.5, -0.25));
      break;
    case "pillar":
      box(1.2, 0.3, 1.2, stone, 0, 0.15, 0, g);
      cyl(0.45, 0.5, 4.2, 8, stone, 0, 2.3, 0, g);
      box(1.2, 0.3, 1.2, stone, 0, 4.4, 0, g);
      break;
    case "sarcophagus":
      box(1.0, 0.8, 2.1, stone, 0, 0.4, 0, g);
      box(1.1, 0.14, 2.2, stone, 0, 0.87, 0, g);
      box(0.5, 0.08, 1.4, accent, 0, 0.97, 0.05, g);
      break;
    case "brazier":
      cyl(0.08, 0.12, 0.9, 6, iron, 0, 0.45, 0, g);
      cyl(0.42, 0.22, 0.3, 8, iron, 0, 1.0, 0, g);
      box(0.5, 0.06, 0.5, propMat("coals", () => new THREE.MeshBasicMaterial({ color: "#ff7a2a" })), 0, 1.14, 0, g);
      flames.push(new THREE.Vector3(0, 1.45, 0));
      break;
    case "candles":
      for (let i = 0; i < 4; i++) {
        const x = Math.cos(i * 1.7) * 0.22, z = Math.sin(i * 1.7) * 0.22, h = 0.15 + (i % 3) * 0.1;
        box(0.07, h, 0.07, wax, x, h / 2, z, g);
        flames.push(new THREE.Vector3(x, h + 0.08, z));
      }
      break;
    case "bones":
      for (let i = 0; i < 6; i++) {
        const b = box(0.5, 0.06, 0.07, bone, Math.cos(i * 2.1) * 0.3, 0.04, Math.sin(i * 2.1) * 0.3, g);
        b.rotation.y = i * 1.3;
      }
      skull(0.1, 0.11, 0.05);
      break;
    case "skulls":
      skull(0, 0.1, 0);
      skull(0.25, 0.1, 0.1);
      skull(0.12, 0.3, 0.04);
      break;
    case "urn":
      {
        const clay = propMat("clay", () => litMaterial({ color: "#7a5a3a", baked: true }));
        cyl(0.2, 0.25, 0.6, 7, clay, 0, 0.3, 0, g);
        cyl(0.12, 0.2, 0.15, 7, clay, 0, 0.67, 0, g);
      }
      break;
    case "pews":
      box(1.6, 0.1, 0.45, wood, 0, 0.45, 0, g);
      box(1.6, 0.6, 0.08, wood, 0, 0.75, 0.2, g);
      box(0.08, 0.45, 0.4, wood, -0.75, 0.22, 0, g);
      box(0.08, 0.45, 0.4, wood, 0.75, 0.22, 0, g);
      break;
    case "altar":
      box(2.0, 1.0, 1.2, stone, 0, 0.5, 0, g);
      box(2.2, 0.12, 1.3, stone, 0, 1.06, 0, g);
      box(1.9, 0.03, 0.5, accent, 0, 1.13, 0, g);
      for (const x of [-0.8, 0.8]) {
        box(0.08, 0.3, 0.08, wax, x, 1.27, 0, g);
        flames.push(new THREE.Vector3(x, 1.48, 0));
      }
      break;
    case "banner":
      box(0.06, 0.06, 1.6, iron, 0, 3.6, 0, g);
      box(0.04, 2.2, 1.2, accent, 0, 2.5, 0, g);
      break;
    case "chains":
      for (let i = 0; i < 8; i++) box(0.06, 0.18, 0.06, iron, Math.sin(i) * 0.03, 4.4 - i * 0.2, 0, g).rotation.y = (i % 2) * 1.57;
      box(0.2, 0.2, 0.06, iron, 0, 2.7, 0, g);
      break;
    case "shrine":
      box(1.0, 0.4, 1.0, stone, 0, 0.2, 0, g);
      cyl(0.25, 0.32, 1.0, 6, stone, 0, 0.9, 0, g);
      {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: "#7fe0b0" }));
        gem.position.y = 1.7;
        gem.name = "gem";
        g.add(gem);
      }
      break;
    case "portal": {
      // арка входа в лагерь
      box(0.4, 3.2, 0.5, stone, -1.2, 1.6, 0, g);
      box(0.4, 3.2, 0.5, stone, 1.2, 1.6, 0, g);
      box(2.8, 0.4, 0.5, stone, 0, 3.3, 0, g);
      const veil = new THREE.Mesh(
        new THREE.PlaneGeometry(2.0, 3.0),
        new THREE.MeshBasicMaterial({ color: "#5f8fd8", transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      veil.position.set(0, 1.5, 0);
      veil.name = "veil";
      g.add(veil);
      break;
    }
    default:
      break;
  }
  return { obj: g, flames };
}

/** Сундук: корпус + крышка на петле. */
export function makeChest(tier: string, probe: { value: THREE.Color } = { value: new THREE.Color(0.35, 0.28, 0.2) }): { obj: THREE.Group; lid: THREE.Group } {
  const g = new THREE.Group();
  const wood = litMaterial({ color: tier === "boss" ? "#5a3a5a" : "#8a6a4a", map: woodTexture(), probe });
  const iron = litMaterial({ color: tier === "chest" ? "#6a6a6e" : "#c9a46a", map: metalTexture("#8a8a8e"), probe });
  box(1.1, 0.6, 0.7, wood, 0, 0.3, 0, g);
  box(1.14, 0.08, 0.74, iron, 0, 0.1, 0, g);
  const lid = new THREE.Group();
  lid.position.set(0, 0.6, 0.35);
  g.add(lid);
  box(1.1, 0.25, 0.7, wood, 0, 0.12, -0.35, lid);
  box(1.14, 0.06, 0.74, iron, 0, 0.2, -0.35, lid);
  box(0.14, 0.18, 0.04, iron, 0, 0.02, -0.72, lid);
  return { obj: g, lid };
}

/** Спрайт пламени (кадр выбирается смещением UV). */
export function makeFlame(scale = 1): THREE.Sprite {
  const tex = flameTexture().clone();
  tex.repeat.set(0.25, 1);
  tex.needsUpdate = true;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(0.35 * scale, 0.55 * scale, 1);
  return s;
}
