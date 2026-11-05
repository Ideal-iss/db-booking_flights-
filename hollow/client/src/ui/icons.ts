/** Пиксельные иконки предметов и навыков (рисуются из строковых карт, без внешних файлов). */

const PAL: Record<string, string> = {
  k: "#0b0806", m: "#d8dce4", M: "#8a8e98", w: "#8a6a44", W: "#5a3f26", g: "#e0b84a", G: "#9a7a2a",
  r: "#c8343a", R: "#7a1a20", b: "#5a8ae0", B: "#e8dcc0", l: "#9a6a3a", L: "#6a4424", c: "#7a6a5a",
  p: "#b06aff", e: "#6ad06a", o: "#ff8a2a", y: "#fff3a0", s: "#5a5a5a", d: "#2a2a2a", i: "#9adfff", n: "#3a2a4a",
};

const ITEMS: Record<string, string[]> = {
  sword: [
    "...........kk", "..........kmk", ".........kmMk", "........kmMk.", ".......kmMk..", "......kmMk...",
    "..kk.kmMk....", "..kgkmMk.....", "...kgMk......", "...kWgk......", "..kWkkgk.....", ".kWk..kk.....", ".kk..........",
  ],
  axe: [
    "......kkkk...", ".....kmmMMk..", "....kmmMMMk..", "....kmMkkMk..", ".....kkWkkk..", ".....kWk.....", "....kWk......",
    "...kWk.......", "..kWk........", ".kWk.........", "kWk..........", "kk...........", ".............",
  ],
  mace: [
    ".......kkk...", "......kmMMk..", ".....kmMMMk..", ".....kMMMMk..", "......kMMk...", ".....kWkk....", "....kWk......",
    "...kWk.......", "..kWk........", ".kgk.........", "kWk..........", "kk...........", ".............",
  ],
  dagger: [
    ".............", ".............", "........kk...", ".......kmk...", "......kmMk...", ".....kmMk....", "....kmMk.....",
    "..kkkMk......", "..kggk.......", "...kWk.......", "..kWk........", "..kk.........", ".............",
  ],
  bow: [
    "....kkk......", "...kwWk.k....", "..kwk..kBk...", "..kwk...kBk..", ".kwk.....kB..", ".kwk.....kB..", ".kWk.....kB..",
    ".kwk.....kB..", ".kwk.....kB..", "..kwk...kBk..", "..kwk..kBk...", "...kwWk.k....", "....kkk......",
  ],
  staff: [
    "..........kk.", ".........kik.", "........kiyik", ".........kgk.", "........kWk..", ".......kWk...", "......kWk....",
    ".....kWk.....", "....kWk......", "...kWk.......", "..kWk........", ".kWk.........", ".kk..........",
  ],
  wand: [
    ".............", "..........ke.", ".........kek.", "........kBk..", ".......kBk...", "......kBk....", ".....kBk.....",
    "....kBk......", "...kBk.......", "..kBk........", "..kk.........", ".............", ".............",
  ],
  shield: [
    ".kkkkkkkkkk..", ".kMMMMMMMMk..", ".kMwwwwwwMk..", ".kMwwmmwwMk..", ".kMwmMMmwMk..", ".kMwwmmwwMk..", ".kMwwwwwwMk..",
    "..kMwwwwMk...", "..kMwwwwMk...", "...kMwwMk....", "....kMMk.....", ".....kk......", ".............",
  ],
  tome: [
    ".............", "..kkkkkkkk...", ".kRrrrrrrRk..", ".kRrgggrrRBk.", ".kRrgrgrrRBk.", ".kRrgggrrRBk.", ".kRrrrrrrRBk.",
    ".kRrrrrrrRBk.", ".kRrrrrrrRBk.", ".kRRRRRRRRBk.", "..kkkkkkkkk..", ".............", ".............",
  ],
  skull: [
    ".............", "....kkkkk....", "...kBBBBBk...", "..kBBBBBBBk..", "..kBkkBkkBk..", "..kBkekBekk..", "..kBBBkBBBk..",
    "...kBBBBBk...", "...kBkBkBk...", "....kkkkk....", ".............", ".............", ".............",
  ],
  symbol: [
    ".....kkk.....", ".....kgk.....", ".....kgk.....", "..kkkkgkkkk..", "..kggggggGk..", "..kkkkgkkkk..", ".....kgk.....",
    ".....kgk.....", ".....kgk.....", ".....kGk.....", ".....kkk.....", ".............", ".............",
  ],
  helmet: [
    ".............", "....kkkkk....", "...kmmmmMk...", "..kmmmmmMMk..", "..kmMMMMMMk..", "..kMkkkkkMk..", "..kMkdddkMk..",
    "..kMMkdkMMk..", "..kMMkdkMMk..", "...kkk.kkk...", ".............", ".............", ".............",
  ],
  hood: [
    ".............", "....kkkk.....", "...kccccck...", "..kcccccccck.", "..kcckkkkcck.", "..kckddddkck.", "..kckdiidkck.",
    "..kckddddkck.", "..kcckkkkcck.", "..kcccccccck.", "...kkkkkkkk..", ".............", ".............",
  ],
  chest: [
    ".............", "..kkk...kkk..", ".kMMMkkkMMMk.", ".kMmmmmmmmMk.", ".kMmmMMMmmMk.", "..kmmmmmmmk..", "..kmmMMMmmk..",
    "..kmmmmmmmk..", "..kMmmmmmMk..", "..kMMMMMMMk..", "...kkkkkkk...", ".............", ".............",
  ],
  robe: [
    ".............", "...kkk.kkk...", "..kccckccck..", ".kccccgcccck.", ".kckccgccckck", "..kkccgcckk..", "...kccgcck...",
    "...kccgcck...", "..kcccgccck..", "..kcccgccck..", ".kccccgcccck.", ".kkkkkkkkkkk.", ".............",
  ],
  gloves: [
    ".............", ".............", "....k.k.k....", "...klklklk...", "...klklklk.k.", "...klllllkklk", "...kllllllllk",
    "...klllllllk.", "...kLLLLLLk..", "...kllllllk..", "...kkkkkkk...", ".............", ".............",
  ],
  boots: [
    ".............", "...kkkk......", "...kllk......", "...kllk......", "...kllk......", "...kllk......", "...kllkk.....",
    "...klllkkk...", "...kllllllk..", "...kLLLLLLk..", "...kkkkkkkk..", ".............", ".............",
  ],
  amulet: [
    "..k.......k..", "..kg.....gk..", "...kg...gk...", "....kg.gk....", ".....kgk.....", "....kgggk....", "...kgrrrgk...",
    "...kgrRrgk...", "...kgrrrgk...", "....kgggk....", ".....kkk.....", ".............", ".............",
  ],
  ring: [
    ".............", ".............", ".....kkk.....", "....kbbbk....", ".....kbk.....", "....kgkgk....", "...kgk.kgk...",
    "...kgk.kgk...", "...kgk.kgk...", "....kgggk....", ".....kkk.....", ".............", ".............",
  ],
  health: [
    ".............", ".....kkk.....", ".....kBk.....", ".....kBk.....", "....kkkkk....", "...krrrrrk...", "..krrrrrrrk..",
    "..krryrrrrk..", "..krrrrrrrk..", "..kRrrrrrRk..", "...kRRRRRk...", "....kkkkk....", ".............",
  ],
  mana: [
    ".............", ".....kkk.....", ".....kBk.....", ".....kBk.....", "....kkkkk....", "...kbbbbbk...", "..kbbbbbbbk..",
    "..kbbibbbbk..", "..kbbbbbbbk..", "..knbbbbbnk..", "...knnnnnk...", "....kkkkk....", ".............",
  ],
};

const cache = new Map<string, string>();

function render(map: string[], scale: number, tint?: string): string {
  const h = map.length, w = map[0].length;
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext("2d")!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = map[y][x];
      if (ch === ".") continue;
      g.fillStyle = tint && ch === "c" ? tint : PAL[ch] || "#f0f";
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  return c.toDataURL();
}

export function itemIcon(icon: string, tint?: string): string {
  const key = `${icon}:${tint || ""}`;
  let url = cache.get(key);
  if (!url) {
    url = render(ITEMS[icon] || ITEMS.ring, 4, tint);
    cache.set(key, url);
  }
  return url;
}

/** Иконки навыков: рамка цвета стихии + пиктограмма из примитивов. */
const SKILL_COLORS: Record<string, [string, string]> = {
  cleave: ["#c8c0b0", "#5a2a24"], rage: ["#ff4a3a", "#3a0a0a"], whirl: ["#d8dce4", "#3a2a24"], execute: ["#ff2a2a", "#2a0a0a"],
  armor: ["#a8a8b0", "#2a2a30"], blood: ["#c8343a", "#2a0a0a"], bash: ["#c9a46a", "#2a2010"], charge: ["#e0c070", "#3a2a10"],
  taunt: ["#ff8a2a", "#3a1a0a"], fortress: ["#9adfff", "#102030"], shield: ["#c9a46a", "#202020"], thorns: ["#8ab05a", "#1a2a10"],
  knives: ["#d8dce4", "#202028"], shadow: ["#9a6aff", "#100a20"], poison: ["#8aff6a", "#0a200a"], smoke: ["#a0a0a0", "#1a1a1a"],
  crit: ["#ff5a5a", "#200a0a"], evade: ["#9ad0ff", "#0a1520"], fire: ["#ff8a2a", "#2a0a00"], frost: ["#8fd0ff", "#0a1a2a"],
  arcane: ["#d87aff", "#1a0a2a"], meteor: ["#ffb03a", "#2a0a00"], mastery: ["#ffe9a0", "#1a1a2a"], mana: ["#5a8ae0", "#0a102a"],
  skeleton: ["#e8dcc0", "#0a1a0a"], spear: ["#e8dcc0", "#1a0a2a"], corpse: ["#c8343a", "#1a0a0a"], curse: ["#b06aff", "#100a1a"],
  soul: ["#7aff9a", "#0a1a10"], pact: ["#b06aff", "#1a0a10"], heal: ["#7fe07f", "#0a1a0a"], holy: ["#ffe9a0", "#2a2410"],
  sanctuary: ["#ffe9a0", "#1a1a10"], smite: ["#fff3a0", "#2a2410"], bane: ["#ffe9a0", "#1a0a0a"], devotion: ["#d8cdb2", "#1a1410"],
  mastery_blade: ["#d8dce4", "#2a2420"], double: ["#e0e0e8", "#2a1a14"], quake: ["#c9a46a", "#2a1a0a"], leap: ["#e0c070", "#1a1a24"],
  titan: ["#ffd06a", "#2a1a0a"], shout: ["#ffb04a", "#2a140a"], heart: ["#e0505a", "#1a0a0a"], roar: ["#ff7a3a", "#2a0a0a"],
  fear: ["#9a6aff", "#100a1a"], banner: ["#c8343a", "#1a1410"], resist: ["#8fd0ff", "#1a1a1a"], thunder: ["#ffe06a", "#1a1420"],
  frenzy: ["#ff5a3a", "#2a0a0a"], leech: ["#c8343a", "#0a0a0a"], rend: ["#ff3a3a", "#1a0a0a"], skull_red: ["#ff4a3a", "#140a0a"],
  berserk: ["#b06aff", "#2a0a0a"], avatar: ["#ffd06a", "#3a0a0a"], shield_throw: ["#c9a46a", "#1a1a24"], wall: ["#a8a8b0", "#1a1a24"],
  aegis: ["#9adfff", "#1a1a10"], zeal: ["#ffe9a0", "#2a1a0a"], trample: ["#e0c070", "#2a140a"], riposte: ["#d8dce4", "#101820"],
  crush: ["#e0c070", "#2a0a0a"], aura_red: ["#ff5a4a", "#1a0a0a"], aura_grey: ["#c8c8d0", "#141418"], aura_fire: ["#ff8a2a", "#1a0a00"],
  aura_green: ["#7fe07f", "#0a1a0a"], aura_blue: ["#7ab8ff", "#0a1020"], aura_white: ["#fff8e0", "#1a1a1a"], throw: ["#d8dce4", "#1a1420"],
  vial: ["#8aff6a", "#101a10"], trap: ["#c8c8d0", "#1a1a1a"], cloud: ["#6aff5a", "#0a140a"], trap_fire: ["#ff8a2a", "#1a1010"],
  gear: ["#c9a46a", "#141414"], poison_nova: ["#8aff6a", "#0a1a0a"], sentry: ["#bfe4ff", "#0a1020"], veil: ["#8a6aff", "#0a0a14"],
  teleport: ["#d87aff", "#100a20"], clone: ["#6a6aa0", "#0a0a14"], firewall: ["#ff7a2a", "#1a0800"], mastery_fire: ["#ff8a2a", "#140a0a"],
  inferno: ["#ffb03a", "#2a0800"], hydra: ["#ff6a2a", "#140a00"], ice_bolt: ["#8fd0ff", "#0a1420"], ice_armor: ["#bfe4ff", "#0a1420"],
  spike: ["#8fd0ff", "#101a2a"], mastery_cold: ["#8fd0ff", "#0a0a1a"], blizzard: ["#d0ecff", "#0a1a2a"], shards: ["#aee0ff", "#0a1020"],
  orb: ["#bfe4ff", "#0a1a2a"], spark: ["#ffe96a", "#141020"], chain: ["#bfe4ff", "#0a0a20"], mastery_light: ["#ffe96a", "#0a0a1a"],
  storm: ["#bfe4ff", "#14141a"], skeleton_mage: ["#b06aff", "#0a1a0a"], golem: ["#a8865a", "#1a140a"], army: ["#e8dcc0", "#0a140a"],
  golem_blood: ["#c8343a", "#1a0a0a"], mastery_bone: ["#e8dcc0", "#140a1a"], prison: ["#e8dcc0", "#1a1a14"], spirit: ["#e8dcc0", "#1a0a2a"],
  mastery_curse: ["#b06aff", "#0a0a0a"], weaken: ["#8a8aff", "#0a0a14"], doom: ["#ff3a4a", "#0a0014"], renew: ["#7fe07f", "#101a10"],
  spirit_holy: ["#fff3a0", "#1a1a24"], hammer: ["#ffe9a0", "#1a1410"], judgement: ["#fff3a0", "#2a1a0a"],
};

export function skillIcon(icon: string): string {
  const key = `skill:${icon}`;
  let url = cache.get(key);
  if (url) return url;
  const [fg, bg] = SKILL_COLORS[icon] || ["#d8cdb2", "#1a1410"];
  const s = 4, n = 12;
  const c = document.createElement("canvas");
  c.width = c.height = n * s;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, n * s, n * s);
  const px = (x: number, y: number, col = fg) => {
    g.fillStyle = col;
    g.fillRect(x * s, y * s, s, s);
  };
  const line = (x0: number, y0: number, x1: number, y1: number, col = fg) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) px(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), col);
  };
  const circle = (cx: number, cy: number, r: number, col = fg, fill = false) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (fill ? d <= r : Math.abs(d - r) < 0.6) px(x, y, col);
    }
  };
  switch (icon) {
    case "cleave": case "execute": line(2, 9, 9, 2); line(3, 9, 10, 2); line(1, 6, 5, 10, "#ffffff"); break;
    case "whirl": circle(5.5, 5.5, 4); circle(5.5, 5.5, 2); px(9, 2); px(2, 9); break;
    case "rage": case "blood": circle(5.5, 6, 3, fg, true); line(5, 1, 6, 3); px(4, 2); px(7, 2); break;
    case "armor": case "shield": case "fortress": line(2, 2, 9, 2); line(2, 2, 2, 6); line(9, 2, 9, 6); line(2, 6, 5, 9); line(9, 6, 6, 9); px(5, 5); px(6, 5); break;
    case "bash": circle(5.5, 5.5, 3); line(1, 1, 3, 3); line(10, 1, 8, 3); break;
    case "charge": line(1, 5, 9, 5); line(1, 6, 9, 6); line(7, 3, 10, 5); line(7, 8, 10, 6); break;
    case "taunt": line(5, 1, 5, 7); line(6, 1, 6, 7); px(5, 9); px(6, 9); break;
    case "thorns": circle(5.5, 5.5, 3); for (const [x, y] of [[5, 0], [5, 11], [0, 5], [11, 5], [1, 1], [10, 10], [10, 1], [1, 10]]) px(x, y); break;
    case "knives": for (let i = 0; i < 3; i++) line(2 + i * 3, 10, 2 + i * 3 + (i - 1) * 2, 2); break;
    case "shadow": circle(5, 4, 2, fg, true); line(3, 7, 3, 10); line(7, 7, 7, 10); line(3, 7, 7, 7); break;
    case "poison": line(5, 1, 5, 7); circle(5, 8, 2, fg, true); break;
    case "smoke": circle(4, 6, 2.5, fg, true); circle(7, 5, 2.5, fg, true); circle(6, 8, 2, fg, true); break;
    case "crit": line(2, 2, 9, 9); line(9, 2, 2, 9); circle(5.5, 5.5, 4.5); break;
    case "evade": line(2, 9, 5, 2); line(5, 2, 9, 9); line(4, 6, 7, 6); break;
    case "fire": case "meteor": circle(5.5, 7, 3, fg, true); line(5, 1, 5, 5); line(7, 2, 7, 5); px(3, 3); if (icon === "meteor") line(9, 1, 7, 4, "#ffffff"); break;
    case "frost": line(5, 1, 5, 10); line(6, 1, 6, 10); line(1, 5, 10, 5); line(2, 2, 9, 9); line(9, 2, 2, 9); break;
    case "arcane": case "mastery": circle(5.5, 5.5, 4); circle(5.5, 5.5, 1.5, fg, true); break;
    case "mana": circle(5.5, 7, 3, fg, true); line(5, 2, 6, 4); break;
    case "skeleton": case "soul": circle(5.5, 4.5, 3, fg, true); px(4, 4, bg); px(7, 4, bg); line(4, 8, 7, 8); line(4, 9, 7, 9); break;
    case "spear": line(1, 10, 10, 1); px(9, 1); px(10, 2); break;
    case "corpse": line(1, 8, 10, 8); circle(5.5, 5, 2.5); for (const [x, y] of [[2, 2], [9, 2], [1, 5], [10, 5]]) px(x, y); break;
    case "curse": case "pact": circle(5.5, 5.5, 4); line(3, 3, 8, 8); line(8, 3, 3, 8); break;
    case "heal": case "devotion": line(5, 2, 5, 9); line(6, 2, 6, 9); line(2, 5, 9, 5); line(2, 6, 9, 6); break;
    case "holy": case "smite": case "bane": line(5, 1, 5, 10); line(6, 1, 6, 10); line(3, 4, 8, 4); circle(5.5, 5.5, 4.5); break;
    case "sanctuary": circle(5.5, 7, 4); line(5, 1, 5, 6); line(3, 3, 8, 3); break;
    case "mastery_blade": case "titan": line(5, 1, 5, 8); line(6, 1, 6, 8); line(3, 8, 8, 8); line(5, 9, 6, 10); if (icon === "titan") circle(5.5, 5.5, 5); break;
    case "double": line(1, 9, 7, 3); line(4, 10, 10, 4); break;
    case "quake": case "crush": line(5, 1, 5, 6); line(6, 1, 6, 6); line(1, 9, 4, 7); line(4, 7, 6, 9); line(6, 9, 10, 7); break;
    case "leap": line(1, 10, 5, 3); line(5, 3, 10, 9); px(5, 2); break;
    case "shout": case "roar": case "thunder": line(1, 4, 3, 4); line(1, 7, 3, 7); line(3, 3, 6, 1); line(3, 8, 6, 10); line(6, 1, 6, 10); for (const x of [8, 9, 10]) px(x, 3 + (x - 8) * 2); break;
    case "heart": circle(4, 4, 2, fg, true); circle(7, 4, 2, fg, true); line(2, 6, 5, 9); line(9, 6, 6, 9); line(3, 6, 8, 6); line(4, 7, 7, 7); break;
    case "fear": circle(5.5, 5, 3.5); px(4, 4); px(7, 4); line(4, 8, 7, 7); break;
    case "banner": line(2, 1, 2, 10); line(3, 2, 9, 2); line(9, 2, 9, 6); line(3, 6, 9, 6); line(9, 6, 7, 8); break;
    case "resist": case "aegis": case "wall": line(2, 2, 9, 2); line(2, 2, 2, 6); line(9, 2, 9, 6); line(2, 6, 5, 9); line(9, 6, 6, 9); line(5, 3, 5, 7); line(6, 3, 6, 7); break;
    case "frenzy": case "zeal": for (let i = 0; i < 3; i++) line(1 + i * 3, 10, 4 + i * 3, 1); break;
    case "leech": circle(5.5, 6, 3, fg, true); line(5, 1, 5, 3); px(2, 9); px(9, 9); break;
    case "rend": for (let i = 0; i < 3; i++) line(2 + i * 3, 1, 4 + i * 2, 10); break;
    case "skull_red": case "berserk": case "doom": circle(5.5, 5, 3.5, fg, true); px(4, 4, bg); px(7, 4, bg); line(4, 9, 7, 9); px(5, 6, bg); break;
    case "avatar": case "judgement": circle(5.5, 5.5, 2, fg, true); for (const [x, y] of [[5, 0], [5, 11], [0, 5], [11, 5], [1, 1], [10, 10], [10, 1], [1, 10]]) line(5.5 as unknown as number, 5, x, y); break;
    case "shield_throw": circle(4, 6, 3); line(7, 3, 10, 1); line(8, 5, 11, 4); break;
    case "trample": case "riposte": line(1, 3, 9, 3); line(1, 8, 9, 8); line(7, 1, 10, 3); line(7, 10, 10, 8); break;
    case "aura_red": case "aura_grey": case "aura_fire": case "aura_green": case "aura_blue": case "aura_white": circle(5.5, 5.5, 4.5); circle(5.5, 5.5, 2.5); circle(5.5, 5.5, 1, fg, true); break;
    case "throw": for (let i = 0; i < 3; i++) line(1, 3 + i * 3, 9, 1 + i * 4); break;
    case "vial": line(4, 1, 7, 1); line(5, 2, 5, 4); line(6, 2, 6, 4); circle(5.5, 7.5, 2.5, fg, true); break;
    case "trap": case "trap_fire": case "gear": circle(5.5, 5.5, 3.5); for (const [x, y] of [[5, 0], [5, 11], [0, 5], [11, 5]]) px(x, y); circle(5.5, 5.5, 1, fg, true); break;
    case "cloud": case "poison_nova": circle(4, 6, 2.5, fg, true); circle(7, 5, 2.5, fg, true); circle(6, 8, 2, fg, true); px(2, 2); px(9, 2); break;
    case "sentry": line(5, 3, 5, 10); line(6, 3, 6, 10); circle(5.5, 2.5, 1.5, fg, true); line(3, 10, 8, 10); break;
    case "veil": case "clone": circle(5, 4, 2, fg, true); line(3, 7, 3, 10); line(7, 7, 7, 10); line(3, 7, 7, 7); circle(8, 5, 1.5); break;
    case "teleport": circle(5.5, 5.5, 4); circle(5.5, 5.5, 2); line(5, 1, 6, 1); line(5, 10, 6, 10); break;
    case "firewall": case "inferno": for (let i = 0; i < 4; i++) line(1 + i * 3, 10, 2 + i * 3, 3 + (i % 2) * 2); line(1, 10, 10, 10); break;
    case "mastery_fire": case "mastery_cold": case "mastery_light": case "mastery_bone": case "mastery_curse": circle(5.5, 5.5, 4); circle(5.5, 5.5, 2, fg, true); break;
    case "hydra": for (let i = 0; i < 3; i++) { line(3 + i * 2, 10, 2 + i * 3, 3); px(2 + i * 3, 2); } break;
    case "ice_bolt": case "spike": line(1, 10, 9, 2); line(2, 10, 10, 2); line(8, 1, 10, 3); break;
    case "ice_armor": line(2, 2, 9, 2); line(2, 2, 2, 6); line(9, 2, 9, 6); line(2, 6, 5, 9); line(9, 6, 6, 9); line(3, 4, 8, 4); break;
    case "blizzard": for (const [x, y] of [[2, 2], [6, 1], [9, 3], [3, 6], [7, 5], [5, 9], [9, 8], [1, 9]]) { px(x, y); px(x + 1, y + 1); } break;
    case "shards": for (let i = 0; i < 5; i++) line(5, 10, 1 + i * 2, 2); break;
    case "orb": circle(5.5, 5.5, 3.5, fg, true); circle(5.5, 5.5, 5); px(5, 5, bg); break;
    case "spark": case "chain": case "storm": line(6, 1, 3, 6); line(3, 6, 7, 6); line(7, 6, 4, 10); if (icon === "storm") { circle(3, 2, 1.5, fg, true); circle(8, 2, 1.5, fg, true); } break;
    case "skeleton_mage": case "spirit": case "army": circle(5.5, 4.5, 3, fg, true); px(4, 4, bg); px(7, 4, bg); line(4, 8, 7, 8); if (icon === "army") { px(1, 9); px(10, 9); px(1, 8); px(10, 8); } if (icon === "skeleton_mage") line(10, 1, 10, 10); break;
    case "golem": case "golem_blood": line(3, 2, 8, 2); line(2, 3, 2, 8); line(9, 3, 9, 8); line(3, 9, 8, 9); px(4, 4); px(7, 4); line(4, 7, 7, 7); break;
    case "prison": for (let i = 0; i < 4; i++) line(2 + i * 2.5 as unknown as number, 2, 2 + i * 2.5 as unknown as number, 10); line(1, 10, 10, 10); break;
    case "weaken": circle(5.5, 5.5, 4); line(3, 7, 8, 4); break;
    case "renew": circle(5.5, 5.5, 4); line(5, 3, 5, 8); line(3, 5, 8, 5); break;
    case "spirit_holy": circle(5.5, 5, 3, fg, true); circle(5.5, 2, 2.5); break;
    case "hammer": line(5, 4, 5, 10); line(6, 4, 6, 10); line(2, 1, 9, 1); line(2, 2, 9, 2); line(2, 3, 9, 3); break;
    default: circle(5.5, 5.5, 3, fg, true);
  }
  // рамка
  g.fillStyle = fg;
  g.globalAlpha = 0.5;
  g.fillRect(0, 0, n * s, 2);
  g.fillRect(0, n * s - 2, n * s, 2);
  g.fillRect(0, 0, 2, n * s);
  g.fillRect(n * s - 2, 0, 2, n * s);
  url = c.toDataURL();
  cache.set(key, url);
  return url;
}
