import { useGame } from "../store";
import { Panel, fmt } from "./common";
import { gameApi } from "./GameScreen";
import { ATTR_HINTS, ATTR_IDS, ATTR_NAMES, CLASSES } from "@shared/data/classes";
import { deriveStats, levelFromXp } from "@shared/data/stats";
import { Bar } from "./common";

export function CharacterPanel({ onClose }: { onClose: () => void }) {
  const { char, hud } = useGame();
  if (!char) return null;
  const st = deriveStats(char);
  const lv = levelFromXp(char.xp);
  const cls = CLASSES[char.cls];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: [string, string][] = [
    ["Здоровье", `${st.maxHp} (+${fmt(st.hpRegen)}/с)`],
    ["Мана", `${st.maxMana} (+${fmt(st.manaRegen)}/с)`],
    ["Выносливость", `${st.maxStamina} (+${fmt(st.staminaRegen)}/с)`],
    ["Урон оружием", `${st.dmg[0]}–${st.dmg[1]}`],
    ["Сила чар", `${st.spell[0]}–${st.spell[1]}`],
    ["Скорость атаки", fmt(st.attackSpeed)],
    ["Шанс крита", pct(st.critChance)],
    ["Урон крита", `×${fmt(st.critDmg)}`],
    ["Броня", `${st.armor} (−${pct(st.damageReduction)} урона)`],
    ["Блок", pct(st.block)],
    ["Окно парирования", `${Math.round(st.parryWindow * 1000)} мс`],
    ["Уклонение", pct(st.dodge)],
    ["Огонь / холод / тьма", `${pct(st.resFire)} / ${pct(st.resCold)} / ${pct(st.resDark)}`],
    ["Вампиризм", pct(st.lifeSteal)],
    ["Урон по нежити", `+${pct(st.undeadPct)}`],
    ["Скорость бега", fmt(st.moveSpeed)],
  ];
  const inDungeon = hud?.where === "dungeon";
  return (
    <Panel title={`${char.name}, ${cls.name.toLowerCase()}`} onClose={onClose}>
      <div className="mb-6 flex items-center gap-4">
        <div className="text-lg">Уровень {char.level}</div>
        <Bar value={lv.into} max={lv.need} color="#e3a45a" className="flex-1 !h-1.5" />
        <div className="text-dim text-xs">{lv.into.toLocaleString("ru-RU")} из {lv.need.toLocaleString("ru-RU")} опыта</div>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="w-[300px]">
          <h3 className="label mb-3">Атрибуты{char.attrPoints > 0 && <span className="text-flame"> · свободно {char.attrPoints}</span>}</h3>
          {ATTR_IDS.map((a) => (
            <div key={a} className="flex h-10 items-center gap-3" title={ATTR_HINTS[a]}>
              <div className="text-parch w-32">{ATTR_NAMES[a]}</div>
              <div className="w-10 text-right text-lg">{st.attrs[a]}</div>
              {st.attrs[a] !== char.attrs[a] && <div className="text-dim text-xs">база {char.attrs[a]}</div>}
              <button className="btn ml-auto w-8 px-0" aria-label={`Повысить: ${ATTR_NAMES[a]}`} disabled={char.attrPoints <= 0 || inDungeon} onClick={() => gameApi.op({ op: "attr", attr: a })}>+</button>
            </div>
          ))}
          <p className="text-dim mt-3 text-xs">Наведите на атрибут, чтобы узнать, на что он влияет{inDungeon ? ". Очки распределяются в лагере" : ""}</p>
          {char.stats && (
            <div className="text-dim mt-6 text-xs">
              Спусков {char.stats.runs} · убито {char.stats.kills} · боссов {char.stats.bosses} · смертей {char.stats.deaths}
            </div>
          )}
        </div>
        <div className="flex-1">
          <h3 className="label mb-3">Характеристики</h3>
          {rows.map(([k, v]) => (
            <div key={k} className="flex h-7 items-center justify-between border-b border-line text-sm">
              <span className="text-parch">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
