/** Пиктограммы навыков 32×32: собираются из общих элементов (клинок, пламя, череп, щит, молния…). */
import { Icon, P, arc, circ, ell, ln, mix, rect, rot } from "./iconkit";

/** Цвет пиктограммы и фона кнопки по значку навыка. */
export const SKILL_COLORS: Record<string, [string, string]> = {
  cleave: ["#e8dcc8", "#3a1a16"], rage: ["#ff4a3a", "#3a0a0a"], whirl: ["#e0e4ec", "#2a201c"], execute: ["#ff3a3a", "#2a0a0a"],
  armor: ["#b8bcc8", "#22222a"], blood: ["#e0303a", "#2a0a0a"], bash: ["#d8b070", "#2a2010"], charge: ["#e8c870", "#3a2a10"],
  taunt: ["#ff8a2a", "#3a1a0a"], fortress: ["#9adfff", "#102030"], shield: ["#d8b070", "#202024"], thorns: ["#9ac05a", "#1a2a10"],
  knives: ["#e0e4ec", "#1c1c26"], shadow: ["#a06aff", "#100a20"], poison: ["#8aff6a", "#0a200a"], smoke: ["#b0b0b0", "#1a1a1a"],
  crit: ["#ff5a5a", "#200a0a"], evade: ["#9ad0ff", "#0a1520"], fire: ["#ff8a2a", "#2a0a00"], frost: ["#8fd0ff", "#0a1a2a"],
  arcane: ["#d87aff", "#1a0a2a"], meteor: ["#ffb03a", "#2a0a00"], mastery: ["#ffe9a0", "#1a1a2a"], mana: ["#5a8ae0", "#0a102a"],
  skeleton: ["#e8dcc0", "#0a1a0a"], spear: ["#e8dcc0", "#1a0a2a"], corpse: ["#ff5a3a", "#1a0a0a"], curse: ["#b06aff", "#100a1a"],
  soul: ["#7aff9a", "#0a1a10"], pact: ["#c03a5a", "#1a0a10"], heal: ["#7fe07f", "#0a1a0a"], holy: ["#ffe9a0", "#2a2410"],
  sanctuary: ["#ffe9a0", "#1a1a10"], smite: ["#fff3a0", "#2a2410"], bane: ["#ffe9a0", "#1a0a0a"], devotion: ["#e8d8b0", "#1a1410"],
  mastery_blade: ["#e0e4ec", "#2a2420"], double: ["#e8e8f0", "#2a1a14"], quake: ["#d8b070", "#2a1a0a"], leap: ["#e8c870", "#1a1a24"],
  titan: ["#ffd06a", "#2a1a0a"], shout: ["#ffb04a", "#2a140a"], heart: ["#e0505a", "#1a0a0a"], roar: ["#ff7a3a", "#2a0a0a"],
  fear: ["#9a6aff", "#100a1a"], banner: ["#d8343a", "#1a1410"], resist: ["#8fd0ff", "#1a1a1a"], thunder: ["#ffe06a", "#1a1420"],
  frenzy: ["#ff5a3a", "#2a0a0a"], leech: ["#e0303a", "#0a0a0a"], rend: ["#ff3a3a", "#1a0a0a"], skull_red: ["#ff4a3a", "#140a0a"],
  berserk: ["#b06aff", "#2a0a0a"], avatar: ["#ffd06a", "#3a0a0a"], shield_throw: ["#d8b070", "#1a1a24"], wall: ["#b8bcc8", "#1a1a24"],
  aegis: ["#9adfff", "#1a1a10"], zeal: ["#ffe9a0", "#2a1a0a"], trample: ["#e8c870", "#2a140a"], riposte: ["#e0e4ec", "#101820"],
  crush: ["#e8c870", "#2a0a0a"], aura_red: ["#ff5a4a", "#1a0a0a"], aura_grey: ["#d0d0d8", "#141418"], aura_fire: ["#ff8a2a", "#1a0a00"],
  aura_green: ["#7fe07f", "#0a1a0a"], aura_blue: ["#7ab8ff", "#0a1020"], aura_white: ["#fff8e0", "#1a1a1a"], throw: ["#e0e4ec", "#1a1420"],
  vial: ["#8aff6a", "#101a10"], trap: ["#d0d0d8", "#1a1a1a"], cloud: ["#6aff5a", "#0a140a"], trap_fire: ["#ff8a2a", "#1a1010"],
  gear: ["#d8b070", "#141414"], poison_nova: ["#8aff6a", "#0a1a0a"], sentry: ["#bfe4ff", "#0a1020"], veil: ["#8a6aff", "#0a0a14"],
  teleport: ["#d87aff", "#100a20"], clone: ["#8a8ac0", "#0a0a14"], firewall: ["#ff7a2a", "#1a0800"], mastery_fire: ["#ff8a2a", "#140a0a"],
  inferno: ["#ffb03a", "#2a0800"], hydra: ["#ff6a2a", "#140a00"], ice_bolt: ["#8fd0ff", "#0a1420"], ice_armor: ["#bfe4ff", "#0a1420"],
  spike: ["#8fd0ff", "#101a2a"], mastery_cold: ["#8fd0ff", "#0a0a1a"], blizzard: ["#d0ecff", "#0a1a2a"], shards: ["#aee0ff", "#0a1020"],
  orb: ["#bfe4ff", "#0a1a2a"], spark: ["#ffe96a", "#141020"], chain: ["#bfe4ff", "#0a0a20"], mastery_light: ["#ffe96a", "#0a0a1a"],
  storm: ["#bfe4ff", "#14141a"], skeleton_mage: ["#b06aff", "#0a1a0a"], golem: ["#c09a6a", "#1a140a"], army: ["#e8dcc0", "#0a140a"],
  golem_blood: ["#e0303a", "#1a0a0a"], mastery_bone: ["#e8dcc0", "#140a1a"], prison: ["#e8dcc0", "#1a1a14"], spirit: ["#e8dcc0", "#1a0a2a"],
  mastery_curse: ["#b06aff", "#0a0a0a"], weaken: ["#8a8aff", "#0a0a14"], doom: ["#ff3a4a", "#0a0014"], renew: ["#7fe07f", "#101a10"],
  spirit_holy: ["#fff3a0", "#1a1a24"], hammer: ["#ffe9a0", "#1a1410"], judgement: ["#fff3a0", "#2a1a0a"],
};

type Art = (ic: Icon, fg: string) => void;
const STEEL = "#c0c4d0", IRON = "#7a7e88", GOLD = "#d8a840", WOOD = "#8a5a32", LEATHER = "#7a4a2a", BONE = "#e6dac0", BLOOD = "#c01a24";
const lite = (c: string, k = 0.45) => mix(c, "#ffffff", k);
const deep = (c: string, k = 0.45) => mix(c, "#000000", k);

// ---------------------------------------------------------------- общие элементы

/** Меч: (x, y) — перекрестье, a — угол клинка, len — длина. */
function sword(ic: Icon, x: number, y: number, a: number, len: number, o: { w?: number; color?: string; guard?: string } = {}) {
  const w = o.w ?? 1.6;
  ic.part("#5a3a22", "leather", (g) => rot(g, x, y, a, () => rect(g, -6, -1.2, 5.5, 2.4)));
  ic.part(o.color ?? STEEL, "metal", (g) => rot(g, x, y, a, () => P(g, [0.5, -w, len, -w, len + 3, 0, len, w, 0.5, w])));
  ic.part(o.guard ?? GOLD, "gold", (g) => rot(g, x, y, a, () => rect(g, -1.2, -4.5, 2.4, 9)));
  ic.part(o.guard ?? GOLD, "gold", (g) => rot(g, x, y, a, () => circ(g, -7.5, 0, 1.8)));
}

function axeHead(ic: Icon, x: number, y: number, a: number, len: number, color = STEEL) {
  ic.part(WOOD, "wood", (g) => rot(g, x, y, a, () => rect(g, -len * 0.45, -1.1, len, 2.2)));
  ic.part(color, "metal", (g) => rot(g, x, y, a, () => P(g, [len * 0.3, -1.4, len * 0.55 - 0.5, -1.6, len * 0.55 + 1, 2, len * 0.55 + 2.5, 8, len * 0.55 - 2, 9, len * 0.3 - 1.5, 5, len * 0.3 - 0.5, 1.5])));
}

function hammer(ic: Icon, x: number, y: number, a: number, head = STEEL, glow = false) {
  ic.part(WOOD, "wood", (g) => rot(g, x, y, a, () => rect(g, -9, -1.1, 18, 2.2)));
  ic.part(head, glow ? "glow" : "metal", (g) => rot(g, x, y, a, () => rect(g, 7, -5.5, 6, 11)));
  ic.part(deep(head, 0.3), glow ? "glow" : "metal", (g) => rot(g, x, y, a, () => { rect(g, 6.2, -5.5, 0.9, 11); rect(g, 12.2, -5.5, 0.9, 11); }), { outline: false });
}

function flame(ic: Icon, x: number, y: number, s: number, fg = "#ff8a2a") {
  ic.part(deep(fg, 0.15), "flame", (g) => { g.beginPath(); g.moveTo(x, y - 12 * s); g.bezierCurveTo(x + 9 * s, y - 4 * s, x + 8 * s, y + 6 * s, x, y + 7 * s); g.bezierCurveTo(x - 8 * s, y + 6 * s, x - 9 * s, y - 2 * s, x - 3 * s, y - 6 * s); g.bezierCurveTo(x - 2 * s, y - 2 * s, x + 1 * s, y - 4 * s, x, y - 12 * s); g.fill(); });
  ic.part(lite(fg, 0.35), "flame", (g) => { g.beginPath(); g.moveTo(x + 1 * s, y - 5 * s); g.bezierCurveTo(x + 5 * s, y, x + 4 * s, y + 5 * s, x, y + 5.5 * s); g.bezierCurveTo(x - 4 * s, y + 5 * s, x - 4 * s, y, x + 1 * s, y - 5 * s); g.fill(); }, { outline: false });
  ic.part("#fff6c0", "glow", (g) => ell(g, x, y + 2.5 * s, 2 * s, 2.6 * s), { outline: false });
}

function skull(ic: Icon, x: number, y: number, s: number, eye: string, color = BONE) {
  ic.part(color, "bone", (g) => { circ(g, x, y, 7 * s); rect(g, x - 4.6 * s, y + 2.5 * s, 9.2 * s, 6 * s); });
  ic.part("#140c08", "flat", (g) => { ell(g, x - 2.8 * s, y + 0.8 * s, 2 * s, 2.2 * s); ell(g, x + 2.8 * s, y + 0.8 * s, 2 * s, 2.2 * s); P(g, [x, y + 3.5 * s, x - 1.2 * s, y + 5.5 * s, x + 1.2 * s, y + 5.5 * s]); }, { outline: false });
  ic.part(deep(color, 0.3), "bone", (g) => { for (let i = 0; i < 4; i++) rect(g, x - 3.8 * s + i * 2.1 * s, y + 6.5 * s, 1.2 * s, 2 * s); }, { outline: false });
  ic.dot(x - 3 * s, y + 0.8 * s, eye); ic.dot(x + 2.6 * s, y + 0.8 * s, eye);
}

function shieldShape(ic: Icon, x: number, y: number, s: number, face: string, rim = STEEL, emblem?: (g: CanvasRenderingContext2D) => void, emblemColor = GOLD) {
  ic.part(rim, "metal", (g) => P(g, [x - 10 * s, y - 11 * s, x + 10 * s, y - 11 * s, x + 10 * s, y - 1 * s, x, y + 12 * s, x - 10 * s, y - 1 * s]));
  ic.part(face, "cloth", (g) => P(g, [x - 7.5 * s, y - 8.5 * s, x + 7.5 * s, y - 8.5 * s, x + 7.5 * s, y - 1.5 * s, x, y + 8.5 * s, x - 7.5 * s, y - 1.5 * s]), { outline: false });
  if (emblem) ic.part(emblemColor, "gold", emblem, { outline: false });
}

function bolt(ic: Icon, pts: number[], fg: string, w = 2.4) {
  ic.part(fg, "glow", (g) => { g.lineWidth = w; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); });
  ic.part("#ffffff", "glow", (g) => { g.lineWidth = w * 0.35; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke(); }, { outline: false });
}

function snowflake(ic: Icon, x: number, y: number, r: number, fg: string) {
  ic.part(fg, "glow", (g) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ln(g, x, y, x + Math.cos(a) * r, y + Math.sin(a) * r, 1.8);
      const bx = x + Math.cos(a) * r * 0.6, by = y + Math.sin(a) * r * 0.6;
      ln(g, bx, by, bx + Math.cos(a + 0.8) * r * 0.3, by + Math.sin(a + 0.8) * r * 0.3, 1.3);
      ln(g, bx, by, bx + Math.cos(a - 0.8) * r * 0.3, by + Math.sin(a - 0.8) * r * 0.3, 1.3);
    }
  });
  ic.part("#ffffff", "glow", (g) => circ(g, x, y, r * 0.18), { outline: false });
}

function rays(ic: Icon, x: number, y: number, r0: number, r1: number, n: number, fg: string, w = 1.6, off = 0) {
  ic.part(fg, "glow", (g) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + off; ln(g, x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, w); } });
}

function drop(ic: Icon, x: number, y: number, s: number, color: string) {
  ic.part(color, "liquid", (g) => { g.beginPath(); g.moveTo(x, y - 9 * s); g.bezierCurveTo(x + 2 * s, y - 4 * s, x + 6.5 * s, y, x + 6.5 * s, y + 3.5 * s); g.arc(x, y + 3.5 * s, 6.5 * s, 0, Math.PI); g.bezierCurveTo(x - 6.5 * s, y, x - 2 * s, y - 4 * s, x, y - 9 * s); g.fill(); });
}

function cloud(ic: Icon, x: number, y: number, s: number, color: string) {
  ic.part(color, "cloth", (g) => { circ(g, x - 5 * s, y + 1 * s, 4.5 * s); circ(g, x + 1 * s, y - 2 * s, 6 * s); circ(g, x + 6 * s, y + 1.5 * s, 4 * s); rect(g, x - 5 * s, y + 1 * s, 11 * s, 4.5 * s); });
}

function figure(ic: Icon, x: number, y: number, s: number, color: string, mat: "cloth" | "dark" | "glow" | "stone" = "dark") {
  ic.part(color, mat, (g) => { circ(g, x, y - 7 * s, 3.4 * s); P(g, [x - 5 * s, y - 2 * s, x + 5 * s, y - 2 * s, x + 6.5 * s, y + 10 * s, x - 6.5 * s, y + 10 * s]); });
}

function claws(ic: Icon, fg: string, n = 3, blood = false) {
  // когти: сужаются к концам, светлая сердцевина
  ic.part(fg, "glow", (g) => { for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 7; g.beginPath(); g.moveTo(8 + o, 3); g.quadraticCurveTo(15 + o, 13, 22 + o, 29); g.quadraticCurveTo(13 + o, 16, 8 + o, 3); g.lineWidth = 1.6; g.stroke(); g.fill(); } });
  ic.part(lite(fg, 0.6), "glow", (g) => { for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 7; g.lineWidth = 0.8; g.beginPath(); g.moveTo(10 + o, 8); g.quadraticCurveTo(14.5 + o, 15, 19 + o, 24); g.stroke(); } }, { outline: false });
  if (blood) for (const [x, y] of [[10, 22], [17, 26], [24, 20]]) ic.part(BLOOD, "liquid", (g) => ell(g, x, y, 1.4, 2));
}

function swirl(ic: Icon, fg: string, r = 11, w = 2.4) {
  ic.part(fg, "glow", (g) => { arc(g, 16, 16, r, -0.4, 2.2, w); arc(g, 16, 16, r * 0.62, 2.6, 5.2, w * 0.85); arc(g, 16, 16, r, 2.8, 4.4, w * 0.6); });
}

function waves(ic: Icon, x: number, y: number, fg: string, n = 3) {
  ic.part(fg, "glow", (g) => { for (let i = 0; i < n; i++) arc(g, x, y, 4 + i * 4, -0.8, 0.8, 1.8); });
}

function crossShape(ic: Icon, x: number, y: number, s: number, color: string, mat: "gold" | "glow" = "gold") {
  ic.part(color, mat, (g) => { rect(g, x - 2 * s, y - 11 * s, 4 * s, 22 * s); rect(g, x - 8 * s, y - 5 * s, 16 * s, 4 * s); });
}

function ring(ic: Icon, r: number, fg: string, w = 2) {
  ic.part(fg, "glow", (g) => arc(g, 16, 16, r, 0, Math.PI * 2, w));
}

function golemFig(ic: Icon, color: string) {
  ic.part(color, "stone", (g) => { rect(g, 10, 10, 12, 11); rect(g, 12.5, 4, 7, 6); rect(g, 5, 11, 5, 11); rect(g, 22, 11, 5, 11); rect(g, 11, 21, 4, 8); rect(g, 17, 21, 4, 8); });
  ic.dot(14.5, 6.5, "#ffe06a"); ic.dot(17.5, 6.5, "#ffe06a");
}

function ghost(ic: Icon, x: number, y: number, s: number, color: string, eye = "#0a0a14") {
  ic.part(color, "glow", (g) => { g.beginPath(); g.arc(x, y - 3 * s, 7 * s, Math.PI, 0); g.lineTo(x + 7 * s, y + 8 * s); for (let i = 0; i < 4; i++) g.lineTo(x + 7 * s - (i + 0.5) * 3.5 * s, y + (i % 2 ? 8 : 5) * s); g.lineTo(x - 7 * s, y + 8 * s); g.closePath(); g.fill(); });
  ic.part(eye, "flat", (g) => { ell(g, x - 2.5 * s, y - 3 * s, 1.4 * s, 2 * s); ell(g, x + 2.5 * s, y - 3 * s, 1.4 * s, 2 * s); }, { outline: false });
}

function emblemCircle(ic: Icon, fg: string, inner: (ic: Icon) => void) {
  ic.part(deep(fg, 0.72), "stone", (g) => circ(g, 16, 16, 14));
  ic.part(mix(fg, "#d8a840", 0.5), "gold", (g) => arc(g, 16, 16, 13, 0, Math.PI * 2, 1.8), { outline: false });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ic.dot(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, fg); }
  inner(ic);
}

function aura(ic: Icon, fg: string, inner: (ic: Icon) => void) {
  rays(ic, 16, 16, 9.5, 14, 12, fg, 1.6);
  ring(ic, 8.5, fg, 1.6);
  inner(ic);
}

// ---------------------------------------------------------------- пиктограммы

export const SKILL_ART: Record<string, Art> = {
  default: (ic, fg) => { ic.part(fg, "glow", (g) => circ(g, 16, 16, 7)); },
  // ---- воин
  cleave: (ic, fg) => {
    ic.part(fg, "glow", (g) => arc(g, 9, 23, 18, -1.6, -0.1, 2.6));
    ic.part("#ffffff", "glow", (g) => arc(g, 9, 23, 18, -1.5, -0.2, 0.9), { outline: false });
    axeHead(ic, 13, 21, -Math.PI / 4, 22);
  },
  double: (ic, fg) => {
    sword(ic, 9, 24, -Math.PI / 4 - 0.25, 16);
    sword(ic, 23, 24, -Math.PI * 3 / 4 + 0.25, 16);
    ic.part(fg, "glow", (g) => { ln(g, 4, 6, 12, 2, 1.4); ln(g, 28, 6, 20, 2, 1.4); }, { outline: false });
  },
  whirl: (ic, fg) => { swirl(ic, fg); sword(ic, 12, 20, -Math.PI / 4, 14); },
  execute: (ic, fg) => {
    axeHead(ic, 14, 18, -Math.PI / 4 + 0.15, 22, "#5a5e6a");
    skull(ic, 23, 25, 0.5, fg);
    ic.part(BLOOD, "liquid", (g) => { ell(g, 23, 12, 1.4, 2.2); ell(g, 27, 16, 1.2, 1.8); });
  },
  quake: (ic, fg) => {
    hammer(ic, 16, 11, -Math.PI / 2 - 0.3, "#9aa0ac");
    ic.part("#6a5a48", "stone", (g) => rect(g, 2, 25, 28, 5));
    ic.part(fg, "glow", (g) => { ln(g, 16, 25, 11, 30, 1.2); ln(g, 16, 25, 21, 30, 1.2); ln(g, 16, 25, 16, 31, 1.2); }, { outline: false });
    rays(ic, 16, 24, 7, 11, 5, fg, 1.4, Math.PI * 1.1);
  },
  crush: (ic, fg) => {
    hammer(ic, 13, 15, -Math.PI / 4, "#8a8e9a");
    rays(ic, 24, 9, 2, 7, 8, fg, 1.6);
  },
  leap: (ic, fg) => {
    // траектория прыжка дугой, стрелка вниз и трещины в месте удара
    ic.part(fg, "glow", (g) => { g.lineWidth = 2.6; g.beginPath(); g.moveTo(3, 25); g.quadraticCurveTo(12, -1, 22, 18); g.stroke(); });
    ic.part(fg, "glow", (g) => P(g, [17, 16, 26, 15, 24, 24]));
    ic.part("#6a5a48", "stone", (g) => rect(g, 2, 25, 28, 5));
    ic.part("#1a120c", "flat", (g) => { ln(g, 24, 25, 20, 30, 1); ln(g, 24, 25, 28, 30, 1); ln(g, 24, 25, 24, 31, 1); }, { outline: false });
    rays(ic, 24, 24, 3, 7, 5, lite(fg, 0.3), 1.3, Math.PI * 1.1);
    axeHead(ic, 9, 12, -Math.PI / 4, 13);
  },
  titan: (ic, fg) => { sword(ic, 9, 25, -Math.PI / 4, 18, { w: 2.6, guard: GOLD }); ic.part(fg, "glow", (g) => arc(g, 16, 16, 13, 0, Math.PI * 2, 1.2), { outline: false }); },
  mastery_blade: (ic) => { sword(ic, 8, 25, -Math.PI / 4, 18); sword(ic, 24, 25, -Math.PI * 3 / 4, 18); },
  shout: (ic, fg) => { mouth(ic); waves(ic, 18, 16, fg); },
  roar: (ic, fg) => { mouth(ic, "#c03a2a"); waves(ic, 18, 16, fg, 3); rays(ic, 8, 16, 9, 12, 5, fg, 1.2, Math.PI * 0.8); },
  thunder: (ic, fg) => { mouth(ic); bolt(ic, [24, 3, 19, 13, 25, 15, 18, 29], fg, 2.2); },
  heart: (ic, fg) => { heart(ic, fg); },
  fear: (ic, fg) => { ghost(ic, 16, 16, 1.4, fg, "#140a1a"); ic.part("#140a1a", "flat", (g) => ell(g, 16, 22, 2.6, 3), { outline: false }); },
  banner: (ic, fg) => {
    ic.part(WOOD, "wood", (g) => rect(g, 7, 2, 2.4, 28));
    ic.part(GOLD, "gold", (g) => circ(g, 8.2, 2.5, 2));
    ic.part(fg, "cloth", (g) => P(g, [9.5, 5, 26, 5, 26, 20, 21, 17, 17.5, 21, 14, 17, 9.5, 20]));
    ic.part(GOLD, "gold", (g) => { P(g, [17.5, 8, 20.5, 12, 17.5, 16, 14.5, 12]); }, { outline: false });
  },
  frenzy: (ic, fg) => claws(ic, fg, 3),
  zeal: (ic, fg) => { claws(ic, fg, 3); rays(ic, 16, 16, 12, 14.5, 8, fg, 1); },
  rend: (ic, fg) => claws(ic, fg, 3, true),
  leech: (ic, fg) => { drop(ic, 16, 15, 1.2, BLOOD); ic.part("#f0f0f0", "bone", (g) => { P(g, [10, 4, 13, 4, 11.5, 11]); P(g, [19, 4, 22, 4, 20.5, 11]); }); void fg; },
  rage: (ic, fg) => { flame(ic, 16, 16, 1.15, fg); fist(ic, 16, 20, "#d8a888"); },
  blood: (ic, fg) => { drop(ic, 16, 14, 1.35, fg); },
  skull_red: (ic, fg) => { horns(ic); skull(ic, 16, 14, 1.25, fg); },
  berserk: (ic, fg) => { flame(ic, 16, 15, 1.3, "#ff4a2a"); skull(ic, 16, 16, 0.95, fg); },
  avatar: (ic, fg) => { rays(ic, 16, 13, 7, 14, 14, fg, 1.4); figure(ic, 16, 15, 1, "#2a1a10", "dark"); ic.part(fg, "glow", (g) => { ell(g, 14.5, 8, 0.8, 0.8); ell(g, 17.5, 8, 0.8, 0.8); }, { outline: false }); },
  // ---- рыцарь
  armor: (ic) => breastplate(ic, STEEL),
  shield: (ic, fg) => shieldShape(ic, 16, 15, 1.1, "#7a2a28", STEEL, (g) => { rect(g, 14.5, 7, 3, 15); rect(g, 9.5, 11, 13, 3); }, fg),
  fortress: (ic, fg) => {
    ic.part("#8a8e98", "stone", (g) => { rect(g, 6, 10, 20, 19); for (let i = 0; i < 4; i++) rect(g, 6 + i * 5.5, 5, 3.5, 6); });
    ic.part("#140e0a", "flat", (g) => { g.beginPath(); g.arc(16, 23, 4, Math.PI, 0); g.lineTo(20, 29); g.lineTo(12, 29); g.fill(); }, { outline: false });
    ic.part(fg, "glow", (g) => arc(g, 16, 18, 15, Math.PI * 1.1, Math.PI * 1.9, 1.6), { outline: false });
  },
  bash: (ic, fg) => { rays(ic, 22, 10, 3, 9, 8, fg, 1.8); shieldShape(ic, 13, 18, 0.75, "#3a4a6a", IRON); },
  charge: (ic, fg) => {
    ic.part(fg, "glow", (g) => { for (const y of [10, 16, 22]) ln(g, 2, y, 12, y, 1.6); }, { outline: false });
    shieldShape(ic, 20, 16, 0.85, "#6a2a28", STEEL);
  },
  taunt: (ic, fg) => {
    ic.part(STEEL, "metal", (g) => { g.beginPath(); g.arc(13, 17, 9, Math.PI, 0); g.fill(); rect(g, 4, 17, 18, 9); });
    ic.part("#0e0a08", "flat", (g) => rect(g, 6, 19, 14, 2.4), { outline: false });
    ic.part(fg, "glow", (g) => { rect(g, 24, 4, 3.5, 13); rect(g, 24, 20, 3.5, 3.5); });
  },
  thorns: (ic, fg) => {
    ic.part("#4a6a2a", "wood", (g) => { arc(g, 16, 16, 10, 0, Math.PI * 2, 2.4); });
    ic.part(fg, "bone", (g) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; P(g, [16 + Math.cos(a) * 9, 16 + Math.sin(a) * 9, 16 + Math.cos(a + 0.12) * 15, 16 + Math.sin(a + 0.12) * 15, 16 + Math.cos(a + 0.3) * 10.5, 16 + Math.sin(a + 0.3) * 10.5]); } });
    ic.part(BLOOD, "liquid", (g) => circ(g, 16, 16, 4));
  },
  shield_throw: (ic, fg) => {
    ic.part(fg, "glow", (g) => { arc(g, 13, 17, 11, 2.2, 3.9, 1.6); arc(g, 13, 17, 13.5, 2.4, 3.6, 1.2); }, { outline: false });
    ic.part(STEEL, "metal", (g) => circ(g, 18, 14, 9));
    ic.part("#3a4a6a", "cloth", (g) => circ(g, 18, 14, 6.5), { outline: false });
    ic.part(GOLD, "gold", (g) => circ(g, 18, 14, 2.4));
  },
  wall: (ic, fg) => {
    ic.part("#9aa0ac", "stone", (g) => rect(g, 3, 9, 26, 19));
    ic.part("#4a4e58", "flat", (g) => { for (const y of [14, 19, 24]) rect(g, 3, y, 26, 0.9); for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) rect(g, 3 + i * 7 + (r % 2) * 3.5, 9 + r * 5, 0.9, 5); }, { outline: false });
    shieldShape(ic, 16, 11, 0.5, fg, GOLD);
  },
  aegis: (ic, fg) => { ring(ic, 13, fg, 1.4); shieldShape(ic, 16, 16, 0.95, "#2a5a8a", "#e0e4ec", (g) => circ(g, 16, 13, 3.5), "#9adfff"); },
  resist: (ic, fg) => { shieldShape(ic, 16, 16, 1.05, "#2a2a3a", STEEL); ic.part("#ff6a2a", "glow", (g) => circ(g, 12, 11, 2.2), { outline: false }); ic.part("#8fd0ff", "glow", (g) => circ(g, 20, 11, 2.2), { outline: false }); ic.part("#ffe96a", "glow", (g) => circ(g, 16, 18, 2.2), { outline: false }); void fg; },
  trample: (ic, fg) => {
    ic.part(fg, "glow", (g) => { for (const y of [8, 14, 20]) ln(g, 2, y, 9, y, 1.4); }, { outline: false });
    boot(ic, 18, 13, "#8a8e98");
    rays(ic, 20, 27, 2, 6, 6, fg, 1.2, Math.PI);
  },
  riposte: (ic, fg) => { sword(ic, 7, 25, -Math.PI / 4 + 0.2, 17); sword(ic, 25, 25, -Math.PI * 3 / 4 - 0.2, 17, { color: "#9aa0ac", guard: IRON }); rays(ic, 16, 11, 1.5, 5.5, 8, fg, 1.3); },
  // ---- разбойник
  knives: (ic) => { for (let i = 0; i < 3; i++) knife(ic, 8 + i * 8, 27, -Math.PI / 2 + (i - 1) * 0.35, 1); },
  throw: (ic, fg) => { ic.part(fg, "glow", (g) => { ln(g, 2, 25, 12, 18, 1.2); ln(g, 4, 30, 12, 24, 1.2); }, { outline: false }); knife(ic, 13, 20, -Math.PI / 4, 1.2); },
  shadow: (ic, fg) => { hoodFig(ic, 16, 17, "#1a1424", fg); },
  veil: (ic, fg) => {
    ic.part(fg, "glow", (g) => { g.beginPath(); g.arc(16, 16, 12, 0.7, Math.PI * 2 - 0.7); g.arc(21, 16, 9.5, Math.PI * 2 - 1.05, 1.05, true); g.fill(); });
    ic.dot(13, 13, "#ffffff"); ic.dot(10, 19, "#ffffff");
  },
  clone: (ic, fg) => { hoodFig(ic, 12, 17, "#2a2438", fg); hoodFig(ic, 21, 18, deep(fg, 0.55), fg, 0.85); },
  poison: (ic, fg) => { knife(ic, 13, 20, -Math.PI / 4, 1.3); for (const [x, y] of [[22, 16], [19, 22], [25, 21]]) ic.part(fg, "liquid", (g) => ell(g, x, y, 1.6, 2.4)); },
  vial: (ic, fg) => {
    ic.part("#a8c0c8", "glass", (g) => { rect(g, 13.5, 5, 5, 7); P(g, [13.5, 11, 18.5, 11, 25, 27, 7, 27]); });
    ic.part(fg, "liquid", (g) => P(g, [10, 19, 22, 19, 25, 27, 7, 27]), { outline: false });
    ic.part(WOOD, "wood", (g) => rect(g, 13, 2, 6, 4));
    skull(ic, 16, 22, 0.32, "#140c08", "#e8f0d8");
  },
  smoke: (ic, fg) => { cloud(ic, 15, 19, 1.15, fg); cloud(ic, 18, 11, 0.7, lite(fg, 0.2)); },
  crit: (ic, fg) => {
    ic.part(fg, "glow", (g) => { arc(g, 16, 16, 10, 0, Math.PI * 2, 1.8); ln(g, 16, 2, 16, 9, 1.8); ln(g, 16, 23, 16, 30, 1.8); ln(g, 2, 16, 9, 16, 1.8); ln(g, 23, 16, 30, 16, 1.8); });
    ic.part(BLOOD, "liquid", (g) => circ(g, 16, 16, 3.5));
  },
  evade: (ic, fg) => {
    ic.part(fg, "glow", (g) => { g.lineWidth = 2; g.beginPath(); g.moveTo(26, 4); g.quadraticCurveTo(4, 8, 8, 28); g.stroke(); });
    ic.part(lite(fg, 0.3), "cloth", (g) => { P(g, [26, 4, 18, 12, 14, 18, 10, 26, 14, 22, 20, 17, 24, 10]); });
    ic.part(deep(fg, 0.3), "flat", (g) => { for (let i = 0; i < 5; i++) ln(g, 24 - i * 3, 7 + i * 4, 20 - i * 3, 9 + i * 4, 0.8); }, { outline: false });
  },
  trap: (ic, fg) => trapJaws(ic, fg),
  trap_fire: (ic, fg) => { flame(ic, 16, 12, 0.75, fg); trapJaws(ic, "#c0c0c8", 6); },
  gear: (ic, fg) => {
    ic.part(fg, "metal", (g) => { circ(g, 16, 16, 9); for (let i = 0; i < 8; i++) rot(g, 16, 16, (i / 8) * Math.PI * 2, () => rect(g, 8, -2.5, 5, 5)); });
    ic.part("#140e0a", "flat", (g) => circ(g, 16, 16, 3.5), { outline: false });
  },
  cloud: (ic, fg) => { cloud(ic, 16, 17, 1.2, fg); skull(ic, 16, 18, 0.45, "#0a200a", "#d8f0c8"); },
  poison_nova: (ic, fg) => { ring(ic, 12, fg, 2); ring(ic, 7.5, fg, 1.4); drop(ic, 16, 15, 0.6, fg); },
  sentry: (ic, fg) => {
    ic.part("#7a7e88", "stone", (g) => P(g, [10, 29, 22, 29, 19, 12, 13, 12]));
    ic.part(GOLD, "gold", (g) => rect(g, 11, 11, 10, 2.5));
    ic.part(fg, "gem", (g) => P(g, [16, 2, 20.5, 6.5, 16, 11, 11.5, 6.5]));
    bolt(ic, [21, 6, 25, 9, 23, 11, 28, 15], fg, 1.4);
  },
  teleport: (ic, fg) => {
    ic.part(deep(fg, 0.5), "glow", (g) => ell(g, 16, 16, 9, 12));
    swirl(ic, fg, 9, 2);
    ic.part("#ffffff", "glow", (g) => circ(g, 16, 16, 2.2), { outline: false });
  },
  // ---- маг: огонь
  fire: (ic, fg) => {
    ic.part(fg, "glow", (g) => { ln(g, 3, 29, 13, 19, 3.2); }, { outline: false });
    ic.part(lite(fg, 0.5), "glow", (g) => { ln(g, 6, 26, 13, 19, 1.4); }, { outline: false });
    ic.part(deep(fg, 0.1), "flame", (g) => circ(g, 18, 14, 8));
    ic.part("#ffe08a", "glow", (g) => circ(g, 19, 13, 4.5), { outline: false });
    ic.part("#ffffff", "glow", (g) => circ(g, 20, 12, 1.8), { outline: false });
  },
  meteor: (ic, fg) => {
    ic.part(fg, "flame", (g) => P(g, [28, 2, 22, 4, 10, 16, 16, 22, 28, 8]), { outline: false });
    ic.part("#5a4038", "stone", (g) => circ(g, 13, 19, 7.5));
    ic.part("#ffb03a", "glow", (g) => { ln(g, 9, 17, 13, 20, 1); ln(g, 13, 20, 16, 16, 1); }, { outline: false });
  },
  firewall: (ic, fg) => { for (let i = 0; i < 3; i++) flame(ic, 8 + i * 8, 18 + (i % 2) * 2, 0.62, fg); ic.part("#3a2018", "stone", (g) => rect(g, 2, 25, 28, 4)); },
  inferno: (ic, fg) => { ring(ic, 12, deep(fg, 0.1), 2.6); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; flame(ic, 16 + Math.cos(a) * 9, 18 + Math.sin(a) * 8, 0.3, fg); } flame(ic, 16, 18, 0.85, "#ffc04a"); },
  hydra: (ic, fg) => {
    ic.part(deep(fg, 0.15), "flame", (g) => { g.lineWidth = 3; for (const [x, y] of [[7, 7], [16, 4], [25, 7]]) { g.beginPath(); g.moveTo(16, 28); g.quadraticCurveTo(16 + (x - 16) * 0.2, 16, x, y + 3); g.stroke(); } });
    for (const [x, y] of [[7, 7], [16, 4], [25, 7]]) { ic.part(fg, "flame", (g) => { ell(g, x, y + 2, 3, 2.2); }); ic.dot(x - 1, y + 1, "#ffffff"); }
  },
  mastery_fire: (ic, fg) => emblemCircle(ic, fg, (ic) => flame(ic, 16, 18, 0.88, fg)),
  // ---- маг: холод
  frost: (ic, fg) => snowflake(ic, 16, 16, 12, fg),
  ice_bolt: (ic, fg) => {
    ic.part(fg, "glow", (g) => { ln(g, 3, 29, 12, 20, 2.4); }, { outline: false });
    ic.part(lite(fg, 0.2), "glass", (g) => rot(g, 17, 15, -Math.PI / 4, () => P(g, [-6, -3, 8, -2, 14, 0, 8, 2, -6, 3, -3, 0])));
  },
  spike: (ic, fg) => {
    ic.part(lite(fg, 0.2), "glass", (g) => { P(g, [16, 2, 21, 27, 11, 27]); P(g, [8, 12, 11, 27, 5, 27]); P(g, [25, 14, 27, 27, 21, 27]); });
    ic.part("#aab8c8", "stone", (g) => rect(g, 2, 26, 28, 4));
  },
  ice_armor: (ic, fg) => { breastplate(ic, lite(fg, 0.25), "glass"); for (const [x, y] of [[9, 9], [23, 12], [16, 22]]) ic.dot(x, y, "#ffffff"); },
  blizzard: (ic, fg) => { cloud(ic, 16, 9, 1, "#8a9aaa"); for (const [x, y] of [[8, 20], [16, 25], [24, 20], [12, 29], [21, 29]]) snowflake(ic, x, y, 2.6, fg); },
  shards: (ic, fg) => { for (let i = 0; i < 5; i++) ic.part(lite(fg, 0.15), "glass", (g) => rot(g, 16, 28, -Math.PI / 2 + (i - 2) * 0.38, () => P(g, [3, -1.6, 20, 0, 3, 1.6]))); },
  orb: (ic, fg) => {
    rays(ic, 16, 16, 9, 14, 8, fg, 2, Math.PI / 8);
    ic.part(lite(fg, 0.2), "glass", (g) => circ(g, 16, 16, 8));
    snowflake(ic, 16, 16, 5, "#ffffff");
  },
  mastery_cold: (ic, fg) => emblemCircle(ic, fg, (ic) => snowflake(ic, 16, 16, 10.5, fg)),
  // ---- маг: молния и тайное
  spark: (ic, fg) => { bolt(ic, [18, 2, 11, 15, 18, 15, 12, 30], fg, 3); for (const [x, y] of [[23, 9], [7, 21], [24, 23]]) ic.dot(x, y, fg); },
  chain: (ic, fg) => {
    for (const [x, y] of [[5, 8], [17, 22], [27, 9]]) ic.part(fg, "glow", (g) => circ(g, x, y, 2.6));
    bolt(ic, [5, 8, 9, 14, 8, 17, 13, 18, 17, 22], fg, 1.6);
    bolt(ic, [17, 22, 21, 17, 20, 14, 25, 13, 27, 9], fg, 1.6);
  },
  storm: (ic, fg) => { cloud(ic, 16, 9, 1.05, "#4a4e60"); bolt(ic, [17, 14, 12, 22, 18, 22, 14, 30], fg, 2.4); },
  mastery_light: (ic, fg) => emblemCircle(ic, fg, (ic) => bolt(ic, [19, 4, 12, 16, 20, 16, 13, 28], fg, 3.2)),
  arcane: (ic, fg) => {
    ring(ic, 12, fg, 1.4);
    ic.part(fg, "glow", (g) => { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5, b = -Math.PI / 2 + ((i + 1) * 4 * Math.PI) / 5; ln(g, 16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 16 + Math.cos(b) * 11, 16 + Math.sin(b) * 11, 1.4); } });
    ic.part("#ffffff", "glow", (g) => circ(g, 16, 16, 2.4), { outline: false });
  },
  mastery: (ic, fg) => {
    ic.part("#6a2a3a", "leather", (g) => P(g, [3, 12, 15, 9, 16, 28, 4, 27]));
    ic.part("#6a2a3a", "leather", (g) => P(g, [29, 12, 17, 9, 16, 28, 28, 27]));
    ic.part(BONE, "bone", (g) => { P(g, [5, 12, 15, 10, 15.5, 25, 6, 25]); P(g, [27, 12, 17, 10, 16.5, 25, 26, 25]); }, { outline: false });
    rays(ic, 16, 6, 2, 6, 7, fg, 1.2, Math.PI);
  },
  mana: (ic, fg) => { drop(ic, 16, 14, 1.3, fg); rays(ic, 24, 7, 1, 3.5, 4, "#ffffff", 1); },
  // ---- некромант
  skeleton: (ic, fg) => {
    skull(ic, 16, 10, 0.9, "#7aff9a");
    ic.part(fg, "bone", (g) => { rect(g, 15, 17, 2, 10); for (let i = 0; i < 3; i++) rect(g, 10, 18 + i * 3, 12, 1.6); });
    ic.part("#3a5a2a", "stone", (g) => P(g, [2, 30, 6, 27, 12, 29, 20, 27, 26, 29, 30, 27, 30, 32, 2, 32]));
  },
  skeleton_mage: (ic, fg) => { skull(ic, 14, 13, 1, fg); ic.part(WOOD, "wood", (g) => ln(g, 26, 29, 26, 6, 2)); ic.part(fg, "gem", (g) => circ(g, 26, 5, 3)); },
  army: (ic, fg) => { skull(ic, 9, 18, 0.6, "#7aff9a"); skull(ic, 23, 18, 0.6, "#7aff9a"); skull(ic, 16, 12, 0.75, "#7aff9a"); void fg; },
  golem: (ic, fg) => golemFig(ic, fg),
  golem_blood: (ic, fg) => { golemFig(ic, deep(fg, 0.15)); for (const [x, y] of [[13, 14], [19, 17], [16, 24]]) ic.part("#ff6a6a", "liquid", (g) => ell(g, x, y, 1, 1.6), { outline: false }); },
  spear: (ic, fg) => {
    ic.part(fg, "bone", (g) => rot(g, 15, 17, -Math.PI / 4, () => P(g, [-14, -1.4, 6, -2.4, 14, 0, 6, 2.4, -14, 1.4])));
    ic.part(deep(fg, 0.3), "bone", (g) => rot(g, 15, 17, -Math.PI / 4, () => { for (const x of [-10, -5, 0]) rect(g, x, -2, 1.2, 4); }), { outline: false });
    ic.part("#b06aff", "glow", (g) => { ln(g, 3, 25, 7, 21, 1.4); ln(g, 6, 28, 9, 24, 1.2); }, { outline: false });
  },
  corpse: (ic, fg) => { rays(ic, 16, 16, 6, 14, 10, fg, 2); skull(ic, 16, 15, 0.85, "#ff8a2a"); },
  prison: (ic, fg) => {
    ic.part(fg, "bone", (g) => { for (let i = 0; i < 5; i++) { g.lineWidth = 2; g.beginPath(); g.moveTo(5 + i * 5.5, 29); g.quadraticCurveTo(16, 0, 27 - i * 5.5, 29); g.stroke(); } });
    ic.part("#4a3a2a", "stone", (g) => rect(g, 2, 27, 28, 4));
  },
  spirit: (ic, fg) => { ic.part("#b06aff", "glow", (g) => { ln(g, 3, 29, 12, 20, 3); }, { outline: false }); skull(ic, 18, 13, 0.95, "#d07aff", fg); },
  mastery_bone: (ic, fg) => emblemCircle(ic, fg, (ic) => skull(ic, 16, 13.5, 1, "#7aff9a")),
  soul: (ic, fg) => ghost(ic, 16, 16, 1.3, fg),
  curse: (ic, fg) => {
    ic.part(fg, "glow", (g) => { g.lineWidth = 1.6; g.beginPath(); g.moveTo(16, 3); g.lineTo(29, 26); g.lineTo(3, 26); g.closePath(); g.stroke(); });
    ic.part("#e8d8f0", "bone", (g) => ell(g, 16, 18, 6.5, 4));
    ic.part(fg, "gem", (g) => circ(g, 16, 18, 2.8), { outline: false });
    ic.part("#0a0010", "flat", (g) => ell(g, 16, 18, 0.9, 2.2), { outline: false });
  },
  pact: (ic, fg) => {
    ic.part(fg, "glow", (g) => { arc(g, 16, 16, 12, 0, Math.PI * 2, 1.2); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5, b = -Math.PI / 2 + ((i + 1) * 4 * Math.PI) / 5; ln(g, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 16 + Math.cos(b) * 12, 16 + Math.sin(b) * 12, 1.2); } }, { outline: false });
    hand(ic, 16, 18, "#d8b0a0");
    drop(ic, 16, 25, 0.35, BLOOD);
  },
  weaken: (ic, fg) => { sword(ic, 20, 8, Math.PI * 3 / 4, 14, { color: "#8a8e98", guard: IRON }); ic.part(fg, "glow", (g) => { ln(g, 6, 6, 6, 22, 2.4); P(g, [2, 20, 10, 20, 6, 27]); }); },
  mastery_curse: (ic, fg) => emblemCircle(ic, fg, (ic) => { ic.part("#e8d8f0", "bone", (g) => ell(g, 16, 16, 9, 5)); ic.part(fg, "gem", (g) => circ(g, 16, 16, 3.6), { outline: false }); ic.part("#0a0010", "flat", (g) => ell(g, 16, 16, 1.1, 3), { outline: false }); }),
  doom: (ic, fg) => { ring(ic, 13, deep(fg, 0.2), 2.4); skull(ic, 16, 14, 1.05, fg, "#c8b8c0"); },
  // ---- жрец
  heal: (ic, fg) => { crossShape(ic, 16, 16, 1, fg, "glow"); rays(ic, 16, 16, 12, 14.5, 8, lite(fg, 0.3), 1.2, Math.PI / 8); },
  renew: (ic, fg) => {
    ic.part("#5a8a3a", "wood", (g) => { g.lineWidth = 2; g.beginPath(); g.moveTo(16, 29); g.quadraticCurveTo(13, 18, 16, 10); g.stroke(); });
    ic.part(fg, "cloth", (g) => { ell(g, 11, 15, 5, 2.6, -0.6); ell(g, 21, 12, 5, 2.6, 0.6); ell(g, 16, 7, 2.6, 4); });
    ring(ic, 13, fg, 1);
  },
  holy: (ic, fg) => { rays(ic, 16, 16, 9, 14, 12, fg, 1.4); crossShape(ic, 16, 16, 0.75, GOLD); },
  smite: (ic, fg) => {
    ic.part(fg, "glow", (g) => P(g, [11, 0, 21, 0, 19, 24, 13, 24]));
    ic.part("#ffffff", "glow", (g) => rect(g, 15, 0, 2, 24), { outline: false });
    ic.part("#6a5a48", "stone", (g) => rect(g, 2, 26, 28, 4));
    rays(ic, 16, 25, 3, 8, 6, fg, 1.4, Math.PI);
  },
  bane: (ic, fg) => { rays(ic, 22, 10, 4, 9, 10, fg, 1.4); skull(ic, 12, 20, 0.75, "#ff4a3a", "#a89880"); },
  sanctuary: (ic, fg) => {
    ic.part(fg, "glow", (g) => { g.lineWidth = 2; g.beginPath(); g.arc(16, 26, 13, Math.PI, 0); g.stroke(); });
    ic.part(lite(fg, 0.1), "glow", (g) => { g.globalAlpha = 1; rect(g, 3, 25, 26, 2.6); });
    crossShape(ic, 16, 18, 0.5, GOLD);
  },
  devotion: (ic, fg) => hands(ic, fg),
  spirit_holy: (ic, fg) => {
    ic.part(lite(fg, 0.2), "cloth", (g) => { P(g, [16, 12, 3, 6, 5, 14, 2, 18, 9, 20, 16, 17]); P(g, [16, 12, 29, 6, 27, 14, 30, 18, 23, 20, 16, 17]); });
    figure(ic, 16, 16, 0.85, "#fff8e0", "glow");
    ic.part(GOLD, "gold", (g) => arc(g, 16, 6, 3.5, 0, Math.PI * 2, 1.2));
  },
  hammer: (ic, fg) => { swirl(ic, deep(fg, 0.1), 12, 1.6); hammer(ic, 15, 17, -Math.PI / 4, fg, true); },
  judgement: (ic, fg) => { rays(ic, 16, 16, 5, 15, 16, fg, 1.4); sword(ic, 16, 27, -Math.PI / 2, 18, { color: "#fff3c0" }); },
  aura_red: (ic, fg) => aura(ic, fg, (ic) => sword(ic, 16, 23, -Math.PI / 2, 9, { w: 1.2 })),
  aura_grey: (ic, fg) => aura(ic, fg, (ic) => shieldShape(ic, 16, 16, 0.42, "#5a5a6a", STEEL)),
  aura_fire: (ic, fg) => aura(ic, fg, (ic) => flame(ic, 16, 17, 0.42, fg)),
  aura_green: (ic, fg) => aura(ic, fg, (ic) => crossShape(ic, 16, 16, 0.42, fg, "glow")),
  aura_blue: (ic, fg) => aura(ic, fg, (ic) => { ic.part(fg, "glow", (g) => { P(g, [10, 12, 15, 16, 10, 20]); P(g, [16, 12, 21, 16, 16, 20]); }); }),
  aura_white: (ic, fg) => aura(ic, fg, (ic) => { ic.part(fg, "glow", (g) => P(g, [16, 9, 19, 16, 16, 23, 13, 16])); }),
};

// ---------------------------------------------------------------- составные мелочи

function mouth(ic: Icon, inside = "#3a0a0a") {
  ic.part("#c8a088", "leather", (g) => { circ(g, 10, 16, 8); });
  ic.part(inside, "flat", (g) => ell(g, 11.5, 18.5, 3.5, 4), { outline: false });
  ic.part("#f0e8d8", "bone", (g) => { rect(g, 8.5, 14.5, 6, 1.4); rect(g, 8.5, 22, 6, 1.4); }, { outline: false });
  ic.part("#1a120c", "flat", (g) => { ln(g, 6, 10, 10, 12, 1.4); ln(g, 13, 11, 15, 10, 1.4); }, { outline: false });
}

function heart(ic: Icon, fg: string) {
  ic.part(fg, "liquid", (g) => { g.beginPath(); g.moveTo(16, 28); g.bezierCurveTo(2, 18, 2, 6, 10, 6); g.bezierCurveTo(13, 6, 15, 8, 16, 11); g.bezierCurveTo(17, 8, 19, 6, 22, 6); g.bezierCurveTo(30, 6, 30, 18, 16, 28); g.fill(); });
}

function horns(ic: Icon) {
  ic.part(BONE, "bone", (g) => { P(g, [9, 10, 3, 2, 6, 11]); P(g, [23, 10, 29, 2, 26, 11]); });
}

function fist(ic: Icon, x: number, y: number, skin: string) {
  ic.part(skin, "leather", (g) => { rect(g, x - 6, y - 4, 12, 9); for (let i = 0; i < 4; i++) circ(g, x - 4.5 + i * 3, y - 4, 1.7); rect(g, x - 4, y + 5, 8, 5); });
  ic.part("#5a3a22", "leather", (g) => rect(g, x - 4.5, y + 7, 9, 3));
}

function breastplate(ic: Icon, color: string, mat: "metal" | "glass" = "metal") {
  ic.part(color, mat, (g) => P(g, [9, 3, 13, 6, 19, 6, 23, 3, 29, 8, 26, 15, 24, 13, 24, 28, 8, 28, 8, 13, 6, 15, 3, 8]));
  ic.part(lite(color, 0.4), mat, (g) => rect(g, 15.5, 7, 1.2, 20), { outline: false });
  ic.part(GOLD, "gold", (g) => { rect(g, 8, 22, 16, 2); circ(g, 12.5, 11, 1.1); circ(g, 19.5, 11, 1.1); });
}

function knife(ic: Icon, x: number, y: number, a: number, s: number) {
  ic.part("#3a2a1e", "leather", (g) => rot(g, x, y, a, () => rect(g, -4 * s, -1 * s, 3.5 * s, 2 * s)));
  ic.part(STEEL, "metal", (g) => rot(g, x, y, a, () => P(g, [0, -1.6 * s, 8 * s, -1.4 * s, 12 * s, 0, 8 * s, 1.4 * s, 0, 1.6 * s])));
  ic.part(IRON, "metal", (g) => rot(g, x, y, a, () => rect(g, -0.6 * s, -2.6 * s, 1.2 * s, 5.2 * s)));
}

function hoodFig(ic: Icon, x: number, y: number, color: string, eye: string, s = 1) {
  ic.part(color, "cloth", (g) => { P(g, [x, y - 13 * s, x + 6 * s, y - 7 * s, x + 7 * s, y - 1 * s, x + 10 * s, y + 13 * s, x - 10 * s, y + 13 * s, x - 7 * s, y - 1 * s, x - 6 * s, y - 7 * s]); });
  ic.part("#06040a", "flat", (g) => ell(g, x, y - 5 * s, 3.6 * s, 4 * s), { outline: false });
  ic.dot(x - 1.5 * s, y - 5 * s, eye); ic.dot(x + 1.5 * s, y - 5 * s, eye);
}

function trapJaws(ic: Icon, fg: string, dy = 0) {
  ic.part("#5a5e68", "metal", (g) => ell(g, 16, 22 + dy * 0.3, 13, 4));
  ic.part(fg, "metal", (g) => { for (let i = 0; i < 7; i++) P(g, [5 + i * 3.6, 21 + dy * 0.3, 6.8 + i * 3.6, 13 + dy * 0.6, 8.6 + i * 3.6, 21 + dy * 0.3]); });
  ic.part("#3a3e48", "metal", (g) => circ(g, 16, 22 + dy * 0.3, 2.2));
}

function boot(ic: Icon, x: number, y: number, color: string) {
  ic.part(color, "metal", (g) => P(g, [x - 5, y - 9, x + 3, y - 9, x + 3, y + 4, x + 10, y + 6, x + 11, y + 11, x - 6, y + 11, x - 5, y + 3]));
  ic.part("#2a1a10", "dark", (g) => rect(g, x - 7, y + 10, 19, 3));
}

function hand(ic: Icon, x: number, y: number, skin: string) {
  ic.part(skin, "leather", (g) => { rect(g, x - 5, y - 4, 10, 10); for (let i = 0; i < 4; i++) rect(g, x - 5 + i * 2.6, y - 12 + (i === 1 || i === 2 ? 0 : 2), 2.2, 9); P(g, [x + 5, y - 2, x + 9, y - 6, x + 10, y - 4, x + 6, y + 2]); });
}

function hands(ic: Icon, fg: string) {
  rays(ic, 16, 10, 6, 13, 9, fg, 1.2, Math.PI);
  ic.part("#e0c0a0", "leather", (g) => { P(g, [16, 4, 18, 6, 19, 22, 16, 26]); P(g, [16, 4, 14, 6, 13, 22, 16, 26]); });
  ic.part("#d8cdb2", "cloth", (g) => { P(g, [10, 22, 16, 24, 22, 22, 25, 30, 7, 30]); });
}
