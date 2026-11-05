/** Предметы: базы, аффиксы, легендарные и проклятые вещи, генерация добычи. */
import { Rng } from "../rng";
import type { ClassId } from "./classes";

export type Slot = "helmet" | "chest" | "gloves" | "boots" | "weapon" | "offhand" | "amulet" | "ring";
export type EquipSlot = "helmet" | "chest" | "gloves" | "boots" | "weapon" | "offhand" | "amulet" | "ring1" | "ring2";
export const EQUIP_SLOTS: EquipSlot[] = ["helmet", "chest", "gloves", "boots", "weapon", "offhand", "amulet", "ring1", "ring2"];
export const EQUIP_SLOT_NAMES: Record<EquipSlot, string> = {
  helmet: "Шлем", chest: "Доспех", gloves: "Перчатки", boots: "Сапоги", weapon: "Оружие",
  offhand: "Левая рука", amulet: "Амулет", ring1: "Кольцо", ring2: "Кольцо",
};
export const slotOf = (s: EquipSlot): Slot => (s === "ring1" || s === "ring2" ? "ring" : s);

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "cursed";
export const RARITIES: Record<Rarity, { name: string; color: string; affixes: [number, number]; mult: number; value: number }> = {
  common: { name: "Обычный", color: "#d8cdb2", affixes: [0, 0], mult: 1, value: 1 },
  uncommon: { name: "Необычный", color: "#8fb07a", affixes: [1, 2], mult: 1, value: 2 },
  rare: { name: "Редкий", color: "#6f8fbf", affixes: [3, 4], mult: 1.05, value: 4 },
  epic: { name: "Эпический", color: "#a07ac0", affixes: [4, 5], mult: 1.2, value: 7 },
  legendary: { name: "Легендарный", color: "#d19a3c", affixes: [3, 3], mult: 1.3, value: 12 },
  cursed: { name: "Проклятый", color: "#9b2a35", affixes: [2, 2], mult: 1.8, value: 5 },
};

export interface ItemBase {
  id: string;
  name: string;
  slot: Slot;
  /** Вид оружия/щита, по нему решается, кто может носить. */
  type?: string;
  icon: string;
  req: number;
  dmg?: [number, number];
  spell?: [number, number];
  speed?: number;
  armor?: number;
  block?: number;
  implicit?: Record<string, number>;
  value: number;
  description?: string;
}

const W = (o: Omit<ItemBase, "slot">): ItemBase => ({ ...o, slot: "weapon" });
const A = (slot: Slot, o: Omit<ItemBase, "slot">): ItemBase => ({ ...o, slot });

export const BASES: ItemBase[] = [
  // мечи
  W({ id: "short_sword", name: "Короткий меч", type: "sword", icon: "sword", req: 1, dmg: [4, 8], speed: 1.0, value: 12 }),
  W({ id: "long_sword", name: "Длинный меч", type: "sword", icon: "sword", req: 6, dmg: [7, 13], speed: 0.95, value: 40 }),
  W({ id: "broad_sword", name: "Палаш", type: "sword", icon: "sword", req: 12, dmg: [12, 21], speed: 0.9, value: 110 }),
  // топоры
  W({ id: "hand_axe", name: "Топорик", type: "axe", icon: "axe", req: 1, dmg: [4, 10], speed: 0.9, value: 12 }),
  W({ id: "battle_axe", name: "Боевой топор", type: "axe", icon: "axe", req: 7, dmg: [9, 18], speed: 0.82, value: 45 }),
  W({ id: "executioner_axe", name: "Топор палача", type: "axe", icon: "axe", req: 14, dmg: [16, 30], speed: 0.75, value: 130 }),
  // кинжалы
  W({ id: "dagger", name: "Кинжал", type: "dagger", icon: "dagger", req: 1, dmg: [2, 6], speed: 1.45, implicit: { critChance: 0.03 }, value: 10 }),
  W({ id: "kris", name: "Крис", type: "dagger", icon: "dagger", req: 7, dmg: [5, 10], speed: 1.45, implicit: { critChance: 0.04 }, value: 42 }),
  W({ id: "stiletto", name: "Стилет", type: "dagger", icon: "dagger", req: 13, dmg: [8, 15], speed: 1.5, implicit: { critChance: 0.05 }, value: 115 }),
  // булавы
  W({ id: "mace", name: "Булава", type: "mace", icon: "mace", req: 1, dmg: [5, 9], speed: 0.95, implicit: { undeadPct: 0.1 }, value: 12 }),
  W({ id: "morning_star", name: "Моргенштерн", type: "mace", icon: "mace", req: 7, dmg: [9, 15], speed: 0.9, implicit: { undeadPct: 0.15 }, value: 44 }),
  W({ id: "flanged_mace", name: "Шестопёр", type: "mace", icon: "mace", req: 13, dmg: [14, 22], speed: 0.88, implicit: { undeadPct: 0.2 }, value: 120 }),
  // луки
  W({ id: "short_bow", name: "Короткий лук", type: "bow", icon: "bow", req: 2, dmg: [4, 9], speed: 1.0, value: 15 }),
  W({ id: "long_bow", name: "Длинный лук", type: "bow", icon: "bow", req: 8, dmg: [8, 16], speed: 0.95, value: 48 }),
  W({ id: "war_bow", name: "Боевой лук", type: "bow", icon: "bow", req: 14, dmg: [13, 25], speed: 0.95, value: 125 }),
  // посохи и жезлы
  W({ id: "oak_staff", name: "Дубовый посох", type: "staff", icon: "staff", req: 1, dmg: [3, 7], spell: [6, 10], speed: 0.9, value: 12 }),
  W({ id: "rune_staff", name: "Рунный посох", type: "staff", icon: "staff", req: 8, dmg: [5, 10], spell: [12, 19], speed: 0.9, value: 48 }),
  W({ id: "archon_staff", name: "Посох архонта", type: "staff", icon: "staff", req: 14, dmg: [7, 14], spell: [20, 31], speed: 0.9, value: 130 }),
  W({ id: "bone_wand", name: "Костяной жезл", type: "wand", icon: "wand", req: 1, dmg: [2, 4], spell: [5, 8], speed: 1.2, value: 12 }),
  W({ id: "grave_wand", name: "Могильный жезл", type: "wand", icon: "wand", req: 8, dmg: [3, 6], spell: [10, 16], speed: 1.2, value: 46 }),
  W({ id: "lich_wand", name: "Жезл лича", type: "wand", icon: "wand", req: 14, dmg: [5, 8], spell: [17, 26], speed: 1.2, value: 125 }),
  // левая рука
  A("offhand", { id: "buckler", name: "Баклер", type: "shield", icon: "shield", req: 1, armor: 5, block: 0.4, value: 10 }),
  A("offhand", { id: "kite_shield", name: "Каплевидный щит", type: "shield", icon: "shield", req: 6, armor: 11, block: 0.55, value: 38 }),
  A("offhand", { id: "tower_shield", name: "Ростовой щит", type: "shield", icon: "shield", req: 13, armor: 20, block: 0.65, value: 110 }),
  A("offhand", { id: "tome", name: "Фолиант", type: "tome", icon: "tome", req: 1, implicit: { mana: 15, spellPct: 0.05 }, value: 12 }),
  A("offhand", { id: "grimoire", name: "Гримуар", type: "tome", icon: "tome", req: 9, implicit: { mana: 30, spellPct: 0.1 }, value: 50 }),
  A("offhand", { id: "skull_focus", name: "Череп-фокус", type: "focus", icon: "skull", req: 1, implicit: { mana: 10, summonPct: 0.1 }, value: 12 }),
  A("offhand", { id: "lich_skull", name: "Череп лича", type: "focus", icon: "skull", req: 9, implicit: { mana: 25, summonPct: 0.2 }, value: 50 }),
  A("offhand", { id: "holy_symbol", name: "Святой символ", type: "holy_symbol", icon: "symbol", req: 1, implicit: { healPct: 0.1, wil: 1 }, value: 12 }),
  A("offhand", { id: "reliquary", name: "Реликварий", type: "holy_symbol", icon: "symbol", req: 9, implicit: { healPct: 0.2, wil: 3 }, value: 50 }),
  // шлемы
  A("helmet", { id: "hood", name: "Капюшон", icon: "hood", req: 1, armor: 2, implicit: { mana: 8 }, value: 8 }),
  A("helmet", { id: "leather_cap", name: "Кожаный шлем", icon: "helmet", req: 1, armor: 3, value: 8 }),
  A("helmet", { id: "iron_helm", name: "Железный шлем", icon: "helmet", req: 4, armor: 7, value: 25 }),
  A("helmet", { id: "great_helm", name: "Топфхельм", icon: "helmet", req: 11, armor: 14, value: 80 }),
  // доспехи
  A("chest", { id: "cloth_robe", name: "Ряса", icon: "robe", req: 1, armor: 3, implicit: { mana: 12 }, value: 10 }),
  A("chest", { id: "padded_tunic", name: "Стёганка", icon: "chest", req: 1, armor: 6, value: 10 }),
  A("chest", { id: "chain_mail", name: "Кольчуга", icon: "chest", req: 4, armor: 13, value: 35 }),
  A("chest", { id: "brigandine", name: "Бригантина", icon: "chest", req: 9, armor: 20, value: 70 }),
  A("chest", { id: "plate_armor", name: "Латы", icon: "chest", req: 14, armor: 30, value: 140 }),
  // перчатки и сапоги
  A("gloves", { id: "leather_gloves", name: "Кожаные перчатки", icon: "gloves", req: 1, armor: 2, value: 6 }),
  A("gloves", { id: "gauntlets", name: "Латные рукавицы", icon: "gloves", req: 8, armor: 6, value: 40 }),
  A("boots", { id: "leather_boots", name: "Кожаные сапоги", icon: "boots", req: 1, armor: 2, value: 6 }),
  A("boots", { id: "iron_boots", name: "Железные сапоги", icon: "boots", req: 8, armor: 6, value: 40 }),
  // украшения
  A("amulet", { id: "amulet", name: "Амулет", icon: "amulet", req: 3, value: 30 }),
  A("ring", { id: "ring", name: "Кольцо", icon: "ring", req: 2, value: 25 }),
];
export const BASE_BY_ID: Record<string, ItemBase> = Object.fromEntries(BASES.map((b) => [b.id, b]));

/** Аффиксы: [min, max] на 1-м уровне предмета и прирост за уровень. */
export interface AffixDef {
  id: string;
  stat: string;
  label: (v: number) => string;
  suffix: string;
  slots: Slot[] | "any";
  base: [number, number];
  perLevel: number;
  /** Округлять до целых. */
  int?: boolean;
  weight: number;
  curse?: boolean;
}

const pctL = (name: string) => (v: number) => `+${Math.round(v * 100)}% ${name}`;
const flatL = (name: string) => (v: number) => `+${Math.round(v)} ${name}`;
const ARMORS: Slot[] = ["helmet", "chest", "gloves", "boots", "offhand"];
const JEWEL: Slot[] = ["amulet", "ring"];

export const AFFIXES: AffixDef[] = [
  { id: "str", stat: "str", label: flatL("к силе"), suffix: "силы", slots: "any", base: [1, 3], perLevel: 0.25, int: true, weight: 10 },
  { id: "dex", stat: "dex", label: flatL("к ловкости"), suffix: "ловкости", slots: "any", base: [1, 3], perLevel: 0.25, int: true, weight: 10 },
  { id: "int", stat: "int", label: flatL("к интеллекту"), suffix: "разума", slots: "any", base: [1, 3], perLevel: 0.25, int: true, weight: 10 },
  { id: "vit", stat: "vit", label: flatL("к живучести"), suffix: "жизни", slots: "any", base: [1, 3], perLevel: 0.25, int: true, weight: 10 },
  { id: "end", stat: "end", label: flatL("к выносливости"), suffix: "стойкости", slots: "any", base: [1, 3], perLevel: 0.25, int: true, weight: 7 },
  { id: "wil", stat: "wil", label: flatL("к воле"), suffix: "веры", slots: "any", base: [1, 3], perLevel: 0.25, int: true, weight: 8 },
  { id: "hp", stat: "hp", label: flatL("к здоровью"), suffix: "крови", slots: [...ARMORS, ...JEWEL], base: [6, 14], perLevel: 2, int: true, weight: 9 },
  { id: "mana", stat: "mana", label: flatL("к мане"), suffix: "звёзд", slots: ["helmet", "chest", "offhand", "amulet", "ring", "weapon"], base: [5, 12], perLevel: 1.2, int: true, weight: 6 },
  { id: "armor_pct", stat: "armorPct", label: pctL("к броне"), suffix: "камня", slots: ARMORS, base: [0.08, 0.2], perLevel: 0.008, weight: 8 },
  { id: "dmg_pct", stat: "dmgPct", label: pctL("к урону"), suffix: "резни", slots: ["weapon", "gloves", "ring", "amulet"], base: [0.06, 0.15], perLevel: 0.008, weight: 8 },
  { id: "spell_pct", stat: "spellPct", label: pctL("к урону заклинаний"), suffix: "колдовства", slots: ["weapon", "offhand", "helmet", "amulet", "ring"], base: [0.06, 0.15], perLevel: 0.008, weight: 7 },
  { id: "crit", stat: "critChance", label: pctL("к шансу крита"), suffix: "точности", slots: ["weapon", "gloves", "ring", "amulet", "helmet"], base: [0.02, 0.05], perLevel: 0.002, weight: 6 },
  { id: "crit_dmg", stat: "critDmg", label: pctL("к урону крита"), suffix: "казни", slots: ["weapon", "amulet", "ring"], base: [0.1, 0.25], perLevel: 0.01, weight: 5 },
  { id: "atk_speed", stat: "atkSpeedPct", label: pctL("к скорости атаки"), suffix: "быстроты", slots: ["weapon", "gloves", "ring"], base: [0.04, 0.1], perLevel: 0.004, weight: 5 },
  { id: "move", stat: "movePct", label: pctL("к скорости бега"), suffix: "ветра", slots: ["boots"], base: [0.05, 0.12], perLevel: 0.003, weight: 7 },
  { id: "res_fire", stat: "resFire", label: pctL("к защите от огня"), suffix: "пламени", slots: [...ARMORS, ...JEWEL], base: [0.08, 0.18], perLevel: 0.006, weight: 5 },
  { id: "res_cold", stat: "resCold", label: pctL("к защите от холода"), suffix: "инея", slots: [...ARMORS, ...JEWEL], base: [0.08, 0.18], perLevel: 0.006, weight: 5 },
  { id: "res_dark", stat: "resDark", label: pctL("к защите от тьмы"), suffix: "сумрака", slots: [...ARMORS, ...JEWEL], base: [0.08, 0.18], perLevel: 0.006, weight: 5 },
  { id: "life_steal", stat: "lifeSteal", label: pctL("вампиризма"), suffix: "упыря", slots: ["weapon", "ring", "amulet"], base: [0.02, 0.04], perLevel: 0.001, weight: 3 },
  { id: "mana_regen", stat: "manaRegenPct", label: pctL("к восстановлению маны"), suffix: "медитации", slots: ["helmet", "amulet", "ring", "offhand", "weapon"], base: [0.15, 0.35], perLevel: 0.01, weight: 5 },
  { id: "gold_find", stat: "goldFind", label: pctL("золота с врагов"), suffix: "алчности", slots: ["gloves", "ring", "amulet", "helmet"], base: [0.1, 0.3], perLevel: 0.01, weight: 4 },
  { id: "stamina_regen", stat: "staminaRegenPct", label: pctL("к восстановлению выносливости"), suffix: "дыхания", slots: ["chest", "boots", "amulet"], base: [0.1, 0.25], perLevel: 0.008, weight: 4 },
  // проклятия — только у проклятых вещей
  { id: "curse_frail", stat: "dmgTakenPct", label: (v) => `Проклятие: +${Math.round(v * 100)}% получаемого урона`, suffix: "", slots: "any", base: [0.15, 0.25], perLevel: 0, weight: 1, curse: true },
  { id: "curse_slow", stat: "movePct", label: (v) => `Проклятие: ${Math.round(v * 100)}% к скорости бега`, suffix: "", slots: "any", base: [-0.15, -0.08], perLevel: 0, weight: 1, curse: true },
  { id: "curse_hunger", stat: "hpRegen", label: (v) => `Проклятие: теряет ${(-v).toFixed(1)} здоровья в секунду`, suffix: "", slots: "any", base: [-1.5, -0.8], perLevel: -0.05, weight: 1, curse: true },
  { id: "curse_brittle", stat: "resAll", label: (v) => `Проклятие: ${Math.round(v * 100)}% ко всем защитам`, suffix: "", slots: "any", base: [-0.25, -0.15], perLevel: 0, weight: 1, curse: true },
];
export const AFFIX_BY_ID: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** Уникальные эффекты легендарных вещей. */
export const UNIQUE_EFFECTS: Record<string, (v: number) => string> = {
  lifeOnKill: (v) => `Убийство восстанавливает ${Math.round(v * 100)}% здоровья`,
  manaOnKill: (v) => `Убийство восстанавливает ${Math.round(v * 100)}% маны`,
  burnOnHit: (v) => `${Math.round(v * 100)}% шанс поджечь врага ударом`,
  chillOnHit: (v) => `Удары замедляют врагов на ${Math.round(v * 100)}%`,
  extraSkeleton: (v) => `+${v} к максимуму скелетов`,
  thorns: (v) => `Отражает ${Math.round(v * 100)}% урона ближнего боя`,
  critHeal: (v) => `Критический удар лечит на ${Math.round(v * 100)}% здоровья`,
  holyAura: (v) => `Аура: ${v} святого урона в секунду нежити рядом`,
  doubleShot: () => `Стрелы вылетают парами`,
  berserk: () => `+1% урона за каждый 1% потерянного здоровья`,
};

export interface UniqueDef {
  id: string;
  name: string;
  base: string;
  lore: string;
  effects: Record<string, number>;
  fixed: { id: string; v: number }[];
}

export const UNIQUES: UniqueDef[] = [
  { id: "raven_grief", name: "Скорбь Ворона", base: "long_sword", lore: "Клинок помнит каждого, кого проводил во тьму.", effects: { lifeOnKill: 0.05 }, fixed: [{ id: "dmg_pct", v: 0.25 }] },
  { id: "ash_crown", name: "Венец Пепельной Зари", base: "iron_helm", lore: "Его носил король, сгоревший вместе со своим городом.", effects: { burnOnHit: 0.15 }, fixed: [{ id: "res_fire", v: 0.3 }] },
  { id: "crypt_whisper", name: "Шёпот Склепа", base: "bone_wand", lore: "Мёртвые слышат, как он стучит по камню.", effects: { extraSkeleton: 1 }, fixed: [{ id: "int", v: 5 }] },
  { id: "saint_hand", name: "Длань Святой", base: "holy_symbol", lore: "Последнее, что осталось от святой, — её свет.", effects: { holyAura: 12 }, fixed: [{ id: "wil", v: 5 }] },
  { id: "shadow_fang", name: "Клык Тени", base: "kris", lore: "Не отражает свет. Совсем.", effects: { critHeal: 0.03 }, fixed: [{ id: "crit", v: 0.08 }] },
  { id: "frost_song", name: "Морозная Песнь", base: "rune_staff", lore: "Поёт, когда вокруг становится слишком тихо.", effects: { chillOnHit: 0.35 }, fixed: [{ id: "spell_pct", v: 0.2 }] },
  { id: "nameless_bulwark", name: "Оплот Безымянного", base: "kite_shield", lore: "Его хозяин стоял у ворот, пока не стал частью стены.", effects: { thorns: 0.25 }, fixed: [{ id: "hp", v: 40 }] },
  { id: "mourner_string", name: "Тетива Плакальщицы", base: "long_bow", lore: "Каждая стрела — чья-то потерянная молитва.", effects: { doubleShot: 1 }, fixed: [{ id: "dex", v: 5 }] },
  { id: "blood_oath", name: "Кольцо Кровавой Клятвы", base: "ring", lore: "Чем ближе смерть, тем сильнее рука.", effects: { berserk: 1 }, fixed: [{ id: "vit", v: 4 }] },
  { id: "last_breath", name: "Амулет Последнего Вздоха", base: "amulet", lore: "Внутри до сих пор что-то дышит.", effects: { manaOnKill: 0.05 }, fixed: [{ id: "mana", v: 30 }] },
];
export const UNIQUE_BY_ID: Record<string, UniqueDef> = Object.fromEntries(UNIQUES.map((u) => [u.id, u]));

export interface Item {
  uid: string;
  base: string;
  rarity: Rarity;
  ilvl: number;
  affixes: { id: string; v: number }[];
  unique?: string;
  upgrade?: number;
  name: string;
}

export const RARE_NAMES = ["Пепел зари", "Тихий плач", "Зов глубин", "Сломанная клятва", "Последний свет", "Кровь мучеников", "Сон без снов", "Шёпот праха", "Чёрная свеча", "Долг мертвеца", "Ржавая молитва", "Холод склепа", "Поминальный звон", "Серая вдова", "Пустой трон"];

export function affixRange(a: AffixDef, ilvl: number): [number, number] {
  const add = a.perLevel * (ilvl - 1);
  return [a.base[0] + add, a.base[1] + add];
}

function rollAffix(rng: Rng, a: AffixDef, ilvl: number, mult = 1): number {
  const [lo, hi] = affixRange(a, ilvl);
  const v = rng.range(lo, hi) * mult;
  return a.int ? Math.max(1, Math.round(v)) : Math.round(v * 1000) / 1000;
}

export function allowedAffixes(base: ItemBase): AffixDef[] {
  return AFFIXES.filter((a) => !a.curse && (a.slots === "any" || a.slots.includes(base.slot)));
}

export function itemName(base: ItemBase, rarity: Rarity, affixes: { id: string; v: number }[], rng?: Rng, unique?: string): string {
  if (unique) return UNIQUE_BY_ID[unique].name;
  if (rarity === "common") return base.name;
  if (rarity === "rare" || rarity === "epic") return `${base.name} «${(rng ? rng.pick(RARE_NAMES) : RARE_NAMES[0])}»`;
  const main = affixes.filter((a) => !AFFIX_BY_ID[a.id]?.curse)[0];
  const suffix = main ? AFFIX_BY_ID[main.id].suffix : "";
  const n = suffix ? `${base.name} ${suffix}` : base.name;
  return rarity === "cursed" ? `Проклятый артефакт: ${n}` : n;
}

let uidCounter = 0;
export function newUid(rng: Rng): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${Math.floor(rng.next() * 1e9).toString(36)}${uidCounter.toString(36)}`;
}

export function makeItem(rng: Rng, baseId: string, rarity: Rarity, ilvl: number): Item {
  const base = BASE_BY_ID[baseId];
  const r = RARITIES[rarity];
  const affixes: { id: string; v: number }[] = [];
  let unique: string | undefined;
  if (rarity === "legendary") {
    const candidates = UNIQUES.filter((u) => u.base === baseId);
    const u = candidates.length ? rng.pick(candidates) : null;
    if (u) {
      unique = u.id;
      for (const f of u.fixed) affixes.push({ ...f });
    }
  }
  const pool = allowedAffixes(base).filter((a) => !affixes.some((x) => x.id === a.id));
  const n = rng.int(r.affixes[0], r.affixes[1]);
  for (let i = 0; i < n && pool.length; i++) {
    const a = rng.weighted(pool, (x) => x.weight);
    pool.splice(pool.indexOf(a), 1);
    affixes.push({ id: a.id, v: rollAffix(rng, a, ilvl, rarity === "cursed" ? 2 : r.mult) });
  }
  if (rarity === "cursed") {
    const c = rng.pick(AFFIXES.filter((a) => a.curse));
    affixes.push({ id: c.id, v: rollAffix(rng, c, ilvl) });
  }
  return { uid: newUid(rng), base: baseId, rarity, ilvl, affixes, unique, upgrade: 0, name: itemName(base, rarity, affixes, rng, unique) };
}

/** Стартовые вещи без случайных свойств. */
export function starterItem(baseId: string, uid: string): Item {
  const base = BASE_BY_ID[baseId];
  return { uid, base: baseId, rarity: "common", ilvl: 1, affixes: [], upgrade: 0, name: base.name };
}

export type DropTier = "normal" | "elite" | "boss" | "chest" | "pot";

/** Выпадение добычи. Возвращает предметы и золото. */
export function rollLoot(rng: Rng, ilvl: number, tier: DropTier, magicFind = 0): { items: Item[]; gold: number; potion?: "health" | "mana" } {
  const items: Item[] = [];
  const chanceItem = { normal: 0.16, elite: 0.85, boss: 1, chest: 1, pot: 0.05 }[tier];
  const count = { normal: 1, elite: 1, boss: 3, chest: 2, pot: 1 }[tier];
  const gold = rng.chance({ normal: 0.45, elite: 1, boss: 1, chest: 1, pot: 0.55 }[tier])
    ? Math.round(rng.range(3, 9) * ilvl * { normal: 1, elite: 3, boss: 12, chest: 4, pot: 0.5 }[tier] * (1 + magicFind))
    : 0;
  for (let i = 0; i < count; i++) {
    if (!rng.chance(chanceItem)) continue;
    const rarity = rollRarity(rng, tier, magicFind, i === 0);
    const candidates = BASES.filter((b) => b.req <= ilvl + 2 && (rarity !== "legendary" || UNIQUES.some((u) => u.base === b.id)));
    const base = rng.pick(candidates.length ? candidates : BASES.filter((b) => b.req <= ilvl + 2));
    items.push(makeItem(rng, base.id, rarity, ilvl));
  }
  const potion = rng.chance(tier === "normal" ? 0.12 : tier === "pot" ? 0.16 : 0.5) ? (rng.chance(0.6) ? "health" : "mana") : undefined;
  return { items, gold, potion };
}

function rollRarity(rng: Rng, tier: DropTier, mf: number, first: boolean): Rarity {
  const boost = { normal: 1, elite: 2.2, boss: 4, chest: 2, pot: 1 }[tier] * (1 + mf);
  const w: [Rarity, number][] = [
    ["common", 55],
    ["uncommon", 30 * boost],
    ["rare", 10 * boost],
    ["epic", 3 * boost],
    ["legendary", (tier === "boss" && first ? 3 : 0.6) * boost],
    ["cursed", 1.2 * boost],
  ];
  if (tier === "boss" && first) w[0][1] = 0;
  return rng.weighted(w, (x) => x[1])[0];
}

/** Стоимость продажи торговцу. */
export function itemValue(item: Item): number {
  const base = BASE_BY_ID[item.base];
  return Math.max(1, Math.round(base.value * RARITIES[item.rarity].value * (1 + item.ilvl * 0.08) * (1 + (item.upgrade || 0) * 0.3)));
}

export function upgradeCost(item: Item): number | null {
  const lvl = item.upgrade || 0;
  if (lvl >= 5) return null;
  return Math.round(40 * (lvl + 1) ** 2 * (1 + item.ilvl * 0.15) * (item.rarity === "legendary" ? 2 : 1));
}

export function requiredLevel(item: Item): number {
  const base = BASE_BY_ID[item.base];
  return Math.max(base.req, Math.floor(item.ilvl * 0.8));
}

export function canClassUse(cls: { weaponTypes: string[]; offhandTypes: string[] }, item: Item): boolean {
  const base = BASE_BY_ID[item.base];
  if (base.slot === "weapon") return cls.weaponTypes.includes(base.type!);
  if (base.slot === "offhand") return cls.offhandTypes.includes(base.type!);
  return true;
}

/** Числовые свойства предмета (с учётом заточки). */
export function itemStats(item: Item): Record<string, number> {
  const base = BASE_BY_ID[item.base];
  const up = item.upgrade || 0;
  const out: Record<string, number> = {};
  const add = (k: string, v: number) => (out[k] = (out[k] || 0) + v);
  if (base.armor) add("armor", Math.round(base.armor * (1 + 0.12 * up) * (item.rarity === "common" ? 1 : 1.1)));
  if (base.block) add("block", base.block);
  for (const [k, v] of Object.entries(base.implicit || {})) add(k, v);
  for (const a of item.affixes) {
    const def = AFFIX_BY_ID[a.id];
    if (!def) continue;
    if (def.stat === "resAll") {
      add("resFire", a.v); add("resCold", a.v); add("resDark", a.v);
    } else add(def.stat, a.v);
  }
  if (item.unique) for (const [k, v] of Object.entries(UNIQUE_BY_ID[item.unique].effects)) add(k, v);
  return out;
}

export function weaponDamage(item: Item | undefined): { dmg: [number, number]; spell: [number, number]; speed: number; type: string } {
  if (!item) return { dmg: [1, 3], spell: [1, 2], speed: 1.1, type: "fist" };
  const base = BASE_BY_ID[item.base];
  const k = 1 + 0.1 * (item.upgrade || 0);
  const r = (x: [number, number] | undefined): [number, number] => (x ? [Math.round(x[0] * k), Math.round(x[1] * k)] : [0, 0]);
  return { dmg: r(base.dmg), spell: r(base.spell), speed: base.speed || 1, type: base.type || "fist" };
}

export const POTIONS = {
  health: { name: "Зелье здоровья", heal: 0.4, price: 25 },
  mana: { name: "Зелье маны", heal: 0.5, price: 25 },
};
