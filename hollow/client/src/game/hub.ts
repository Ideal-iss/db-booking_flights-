/** Лагерь «Последняя свеча» — разрушенная часовня над входом в подземелья. */
import { CELL, Cell, type Dungeon } from "@shared/dungeon/generate";
import type { DungeonTheme } from "@shared/data/dungeons";

export interface Npc {
  id: string;
  name: string;
  title: string;
  panel: "merchant" | "blacksmith" | "stash" | "quests" | "gate" | "party";
  x: number;
  z: number;
  yaw: number;
  kind: "merchant" | "smith" | "priest" | "stash" | "gate" | "altar";
  lines: string[];
}

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

export function buildHub(): { d: Dungeon; npcs: Npc[] } {
  const cells = new Uint8Array(W * W);
  const set = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cells[y * W + x] = Cell.Floor;
  };
  set(3, 3, 9, 8); // главный неф
  set(6, 1, 3, 2); // ниша с вратами
  set(1, 5, 2, 3); // ниша торговца
  set(12, 5, 2, 3); // кузница
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
    },
    {
      id: "smith", name: "Бруна", title: "кузнец", panel: "blacksmith", kind: "smith", x: c(13.1), z: c(6.5), yaw: Math.PI / 2,
      lines: ["Принеси железо — сделаю из него оружие. Принеси золото — сделаю лучше."],
    },
    {
      id: "priest", name: "Отец Мирон", title: "доска поручений", panel: "quests", kind: "priest", x: c(4.2), z: c(3.9), yaw: -Math.PI * 0.8,
      lines: ["Мёртвые не должны ходить. Помоги им лечь обратно."],
    },
    {
      id: "stash", name: "Сундук отряда", title: "хранилище", panel: "stash", kind: "stash", x: c(10.8), z: c(3.9), yaw: 0,
      lines: [],
    },
    {
      id: "altar", name: "Алтарь Клятвы", title: "совместный спуск", panel: "party", kind: "altar", x: c(7.5), z: c(7.2), yaw: 0,
      lines: [],
    },
  ];
  const props: Dungeon["props"] = [];
  const lights: Dungeon["lights"] = [];
  const brazier = (x: number, z: number) => {
    props.push({ kind: "brazier", x, z, rot: 0, solid: [0.4, 0.4] });
    lights.push({ x, y: 1.6, z, color: "#ffa04a", kind: "brazier" });
  };
  brazier(c(4.6), c(9.8));
  brazier(c(7.5), c(5.2));
  brazier(c(10.4), c(9.8));
  brazier(c(6.2), c(2.4));
  brazier(c(8.8), c(2.4));
  for (const [x, z] of [[c(3), c(6)], [c(12), c(8)], [c(3), c(9)], [c(12), c(4)], [c(3), c(3.6)], [c(12), c(10.2)]]) {
    const right = x > c(7);
    props.push({ kind: "torch", x: right ? x - 0.25 : x + 0.25, z, rot: right ? -Math.PI / 2 : Math.PI / 2, wall: true });
    lights.push({ x: right ? x - 0.65 : x + 0.65, y: 2.9, z, color: "#ffa04a", kind: "torch" });
  }
  for (const [x, z] of [[c(5.2), c(5.2)], [c(9.8), c(5.2)], [c(5.2), c(8.6)], [c(9.8), c(8.6)]]) props.push({ kind: "pillar", x, z, rot: 0, solid: [0.7, 0.7] });
  props.push({ kind: "shelves", x: c(7.5), z: c(11) - 0.25, rot: Math.PI, wall: true });
  props.push({ kind: "candles", x: c(4.9), z: c(3.6), rot: 0 });
  lights.push({ x: c(4.9), y: 0.6, z: c(3.6), color: "#ffb36a", kind: "candle" });
  props.push({ kind: "candles", x: c(7.5), z: c(7.9), rot: 0 });
  lights.push({ x: c(7.5), y: 0.6, z: c(7.9), color: "#ffb36a", kind: "candle" });
  props.push({ kind: "urn", x: c(1.4), z: c(5.4), rot: 0, solid: [0.3, 0.3] });
  props.push({ kind: "urn", x: c(13.6), z: c(7.6), rot: 0, solid: [0.3, 0.3] });
  props.push({ kind: "bones", x: c(10), z: c(10.4), rot: 1 });
  props.push({ kind: "banner", x: c(3) + 0.1, z: c(4.5), rot: 0, wall: true });
  props.push({ kind: "banner", x: c(12) - 0.1, z: c(9.5), rot: 0, wall: true });
  lights.push({ x: c(7.5), y: 1.8, z: c(1.6), color: "#6f9fd8", kind: "magic" });
  lights.push({ x: c(7.5), y: 1.2, z: c(7.2), color: "#c46aff", kind: "magic" });
  lights.push({ x: c(13.1), y: 1.0, z: c(6.5) + 1, color: "#ff6a20", kind: "brazier" });
  const d: Dungeon = {
    theme: HUB_THEME, seed: 1, level: 1, w: W, h: W, cells, rooms: [], start: { x: c(7.5), z: c(10.6), yaw: 0 }, bossRoom: -1,
    spawns: [], props, lights, chests: [], traps: [], secrets: [], shrines: [], breakables: [], notes: [],
    entrance: { x: c(7.5), z: c(12.6) }, exit: { x: -100, z: -100 },
  };
  // NPC и предметы тоже твёрдые
  for (const n of npcs) props.push({ kind: "npc:" + n.kind, x: n.x, z: n.z, rot: n.yaw, solid: n.kind === "gate" ? undefined : [0.5, 0.5] });
  return { d, npcs };
}
