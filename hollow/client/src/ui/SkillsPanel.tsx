import { useState } from "react";
import { useGame } from "../store";
import { Panel } from "./common";
import { gameApi } from "./GameScreen";
import { canLearn, skillsOf, SKILL_BY_ID, TREES, TIER_LEVELS, synergyMult, type SkillDef } from "@shared/data/skills";
import { skillIcon } from "./icons";
import { audio } from "../game/audio";

export const HOTKEYS = ["Q", "R", "F", "G", "Z", "X"];

/** Цена сброса навыков у Отца Мирона. */
export const respecCost = (level: number) => 40 + level * level * 6;

const CELL_W = 118, CELL_H = 96;

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const { char, hud } = useGame();
  const skills = char ? skillsOf(char.cls) : [];
  const [tab, setTab] = useState(0);
  const [hover, setHover] = useState<SkillDef | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!char) return null;
  const inDungeon = hud?.where === "dungeon";
  const list = skills.filter((s) => s.tree === tab);
  const info = hover && hover.cls === char.cls ? hover : list[0];
  const rank = char.skills[info.id] || 0;
  const why = canLearn(info, char.level, char.skills, char.skillPoints);
  const spentIn = (t: number) => skills.filter((s) => s.tree === t).reduce((a, s) => a + (char.skills[s.id] || 0), 0);
  const totalSpent = skills.reduce((a, s) => a + (char.skills[s.id] || 0), 0);
  const cost = respecCost(char.level);
  const syn = synergyMult(info, char.skills);
  return (
    <Panel title="Книга навыков" onClose={onClose} wide>
      <div className="text-parch mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>Свободных очков: <span className={char.skillPoints ? "text-[#7fe07f]" : ""}>{char.skillPoints}</span></span>
        <span className="text-dim">Активные навыки — на {HOTKEYS.join(", ")}. Очки: 2 за уровень.</span>
        {inDungeon && <span className="text-[#e0a84a]">Изучать навыки можно в лагере.</span>}
      </div>
      <div className="mb-3 flex gap-1">
        {TREES[char.cls].map((name, i) => (
          <button key={name} className={`btn px-3 py-1 text-sm ${tab === i ? "btn-gold" : ""}`} onClick={() => { setTab(i); setHover(null); }}>
            {name} <span className="text-dim text-xs">({spentIn(i)})</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-5">
        <div className="relative shrink-0" style={{ width: CELL_W * 3, height: CELL_H * 6 }}>
          {/* стрелки требований */}
          <svg className="pointer-events-none absolute inset-0" width={CELL_W * 3} height={CELL_H * 6}>
            {list.flatMap((s) =>
              (s.requires || []).map((r) => {
                const o = SKILL_BY_ID[r.id];
                if (!o || o.tree !== tab) return null;
                const x1 = o.col * CELL_W + CELL_W / 2, y1 = o.tier * CELL_H + 52;
                const x2 = s.col * CELL_W + CELL_W / 2, y2 = s.tier * CELL_H + 2;
                const ok = (char.skills[r.id] || 0) >= r.rank;
                return <line key={s.id + r.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ok ? "#c9a46a" : "#4a3d30"} strokeWidth={2} strokeDasharray={ok ? undefined : "4 3"} />;
              }),
            )}
          </svg>
          {TIER_LEVELS.map((lv, t) => (
            <div key={lv} className="text-dim absolute left-0 text-[9px]" style={{ top: t * CELL_H - 2 }}>{lv}</div>
          ))}
          {list.map((s) => {
            const r = char.skills[s.id] || 0;
            const can = !canLearn(s, char.level, char.skills, char.skillPoints) && !inDungeon;
            const locked = char.level < s.reqLevel;
            return (
              <div key={s.id} className="absolute flex flex-col items-center" style={{ left: s.col * CELL_W, top: s.tier * CELL_H, width: CELL_W }} onMouseEnter={() => setHover(s)}>
                <div className={`slot ${info.id === s.id ? "hot" : ""}`} style={{ width: 50, height: 50, filter: r ? "none" : locked ? "grayscale(1) brightness(0.4)" : "grayscale(0.7) brightness(0.65)" }}>
                  <img src={skillIcon(s.icon)} alt="" />
                  <span className="absolute right-0.5 bottom-0 text-xs [text-shadow:1px_1px_0_#000]">{r}/{s.maxRank}</span>
                  {s.kind === "passive" && <span className="absolute top-0 left-0.5 text-[9px] text-[#8fb0e0] [text-shadow:1px_1px_0_#000]">П</span>}
                </div>
                <div className="mt-0.5 max-w-[112px] truncate text-center text-[11px] leading-tight">{s.name}</div>
                <div className="flex gap-0.5">
                  <button className="btn px-1.5 py-0 text-xs" disabled={!can} onClick={() => gameApi.op({ op: "skill", id: s.id })}>+</button>
                  {s.kind === "active" && r > 0 && !inDungeon && (
                    <select
                      className="field !w-auto !px-0.5 !py-0 text-[10px]"
                      value={char.hotbar.indexOf(s.id)}
                      onChange={(e) => { const v = Number(e.target.value); if (v >= 0) void gameApi.op({ op: "hotbar", slot: v, id: s.id }); }}
                    >
                      <option value={-1}>—</option>
                      {HOTKEYS.map((k, i) => <option key={k} value={i}>{k}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex min-w-[260px] flex-1 flex-col gap-2">
          <div className="panel p-3">
            <div className="panel-title text-lg">{info.name}</div>
            <div className="text-dim mb-2 text-xs">
              {TREES[char.cls][info.tree]} · {info.kind === "passive" ? "пассивный" : `перезарядка ${info.cooldown || 0} с${info.cost?.mana ? ` · ${info.cost.mana} маны` : ""}${info.cost?.stamina ? ` · ${info.cost.stamina} выносливости` : ""}`} · с {info.reqLevel} уровня
            </div>
            <div className="mb-2 text-sm">{info.description}</div>
            <div className="text-sm">Ранг {rank}/{info.maxRank}</div>
            {rank > 0 && <div className="text-sm text-[#8fb0e0]">Сейчас: {info.rankText(rank)}</div>}
            {rank < info.maxRank && <div className="text-sm text-[#7fe07f]">След. ранг: {info.rankText(rank + 1)}</div>}
            {info.requires?.map((r) => (
              <div key={r.id} className={`text-xs ${(char.skills[r.id] || 0) >= r.rank ? "text-dim" : "text-[#e0505a]"}`}>
                Требуется: {SKILL_BY_ID[r.id].name} {r.rank}
              </div>
            ))}
            {info.synergies?.length ? (
              <div className="mt-2 text-xs">
                <div className="text-gold">Синергии (сейчас +{Math.round((syn - 1) * 100)}% урона):</div>
                {info.synergies.map((sy) => (
                  <div key={sy.id} className="text-dim">+{Math.round(sy.pct * 100)}% за ранг «{SKILL_BY_ID[sy.id].name}» ({char.skills[sy.id] || 0})</div>
                ))}
              </div>
            ) : null}
            {why && rank < info.maxRank && <div className="text-dim mt-2 text-xs">{why}</div>}
          </div>
          {!inDungeon && totalSpent > 0 && (
            <div className="panel p-3 text-sm">
              <div className="panel-title mb-1">Забыть навыки</div>
              <div className="text-dim mb-2 text-xs">Отец Мирон очистит память: все {totalSpent} очков вернутся. Цена — {cost} золота.</div>
              {!confirm ? (
                <button className="btn w-full py-1 text-sm" disabled={char.gold < cost} onClick={() => setConfirm(true)}>Сбросить за {cost} зол.</button>
              ) : (
                <div className="flex gap-2">
                  <button className="btn btn-red flex-1 py-1 text-sm" onClick={() => { setConfirm(false); audio.play("shrine"); void gameApi.op({ op: "respec" }); }}>Да, сбросить</button>
                  <button className="btn flex-1 py-1 text-sm" onClick={() => setConfirm(false)}>Отмена</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
