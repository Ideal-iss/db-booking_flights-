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
      <p className="text-parch mb-4 font-[family-name:var(--font-head)] text-lg leading-6">«Мёртвые не должны ходить. Помоги им лечь обратно, и церковь не забудет». Отец Мирон</p>
      <div className="flex flex-col gap-2">
        {QUESTS.map((q) => {
          const st = states.get(q.id);
          const locked = char.level < q.minLevel;
          return (
            <div key={q.id} className={`panel flex items-center gap-4 p-4 ${locked ? "opacity-50" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium">{q.name}</div>
                  <div className={`text-xs ${st?.done && !st.claimed ? "text-flame" : "text-dim"}`}>{locked ? `с ${q.minLevel} уровня` : st?.claimed ? "выполнено" : st?.done ? "готово" : `${st?.progress || 0} из ${q.count}`}</div>
                </div>
                <div className="text-parch text-sm">{q.description}</div>
                <div className="text-dim mt-1 text-xs">Награда {q.reward.xp.toLocaleString("ru-RU")} опыта и {q.reward.gold.toLocaleString("ru-RU")} золота</div>
              </div>
              {st?.done && !st.claimed && (
                <button className="btn btn-primary shrink-0" onClick={() => { audio.play("levelup"); void gameApi.op({ op: "quest_claim", id: q.id }); }}>
                  Получить
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-dim mt-4 text-xs">Прогресс засчитывается по итогам каждого спуска</p>
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
      <div className="mb-4 flex flex-wrap items-center gap-1">
        {ACTS.map((a) => {
          const open = actOpen(a.n);
          const done = STAGES.filter((s) => s.act === a.n).every((s) => char.cleared.includes(pref + s.id));
          return (
            <button key={a.n} disabled={!open} className={`btn ${act === a.n ? "is-on" : ""}`} onClick={() => setAct(a.n)}>
              {a.name.split(".")[0]}
              {done && <span className="text-good text-xs">✓</span>}
            </button>
          );
        })}
        <div className="text-dim ml-auto text-xs">{doneCount} из {STAGES.length} этапов</div>
      </div>
      {nightmareOpen && (
        <label className="text-parch mb-4 flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#e3a45a]" checked={nightmare} onChange={(e) => { setNightmare(e.target.checked); setAct(currentAct(char.cleared, e.target.checked)); }} />
          Кошмар: враги на {NIGHTMARE_BONUS} уровней сильнее, добыча лучше
        </label>
      )}
      <div className="mb-4 border-l-2 pl-4" style={{ borderColor: theme.palette.light }}>
        <div className="font-[family-name:var(--font-head)] text-[22px] leading-7 font-semibold">{A.name}</div>
        <p className="text-parch mt-1 font-[family-name:var(--font-head)] text-[17px] leading-6">{A.intro}</p>
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
            <div key={st.id} className={`panel flex items-center gap-4 p-4 ${open ? "" : "opacity-50"}`}>
              <div className="text-dim w-6 shrink-0 text-center font-[family-name:var(--font-head)] text-[28px] leading-none">{st.n}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="font-medium">{st.name}</span>
                  {cleared && <span className="text-good text-xs">пройдено</span>}
                </div>
                <div className="text-parch text-sm">{st.description}</div>
                <div className="text-dim mt-1 text-xs">
                  Ур. {lvl} · {st.champion ? "страж" : "хозяин акта"} {guard}
                  {!open && st.unlock && ` · сначала «${STAGES.find((x) => x.id === st.unlock)!.name}»`}
                </div>
              </div>
              <button className={`btn shrink-0 ${open ? "btn-primary" : ""}`} disabled={!open} onClick={() => { audio.play("portal"); void gameApi.startRun(key); }}>
                Спуститься
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-dim mt-4 text-xs">Этап засчитывается, когда страж убит и вы ушли через портал. В пройденные этапы можно возвращаться за добычей</p>
    </Panel>
  );
}

export function ResultsPanel({ onClose, onNext }: { onClose: () => void; onNext: (key: string) => void }) {
  const { results, char } = useGame();
  if (!results) return null;
  const r = results;
  // быстрый переход: следующий этап (если открыт) или ещё раз этот же
  const pr = parseStage(r.dungeon);
  let next: string | null = null;
  if (pr && char) {
    const pref = pr.nightmare ? "n:" : "";
    const idx = STAGES.findIndex((s) => s.id === pr.stage.id);
    const cand = STAGES[idx + 1];
    if (cand && stageUnlocked(pref + cand.id, char.cleared)) next = pref + cand.id;
  }
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
    <div className={`panel rise p-6 ${story ? "w-[min(560px,94vw)]" : "w-[440px]"}`}>
      <div className={`font-[family-name:var(--font-head)] text-[40px] leading-none font-semibold ${r.success ? "text-bone" : "text-[#e5484d]"}`}>{r.success ? "Вы выбрались" : "Вы пали"}</div>
      <div className="text-parch mt-2 text-sm">{stageLabel(r.dungeon)}</div>
      {r.pending ? (
        <div className="text-dim my-6">Сохраняем итоги</div>
      ) : r.error ? (
        <div className="text-bad my-6">{r.error}</div>
      ) : (
        <>
          <dl className="my-6 grid grid-cols-2 gap-x-6 gap-y-4">
            <div><dt className="label">Опыт</dt><dd className="text-[28px] leading-8">+{r.xp.toLocaleString("ru-RU")}</dd>{!r.success && <dd className="text-dim text-xs">половина за смерть</dd>}</div>
            <div><dt className="label">Золото</dt><dd className="text-[28px] leading-8">+{r.gold.toLocaleString("ru-RU")}</dd></div>
            <div><dt className="label">Убито врагов</dt><dd className="text-lg">{r.kills}</dd></div>
            <div><dt className="label">Подобрано вещей</dt><dd className="text-lg">{r.items}</dd></div>
          </dl>
          <div className="flex flex-col gap-1 text-sm">
            {r.levels > 0 && <div className="text-good">Новый уровень{r.levels > 1 ? ` ×${r.levels}` : ""}</div>}
            {r.success && r.cleared === false && <div className="text-dim">Страж этапа жив, этап не засчитан</div>}
            {r.unlocked?.length ? <div className="text-parch">Открыто: {r.unlocked.map((u) => stageLabel(u)).join(", ")}</div> : null}
          </div>
        </>
      )}
      {story && !r.pending && (
        <div className="mt-6 max-h-[40vh] overflow-y-auto border-t border-line pt-4 pr-1">
          <div className="font-[family-name:var(--font-head)] text-[22px] leading-7 font-semibold">{story.title}</div>
          <p className="text-parch mt-1 font-[family-name:var(--font-head)] text-[17px] leading-6">{story.text}</p>
          {story.next && (
            <>
              <div className="mt-4 font-[family-name:var(--font-head)] text-[22px] leading-7 font-semibold">{story.next.title}</div>
              <p className="text-parch mt-1 font-[family-name:var(--font-head)] text-[17px] leading-6">{story.next.text}</p>
            </>
          )}
          {p?.stage.act === 5 && <div className="text-flame mt-4 text-sm">У Врат Глубин открыт режим «Кошмар»</div>}
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2">
        {!r.pending && pr && (
          <div className="flex gap-2">
            {next && (
              <button className="btn btn-primary h-11 flex-1" onClick={() => onNext(next!)}>
                Дальше: {STAGES.find((s) => s.id === next!.replace("n:", ""))?.name}
              </button>
            )}
            <button className={`btn h-11 ${next ? "" : "flex-1"}`} onClick={() => onNext(r.dungeon)}>Ещё раз</button>
          </div>
        )}
        <button className={`btn h-11 w-full ${!next || r.pending ? "" : ""}`} disabled={r.pending} onClick={onClose}>
          Вернуться в лагерь
        </button>
      </div>
    </div>
  );
}

export function PausePanel({ onClose, onSettings, onHelp }: { onClose: () => void; onSettings: () => void; onHelp: () => void }) {
  const { hud, set } = useGame();
  const inDungeon = hud?.where === "dungeon";
  return (
    <div className="panel rise flex w-[320px] flex-col gap-2 p-6">
      <div className="panel-title mb-4">Пауза</div>
      <button className="btn btn-primary h-11" onClick={onClose}>Продолжить</button>
      <button className="btn h-11" onClick={onSettings}>Настройки</button>
      <button className="btn h-11" onClick={onHelp}>Управление</button>
      {inDungeon ? (
        <button className="btn btn-danger h-11" onClick={() => gameApi.game?.cb.runEnded(false)}>Сдаться, забег провален</button>
      ) : (
        <button className="btn h-11" onClick={() => set({ screen: "select", char: null, panel: null, hud: null })}>К выбору героя</button>
      )}
      {inDungeon && <p className="text-dim mt-2 text-xs">Чтобы уйти без потерь, вернитесь к порталу входа</p>}
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useGame();
  const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, fmt?: (v: number) => string) => (
    <label className="flex h-8 items-center gap-4 text-sm">
      <span className="text-parch w-56">{label}</span>
      <input type="range" min={min} max={max} step={step} value={settings[key] as number} onChange={(e) => setSettings({ [key]: Number(e.target.value) })} className="flex-1 accent-[#e3a45a]" />
      <span className="w-14 text-right">{fmt ? fmt(settings[key] as number) : String(settings[key])}</span>
    </label>
  );
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <Panel title="Настройки" onClose={onClose}>
      <div className="flex flex-col gap-2">
        <h3 className="label">Изображение</h3>
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
        <h3 className="label mt-4">Управление</h3>
        {slider("sensitivity", "Чувствительность мыши", 0.2, 3, 0.05, (v) => v.toFixed(2))}
        <label className="flex h-8 items-center gap-4 text-sm">
          <span className="text-parch w-56">Инверсия по вертикали</span>
          <input type="checkbox" checked={settings.invertY} onChange={(e) => setSettings({ invertY: e.target.checked })} className="accent-[#e3a45a]" />
        </label>
        <label className="flex h-8 items-center gap-4 text-sm">
          <span className="text-parch w-56">Покачивание камеры</span>
          <input type="checkbox" checked={settings.bob} onChange={(e) => setSettings({ bob: e.target.checked })} className="accent-[#e3a45a]" />
        </label>
        <h3 className="label mt-4">Звук</h3>
        {slider("volume", "Громкость", 0, 1, 0.05, pct)}
        {slider("music", "Музыка и фон", 0, 1, 0.05, pct)}
        <button className="btn mt-4 self-start" onClick={() => setSettings({ ...DEFAULT_SETTINGS })}>Сбросить настройки</button>
      </div>
    </Panel>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["WASD", "движение"], ["Мышь", "обзор (кликните по экрану, чтобы захватить указатель)"], ["Стрелки", "поворот и наклон взгляда без мыши"], ["Shift", "бег (тратит выносливость)"],
    ["Пробел", "уклонение — короткий рывок с неуязвимостью"], ["ЛКМ", "атака; зажать и отпустить — сильный удар; лук — натянуть и отпустить; посох/жезл — заряд"],
    ["ПКМ", "блок щитом или оружием (в начале блока — парирование), у магов — магический заслон, у лучника — прицел"],
    ["Q R F G Z X", "навыки из книги навыков"], ["1 / 2", "зелье здоровья / маны"], ["E", "действие: поднять, открыть, поговорить, осмотреть стену"],
    ["I", "сумка и снаряжение"], ["C", "персонаж и атрибуты"], ["B", "книга навыков"], ["M / Tab", "карта"], ["Esc", "пауза"],
  ];
  return (
    <Panel title="Управление и советы" onClose={onClose}>
      <div className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <span className="flex flex-wrap gap-1">{k.split(" / ").join(" ").split(" ").map((x) => <span key={x} className="kbd">{x}</span>)}</span>
            <span className="text-parch">{v}</span>
          </div>
        ))}
      </div>
      <div className="label mt-6 mb-2">Советы</div>
      <ul className="text-parch flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>Враги заносят оружие перед ударом, в это время можно отпрыгнуть или поднять щит</li>
        <li>Красные круги и полосы на полу показывают, куда ударит босс</li>
        <li>Треснувшая кладка звучит пусто: осмотрите её, за ней бывает тайник</li>
        <li>Нежить слаба к святому урону. Проклятые вещи сильнее обычных, но с изъяном</li>
        <li>Предметы сохраняются сразу при подборе, опыт и золото по итогам спуска</li>
      </ul>
    </Panel>
  );
}

export function NotePanel({ onClose }: { onClose: () => void }) {
  const { note } = useGame();
  if (!note) return null;
  return (
    <div className="rise relative w-[min(460px,92vw)] p-7 text-[#2a1a0e]" style={{ background: "linear-gradient(#cdbf98, #b8a67c)", boxShadow: "inset 0 0 40px #6a4a2a88, 0 8px 0 #00000080", clipPath: "polygon(0 2%, 4% 0, 30% 1%, 62% 0, 97% 2%, 100% 30%, 99% 70%, 100% 97%, 70% 100%, 35% 99%, 3% 100%, 0 70%, 1% 35%)" }}>
      <div className="mb-3 text-center text-[24px] leading-7 font-semibold" style={{ fontFamily: "var(--font-head)" }}>{note.title}</div>
      <div className="text-[19px] leading-7" style={{ fontFamily: "var(--font-head)", fontWeight: 500 }}>{note.text}</div>
      <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-[4px] border border-[#2a1a0e33] py-2 text-sm text-[#2a1a0e] transition-colors hover:bg-[#2a1a0e14]" onClick={onClose}>
        Убрать записку <span className="rounded-[4px] border border-[#2a1a0e55] px-1 text-[11px]">E</span>
      </button>
    </div>
  );
}
