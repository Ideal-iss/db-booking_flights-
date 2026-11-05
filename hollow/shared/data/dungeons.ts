/** Темы подземелий и квесты. */
export interface DungeonTheme {
  id: string;
  name: string;
  description: string;
  level: number;
  /** Что нужно для открытия: зачищенное подземелье. */
  unlock?: string;
  enemies: { id: string; weight: number }[];
  boss: string;
  palette: { wall: string; wall2: string; floor: string; floor2: string; ceil: string; fog: string; light: string; accent: string };
  wallStyle: "bricks" | "blocks" | "bones" | "blood";
  floorStyle: "tiles" | "flags" | "dirt";
  props: string[];
  size: number;
}

export const DUNGEONS: DungeonTheme[] = [
  {
    id: "crypt", name: "Забытый склеп", level: 1,
    description: "Неглубокий склеп под часовней. Здесь хоронили тех, кого никто не оплакивал.",
    enemies: [{ id: "skeleton", weight: 6 }, { id: "zombie", weight: 3 }, { id: "cultist", weight: 2 }],
    boss: "bone_priest",
    palette: { wall: "#5a4636", wall2: "#3b2c22", floor: "#4a3a2e", floor2: "#33281f", ceil: "#2a201a", fog: "#0d0907", light: "#ff9a4a", accent: "#c9a46a" },
    wallStyle: "bricks", floorStyle: "flags",
    props: ["shelves", "sarcophagus", "candles", "bones", "urn"],
    size: 40,
  },
  {
    id: "catacombs", name: "Древние катакомбы", level: 5, unlock: "crypt",
    description: "Бесконечные галереи, где стены сложены из костей. Говорят, внизу кто-то всё ещё несёт стражу.",
    enemies: [{ id: "skeleton", weight: 5 }, { id: "zombie", weight: 2 }, { id: "wraith", weight: 3 }, { id: "undead_knight", weight: 2 }],
    boss: "hollow_knight",
    palette: { wall: "#6a5844", wall2: "#43362a", floor: "#3e3329", floor2: "#2c241d", ceil: "#241c16", fog: "#0b0806", light: "#ffa955", accent: "#d8c39a" },
    wallStyle: "bones", floorStyle: "dirt",
    props: ["shelves", "skulls", "candles", "bones", "pillar"],
    size: 46,
  },
  {
    id: "cathedral", name: "Заброшенный собор", level: 10, unlock: "catacombs",
    description: "Собор, где перестали молиться. Свет витражей давно сменился другим светом.",
    enemies: [{ id: "undead_knight", weight: 3 }, { id: "wraith", weight: 3 }, { id: "cultist", weight: 3 }, { id: "abomination", weight: 1 }],
    boss: "forgotten_saint",
    palette: { wall: "#5c5a58", wall2: "#3a3836", floor: "#454240", floor2: "#2d2b2a", ceil: "#201f1e", fog: "#08090c", light: "#ffcf8a", accent: "#8fa3c4" },
    wallStyle: "blocks", floorStyle: "tiles",
    props: ["pillar", "pews", "candles", "altar", "banner"],
    size: 48,
  },
  {
    id: "sanctum", name: "Кровавое святилище", level: 15, unlock: "cathedral",
    description: "Сюда стекает вся кровь, пролитая наверху. Культисты кормят то, что спит в глубине.",
    enemies: [{ id: "cultist", weight: 4 }, { id: "abomination", weight: 2 }, { id: "wraith", weight: 2 }, { id: "zombie", weight: 2 }],
    boss: "blood_abomination",
    palette: { wall: "#4f2523", wall2: "#311615", floor: "#3a1e1c", floor2: "#241110", ceil: "#1a0c0b", fog: "#0c0303", light: "#ff5a3a", accent: "#b03a2e" },
    wallStyle: "blood", floorStyle: "flags",
    props: ["altar", "candles", "bones", "chains", "pillar"],
    size: 48,
  },
];
export const DUNGEON_BY_ID: Record<string, DungeonTheme> = Object.fromEntries(DUNGEONS.map((d) => [d.id, d]));

export interface QuestDef {
  id: string;
  name: string;
  description: string;
  kind: "kill" | "boss" | "clear" | "level";
  target: string;
  count: number;
  reward: { xp: number; gold: number };
  minLevel: number;
}

export const QUESTS: QuestDef[] = [
  { id: "bones_rest", name: "Кости не спят", description: "Упокойте 15 скелетов в любом подземелье.", kind: "kill", target: "skeleton", count: 15, reward: { xp: 300, gold: 120 }, minLevel: 1 },
  { id: "priest", name: "Жрец без паствы", description: "Убейте Костяного Жреца в Забытом склепе.", kind: "boss", target: "bone_priest", count: 1, reward: { xp: 600, gold: 250 }, minLevel: 1 },
  { id: "cultists", name: "Пепел ереси", description: "Убейте 10 культистов.", kind: "kill", target: "cultist", count: 10, reward: { xp: 450, gold: 180 }, minLevel: 3 },
  { id: "wraiths", name: "Голоса в темноте", description: "Изгоните 12 призраков.", kind: "kill", target: "wraith", count: 12, reward: { xp: 900, gold: 300 }, minLevel: 5 },
  { id: "hollow", name: "Страж катакомб", description: "Победите Полого Рыцаря.", kind: "boss", target: "hollow_knight", count: 1, reward: { xp: 1500, gold: 500 }, minLevel: 5 },
  { id: "knights", name: "Разжалованные", description: "Сразите 10 рыцарей-мертвецов.", kind: "kill", target: "undead_knight", count: 10, reward: { xp: 1600, gold: 450 }, minLevel: 7 },
  { id: "saint", name: "Последняя молитва", description: "Упокойте Забытую Святую.", kind: "boss", target: "forgotten_saint", count: 1, reward: { xp: 3000, gold: 900 }, minLevel: 10 },
  { id: "abominations", name: "Плоть без имени", description: "Уничтожьте 6 мерзостей.", kind: "kill", target: "abomination", count: 6, reward: { xp: 3200, gold: 900 }, minLevel: 10 },
  { id: "blood", name: "Сердце святилища", description: "Убейте Кровавую Мерзость.", kind: "boss", target: "blood_abomination", count: 1, reward: { xp: 6000, gold: 2000 }, minLevel: 15 },
];
export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export function dungeonUnlocked(d: DungeonTheme, cleared: string[]): boolean {
  return !d.unlock || cleared.includes(d.unlock);
}
