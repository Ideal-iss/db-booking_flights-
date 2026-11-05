import { useState } from "react";
import { useGame } from "../store";
import { Panel } from "./common";
import { gameApi } from "./GameScreen";
import { canLearn, skillsOf, SKILL_BY_ID, type SkillDef } from "@shared/data/skills";
import { skillIcon } from "./icons";

export function SkillsPanel({ onClose }: { onClose: () => void }) {
  const { char, hud } = useGame();
  const [hover, setHover] = useState<SkillDef | null>(null);
  if (!char) return null;
  const skills = skillsOf(char.cls);
  const inDungeon = hud?.where === "dungeon";
  const tiers = [0, 1, 2, 3];
  const info = hover || skills[0];
  const rank = char.skills[info.id] || 0;
  const why = canLearn(info, char.level, char.skills, char.skillPoints);
  return (
    <Panel title="Книга навыков" onClose={onClose} wide>
      <div className="text-parch mb-3 text-sm">
        Свободных очков: <span className={char.skillPoints ? "text-[#7fe07f]" : ""}>{char.skillPoints}</span> · Активные навыки назначаются на Q, R, F.
        {inDungeon && " Изучать навыки можно в лагере."}
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="relative grid gap-x-10 gap-y-6" style={{ gridTemplateColumns: "repeat(3, 120px)" }}>
          {tiers.map((tier) =>
            [0, 1, 2].map((col) => {
              const s = skills.find((x) => x.tier === tier && x.col === col);
              if (!s) return <div key={`${tier}-${col}`} />;
              const r = char.skills[s.id] || 0;
              const can = !canLearn(s, char.level, char.skills, char.skillPoints) && !inDungeon;
              return (
                <div key={s.id} className="flex flex-col items-center" style={{ gridRow: tier + 1, gridColumn: col + 1 }} onMouseEnter={() => setHover(s)}>
                  <div className={`slot ${hover?.id === s.id ? "hot" : ""}`} style={{ width: 56, height: 56, filter: r ? "none" : "grayscale(0.8) brightness(0.6)" }}>
                    <img src={skillIcon(s.icon)} alt="" />
                    <span className="absolute right-0.5 bottom-0 text-xs [text-shadow:1px_1px_0_#000]">{r}/{s.maxRank}</span>
                  </div>
                  <div className="mt-0.5 text-center text-xs leading-tight">{s.name}</div>
                  <div className="text-dim text-[10px]">{s.kind === "passive" ? "пассивный" : `ур. ${s.reqLevel}`}</div>
                  <div className="mt-1 flex gap-1">
                    <button className="btn px-1.5 py-0 text-xs" disabled={!can} onClick={() => gameApi.op({ op: "skill", id: s.id })}>+</button>
                    {s.kind === "active" && r > 0 && !inDungeon &&
                      ["Q", "R", "F"].map((k, i) => (
                        <button key={k} className={`btn px-1 py-0 text-[10px] ${char.hotbar[i] === s.id ? "btn-gold" : ""}`} onClick={() => gameApi.op({ op: "hotbar", slot: i, id: s.id })}>
                          {k}
                        </button>
                      ))}
                  </div>
                </div>
              );
            }),
          )}
        </div>
        <div className="panel min-w-[280px] flex-1 p-3">
          <div className="panel-title text-lg">{info.name}</div>
          <div className="text-dim mb-2 text-xs">
            {info.kind === "passive" ? "Пассивный навык" : `Активный · перезарядка ${info.cooldown || 0} с${info.cost?.mana ? ` · ${info.cost.mana} маны` : ""}${info.cost?.stamina ? ` · ${info.cost.stamina} выносливости` : ""}`}
          </div>
          <div className="mb-2">{info.description}</div>
          <div className="text-sm">Ранг {rank}/{info.maxRank}</div>
          {rank > 0 && <div className="text-sm text-[#8fb0e0]">Сейчас: {info.rankText(rank)}</div>}
          {rank < info.maxRank && <div className="text-sm text-[#7fe07f]">След. ранг: {info.rankText(rank + 1)}</div>}
          {info.requires?.map((r) => (
            <div key={r.id} className={`text-xs ${(char.skills[r.id] || 0) >= r.rank ? "text-dim" : "text-[#e0505a]"}`}>
              Требуется: {SKILL_BY_ID[r.id].name} {r.rank}
            </div>
          ))}
          {why && rank < info.maxRank && <div className="text-dim mt-2 text-xs">{why}</div>}
        </div>
      </div>
    </Panel>
  );
}
