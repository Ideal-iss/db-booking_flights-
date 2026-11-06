import { useState, type ReactNode } from "react";
import { create } from "zustand";
import {
  AFFIX_BY_ID, BASE_BY_ID, EQUIP_SLOT_NAMES, RARITIES, UNIQUE_BY_ID, UNIQUE_EFFECTS, canClassUse, itemValue, requiredLevel, slotOf,
  weaponDamage, type EquipSlot, type Item,
} from "@shared/data/items";
import { CLASSES } from "@shared/data/classes";
import { deriveStats, type CharacterData } from "@shared/data/stats";
import { baseIcon, itemIcon } from "./icons";
import { audio } from "../game/audio";
import { useGame, NAV_TABS, NPC_PANELS, navHomePanel, openedFromPanel, type Panel as GamePanel } from "../store";


export function Panel(props: { title: string; nav?: boolean; onClose?: () => void; children: ReactNode; className?: string; wide?: boolean }) {
  const nav = props.nav !== false;
  // Анимация появления только когда окно открыто поверх игры; при переходе из другого окна оно сменяется мгновенно.
  // Решаем один раз при монтировании, иначе любое обновление интерфейса проиграло бы анимацию заново.
  const [rise] = useState(() => !openedFromPanel());
  return (
    <div
      className={`panel relative flex max-h-[92vh] flex-col p-6 ${rise ? "rise" : ""} ${
        nav ? "h-[min(800px,92vh)] w-[min(1080px,96vw)]" : props.wide ? "w-[min(1080px,96vw)]" : "w-[min(720px,96vw)]"
      } ${props.className || ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="panel-title">{props.title}</h2>
        {props.onClose && (
          <button className="btn" onClick={() => { audio.play("click"); props.onClose!(); }}>
            Закрыть <span className="kbd">Esc</span>
          </button>
        )}
      </div>
      {nav && <PanelNav />}
      <div className="scroll min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">{props.children}</div>
    </div>
  );
}

/** Вкладки для перехода между окнами прямо из открытого окна. */
function PanelNav() {
  const panel = useGame((s) => s.panel);
  const home = navHomePanel();
  const tabs: { id: Exclude<GamePanel, null>; name: string; key?: string }[] = [...NAV_TABS];
  if (home && NPC_PANELS[home]) tabs.unshift({ id: home, name: NPC_PANELS[home]! });
  const go = (id: GamePanel) => {
    if (id === panel) return;
    audio.play("click");
    useGame.setState({ panel: id });
  };
  return (
    <nav className="border-line mb-5 flex flex-wrap gap-x-6 border-b" aria-label="Окна">
      {tabs.map((t) => (
        <button key={t.id} className={`navtab ${t.id === panel ? "is-on" : ""}`} aria-current={t.id === panel ? "page" : undefined} onClick={() => go(t.id)}>
          {t.name}
          {t.key && <span className="kbd">{t.key}</span>}
        </button>
      ))}
    </nav>
  );
}

export function Bar(props: { value: number; max: number; color: string; label?: string; className?: string; extra?: number }) {
  const k = props.max > 0 ? Math.max(0, Math.min(1, props.value / props.max)) : 0;
  const e = props.extra && props.max ? Math.min(1, props.extra / props.max) : 0;
  return (
    <div className={`bar ${props.className || ""}`}>
      <i style={{ width: `${k * 100}%`, background: props.color }} />
      {e > 0 && <i style={{ width: `${e * 100}%`, background: "#d8dce4aa", left: 0 }} />}
      {props.label !== undefined && <span>{props.label}</span>}
    </div>
  );
}

// ------------------------------------------------------------ подсказки к предметам
interface TipState {
  item: Item | null;
  x: number;
  y: number;
  extra: string;
  compare: boolean;
  set: (p: Partial<TipState>) => void;
}
export const useTip = create<TipState>((set) => ({ item: null, x: 0, y: 0, extra: "", compare: true, set: (p) => set(p) }));

export function fmt(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function ItemLines({ item, char }: { item: Item; char: CharacterData | null }) {
  const base = BASE_BY_ID[item.base];
  const r = RARITIES[item.rarity];
  const wd = base.slot === "weapon" ? weaponDamage(item) : null;
  const req = requiredLevel(item);
  const cls = char ? CLASSES[char.cls] : null;
  const usable = !cls || canClassUse(cls, item);
  const u = item.unique ? UNIQUE_BY_ID[item.unique] : null;
  return (
    <div className="space-y-0.5">
      <div className="font-medium" style={{ color: r.color }}>
        {item.name}
        {item.upgrade ? ` +${item.upgrade}` : ""}
      </div>
      <div className="label pb-1">
        {r.name} · {base.name} · {EQUIP_SLOT_NAMES[(base.slot === "ring" ? "ring1" : base.slot) as EquipSlot]} · ур. предмета {item.ilvl}
      </div>
      {wd && wd.dmg[1] > 0 && <div>Урон: {wd.dmg[0]}–{wd.dmg[1]} · скорость {fmt(wd.speed)}</div>}
      {wd && wd.spell[1] > 0 && <div>Сила чар: {wd.spell[0]}–{wd.spell[1]}</div>}
      {base.armor ? <div>Броня: {Math.round(base.armor * (1 + 0.12 * (item.upgrade || 0)) * (item.rarity === "common" ? 1 : 1.1))}</div> : null}
      {base.block ? <div>Блок: {Math.round(base.block * 100)}%</div> : null}
      {Object.entries(base.implicit || {}).map(([k, v]) => (
        <div key={k} className="text-parch">{implicitText(k, v)}</div>
      ))}
      {item.affixes.map((a, i) => {
        const def = AFFIX_BY_ID[a.id];
        if (!def) return null;
        return (
          <div key={i} style={{ color: def.curse ? "#f07b7f" : "#9fb4d8" }}>
            {def.label(a.v)}
          </div>
        );
      })}
      {u &&
        Object.entries(u.effects).map(([k, v]) => (
          <div key={k} style={{ color: "#e3a45a" }}>
            {UNIQUE_EFFECTS[k]?.(v)}
          </div>
        ))}
      {u && <div className="text-dim pt-1 font-[family-name:var(--font-head)] text-[15px] leading-5">«{u.lore}»</div>}
      <div className={`pt-1 text-xs ${char && char.level < req ? "text-bad" : "text-dim"}`}>Требуется уровень {req}</div>
      {!usable && <div className="text-bad text-xs">{cls?.name}: не может использовать</div>}
      <div className="text-dim text-xs">Цена продажи {itemValue(item)} зол.</div>
    </div>
  );
}

function implicitText(k: string, v: number) {
  const names: Record<string, string> = { undeadPct: "к урону по нежити", critChance: "к шансу крита", spellPct: "к силе чар", summonPct: "к силе призванных", block: "к блоку", healPct: "к исцелению", manaRegenPct: "к восстановлению маны", dodge: "к уклонению" };
  return `+${Math.round(v * 100)}% ${names[k] || k}`;
}

/** Разница характеристик, если надеть предмет. */
function diffLines(item: Item, char: CharacterData) {
  const base = BASE_BY_ID[item.base];
  let slot: EquipSlot = (base.slot === "ring" ? "ring1" : base.slot) as EquipSlot;
  if (base.slot === "ring" && char.equipment.ring1 && !char.equipment.ring2) slot = "ring2";
  const before = deriveStats(char);
  const after = deriveStats({ ...char, equipment: { ...char.equipment, [slot]: item } });
  const rows: [string, number, number, boolean?][] = [
    ["Урон", (before.dmg[0] + before.dmg[1]) / 2, (after.dmg[0] + after.dmg[1]) / 2],
    ["Сила чар", (before.spell[0] + before.spell[1]) / 2, (after.spell[0] + after.spell[1]) / 2],
    ["Здоровье", before.maxHp, after.maxHp],
    ["Мана", before.maxMana, after.maxMana],
    ["Броня", before.armor, after.armor],
    ["Скорость атаки", before.attackSpeed * 100, after.attackSpeed * 100],
    ["Крит, %", before.critChance * 100, after.critChance * 100],
    ["Скорость бега", before.moveSpeed * 10, after.moveSpeed * 10],
  ];
  return rows.filter(([, a, b]) => Math.abs(b - a) > 0.05);
}

export function TooltipLayer({ char }: { char: CharacterData | null }) {
  const { item, x, y, extra, compare } = useTip();
  if (!item) return null;
  const base = BASE_BY_ID[item.base];
  const slot: EquipSlot = (base.slot === "ring" ? "ring1" : base.slot) as EquipSlot;
  const equipped = char && compare ? char.equipment[slot] : undefined;
  const showCompare = equipped && equipped.uid !== item.uid;
  const diffs = char && compare && !Object.values(char.equipment).some((e) => e?.uid === item.uid) ? diffLines(item, char) : [];
  const left = Math.min(x + 18, window.innerWidth - (showCompare ? 640 : 320));
  const top = Math.min(y + 12, window.innerHeight - 330);
  return (
    <div className="tooltip flex gap-2" style={{ left: Math.max(4, left), top: Math.max(4, top) }}>
      <div className="panel w-[300px] p-4">
        <ItemLines item={item} char={char} />
        {diffs.length > 0 && (
          <div className="mt-2 border-t border-line pt-2 text-xs">
            {diffs.map(([n, a, b]) => (
              <div key={n} className="flex justify-between">
                <span className="text-parch">{n}</span>
                <span className={b > a ? "text-good" : "text-bad"}>{fmt(a)} → {fmt(b)}</span>
              </div>
            ))}
          </div>
        )}
        {extra && <div className="text-parch mt-2 text-xs">{extra}</div>}
      </div>
      {showCompare && (
        <div className="panel w-[300px] p-4">
          <div className="label mb-1">Надето сейчас</div>
          <ItemLines item={equipped!} char={char} />
        </div>
      )}
    </div>
  );
}

export function ItemSlot(props: {
  item?: Item | null;
  placeholder?: string;
  size?: number;
  onDrop?: (data: DragData) => void;
  drag?: DragData;
  onClick?: () => void;
  onRight?: () => void;
  extra?: string;
  dim?: boolean;
  label?: string;
}) {
  const set = useTip((s) => s.set);
  const [over, setOver] = useState(false);
  const it = props.item;
  const color = it ? RARITIES[it.rarity].color : undefined;
  const size = props.size || 48;
  return (
    <div
      className={`slot ${over ? "hot" : ""}`}
      style={{ width: size, height: size, borderColor: over ? undefined : color && it?.rarity !== "common" ? color + "66" : undefined, opacity: props.dim ? 0.5 : 1 }}
      draggable={!!(it && props.drag)}
      onDragStart={(e) => {
        if (!props.drag) return;
        e.dataTransfer.setData("text/plain", JSON.stringify(props.drag));
        e.dataTransfer.effectAllowed = "move";
        set({ item: null });
      }}
      onDragOver={(e) => {
        if (props.onDrop) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!props.onDrop) return;
        e.preventDefault();
        try {
          props.onDrop(JSON.parse(e.dataTransfer.getData("text/plain")));
        } catch {
          /* не наш перенос */
        }
      }}
      onMouseEnter={(e) => it && set({ item: it, x: e.clientX, y: e.clientY, extra: props.extra || "" })}
      onMouseMove={(e) => it && set({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => set({ item: null })}
      onClick={props.onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onRight?.();
        set({ item: null });
      }}
    >
      {it ? (
        <>
          <img src={baseIcon(it.base)} alt="" draggable={false} />
          {it.rarity !== "common" && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px]" style={{ background: color }} />}
          {it.upgrade ? <span className="absolute top-0.5 right-1 text-[11px] leading-none text-bone">+{it.upgrade}</span> : null}
        </>
      ) : props.placeholder ? (
        <img src={itemIcon(props.placeholder)} alt="" className="opacity-20 grayscale" draggable={false} />
      ) : null}
      {props.label && !it && <span className="text-dim absolute inset-x-0 bottom-0.5 text-center text-[10px] leading-3">{props.label}</span>}
    </div>
  );
}

export type DragData = { from: "inventory" | "stash" | "equip" | "merchant"; uid?: string; slot?: EquipSlot; index?: number };

export function slotForItem(item: Item, char: CharacterData): EquipSlot {
  const base = BASE_BY_ID[item.base];
  if (base.slot === "ring") return char.equipment.ring1 && !char.equipment.ring2 ? "ring2" : "ring1";
  return slotOf(base.slot as EquipSlot) as EquipSlot;
}
