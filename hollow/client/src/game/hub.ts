/** Лагерь «Последняя свеча» — разрушенная часовня над входом в подземелья. */
import { CELL, Cell, type Dungeon } from "@shared/dungeon/generate";
import type { DungeonTheme } from "@shared/data/dungeons";

export interface Npc {
  id: string;
  name: string;
  title: string;
  /** Окно, которое открывает житель; у обитателей лагеря без лавки его нет. */
  panel?: "merchant" | "blacksmith" | "stash" | "quests" | "gate" | "party";
  x: number;
  z: number;
  yaw: number;
  kind: "merchant" | "smith" | "priest" | "stash" | "gate" | "altar" | "merc" | "nun" | "cat";
  lines: string[];
  /** Короткие реплики, которые житель бросает, когда герой подходит. */
  barks?: string[];
}

/** Точки, где Сестра Агата зажигает свечи (в клетках). */
export const AGATA_PATH: [number, number][] = [[3.55, 9.7], [5.6, 3.35], [9.4, 3.35], [11.45, 9.7]];
/** Где в крыше часовни дыра: лунный свет и снег (в клетках). */
export const ROOF_HOLE = { x: 6.0, z: 9.25, r: 1.5 };
/** Костёр посреди нефа (в клетках). */
export const CAMPFIRE = { x: 7.5, z: 6.9 };

export const HUB_THEME: DungeonTheme = {
  id: "hub", name: "Лагерь «Последняя свеча»", level: 1,
  description: "Разрушенная часовня над входом в подземелья.",
  enemies: [], boss: "",
  palette: { wall: "#7a6a58", wall2: "#4f4134", floor: "#5a4c3e", floor2: "#3e3328", ceil: "#2e251d", fog: "#16100c", light: "#ffa04a", accent: "#7a2a24" },
  wallStyle: "blocks", floorStyle: "flags",
  props: ["candles", "bones", "urn"],
  size: 15,
};

const W = 15;

/** Что говорит Отец Мирон — по тому, как далеко зашёл герой. */
const MIRON: Record<number, string[]> = {
  0: ["Мёртвые не должны ходить. Помоги им лечь обратно.", "Склеп под часовней — начало. Колокол замолчал там."],
  1: ["Ключ от нижних врат… новый. Кто-то ковал его для тебя.", "Катакомбы старше города. Не верь тем, кто носит шлем."],
  2: ["Собор, которого нет на картах? Я молился там во сне. Мне не понравилось.", "Святая… её имя вычеркнули при моём деде. Теперь я понимаю почему."],
  3: ["Пахнет кровью даже здесь, наверху. Это идёт снизу.", "Культ кормил что-то веками. Не дай себя накормить ему."],
  4: ["Пустота знает твоё имя. Я слышу, как она шепчет его по ночам.", "Если не вернёшься — я зажгу свечу. Если вернёшься — две."],
  5: ["Колокол звонит. Я думал, не доживу.", "Пустота не исчезла — она уснула. Кошмар ждёт тех, кто хочет разбудить её снова."],
};

function actsDone(cleared: string[]) {
  let n = 0;
  for (let a = 1; a <= 5; a++) if (cleared.includes(`a${a}s3`)) n = a;
  return n;
}

export function buildHub(cleared: string[] = []): { d: Dungeon; npcs: Npc[] } {
  const cells = new Uint8Array(W * W);
  const set = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells[y * W + x] = Cell.Floor;
  };
  set(3, 3, 9, 8); // главный неф
  set(6, 1, 3, 2); // ниша с вратами
  set(1, 4, 2, 5); // ниша торговца
  set(12, 4, 2, 5); // кузница
  set(6, 11, 3, 2); // вход
  const c = (v: number) => v * CELL;
  const npcs: Npc[] = [
    {
      id: "gate", name: "Врата Глубин", title: "спуск в подземелья", panel: "gate", kind: "gate", x: c(7.5), z: c(1.6), yaw: 0,
      lines: ["Камень дышит холодом. Ниже — только тьма."],
    },
    {
      id: "merchant", name: "Ольгерд", title: "торговец", panel: "merchant", kind: "merchant", x: c(1.9), z: c(6.5), yaw: -Math.PI / 2,
      lines: ["Всё, что подняли мёртвые, однажды попадает ко мне.", "Зелья? Свежие. Почти."],
      barks: ["Подходи, подходи. Мертвецам товар уже ни к чему.", "Очки треснули в первую же зиму. Цены вижу отлично.", "Купи зелье — проживёшь дольше. Дольше проживёшь — купишь ещё."],
    },
    {
      id: "smith", name: "Бруна", title: "кузнец", panel: "blacksmith", kind: "smith", x: c(12.75), z: c(6.5), yaw: Math.PI / 2,
      lines: ["Принеси железо — сделаю из него оружие. Принеси золото — сделаю лучше."],
      barks: ["Не стой у горна, обгоришь.", "Этот клинок помнит трёх хозяев. Будешь четвёртым?", "Звенит — значит, живое железо."],
    },
    {
      id: "priest", name: "Отец Мирон", title: "доска поручений", panel: "quests", kind: "priest", x: c(4.2), z: c(3.9), yaw: -Math.PI * 0.8,
      lines: MIRON[actsDone(cleared)],
      barks: ["Свеча ещё горит. Значит, и ты держишься.", "Да хранит тебя то, что ещё не уснуло."],
    },
    {
      id: "stash", name: "Сундук отряда", title: "хранилище", panel: "stash", kind: "stash", x: c(10.8), z: c(3.9), yaw: Math.PI,
      lines: [],
    },
    // обитатели лагеря без лавок: с ними можно поговорить, кота — погладить
    {
      id: "yarosh", name: "Ярош", title: "раненый наёмник", kind: "merc", x: c(CAMPFIRE.x - 0.92), z: c(CAMPFIRE.z + 0.12), yaw: -Math.PI / 2 - 0.15,
      lines: [
        "Нога? Скелет укусил. Скелет. Без губ. Как — не спрашивай.",
        "Я спускался трижды. Четвёртый раз — твой. Я посторожу костёр.",
        "Видишь шлем у врат? Мой. Сам выпрыгнул из него, когда закричали стены.",
        "Совет бесплатный: если гроб открыт и пуст — беги. Если закрыт — тоже беги.",
      ],
      barks: ["Тепло… Живым тут ещё бывает тепло.", "Эй, принеси мне оттуда новую ногу.", "За тех, кто не вернулся."],
    },
    {
      id: "agata", name: "Сестра Агата", title: "послушница", kind: "nun", x: c(AGATA_PATH[0][0]), z: c(AGATA_PATH[0][1]), yaw: 0,
      lines: [
        "Каждую ночь одна свеча гаснет сама. Я зажигаю её снова — и молчу, кто её задул.",
        "Отец Мирон говорит, свечи держат мёртвых внизу. Я думаю, они держат нас наверху.",
        "Снег идёт прямо сквозь крышу. Красиво. Только он не тает.",
      ],
      barks: ["Тише, свеча пугается.", "Свет — тебе в дорогу.", "Ещё одна… и ещё одна."],
    },
    {
      id: "cat", name: "Уголёк", title: "погладить", kind: "cat", x: c(CAMPFIRE.x + 0.95), z: c(CAMPFIRE.z + 0.4), yaw: 2.2,
      lines: [],
      barks: ["Мрр."],
    },
  ];
  const props: Dungeon["props"] = [];
  const lights: Dungeon["lights"] = [];
  const brazier = (x: number, z: number) => {
    props.push({ kind: "brazier", x, z, rot: 0, solid: [0.4, 0.4] });
    lights.push({ x, y: 1.6, z, color: "#ffa04a", kind: "brazier" });
  };
  brazier(c(4.6), c(9.8));
  brazier(c(10.4), c(9.8));
  brazier(c(6.2), c(2.4));
  brazier(c(8.8), c(2.4));
  // настенные факелы — только там, где стена: бока нефа открыты в ниши лавки и кузни
  for (const [x, z] of [[c(3), c(10.4)], [c(12), c(10.4)], [c(3), c(3.5)], [c(12), c(3.5)], [c(1), c(4.6)], [c(14), c(8.3)]]) {
    const right = x > c(7);
    props.push({ kind: "torch", x: right ? x - 0.25 : x + 0.25, z, rot: right ? -Math.PI / 2 : Math.PI / 2, wall: true });
    lights.push({ x: right ? x - 0.65 : x + 0.65, y: 2.9, z, color: "#ffa04a", kind: "torch" });
  }
  for (const [x, z] of [[c(5.2), c(5.2)], [c(9.8), c(5.2)], [c(5.2), c(8.6)], [c(9.8), c(8.6)]]) props.push({ kind: "pillar", x, z, rot: 0, solid: [0.7, 0.7] });
  props.push({ kind: "shelves", x: c(7.5), z: c(11) - 0.25, rot: Math.PI, wall: true });
  props.push({ kind: "candles", x: c(4.9), z: c(3.6), rot: 0 });
  lights.push({ x: c(4.9), y: 0.6, z: c(3.6), color: "#ffb36a", kind: "candle" });
  // костёр посреди нефа, у него сидит Ярош и спит кот
  props.push({ kind: "npc:campfire", x: c(CAMPFIRE.x), z: c(CAMPFIRE.z), rot: 0, solid: [0.75, 0.75] });
  lights.push({ x: c(CAMPFIRE.x), y: 1.1, z: c(CAMPFIRE.z), color: "#ff8a3a", kind: "brazier" });
  // подсвечники, которые зажигает Агата
  for (const [x, z] of AGATA_PATH) {
    const sx = x < 7.5 ? c(3) + 0.45 : c(12) - 0.45, sz = z < 4 ? c(3) + 0.45 : c(z);
    const px = z < 4 ? c(x) : sx;
    props.push({ kind: "npc:candelabra", x: px, z: sz, rot: 0, solid: [0.25, 0.25] });
    lights.push({ x: px, y: 1.7, z: sz, color: "#ffb36a", kind: "candle" });
  }
  // лунный свет сквозь дыру в крыше
  lights.push({ x: c(ROOF_HOLE.x), y: 4.5, z: c(ROOF_HOLE.z), color: "#5f7fc8", kind: "magic" });
  // лавка Ольгерда и кузня Бруны тоже твёрдые
  props.push({ kind: "npc:stall", x: c(2.35), z: c(6.5), rot: 0, solid: [0.45, 1.1] });
  props.push({ kind: "npc:forge", x: c(13.55), z: c(4.75), rot: 0, solid: [0.7, 0.8] });
  props.push({ kind: "npc:anvil", x: c(12.75) - 1.0, z: c(6.5), rot: 0, solid: [0.3, 0.5] });
  props.push({ kind: "npc:rack", x: c(13.7), z: c(8.4), rot: 0, solid: [0.35, 0.6] });
  props.push({ kind: "npc:lectern", x: c(4.2) + 0.9, z: c(3.9) + 0.7, rot: 0, solid: [0.3, 0.3] });
  props.push({ kind: "urn", x: c(1.4), z: c(5.4), rot: 0, solid: [0.3, 0.3] });
  props.push({ kind: "urn", x: c(13.6), z: c(7.6), rot: 0, solid: [0.3, 0.3] });
  props.push({ kind: "bones", x: c(10), z: c(10.4), rot: 1 });
  props.push({ kind: "banner", x: c(3) + 0.1, z: c(4.5), rot: 0, wall: true });
  props.push({ kind: "banner", x: c(12) - 0.1, z: c(9.5), rot: 0, wall: true });
  lights.push({ x: c(7.5), y: 1.8, z: c(1.6), color: "#6f9fd8", kind: "magic" });
  lights.push({ x: c(13.55), y: 1.0, z: c(4.75), color: "#ff6a20", kind: "brazier" });
  lights.push({ x: c(1.6), y: 2.4, z: c(6.5), color: "#ffc070", kind: "candle" });
  // высокий неф часовни, низкие ниши
  const ceil = new Float32Array(W * W).fill(4.4);
  for (let y = 3; y < 11; y++) for (let x = 3; x < 12; x++) ceil[y * W + x] = 7.6;
  const d: Dungeon = {
    theme: HUB_THEME, seed: 1, level: 1, w: W, h: W, cells, rooms: [], start: { x: c(7.5), z: c(10.6), yaw: 0 }, bossRoom: -1,
    spawns: [], props, lights, chests: [], traps: [], secrets: [], shrines: [], breakables: [], notes: [], ceil, chandeliers: [], levers: [],
    entrance: { x: c(7.5), z: c(12.6) }, exit: { x: -100, z: -100 },
  };
  // NPC и предметы тоже твёрдые
  for (const n of npcs) {
    if (n.kind === "nun" || n.kind === "cat") continue; // ходят и лежат — не мешают пройти
    props.push({ kind: "npc:" + n.kind, x: n.x, z: n.z, rot: n.yaw, solid: n.kind === "gate" ? undefined : [0.5, 0.5] });
  }
  return { d, npcs };
}
