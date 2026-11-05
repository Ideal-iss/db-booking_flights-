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

const CELL_W = 120, CELL_H = 92;

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const { char, hud } = useGame();
  const skills = char ? skillsOf(char.cls) : [];
  const [tab, setTab] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!char) return null;
  const inDungeon = hud?.where === "dungeon";
  const list = skills.filter((s) => s.tree === tab);
  const info = (selId && SKILL_BY_ID[selId]?.cls === char.cls && SKILL_BY_ID[selId]) || list[0];
  const rank = char.skills[info.id] || 0;
  const why = canLearn(info, char.level, char.skills, char.skillPoints);
  const canNow = !why && !inDungeon;
  const spentIn = (t: number) => skills.filter((s) => s.tree === t).reduce((a, s) => a + (char.skills[s.id] || 0), 0);
  const totalSpent = skills.reduce((a, s) => a + (char.skills[s.id] || 0), 0);
  const cost = respecCost(char.level);
  const syn = synergyMult(info, char.skills);
  const learn = (s: SkillDef) => {
    if (canLearn(s, char.level, char.skills, char.skillPoints) || inDungeon) return;
    audio.play("click");
    void gameApi.op({ op: "skill", id: s.id });
  };
  return (
    <Panel title="Книга навыков" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex gap-1">
          {TREES[char.cls].map((name, i) => (
            <button key={name} className={`btn ${tab === i ? "is-on" : ""}`} onClick={() => { setTab(i); setSelId(null); }}>
              {name}
              <span className="text-dim text-xs">{spentIn(i)}</span>
            </button>
          ))}
        </div>
        <div className="text-sm">
          <span className="text-parch">Свободных очков </span>
          <span className={char.skillPoints ? "text-flame" : ""}>{char.skillPoints}</span>
        </div>
        {inDungeon && <div className="text-dim text-xs">Изучать навыки можно в лагере</div>}
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="relative shrink-0" style={{ width: CELL_W * 3 + 24, height: CELL_H * 6 }}>
          <svg className="pointer-events-none absolute inset-0" width={CELL_W * 3 + 24} height={CELL_H * 6}>
            {list.flatMap((s) =>
              (s.requires || []).map((r) => {
                const o = SKILL_BY_ID[r.id];
                if (!o || o.tree !== tab) return null;
                const x1 = 24 + o.col * CELL_W + CELL_W / 2, y1 = o.tier * CELL_H + 52;
                const x2 = 24 + s.col * CELL_W + CELL_W / 2, y2 = s.tier * CELL_H + 4;
                const ok = (char.skills[r.id] || 0) >= r.rank;
                return <line key={s.id + r.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ok ? "#efe9de66" : "#efe9de1f"} strokeWidth={1} />;
              }),
            )}
          </svg>
          {TIER_LEVELS.map((lv, t) => (
            <div key={lv} className="text-dim absolute left-0 w-5 text-right text-[11px]" style={{ top: t * CELL_H + 16 }}>{lv}</div>
          ))}
          {list.map((s) => {
            const r = char.skills[s.id] || 0;
            const locked = char.level < s.reqLevel;
            const learnable = !canLearn(s, char.level, char.skills, char.skillPoints) && !inDungeon;
            const selected = info.id === s.id;
            const key = char.hotbar.indexOf(s.id);
            return (
              <button
                key={s.id}
                className="group absolute flex flex-col items-center gap-1"
                style={{ left: 24 + s.col * CELL_W, top: s.tier * CELL_H + 4, width: CELL_W }}
                onClick={() => { setSelId(s.id); setConfirm(false); }}
                onDoubleClick={() => learn(s)}
              >
                <div className={`slot transition-colors ${selected ? "hot" : "group-hover:border-[#efe9de40]"}`} style={{ width: 48, height: 48 }}>
                  <img src={skillIcon(s.icon)} alt="" style={{ filter: r ? "none" : locked ? "grayscale(1) brightness(0.35)" : "grayscale(0.8) brightness(0.6)" }} />
                  {key >= 0 && <span className="kbd absolute top-0.5 left-0.5 !h-4 !min-w-4 !px-0.5 !text-[10px]">{HOTKEYS[key]}</span>}
                  {learnable && <span className="bg-flame absolute top-1 right-1 h-1.5 w-1.5 rounded-full" />}
                </div>
                <div className={`max-w-[112px] truncate text-center text-xs ${r ? "text-bone" : "text-parch"}`}>{s.name}</div>
                <div className="text-dim text-[11px] leading-none">{r} из {s.maxRank}</div>
              </button>
            );
          })}
        </div>
        <div className="flex min-w-[280px] flex-1 flex-col gap-4">
          <div className="panel flex flex-col gap-4 p-4">
            <div>
              <div className="font-[family-name:var(--font-head)] text-[24px] leading-7 font-semibold">{info.name}</div>
              <div className="text-dim mt-1 text-xs">
                {TREES[char.cls][info.tree]} · {info.kind === "passive" ? "пассивный" : `перезарядка ${info.cooldown || 0} с${info.cost?.mana ? ` · ${info.cost.mana} маны` : ""}${info.cost?.stamina ? ` · ${info.cost.stamina} выносливости` : ""}`} · с {info.reqLevel} уровня
              </div>
            </div>
            <p className="text-parch text-sm">{info.description}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-dim">Ранг</dt><dd>{rank} из {info.maxRank}</dd>
              {rank > 0 && (<><dt className="text-dim">Сейчас</dt><dd>{info.rankText(rank)}</dd></>)}
              {rank < info.maxRank && (<><dt className="text-dim">Дальше</dt><dd className="text-parch">{info.rankText(rank + 1)}</dd></>)}
            </dl>
            {(info.requires?.length || info.synergies?.length) ? (
              <div className="flex flex-col gap-1 text-xs">
                {info.requires?.map((r) => (
                  <div key={r.id} className={(char.skills[r.id] || 0) >= r.rank ? "text-dim" : "text-bad"}>
                    Требуется «{SKILL_BY_ID[r.id].name}» {r.rank}
                  </div>
                ))}
                {info.synergies?.length ? (
                  <>
                    <div className="text-parch mt-1">Синергии, сейчас +{Math.round((syn - 1) * 100)}% урона</div>
                    {info.synergies.map((sy) => (
                      <div key={sy.id} className="text-dim">+{Math.round(sy.pct * 100)}% за ранг «{SKILL_BY_ID[sy.id].name}», у вас {char.skills[sy.id] || 0}</div>
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
            {rank < info.maxRank && (
              <button className={`btn h-10 ${canNow ? "btn-primary" : ""}`} disabled={!canNow} onClick={() => learn(info)}>
                {canNow ? (rank ? "Повысить ранг" : "Изучить") : inDungeon ? "Изучить можно в лагере" : why}
              </button>
            )}
            {info.kind === "active" && rank > 0 && !inDungeon && (
              <div className="flex flex-col gap-2">
                <div className="label">Клавиша</div>
                <div className="flex gap-1">
                  {HOTKEYS.map((k, i) => (
                    <button key={k} className={`btn w-9 px-0 ${char.hotbar[i] === info.id ? "is-on" : ""}`} onClick={() => gameApi.op({ op: "hotbar", slot: i, id: info.id })}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {!inDungeon && totalSpent > 0 && (
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-dim">Забыть все навыки и вернуть {totalSpent} очков</span>
              {!confirm ? (
                <button className="btn shrink-0" disabled={char.gold < cost} onClick={() => setConfirm(true)}>За {cost.toLocaleString("ru-RU")} зол.</button>
              ) : (
                <div className="flex shrink-0 gap-2">
                  <button className="btn btn-danger" onClick={() => { setConfirm(false); audio.play("shrine"); void gameApi.op({ op: "respec" }); }}>Забыть</button>
                  <button className="btn" onClick={() => setConfirm(false)}>Отмена</button>
                </div>
              )}
            </div>
          )}
          <p className="text-dim text-xs">Двойной клик по навыку изучает его. Точка в углу значит, что навык можно изучить сейчас</p>
        </div>
      </div>
    </Panel>
  );
}
