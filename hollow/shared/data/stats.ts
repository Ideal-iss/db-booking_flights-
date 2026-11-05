/** Уровни, опыт и производные характеристики персонажа. */
import { ATTR_IDS, CLASSES, type Attrs, type ClassId } from "./classes";
import { BASE_BY_ID, itemStats, weaponDamage, type EquipSlot, type Item } from "./items";
import { SKILL_BY_ID } from "./skills";

export const MAX_LEVEL = 40;
export const ATTR_POINTS_PER_LEVEL = 5;
export const SKILL_POINTS_PER_LEVEL = 1;

/** Опыт, нужный для перехода с уровня L на L+1. */
export const xpForLevel = (level: number) => Math.round(80 * level ** 1.75 + 40 * level);

export function levelFromXp(totalXp: number): { level: number; into: number; need: number } {
  let level = 1;
  let xp = totalXp;
  while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
  }
  return { level, into: xp, need: xpForLevel(level) };
}

/** Снимок персонажа — всё, что нужно симуляции и интерфейсу. */
export interface CharacterData {
  id: number;
  name: string;
  cls: ClassId;
  appearance: Appearance;
  level: number;
  xp: number;
  attrs: Attrs;
  attrPoints: number;
  skillPoints: number;
  skills: Record<string, number>;
  /** Навыки на клавишах Q, R, F. */
  hotbar: (string | null)[];
  equipment: Partial<Record<EquipSlot, Item>>;
  inventory: (Item & { pos: number })[];
  stash: (Item & { pos: number })[];
  gold: number;
  potions: { health: number; mana: number };
  quests: QuestState[];
  cleared: string[];
}

export interface Appearance {
  skin: number;
  hair: string;
  hairColor: number;
  cloth: number;
  trim: number;
  accessory: string;
}

export interface QuestState {
  id: string;
  progress: number;
  done: boolean;
  claimed: boolean;
}

export interface Derived {
  maxHp: number;
  maxMana: number;
  maxStamina: number;
  hpRegen: number;
  manaRegen: number;
  staminaRegen: number;
  armor: number;
  damageReduction: number;
  dmg: [number, number];
  spell: [number, number];
  attackSpeed: number;
  critChance: number;
  critDmg: number;
  moveSpeed: number;
  block: number;
  dodge: number;
  resFire: number;
  resCold: number;
  resDark: number;
  lifeSteal: number;
  thorns: number;
  dmgPct: number;
  spellPct: number;
  undeadPct: number;
  summonPct: number;
  healPct: number;
  goldFind: number;
  dmgTakenPct: number;
  parryWindow: number;
  weaponType: string;
  attackMode: "melee" | "bolt" | "bow";
  secondary: "block" | "ward" | "aim";
  boltElement: string;
  flags: Record<string, number>;
  attrs: Attrs;
}

const sum = (mods: Record<string, number>[], key: string) => mods.reduce((s, m) => s + (m[key] || 0), 0);

export function deriveStats(c: Pick<CharacterData, "cls" | "level" | "attrs" | "equipment" | "skills">): Derived {
  const cls = CLASSES[c.cls];
  const mods: Record<string, number>[] = [];
  for (const it of Object.values(c.equipment)) if (it) mods.push(itemStats(it));
  for (const [id, rank] of Object.entries(c.skills)) {
    const s = SKILL_BY_ID[id];
    if (s && s.kind === "passive" && rank > 0) {
      const e = s.effect(rank);
      if (e.type === "passive") mods.push(e.mods);
    }
  }
  const attrs = { ...c.attrs } as Attrs;
  for (const a of ATTR_IDS) attrs[a] += sum(mods, a);

  const weapon = c.equipment.weapon;
  const wd = weaponDamage(weapon);
  const offhand = c.equipment.offhand ? BASE_BY_ID[c.equipment.offhand.base] : null;
  const level = c.level;

  const maxHp = Math.round((60 + attrs.vit * 9 + level * 6 + sum(mods, "hp")) * (1 + sum(mods, "hpPct")));
  const maxMana = Math.round((20 + attrs.int * 4 + attrs.wil * 3 + sum(mods, "mana")) * (1 + sum(mods, "manaPct")));
  const maxStamina = Math.round(60 + attrs.end * 3);
  const armor = Math.round((sum(mods, "armor") + attrs.str * 0.4) * (1 + sum(mods, "armorPct")));
  const meleeK = 1 + attrs[cls.meleeAttr] * 0.012 + (wd.type === "dagger" || wd.type === "bow" ? attrs.dex * 0.008 : 0);
  let spellK = 1;
  for (const [a, k] of Object.entries(cls.spellAttrs)) spellK += attrs[a as keyof Attrs] * 0.014 * (k as number);

  let attackMode: Derived["attackMode"] = "melee";
  if (wd.type === "bow") attackMode = "bow";
  else if (wd.type === "staff" || wd.type === "wand") attackMode = "bolt";
  let secondary: Derived["secondary"] = "block";
  if (attackMode === "bow") secondary = "aim";
  else if (!(offhand && offhand.type === "shield") && (attackMode === "bolt" || cls.bolt)) secondary = "ward";

  const flags: Record<string, number> = {};
  for (const k of ["lifeOnKill", "manaOnKill", "burnOnHit", "chillOnHit", "extraSkeleton", "critHeal", "holyAura", "doubleShot", "berserk", "backstab"]) {
    const v = sum(mods, k);
    if (v) flags[k] = v;
  }

  const spellBase = wd.spell[0] || wd.spell[1] ? wd.spell : ([Math.max(1, Math.round(wd.dmg[0] * 0.6)), Math.max(2, Math.round(wd.dmg[1] * 0.6))] as [number, number]);
  return {
    maxHp,
    maxMana,
    maxStamina,
    hpRegen: 0.6 + attrs.vit * 0.05 + sum(mods, "hpRegen"),
    manaRegen: (1.2 + attrs.wil * 0.14 + attrs.int * 0.05) * (1 + sum(mods, "manaRegenPct")),
    staminaRegen: (20 + attrs.end * 0.6) * (1 + sum(mods, "staminaRegenPct")),
    armor,
    damageReduction: armor / (armor + 60 + level * 12),
    dmg: [Math.max(1, Math.round(wd.dmg[0] * meleeK)), Math.max(2, Math.round(wd.dmg[1] * meleeK))],
    spell: [Math.round(spellBase[0] * spellK + attrs.int * 0.2), Math.round(spellBase[1] * spellK + attrs.int * 0.3)],
    attackSpeed: wd.speed * (1 + attrs.dex * 0.005 + sum(mods, "atkSpeedPct")),
    critChance: Math.min(0.6, 0.05 + attrs.dex * 0.0015 + sum(mods, "critChance")),
    critDmg: 1.5 + sum(mods, "critDmg"),
    moveSpeed: 4.6 * Math.max(0.6, 1 + sum(mods, "movePct")),
    block: Math.min(0.9, offhand && offhand.type === "shield" ? sum(mods, "block") + sum(mods, "blockPct") : 0.35 + sum(mods, "blockPct")),
    dodge: Math.min(0.4, sum(mods, "dodge") + attrs.dex * 0.001),
    resFire: Math.min(0.75, sum(mods, "resFire")),
    resCold: Math.min(0.75, sum(mods, "resCold")),
    resDark: Math.min(0.75, sum(mods, "resDark")),
    lifeSteal: sum(mods, "lifeSteal"),
    thorns: sum(mods, "thorns"),
    dmgPct: sum(mods, "dmgPct"),
    spellPct: sum(mods, "spellPct"),
    undeadPct: sum(mods, "undeadPct"),
    summonPct: sum(mods, "summonPct"),
    healPct: sum(mods, "healPct"),
    goldFind: sum(mods, "goldFind"),
    dmgTakenPct: sum(mods, "dmgTakenPct"),
    parryWindow: 0.22 + sum(mods, "parryWindow") + (c.cls === "knight" ? 0.08 : 0),
    weaponType: wd.type,
    attackMode,
    secondary,
    boltElement: cls.bolt?.element || "holy",
    flags,
    attrs,
  };
}
