/** Деревья навыков. Каждый навык — данные + тип эффекта, который исполняет симуляция. */
import type { ClassId } from "./classes";

export type Element = "physical" | "fire" | "cold" | "dark" | "holy" | "arcane" | "poison";

export type SkillEffect =
  | { type: "arc"; dmg: number; range: number; arc: number; knock?: number; stun?: number; execute?: number; guaranteedCrit?: boolean }
  | { type: "whirl"; dmg: number; radius: number; duration: number; tick: number }
  | { type: "projectile"; dmg: number; speed: number; element: Element; radius?: number; pierce?: boolean; slow?: number; count?: number; spread?: number; undeadBonus?: number; healAlly?: number; size?: number }
  | { type: "nova"; dmg: number; radius: number; element: Element; freeze?: number; knock?: number; stun?: number }
  | { type: "ground"; dmg: number; radius: number; element: Element; delay: number; stun?: number; undeadStun?: number }
  | { type: "buff"; duration: number; dmgPct?: number; atkSpeedPct?: number; hpCostPct?: number; poison?: number; movePct?: number; drPct?: number }
  | { type: "heal"; base: number; scale: number; radius: number }
  | { type: "summon"; max: number; duration: number }
  | { type: "dash"; distance: number; dmg: number; knock?: number; behind?: boolean; guaranteedCrit?: boolean }
  | { type: "corpse"; radius: number; pctOfCorpse: number; dmg: number }
  | { type: "curse"; radius: number; vuln: number; slow: number; duration: number }
  | { type: "shield"; pctOfHp: number; duration: number }
  | { type: "taunt"; radius: number; duration: number; drPct: number }
  | { type: "blind"; radius: number; duration: number; movePct: number }
  | { type: "sanctuary"; radius: number; duration: number; drPct: number; regenPct: number; holyDps: number }
  | { type: "passive"; mods: Record<string, number> };

export interface SkillDef {
  id: string;
  cls: ClassId;
  name: string;
  description: string;
  kind: "active" | "passive";
  icon: string;
  tier: number;
  col: number;
  maxRank: number;
  reqLevel: number;
  requires?: { id: string; rank: number }[];
  cost?: { mana?: number; stamina?: number };
  cooldown?: number;
  /** Ground-target: нужна точка прицела. */
  aimed?: boolean;
  effect: (rank: number) => SkillEffect;
  /** Строка «на этом ранге» для подсказки. */
  rankText: (rank: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export const SKILLS: SkillDef[] = [
  // ---------------- Воин ----------------
  {
    id: "cleave", cls: "warrior", name: "Рассечение", icon: "cleave", kind: "active", tier: 0, col: 0, maxRank: 5, reqLevel: 1,
    description: "Широкий удар по всем врагам перед вами.",
    cost: { stamina: 20 }, cooldown: 3,
    effect: (r) => ({ type: "arc", dmg: 1.3 + 0.15 * r, range: 3.1, arc: 2.4, knock: 2.5 }),
    rankText: (r) => `${pct(1.3 + 0.15 * r)} урона оружия по дуге`,
  },
  {
    id: "blood_rage", cls: "warrior", name: "Кровавая ярость", icon: "rage", kind: "active", tier: 1, col: 1, maxRank: 5, reqLevel: 3,
    description: "Жертвует 10% здоровья ради урона и скорости атаки.",
    cooldown: 18,
    effect: (r) => ({ type: "buff", duration: 8, dmgPct: 0.2 + 0.06 * r, atkSpeedPct: 0.12 + 0.03 * r, hpCostPct: 0.1 }),
    rankText: (r) => `+${pct(0.2 + 0.06 * r)} урона, +${pct(0.12 + 0.03 * r)} скорости атаки на 8 с`,
  },
  {
    id: "whirlwind", cls: "warrior", name: "Вихрь", icon: "whirl", kind: "active", tier: 2, col: 0, maxRank: 5, reqLevel: 6,
    requires: [{ id: "cleave", rank: 1 }],
    description: "Вращение с оружием: урон всем вокруг несколько раз.",
    cost: { stamina: 35 }, cooldown: 10,
    effect: (r) => ({ type: "whirl", dmg: 0.5 + 0.08 * r, radius: 3.2, duration: 2.4, tick: 0.3 }),
    rankText: (r) => `${pct(0.5 + 0.08 * r)} урона каждые 0,3 с в течение 2,4 с`,
  },
  {
    id: "execution", cls: "warrior", name: "Казнь", icon: "execute", kind: "active", tier: 3, col: 0, maxRank: 5, reqLevel: 10,
    requires: [{ id: "cleave", rank: 3 }],
    description: "Сокрушительный удар. Двойной урон по врагам с низким здоровьем.",
    cost: { stamina: 30 }, cooldown: 8,
    effect: (r) => ({ type: "arc", dmg: 2.0 + 0.25 * r, range: 3, arc: 0.9, execute: 0.3, knock: 4 }),
    rankText: (r) => `${pct(2.0 + 0.25 * r)} урона, ×2 по врагам ниже 30% здоровья`,
  },
  {
    id: "iron_skin", cls: "warrior", name: "Железная кожа", icon: "armor", kind: "passive", tier: 0, col: 2, maxRank: 5, reqLevel: 1,
    description: "Постоянно увеличивает броню.",
    effect: (r) => ({ type: "passive", mods: { armorPct: 0.08 * r } }),
    rankText: (r) => `+${pct(0.08 * r)} брони`,
  },
  {
    id: "bloodlust", cls: "warrior", name: "Жажда крови", icon: "blood", kind: "passive", tier: 2, col: 2, maxRank: 5, reqLevel: 4,
    requires: [{ id: "blood_rage", rank: 1 }],
    description: "Каждое убийство восстанавливает здоровье.",
    effect: (r) => ({ type: "passive", mods: { lifeOnKill: 0.02 * r } }),
    rankText: (r) => `${pct(0.02 * r)} здоровья за убийство`,
  },

  // ---------------- Рыцарь ----------------
  {
    id: "shield_bash", cls: "knight", name: "Удар щитом", icon: "bash", kind: "active", tier: 0, col: 0, maxRank: 5, reqLevel: 1,
    description: "Оглушает врагов перед вами.",
    cost: { stamina: 20 }, cooldown: 6,
    effect: (r) => ({ type: "arc", dmg: 0.8 + 0.1 * r, range: 2.6, arc: 1.4, stun: 1.2 + 0.2 * r, knock: 3 }),
    rankText: (r) => `${pct(0.8 + 0.1 * r)} урона, оглушение ${(1.2 + 0.2 * r).toFixed(1)} с`,
  },
  {
    id: "charge", cls: "knight", name: "Натиск", icon: "charge", kind: "active", tier: 1, col: 0, maxRank: 5, reqLevel: 3,
    description: "Рывок вперёд, сбивающий врагов на пути.",
    cost: { stamina: 25 }, cooldown: 9,
    effect: (r) => ({ type: "dash", distance: 7, dmg: 1.1 + 0.15 * r, knock: 5 }),
    rankText: (r) => `Рывок на 7 м, ${pct(1.1 + 0.15 * r)} урона`,
  },
  {
    id: "taunt", cls: "knight", name: "Вызов", icon: "taunt", kind: "active", tier: 2, col: 1, maxRank: 5, reqLevel: 5,
    description: "Враги рядом атакуют только вас, а вы получаете меньше урона.",
    cooldown: 14,
    effect: (r) => ({ type: "taunt", radius: 12, duration: 6, drPct: 0.15 + 0.04 * r }),
    rankText: (r) => `Провокация на 6 с, −${pct(0.15 + 0.04 * r)} получаемого урона`,
  },
  {
    id: "fortress", cls: "knight", name: "Бастион", icon: "fortress", kind: "active", tier: 3, col: 1, maxRank: 5, reqLevel: 8,
    requires: [{ id: "taunt", rank: 1 }],
    description: "Барьер, поглощающий урон.",
    cooldown: 20,
    effect: (r) => ({ type: "shield", pctOfHp: 0.25 + 0.05 * r, duration: 8 }),
    rankText: (r) => `Поглощает ${pct(0.25 + 0.05 * r)} макс. здоровья, 8 с`,
  },
  {
    id: "bulwark", cls: "knight", name: "Твердыня", icon: "shield", kind: "passive", tier: 0, col: 2, maxRank: 5, reqLevel: 1,
    description: "Блок поглощает больше урона, окно парирования шире.",
    effect: (r) => ({ type: "passive", mods: { blockPct: 0.06 * r, parryWindow: 0.04 * r } }),
    rankText: (r) => `+${pct(0.06 * r)} к блоку, окно парирования +${(0.04 * r).toFixed(2)} с`,
  },
  {
    id: "retribution", cls: "knight", name: "Возмездие", icon: "thorns", kind: "passive", tier: 2, col: 2, maxRank: 5, reqLevel: 4,
    description: "Возвращает часть урона ближнего боя атакующему.",
    effect: (r) => ({ type: "passive", mods: { thorns: 0.1 * r } }),
    rankText: (r) => `Отражает ${pct(0.1 * r)} полученного урона`,
  },

  // ---------------- Разбойник ----------------
  {
    id: "fan_of_knives", cls: "rogue", name: "Веер клинков", icon: "knives", kind: "active", tier: 0, col: 0, maxRank: 5, reqLevel: 1,
    description: "Метает клинки во все стороны.",
    cost: { stamina: 20 }, cooldown: 5,
    effect: (r) => ({ type: "nova", dmg: 0.9 + 0.12 * r, radius: 4.5, element: "physical" }),
    rankText: (r) => `${pct(0.9 + 0.12 * r)} урона в радиусе 4,5 м`,
  },
  {
    id: "shadow_step", cls: "rogue", name: "Шаг в тень", icon: "shadow", kind: "active", tier: 1, col: 0, maxRank: 5, reqLevel: 3,
    description: "Мгновенно оказывается за спиной врага и наносит критический удар.",
    cost: { stamina: 25 }, cooldown: 8,
    effect: (r) => ({ type: "dash", distance: 12, dmg: 1.4 + 0.2 * r, behind: true, guaranteedCrit: true }),
    rankText: (r) => `${pct(1.4 + 0.2 * r)} урона, гарантированный крит`,
  },
  {
    id: "poison_blade", cls: "rogue", name: "Отравленный клинок", icon: "poison", kind: "active", tier: 2, col: 1, maxRank: 5, reqLevel: 5,
    description: "Удары отравляют врагов.",
    cooldown: 15,
    effect: (r) => ({ type: "buff", duration: 10, poison: 0.25 + 0.07 * r }),
    rankText: (r) => `Яд: ${pct(0.25 + 0.07 * r)} урона оружия в секунду, 3 с`,
  },
  {
    id: "smoke_bomb", cls: "rogue", name: "Дымовая бомба", icon: "smoke", kind: "active", tier: 3, col: 1, maxRank: 5, reqLevel: 8,
    requires: [{ id: "shadow_step", rank: 1 }],
    description: "Ослепляет врагов вокруг и ускоряет вас.",
    cooldown: 18,
    effect: (r) => ({ type: "blind", radius: 6, duration: 2 + 0.4 * r, movePct: 0.3 }),
    rankText: (r) => `Ослепление ${(2 + 0.4 * r).toFixed(1)} с, +30% скорости`,
  },
  {
    id: "assassin", cls: "rogue", name: "Убийца", icon: "crit", kind: "passive", tier: 0, col: 2, maxRank: 5, reqLevel: 1,
    description: "Больше шанс и урон критических ударов. Удары в спину — двойной шанс.",
    effect: (r) => ({ type: "passive", mods: { critChance: 0.02 * r, critDmg: 0.1 * r, backstab: 1 } }),
    rankText: (r) => `+${pct(0.02 * r)} шанса крита, +${pct(0.1 * r)} урона крита`,
  },
  {
    id: "evasion", cls: "rogue", name: "Увёртливость", icon: "evade", kind: "passive", tier: 2, col: 2, maxRank: 5, reqLevel: 4,
    description: "Шанс полностью избежать удара.",
    effect: (r) => ({ type: "passive", mods: { dodge: 0.04 * r } }),
    rankText: (r) => `${pct(0.04 * r)} шанс уклонения`,
  },

  // ---------------- Маг ----------------
  {
    id: "fireball", cls: "mage", name: "Огненный шар", icon: "fire", kind: "active", tier: 0, col: 0, maxRank: 5, reqLevel: 1,
    description: "Взрывается при попадании, поджигая всё вокруг.",
    cost: { mana: 14 }, cooldown: 1.2,
    effect: (r) => ({ type: "projectile", dmg: 1.5 + 0.2 * r, speed: 22, element: "fire", radius: 2.6, size: 0.35 }),
    rankText: (r) => `${pct(1.5 + 0.2 * r)} силы заклинаний, взрыв 2,6 м`,
  },
  {
    id: "frost_nova", cls: "mage", name: "Кольцо льда", icon: "frost", kind: "active", tier: 1, col: 0, maxRank: 5, reqLevel: 3,
    description: "Замораживает врагов вокруг.",
    cost: { mana: 25 }, cooldown: 9,
    effect: (r) => ({ type: "nova", dmg: 0.8 + 0.1 * r, radius: 5.5, element: "cold", freeze: 1.6 + 0.2 * r }),
    rankText: (r) => `${pct(0.8 + 0.1 * r)} урона, заморозка ${(1.6 + 0.2 * r).toFixed(1)} с`,
  },
  {
    id: "arcane_explosion", cls: "mage", name: "Тайный взрыв", icon: "arcane", kind: "active", tier: 2, col: 1, maxRank: 5, reqLevel: 5,
    description: "Отбрасывает и ранит всех рядом.",
    cost: { mana: 30 }, cooldown: 7,
    effect: (r) => ({ type: "nova", dmg: 1.3 + 0.18 * r, radius: 6, element: "arcane", knock: 7 }),
    rankText: (r) => `${pct(1.3 + 0.18 * r)} урона, сильное отбрасывание`,
  },
  {
    id: "meteor", cls: "mage", name: "Метеор", icon: "meteor", kind: "active", tier: 3, col: 0, maxRank: 5, reqLevel: 10,
    requires: [{ id: "fireball", rank: 3 }], aimed: true,
    description: "Через мгновение на точку прицела падает метеор.",
    cost: { mana: 45 }, cooldown: 14,
    effect: (r) => ({ type: "ground", dmg: 3.5 + 0.5 * r, radius: 4.5, element: "fire", delay: 1.4 }),
    rankText: (r) => `${pct(3.5 + 0.5 * r)} урона в радиусе 4,5 м`,
  },
  {
    id: "elemental_mastery", cls: "mage", name: "Власть стихий", icon: "mastery", kind: "passive", tier: 0, col: 2, maxRank: 5, reqLevel: 1,
    description: "Увеличивает урон заклинаний.",
    effect: (r) => ({ type: "passive", mods: { spellPct: 0.08 * r } }),
    rankText: (r) => `+${pct(0.08 * r)} к урону заклинаний`,
  },
  {
    id: "mana_flow", cls: "mage", name: "Поток маны", icon: "mana", kind: "passive", tier: 2, col: 2, maxRank: 5, reqLevel: 4,
    description: "Больше маны и быстрее её восстановление.",
    effect: (r) => ({ type: "passive", mods: { manaPct: 0.04 * r, manaRegenPct: 0.15 * r } }),
    rankText: (r) => `+${pct(0.04 * r)} маны, +${pct(0.15 * r)} восстановления`,
  },

  // ---------------- Некромант ----------------
  {
    id: "raise_skeleton", cls: "necromancer", name: "Поднять скелета", icon: "skeleton", kind: "active", tier: 0, col: 0, maxRank: 5, reqLevel: 1,
    description: "Призывает скелета-воина, сражающегося на вашей стороне.",
    cost: { mana: 20 }, cooldown: 3,
    effect: (r) => ({ type: "summon", max: 1 + Math.floor(r / 2), duration: 45 }),
    rankText: (r) => `До ${1 + Math.floor(r / 2)} скелетов, сильнее с рангом`,
  },
  {
    id: "bone_spear", cls: "necromancer", name: "Костяное копьё", icon: "spear", kind: "active", tier: 1, col: 0, maxRank: 5, reqLevel: 3,
    description: "Пронзает всех врагов на линии.",
    cost: { mana: 15 }, cooldown: 1.6,
    effect: (r) => ({ type: "projectile", dmg: 1.6 + 0.22 * r, speed: 30, element: "dark", pierce: true, size: 0.25 }),
    rankText: (r) => `${pct(1.6 + 0.22 * r)} силы заклинаний, пробивает насквозь`,
  },
  {
    id: "corpse_explosion", cls: "necromancer", name: "Взрыв трупа", icon: "corpse", kind: "active", tier: 2, col: 1, maxRank: 5, reqLevel: 5,
    aimed: true,
    description: "Ближайший к прицелу труп взрывается, раня врагов вокруг.",
    cost: { mana: 18 }, cooldown: 2.5,
    effect: (r) => ({ type: "corpse", radius: 4, pctOfCorpse: 0.4 + 0.08 * r, dmg: 1 + 0.1 * r }),
    rankText: (r) => `${pct(0.4 + 0.08 * r)} здоровья трупа + ${pct(1 + 0.1 * r)} силы заклинаний`,
  },
  {
    id: "decrepify", cls: "necromancer", name: "Порча", icon: "curse", kind: "active", tier: 3, col: 1, maxRank: 5, reqLevel: 8,
    requires: [{ id: "corpse_explosion", rank: 1 }], aimed: true,
    description: "Проклятие: враги медленнее и получают больше урона.",
    cost: { mana: 20 }, cooldown: 12,
    effect: (r) => ({ type: "curse", radius: 5, vuln: 0.2 + 0.05 * r, slow: 0.4, duration: 8 }),
    rankText: (r) => `+${pct(0.2 + 0.05 * r)} получаемого урона, −40% скорости`,
  },
  {
    id: "soul_harvest", cls: "necromancer", name: "Жатва душ", icon: "soul", kind: "passive", tier: 0, col: 2, maxRank: 5, reqLevel: 1,
    description: "Убийства восстанавливают ману и здоровье.",
    effect: (r) => ({ type: "passive", mods: { manaOnKill: 0.03 * r, lifeOnKill: 0.01 * r } }),
    rankText: (r) => `${pct(0.03 * r)} маны и ${pct(0.01 * r)} здоровья за убийство`,
  },
  {
    id: "dark_pact", cls: "necromancer", name: "Тёмный договор", icon: "pact", kind: "passive", tier: 2, col: 2, maxRank: 5, reqLevel: 4,
    description: "Призванные скелеты крепче и сильнее; больше скелетов на рангах 3 и 5.",
    effect: (r) => ({ type: "passive", mods: { summonPct: 0.12 * r, extraSkeleton: Math.floor(r / 3) + (r >= 5 ? 1 : 0) } }),
    rankText: (r) => `+${pct(0.12 * r)} к силе скелетов`,
  },

  // ---------------- Жрец ----------------
  {
    id: "heal", cls: "cleric", name: "Исцеление", icon: "heal", kind: "active", tier: 0, col: 0, maxRank: 5, reqLevel: 1,
    description: "Лечит вас и союзников рядом.",
    cost: { mana: 22 }, cooldown: 6,
    effect: (r) => ({ type: "heal", base: 20 + 12 * r, scale: 1.4, radius: 9 }),
    rankText: (r) => `${20 + 12 * r} + 140% силы заклинаний здоровья`,
  },
  {
    id: "holy_bolt", cls: "cleric", name: "Святая стрела", icon: "holy", kind: "active", tier: 1, col: 0, maxRank: 5, reqLevel: 3,
    description: "Снаряд света: жжёт нежить, лечит союзников.",
    cost: { mana: 12 }, cooldown: 1.2,
    effect: (r) => ({ type: "projectile", dmg: 1.4 + 0.18 * r, speed: 26, element: "holy", undeadBonus: 1, healAlly: 15 + 6 * r, size: 0.25 }),
    rankText: (r) => `${pct(1.4 + 0.18 * r)} урона, ×2 по нежити`,
  },
  {
    id: "sanctuary", cls: "cleric", name: "Святилище", icon: "sanctuary", kind: "active", tier: 2, col: 1, maxRank: 5, reqLevel: 5,
    description: "Освящённая земля: союзники в ней получают меньше урона и лечатся, нежить горит.",
    cost: { mana: 35 }, cooldown: 18,
    effect: (r) => ({ type: "sanctuary", radius: 5, duration: 7, drPct: 0.25 + 0.03 * r, regenPct: 0.02 + 0.005 * r, holyDps: 0.4 + 0.08 * r }),
    rankText: (r) => `−${pct(0.25 + 0.03 * r)} урона, лечение ${pct(0.02 + 0.005 * r)}/с`,
  },
  {
    id: "smite", cls: "cleric", name: "Кара", icon: "smite", kind: "active", tier: 3, col: 1, maxRank: 5, reqLevel: 8,
    requires: [{ id: "holy_bolt", rank: 2 }], aimed: true,
    description: "Столп света бьёт в точку прицела, оглушая нежить.",
    cost: { mana: 30 }, cooldown: 10,
    effect: (r) => ({ type: "ground", dmg: 2.2 + 0.3 * r, radius: 3.2, element: "holy", delay: 0.35, undeadStun: 1.5 }),
    rankText: (r) => `${pct(2.2 + 0.3 * r)} урона, оглушение нежити`,
  },
  {
    id: "undead_bane", cls: "cleric", name: "Гроза нежити", icon: "bane", kind: "passive", tier: 0, col: 2, maxRank: 5, reqLevel: 1,
    description: "Больше урона по нежити.",
    effect: (r) => ({ type: "passive", mods: { undeadPct: 0.1 * r } }),
    rankText: (r) => `+${pct(0.1 * r)} урона по нежити`,
  },
  {
    id: "devotion", cls: "cleric", name: "Благочестие", icon: "devotion", kind: "passive", tier: 2, col: 2, maxRank: 5, reqLevel: 4,
    description: "Больше здоровья и силы исцеления.",
    effect: (r) => ({ type: "passive", mods: { hpPct: 0.05 * r, healPct: 0.08 * r } }),
    rankText: (r) => `+${pct(0.05 * r)} здоровья, +${pct(0.08 * r)} исцеления`,
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillsOf = (cls: ClassId) => SKILLS.filter((s) => s.cls === cls);

/** Можно ли изучить следующий ранг навыка. */
export function canLearn(skill: SkillDef, level: number, ranks: Record<string, number>, points: number): string | null {
  const cur = ranks[skill.id] || 0;
  if (points <= 0) return "Нет очков навыков";
  if (cur >= skill.maxRank) return "Максимальный ранг";
  if (level < skill.reqLevel) return `Нужен ${skill.reqLevel} уровень`;
  for (const r of skill.requires || []) {
    if ((ranks[r.id] || 0) < r.rank) return `Нужно: ${SKILL_BY_ID[r.id].name} ${r.rank}`;
  }
  return null;
}
