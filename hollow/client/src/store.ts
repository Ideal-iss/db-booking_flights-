/** Глобальное состояние интерфейса (zustand). */
import { create } from "zustand";
import type { ServerCharacter } from "./api";

export type Screen = "boot" | "auth" | "select" | "create" | "game";
export type Panel =
  | null | "inventory" | "character" | "skills" | "map" | "merchant" | "blacksmith" | "stash"
  | "quests" | "gate" | "party" | "pause" | "settings" | "results" | "help" | "note";

export interface Settings {
  vhs: number;
  grain: number;
  pixel: number;
  chroma: number;
  curve: number;
  scanlines: number;
  resolution: number;
  jitter: number;
  fov: number;
  sensitivity: number;
  invertY: boolean;
  volume: number;
  music: number;
  bob: boolean;
  brightness: number;
}

export const DEFAULT_SETTINGS: Settings = {
  vhs: 0.7, grain: 0.5, pixel: 1, chroma: 0.5, curve: 0.35, scanlines: 0.5, resolution: 240, jitter: 0.5,
  fov: 72, sensitivity: 1, invertY: false, volume: 0.8, music: 0.6, bob: true, brightness: 1.35,
};

function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("hollow.settings") || "{}");
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export interface Hud {
  hp: number; maxHp: number; mana: number; maxMana: number; stamina: number; maxStamina: number;
  absorb: number;
  alive: boolean;
  /** Сколько секунд герой лежит (0 — жив). */
  deadFor: number;
  level: number; xp: number; xpNeed: number;
  cds: Record<string, number>;
  potions: { health: number; mana: number };
  prompt: string;
  boss: null | { name: string; hp: number; maxHp: number; phase: number };
  target: null | { name: string; hp: number; maxHp: number; elite?: string; level: number };
  buffs: string[];
  gold: number;
  reviving: number;
  allies: { name: string; hp: number; maxHp: number; alive: boolean; cls: string }[];
  where: "hub" | "dungeon";
  dungeonName: string;
  draw: number;
  /** Найденные, но ещё не потраченные ключи. */
  keys: number;
}

export interface LogLine { id: number; text: string; color?: string; t: number }

export interface Results {
  success: boolean;
  dungeon: string;
  xp: number; gold: number; levels: number; kills: number; items: number;
  unlocked?: string[];
  cleared?: boolean;
  firstClear?: boolean;
  pending?: boolean;
  error?: string;
}

interface State {
  screen: Screen;
  user: string | null;
  coopEnabled: boolean;
  characters: ServerCharacter[];
  char: ServerCharacter | null;
  panel: Panel;
  settings: Settings;
  hud: Hud | null;
  log: LogLine[];
  results: Results | null;
  note: { title: string; text: string } | null;
  busy: boolean;
  toast: string;
  set: (p: Partial<State>) => void;
  setSettings: (p: Partial<Settings>) => void;
  setChar: (c: ServerCharacter) => void;
  say: (text: string, color?: string) => void;
}

let logId = 0;
export const useGame = create<State>((set, get) => ({
  screen: "boot",
  user: null,
  coopEnabled: false,
  characters: [],
  char: null,
  panel: null,
  settings: loadSettings(),
  hud: null,
  log: [],
  results: null,
  note: null,
  busy: false,
  toast: "",
  set: (p) => set(p),
  setSettings: (p) => {
    const settings = { ...get().settings, ...p };
    try {
      localStorage.setItem("hollow.settings", JSON.stringify(settings));
    } catch {
      /* настройки просто не запомнятся */
    }
    set({ settings });
  },
  setChar: (c) => set({ char: c, characters: get().characters.map((x) => (x.id === c.id ? c : x)) }),
  say: (text, color) => {
    const now = performance.now();
    const log = [...get().log.filter((l) => now - l.t < 9000), { id: ++logId, text, color, t: now }].slice(-7);
    set({ log });
  },
}));

/** Окна, между которыми можно переходить вкладками, и их клавиши. */
export const NAV_TABS: { id: Exclude<Panel, null>; name: string; key: string }[] = [
  { id: "inventory", name: "Сумка", key: "I" },
  { id: "character", name: "Персонаж", key: "C" },
  { id: "skills", name: "Навыки", key: "B" },
  { id: "map", name: "Карта", key: "M" },
  { id: "quests", name: "Поручения", key: "J" },
];

/** Окна у жителей лагеря: остаются вкладкой, пока открыт интерфейс, чтобы к ним можно было вернуться. */
export const NPC_PANELS: Partial<Record<Exclude<Panel, null>, string>> = {
  merchant: "Торговец", blacksmith: "Кузнец", stash: "Сундук", gate: "Врата", quests: "Поручения",
};

let navHome: Panel = null;
let fromPanel = false;
useGame.subscribe((st, prev) => {
  if (st.panel === prev.panel) return;
  fromPanel = !!st.panel && !!prev.panel;
  if (!st.panel) navHome = null;
  else if (NPC_PANELS[st.panel] && !NAV_TABS.some((t) => t.id === st.panel)) navHome = st.panel;
});
export const navHomePanel = () => navHome;
/** Окно открыто переходом из другого окна (а не поверх игры). */
export const openedFromPanel = () => fromPanel;
