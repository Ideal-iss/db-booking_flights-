/**
 * «Сервер» внутри игры для Яндекс Игр: те же вызовы, что у Django API,
 * но персонажи живут в сохранении — локально и в облаке Яндекса.
 */
import type { Item } from "@shared/data/items";
import { CLASSES, type ClassId } from "@shared/data/classes";
import { parseStage, stageUnlocked, stageLabel } from "@shared/data/dungeons";
import { ApiError, type ServerCharacter } from "../api";
import { yandex } from "../yandex";
import {
  GameError, INVENTORY_SIZE, MAX_CHARACTERS, NAME_RE, applyOp, applyRunResult, cleanAppearance, newCharacter, runLevel, toClient,
  type RunResult, type StoredChar,
} from "./rules";

interface Save {
  v: 1;
  savedAt: number;
  nextId: number;
  chars: StoredChar[];
  run?: { id: string; charId: number; dungeon: string; seed: number; level: number; picked: number } | null;
}

const KEY = "hollow-save";
let save: Save = { v: 1, savedAt: 0, nextId: 1, chars: [] };
let loaded: Promise<void> | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;

function readLocal(): Save | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Save) : null;
  } catch {
    return null;
  }
}

/** Загрузка: берём более свежее из локальной копии и облака. */
function load() {
  loaded ||= (async () => {
    const local = readLocal();
    const cloud = (await yandex.loadCloud())?.save as Save | undefined;
    const best = [local, cloud].filter((s): s is Save => !!s && s.v === 1 && Array.isArray(s.chars)).sort((a, b) => b.savedAt - a.savedAt)[0];
    if (best) save = best;
  })();
  return loaded;
}

/** Запись: локально сразу, в облако — пачкой раз в несколько секунд (у площадки есть лимит частоты). */
function persist(important = false) {
  save.savedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* приватный режим: остаётся облако */ }
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => { cloudTimer = null; void yandex.saveCloud({ save }, important); }, important ? 300 : 3000);
}
// перед закрытием вкладки дописываем облако
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { if (cloudTimer) { clearTimeout(cloudTimer); void yandex.saveCloud({ save }, true); } });

function charOf(id: number) {
  const c = save.chars.find((x) => x.id === id);
  if (!c) throw new ApiError("Персонаж не найден.");
  return c;
}

/** Ошибки правил превращаются в ошибки «сервера», как у Django. */
async function guard<T>(fn: () => T): Promise<T> {
  await load();
  try {
    return fn();
  } catch (e) {
    if (e instanceof GameError) throw new ApiError(e.message);
    throw e;
  }
}

export const localApi = {
  me: () => guard(() => ({ user: "guest" as string | null, characters: save.chars.map((c) => toClient(c, false)), coop: false })),
  login: async (_u: string, _p: string) => ({}),
  register: async (_u: string, _p: string) => ({}),
  logout: async () => ({}),
  create: (name: string, cls: string, appearance: unknown) =>
    guard(() => {
      const n = name.split(/\s+/).filter(Boolean).join(" ");
      if (!(cls in CLASSES)) throw new GameError("Выберите класс.");
      if (!NAME_RE.test(n)) throw new GameError("Имя: 3–20 букв, цифр, пробелов или дефисов.");
      if (save.chars.length >= MAX_CHARACTERS) throw new GameError(`Не больше ${MAX_CHARACTERS} персонажей.`);
      if (save.chars.some((c) => c.name.toLowerCase() === n.toLowerCase())) throw new GameError("Герой с таким именем уже есть.");
      const c = newCharacter(save.nextId++, n, cls as ClassId, cleanAppearance(appearance));
      save.chars.push(c);
      persist(true);
      return { character: toClient(c) };
    }),
  character: (id: number) => guard(() => ({ character: toClient(charOf(id)) })),
  remove: (id: number) =>
    guard(() => {
      save.chars = save.chars.filter((c) => c.id !== id);
      persist(true);
      return {};
    }),
  op: (id: number, op: Record<string, unknown>) =>
    guard(() => {
      const c = charOf(id);
      // правила меняют копию: при ошибке персонаж остаётся прежним
      const copy: StoredChar = JSON.parse(JSON.stringify(c));
      const message = applyOp(copy, op);
      save.chars[save.chars.indexOf(c)] = copy;
      persist();
      return { character: toClient(copy), message };
    }),
  runStart: (id: number, dungeon: string) =>
    guard(() => {
      const c = charOf(id);
      const p = parseStage(dungeon);
      if (!p) throw new GameError("Неизвестное подземелье.");
      if (!stageUnlocked(dungeon, c.cleared)) {
        if (p.nightmare) throw new GameError("Кошмар откроется после победы над Полым Сердцем.");
        throw new GameError(`Сначала пройдите: ${stageLabel(p.stage.unlock!)}.`);
      }
      // незавершённый забег (закрыли вкладку) считается проваленным
      if (save.run) {
        const prev = save.chars.find((x) => x.id === save.run!.charId);
        if (prev) { prev.stats.runs++; prev.stats.deaths++; }
      }
      const run = { id: Math.random().toString(36).slice(2), charId: id, dungeon, seed: 1 + Math.floor(Math.random() * 2 ** 31 - 2), level: runLevel(dungeon, c.level), picked: 0 };
      save.run = run;
      persist(true);
      return { run: { id: run.id, dungeon, seed: run.seed, level: run.level } };
    }),
  pickup: (id: number, runId: string, item: Item) =>
    guard(() => {
      const c = charOf(id);
      if (!save.run || save.run.id !== runId) throw new GameError("Забег уже завершён.");
      if (save.run.picked >= 60) throw new GameError("Слишком много добычи за один забег.");
      const used = new Set(c.inventory.map((x) => x.pos));
      let pos = -1;
      for (let p = 0; p < INVENTORY_SIZE; p++) if (!used.has(p)) { pos = p; break; }
      if (pos < 0) throw new GameError("Сумка полна.");
      const clean = { ...JSON.parse(JSON.stringify(item)), upgrade: 0, pos } as Item & { pos: number };
      c.inventory.push(clean);
      save.run.picked++;
      persist();
      return { item: clean };
    }),
  finish: (id: number, runId: string, success: boolean, result: unknown) =>
    guard(() => {
      const c = charOf(id);
      if (!save.run || save.run.id !== runId) throw new GameError("Забег уже завершён.");
      const summary = applyRunResult(c, save.run.dungeon, success, (result || {}) as RunResult);
      save.run = null;
      persist(true);
      return { summary, character: toClient(c) as ServerCharacter };
    }),
  coopToken: async (_id: number): Promise<{ token: string; url: string }> => {
    throw new ApiError("Совместная игра недоступна в этой версии.");
  },
};
