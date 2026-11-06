/**
 * Правила лагеря без сервера — для сборки Яндекс Игр, где нет своего бэкенда.
 * Повторяет web/hollow/game.py: сумка, торговец, кузнец, атрибуты, навыки, поручения, итоги забега.
 */
import { Rng } from "@shared/rng";
import { CLASSES, ATTR_IDS, type ClassId } from "@shared/data/classes";
import { BASES, BASE_BY_ID, makeItem, starterItem, itemValue, upgradeCost, requiredLevel, canClassUse, type Item, type EquipSlot, type Rarity } from "@shared/data/items";
import { SKILLS, SKILL_BY_ID } from "@shared/data/skills";
import { QUESTS, QUEST_BY_ID, STAGES, parseStage, NIGHTMARE_BONUS } from "@shared/data/dungeons";
import { POTIONS } from "@shared/data/items";
import { levelFromXp, ATTR_POINTS_PER_LEVEL, SKILL_POINTS_PER_LEVEL, type Appearance } from "@shared/data/stats";
import type { ServerCharacter, MerchantItem } from "../api";

export class GameError extends Error {}

export const INVENTORY_SIZE = 40;
export const STASH_SIZE = 48;
export const MAX_CHARACTERS = 6;
export const HOTBAR_SIZE = 6;
export const NAME_RE = /^[A-Za-zА-Яа-яЁё0-9 _-]{3,20}$/;
const FINAL_STAGE = "a5s3";
const HAIR = ["bald", "short", "long", "hood", "braid", "mohawk"];
const ACCESSORY = ["none", "scar", "paint", "eyepatch", "beard", "mask"];

/** Что хранится в сохранении (то же, что колонка data в Django + имя и класс). */
export type StoredChar = Omit<ServerCharacter, "merchant"> & { bought?: number[]; sp2?: number; merchantGen: number; stats: { runs: number; deaths: number; kills: number; bosses: number } };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function cleanAppearance(a: unknown): Appearance {
  const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  const num = (k: string, hi: number) => (Number.isInteger(o[k]) && (o[k] as number) >= 0 && (o[k] as number) < hi ? (o[k] as number) : 0);
  return {
    skin: num("skin", 6),
    hair: HAIR.includes(o.hair as string) ? (o.hair as string) : "short",
    hairColor: num("hairColor", 8),
    cloth: num("cloth", 8),
    trim: num("trim", 8),
    accessory: ACCESSORY.includes(o.accessory as string) ? (o.accessory as string) : "none",
  };
}

export function newCharacter(id: number, name: string, cls: ClassId, appearance: Appearance): StoredChar {
  const c = CLASSES[cls];
  const equipment: Partial<Record<EquipSlot, Item>> = {};
  for (const b of c.startItems) {
    const slot = BASE_BY_ID[b].slot;
    equipment[(slot === "ring" ? "ring1" : slot) as EquipSlot] = starterItem(b, uid());
  }
  const first = SKILLS.find((s) => s.cls === cls && s.kind === "active" && s.reqLevel === 1)!.id;
  return {
    id, name, cls, appearance,
    level: 1, xp: 0, attrs: { ...c.attrs }, attrPoints: 0, skillPoints: 0,
    skills: { [first]: 1 }, hotbar: [first, null, null, null, null, null], sp2: 1,
    equipment, inventory: [], stash: [], gold: 60, potions: { health: 3, mana: 2 },
    quests: [], cleared: [], merchantGen: 0, stats: { runs: 0, deaths: 0, kills: 0, bosses: 0 },
  };
}

/** Товары торговца: детерминированы по герою и «поколению» (обновляются после каждого забега). */
export function merchantStock(charId: number, gen: number, level: number): (Item & { price: number })[] {
  const rng = new Rng(`${charId}:${gen}`);
  const candidates = BASES.filter((b) => b.req <= level + 1);
  const out: (Item & { price: number })[] = [];
  for (let i = 0; i < 10; i++) {
    const rarity = rng.weighted<[Rarity, number]>([["common", 50], ["uncommon", 38], ["rare", 12]], (x) => x[1])[0];
    const it = makeItem(rng, rng.pick(candidates).id, rarity, Math.max(1, level));
    it.uid = uid();
    out.push({ ...it, price: itemValue(it) * 4 });
  }
  return out;
}

export function toClient(c: StoredChar, withMerchant = true): ServerCharacter {
  const { bought, sp2, ...rest } = c;
  void sp2;
  const out: ServerCharacter = JSON.parse(JSON.stringify(rest));
  if (withMerchant) {
    const b = new Set(bought || []);
    out.merchant = merchantStock(c.id, c.merchantGen, c.level).map((it, i): MerchantItem => (b.has(i) ? null : it));
  }
  return out;
}

const freePos = (list: { pos: number }[], size: number) => {
  const used = new Set(list.map((x) => x.pos));
  for (let p = 0; p < size; p++) if (!used.has(p)) return p;
  return null;
};
const find = <T extends { uid: string }>(list: T[], id: unknown) => {
  const it = list.find((x) => x.uid === id);
  if (!it) throw new GameError("Предмет не найден.");
  return it;
};

export function addXp(d: StoredChar, amount: number) {
  const before = d.level;
  d.xp += Math.max(0, Math.floor(amount));
  const after = levelFromXp(d.xp).level;
  if (after > before) {
    d.level = after;
    d.attrPoints += ATTR_POINTS_PER_LEVEL * (after - before);
    d.skillPoints += SKILL_POINTS_PER_LEVEL * (after - before);
  }
  return after - before;
}

export const respecCost = (level: number) => 40 + level * level * 6;

export function runLevel(key: string, charLevel: number) {
  const p = parseStage(key)!;
  const base = p.stage.level + (p.nightmare ? NIGHTMARE_BONUS : 0);
  return Math.max(base, Math.min(charLevel - 1, base + 3));
}

export function unlockedBy(key: string): string[] {
  const p = parseStage(key);
  if (!p) return [];
  const pref = p.nightmare ? "n:" : "";
  const out = STAGES.filter((s) => s.unlock === p.stage.id).map((s) => pref + s.id);
  if (p.stage.id === FINAL_STAGE && !p.nightmare) out.push("n:a1s1");
  return out;
}

/** Действие в лагере: меняет персонажа на месте, возвращает сообщение. */
export function applyOp(d: StoredChar, op: Record<string, unknown>): string {
  const inv = d.inventory, stash = d.stash, eq = d.equipment;
  switch (op.op) {
    case "move": {
      const src = op.from === "inventory" ? inv : op.from === "stash" ? stash : null;
      const dst = op.to === "inventory" ? inv : op.to === "stash" ? stash : null;
      if (!src || !dst) throw new GameError("Неверное место.");
      const size = dst === inv ? INVENTORY_SIZE : STASH_SIZE;
      const pos = op.pos as number;
      if (!Number.isInteger(pos) || pos < 0 || pos >= size) throw new GameError("Неверная ячейка.");
      const it = find(src, op.uid);
      const other = dst.find((x) => x.pos === pos && x !== it);
      if (other) {
        dst.splice(dst.indexOf(other), 1);
        other.pos = it.pos;
        src.push(other);
      }
      src.splice(src.indexOf(it), 1);
      it.pos = pos;
      dst.push(it);
      return "";
    }
    case "equip": {
      const it = find(inv, op.uid);
      const base = BASE_BY_ID[it.base];
      if (requiredLevel(it) > d.level) throw new GameError(`Нужен ${requiredLevel(it)} уровень.`);
      if (!canClassUse(CLASSES[d.cls], it)) throw new GameError("Ваш класс не может это использовать.");
      let slot: EquipSlot;
      if (base.slot === "ring") slot = op.slot === "ring1" || op.slot === "ring2" ? op.slot : !eq.ring1 ? "ring1" : !eq.ring2 ? "ring2" : "ring1";
      else slot = base.slot as EquipSlot;
      inv.splice(inv.indexOf(it), 1);
      const { pos, ...item } = it;
      const old = eq[slot];
      eq[slot] = item;
      if (old) inv.push({ ...old, pos });
      return "";
    }
    case "unequip": {
      const slot = op.slot as EquipSlot;
      const it = eq[slot];
      if (!it) throw new GameError("Слот пуст.");
      let pos = op.pos as number | null;
      if (!Number.isInteger(pos) || inv.some((x) => x.pos === pos) || (pos as number) < 0 || (pos as number) >= INVENTORY_SIZE) pos = freePos(inv, INVENTORY_SIZE);
      if (pos === null) throw new GameError("Сумка полна.");
      delete eq[slot];
      inv.push({ ...it, pos });
      return "";
    }
    case "sell": {
      const it = find(inv, op.uid);
      inv.splice(inv.indexOf(it), 1);
      const v = itemValue(it);
      d.gold += v;
      return `Продано за ${v} зол.`;
    }
    case "destroy": {
      const it = find(inv, op.uid);
      inv.splice(inv.indexOf(it), 1);
      return "Предмет выброшен.";
    }
    case "buy": {
      const stock = merchantStock(d.id, d.merchantGen, d.level);
      const bought = (d.bought ||= []);
      const idx = op.index as number;
      if (!Number.isInteger(idx) || idx < 0 || idx >= stock.length || bought.includes(idx)) throw new GameError("Этого товара уже нет.");
      const { price, ...it } = stock[idx];
      if (d.gold < price) throw new GameError("Не хватает золота.");
      const pos = freePos(inv, INVENTORY_SIZE);
      if (pos === null) throw new GameError("Сумка полна.");
      d.gold -= price;
      inv.push({ ...it, pos });
      bought.push(idx);
      return `Куплено: ${it.name}`;
    }
    case "buy_potion": {
      const kind = op.kind as "health" | "mana";
      const n = (op.n as number) ?? 1;
      if (!(kind in POTIONS) || !Number.isInteger(n) || n < 1 || n > 10) throw new GameError("Неверная покупка.");
      const cost = POTIONS[kind].price * n;
      if (d.gold < cost) throw new GameError("Не хватает золота.");
      if (d.potions[kind] + n > 20) throw new GameError("Больше 20 зелий не унести.");
      d.gold -= cost;
      d.potions[kind] += n;
      return "";
    }
    case "upgrade": {
      const it = Object.values(eq).find((x) => x?.uid === op.uid) || find(inv, op.uid);
      const cost = upgradeCost(it);
      if (cost === null) throw new GameError("Предмет уже заточен до предела.");
      if (d.gold < cost) throw new GameError("Не хватает золота.");
      d.gold -= cost;
      it.upgrade = (it.upgrade || 0) + 1;
      return `${it.name} заточен до +${it.upgrade}.`;
    }
    case "attr": {
      const a = op.attr as (typeof ATTR_IDS)[number];
      if (!ATTR_IDS.includes(a)) throw new GameError("Неизвестный атрибут.");
      if (d.attrPoints <= 0) throw new GameError("Нет свободных очков.");
      d.attrPoints--;
      d.attrs[a]++;
      return "";
    }
    case "skill": {
      const s = SKILL_BY_ID[op.id as string];
      if (!s || s.cls !== d.cls) throw new GameError("Неизвестный навык.");
      const cur = d.skills[s.id] || 0;
      if (d.skillPoints <= 0) throw new GameError("Нет очков навыков.");
      if (cur >= s.maxRank) throw new GameError("Максимальный ранг.");
      if (d.level < s.reqLevel) throw new GameError(`Нужен ${s.reqLevel} уровень.`);
      for (const r of s.requires || []) if ((d.skills[r.id] || 0) < r.rank) throw new GameError(`Нужно: ${SKILL_BY_ID[r.id].name} ${r.rank}`);
      d.skillPoints--;
      d.skills[s.id] = cur + 1;
      if (cur === 0 && s.kind === "active") {
        const free = d.hotbar.indexOf(null);
        if (free >= 0) d.hotbar[free] = s.id;
      }
      return "";
    }
    case "respec": {
      const spent = Object.values(d.skills).reduce((a, b) => a + b, 0);
      if (spent <= 0) throw new GameError("Нечего сбрасывать.");
      const cost = respecCost(d.level);
      if (d.gold < cost) throw new GameError(`Нужно ${cost} золота.`);
      d.gold -= cost;
      d.skills = {};
      d.skillPoints += spent;
      d.hotbar = Array(HOTBAR_SIZE).fill(null);
      return `Навыки забыты. Свободных очков: ${d.skillPoints}.`;
    }
    case "hotbar": {
      const slot = op.slot as number, id = op.id as string | null;
      if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SIZE) throw new GameError("Неверная ячейка.");
      if (id !== null && id !== undefined) {
        const s = SKILL_BY_ID[id];
        if (!s || s.kind !== "active" || !(d.skills[id] > 0)) throw new GameError("Навык не изучен.");
        d.hotbar = d.hotbar.map((x) => (x === id ? null : x));
      }
      d.hotbar[slot] = id ?? null;
      return "";
    }
    case "quest_claim": {
      const st = d.quests.find((q) => q.id === op.id);
      if (!st || !st.done || st.claimed) throw new GameError("Награда недоступна.");
      const q = QUEST_BY_ID[st.id];
      st.claimed = true;
      d.gold += q.reward.gold;
      addXp(d, q.reward.xp);
      return `Награда: ${q.reward.xp} опыта и ${q.reward.gold} золота.`;
    }
    case "appearance":
      d.appearance = cleanAppearance(op.appearance);
      return "";
  }
  throw new GameError("Неизвестное действие.");
}

function questProgress(d: StoredChar, kills: Record<string, number>, bosses: string[]) {
  for (const q of QUESTS) {
    if (d.level < q.minLevel) continue;
    let st = d.quests.find((x) => x.id === q.id);
    if (!st) {
      st = { id: q.id, progress: 0, done: false, claimed: false };
      d.quests.push(st);
    }
    if (st.done) continue;
    if (q.kind === "kill") st.progress += Math.floor(kills[q.target] || 0);
    else if (q.kind === "boss") st.progress += bosses.filter((b) => b === q.target).length;
    if (st.progress >= q.count) {
      st.progress = q.count;
      st.done = true;
    }
  }
}

export interface RunResult {
  xp?: number; gold?: number; kills?: Record<string, number>; bosses?: string[];
  potionsUsed?: Partial<Record<"health" | "mana", number>>; potionsFound?: Partial<Record<"health" | "mana", number>>;
}

/** Итоги забега: опыт (половина при поражении), золото, зелья, поручения, этап кампании. */
export function applyRunResult(d: StoredChar, dungeon: string, success: boolean, res: RunResult) {
  const p = parseStage(dungeon)!;
  const boss = p.stage.boss;
  const int = (v: unknown, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(hi, Math.floor(v))) : 0);
  let xp = int(res.xp, 1e9);
  const gold = int(res.gold, 1e9);
  const kills: Record<string, number> = {};
  for (const [k, v] of Object.entries(res.kills || {})) kills[k] = int(v, 999);
  const bosses = (res.bosses || []).filter((b) => b === boss).slice(0, 1);
  if (!success) xp = Math.floor(xp / 2);
  for (const k of ["health", "mana"] as const) {
    d.potions[k] = Math.max(0, Math.min(20, d.potions[k] - int(res.potionsUsed?.[k], 99) + int(res.potionsFound?.[k], 15)));
  }
  const levels = addXp(d, xp);
  d.gold += gold;
  d.stats.runs++;
  d.stats.kills += Object.values(kills).reduce((a, b) => a + b, 0);
  if (!success) d.stats.deaths++;
  if (bosses.length) d.stats.bosses++;
  questProgress(d, kills, bosses);
  d.merchantGen++;
  d.bought = [];
  const summary: { xp: number; gold: number; levels: number; cleared?: boolean; unlocked?: string[]; firstClear?: boolean } = { xp, gold, levels };
  const killedBoss = bosses.length > 0;
  summary.cleared = success && killedBoss;
  if (success && killedBoss && !d.cleared.includes(dungeon)) {
    d.cleared.push(dungeon);
    summary.unlocked = unlockedBy(dungeon);
    summary.firstClear = true;
  }
  return summary;
}
