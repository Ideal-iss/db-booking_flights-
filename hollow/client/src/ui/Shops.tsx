import { useState } from "react";
import { useGame } from "../store";
import { Panel, ItemSlot, type DragData } from "./common";
import { gameApi } from "./GameScreen";
import { Grid } from "./Inventory";
import { POTIONS, RARITIES, itemValue, upgradeCost, weaponDamage, BASE_BY_ID, EQUIP_SLOTS, type Item } from "@shared/data/items";
import { itemIcon } from "./icons";
import { audio } from "../game/audio";

export function MerchantPanel({ onClose }: { onClose: () => void }) {
  const { char } = useGame();
  const [over, setOver] = useState(false);
  if (!char) return null;
  const stock = char.merchant || [];
  const sell = (uid: string) => {
    audio.play("gold");
    void gameApi.op({ op: "sell", uid });
  };
  return (
    <Panel title="Ольгерд, торговец" onClose={onClose} wide>
      <div className="text-parch mb-3 text-sm">
        Золото: <span className="text-gold">{char.gold}</span> · Товар обновляется после каждого спуска. ПКМ по вещи в сумке — продать.
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="w-[440px]">
          <h3 className="panel-title mb-2">Товары</h3>
          <div className="flex flex-col gap-1">
            {stock.map((it, i) =>
              it ? (
                <div key={i} className="flex items-center gap-2 border-b border-[#2b221a] pb-1">
                  <ItemSlot item={it} size={40} extra={`Цена: ${it.price} зол.`} />
                  <div className="flex-1 text-sm" style={{ color: RARITIES[it.rarity].color }}>{it.name}</div>
                  <button className="btn px-2 py-0.5 text-sm" disabled={char.gold < it.price} onClick={() => { audio.play("gold"); void gameApi.op({ op: "buy", index: i }); }}>
                    {it.price} зол.
                  </button>
                </div>
              ) : (
                <div key={i} className="text-dim border-b border-[#2b221a] py-2 text-sm">— продано —</div>
              ),
            )}
          </div>
          <h3 className="panel-title mt-4 mb-2">Зелья</h3>
          {(["health", "mana"] as const).map((k) => (
            <div key={k} className="mb-1 flex items-center gap-2">
              <img src={itemIcon(k)} className="h-8 w-8" alt="" />
              <span className="flex-1 text-sm">{POTIONS[k].name} (у вас {char.potions[k]}/20)</span>
              <button className="btn px-2 py-0.5 text-sm" disabled={char.gold < POTIONS[k].price} onClick={() => gameApi.op({ op: "buy_potion", kind: k, n: 1 })}>
                1 — {POTIONS[k].price}
              </button>
              <button className="btn px-2 py-0.5 text-sm" disabled={char.gold < POTIONS[k].price * 5} onClick={() => gameApi.op({ op: "buy_potion", kind: k, n: 5 })}>
                5 — {POTIONS[k].price * 5}
              </button>
            </div>
          ))}
        </div>
        <div>
          <h3 className="panel-title mb-2">Ваша сумка</h3>
          <Grid
            items={char.inventory}
            size={40}
            cols={8}
            from="inventory"
            onDrop={(pos, d) => d.from === "inventory" && d.uid && gameApi.op({ op: "move", from: "inventory", to: "inventory", uid: d.uid, pos })}
            onRight={(it) => sell(it.uid)}
            extra={(it) => `ПКМ — продать за ${itemValue(it)} зол.`}
          />
          <div
            className={`slot mt-2 flex items-center justify-center ${over ? "hot" : ""}`}
            style={{ width: 392, height: 44 }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              setOver(false);
              try {
                const d = JSON.parse(e.dataTransfer.getData("text/plain")) as DragData;
                if (d.from === "inventory" && d.uid) sell(d.uid);
              } catch { /* нет */ }
            }}
          >
            <span className="text-gold text-sm">Перетащите сюда, чтобы продать</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function BlacksmithPanel({ onClose }: { onClose: () => void }) {
  const { char } = useGame();
  const [sel, setSel] = useState<string | null>(null);
  if (!char) return null;
  const equipped = EQUIP_SLOTS.map((s) => char.equipment[s]).filter(Boolean) as Item[];
  const all = [...equipped, ...char.inventory];
  const it = all.find((x) => x.uid === sel) || equipped[0] || null;
  const cost = it ? upgradeCost(it) : null;
  const base = it ? BASE_BY_ID[it.base] : null;
  const next = it ? { ...it, upgrade: (it.upgrade || 0) + 1 } : null;
  return (
    <Panel title="Бруна, кузнец" onClose={onClose}>
      <div className="text-parch mb-3 text-sm">Заточка усиливает урон оружия (+10% за уровень) и броню доспехов (+12%). Максимум +5. Золото: <span className="text-gold">{char.gold}</span></div>
      <div className="flex flex-wrap gap-6">
        <div>
          <div className="text-dim mb-1 text-xs">Надето</div>
          <div className="mb-3 flex flex-wrap gap-1">
            {equipped.map((x) => (
              <div key={x.uid} onClick={() => setSel(x.uid)} className={it?.uid === x.uid ? "outline-2 outline-[#c9a46a]" : ""}>
                <ItemSlot item={x} />
              </div>
            ))}
          </div>
          <div className="text-dim mb-1 text-xs">В сумке</div>
          <div className="flex max-w-[420px] flex-wrap gap-1">
            {char.inventory.map((x) => (
              <div key={x.uid} onClick={() => setSel(x.uid)} className={it?.uid === x.uid ? "outline-2 outline-[#c9a46a]" : ""}>
                <ItemSlot item={x} />
              </div>
            ))}
          </div>
        </div>
        {it && base && next && (
          <div className="panel min-w-[240px] flex-1 p-3">
            <div style={{ color: RARITIES[it.rarity].color }}>{it.name} {it.upgrade ? `+${it.upgrade}` : ""}</div>
            {base.slot === "weapon" && (
              <div className="mt-1 text-sm">
                Урон: {weaponDamage(it).dmg[0]}–{weaponDamage(it).dmg[1]} → <span className="text-[#7fe07f]">{weaponDamage(next).dmg[0]}–{weaponDamage(next).dmg[1]}</span>
              </div>
            )}
            {base.armor ? (
              <div className="mt-1 text-sm">
                Броня: {Math.round(base.armor * (1 + 0.12 * (it.upgrade || 0)))} → <span className="text-[#7fe07f]">{Math.round(base.armor * (1 + 0.12 * (next.upgrade || 0)))}</span>
              </div>
            ) : null}
            {cost === null ? (
              <div className="text-gold mt-3">Заточено до предела.</div>
            ) : (
              <button className="btn btn-gold mt-3 w-full" disabled={char.gold < cost} onClick={() => { audio.play("block"); void gameApi.op({ op: "upgrade", uid: it.uid }); }}>
                Заточить за {cost} зол.
              </button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
