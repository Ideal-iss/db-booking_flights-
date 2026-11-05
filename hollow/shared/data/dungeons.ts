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
  wallStyle: "bricks" | "blocks" | "bones" | "blood" | "rock";
  floorStyle: "tiles" | "flags" | "dirt";
  props: string[];
  size: number;
}

export const DUNGEONS: DungeonTheme[] = [
  {
    id: "crypt", name: "Забытый склеп", level: 1,
    description: "Неглубокий склеп под часовней. Здесь хоронили тех, кого никто не оплакивал.",
    enemies: [{ id: "skeleton", weight: 6 }, { id: "zombie", weight: 3 }, { id: "cultist", weight: 2 }, { id: "skeleton_archer", weight: 2 }],
    boss: "bone_priest",
    palette: { wall: "#5a4636", wall2: "#3b2c22", floor: "#4a3a2e", floor2: "#33281f", ceil: "#2a201a", fog: "#0d0907", light: "#ff9a4a", accent: "#c9a46a" },
    wallStyle: "bricks", floorStyle: "flags",
    props: ["shelves", "sarcophagus", "candles", "bones", "urn"],
    size: 40,
  },
  {
    id: "catacombs", name: "Древние катакомбы", level: 5, unlock: "crypt",
    description: "Бесконечные галереи, где стены сложены из костей. Говорят, внизу кто-то всё ещё несёт стражу.",
    enemies: [{ id: "skeleton", weight: 5 }, { id: "zombie", weight: 2 }, { id: "wraith", weight: 3 }, { id: "undead_knight", weight: 2 }, { id: "skeleton_archer", weight: 3 }, { id: "necromancer", weight: 1 }],
    boss: "hollow_knight",
    palette: { wall: "#6a5844", wall2: "#43362a", floor: "#3e3329", floor2: "#2c241d", ceil: "#241c16", fog: "#0b0806", light: "#ffa955", accent: "#d8c39a" },
    wallStyle: "bones", floorStyle: "dirt",
    props: ["shelves", "skulls", "candles", "bones", "pillar"],
    size: 46,
  },
  {
    id: "cathedral", name: "Заброшенный собор", level: 10, unlock: "catacombs",
    description: "Собор, где перестали молиться. Свет витражей давно сменился другим светом.",
    enemies: [{ id: "undead_knight", weight: 3 }, { id: "wraith", weight: 2 }, { id: "cultist", weight: 2 }, { id: "abomination", weight: 1 }, { id: "necromancer", weight: 2 }, { id: "phantom", weight: 2 }, { id: "skeleton_archer", weight: 2 }],
    boss: "forgotten_saint",
    palette: { wall: "#5c5a58", wall2: "#3a3836", floor: "#454240", floor2: "#2d2b2a", ceil: "#201f1e", fog: "#08090c", light: "#ffcf8a", accent: "#8fa3c4" },
    wallStyle: "blocks", floorStyle: "tiles",
    props: ["pillar", "pews", "candles", "altar", "banner"],
    size: 48,
  },
  {
    id: "sanctum", name: "Кровавое святилище", level: 15, unlock: "cathedral",
    description: "Сюда стекает вся кровь, пролитая наверху. Культисты кормят то, что спит в глубине.",
    enemies: [{ id: "cultist", weight: 4 }, { id: "abomination", weight: 2 }, { id: "wraith", weight: 1 }, { id: "zombie", weight: 2 }, { id: "necromancer", weight: 2 }, { id: "phantom", weight: 2 }],
    boss: "blood_abomination",
    palette: { wall: "#4f2523", wall2: "#311615", floor: "#3a1e1c", floor2: "#241110", ceil: "#1a0c0b", fog: "#0c0303", light: "#ff5a3a", accent: "#b03a2e" },
    wallStyle: "blood", floorStyle: "flags",
    props: ["altar", "candles", "bones", "chains", "pillar"],
    size: 48,
  },
  {
    id: "abyss", name: "Сердце Пустоты", level: 17, unlock: "sanctum",
    description: "Под святилищем нет дна. Только тишина, которая слушает.",
    enemies: [{ id: "phantom", weight: 4 }, { id: "necromancer", weight: 2 }, { id: "undead_knight", weight: 2 }, { id: "skeleton_archer", weight: 2 }, { id: "abomination", weight: 1 }],
    boss: "the_hollow",
    palette: { wall: "#3a3448", wall2: "#221e2c", floor: "#2c2836", floor2: "#1a1722", ceil: "#120f18", fog: "#07050c", light: "#b48aff", accent: "#6a3aa0" },
    wallStyle: "blocks", floorStyle: "tiles",
    props: ["pillar", "chains", "candles", "bones", "skulls"],
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
  { id: "bones_rest", name: "Кости не спят", description: "Упокойте 8 скелетов в любом подземелье.", kind: "kill", target: "skeleton", count: 8, reward: { xp: 300, gold: 120 }, minLevel: 1 },
  { id: "priest", name: "Жрец без паствы", description: "Убейте Костяного Жреца в Забытом склепе.", kind: "boss", target: "bone_priest", count: 1, reward: { xp: 600, gold: 250 }, minLevel: 1 },
  { id: "cultists", name: "Пепел ереси", description: "Убейте 6 культистов.", kind: "kill", target: "cultist", count: 6, reward: { xp: 450, gold: 180 }, minLevel: 3 },
  { id: "wraiths", name: "Голоса в темноте", description: "Изгоните 7 призраков.", kind: "kill", target: "wraith", count: 7, reward: { xp: 900, gold: 300 }, minLevel: 5 },
  { id: "hollow", name: "Страж катакомб", description: "Победите Полого Рыцаря.", kind: "boss", target: "hollow_knight", count: 1, reward: { xp: 1500, gold: 500 }, minLevel: 5 },
  { id: "knights", name: "Разжалованные", description: "Сразите 6 рыцарей-мертвецов.", kind: "kill", target: "undead_knight", count: 6, reward: { xp: 1600, gold: 450 }, minLevel: 7 },
  { id: "saint", name: "Последняя молитва", description: "Упокойте Забытую Святую.", kind: "boss", target: "forgotten_saint", count: 1, reward: { xp: 3000, gold: 900 }, minLevel: 10 },
  { id: "abominations", name: "Плоть без имени", description: "Уничтожьте 4 мерзости.", kind: "kill", target: "abomination", count: 4, reward: { xp: 3200, gold: 900 }, minLevel: 10 },
  { id: "blood", name: "Сердце святилища", description: "Убейте Кровавую Мерзость.", kind: "boss", target: "blood_abomination", count: 1, reward: { xp: 6000, gold: 2000 }, minLevel: 15 },
];
export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export function dungeonUnlocked(d: DungeonTheme, cleared: string[]): boolean {
  return !d.unlock || cleared.includes(d.unlock);
}

// ------------------------------------------------------------------ кампания
export interface ActDef {
  n: number;
  name: string;
  theme: string;
  intro: string;
  outro: string;
}

export const ACTS: ActDef[] = [
  {
    n: 1, name: "Акт I. Колокол молчит", theme: "crypt",
    intro: "Колокол часовни замолчал в ночь первого снега. Наутро в склепе под ней нашли открытые гробы — пустые и аккуратно прибранные. Отец Мирон зажёг последнюю свечу у входа и сказал: «Кто-то должен спуститься». Спускаешься ты.",
    outro: "Костяной Жрец рассыпался, но в его пальцах был зажат ключ от нижних врат — не ржавый, а новый, будто выкованный вчера. Кто-то внизу ждал, что жреца победят. Кто-то хотел, чтобы ты пошёл дальше.",
  },
  {
    n: 2, name: "Акт II. Стража без сна", theme: "catacombs",
    intro: "Катакомбы старше часовни и старше города. Здесь хоронили воинов, давших клятву стеречь проход, — и клятва держит их до сих пор. Говорят, их капитан так и не снял шлем. Говорят, под шлемом ничего нет.",
    outro: "Полый Рыцарь опустился на колени и впервые за века снял шлем. Пустота под ним прошептала: «Мы стерегли не вход. Мы стерегли выход». Проход за его спиной ведёт вверх — в собор, которого нет ни на одной карте.",
  },
  {
    n: 3, name: "Акт III. Собор, где перестали молиться", theme: "cathedral",
    intro: "Подземный собор освещён светом, у которого нет источника. Скамьи полны — но никто не дышит. На алтаре стоит та, кого в городе называли Святой, пока её имя не вычеркнули из всех книг.",
    outro: "Святая улыбнулась, когда свет в её глазах погас: «Спасибо. Я так долго держала дверь». За алтарём открылся провал, и снизу потянуло тёплым, сладким запахом крови.",
  },
  {
    n: 4, name: "Акт IV. Кровь стекает вниз", theme: "sanctum",
    intro: "Культ кормил что-то в глубине веками. Каждая чаша, каждая жертва, каждая капля стекала по желобам в одно место. То, что выросло там, больше не помнит, кем было раньше.",
    outro: "Мерзость рухнула, и желоба опустели. Но кровь не ушла в камень — она ушла глубже, туда, где кончаются стены. Отец Мирон, увидев тебя, долго молчал, а потом сказал: «Там, внизу, есть только одно. Оно называет себя Пустотой. И оно знает твоё имя».",
  },
  {
    n: 5, name: "Акт V. Сердце Пустоты", theme: "abyss",
    intro: "Здесь не горят факелы — только то, что ты принёс с собой. Стены сложены из тишины. Всё, что поднималось из склепа, все, кто не мог уснуть, — всё это было дыханием одного существа. Оно ждёт тебя в самом низу.",
    outro: "",
  },
];

export const EPILOGUE = {
  title: "Эпилог. Тишина",
  text: "Когда Полое Сердце раскололось, глубина выдохнула — и замолчала. Наверху, впервые за много лет, зазвонил колокол часовни. Мёртвые легли обратно в свои ниши, и больше не вставали. Отец Мирон записал твоё имя в книгу, из которой когда-то вычеркнули Святую. Но пустота не исчезает — она лишь засыпает. Говорят, если спуститься снова, она будет помнить тебя. И будет злее.",
};

export interface StageDef {
  id: string;
  act: number;
  n: number;
  name: string;
  theme: string;
  level: number;
  /** Кого надо убить, чтобы открыть спуск дальше: босс акта или чемпион (обычный тип врага). */
  boss: string;
  champion?: { name: string; elite: string };
  unlock?: string;
  description: string;
}

export const STAGES: StageDef[] = [
  { id: "a1s1", act: 1, n: 1, name: "Ступени склепа", theme: "crypt", level: 1, boss: "skeleton", champion: { name: "Привратник Кость", elite: "stone" }, description: "Первые ниши и первые пустые гробы." },
  { id: "a1s2", act: 1, n: 2, name: "Нижние ниши", theme: "crypt", level: 2, boss: "zombie", champion: { name: "Гнилой Смотритель", elite: "furious" }, unlock: "a1s1", description: "Здесь хоронили тех, кого никто не оплакивал." },
  { id: "a1s3", act: 1, n: 3, name: "Логово Костяного Жреца", theme: "crypt", level: 3, boss: "bone_priest", unlock: "a1s2", description: "Хозяин склепа читает молитвы над пустыми гробами." },
  { id: "a2s1", act: 2, n: 1, name: "Галереи черепов", theme: "catacombs", level: 5, boss: "wraith", champion: { name: "Шёпот Галерей", elite: "cursed" }, unlock: "a1s3", description: "Стены смотрят на тебя тысячей пустых глазниц." },
  { id: "a2s2", act: 2, n: 2, name: "Застава мертвецов", theme: "catacombs", level: 6, boss: "undead_knight", champion: { name: "Капитан Ржавой Стражи", elite: "stone" }, unlock: "a2s1", description: "Пост, который никто не снимал с караула." },
  { id: "a2s3", act: 2, n: 3, name: "Последний пост", theme: "catacombs", level: 7, boss: "hollow_knight", unlock: "a2s2", description: "Тот, кто не снимает шлем." },
  { id: "a3s1", act: 3, n: 1, name: "Неф забытых", theme: "cathedral", level: 9, boss: "necromancer", champion: { name: "Отлучённый", elite: "cursed" }, unlock: "a2s3", description: "Скамьи полны, и никто не дышит." },
  { id: "a3s2", act: 3, n: 2, name: "Колокольня без колокола", theme: "cathedral", level: 10, boss: "skeleton_archer", champion: { name: "Звонарь", elite: "furious" }, unlock: "a3s1", description: "Звон, который слышат только мёртвые." },
  { id: "a3s3", act: 3, n: 3, name: "Алтарь Святой", theme: "cathedral", level: 11, boss: "forgotten_saint", unlock: "a3s2", description: "Свет без источника." },
  { id: "a4s1", act: 4, n: 1, name: "Кровавые стоки", theme: "sanctum", level: 13, boss: "abomination", champion: { name: "Мясник Стоков", elite: "furious" }, unlock: "a3s3", description: "Желоба, по которым веками текла кровь." },
  { id: "a4s2", act: 4, n: 2, name: "Чертог культа", theme: "sanctum", level: 14, boss: "necromancer", champion: { name: "Верховный Жрец Крови", elite: "cursed" }, unlock: "a4s1", description: "Те, кто кормил глубину." },
  { id: "a4s3", act: 4, n: 3, name: "Сердце святилища", theme: "sanctum", level: 15, boss: "blood_abomination", unlock: "a4s2", description: "То, что выросло из жертв." },
  { id: "a5s1", act: 5, n: 1, name: "Край Пустоты", theme: "abyss", level: 17, boss: "phantom", champion: { name: "Безликий", elite: "cursed" }, unlock: "a4s3", description: "Стены из тишины." },
  { id: "a5s2", act: 5, n: 2, name: "Тропа без отражений", theme: "abyss", level: 18, boss: "undead_knight", champion: { name: "Последний Рыцарь", elite: "stone" }, unlock: "a5s1", description: "Здесь твоя тень идёт отдельно от тебя." },
  { id: "a5s3", act: 5, n: 3, name: "Полое Сердце", theme: "abyss", level: 20, boss: "the_hollow", unlock: "a5s2", description: "Всё, что не могло уснуть, — его дыхание." },
];
export const STAGE_BY_ID: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));

/** Кошмар: те же этапы с префиксом «n:», уровень +20. */
export const NIGHTMARE_BONUS = 20;
export function parseStage(key: string): { stage: StageDef; nightmare: boolean } | null {
  const nightmare = key.startsWith("n:");
  const stage = STAGE_BY_ID[nightmare ? key.slice(2) : key];
  return stage ? { stage, nightmare } : null;
}

export function stageUnlocked(key: string, cleared: string[]): boolean {
  const p = parseStage(key);
  if (!p) return false;
  const prev = p.stage.unlock;
  if (p.nightmare) return prev ? cleared.includes("n:" + prev) : cleared.includes("a5s3");
  return !prev || cleared.includes(prev);
}

export const stageLabel = (key: string) => {
  const p = parseStage(key);
  if (!p) return key;
  return `${p.nightmare ? "Кошмар · " : ""}${ACTS[p.stage.act - 1].name.split(".")[0]}, ${p.stage.n}: ${p.stage.name}`;
};
