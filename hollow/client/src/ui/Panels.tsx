import { useGame, DEFAULT_SETTINGS, type Settings } from "../store";
import { Panel } from "./common";
import { gameApi } from "./GameScreen";
import { useState } from "react";
import { ACTS, DUNGEON_BY_ID, EPILOGUE, NIGHTMARE_BONUS, QUESTS, STAGES, parseStage, stageLabel, stageUnlocked } from "@shared/data/dungeons";
import { ENEMIES } from "@shared/data/enemies";
import { audio } from "../game/audio";

export function QuestsPanel({ onClose }: { onClose: () => void }) {
  const { char } = useGame();
  if (!char) return null;
  const states = new Map(char.quests.map((q) => [q.id, q]));
  return (
    <Panel title="Доска поручений" onClose={onClose}>
      <div className="text-parch mb-3 text-sm">Отец Мирон: «Мёртвые не должны ходить. Помоги им лечь обратно — и церковь не забудет».</div>
      <div className="flex flex-col gap-2">
        {QUESTS.map((q) => {
          const st = states.get(q.id);
          const locked = char.level < q.minLevel;
          return (
            <div key={q.id} className={`panel p-2 ${locked ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <div className="panel-title">{q.name}</div>
                <div className="text-dim text-xs">{locked ? `с ${q.minLevel} уровня` : st?.claimed ? "выполнено" : st?.done ? "готово!" : `${st?.progress || 0}/${q.count}`}</div>
              </div>
              <div className="text-sm">{q.description}</div>
              <div className="flex items-center justify-between">
                <div className="text-gold text-xs">Награда: {q.reward.xp} опыта, {q.reward.gold} золота</div>
                {st?.done && !st.claimed && (
                  <button className="btn btn-gold px-2 py-0.5 text-sm" onClick={() => { audio.play("levelup"); void gameApi.op({ op: "quest_claim", id: q.id }); }}>
                    Получить
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-dim mt-2 text-xs">Прогресс засчитывается по итогам каждого спуска.</div>
    </Panel>
  );
}

/** Номер акта, до которого дошёл герой (последний открытый). */
export function currentAct(cleared: string[], nightmare = false) {
  let act = 1;
  for (const st of STAGES) if (stageUnlocked((nightmare ? "n:" : "") + st.id, cleared)) act = st.act;
  return act;
}

export function GatePanel({ onClose }: { onClose: () => void }) {
  const { char } = useGame();
  const nightmareOpen = !!char && char.cleared.includes("a5s3");
  const [nightmare, setNightmare] = useState(false);
  const [act, setAct] = useState(() => (char ? currentAct(char.cleared) : 1));
  if (!char) return null;
  const pref = nightmare ? "n:" : "";
  const A = ACTS[act - 1];
  const theme = DUNGEON_BY_ID[A.theme];
  const actOpen = (n: number) => STAGES.some((s) => s.act === n && stageUnlocked(pref + s.id, char.cleared));
  const doneCount = STAGES.filter((s) => char.cleared.includes(pref + s.id)).length;
  return (
    <Panel title="Врата Глубин" onClose={onClose}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {ACTS.map((a) => {
          const open = actOpen(a.n);
          const done = STAGES.filter((s) => s.act === a.n).every((s) => char.cleared.includes(pref + s.id));
          return (
            <button key={a.n} disabled={!open} className={`btn px-3 py-1 text-sm ${act === a.n ? "btn-gold" : ""}`} onClick={() => setAct(a.n)}>
              {a.name.split(".")[0]}{done ? " ✓" : open ? "" : " 🔒"}
            </button>
          );
        })}
        <div className="text-dim ml-auto text-xs">Пройдено этапов: {doneCount}/{STAGES.length}</div>
      </div>
      {nightmareOpen && (
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-[#e0505a]">
          <input type="checkbox" checked={nightmare} onChange={(e) => { setNightmare(e.target.checked); setAct(currentAct(char.cleared, e.target.checked)); }} />
          Кошмар: враги на {NIGHTMARE_BONUS} уровней сильнее, добыча лучше
        </label>
      )}
      <div className="panel mb-3 p-3" style={{ background: `linear-gradient(135deg, ${theme.palette.wall}55, ${theme.palette.fog})` }}>
        <div className="panel-title text-lg" style={{ color: theme.palette.light }}>{A.name}</div>
        <div className="text-parch mt-1 text-sm italic leading-5">{A.intro}</div>
      </div>
      <div className="flex flex-col gap-2">
        {STAGES.filter((s) => s.act === act).map((st) => {
          const key = pref + st.id;
          const open = stageUnlocked(key, char.cleared);
          const cleared = char.cleared.includes(key);
          const base = st.level + (nightmare ? NIGHTMARE_BONUS : 0);
          const lvl = Math.max(base, Math.min(char.level - 1, base + 3));
          const guard = st.champion ? `${st.champion.name} (${ENEMIES[st.boss].name.toLowerCase()})` : ENEMIES[st.boss].name;
          return (
            <div key={st.id} className={`panel flex gap-3 p-3 ${open ? "" : "opacity-50"}`}>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-[#3d3126] text-2xl" style={{ background: `linear-gradient(135deg, ${theme.palette.wall}, ${theme.palette.fog})`, color: st.champion ? theme.palette.light : "#ff5a4a" }}>
                {st.champion ? st.n : "☠"}
              </div>
              <div className="flex-1">
                <div className="panel-title">{st.n}. {st.name} {cleared && <span className="text-xs text-[#7fe07f]">· пройдено</span>}</div>
                <div className="text-sm">{st.description}</div>
                <div className="text-dim text-xs">
                  Уровень {lvl} · {st.champion ? "Страж" : "Хозяин акта"}: {guard}
                  {!open && st.unlock && ` · Сначала: «${STAGES.find((x) => x.id === st.unlock)!.name}»`}
                </div>
              </div>
              <button className="btn btn-red self-center" disabled={!open} onClick={() => { audio.play("portal"); void gameApi.startRun(key); }}>
                Спуститься
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-dim mt-2 text-xs">Этап засчитывается, когда страж убит и вы ушли через портал. Можно вернуться в любой пройденный этап за добычей.</div>
    </Panel>
  );
}

export function ResultsPanel({ onClose }: { onClose: () => void }) {
  const { results } = useGame();
  if (!results) return null;
  const r = results;
  // сюжет: конец акта (первое прохождение третьего этапа) или эпилог
  const p = parseStage(r.dungeon);
  let story: { title: string; text: string; next?: { title: string; text: string } } | null = null;
  if (p && r.firstClear && p.stage.n === 3 && !p.nightmare) {
    if (p.stage.act === 5) story = { title: EPILOGUE.title, text: EPILOGUE.text };
    else story = { title: `${ACTS[p.stage.act - 1].name} — конец`, text: ACTS[p.stage.act - 1].outro, next: { title: ACTS[p.stage.act].name, text: ACTS[p.stage.act].intro } };
  } else if (p && r.firstClear && p.nightmare && p.stage.id === "a5s3") {
    story = { title: "Кошмар пройден", text: "Пустота снова засыпает — на этот раз надолго. Колокол наверху звонит сам по себе, и Отец Мирон говорит, что такого не слышал никто из живых." };
  }
  return (
    <div className={`panel rise p-6 text-center ${story ? "w-[min(560px,94vw)]" : "w-[420px]"}`}>
      <div className={`logo text-4xl ${r.success ? "" : "text-[#c8343a]"}`}>{r.success ? "ВЫ ВЫБРАЛИСЬ" : "ВЫ ПАЛИ"}</div>
      <div className="text-parch mt-1">{stageLabel(r.dungeon)}</div>
      {r.pending ? (
        <div className="text-dim my-6">Сохраняем итоги…</div>
      ) : r.error ? (
        <div className="my-6 text-[#e0505a]">{r.error}</div>
      ) : (
        <div className="my-5 space-y-1 text-lg">
          <div>Опыт: <span className="text-gold">+{r.xp}</span>{!r.success && <span className="text-dim text-sm"> (половина — за смерть)</span>}</div>
          <div>Золото: <span className="text-gold">+{r.gold}</span></div>
          <div>Убито врагов: {r.kills}</div>
          <div>Подобрано вещей: {r.items}</div>
          {r.levels > 0 && <div className="text-[#7fe07f]">Новых уровней: {r.levels}!</div>}
          {r.success && r.cleared === false && <div className="text-dim text-sm">Страж этапа жив — этап не засчитан.</div>}
          {r.unlocked?.length ? <div className="text-[#8fd0ff]">Открыто: {r.unlocked.map((u) => stageLabel(u)).join(", ")}</div> : null}
        </div>
      )}
      {story && !r.pending && (
        <div className="mb-4 max-h-[40vh] overflow-y-auto text-left">
          <div className="panel-title mb-1 text-[#e8c4a0]">{story.title}</div>
          <div className="text-parch text-sm italic leading-5">{story.text}</div>
          {story.next && (
            <>
              <div className="panel-title mt-3 mb-1 text-[#8fd0ff]">{story.next.title}</div>
              <div className="text-parch text-sm italic leading-5">{story.next.text}</div>
            </>
          )}
          {p?.stage.act === 5 && <div className="text-gold mt-3 text-sm">Открыт режим «Кошмар» — у Врат Глубин.</div>}
        </div>
      )}
      <button className="btn btn-gold w-full py-2 text-lg" disabled={r.pending} onClick={onClose}>
        Вернуться в лагерь
      </button>
    </div>
  );
}

export function PausePanel({ onClose, onSettings, onHelp }: { onClose: () => void; onSettings: () => void; onHelp: () => void }) {
  const { hud, set } = useGame();
  const inDungeon = hud?.where === "dungeon";
  return (
    <div className="panel rise flex w-[320px] flex-col gap-2 p-6">
      <div className="logo mb-3 text-center text-5xl">ПАУЗА</div>
      <button className="btn py-2" onClick={onClose}>Продолжить</button>
      <button className="btn py-2" onClick={onSettings}>Настройки</button>
      <button className="btn py-2" onClick={onHelp}>Управление</button>
      {inDungeon ? (
        <button className="btn btn-red py-2" onClick={() => gameApi.game?.cb.runEnded(false)}>Сдаться (забег провален)</button>
      ) : (
        <button className="btn btn-red py-2" onClick={() => set({ screen: "select", char: null, panel: null, hud: null })}>К выбору героя</button>
      )}
      {inDungeon && <div className="text-dim text-center text-xs">Одиночная игра на паузе. Чтобы уйти без потерь, вернитесь к порталу входа.</div>}
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useGame();
  const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt?: (v: number) => string) => (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-48">{label}</span>
      <input type="range" min={min} max={max} step={step} value={settings[key] as number} onChange={(e) => setSettings({ [key]: Number(e.target.value) })} className="flex-1 accent-[#c9a46a]" />
      <span className="w-12 text-right">{fmt ? fmt(settings[key] as number) : String(settings[key])}</span>
    </label>
  );
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <Panel title="Настройки" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <h3 className="panel-title">Изображение</h3>
        {slider("brightness", "Яркость", 0.8, 2.2, 0.05, (v) => `${Math.round(v * 100)}%`)}
        {slider("vhs", "Сила эффекта VHS", 0, 1, 0.05, pct)}
        {slider("grain", "Зерно", 0, 1, 0.05, pct)}
        {slider("chroma", "Хроматическая аберрация", 0, 1, 0.05, pct)}
        {slider("scanlines", "Строки развёртки", 0, 1, 0.05, pct)}
        {slider("curve", "Изгиб кинескопа", 0, 1, 0.05, pct)}
        {slider("jitter", "Дрожание вершин (PS1)", 0, 1, 0.05, pct)}
        {slider("pixel", "Пикселизация", 0.5, 3, 0.25, (v) => `×${v}`)}
        {slider("resolution", "Разрешение рендера (строк)", 180, 720, 60)}
        {slider("fov", "Поле зрения", 55, 100, 1, (v) => `${v}°`)}
        <h3 className="panel-title mt-2">Управление</h3>
        {slider("sensitivity", "Чувствительность мыши", 0.2, 3, 0.05, (v) => v.toFixed(2))}
        <label className="flex items-center gap-3 text-sm">
          <span className="w-48">Инверсия по вертикали</span>
          <input type="checkbox" checked={settings.invertY} onChange={(e) => setSettings({ invertY: e.target.checked })} className="accent-[#c9a46a]" />
        </label>
        <label className="flex items-center gap-3 text-sm">
          <span className="w-48">Покачивание камеры</span>
          <input type="checkbox" checked={settings.bob} onChange={(e) => setSettings({ bob: e.target.checked })} className="accent-[#c9a46a]" />
        </label>
        <h3 className="panel-title mt-2">Звук</h3>
        {slider("volume", "Громкость", 0, 1, 0.05, pct)}
        {slider("music", "Музыка и фон", 0, 1, 0.05, pct)}
        <button className="btn mt-3 self-start" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>Сбросить</button>
      </div>
    </Panel>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["WASD", "движение"], ["Мышь", "обзор (кликните по экрану, чтобы захватить указатель)"], ["Стрелки", "поворот и наклон взгляда без мыши"], ["Shift", "бег (тратит выносливость)"],
    ["Пробел", "уклонение — короткий рывок с неуязвимостью"], ["ЛКМ", "атака; зажать и отпустить — сильный удар; лук — натянуть и отпустить; посох/жезл — заряд"],
    ["ПКМ", "блок щитом или оружием (в начале блока — парирование), у магов — магический заслон, у лучника — прицел"],
    ["Q / R / F", "навыки из книги навыков"], ["1 / 2", "зелье здоровья / маны"], ["E", "действие: поднять, открыть, поговорить, осмотреть стену"],
    ["I", "сумка и снаряжение"], ["C", "персонаж и атрибуты"], ["B", "книга навыков"], ["M / Tab", "карта"], ["Esc", "пауза"],
  ];
  return (
    <Panel title="Управление и советы" onClose={onClose}>
      <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-gold">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="text-parch mt-4 space-y-1 text-sm">
        <div>• Враги заносят оружие перед ударом — это время, чтобы отпрыгнуть или поднять щит.</div>
        <div>• Красные круги и полосы на полу — куда ударит босс. Уходите из них.</div>
        <div>• Треснувшая кладка звучит пусто: осмотрите её (E), за ней бывает тайник.</div>
        <div>• Нежить слаба к святому урону. Проклятые вещи сильнее обычных, но с изъяном.</div>
        <div>• Предметы сохраняются на сервере сразу при подборе, опыт и золото — по итогам спуска.</div>
      </div>
    </Panel>
  );
}

export function NotePanel({ onClose }: { onClose: () => void }) {
  const { note } = useGame();
  if (!note) return null;
  return (
    <div className="rise relative w-[min(460px,92vw)] p-7 text-[#2a1a0e]" style={{ background: "linear-gradient(#cdbf98, #b8a67c)", boxShadow: "inset 0 0 40px #6a4a2a88, 0 8px 0 #00000080", clipPath: "polygon(0 2%, 4% 0, 30% 1%, 62% 0, 97% 2%, 100% 30%, 99% 70%, 100% 97%, 70% 100%, 35% 99%, 3% 100%, 0 70%, 1% 35%)" }}>
      <div className="mb-3 text-center text-lg" style={{ fontFamily: "var(--font-head)" }}>{note.title}</div>
      <div className="text-[15px] leading-6">{note.text}</div>
      <button className="btn mt-5 w-full" onClick={onClose}>Убрать записку [E / Esc]</button>
    </div>
  );
}
