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
}

export interface LogLine { id: number; text: string; color?: string; t: number }

export interface Results {
  success: boolean;
  dungeon: string;
  xp: number; gold: number; levels: number; kills: number; items: number;
  unlocked?: string[];
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
