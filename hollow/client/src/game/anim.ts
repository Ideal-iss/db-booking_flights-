/**
 * Анимации врагов: у каждого типа своя походка, манера стоять, набор ударов,
 * реакция на удар, «заметил игрока» и несколько вариантов смерти.
 * Всё процедурное: позы суставов считаются каждый кадр из состояния симуляции.
 */
import type { Rig } from "./models";

type Gait = "walk" | "shamble" | "march" | "stalk" | "skitter" | "stomp" | "float" | "hop" | "prowl";
type Melee = "chop" | "sweep" | "thrust" | "claw" | "double" | "bite" | "bash" | "stab";
type Cast = "raise" | "point" | "staff" | "bow";
type Death = "back" | "forward" | "knees" | "crumble" | "dissolve" | "topple" | "spin";
type Notice = "rattle" | "moan" | "salute" | "point" | "roar" | "hiss" | "snap" | "none";
type Fidget = "look" | "shrug" | "twitch" | "weapon" | "scratch" | "sway" | "breathe";

export interface AnimStyle {
  gait: Gait;
  melee: Melee[];
  cast: Cast;
  death: Death[];
  notice: Notice;
  fidgets: Fidget[];
  /** Держит щит перед собой в бою. */
  shield?: boolean;
}

const S = (gait: Gait, melee: Melee[], cast: Cast, death: Death[], notice: Notice, fidgets: Fidget[], shield = false): AnimStyle => ({ gait, melee, cast, death, notice, fidgets, shield });

export const STYLES: Record<string, AnimStyle> = {
  skeleton: S("skitter", ["chop", "sweep", "thrust"], "point", ["crumble", "back", "crumble"], "rattle", ["look", "twitch", "weapon"]),
  summoned_skeleton: S("skitter", ["chop", "sweep"], "point", ["crumble"], "rattle", ["look", "weapon"]),
  summoned_mage: S("stalk", ["claw"], "staff", ["crumble"], "rattle", ["look"]),
  zombie: S("shamble", ["claw", "double", "bite"], "point", ["forward", "knees", "spin"], "moan", ["twitch", "sway", "scratch"]),
  undead_knight: S("march", ["chop", "thrust", "bash"], "point", ["knees", "back"], "salute", ["weapon", "look"], true),
  cultist: S("stalk", ["stab", "sweep"], "point", ["back", "spin", "knees"], "point", ["look", "scratch", "shrug"]),
  wraith: S("float", ["claw", "sweep"], "raise", ["dissolve"], "hiss", ["sway"]),
  abomination: S("stomp", ["double", "claw"], "raise", ["topple", "forward"], "roar", ["breathe", "scratch"]),
  skeleton_archer: S("stalk", ["bash"], "bow", ["crumble", "back"], "rattle", ["look", "twitch"]),
  necromancer: S("stalk", ["stab"], "raise", ["knees", "back"], "point", ["look", "breathe"]),
  phantom: S("float", ["claw"], "raise", ["dissolve"], "hiss", ["sway", "look"]),
  mimic: S("hop", ["bite"], "raise", ["topple"], "snap", ["twitch"]),
  bone_priest: S("walk", ["chop", "sweep"], "raise", ["crumble"], "roar", ["breathe", "look"]),
  hollow_knight: S("march", ["chop", "sweep", "thrust"], "staff", ["knees"], "salute", ["weapon", "breathe"]),
  forgotten_saint: S("float", ["sweep", "claw"], "raise", ["dissolve"], "roar", ["sway"]),
  blood_abomination: S("stomp", ["double", "claw", "bite"], "raise", ["topple"], "roar", ["breathe"]),
  the_hollow: S("march", ["chop", "sweep", "thrust"], "raise", ["dissolve"], "roar", ["breathe", "look"]),
  clay_golem: S("stomp", ["double", "chop"], "raise", ["crumble"], "roar", ["breathe"]),
  blood_golem: S("stomp", ["double", "claw"], "raise", ["crumble"], "roar", ["breathe"]),
  shadow_clone: S("prowl", ["stab", "sweep", "thrust"], "point", ["dissolve"], "none", ["look"]),
  guardian_spirit: S("float", ["sweep"], "raise", ["dissolve"], "none", ["sway"]),
};
const DEFAULT = STYLES.skeleton;
export const styleOf = (type: string) => STYLES[type] || DEFAULT;

export interface AnimState {
  t: number;
  moving: number;
  phase: number;
  state: string;
  /** Сколько осталось до конца текущего состояния (с). */
  st: number;
  atk: string;
  /** Длительность замаха этого врага. */
  windup: number;
  /** Номер атаки — по нему выбирается вариант удара. */
  variant: number;
  /** С момента смерти (0 — жив). */
  dead: number;
  deathVar: number;
  stun: boolean;
  /** С последнего попадания по врагу (с). */
  hit: number;
  hitSide: number;
  /** С момента, как враг заметил игрока. */
  notice: number;
  /** С момента появления (призыв, подъём из земли). */
  spawn: number;
  fidget: number;
  fidgetKind: number;
  fear: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const k = clamp01(v); return k * k * (3 - 2 * k); };
const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;
/** Падение с маленьким отскоком. */
const fall = (v: number) => {
  const k = clamp01(v);
  if (k < 0.75) return (k / 0.75) ** 2;
  const b = (k - 0.75) / 0.25;
  return 1 - Math.sin(b * Math.PI) * 0.06;
};

function reset(r: Rig) {
  for (const g of [r.body, r.hips, r.torso, r.head, r.armL, r.armR, r.legL, r.legR, r.foreL, r.foreR, r.shinL, r.shinR]) g.rotation.set(0, 0, 0);
  r.body.position.set(0, 0, 0);
  r.hips.position.y = 0.85;
  r.head.position.y = 0.66;
  r.head.position.x = 0;
  r.head.position.z = 0;
  r.root.rotation.x = 0;
}

export function animateEnemy(r: Rig, style: AnimStyle, a: AnimState) {
  reset(r);
  const m = a.moving;
  // ---------------------------------------------------------------- смерть
  if (a.dead > 0) return deathPose(r, style.death[a.deathVar % style.death.length], a.dead, a.t);

  // ---------------------------------------------------------------- походка / стойка
  gait(r, style.gait, a, m);
  if (!m && a.state !== "windup" && a.state !== "recover" && a.state !== "lunge") idle(r, style, a);

  // ---------------------------------------------------------------- бой
  const melee = style.melee[a.variant % style.melee.length];
  if (a.state === "windup") {
    const k = ease(1 - a.st / Math.max(0.2, a.windup));
    attackPose(r, style, a.atk, melee, k, 0);
  } else if (a.state === "recover") {
    const k = easeOut(1 - a.st / Math.max(0.15, a.windup));
    attackPose(r, style, a.atk || "melee", melee, 1, k);
  } else if (a.state === "lunge") {
    r.torso.rotation.x = 0.55;
    r.armR.rotation.x = -1.6;
    r.armL.rotation.x = -1.5;
    r.foreR.rotation.x = -0.2;
    r.legL.rotation.x = -0.8;
    r.shinL.rotation.x = 0.6;
    r.legR.rotation.x = 0.6;
  } else if (a.state === "guard" || (style.shield && a.state === "chase")) {
    r.armL.rotation.x = -1.3;
    r.armL.rotation.y = 0.5;
    r.foreL.rotation.x = -0.6;
  }
  if (a.fear) {
    // в ужасе: руки над головой, бег прочь
    r.armL.rotation.x = -2.6 + Math.sin(a.t * 14) * 0.3;
    r.armR.rotation.x = -2.5 + Math.cos(a.t * 13) * 0.3;
    r.foreL.rotation.x = -0.8;
    r.foreR.rotation.x = -0.8;
    r.head.rotation.y = Math.sin(a.t * 9) * 0.5;
  }

  // ---------------------------------------------------------------- «заметил»
  if (a.notice < 0.9 && style.notice !== "none" && a.state === "chase") noticePose(r, style.notice, a.notice, a.t);

  // ---------------------------------------------------------------- оглушение
  if (a.stun) {
    r.head.rotation.z = Math.sin(a.t * 6) * 0.35;
    r.head.rotation.x = 0.3;
    r.torso.rotation.x = 0.35;
    r.torso.rotation.z = Math.sin(a.t * 3) * 0.12;
    r.armL.rotation.set(0.2, 0, 0.2);
    r.armR.rotation.set(0.2, 0, -0.2);
    r.foreL.rotation.x = r.foreR.rotation.x = 0;
    r.shinL.rotation.x = r.shinR.rotation.x = 0.4;
    r.legL.rotation.x = r.legR.rotation.x = -0.25;
    r.hips.position.y -= 0.08;
  }

  // ---------------------------------------------------------------- реакция на удар
  if (a.hit < 0.28) {
    const w = Math.sin((a.hit / 0.28) * Math.PI);
    r.torso.rotation.x -= 0.32 * w;
    r.torso.rotation.y += 0.25 * w * a.hitSide;
    r.head.rotation.x -= 0.35 * w;
    r.armL.rotation.z += 0.35 * w;
    r.armR.rotation.z -= 0.35 * w;
    r.body.position.z += 0.08 * w;
  }

  // ---------------------------------------------------------------- появление из земли
  if (a.spawn < 0.9) {
    const k = easeOut(a.spawn / 0.9);
    r.body.position.y += (r.float ? -1.2 : -1.7) * (1 - k);
    r.torso.rotation.x += 0.5 * (1 - k);
    r.armL.rotation.x -= 2.2 * (1 - k);
    r.armR.rotation.x -= 2.6 * (1 - k);
  }
}

function gait(r: Rig, g: Gait, a: AnimState, m: number) {
  const ph = a.phase;
  const s = Math.sin(ph), c = Math.cos(ph);
  switch (g) {
    case "shamble": {
      // волочит ногу, руки тянутся вперёд
      r.legL.rotation.x = s * 0.45 * m;
      r.legR.rotation.x = -s * 0.22 * m;
      r.shinL.rotation.x = Math.max(0, -s) * 0.7 * m;
      r.shinR.rotation.x = 0.15 * m;
      r.armL.rotation.x = (-1.25 + s * 0.12) * Math.max(m, 0.35);
      r.armR.rotation.x = (-1.05 - s * 0.1) * Math.max(m, 0.35);
      r.foreL.rotation.x = -0.15;
      r.foreR.rotation.x = -0.3;
      r.torso.rotation.x = 0.2;
      r.torso.rotation.z = Math.sin(ph * 0.5) * 0.12 * m + 0.06;
      r.head.rotation.z = 0.28 + Math.sin(a.t * 0.9) * 0.05;
      r.hips.position.y = 0.83 + Math.abs(c) * 0.05 * m;
      break;
    }
    case "march":
      r.legL.rotation.x = s * 0.5 * m;
      r.legR.rotation.x = -s * 0.5 * m;
      r.shinL.rotation.x = Math.max(0, -s) * 0.6 * m;
      r.shinR.rotation.x = Math.max(0, s) * 0.6 * m;
      r.armR.rotation.x = s * 0.2 * m - 0.15;
      r.foreR.rotation.x = -0.4;
      r.armL.rotation.x = -s * 0.2 * m;
      r.hips.position.y = 0.85 + Math.abs(c) * 0.03 * m;
      break;
    case "stalk":
    case "prowl": {
      const low = g === "prowl" ? 1.4 : 1;
      r.torso.rotation.x = 0.28 * low;
      r.head.rotation.x = -0.2 * low;
      r.legL.rotation.x = s * 0.45 * m - 0.25 * low;
      r.legR.rotation.x = -s * 0.45 * m - 0.25 * low;
      r.shinL.rotation.x = 0.45 * low + Math.max(0, -s) * 0.5 * m;
      r.shinR.rotation.x = 0.45 * low + Math.max(0, s) * 0.5 * m;
      r.hips.position.y = 0.85 - 0.08 * low + Math.abs(c) * 0.03 * m;
      r.armL.rotation.x = -0.3 - s * 0.25 * m;
      r.armR.rotation.x = -0.4 + s * 0.25 * m;
      r.foreL.rotation.x = r.foreR.rotation.x = -0.9;
      break;
    }
    case "skitter": {
      // рваная, дёрганая походка скелета
      const js = Math.sign(s) * Math.min(1, Math.abs(s) * 2.2);
      r.legL.rotation.x = js * 0.5 * m;
      r.legR.rotation.x = -js * 0.5 * m;
      r.shinL.rotation.x = Math.max(0, -js) * 0.7 * m;
      r.shinR.rotation.x = Math.max(0, js) * 0.7 * m;
      r.armL.rotation.x = -js * 0.4 * m;
      r.armR.rotation.x = js * 0.3 * m - 0.2;
      r.foreR.rotation.x = -0.5;
      r.head.rotation.z = Math.sin(a.t * 13) * 0.07 * m;
      r.head.rotation.y = Math.sin(a.t * 7) * 0.05;
      r.torso.rotation.y = js * 0.1 * m;
      r.hips.position.y = 0.85 + Math.abs(c) * 0.06 * m;
      break;
    }
    case "stomp":
      r.legL.rotation.x = s * 0.42 * m;
      r.legR.rotation.x = -s * 0.42 * m;
      r.shinL.rotation.x = Math.max(0, -s) * 0.5 * m + 0.1;
      r.shinR.rotation.x = Math.max(0, s) * 0.5 * m + 0.1;
      r.body.rotation.z = s * 0.1 * m;
      r.torso.rotation.x = 0.15;
      r.hips.position.y = 0.85 - Math.abs(c) * 0.09 * m;
      r.armL.rotation.set(-s * 0.3 * m, 0, 0.3);
      r.armR.rotation.set(s * 0.3 * m, 0, -0.3);
      r.foreL.rotation.x = r.foreR.rotation.x = -0.3;
      break;
    case "float":
      r.body.position.y = 0.25 + Math.sin(a.t * 2) * 0.08;
      r.body.rotation.x = 0.28 * m;
      r.armL.rotation.x = 0.5 * m + Math.sin(a.t * 2.2) * 0.15;
      r.armR.rotation.x = 0.5 * m + Math.cos(a.t * 2.1) * 0.15;
      r.armL.rotation.z = 0.25;
      r.armR.rotation.z = -0.25;
      r.foreL.rotation.x = r.foreR.rotation.x = -0.3;
      r.torso.rotation.z = Math.sin(a.t * 1.3) * 0.05;
      break;
    case "hop":
      r.body.position.y = Math.abs(Math.sin(ph)) * 0.35 * m;
      r.body.rotation.x = Math.sin(ph) * 0.15 * m;
      r.legL.rotation.x = r.legR.rotation.x = -0.3 * m;
      r.shinL.rotation.x = r.shinR.rotation.x = 0.6 * m;
      break;
    default:
      r.legL.rotation.x = s * 0.55 * m;
      r.legR.rotation.x = -s * 0.55 * m;
      r.shinL.rotation.x = Math.max(0, -s) * 0.8 * m;
      r.shinR.rotation.x = Math.max(0, s) * 0.8 * m;
      r.armL.rotation.x = -s * 0.35 * m;
      r.armR.rotation.x = s * 0.35 * m;
      r.foreL.rotation.x = r.foreR.rotation.x = -0.25 * m;
      r.hips.position.y = 0.85 + Math.abs(c) * 0.04 * m;
  }
}

function idle(r: Rig, st: AnimStyle, a: AnimState) {
  // дыхание
  r.torso.rotation.x += Math.sin(a.t * 1.4) * 0.03;
  r.armL.rotation.z += 0.06 + Math.sin(a.t * 1.4) * 0.02;
  r.armR.rotation.z -= 0.06 + Math.sin(a.t * 1.4) * 0.02;
  if (a.state === "chase") {
    // боевая стойка: колени согнуты, оружие поднято
    r.legL.rotation.x -= 0.25;
    r.legR.rotation.x += 0.15;
    r.shinL.rotation.x += 0.3;
    r.shinR.rotation.x += 0.2;
    r.hips.position.y -= 0.05;
    r.armR.rotation.x -= 0.6;
    r.foreR.rotation.x -= 0.5;
    r.torso.rotation.y = -0.2;
    return;
  }
  // время от времени — своё «живое» движение
  if (a.fidget >= 1.4) return;
  const k = Math.sin((a.fidget / 1.4) * Math.PI);
  switch (st.fidgets[a.fidgetKind % st.fidgets.length]) {
    case "look":
      r.head.rotation.y = Math.sin((a.fidget / 1.4) * Math.PI * 2) * 0.9;
      r.torso.rotation.y = r.head.rotation.y * 0.25;
      break;
    case "shrug":
      r.armL.rotation.z += 0.25 * k;
      r.armR.rotation.z -= 0.25 * k;
      r.head.rotation.x = -0.15 * k;
      break;
    case "twitch":
      r.head.rotation.z = (Math.sin(a.fidget * 40) > 0 ? 0.35 : -0.2) * k;
      r.armR.rotation.x -= 0.5 * k * (Math.sin(a.fidget * 30) > 0 ? 1 : 0);
      break;
    case "weapon":
      r.armR.rotation.x = -1.2 * k;
      r.foreR.rotation.x = -0.6 * k;
      r.armR.rotation.z = -0.4 * k * Math.sin(a.fidget * 6);
      break;
    case "scratch":
      r.armL.rotation.x = -2.4 * k;
      r.foreL.rotation.x = -1.6 * k;
      r.armL.rotation.z = 0.3 * k + Math.sin(a.fidget * 24) * 0.08 * k;
      r.head.rotation.z = -0.25 * k;
      break;
    case "sway":
      r.torso.rotation.z = Math.sin(a.fidget * 4) * 0.15 * k;
      r.head.rotation.z = -r.torso.rotation.z;
      break;
    case "breathe":
      r.torso.rotation.x = -0.25 * k;
      r.head.rotation.x = -0.35 * k;
      r.armL.rotation.z += 0.3 * k;
      r.armR.rotation.z -= 0.3 * k;
      break;
  }
}

/** k — доля замаха (0..1), f — доля удара после замаха (0..1). */
function attackPose(r: Rig, st: AnimStyle, atk: string, melee: Melee, k: number, f: number) {
  const mix = (w: number, s: number) => w + (s - w) * f;
  const isCast = ["bolt", "volley", "summon", "pillars", "halo", "ring", "phantoms", "eclipse", "raise", "roar", "arrow"].includes(atk);
  if (atk === "slam" || atk === "quake" || atk === "leap") {
    r.armL.rotation.x = mix(-3.0 * k, 0.3);
    r.armR.rotation.x = mix(-3.0 * k, 0.3);
    r.foreL.rotation.x = r.foreR.rotation.x = mix(-0.5 * k, 0);
    r.torso.rotation.x = mix(-0.3 * k, 0.6);
    r.legL.rotation.x = mix(0, -0.6);
    r.legR.rotation.x = mix(0, -0.6);
    r.shinL.rotation.x = r.shinR.rotation.x = mix(0.2 * k, 1.0);
    r.hips.position.y = 0.85 - mix(0.05 * k, 0.25);
    return;
  }
  if (atk === "charge" || atk === "lunge") {
    r.torso.rotation.x = 0.5 * k;
    r.legL.rotation.x = -0.6 * k;
    r.shinL.rotation.x = 0.7 * k;
    r.legR.rotation.x = 0.4 * k;
    r.armR.rotation.x = -1.2 * k;
    r.armL.rotation.x = -0.8 * k;
    r.hips.position.y = 0.85 - 0.12 * k;
    return;
  }
  if (atk === "roar") {
    r.armL.rotation.z = 1.2 * k;
    r.armR.rotation.z = -1.2 * k;
    r.torso.rotation.x = -0.35 * k;
    r.head.rotation.x = -0.5 * k;
    return;
  }
  if (isCast) {
    const cast: Cast = atk === "arrow" ? "bow" : st.cast;
    switch (cast) {
      case "bow": {
        r.armL.rotation.x = -1.55;
        r.armL.rotation.y = 0.15;
        r.armR.rotation.x = -1.55;
        r.armR.rotation.z = mix(0.25 + 0.15 * k, 0.6);
        r.foreR.rotation.x = mix(-1.6 * k, -0.3);
        r.torso.rotation.y = 0.35;
        r.head.rotation.y = -0.3;
        break;
      }
      case "point":
        r.armR.rotation.x = mix(-1.5 * k, -1.2);
        r.foreR.rotation.x = mix(-0.4 * (1 - k), 0.1);
        r.armL.rotation.x = -0.8 * k;
        r.foreL.rotation.x = -1.4 * k;
        r.torso.rotation.y = mix(0.3 * k, -0.15);
        break;
      case "staff":
        r.armR.rotation.x = mix(-2.6 * k, -0.6);
        r.foreR.rotation.x = mix(-0.3 * k, 0);
        r.armL.rotation.x = mix(-1.2 * k, -0.5);
        r.torso.rotation.x = mix(-0.15 * k, 0.3);
        break;
      default:
        // руки вверх, растопырены — и бросок вперёд
        r.armL.rotation.x = mix(-2.7 * k, -1.3);
        r.armR.rotation.x = mix(-2.7 * k, -1.3);
        r.armL.rotation.z = mix(0.5 * k, 0.1);
        r.armR.rotation.z = mix(-0.5 * k, -0.1);
        r.foreL.rotation.x = r.foreR.rotation.x = mix(-0.3 * k, 0);
        r.torso.rotation.x = mix(-0.2 * k, 0.25);
        r.head.rotation.x = mix(-0.3 * k, 0.1);
    }
    return;
  }
  switch (melee) {
    case "chop":
      r.armR.rotation.x = mix(-2.8 * k, 0.4);
      r.foreR.rotation.x = mix(-0.7 * k, 0);
      r.torso.rotation.x = mix(-0.18 * k, 0.4);
      r.legL.rotation.x = mix(-0.1 * k, -0.45);
      r.shinL.rotation.x = mix(0, 0.4);
      r.legR.rotation.x = mix(0.2 * k, 0.3);
      break;
    case "sweep":
      r.armR.rotation.x = -1.45;
      r.armR.rotation.z = mix(-1.1 * k, 0.7);
      r.foreR.rotation.x = mix(-0.6 * k, 0);
      r.torso.rotation.y = mix(0.75 * k, -0.7);
      r.legL.rotation.x = -0.2;
      r.shinL.rotation.x = 0.3;
      break;
    case "thrust":
    case "stab":
      r.armR.rotation.x = mix(0.3 * k, -1.65);
      r.foreR.rotation.x = mix(-1.7 * k, 0);
      r.torso.rotation.y = mix(0.4 * k, -0.25);
      r.torso.rotation.x = mix(0, 0.3);
      r.legL.rotation.x = mix(0, -0.7);
      r.shinL.rotation.x = mix(0, 0.6);
      r.legR.rotation.x = mix(0.1, 0.35);
      if (melee === "stab") { r.armL.rotation.x = mix(-0.5 * k, 0.4); r.foreL.rotation.x = -1.2; }
      break;
    case "claw":
      r.armL.rotation.x = mix(-2.4 * k, -0.25);
      r.armR.rotation.x = mix(-2.2 * k, -0.35);
      r.armL.rotation.z = mix(0.4 * k, -0.2);
      r.armR.rotation.z = mix(-0.4 * k, 0.2);
      r.foreL.rotation.x = r.foreR.rotation.x = mix(-0.8 * k, -0.2);
      r.torso.rotation.x = mix(-0.15 * k, 0.45);
      break;
    case "double":
      r.armL.rotation.x = mix(0.7 * k, -1.5);
      r.armR.rotation.x = mix(0.7 * k, -1.5);
      r.torso.rotation.x = mix(-0.2 * k, 0.4);
      r.foreL.rotation.x = r.foreR.rotation.x = mix(-1.2 * k, -0.1);
      break;
    case "bite":
      r.torso.rotation.x = mix(-0.25 * k, 0.6);
      r.head.rotation.x = mix(-0.4 * k, 0.4);
      r.body.position.z = mix(0, -0.25);
      break;
    case "bash":
      r.armL.rotation.x = mix(0.3 * k, -1.6);
      r.foreL.rotation.x = mix(-1.3 * k, -0.2);
      r.torso.rotation.y = mix(-0.5 * k, 0.4);
      r.legL.rotation.x = mix(0, -0.5);
      break;
  }
}

function noticePose(r: Rig, n: Notice, t: number, now: number) {
  const k = Math.sin(clamp01(t / 0.9) * Math.PI);
  switch (n) {
    case "rattle":
      r.head.rotation.y = Math.sin(now * 40) * 0.3 * k;
      r.head.rotation.x = -0.2 * k;
      r.armL.rotation.z += 0.6 * k;
      r.armR.rotation.z -= 0.6 * k;
      break;
    case "moan":
      r.head.rotation.x = -0.6 * k;
      r.armL.rotation.x = -1.8 * k;
      r.armR.rotation.x = -1.7 * k;
      r.torso.rotation.x = -0.2 * k;
      break;
    case "salute":
      r.armR.rotation.x = -2.8 * k;
      r.foreR.rotation.x = -0.4 * k;
      r.torso.rotation.x = -0.1 * k;
      break;
    case "point":
      r.armR.rotation.x = -1.6 * k;
      r.head.rotation.x = -0.1 * k;
      break;
    case "roar":
      r.armL.rotation.z = 1.3 * k;
      r.armR.rotation.z = -1.3 * k;
      r.torso.rotation.x = -0.4 * k;
      r.head.rotation.x = -0.6 * k;
      break;
    case "hiss":
      r.torso.rotation.x = 0.4 * k;
      r.armL.rotation.set(-1.3 * k, 0, 0.8 * k);
      r.armR.rotation.set(-1.3 * k, 0, -0.8 * k);
      break;
    case "snap":
      r.body.position.y += Math.abs(Math.sin(now * 20)) * 0.2 * k;
      break;
  }
}

function deathPose(r: Rig, kind: Death, d: number, now: number) {
  switch (kind) {
    case "back": {
      const knee = ease(d / 0.2);
      const f = fall((d - 0.1) / 0.6);
      r.shinL.rotation.x = r.shinR.rotation.x = 0.6 * knee * (1 - f * 0.8);
      r.body.rotation.x = -(Math.PI / 2) * f * 0.97;
      r.body.position.y = 0.12 * f;
      r.armL.rotation.set(-2.6 * f, 0, 0.5 * f);
      r.armR.rotation.set(-2.4 * f, 0, -0.7 * f);
      r.head.rotation.x = -0.3 * f;
      break;
    }
    case "knees": {
      const a = ease(d / 0.45);
      r.legL.rotation.x = r.legR.rotation.x = -1.4 * a;
      r.shinL.rotation.x = r.shinR.rotation.x = 2.6 * a;
      r.hips.position.y = 0.85 - 0.48 * a;
      r.torso.rotation.x = 0.35 * a;
      r.head.rotation.x = 0.5 * a;
      r.armL.rotation.x = r.armR.rotation.x = 0.1;
      const f = fall((d - 0.6) / 0.55);
      r.body.rotation.z = (Math.PI / 2) * f * 0.95;
      r.body.position.y = 0.1 * f;
      break;
    }
    case "crumble": {
      // скелет рассыпается: ноги разъезжаются, таз падает, череп катится
      const a = ease(d / 0.35);
      r.legL.rotation.set(-1.2 * a, 0, -0.6 * a);
      r.legR.rotation.set(-1.0 * a, 0, 0.6 * a);
      r.shinL.rotation.x = r.shinR.rotation.x = 1.6 * a;
      r.hips.position.y = 0.85 - 0.7 * a;
      const b = fall((d - 0.15) / 0.45);
      r.torso.rotation.x = 1.3 * b;
      r.armL.rotation.set(-0.5 * b, 0, 1.0 * b);
      r.armR.rotation.set(-0.2 * b, 0, -1.2 * b);
      const c = clamp01((d - 0.3) / 0.6);
      r.head.position.set(0.35 * c, 0.66 - 0.25 * c, -0.25 * c);
      r.head.rotation.set(0.6 * c, 0, 1.8 * c);
      break;
    }
    case "dissolve": {
      const a = clamp01(d / 1.3);
      r.body.position.y = 0.25 + 0.7 * a;
      r.torso.rotation.x = -0.4 * a;
      r.armL.rotation.set(-1.4 * a, 0, 0.9 * a);
      r.armR.rotation.set(-1.4 * a, 0, -0.9 * a);
      r.head.rotation.x = -0.6 * a;
      for (const m of r.mats) {
        m.transparent = true;
        m.opacity = Math.min(m.opacity, 1 - a);
      }
      if (a >= 1) r.root.visible = false;
      break;
    }
    case "topple": {
      const f = fall(d / 0.9);
      r.body.rotation.z = -(Math.PI / 2) * f * 0.93;
      r.body.position.y = 0.2 * f;
      r.armL.rotation.z = 0.8 * f;
      r.armR.rotation.x = -1.5 * f;
      r.legL.rotation.x = -0.4 * f;
      break;
    }
    case "spin": {
      const a = ease(d / 0.5);
      r.body.rotation.y = a * Math.PI * 0.9;
      r.shinL.rotation.x = r.shinR.rotation.x = 1.0 * a;
      r.hips.position.y = 0.85 - 0.2 * a;
      const f = fall((d - 0.35) / 0.5);
      r.body.rotation.x = (Math.PI / 2) * f * 0.97;
      r.body.position.y = 0.12 * f;
      r.armL.rotation.x = -2.6 * f;
      r.armR.rotation.x = -1.6 * f;
      break;
    }
    default: {
      // вперёд
      const f = fall(d / 0.6);
      r.shinL.rotation.x = r.shinR.rotation.x = 0.5 * (1 - f);
      r.body.rotation.x = (Math.PI / 2) * f * 0.97;
      r.body.position.y = 0.12 * f;
      r.armR.rotation.x = -2.5 * f;
      r.armL.rotation.x = -2.2 * f;
      r.head.rotation.y = 0.6 * f;
    }
  }
  void now;
}
