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
    <Panel title={`${char.name} — ${cls.name}`} onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <div className="text-gold text-lg">Уровень {char.level}</div>
        <Bar value={lv.into} max={lv.need} color="#c9a46a" label={`${lv.into} / ${lv.need} опыта`} className="flex-1 !h-4" />
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="w-[300px]">
          <h3 className="panel-title mb-2">Атрибуты {char.attrPoints > 0 && <span className="text-[#7fe07f]">(свободно: {char.attrPoints})</span>}</h3>
          {ATTR_IDS.map((a) => (
            <div key={a} className="mb-1.5 flex items-center gap-2" title={ATTR_HINTS[a]}>
              <div className="w-28">{ATTR_NAMES[a]}</div>
              <div className="w-10 text-right text-lg">{st.attrs[a]}</div>
              {st.attrs[a] !== char.attrs[a] && <div className="text-dim w-10 text-xs">({char.attrs[a]})</div>}
              <button className="btn ml-auto px-2 py-0" disabled={char.attrPoints <= 0 || inDungeon} onClick={() => gameApi.op({ op: "attr", attr: a })}>+</button>
            </div>
          ))}
          <div className="text-dim mt-2 text-xs">Наведите на атрибут, чтобы узнать, на что он влияет. {inDungeon ? "Очки распределяются в лагере." : ""}</div>
          {char.stats && (
            <div className="text-parch mt-4 text-sm">
              Спусков: {char.stats.runs} · убито: {char.stats.kills} · боссов: {char.stats.bosses} · смертей: {char.stats.deaths}
            </div>
          )}
        </div>
        <div className="flex-1">
          <h3 className="panel-title mb-2">Характеристики</h3>
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-[#2b221a] py-0.5 text-sm">
              <span className="text-parch">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
