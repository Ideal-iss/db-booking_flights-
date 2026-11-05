import { useState } from "react";
import { useGame } from "../store";
import { Panel, ItemSlot, type DragData, slotForItem } from "./common";
import { gameApi } from "./GameScreen";
import { EQUIP_SLOT_NAMES, BASE_BY_ID, type EquipSlot, type Item } from "@shared/data/items";
import { deriveStats } from "@shared/data/stats";
import { audio } from "../game/audio";
import { itemIcon } from "./icons";

const INV = 40;
const STASH = 48;

const DOLL: [EquipSlot, string, number, number][] = [
  ["helmet", "helmet", 1, 0],
  ["amulet", "amulet", 2, 0],
  ["weapon", "sword", 0, 1],
  ["chest", "chest", 1, 1],
  ["offhand", "shield", 2, 1],
  ["gloves", "gloves", 0, 2],
  ["boots", "boots", 1, 2],
  ["ring1", "ring", 0, 3],
  ["ring2", "ring", 2, 3],
];

export function Grid(props: { items: (Item & { pos: number })[]; size: number; cols: number; from: "inventory" | "stash"; onDrop: (pos: number, d: DragData) => void; onRight?: (it: Item) => void; extra?: (it: Item) => string }) {
  const byPos = new Map(props.items.map((i) => [i.pos, i]));
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${props.cols}, 48px)` }}>
      {Array.from({ length: props.size }, (_, pos) => {
        const it = byPos.get(pos);
        return (
          <ItemSlot
            key={pos}
            item={it}
            drag={it ? { from: props.from, uid: it.uid } : undefined}
            onDrop={(d) => props.onDrop(pos, d)}
            onRight={it && props.onRight ? () => props.onRight!(it) : undefined}
            extra={it && props.extra ? props.extra(it) : undefined}
          />
        );
      })}
    </div>
  );
}

export function EquipDoll() {
  const { char } = useGame();
  if (!char) return null;
  const drop = (slot: EquipSlot) => (d: DragData) => {
    if (d.from === "inventory" && d.uid) void gameApi.op({ op: "equip", uid: d.uid, slot });
  };
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(3, 56px)" }}>
      {DOLL.map(([slot, ph, cx, cy]) => (
        <div key={slot} style={{ gridColumn: cx + 1, gridRow: cy + 1 }} className="flex flex-col items-center">
          <ItemSlot
            size={56}
            item={char.equipment[slot]}
            placeholder={ph}
            label={EQUIP_SLOT_NAMES[slot]}
            drag={char.equipment[slot] ? { from: "equip", slot } : undefined}
            onDrop={drop(slot)}
            onRight={() => char.equipment[slot] && void gameApi.op({ op: "unequip", slot })}
            extra="ПКМ — снять"
          />
        </div>
      ))}
    </div>
  );
}

function invDrop(pos: number, d: DragData) {
  if (d.from === "inventory" && d.uid) return void gameApi.op({ op: "move", from: "inventory", to: "inventory", uid: d.uid, pos });
  if (d.from === "stash" && d.uid) return void gameApi.op({ op: "move", from: "stash", to: "inventory", uid: d.uid, pos });
  if (d.from === "equip" && d.slot) return void gameApi.op({ op: "unequip", slot: d.slot, pos });
}

export function InventoryPanel({ onClose }: { onClose: () => void }) {
  const { char, hud } = useGame();
  const [trashOver, setTrashOver] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!char) return null;
  const st = deriveStats(char);
  const inDungeon = hud?.where === "dungeon";
  return (
    <Panel title="Снаряжение и сумка" onClose={onClose} wide>
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col items-center gap-3">
          <EquipDoll />
          <div className="text-parch w-[180px] text-xs leading-5">
            <div>Урон: {st.dmg[0]}–{st.dmg[1]}</div>
            {st.attackMode !== "melee" || st.spell[1] > 3 ? <div>Сила чар: {st.spell[0]}–{st.spell[1]}</div> : null}
            <div>Броня: {st.armor} ({Math.round(st.damageReduction * 100)}%)</div>
            <div>Здоровье: {st.maxHp} · Мана: {st.maxMana}</div>
            <div>Крит: {Math.round(st.critChance * 100)}% · Блок: {Math.round(st.block * 100)}%</div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-parch flex justify-between text-sm">
            <span>Сумка {char.inventory.length}/{INV}</span>
            <span className="text-gold">{char.gold} золота</span>
          </div>
          <Grid
            items={char.inventory}
            size={INV}
            cols={8}
            from="inventory"
            onDrop={invDrop}
            onRight={(it) => { audio.play("click"); void gameApi.op({ op: "equip", uid: it.uid, slot: slotForItem(it, char) }); }}
            extra={() => "ПКМ — надеть · перетащите, чтобы переложить"}
          />
          <div className="flex items-center gap-3">
            <div
              className={`slot flex items-center justify-center ${trashOver ? "hot" : ""}`}
              style={{ width: 120, height: 40 }}
              onDragOver={(e) => { e.preventDefault(); setTrashOver(true); }}
              onDragLeave={() => setTrashOver(false)}
              onDrop={(e) => {
                setTrashOver(false);
                try {
                  const d = JSON.parse(e.dataTransfer.getData("text/plain")) as DragData;
                  if (d.from === "inventory" && d.uid) setConfirm(d.uid);
                } catch { /* нет */ }
              }}
            >
              <span className="text-dim text-xs">🗑 выбросить</span>
            </div>
            {confirm && (
              <div className="flex items-center gap-2 text-sm">
                Выбросить «{char.inventory.find((i) => i.uid === confirm)?.name}»?
                <button className="btn btn-red px-2 py-0" onClick={() => { void gameApi.op({ op: "destroy", uid: confirm }); setConfirm(null); }}>Да</button>
                <button className="btn px-2 py-0" onClick={() => setConfirm(null)}>Нет</button>
              </div>
            )}
          </div>
          {inDungeon && <div className="text-dim max-w-[420px] text-xs">Игра на паузе. Смена снаряжения в одиночном забеге действует сразу; в кооперативе — со следующего спуска.</div>}
          <div className="flex items-center gap-2 text-sm">
            <img src={itemIcon("health")} className="h-6 w-6" alt="" /> {char.potions.health}
            <img src={itemIcon("mana")} className="ml-2 h-6 w-6" alt="" /> {char.potions.mana}
            <span className="text-dim ml-2 text-xs">(запас в лагере; в забеге счётчик на панели внизу)</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function StashPanel({ onClose }: { onClose: () => void }) {
  const { char } = useGame();
  if (!char) return null;
  const stashDrop = (pos: number, d: DragData) => {
    if (d.from === "inventory" && d.uid) void gameApi.op({ op: "move", from: "inventory", to: "stash", uid: d.uid, pos });
    if (d.from === "stash" && d.uid) void gameApi.op({ op: "move", from: "stash", to: "stash", uid: d.uid, pos });
  };
  const firstFree = (items: { pos: number }[], size: number) => {
    const used = new Set(items.map((i) => i.pos));
    for (let i = 0; i < size; i++) if (!used.has(i)) return i;
    return -1;
  };
  return (
    <Panel title="Сундук отряда" onClose={onClose} wide>
      <div className="text-dim mb-3 text-sm">Здесь вещи в безопасности. Перетащите предмет или нажмите ПКМ, чтобы переложить.</div>
      <div className="flex flex-wrap gap-6">
        <div>
          <div className="text-parch mb-1 text-sm">Хранилище {char.stash.length}/{STASH}</div>
          <Grid
            items={char.stash}
            size={STASH}
            cols={8}
            from="stash"
            onDrop={stashDrop}
            onRight={(it) => {
              const p = firstFree(char.inventory, INV);
              if (p >= 0) void gameApi.op({ op: "move", from: "stash", to: "inventory", uid: it.uid, pos: p });
            }}
          />
        </div>
        <div>
          <div className="text-parch mb-1 text-sm">Сумка {char.inventory.length}/{INV}</div>
          <Grid
            items={char.inventory}
            size={INV}
            cols={8}
            from="inventory"
            onDrop={invDrop}
            onRight={(it) => {
              const p = firstFree(char.stash, STASH);
              if (p >= 0) void gameApi.op({ op: "move", from: "inventory", to: "stash", uid: it.uid, pos: p });
            }}
          />
        </div>
      </div>
    </Panel>
  );
}

export { BASE_BY_ID };
