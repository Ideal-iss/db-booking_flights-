/** Классы персонажей. */
export type ClassId = "warrior" | "knight" | "rogue" | "mage" | "necromancer" | "cleric";
export type AttrId = "str" | "dex" | "int" | "vit" | "end" | "wil";
export type Attrs = Record<AttrId, number>;

export const ATTR_IDS: AttrId[] = ["str", "dex", "int", "vit", "end", "wil"];
export const ATTR_NAMES: Record<AttrId, string> = {
  str: "Сила",
  dex: "Ловкость",
  int: "Интеллект",
  vit: "Живучесть",
  end: "Выносливость",
  wil: "Воля",
};
export const ATTR_HINTS: Record<AttrId, string> = {
  str: "Урон оружием ближнего боя, броня",
  dex: "Скорость атаки, шанс крита, урон кинжалов и луков",
  int: "Сила заклинаний и мана",
  vit: "Здоровье",
  end: "Запас и восстановление выносливости",
  wil: "Мана, её восстановление, сила исцеления и святой магии",
};

/** Как класс атакует левой кнопкой и что делает правой. */
export type BasicAttack = "melee" | "bolt" | "bow";
export type Secondary = "block" | "ward";

export interface ClassDef {
  id: ClassId;
  name: string;
  tagline: string;
  description: string;
  attrs: Attrs;
  /** Атрибут, от которого растёт урон оружием. */
  meleeAttr: AttrId;
  /** Атрибут(ы) силы заклинаний. */
  spellAttrs: Partial<Record<AttrId, number>>;
  weaponTypes: string[];
  offhandTypes: string[];
  startItems: string[];
  /** Снаряд базовой атаки для классов-заклинателей. */
  bolt?: { element: string; name: string };
  color: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: "warrior",
    name: "Воин",
    tagline: "Сталь и ярость",
    description: "Мастер ближнего боя с мечами и топорами. Мощные размашистые удары, высокий физический урон.",
    attrs: { str: 14, dex: 8, int: 3, vit: 11, end: 10, wil: 4 },
    meleeAttr: "str",
    spellAttrs: {},
    weaponTypes: ["sword", "axe", "mace"],
    offhandTypes: ["shield"],
    startItems: ["hand_axe", "padded_tunic", "leather_boots"],
    color: "#a8432f",
  },
  knight: {
    id: "knight",
    name: "Рыцарь",
    tagline: "Последний щит",
    description: "Тяжёлая броня и щит. Блок, парирование и невероятная живучесть. Держит врагов на себе.",
    attrs: { str: 12, dex: 6, int: 3, vit: 14, end: 11, wil: 6 },
    meleeAttr: "str",
    spellAttrs: { wil: 0.5 },
    weaponTypes: ["sword", "mace"],
    offhandTypes: ["shield"],
    startItems: ["short_sword", "buckler", "chain_mail", "iron_helm"],
    color: "#8a8f99",
  },
  rogue: {
    id: "rogue",
    name: "Разбойник",
    tagline: "Тень за спиной",
    description: "Кинжалы и луки, быстрые атаки и смертельные критические удары. Уклоняется, а не принимает удар.",
    attrs: { str: 7, dex: 15, int: 5, vit: 9, end: 12, wil: 3 },
    meleeAttr: "dex",
    spellAttrs: {},
    weaponTypes: ["dagger", "bow"],
    offhandTypes: [],
    startItems: ["dagger", "leather_cap", "leather_boots"],
    color: "#3f6b4a",
  },
  mage: {
    id: "mage",
    name: "Маг",
    tagline: "Пламя и лёд",
    description: "Стихийная магия на расстоянии. Огромный урон заклинаниями, но мана и хрупкое тело требуют осторожности.",
    attrs: { str: 3, dex: 7, int: 16, vit: 8, end: 7, wil: 10 },
    meleeAttr: "str",
    spellAttrs: { int: 1.2 },
    weaponTypes: ["staff", "wand"],
    offhandTypes: ["tome"],
    startItems: ["oak_staff", "cloth_robe", "hood"],
    bolt: { element: "arcane", name: "Тайная стрела" },
    color: "#4a5f9c",
  },
  necromancer: {
    id: "necromancer",
    name: "Некромант",
    tagline: "Кости служат",
    description: "Тёмная магия, проклятия и армия скелетов. Использует трупы врагов против их же собратьев.",
    attrs: { str: 4, dex: 6, int: 14, vit: 9, end: 7, wil: 12 },
    meleeAttr: "str",
    spellAttrs: { int: 1.0, wil: 0.4 },
    weaponTypes: ["wand", "dagger"],
    offhandTypes: ["focus"],
    startItems: ["bone_wand", "skull_focus", "cloth_robe"],
    bolt: { element: "dark", name: "Костяной дротик" },
    color: "#5b4a6e",
  },
  cleric: {
    id: "cleric",
    name: "Жрец",
    tagline: "Свет в склепе",
    description: "Исцеление, святая магия и защита союзников. Смертоносен для нежити.",
    attrs: { str: 10, dex: 5, int: 6, vit: 11, end: 9, wil: 14 },
    meleeAttr: "str",
    spellAttrs: { wil: 1.2, int: 0.3 },
    weaponTypes: ["mace", "staff"],
    offhandTypes: ["shield", "holy_symbol"],
    startItems: ["mace", "holy_symbol", "padded_tunic"],
    color: "#b89b5e",
  },
};

export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
