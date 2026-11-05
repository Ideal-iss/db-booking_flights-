/**
 * Деревья навыков в духе Diablo II: у каждого класса три ветки по 8 навыков,
 * шесть рядов (1, 4, 8, 12, 18, 24 уровень), требования и синергии.
 * Каждый навык — данные + тип эффекта, который исполняет симуляция.
 */
import type { ClassId } from "./classes";

export type Element = "physical" | "fire" | "cold" | "dark" | "holy" | "arcane" | "poison" | "lightning";

/** Бафф на себя (и союзников рядом для кличей и аур). */
export interface BuffSpec {
  duration: number;
  dmgPct?: number;
  atkSpeedPct?: number;
  hpCostPct?: number;
  poison?: number;
  movePct?: number;
  drPct?: number;
  /** Восстановление доли здоровья в секунду. */
  regenPct?: number;
  lifeSteal?: number;
  critChance?: number;
  thorns?: number;
  /** Аура: урон в секунду (доля силы заклинаний или урона оружия) всем врагам в радиусе. */
  auraDps?: number;
  auraR?: number;
  auraEl?: Element;
  /** Аура бьёт только нежить. */
  auraUndead?: boolean;
  /** Бафф действует и на союзников в этом радиусе. */
  party?: number;
}

export type SkillEffect =
  | { type: "arc"; dmg: number; range: number; arc: number; knock?: number; stun?: number; execute?: number; guaranteedCrit?: boolean; hits?: number; element?: Element; bleed?: number; selfBuff?: BuffSpec; lifeOnHit?: number }
  | { type: "whirl"; dmg: number; radius: number; duration: number; tick: number }
  | { type: "projectile"; dmg: number; speed: number; element: Element; radius?: number; pierce?: boolean; slow?: number; count?: number; spread?: number; undeadBonus?: number; healAlly?: number; size?: number; weapon?: boolean; freeze?: number }
  | { type: "nova"; dmg: number; radius: number; element: Element; freeze?: number; knock?: number; stun?: number; dot?: number; weapon?: boolean; slow?: number }
  | { type: "ground"; dmg: number; radius: number; element: Element; delay: number; stun?: number; undeadStun?: number }
  | ({ type: "buff" } & BuffSpec)
  | { type: "heal"; base: number; scale: number; radius: number; cleanse?: boolean }
  | { type: "summon"; max: number; duration: number; unit?: string; count?: number }
  | { type: "dash"; distance: number; dmg: number; knock?: number; behind?: boolean; guaranteedCrit?: boolean; stun?: number }
  | { type: "corpse"; radius: number; pctOfCorpse: number; dmg: number }
  | { type: "curse"; radius: number; vuln: number; slow: number; duration: number; weaken?: number; lifeTap?: number }
  | { type: "shield"; pctOfHp: number; duration: number }
  | { type: "taunt"; radius: number; duration: number; drPct: number }
  | { type: "blind"; radius: number; duration: number; movePct: number }
  | { type: "sanctuary"; radius: number; duration: number; drPct: number; regenPct: number; holyDps: number }
  | { type: "chain"; dmg: number; element: Element; jumps: number; range: number; weapon?: boolean; stun?: number }
  | { type: "field"; dps: number; radius: number; duration: number; element: Element; slow?: number; weapon?: boolean; style: string }
  | { type: "sentry"; dmg: number; duration: number; rate: number; element: Element; range: number; style: string; weapon?: boolean; count?: number }
  | { type: "leap"; dmg: number; radius: number; stun?: number; range: number }
  | { type: "blink"; range: number; novaDmg?: number; element?: Element }
  | { type: "warcry"; radius: number; stun?: number; fear?: number; dmg?: number; buff?: BuffSpec }
  | { type: "passive"; mods: Record<string, number> };

export interface SkillDef {
  id: string;
  cls: ClassId;
  name: string;
  description: string;
  kind: "active" | "passive";
  icon: string;
  /** Ветка (0..2), ряд (0..5) и колонка (0..2) в книге навыков. */
  tree: number;
  tier: number;
  col: number;
  maxRank: number;
  reqLevel: number;
  requires?: { id: string; rank: number }[];
  /** Синергии: +pct урона этого навыка за каждый ранг другого. */
  synergies?: { id: string; pct: number }[];
  cost?: { mana?: number; stamina?: number };
  cooldown?: number;
  /** Ground-target: нужна точка прицела. */
  aimed?: boolean;
  effect: (rank: number) => SkillEffect;
  /** Строка «на этом ранге» для подсказки. */
  rankText: (rank: number) => string;
}

/** Уровень, с которого открывается ряд дерева. */
export const TIER_LEVELS = [1, 4, 8, 12, 18, 24];

export const TREES: Record<ClassId, [string, string, string]> = {
  warrior: ["Оружие", "Боевые кличи", "Ярость"],
  knight: ["Щит и сталь", "Натиск", "Клятвы"],
  rogue: ["Клинки", "Ловушки и яды", "Тени"],
  mage: ["Огонь", "Лёд", "Буря"],
  necromancer: ["Призыв", "Кость и яд", "Проклятия"],
  cleric: ["Исцеление", "Ауры", "Кара"],
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f1 = (v: number) => v.toFixed(1).replace(".", ",");

type Def = Omit<SkillDef, "cls" | "reqLevel" | "maxRank" | "kind"> & { kind?: "active" | "passive"; maxRank?: number };
function tree(cls: ClassId, list: Def[]): SkillDef[] {
  return list.map((s) => ({ maxRank: 5, kind: "active", ...s, cls, reqLevel: TIER_LEVELS[s.tier] }));
}

export const SKILLS: SkillDef[] = [
  // =========================================================== ВОИН
  ...tree("warrior", [
    // --- Оружие
    {
      id: "cleave", name: "Рассечение", icon: "cleave", tree: 0, tier: 0, col: 0,
      description: "Широкий удар по всем врагам перед вами.",
      cost: { stamina: 20 }, cooldown: 3,
      effect: (r) => ({ type: "arc", dmg: 1.3 + 0.15 * r, range: 3.1, arc: 2.4, knock: 2.5 }),
      rankText: (r) => `${pct(1.3 + 0.15 * r)} урона оружия по дуге`,
    },
    {
      id: "weapon_mastery", kind: "passive", name: "Мастерство оружия", icon: "mastery_blade", tree: 0, tier: 0, col: 2,
      description: "Годы с мечом в руке: больше урона и критов.",
      effect: (r) => ({ type: "passive", mods: { dmgPct: 0.06 * r, critChance: 0.01 * r } }),
      rankText: (r) => `+${pct(0.06 * r)} урона, +${pct(0.01 * r)} шанса крита`,
    },
    {
      id: "double_strike", name: "Двойной удар", icon: "double", tree: 0, tier: 1, col: 0,
      requires: [{ id: "cleave", rank: 1 }],
      description: "Два быстрых удара по одной цели.",
      cost: { stamina: 15 }, cooldown: 2,
      synergies: [{ id: "weapon_mastery", pct: 0.06 }],
      effect: (r) => ({ type: "arc", dmg: 0.9 + 0.12 * r, range: 2.8, arc: 0.9, hits: 2 }),
      rankText: (r) => `2 удара по ${pct(0.9 + 0.12 * r)} урона`,
    },
    {
      id: "whirlwind", name: "Вихрь", icon: "whirl", tree: 0, tier: 2, col: 0,
      requires: [{ id: "cleave", rank: 1 }],
      description: "Вращение с оружием: урон всем вокруг несколько раз.",
      cost: { stamina: 35 }, cooldown: 10,
      synergies: [{ id: "cleave", pct: 0.08 }],
      effect: (r) => ({ type: "whirl", dmg: 0.5 + 0.08 * r, radius: 3.2, duration: 2.4, tick: 0.3 }),
      rankText: (r) => `${pct(0.5 + 0.08 * r)} урона каждые 0,3 с в течение 2,4 с`,
    },
    {
      id: "ground_slam", name: "Раскол земли", icon: "quake", tree: 0, tier: 2, col: 1,
      description: "Удар о землю оглушает всех вокруг.",
      cost: { stamina: 30 }, cooldown: 9,
      effect: (r) => ({ type: "nova", dmg: 1.0 + 0.15 * r, radius: 5.5, element: "physical", stun: 1 + 0.15 * r, knock: 3, weapon: true }),
      rankText: (r) => `${pct(1.0 + 0.15 * r)} урона, оглушение ${f1(1 + 0.15 * r)} с`,
    },
    {
      id: "execution", name: "Казнь", icon: "execute", tree: 0, tier: 3, col: 0,
      requires: [{ id: "double_strike", rank: 1 }],
      description: "Сокрушительный удар. Двойной урон по врагам с низким здоровьем.",
      cost: { stamina: 30 }, cooldown: 8,
      synergies: [{ id: "double_strike", pct: 0.1 }],
      effect: (r) => ({ type: "arc", dmg: 2.0 + 0.25 * r, range: 3, arc: 0.9, execute: 0.3, knock: 4 }),
      rankText: (r) => `${pct(2.0 + 0.25 * r)} урона, ×2 по врагам ниже 30% здоровья`,
    },
    {
      id: "leap_attack", name: "Прыжок-удар", icon: "leap", tree: 0, tier: 4, col: 1, aimed: true,
      requires: [{ id: "ground_slam", rank: 1 }],
      description: "Прыжок к точке прицела и удар при приземлении.",
      cost: { stamina: 35 }, cooldown: 8,
      synergies: [{ id: "ground_slam", pct: 0.1 }],
      effect: (r) => ({ type: "leap", dmg: 1.6 + 0.25 * r, radius: 3.4, stun: 1, range: 12 }),
      rankText: (r) => `Прыжок до 12 м, ${pct(1.6 + 0.25 * r)} урона в радиусе 3,4 м`,
    },
    {
      id: "titan_grip", kind: "passive", name: "Хватка титана", icon: "titan", tree: 0, tier: 5, col: 2,
      requires: [{ id: "weapon_mastery", rank: 3 }],
      description: "Оружие становится продолжением руки.",
      effect: (r) => ({ type: "passive", mods: { dmgPct: 0.1 * r, atkSpeedPct: 0.03 * r, critDmg: 0.1 * r } }),
      rankText: (r) => `+${pct(0.1 * r)} урона, +${pct(0.03 * r)} скорости атаки, +${pct(0.1 * r)} урона крита`,
    },
    // --- Боевые кличи
    {
      id: "iron_skin", kind: "passive", name: "Железная кожа", icon: "armor", tree: 1, tier: 0, col: 2,
      description: "Постоянно увеличивает броню.",
      effect: (r) => ({ type: "passive", mods: { armorPct: 0.08 * r } }),
      rankText: (r) => `+${pct(0.08 * r)} брони`,
    },
    {
      id: "battle_shout", name: "Боевой клич", icon: "shout", tree: 1, tier: 0, col: 0,
      description: "Крик, от которого крепнет рука и твердеет кожа.",
      cost: { stamina: 15 }, cooldown: 25,
      effect: (r) => ({ type: "warcry", radius: 10, buff: { duration: 20, dmgPct: 0.08 + 0.03 * r, drPct: 0.06 + 0.02 * r, party: 10 } }),
      rankText: (r) => `20 с: +${pct(0.08 + 0.03 * r)} урона, −${pct(0.06 + 0.02 * r)} получаемого урона`,
    },
    {
      id: "toughness", kind: "passive", name: "Закалка", icon: "heart", tree: 1, tier: 1, col: 2,
      description: "Больше здоровья и быстрее его восстановление.",
      effect: (r) => ({ type: "passive", mods: { hpPct: 0.05 * r, hpRegen: 0.4 * r } }),
      rankText: (r) => `+${pct(0.05 * r)} здоровья, +${f1(0.4 * r)} здоровья/с`,
    },
    {
      id: "war_cry", name: "Устрашающий рёв", icon: "roar", tree: 1, tier: 1, col: 0,
      requires: [{ id: "battle_shout", rank: 1 }],
      description: "Рёв ранит и оглушает врагов вокруг.",
      cost: { stamina: 25 }, cooldown: 12,
      synergies: [{ id: "battle_shout", pct: 0.08 }],
      effect: (r) => ({ type: "warcry", radius: 7, stun: 1.2 + 0.2 * r, dmg: 0.6 + 0.1 * r }),
      rankText: (r) => `${pct(0.6 + 0.1 * r)} урона, оглушение ${f1(1.2 + 0.2 * r)} с в радиусе 7 м`,
    },
    {
      id: "howl", name: "Вой", icon: "fear", tree: 1, tier: 2, col: 1,
      description: "Враги в ужасе разбегаются.",
      cost: { stamina: 15 }, cooldown: 16,
      effect: (r) => ({ type: "warcry", radius: 9, fear: 2.5 + 0.5 * r }),
      rankText: (r) => `Страх ${f1(2.5 + 0.5 * r)} с в радиусе 9 м (боссы — короче)`,
    },
    {
      id: "battle_orders", name: "Боевой приказ", icon: "banner", tree: 1, tier: 3, col: 0,
      requires: [{ id: "war_cry", rank: 1 }],
      description: "Долгий приказ: быстрее удары и шаг, кровь не останавливается.",
      cost: { stamina: 20 }, cooldown: 40,
      effect: (r) => ({ type: "warcry", radius: 10, buff: { duration: 30, atkSpeedPct: 0.08 + 0.03 * r, movePct: 0.1, regenPct: 0.005 + 0.002 * r, party: 10 } }),
      rankText: (r) => `30 с: +${pct(0.08 + 0.03 * r)} скорости атаки, +10% скорости, ${pct(0.005 + 0.002 * r)} здоровья/с`,
    },
    {
      id: "natural_resistance", kind: "passive", name: "Природная стойкость", icon: "resist", tree: 1, tier: 4, col: 2,
      requires: [{ id: "toughness", rank: 1 }],
      description: "Огонь, холод и тьма ранят слабее.",
      effect: (r) => ({ type: "passive", mods: { resFire: 0.05 * r, resCold: 0.05 * r, resDark: 0.05 * r } }),
      rankText: (r) => `+${pct(0.05 * r)} ко всем сопротивлениям`,
    },
    {
      id: "thunder_cry", name: "Боевой гром", icon: "thunder", tree: 1, tier: 5, col: 0,
      requires: [{ id: "battle_orders", rank: 1 }, { id: "howl", rank: 1 }],
      description: "Крик такой силы, что дрожат стены: урон, отброс, долгое оглушение.",
      cost: { stamina: 40 }, cooldown: 18,
      synergies: [{ id: "war_cry", pct: 0.1 }],
      effect: (r) => ({ type: "nova", dmg: 1.5 + 0.25 * r, radius: 8, element: "physical", stun: 2.2, knock: 6, weapon: true }),
      rankText: (r) => `${pct(1.5 + 0.25 * r)} урона в радиусе 8 м, оглушение 2,2 с`,
    },
    // --- Ярость
    {
      id: "blood_rage", name: "Кровавая ярость", icon: "rage", tree: 2, tier: 0, col: 0,
      description: "Жертвует 10% здоровья ради урона и скорости атаки.",
      cooldown: 18,
      effect: (r) => ({ type: "buff", duration: 8, dmgPct: 0.2 + 0.06 * r, atkSpeedPct: 0.12 + 0.03 * r, hpCostPct: 0.1 }),
      rankText: (r) => `+${pct(0.2 + 0.06 * r)} урона, +${pct(0.12 + 0.03 * r)} скорости атаки на 8 с`,
    },
    {
      id: "bloodlust", kind: "passive", name: "Жажда крови", icon: "blood", tree: 2, tier: 0, col: 2,
      description: "Каждое убийство восстанавливает здоровье.",
      effect: (r) => ({ type: "passive", mods: { lifeOnKill: 0.02 * r } }),
      rankText: (r) => `${pct(0.02 * r)} здоровья за убийство`,
    },
    {
      id: "frenzy", name: "Исступление", icon: "frenzy", tree: 2, tier: 1, col: 0,
      requires: [{ id: "blood_rage", rank: 1 }],
      description: "Три яростных удара; после — быстрее руки и ноги.",
      cost: { stamina: 20 }, cooldown: 4,
      effect: (r) => ({ type: "arc", dmg: 0.55 + 0.08 * r, range: 2.8, arc: 1.2, hits: 3, selfBuff: { duration: 5, atkSpeedPct: 0.05 * r, movePct: 0.03 * r } }),
      rankText: (r) => `3 удара по ${pct(0.55 + 0.08 * r)}, затем +${pct(0.05 * r)} скорости атаки на 5 с`,
    },
    {
      id: "leech", kind: "passive", name: "Пиявка", icon: "leech", tree: 2, tier: 1, col: 2,
      description: "Часть нанесённого урона возвращается здоровьем.",
      effect: (r) => ({ type: "passive", mods: { lifeSteal: 0.012 * r } }),
      rankText: (r) => `${pct(0.012 * r)} вампиризма`,
    },
    {
      id: "rend", name: "Разрыв", icon: "rend", tree: 2, tier: 2, col: 1,
      description: "Рваная рана кровоточит ещё несколько секунд.",
      cost: { stamina: 20 }, cooldown: 5,
      synergies: [{ id: "frenzy", pct: 0.08 }],
      effect: (r) => ({ type: "arc", dmg: 0.9 + 0.1 * r, range: 3, arc: 1.6, bleed: 0.4 + 0.08 * r }),
      rankText: (r) => `${pct(0.9 + 0.1 * r)} урона + кровотечение ${pct(0.4 + 0.08 * r)}/с 4 с`,
    },
    {
      id: "unyielding", kind: "passive", name: "Неукротимость", icon: "skull_red", tree: 2, tier: 3, col: 2,
      requires: [{ id: "bloodlust", rank: 2 }],
      description: "Чем меньше здоровья, тем страшнее удары.",
      effect: (r) => ({ type: "passive", mods: { berserk: 0.15 * r } }),
      rankText: (r) => `До +${pct(0.15 * r)} урона при низком здоровье`,
    },
    {
      id: "berserk_strike", name: "Удар берсерка", icon: "berserk", tree: 2, tier: 4, col: 0,
      requires: [{ id: "frenzy", rank: 2 }],
      description: "Удар тёмной яростью: пробивает любую броню.",
      cost: { stamina: 30 }, cooldown: 6,
      synergies: [{ id: "rend", pct: 0.08 }],
      effect: (r) => ({ type: "arc", dmg: 2.2 + 0.3 * r, range: 3, arc: 1, element: "dark", knock: 3 }),
      rankText: (r) => `${pct(2.2 + 0.3 * r)} урона тьмой (броня не защищает)`,
    },
    {
      id: "avatar", name: "Аватар войны", icon: "avatar", tree: 2, tier: 5, col: 1,
      requires: [{ id: "berserk_strike", rank: 1 }, { id: "unyielding", rank: 1 }],
      description: "На время вы — сама война.",
      cooldown: 60,
      effect: (r) => ({ type: "buff", duration: 12, dmgPct: 0.3 + 0.07 * r, atkSpeedPct: 0.2, drPct: 0.2, lifeSteal: 0.03 }),
      rankText: (r) => `12 с: +${pct(0.3 + 0.07 * r)} урона, +20% скорости атаки, −20% урона, 3% вампиризма`,
    },
  ]),

  // =========================================================== РЫЦАРЬ
  ...tree("knight", [
    // --- Щит и сталь
    {
      id: "shield_bash", name: "Удар щитом", icon: "bash", tree: 0, tier: 0, col: 0,
      description: "Оглушает врагов перед вами.",
      cost: { stamina: 20 }, cooldown: 6,
      effect: (r) => ({ type: "arc", dmg: 0.8 + 0.1 * r, range: 2.6, arc: 1.4, stun: 1.2 + 0.2 * r, knock: 3 }),
      rankText: (r) => `${pct(0.8 + 0.1 * r)} урона, оглушение ${f1(1.2 + 0.2 * r)} с`,
    },
    {
      id: "bulwark", kind: "passive", name: "Твердыня", icon: "shield", tree: 0, tier: 0, col: 2,
      description: "Блок поглощает больше урона, окно парирования шире.",
      effect: (r) => ({ type: "passive", mods: { blockPct: 0.06 * r, parryWindow: 0.04 * r } }),
      rankText: (r) => `+${pct(0.06 * r)} к блоку, окно парирования +${(0.04 * r).toFixed(2)} с`,
    },
    {
      id: "shield_throw", name: "Бросок щита", icon: "shield_throw", tree: 0, tier: 1, col: 0,
      requires: [{ id: "shield_bash", rank: 1 }],
      description: "Щит летит, отскакивая от врага к врагу.",
      cost: { stamina: 20 }, cooldown: 5,
      synergies: [{ id: "shield_bash", pct: 0.08 }],
      effect: (r) => ({ type: "chain", dmg: 1.0 + 0.15 * r, element: "physical", jumps: 2 + Math.floor(r / 2), range: 14, weapon: true, stun: 0.4 }),
      rankText: (r) => `${pct(1.0 + 0.15 * r)} урона, ${2 + Math.floor(r / 2)} отскока`,
    },
    {
      id: "retribution", kind: "passive", name: "Возмездие", icon: "thorns", tree: 0, tier: 1, col: 2,
      description: "Возвращает часть урона ближнего боя атакующему.",
      effect: (r) => ({ type: "passive", mods: { thorns: 0.1 * r } }),
      rankText: (r) => `Отражает ${pct(0.1 * r)} полученного урона`,
    },
    {
      id: "fortress", name: "Бастион", icon: "fortress", tree: 0, tier: 2, col: 1,
      requires: [{ id: "bulwark", rank: 1 }],
      description: "Барьер, поглощающий урон.",
      cooldown: 20,
      effect: (r) => ({ type: "shield", pctOfHp: 0.25 + 0.05 * r, duration: 8 }),
      rankText: (r) => `Поглощает ${pct(0.25 + 0.05 * r)} макс. здоровья, 8 с`,
    },
    {
      id: "heavy_armor", kind: "passive", name: "Латная выучка", icon: "armor", tree: 0, tier: 3, col: 2,
      requires: [{ id: "bulwark", rank: 2 }],
      description: "Броня толще, тело крепче.",
      effect: (r) => ({ type: "passive", mods: { armorPct: 0.07 * r, hpPct: 0.03 * r } }),
      rankText: (r) => `+${pct(0.07 * r)} брони, +${pct(0.03 * r)} здоровья`,
    },
    {
      id: "shield_wall", name: "Стена щитов", icon: "wall", tree: 0, tier: 4, col: 0,
      requires: [{ id: "shield_throw", rank: 1 }, { id: "fortress", rank: 1 }],
      description: "Вы и союзники рядом почти неуязвимы — недолго.",
      cooldown: 35,
      effect: (r) => ({ type: "buff", duration: 5 + 0.5 * r, drPct: 0.45, thorns: 0.3 + 0.1 * r, party: 8 }),
      rankText: (r) => `${f1(5 + 0.5 * r)} с: −45% урона, отражение ${pct(0.3 + 0.1 * r)}`,
    },
    {
      id: "aegis", kind: "passive", name: "Эгида", icon: "aegis", tree: 0, tier: 5, col: 2,
      requires: [{ id: "heavy_armor", rank: 1 }],
      description: "Щит отражает даже магию.",
      effect: (r) => ({ type: "passive", mods: { resFire: 0.06 * r, resCold: 0.06 * r, resDark: 0.06 * r, blockPct: 0.03 * r } }),
      rankText: (r) => `+${pct(0.06 * r)} ко всем сопротивлениям, +${pct(0.03 * r)} к блоку`,
    },
    // --- Натиск
    {
      id: "charge", name: "Натиск", icon: "charge", tree: 1, tier: 0, col: 0,
      description: "Рывок вперёд, сбивающий врагов на пути.",
      cost: { stamina: 25 }, cooldown: 9,
      effect: (r) => ({ type: "dash", distance: 7, dmg: 1.1 + 0.15 * r, knock: 5 }),
      rankText: (r) => `Рывок на 7 м, ${pct(1.1 + 0.15 * r)} урона`,
    },
    {
      id: "swordsmanship", kind: "passive", name: "Фехтование", icon: "mastery_blade", tree: 1, tier: 0, col: 2,
      description: "Удары точнее и сильнее.",
      effect: (r) => ({ type: "passive", mods: { dmgPct: 0.05 * r, critChance: 0.012 * r } }),
      rankText: (r) => `+${pct(0.05 * r)} урона, +${pct(0.012 * r)} шанса крита`,
    },
    {
      id: "zeal", name: "Рвение", icon: "zeal", tree: 1, tier: 1, col: 0,
      description: "Серия из четырёх выпадов по врагам перед вами.",
      cost: { stamina: 25 }, cooldown: 4,
      synergies: [{ id: "swordsmanship", pct: 0.06 }],
      effect: (r) => ({ type: "arc", dmg: 0.45 + 0.07 * r, range: 2.8, arc: 1.4, hits: 4 }),
      rankText: (r) => `4 удара по ${pct(0.45 + 0.07 * r)} урона`,
    },
    {
      id: "trample", name: "Таран", icon: "trample", tree: 1, tier: 2, col: 0,
      requires: [{ id: "charge", rank: 1 }],
      description: "Натиск с оглушением: враг не успевает понять, что случилось.",
      cost: { stamina: 30 }, cooldown: 10,
      synergies: [{ id: "charge", pct: 0.1 }],
      effect: (r) => ({ type: "dash", distance: 10, dmg: 1.6 + 0.2 * r, knock: 6, stun: 1.5 }),
      rankText: (r) => `Рывок на 10 м, ${pct(1.6 + 0.2 * r)} урона, оглушение 1,5 с`,
    },
    {
      id: "riposte", kind: "passive", name: "Контратака", icon: "riposte", tree: 1, tier: 2, col: 2,
      description: "Окно парирования шире, удары быстрее.",
      effect: (r) => ({ type: "passive", mods: { parryWindow: 0.03 * r, atkSpeedPct: 0.03 * r } }),
      rankText: (r) => `Окно парирования +${(0.03 * r).toFixed(2)} с, +${pct(0.03 * r)} скорости атаки`,
    },
    {
      id: "crushing_blow", name: "Сокрушающий удар", icon: "crush", tree: 1, tier: 3, col: 1,
      requires: [{ id: "zeal", rank: 1 }],
      description: "Медленный, но страшный удар сверху.",
      cost: { stamina: 30 }, cooldown: 7,
      synergies: [{ id: "zeal", pct: 0.08 }],
      effect: (r) => ({ type: "arc", dmg: 2.4 + 0.3 * r, range: 3, arc: 1, stun: 1.2, knock: 4, execute: 0.25 }),
      rankText: (r) => `${pct(2.4 + 0.3 * r)} урона, ×2 по раненым врагам`,
    },
    {
      id: "valor_leap", name: "Доблестный прыжок", icon: "leap", tree: 1, tier: 4, col: 0, aimed: true,
      requires: [{ id: "trample", rank: 1 }],
      description: "Прыжок в гущу врагов со щитом наперёд.",
      cost: { stamina: 30 }, cooldown: 10,
      effect: (r) => ({ type: "leap", dmg: 1.5 + 0.25 * r, radius: 3.6, stun: 1.6, range: 13 }),
      rankText: (r) => `${pct(1.5 + 0.25 * r)} урона при приземлении, оглушение 1,6 с`,
    },
    {
      id: "blade_storm", name: "Стальной шквал", icon: "whirl", tree: 1, tier: 5, col: 1,
      requires: [{ id: "crushing_blow", rank: 1 }],
      description: "Круговой шквал ударов мечом и щитом.",
      cost: { stamina: 40 }, cooldown: 12,
      synergies: [{ id: "zeal", pct: 0.06 }],
      effect: (r) => ({ type: "whirl", dmg: 0.6 + 0.1 * r, radius: 3.4, duration: 2.1, tick: 0.3 }),
      rankText: (r) => `${pct(0.6 + 0.1 * r)} урона каждые 0,3 с, 2,1 с`,
    },
    // --- Клятвы
    {
      id: "taunt", name: "Вызов", icon: "taunt", tree: 2, tier: 0, col: 0,
      description: "Враги рядом атакуют только вас, а вы получаете меньше урона.",
      cooldown: 14,
      effect: (r) => ({ type: "taunt", radius: 12, duration: 6, drPct: 0.15 + 0.04 * r }),
      rankText: (r) => `Провокация на 6 с, −${pct(0.15 + 0.04 * r)} получаемого урона`,
    },
    {
      id: "oath_of_might", name: "Клятва силы", icon: "aura_red", tree: 2, tier: 0, col: 1,
      description: "Аура: вы и союзники рядом бьёте сильнее.",
      cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 30, dmgPct: 0.1 + 0.05 * r, party: 10 }),
      rankText: (r) => `Аура 30 с: +${pct(0.1 + 0.05 * r)} урона`,
    },
    {
      id: "oath_of_iron", name: "Клятва железа", icon: "aura_grey", tree: 2, tier: 1, col: 1,
      requires: [{ id: "oath_of_might", rank: 1 }],
      description: "Аура: удары врагов вязнут в броне.",
      cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 30, drPct: 0.08 + 0.03 * r, thorns: 0.1 * r, party: 10 }),
      rankText: (r) => `Аура 30 с: −${pct(0.08 + 0.03 * r)} урона, отражение ${pct(0.1 * r)}`,
    },
    {
      id: "vigor", kind: "passive", name: "Неутомимость", icon: "heart", tree: 2, tier: 1, col: 2,
      description: "Больше выносливости, здоровье восстанавливается быстрее.",
      effect: (r) => ({ type: "passive", mods: { staminaRegenPct: 0.08 * r, hpRegen: 0.35 * r } }),
      rankText: (r) => `+${pct(0.08 * r)} восстановления выносливости, +${f1(0.35 * r)} здоровья/с`,
    },
    {
      id: "holy_shield", name: "Святой щит", icon: "fortress", tree: 2, tier: 2, col: 0,
      requires: [{ id: "taunt", rank: 1 }],
      description: "Щит светится: блок лучше, нежить рядом горит.",
      cooldown: 25,
      effect: (r) => ({ type: "buff", duration: 20, drPct: 0.1, auraDps: 0.25 + 0.06 * r, auraR: 4, auraEl: "holy", auraUndead: true }),
      rankText: (r) => `20 с: −10% урона, ${pct(0.25 + 0.06 * r)} силы/с святым огнём по нежити рядом`,
    },
    {
      id: "oath_of_vengeance", name: "Клятва мести", icon: "aura_fire", tree: 2, tier: 3, col: 1,
      requires: [{ id: "oath_of_iron", rank: 1 }],
      description: "Аура: пламя жжёт всех врагов вокруг.",
      cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 25, auraDps: 0.3 + 0.08 * r, auraR: 4.5, auraEl: "fire" }),
      rankText: (r) => `Аура 25 с: ${pct(0.3 + 0.08 * r)} урона оружия/с огнём в радиусе 4,5 м`,
    },
    {
      id: "conviction", kind: "passive", name: "Убеждённость", icon: "devotion", tree: 2, tier: 4, col: 2,
      requires: [{ id: "vigor", rank: 1 }],
      description: "Вера держит на ногах.",
      effect: (r) => ({ type: "passive", mods: { hpPct: 0.05 * r, lifeOnKill: 0.01 * r } }),
      rankText: (r) => `+${pct(0.05 * r)} здоровья, ${pct(0.01 * r)} здоровья за убийство`,
    },
    {
      id: "last_stand", name: "Последний рубеж", icon: "banner", tree: 2, tier: 5, col: 0,
      requires: [{ id: "holy_shield", rank: 1 }, { id: "oath_of_vengeance", rank: 1 }],
      description: "Знамя в землю: здесь мы стоим.",
      cooldown: 60,
      effect: (r) => ({ type: "sanctuary", radius: 6, duration: 10, drPct: 0.35 + 0.03 * r, regenPct: 0.03 + 0.005 * r, holyDps: 0.5 + 0.1 * r }),
      rankText: (r) => `10 с: −${pct(0.35 + 0.03 * r)} урона, лечение ${pct(0.03 + 0.005 * r)}/с`,
    },
  ]),

  // =========================================================== РАЗБОЙНИК
  ...tree("rogue", [
    // --- Клинки
    {
      id: "fan_of_knives", name: "Веер клинков", icon: "knives", tree: 0, tier: 0, col: 0,
      description: "Метает клинки во все стороны.",
      cost: { stamina: 20 }, cooldown: 5,
      effect: (r) => ({ type: "nova", dmg: 0.9 + 0.12 * r, radius: 4.5, element: "physical", weapon: true }),
      rankText: (r) => `${pct(0.9 + 0.12 * r)} урона в радиусе 4,5 м`,
    },
    {
      id: "assassin", kind: "passive", name: "Убийца", icon: "crit", tree: 0, tier: 0, col: 2,
      description: "Больше шанс и урон критических ударов. Удары в спину — двойной шанс.",
      effect: (r) => ({ type: "passive", mods: { critChance: 0.02 * r, critDmg: 0.1 * r, backstab: 1 } }),
      rankText: (r) => `+${pct(0.02 * r)} шанса крита, +${pct(0.1 * r)} урона крита`,
    },
    {
      id: "throwing_knives", name: "Метательные ножи", icon: "throw", tree: 0, tier: 1, col: 0,
      description: "Три ножа веером в цель.",
      cost: { stamina: 12 }, cooldown: 1.5,
      synergies: [{ id: "fan_of_knives", pct: 0.06 }],
      effect: (r) => ({ type: "projectile", dmg: 0.6 + 0.1 * r, speed: 32, element: "physical", count: 3, spread: 0.12, size: 0.12, weapon: true }),
      rankText: (r) => `3 ножа по ${pct(0.6 + 0.1 * r)} урона`,
    },
    {
      id: "flurry", name: "Шквал клинков", icon: "frenzy", tree: 0, tier: 2, col: 1,
      requires: [{ id: "throwing_knives", rank: 1 }],
      description: "Пять молниеносных уколов.",
      cost: { stamina: 25 }, cooldown: 5,
      synergies: [{ id: "assassin", pct: 0.05 }],
      effect: (r) => ({ type: "arc", dmg: 0.4 + 0.07 * r, range: 2.5, arc: 1.0, hits: 5 }),
      rankText: (r) => `5 ударов по ${pct(0.4 + 0.07 * r)} урона`,
    },
    {
      id: "evasion", kind: "passive", name: "Увёртливость", icon: "evade", tree: 0, tier: 2, col: 2,
      description: "Шанс полностью избежать удара.",
      effect: (r) => ({ type: "passive", mods: { dodge: 0.04 * r } }),
      rankText: (r) => `${pct(0.04 * r)} шанс уклонения`,
    },
    {
      id: "blade_dance", name: "Танец клинков", icon: "whirl", tree: 0, tier: 3, col: 0,
      requires: [{ id: "fan_of_knives", rank: 2 }],
      description: "Кружение с кинжалами.",
      cost: { stamina: 30 }, cooldown: 9,
      synergies: [{ id: "flurry", pct: 0.06 }],
      effect: (r) => ({ type: "whirl", dmg: 0.45 + 0.08 * r, radius: 2.8, duration: 1.8, tick: 0.2 }),
      rankText: (r) => `${pct(0.45 + 0.08 * r)} урона каждые 0,2 с, 1,8 с`,
    },
    {
      id: "lethality", kind: "passive", name: "Смертоносность", icon: "skull_red", tree: 0, tier: 4, col: 2,
      requires: [{ id: "assassin", rank: 3 }],
      description: "Каждая рана — последняя.",
      effect: (r) => ({ type: "passive", mods: { critDmg: 0.15 * r, dmgPct: 0.05 * r } }),
      rankText: (r) => `+${pct(0.15 * r)} урона крита, +${pct(0.05 * r)} урона`,
    },
    {
      id: "death_blossom", name: "Цветок смерти", icon: "knives", tree: 0, tier: 5, col: 0,
      requires: [{ id: "blade_dance", rank: 1 }],
      description: "Двенадцать клинков разлетаются во все стороны, пробивая насквозь.",
      cost: { stamina: 40 }, cooldown: 12,
      synergies: [{ id: "throwing_knives", pct: 0.08 }],
      effect: (r) => ({ type: "projectile", dmg: 0.8 + 0.12 * r, speed: 28, element: "physical", count: 12, spread: 0.52, pierce: true, size: 0.12, weapon: true }),
      rankText: (r) => `12 клинков по ${pct(0.8 + 0.12 * r)}, пробивают насквозь`,
    },
    // --- Ловушки и яды
    {
      id: "poison_blade", name: "Отравленный клинок", icon: "poison", tree: 1, tier: 0, col: 0,
      description: "Удары отравляют врагов.",
      cooldown: 15,
      effect: (r) => ({ type: "buff", duration: 10, poison: 0.25 + 0.07 * r }),
      rankText: (r) => `Яд: ${pct(0.25 + 0.07 * r)} урона оружия в секунду, 3 с`,
    },
    {
      id: "toxicology", kind: "passive", name: "Токсикология", icon: "vial", tree: 1, tier: 0, col: 2,
      description: "Яды сильнее.",
      effect: (r) => ({ type: "passive", mods: { pct_poison: 0.1 * r, pct_fire: 0.04 * r } }),
      rankText: (r) => `+${pct(0.1 * r)} урона ядом, +${pct(0.04 * r)} огнём`,
    },
    {
      id: "blade_trap", name: "Ловушка-клинкомёт", icon: "trap", tree: 1, tier: 1, col: 0, aimed: true,
      description: "Механизм на полу метает ножи в ближайших врагов.",
      cost: { stamina: 20 }, cooldown: 6,
      synergies: [{ id: "throwing_knives", pct: 0.06 }],
      effect: (r) => ({ type: "sentry", dmg: 0.5 + 0.08 * r, duration: 10, rate: 0.7, element: "physical", range: 12, style: "blade_trap", weapon: true }),
      rankText: (r) => `10 с, нож каждые 0,7 с по ${pct(0.5 + 0.08 * r)} урона`,
    },
    {
      id: "poison_cloud", name: "Ядовитое облако", icon: "cloud", tree: 1, tier: 2, col: 1, aimed: true,
      requires: [{ id: "poison_blade", rank: 1 }],
      description: "Облако яда, медленно разъедающее всё живое.",
      cost: { stamina: 25 }, cooldown: 9,
      synergies: [{ id: "toxicology", pct: 0.1 }],
      effect: (r) => ({ type: "field", dps: 0.35 + 0.07 * r, radius: 3.5, duration: 6, element: "poison", slow: 0.2, weapon: true, style: "poison" }),
      rankText: (r) => `${pct(0.35 + 0.07 * r)} урона оружия/с, 6 с, замедление`,
    },
    {
      id: "fire_trap", name: "Огненная ловушка", icon: "trap_fire", tree: 1, tier: 3, col: 0, aimed: true,
      requires: [{ id: "blade_trap", rank: 1 }],
      description: "Ловушка, плюющая огненными шарами.",
      cost: { stamina: 25 }, cooldown: 8,
      synergies: [{ id: "blade_trap", pct: 0.08 }, { id: "toxicology", pct: 0.04 }],
      effect: (r) => ({ type: "sentry", dmg: 0.7 + 0.1 * r, duration: 10, rate: 1.2, element: "fire", range: 12, style: "fire_trap", weapon: true }),
      rankText: (r) => `10 с, огненный шар каждые 1,2 с по ${pct(0.7 + 0.1 * r)}`,
    },
    {
      id: "trap_mastery", kind: "passive", name: "Мастер ловушек", icon: "gear", tree: 1, tier: 3, col: 2,
      requires: [{ id: "blade_trap", rank: 1 }],
      description: "Ловушки ставятся вдвое (на рангах 3 и 5 — втрое).",
      effect: (r) => ({ type: "passive", mods: { extraTraps: r >= 5 ? 2 : r >= 3 ? 1 : 0, pct_physical: 0.03 * r } }),
      rankText: (r) => `Дополнительных ловушек: ${r >= 5 ? 2 : r >= 3 ? 1 : 0}, +${pct(0.03 * r)} физ. урона`,
    },
    {
      id: "venom_nova", name: "Ядовитая вспышка", icon: "poison_nova", tree: 1, tier: 4, col: 1,
      requires: [{ id: "poison_cloud", rank: 1 }],
      description: "Волна яда вокруг вас.",
      cost: { stamina: 30 }, cooldown: 10,
      synergies: [{ id: "poison_cloud", pct: 0.1 }],
      effect: (r) => ({ type: "nova", dmg: 0.5 + 0.08 * r, radius: 6, element: "poison", dot: 0.5 + 0.1 * r, weapon: true }),
      rankText: (r) => `${pct(0.5 + 0.08 * r)} урона + яд ${pct(0.5 + 0.1 * r)}/с 4 с`,
    },
    {
      id: "death_sentry", name: "Страж смерти", icon: "sentry", tree: 1, tier: 5, col: 0, aimed: true,
      requires: [{ id: "fire_trap", rank: 1 }],
      description: "Ловушка, бьющая молниями по цепочке.",
      cost: { stamina: 35 }, cooldown: 12,
      synergies: [{ id: "fire_trap", pct: 0.06 }, { id: "trap_mastery", pct: 0.06 }],
      effect: (r) => ({ type: "sentry", dmg: 1.0 + 0.15 * r, duration: 12, rate: 1.0, element: "lightning", range: 13, style: "death_sentry", weapon: true }),
      rankText: (r) => `12 с, цепная молния каждую секунду по ${pct(1.0 + 0.15 * r)}`,
    },
    // --- Тени
    {
      id: "shadow_step", name: "Шаг в тень", icon: "shadow", tree: 2, tier: 0, col: 0,
      description: "Мгновенно оказывается за спиной врага и наносит критический удар.",
      cost: { stamina: 25 }, cooldown: 8,
      effect: (r) => ({ type: "dash", distance: 12, dmg: 1.4 + 0.2 * r, behind: true, guaranteedCrit: true }),
      rankText: (r) => `${pct(1.4 + 0.2 * r)} урона, гарантированный крит`,
    },
    {
      id: "fleet_foot", kind: "passive", name: "Лёгкая поступь", icon: "evade", tree: 2, tier: 0, col: 2,
      description: "Быстрее шаг, больше выносливости.",
      effect: (r) => ({ type: "passive", mods: { movePct: 0.03 * r, staminaRegenPct: 0.08 * r } }),
      rankText: (r) => `+${pct(0.03 * r)} скорости, +${pct(0.08 * r)} восстановления выносливости`,
    },
    {
      id: "smoke_bomb", name: "Дымовая бомба", icon: "smoke", tree: 2, tier: 1, col: 0,
      requires: [{ id: "shadow_step", rank: 1 }],
      description: "Ослепляет врагов вокруг и ускоряет вас.",
      cooldown: 18,
      effect: (r) => ({ type: "blind", radius: 6, duration: 2 + 0.4 * r, movePct: 0.3 }),
      rankText: (r) => `Ослепление ${f1(2 + 0.4 * r)} с, +30% скорости`,
    },
    {
      id: "shadow_veil", name: "Покров тени", icon: "veil", tree: 2, tier: 2, col: 1,
      description: "Тень обволакивает: удары по вам часто проходят мимо, ваши — точнее.",
      cooldown: 25,
      effect: (r) => ({ type: "buff", duration: 10, drPct: 0.15 + 0.03 * r, critChance: 0.1 + 0.02 * r }),
      rankText: (r) => `10 с: −${pct(0.15 + 0.03 * r)} урона, +${pct(0.1 + 0.02 * r)} шанса крита`,
    },
    {
      id: "blink_strike", name: "Мерцание", icon: "teleport", tree: 2, tier: 3, col: 0, aimed: true,
      requires: [{ id: "smoke_bomb", rank: 1 }],
      description: "Исчезаете и появляетесь в точке прицела, раня всех рядом.",
      cost: { stamina: 20 }, cooldown: Math.max(3, 6),
      synergies: [{ id: "shadow_step", pct: 0.08 }],
      effect: (r) => ({ type: "blink", range: 12, novaDmg: 0.8 + 0.15 * r, element: "dark" }),
      rankText: (r) => `Телепорт до 12 м, ${pct(0.8 + 0.15 * r)} урона тьмой вокруг`,
    },
    {
      id: "mark_for_death", name: "Метка смерти", icon: "curse", tree: 2, tier: 3, col: 2, aimed: true,
      description: "Отмеченные враги получают больше урона.",
      cost: { stamina: 15 }, cooldown: 14,
      effect: (r) => ({ type: "curse", radius: 4, vuln: 0.15 + 0.05 * r, slow: 0.1, duration: 8 }),
      rankText: (r) => `+${pct(0.15 + 0.05 * r)} получаемого урона на 8 с`,
    },
    {
      id: "shadow_clone", name: "Теневой двойник", icon: "clone", tree: 2, tier: 4, col: 1,
      requires: [{ id: "shadow_veil", rank: 1 }],
      description: "Тень сражается рядом с вами.",
      cost: { stamina: 30 }, cooldown: 30,
      effect: (r) => ({ type: "summon", max: 1, duration: 20 + 2 * r, unit: "shadow" }),
      rankText: (r) => `Двойник на ${20 + 2 * r} с, сила растёт с рангом`,
    },
    {
      id: "assassinate", name: "Устранение", icon: "execute", tree: 2, tier: 5, col: 0,
      requires: [{ id: "blink_strike", rank: 1 }, { id: "mark_for_death", rank: 1 }],
      description: "Шаг за спину и смертельный удар: втрое по раненым.",
      cost: { stamina: 35 }, cooldown: 14,
      synergies: [{ id: "shadow_step", pct: 0.08 }],
      effect: (r) => ({ type: "dash", distance: 14, dmg: 3 + 0.4 * r, behind: true, guaranteedCrit: true }),
      rankText: (r) => `${pct(3 + 0.4 * r)} урона, гарантированный крит`,
    },
  ]),

  // =========================================================== МАГ
  ...tree("mage", [
    // --- Огонь
    {
      id: "fireball", name: "Огненный шар", icon: "fire", tree: 0, tier: 0, col: 0,
      description: "Взрывается при попадании, поджигая всё вокруг.",
      cost: { mana: 14 }, cooldown: 1.2,
      synergies: [{ id: "fire_mastery", pct: 0.04 }],
      effect: (r) => ({ type: "projectile", dmg: 1.5 + 0.2 * r, speed: 22, element: "fire", radius: 2.6, size: 0.35 }),
      rankText: (r) => `${pct(1.5 + 0.2 * r)} силы заклинаний, взрыв 2,6 м`,
    },
    {
      id: "warmth", kind: "passive", name: "Тепло", icon: "mana", tree: 0, tier: 0, col: 2,
      description: "Мана течёт быстрее.",
      effect: (r) => ({ type: "passive", mods: { manaRegenPct: 0.15 * r } }),
      rankText: (r) => `+${pct(0.15 * r)} восстановления маны`,
    },
    {
      id: "fire_wall", name: "Стена огня", icon: "firewall", tree: 0, tier: 1, col: 0, aimed: true,
      requires: [{ id: "fireball", rank: 1 }],
      description: "Огненная лужа в точке прицела.",
      cost: { mana: 22 }, cooldown: 6,
      synergies: [{ id: "fireball", pct: 0.05 }],
      effect: (r) => ({ type: "field", dps: 0.6 + 0.12 * r, radius: 3, duration: 5, element: "fire", style: "fire" }),
      rankText: (r) => `${pct(0.6 + 0.12 * r)} силы/с, 5 с`,
    },
    {
      id: "fire_mastery", kind: "passive", name: "Власть огня", icon: "mastery_fire", tree: 0, tier: 2, col: 2,
      description: "Огонь жжёт сильнее.",
      effect: (r) => ({ type: "passive", mods: { pct_fire: 0.1 * r } }),
      rankText: (r) => `+${pct(0.1 * r)} урона огнём`,
    },
    {
      id: "inferno", name: "Инферно", icon: "inferno", tree: 0, tier: 2, col: 0,
      requires: [{ id: "fire_wall", rank: 1 }],
      description: "Огненная волна вокруг вас.",
      cost: { mana: 30 }, cooldown: 8,
      synergies: [{ id: "fire_wall", pct: 0.06 }],
      effect: (r) => ({ type: "nova", dmg: 1.4 + 0.2 * r, radius: 6, element: "fire", knock: 2, dot: 0.3 }),
      rankText: (r) => `${pct(1.4 + 0.2 * r)} урона огнём в радиусе 6 м + поджог`,
    },
    {
      id: "meteor", name: "Метеор", icon: "meteor", tree: 0, tier: 3, col: 0, aimed: true,
      requires: [{ id: "fireball", rank: 3 }],
      description: "Через мгновение на точку прицела падает метеор и оставляет пламя.",
      cost: { mana: 45 }, cooldown: 14,
      synergies: [{ id: "fireball", pct: 0.06 }, { id: "fire_wall", pct: 0.04 }],
      effect: (r) => ({ type: "ground", dmg: 3.5 + 0.5 * r, radius: 4.5, element: "fire", delay: 1.4 }),
      rankText: (r) => `${pct(3.5 + 0.5 * r)} урона в радиусе 4,5 м`,
    },
    {
      id: "hydra", name: "Гидра", icon: "hydra", tree: 0, tier: 4, col: 1, aimed: true,
      requires: [{ id: "inferno", rank: 1 }],
      description: "Трёхголовая огненная гидра плюётся огнём во врагов.",
      cost: { mana: 35 }, cooldown: 10,
      synergies: [{ id: "fireball", pct: 0.05 }],
      effect: (r) => ({ type: "sentry", dmg: 0.6 + 0.1 * r, duration: 10, rate: 0.6, element: "fire", range: 13, style: "hydra" }),
      rankText: (r) => `10 с, огненный плевок каждые 0,6 с по ${pct(0.6 + 0.1 * r)}`,
    },
    {
      id: "armageddon", name: "Армагеддон", icon: "meteor", tree: 0, tier: 5, col: 0,
      requires: [{ id: "meteor", rank: 1 }],
      description: "Небо горит: вокруг вас падают метеоры.",
      cost: { mana: 70 }, cooldown: 30,
      synergies: [{ id: "meteor", pct: 0.08 }],
      effect: (r) => ({ type: "field", dps: 1.0 + 0.2 * r, radius: 9, duration: 8, element: "fire", style: "armageddon" }),
      rankText: (r) => `8 с: метеоры вокруг, ${pct(1.0 + 0.2 * r)} силы/с`,
    },
    // --- Лёд
    {
      id: "ice_bolt", name: "Ледяная стрела", icon: "ice_bolt", tree: 1, tier: 0, col: 0,
      description: "Осколок льда, замедляющий цель.",
      cost: { mana: 8 }, cooldown: 0.8,
      synergies: [{ id: "cold_mastery", pct: 0.04 }],
      effect: (r) => ({ type: "projectile", dmg: 1.1 + 0.15 * r, speed: 30, element: "cold", slow: 0.4, size: 0.2 }),
      rankText: (r) => `${pct(1.1 + 0.15 * r)} силы, замедление 40%`,
    },
    {
      id: "frozen_armor", name: "Ледяной доспех", icon: "ice_armor", tree: 1, tier: 0, col: 2,
      description: "Лёд на коже: меньше урона, а ударившие вас замерзают.",
      cost: { mana: 20 }, cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 60, drPct: 0.08 + 0.03 * r, thorns: 0.15 }),
      rankText: (r) => `60 с: −${pct(0.08 + 0.03 * r)} урона, отражение 15%`,
    },
    {
      id: "frost_nova", name: "Кольцо льда", icon: "frost", tree: 1, tier: 1, col: 0,
      requires: [{ id: "ice_bolt", rank: 1 }],
      description: "Замораживает врагов вокруг.",
      cost: { mana: 25 }, cooldown: 9,
      synergies: [{ id: "ice_bolt", pct: 0.05 }],
      effect: (r) => ({ type: "nova", dmg: 0.8 + 0.1 * r, radius: 5.5, element: "cold", freeze: 1.6 + 0.2 * r }),
      rankText: (r) => `${pct(0.8 + 0.1 * r)} урона, заморозка ${f1(1.6 + 0.2 * r)} с`,
    },
    {
      id: "glacial_spike", name: "Ледяной шип", icon: "spike", tree: 1, tier: 2, col: 0,
      requires: [{ id: "ice_bolt", rank: 2 }],
      description: "Тяжёлый шип: взрывается и замораживает всех рядом.",
      cost: { mana: 24 }, cooldown: 3,
      synergies: [{ id: "ice_bolt", pct: 0.06 }],
      effect: (r) => ({ type: "projectile", dmg: 1.8 + 0.25 * r, speed: 24, element: "cold", radius: 2.4, freeze: 1.2, size: 0.3 }),
      rankText: (r) => `${pct(1.8 + 0.25 * r)} урона, взрыв, заморозка 1,2 с`,
    },
    {
      id: "cold_mastery", kind: "passive", name: "Власть холода", icon: "mastery_cold", tree: 1, tier: 2, col: 2,
      description: "Холод режет глубже.",
      effect: (r) => ({ type: "passive", mods: { pct_cold: 0.1 * r } }),
      rankText: (r) => `+${pct(0.1 * r)} урона холодом`,
    },
    {
      id: "blizzard", name: "Метель", icon: "blizzard", tree: 1, tier: 3, col: 0, aimed: true,
      requires: [{ id: "glacial_spike", rank: 1 }],
      description: "Ледяной шторм в точке прицела.",
      cost: { mana: 40 }, cooldown: 10,
      synergies: [{ id: "glacial_spike", pct: 0.06 }, { id: "ice_bolt", pct: 0.04 }],
      effect: (r) => ({ type: "field", dps: 0.9 + 0.15 * r, radius: 4.5, duration: 5, element: "cold", slow: 0.45, style: "blizzard" }),
      rankText: (r) => `5 с: ${pct(0.9 + 0.15 * r)} силы/с, сильное замедление`,
    },
    {
      id: "ice_shards", name: "Ледяной веер", icon: "shards", tree: 1, tier: 4, col: 1,
      requires: [{ id: "frost_nova", rank: 1 }],
      description: "Пять осколков веером, пробивающих насквозь.",
      cost: { mana: 30 }, cooldown: 4,
      synergies: [{ id: "ice_bolt", pct: 0.06 }],
      effect: (r) => ({ type: "projectile", dmg: 1.0 + 0.15 * r, speed: 28, element: "cold", count: 5, spread: 0.18, pierce: true, slow: 0.3, size: 0.18 }),
      rankText: (r) => `5 осколков по ${pct(1.0 + 0.15 * r)}, пробивают`,
    },
    {
      id: "frozen_orb", name: "Ледяная сфера", icon: "orb", tree: 1, tier: 5, col: 0,
      requires: [{ id: "blizzard", rank: 1 }],
      description: "Медленная сфера холода, пробивающая всех на пути.",
      cost: { mana: 50 }, cooldown: 6,
      synergies: [{ id: "frost_nova", pct: 0.06 }, { id: "ice_bolt", pct: 0.04 }],
      effect: (r) => ({ type: "projectile", dmg: 3 + 0.4 * r, speed: 9, element: "cold", pierce: true, freeze: 0.8, size: 0.6 }),
      rankText: (r) => `${pct(3 + 0.4 * r)} урона всем на пути, заморозка`,
    },
    // --- Буря
    {
      id: "arcane_explosion", name: "Тайный взрыв", icon: "arcane", tree: 2, tier: 0, col: 1,
      description: "Отбрасывает и ранит всех рядом.",
      cost: { mana: 30 }, cooldown: 7,
      effect: (r) => ({ type: "nova", dmg: 1.3 + 0.18 * r, radius: 6, element: "arcane", knock: 7 }),
      rankText: (r) => `${pct(1.3 + 0.18 * r)} урона, сильное отбрасывание`,
    },
    {
      id: "elemental_mastery", kind: "passive", name: "Власть стихий", icon: "mastery", tree: 2, tier: 0, col: 2,
      description: "Увеличивает урон заклинаний.",
      effect: (r) => ({ type: "passive", mods: { spellPct: 0.08 * r } }),
      rankText: (r) => `+${pct(0.08 * r)} к урону заклинаний`,
    },
    {
      id: "charged_bolt", name: "Заряд", icon: "spark", tree: 2, tier: 1, col: 0,
      description: "Россыпь искр, бьющих молнией.",
      cost: { mana: 12 }, cooldown: 1.2,
      synergies: [{ id: "lightning_mastery", pct: 0.04 }],
      effect: (r) => ({ type: "projectile", dmg: 0.5 + 0.08 * r, speed: 16, element: "lightning", count: 3 + Math.floor(r / 2), spread: 0.3, size: 0.15 }),
      rankText: (r) => `${3 + Math.floor(r / 2)} искры по ${pct(0.5 + 0.08 * r)}`,
    },
    {
      id: "mana_flow", kind: "passive", name: "Поток маны", icon: "mana", tree: 2, tier: 1, col: 2,
      description: "Больше маны и быстрее её восстановление.",
      effect: (r) => ({ type: "passive", mods: { manaPct: 0.04 * r, manaRegenPct: 0.15 * r } }),
      rankText: (r) => `+${pct(0.04 * r)} маны, +${pct(0.15 * r)} восстановления`,
    },
    {
      id: "chain_lightning", name: "Цепная молния", icon: "chain", tree: 2, tier: 2, col: 0,
      requires: [{ id: "charged_bolt", rank: 1 }],
      description: "Молния перескакивает от врага к врагу.",
      cost: { mana: 22 }, cooldown: 2,
      synergies: [{ id: "charged_bolt", pct: 0.06 }],
      effect: (r) => ({ type: "chain", dmg: 1.4 + 0.2 * r, element: "lightning", jumps: 3 + Math.floor(r / 2), range: 16 }),
      rankText: (r) => `${pct(1.4 + 0.2 * r)} урона, ${3 + Math.floor(r / 2)} перескока`,
    },
    {
      id: "teleport", name: "Телепорт", icon: "teleport", tree: 2, tier: 3, col: 1, aimed: true,
      requires: [{ id: "arcane_explosion", rank: 1 }],
      description: "Мгновенный перенос в точку прицела.",
      cost: { mana: 24 }, cooldown: Math.max(2, 4),
      effect: (r) => ({ type: "blink", range: 10 + r }),
      rankText: (r) => `Дальность ${10 + r} м`,
    },
    {
      id: "lightning_mastery", kind: "passive", name: "Власть молнии", icon: "mastery_light", tree: 2, tier: 3, col: 2,
      description: "Молнии бьют сильнее.",
      effect: (r) => ({ type: "passive", mods: { pct_lightning: 0.12 * r, pct_arcane: 0.06 * r } }),
      rankText: (r) => `+${pct(0.12 * r)} урона молнией, +${pct(0.06 * r)} тайной магией`,
    },
    {
      id: "thunder_storm", name: "Гроза", icon: "storm", tree: 2, tier: 4, col: 0,
      requires: [{ id: "chain_lightning", rank: 1 }],
      description: "Над вами собирается туча и бьёт молниями по врагам рядом.",
      cost: { mana: 40 }, cooldown: 20,
      synergies: [{ id: "chain_lightning", pct: 0.06 }],
      effect: (r) => ({ type: "buff", duration: 15, auraDps: 0.7 + 0.15 * r, auraR: 7, auraEl: "lightning" }),
      rankText: (r) => `15 с: молнии ${pct(0.7 + 0.15 * r)} силы/с в радиусе 7 м`,
    },
    {
      id: "energy_shield", name: "Энергетический щит", icon: "fortress", tree: 2, tier: 5, col: 1,
      requires: [{ id: "teleport", rank: 1 }],
      description: "Мана принимает удары на себя.",
      cost: { mana: 30 }, cooldown: 25,
      effect: (r) => ({ type: "shield", pctOfHp: 0.4 + 0.08 * r, duration: 15 }),
      rankText: (r) => `Поглощает ${pct(0.4 + 0.08 * r)} макс. здоровья, 15 с`,
    },
  ]),

  // =========================================================== НЕКРОМАНТ
  ...tree("necromancer", [
    // --- Призыв
    {
      id: "raise_skeleton", name: "Поднять скелета", icon: "skeleton", tree: 0, tier: 0, col: 0,
      description: "Призывает скелета-воина, сражающегося на вашей стороне.",
      cost: { mana: 20 }, cooldown: 3,
      effect: (r) => ({ type: "summon", max: 1 + Math.floor(r / 2), duration: 45 }),
      rankText: (r) => `До ${1 + Math.floor(r / 2)} скелетов, сильнее с рангом`,
    },
    {
      id: "skeleton_mastery", kind: "passive", name: "Власть над костью", icon: "pact", tree: 0, tier: 0, col: 2,
      description: "Призванные крепче и бьют сильнее.",
      effect: (r) => ({ type: "passive", mods: { summonPct: 0.1 * r } }),
      rankText: (r) => `+${pct(0.1 * r)} к силе призванных`,
    },
    {
      id: "skeleton_mage", name: "Скелет-маг", icon: "skeleton_mage", tree: 0, tier: 1, col: 0,
      requires: [{ id: "raise_skeleton", rank: 1 }],
      description: "Скелет, стреляющий тёмными стрелами издалека.",
      cost: { mana: 25 }, cooldown: 3,
      effect: (r) => ({ type: "summon", max: 1 + Math.floor(r / 2), duration: 45, unit: "skeleton_mage" }),
      rankText: (r) => `До ${1 + Math.floor(r / 2)} магов`,
    },
    {
      id: "dark_pact", kind: "passive", name: "Тёмный договор", icon: "pact", tree: 0, tier: 1, col: 2,
      requires: [{ id: "skeleton_mastery", rank: 1 }],
      description: "Призванные скелеты крепче и сильнее; больше скелетов на рангах 3 и 5.",
      effect: (r) => ({ type: "passive", mods: { summonPct: 0.12 * r, extraSkeleton: Math.floor(r / 3) + (r >= 5 ? 1 : 0) } }),
      rankText: (r) => `+${pct(0.12 * r)} к силе скелетов`,
    },
    {
      id: "clay_golem", name: "Глиняный голем", icon: "golem", tree: 0, tier: 2, col: 1,
      description: "Медленный и очень крепкий страж.",
      cost: { mana: 35 }, cooldown: 10,
      effect: (r) => ({ type: "summon", max: 1, duration: 90, unit: "golem" }),
      rankText: (r) => `Голем на 90 с, крепче с рангом`,
    },
    {
      id: "summon_resist", kind: "passive", name: "Нерушимые", icon: "resist", tree: 0, tier: 3, col: 2,
      requires: [{ id: "dark_pact", rank: 1 }],
      description: "Призванные живут дольше и восстанавливают вас.",
      effect: (r) => ({ type: "passive", mods: { summonPct: 0.06 * r, lifeOnKill: 0.008 * r } }),
      rankText: (r) => `+${pct(0.06 * r)} к силе призванных, ${pct(0.008 * r)} здоровья за убийство`,
    },
    {
      id: "bone_army", name: "Костяное воинство", icon: "army", tree: 0, tier: 4, col: 0,
      requires: [{ id: "skeleton_mage", rank: 1 }],
      description: "Сразу три скелета-воина.",
      cost: { mana: 50 }, cooldown: 25,
      effect: (r) => ({ type: "summon", max: 3, duration: 20 + 3 * r, unit: "skeleton", count: 3 }),
      rankText: (r) => `3 скелета на ${20 + 3 * r} с`,
    },
    {
      id: "blood_golem", name: "Кровавый голем", icon: "golem_blood", tree: 0, tier: 5, col: 1,
      requires: [{ id: "clay_golem", rank: 1 }],
      description: "Голем из крови: часть его ударов лечит вас.",
      cost: { mana: 55 }, cooldown: 20,
      effect: (r) => ({ type: "summon", max: 1, duration: 90, unit: "blood_golem" }),
      rankText: (r) => `Кровавый голем, сила растёт с рангом`,
    },
    // --- Кость и яд
    {
      id: "bone_spear", name: "Костяное копьё", icon: "spear", tree: 1, tier: 0, col: 0,
      description: "Пронзает всех врагов на линии.",
      cost: { mana: 15 }, cooldown: 1.6,
      synergies: [{ id: "bone_mastery", pct: 0.05 }],
      effect: (r) => ({ type: "projectile", dmg: 1.6 + 0.22 * r, speed: 30, element: "dark", pierce: true, size: 0.25 }),
      rankText: (r) => `${pct(1.6 + 0.22 * r)} силы заклинаний, пробивает насквозь`,
    },
    {
      id: "soul_harvest", kind: "passive", name: "Жатва душ", icon: "soul", tree: 1, tier: 0, col: 2,
      description: "Убийства восстанавливают ману и здоровье.",
      effect: (r) => ({ type: "passive", mods: { manaOnKill: 0.03 * r, lifeOnKill: 0.01 * r } }),
      rankText: (r) => `${pct(0.03 * r)} маны и ${pct(0.01 * r)} здоровья за убийство`,
    },
    {
      id: "corpse_explosion", name: "Взрыв трупа", icon: "corpse", tree: 1, tier: 1, col: 1, aimed: true,
      description: "Ближайший к прицелу труп взрывается, раня врагов вокруг.",
      cost: { mana: 18 }, cooldown: 2.5,
      effect: (r) => ({ type: "corpse", radius: 4, pctOfCorpse: 0.4 + 0.08 * r, dmg: 1 + 0.1 * r }),
      rankText: (r) => `${pct(0.4 + 0.08 * r)} здоровья трупа + ${pct(1 + 0.1 * r)} силы заклинаний`,
    },
    {
      id: "poison_nova", name: "Ядовитая волна", icon: "poison_nova", tree: 1, tier: 2, col: 0,
      requires: [{ id: "bone_spear", rank: 1 }],
      description: "Кольцо яда, медленно убивающее всех вокруг.",
      cost: { mana: 30 }, cooldown: 8,
      effect: (r) => ({ type: "nova", dmg: 0.4 + 0.06 * r, radius: 7, element: "poison", dot: 0.6 + 0.12 * r }),
      rankText: (r) => `${pct(0.4 + 0.06 * r)} урона + яд ${pct(0.6 + 0.12 * r)}/с 4 с`,
    },
    {
      id: "bone_mastery", kind: "passive", name: "Власть кости", icon: "mastery_bone", tree: 1, tier: 2, col: 2,
      description: "Костяные и ядовитые чары сильнее.",
      effect: (r) => ({ type: "passive", mods: { pct_dark: 0.08 * r, pct_poison: 0.08 * r } }),
      rankText: (r) => `+${pct(0.08 * r)} урона тьмой и ядом`,
    },
    {
      id: "bone_prison", name: "Костяная тюрьма", icon: "prison", tree: 1, tier: 3, col: 1, aimed: true,
      requires: [{ id: "corpse_explosion", rank: 1 }],
      description: "Кости вырастают из пола и держат врагов.",
      cost: { mana: 25 }, cooldown: 12,
      effect: (r) => ({ type: "ground", dmg: 0.6 + 0.1 * r, radius: 3.5, element: "dark", delay: 0.4, stun: 2 + 0.3 * r }),
      rankText: (r) => `Обездвиживает на ${f1(2 + 0.3 * r)} с`,
    },
    {
      id: "bone_spirit", name: "Костяной дух", icon: "spirit", tree: 1, tier: 4, col: 0,
      requires: [{ id: "bone_spear", rank: 3 }],
      description: "Мощный дух, взрывающийся о врага.",
      cost: { mana: 35 }, cooldown: 3,
      synergies: [{ id: "bone_spear", pct: 0.06 }, { id: "bone_mastery", pct: 0.05 }],
      effect: (r) => ({ type: "projectile", dmg: 3 + 0.45 * r, speed: 18, element: "dark", radius: 2.2, size: 0.4 }),
      rankText: (r) => `${pct(3 + 0.45 * r)} урона, взрыв`,
    },
    {
      id: "plague", name: "Мор", icon: "cloud", tree: 1, tier: 5, col: 1, aimed: true,
      requires: [{ id: "poison_nova", rank: 1 }],
      description: "Огромное облако заразы.",
      cost: { mana: 55 }, cooldown: 16,
      synergies: [{ id: "poison_nova", pct: 0.08 }],
      effect: (r) => ({ type: "field", dps: 1.0 + 0.2 * r, radius: 6, duration: 8, element: "poison", slow: 0.25, style: "poison" }),
      rankText: (r) => `8 с: ${pct(1.0 + 0.2 * r)} силы/с в радиусе 6 м`,
    },
    // --- Проклятия
    {
      id: "decrepify", name: "Порча", icon: "curse", tree: 2, tier: 0, col: 0, aimed: true,
      description: "Проклятие: враги медленнее и получают больше урона.",
      cost: { mana: 20 }, cooldown: 12,
      effect: (r) => ({ type: "curse", radius: 5, vuln: 0.2 + 0.05 * r, slow: 0.4, duration: 8 }),
      rankText: (r) => `+${pct(0.2 + 0.05 * r)} получаемого урона, −40% скорости`,
    },
    {
      id: "curse_mastery", kind: "passive", name: "Знаток проклятий", icon: "mastery_curse", tree: 2, tier: 0, col: 2,
      description: "Больше маны, проклятия длятся дольше.",
      effect: (r) => ({ type: "passive", mods: { manaPct: 0.05 * r, curseDur: 0.1 * r } }),
      rankText: (r) => `+${pct(0.05 * r)} маны, +${pct(0.1 * r)} длительности проклятий`,
    },
    {
      id: "weaken", name: "Слабость", icon: "weaken", tree: 2, tier: 1, col: 0, aimed: true,
      requires: [{ id: "decrepify", rank: 1 }],
      description: "Проклятые враги бьют слабее.",
      cost: { mana: 15 }, cooldown: 10,
      effect: (r) => ({ type: "curse", radius: 6, vuln: 0, slow: 0, duration: 10, weaken: 0.2 + 0.05 * r }),
      rankText: (r) => `Враги наносят на ${pct(0.2 + 0.05 * r)} меньше урона`,
    },
    {
      id: "life_tap", name: "Кровопийца", icon: "leech", tree: 2, tier: 2, col: 1, aimed: true,
      description: "Удары по проклятым врагам лечат вас.",
      cost: { mana: 20 }, cooldown: 12,
      effect: (r) => ({ type: "curse", radius: 5, vuln: 0.05, slow: 0, duration: 10, lifeTap: 0.05 + 0.02 * r }),
      rankText: (r) => `${pct(0.05 + 0.02 * r)} урона по проклятым возвращается здоровьем`,
    },
    {
      id: "terror", name: "Ужас", icon: "fear", tree: 2, tier: 3, col: 0,
      requires: [{ id: "weaken", rank: 1 }],
      description: "Враги вокруг бегут прочь.",
      cost: { mana: 25 }, cooldown: 15,
      effect: (r) => ({ type: "warcry", radius: 8, fear: 3 + 0.5 * r }),
      rankText: (r) => `Страх ${f1(3 + 0.5 * r)} с в радиусе 8 м`,
    },
    {
      id: "soul_siphon", kind: "passive", name: "Вытягивание душ", icon: "soul", tree: 2, tier: 4, col: 2,
      requires: [{ id: "curse_mastery", rank: 2 }],
      description: "Тьма питает вас.",
      effect: (r) => ({ type: "passive", mods: { lifeSteal: 0.01 * r, spellPct: 0.05 * r } }),
      rankText: (r) => `${pct(0.01 * r)} вампиризма, +${pct(0.05 * r)} урона заклинаний`,
    },
    {
      id: "doom", name: "Рок", icon: "doom", tree: 2, tier: 5, col: 1, aimed: true,
      requires: [{ id: "life_tap", rank: 1 }, { id: "terror", rank: 1 }],
      description: "Высшее проклятие: враги ранимы, медленны, слабы и питают вас.",
      cost: { mana: 50 }, cooldown: 25,
      effect: (r) => ({ type: "curse", radius: 7, vuln: 0.3 + 0.05 * r, slow: 0.3, duration: 10, weaken: 0.2, lifeTap: 0.05 }),
      rankText: (r) => `+${pct(0.3 + 0.05 * r)} урона по ним, −30% скорости, −20% их урона`,
    },
  ]),

  // =========================================================== ЖРЕЦ
  ...tree("cleric", [
    // --- Исцеление
    {
      id: "heal", name: "Исцеление", icon: "heal", tree: 0, tier: 0, col: 0,
      description: "Лечит вас и союзников рядом.",
      cost: { mana: 22 }, cooldown: 6,
      effect: (r) => ({ type: "heal", base: 20 + 12 * r, scale: 1.4, radius: 9 }),
      rankText: (r) => `${20 + 12 * r} + 140% силы заклинаний здоровья`,
    },
    {
      id: "devotion", kind: "passive", name: "Благочестие", icon: "devotion", tree: 0, tier: 0, col: 2,
      description: "Больше здоровья и силы исцеления.",
      effect: (r) => ({ type: "passive", mods: { hpPct: 0.05 * r, healPct: 0.08 * r } }),
      rankText: (r) => `+${pct(0.05 * r)} здоровья, +${pct(0.08 * r)} исцеления`,
    },
    {
      id: "renew", name: "Обновление", icon: "renew", tree: 0, tier: 1, col: 0,
      requires: [{ id: "heal", rank: 1 }],
      description: "Медленное, но долгое восстановление.",
      cost: { mana: 18 }, cooldown: 15,
      effect: (r) => ({ type: "buff", duration: 12, regenPct: 0.02 + 0.006 * r, party: 9 }),
      rankText: (r) => `12 с: ${pct(0.02 + 0.006 * r)} здоровья/с`,
    },
    {
      id: "sanctuary", name: "Святилище", icon: "sanctuary", tree: 0, tier: 2, col: 1,
      description: "Освящённая земля: союзники в ней получают меньше урона и лечатся, нежить горит.",
      cost: { mana: 35 }, cooldown: 18,
      effect: (r) => ({ type: "sanctuary", radius: 5, duration: 7, drPct: 0.25 + 0.03 * r, regenPct: 0.02 + 0.005 * r, holyDps: 0.4 + 0.08 * r }),
      rankText: (r) => `−${pct(0.25 + 0.03 * r)} урона, лечение ${pct(0.02 + 0.005 * r)}/с`,
    },
    {
      id: "meditation", kind: "passive", name: "Медитация", icon: "mana", tree: 0, tier: 2, col: 2,
      description: "Мана восстанавливается быстрее.",
      effect: (r) => ({ type: "passive", mods: { manaRegenPct: 0.18 * r, manaPct: 0.03 * r } }),
      rankText: (r) => `+${pct(0.18 * r)} восстановления маны, +${pct(0.03 * r)} маны`,
    },
    {
      id: "divine_shield", name: "Божественный щит", icon: "fortress", tree: 0, tier: 3, col: 0,
      requires: [{ id: "renew", rank: 1 }],
      description: "Свет принимает удары на себя.",
      cost: { mana: 30 }, cooldown: 25,
      effect: (r) => ({ type: "shield", pctOfHp: 0.3 + 0.06 * r, duration: 10 }),
      rankText: (r) => `Поглощает ${pct(0.3 + 0.06 * r)} макс. здоровья, 10 с`,
    },
    {
      id: "guardian_spirit", name: "Дух-хранитель", icon: "spirit_holy", tree: 0, tier: 4, col: 1,
      requires: [{ id: "sanctuary", rank: 1 }],
      description: "Светлый дух бьётся рядом и сжигает нежить.",
      cost: { mana: 40 }, cooldown: 30,
      effect: (r) => ({ type: "summon", max: 1, duration: 25 + 3 * r, unit: "spirit" }),
      rankText: (r) => `Дух на ${25 + 3 * r} с`,
    },
    {
      id: "resurrection_light", name: "Свет воскрешения", icon: "heal", tree: 0, tier: 5, col: 0,
      requires: [{ id: "divine_shield", rank: 1 }],
      description: "Огромное исцеление и защита всем рядом.",
      cost: { mana: 60 }, cooldown: 45,
      synergies: [{ id: "heal", pct: 0.1 }],
      effect: (r) => ({ type: "heal", base: 80 + 30 * r, scale: 3, radius: 12, cleanse: true }),
      rankText: (r) => `${80 + 30 * r} + 300% силы здоровья, снимает яд`,
    },
    // --- Ауры
    {
      id: "undead_bane", kind: "passive", name: "Гроза нежити", icon: "bane", tree: 1, tier: 0, col: 2,
      description: "Больше урона по нежити.",
      effect: (r) => ({ type: "passive", mods: { undeadPct: 0.1 * r } }),
      rankText: (r) => `+${pct(0.1 * r)} урона по нежити`,
    },
    {
      id: "aura_might", name: "Аура мощи", icon: "aura_red", tree: 1, tier: 0, col: 0,
      description: "Вы и союзники рядом бьёте сильнее.",
      cost: { mana: 15 }, cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 40, dmgPct: 0.1 + 0.05 * r, party: 10 }),
      rankText: (r) => `40 с: +${pct(0.1 + 0.05 * r)} урона`,
    },
    {
      id: "aura_prayer", name: "Аура молитвы", icon: "aura_green", tree: 1, tier: 1, col: 0,
      requires: [{ id: "aura_might", rank: 1 }],
      description: "Все рядом постепенно исцеляются.",
      cost: { mana: 15 }, cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 40, regenPct: 0.006 + 0.003 * r, party: 10 }),
      rankText: (r) => `40 с: ${pct(0.006 + 0.003 * r)} здоровья/с`,
    },
    {
      id: "aura_holy_fire", name: "Аура святого огня", icon: "aura_fire", tree: 1, tier: 2, col: 1,
      description: "Святое пламя жжёт врагов вокруг.",
      cost: { mana: 20 }, cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 30, auraDps: 0.35 + 0.08 * r, auraR: 5, auraEl: "holy" }),
      rankText: (r) => `30 с: ${pct(0.35 + 0.08 * r)} силы/с в радиусе 5 м`,
    },
    {
      id: "aura_resist", name: "Аура стойкости", icon: "aura_grey", tree: 1, tier: 2, col: 0,
      requires: [{ id: "aura_prayer", rank: 1 }],
      description: "Вы и союзники получаете меньше урона.",
      cost: { mana: 15 }, cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 40, drPct: 0.08 + 0.03 * r, party: 10 }),
      rankText: (r) => `40 с: −${pct(0.08 + 0.03 * r)} урона`,
    },
    {
      id: "aura_speed", name: "Аура рвения", icon: "aura_blue", tree: 1, tier: 3, col: 1,
      requires: [{ id: "aura_holy_fire", rank: 1 }],
      description: "Быстрее шаг и удары.",
      cost: { mana: 15 }, cooldown: 30,
      effect: (r) => ({ type: "buff", duration: 40, movePct: 0.1 + 0.02 * r, atkSpeedPct: 0.06 + 0.02 * r, party: 10 }),
      rankText: (r) => `40 с: +${pct(0.1 + 0.02 * r)} скорости, +${pct(0.06 + 0.02 * r)} скорости атаки`,
    },
    {
      id: "aura_mastery", kind: "passive", name: "Хранитель аур", icon: "devotion", tree: 1, tier: 4, col: 2,
      requires: [{ id: "undead_bane", rank: 1 }],
      description: "Святая сила растёт.",
      effect: (r) => ({ type: "passive", mods: { pct_holy: 0.1 * r, healPct: 0.05 * r } }),
      rankText: (r) => `+${pct(0.1 * r)} урона светом, +${pct(0.05 * r)} исцеления`,
    },
    {
      id: "aura_conviction", name: "Аура убеждения", icon: "aura_white", tree: 1, tier: 5, col: 0,
      requires: [{ id: "aura_resist", rank: 1 }, { id: "aura_speed", rank: 1 }],
      description: "Враги рядом ранимы, а вы бьёте сильнее.",
      cost: { mana: 30 }, cooldown: 40,
      effect: (r) => ({ type: "buff", duration: 30, dmgPct: 0.15 + 0.04 * r, auraDps: 0.5 + 0.1 * r, auraR: 6, auraEl: "holy", party: 10 }),
      rankText: (r) => `30 с: +${pct(0.15 + 0.04 * r)} урона, ${pct(0.5 + 0.1 * r)} силы/с светом вокруг`,
    },
    // --- Кара
    {
      id: "holy_bolt", name: "Святая стрела", icon: "holy", tree: 2, tier: 0, col: 0,
      description: "Снаряд света: жжёт нежить, лечит союзников.",
      cost: { mana: 12 }, cooldown: 1.2,
      effect: (r) => ({ type: "projectile", dmg: 1.4 + 0.18 * r, speed: 26, element: "holy", undeadBonus: 1, healAlly: 15 + 6 * r, size: 0.25 }),
      rankText: (r) => `${pct(1.4 + 0.18 * r)} урона, ×2 по нежити`,
    },
    {
      id: "zealotry", kind: "passive", name: "Фанатизм", icon: "mastery_blade", tree: 2, tier: 0, col: 2,
      description: "Булава в руке веры бьёт сильнее.",
      effect: (r) => ({ type: "passive", mods: { dmgPct: 0.06 * r, atkSpeedPct: 0.02 * r } }),
      rankText: (r) => `+${pct(0.06 * r)} урона оружием, +${pct(0.02 * r)} скорости атаки`,
    },
    {
      id: "holy_strike", name: "Святой удар", icon: "smite", tree: 2, tier: 1, col: 0,
      description: "Удар оружием, обёрнутым светом.",
      cost: { mana: 10 }, cooldown: 3,
      synergies: [{ id: "zealotry", pct: 0.06 }],
      effect: (r) => ({ type: "arc", dmg: 1.4 + 0.2 * r, range: 3, arc: 1.2, element: "holy", knock: 2 }),
      rankText: (r) => `${pct(1.4 + 0.2 * r)} урона светом по дуге`,
    },
    {
      id: "smite", name: "Кара", icon: "smite", tree: 2, tier: 2, col: 0, aimed: true,
      requires: [{ id: "holy_bolt", rank: 2 }],
      description: "Столп света бьёт в точку прицела, оглушая нежить.",
      cost: { mana: 30 }, cooldown: 10,
      synergies: [{ id: "holy_bolt", pct: 0.06 }],
      effect: (r) => ({ type: "ground", dmg: 2.2 + 0.3 * r, radius: 3.2, element: "holy", delay: 0.35, undeadStun: 1.5 }),
      rankText: (r) => `${pct(2.2 + 0.3 * r)} урона, оглушение нежити`,
    },
    {
      id: "blessed_hammer", name: "Благословенный молот", icon: "hammer", tree: 2, tier: 3, col: 1,
      requires: [{ id: "holy_strike", rank: 1 }],
      description: "Три светящихся молота разлетаются от вас.",
      cost: { mana: 22 }, cooldown: 2.5,
      synergies: [{ id: "holy_strike", pct: 0.06 }, { id: "aura_mastery", pct: 0.04 }],
      effect: (r) => ({ type: "projectile", dmg: 1.0 + 0.15 * r, speed: 14, element: "holy", count: 3, spread: 0.6, pierce: true, undeadBonus: 0.5, size: 0.3 }),
      rankText: (r) => `3 молота по ${pct(1.0 + 0.15 * r)}, пробивают`,
    },
    {
      id: "holy_chain", name: "Небесная цепь", icon: "chain", tree: 2, tier: 4, col: 0,
      requires: [{ id: "smite", rank: 1 }],
      description: "Свет перескакивает с врага на врага.",
      cost: { mana: 28 }, cooldown: 3,
      synergies: [{ id: "holy_bolt", pct: 0.05 }],
      effect: (r) => ({ type: "chain", dmg: 1.5 + 0.2 * r, element: "holy", jumps: 4, range: 14 }),
      rankText: (r) => `${pct(1.5 + 0.2 * r)} урона, 4 перескока`,
    },
    {
      id: "judgement", name: "Суд", icon: "judgement", tree: 2, tier: 5, col: 1,
      requires: [{ id: "blessed_hammer", rank: 1 }],
      description: "Свет с небес бьёт по всему вокруг.",
      cost: { mana: 55 }, cooldown: 20,
      synergies: [{ id: "smite", pct: 0.08 }],
      effect: (r) => ({ type: "nova", dmg: 3 + 0.4 * r, radius: 8, element: "holy", stun: 1.5, knock: 3 }),
      rankText: (r) => `${pct(3 + 0.4 * r)} урона светом в радиусе 8 м, оглушение`,
    },
  ]),
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const skillsOf = (cls: ClassId) => SKILLS.filter((s) => s.cls === cls);

/** Множитель урона от синергий. */
export function synergyMult(def: SkillDef, ranks: Record<string, number>): number {
  let m = 1;
  for (const s of def.synergies || []) m += s.pct * (ranks[s.id] || 0);
  return m;
}

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
