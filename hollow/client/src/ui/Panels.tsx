import { useGame, DEFAULT_SETTINGS, type Settings } from "../store";
import { Panel } from "./common";
import { gameApi } from "./GameScreen";
import { DUNGEONS, QUESTS, DUNGEON_BY_ID, dungeonUnlocked } from "@shared/data/dungeons";
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

export function GatePanel({ onClose }: { onClose: () => void }) {
  const { char } = useGame();
  if (!char) return null;
  return (
    <Panel title="Врата Глубин" onClose={onClose}>
      <div className="text-parch mb-3 text-sm">Каждый спуск — новое подземелье. Найдите и убейте хозяина глубины, чтобы открыть путь ниже.</div>
      <div className="flex flex-col gap-2">
        {DUNGEONS.map((d) => {
          const open = dungeonUnlocked(d, char.cleared);
          const cleared = char.cleared.includes(d.id);
          const lvl = Math.max(d.level, Math.min(char.level - 1, d.level + 10));
          return (
            <div key={d.id} className={`panel flex gap-3 p-3 ${open ? "" : "opacity-50"}`}>
              <div className="h-16 w-16 shrink-0 border-2 border-[#3d3126]" style={{ background: `linear-gradient(135deg, ${d.palette.wall}, ${d.palette.fog})` }}>
                <div className="flex h-full items-center justify-center text-2xl" style={{ color: d.palette.light }}>☩</div>
              </div>
              <div className="flex-1">
                <div className="panel-title">{d.name} {cleared && <span className="text-xs text-[#7fe07f]">· пройдено</span>}</div>
                <div className="text-sm">{d.description}</div>
                <div className="text-dim text-xs">
                  Уровень {lvl} · Хозяин: {ENEMIES[d.boss].name}
                  {!open && d.unlock && ` · Сначала пройдите «${DUNGEON_BY_ID[d.unlock].name}»`}
                </div>
              </div>
              <button className="btn btn-red self-center" disabled={!open} onClick={() => { audio.play("portal"); void gameApi.startRun(d.id); }}>
                Спуститься
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-dim mt-2 text-xs">Совместный спуск собирается у Алтаря Клятвы в центре лагеря.</div>
      {void onClose}
    </Panel>
  );
}

export function ResultsPanel({ onClose }: { onClose: () => void }) {
  const { results } = useGame();
  if (!results) return null;
  const r = results;
  return (
    <div className="panel rise w-[420px] p-6 text-center">
      <div className={`logo text-4xl ${r.success ? "" : "text-[#c8343a]"}`}>{r.success ? "ВЫ ВЫБРАЛИСЬ" : "ВЫ ПАЛИ"}</div>
      <div className="text-parch mt-1">{DUNGEON_BY_ID[r.dungeon]?.name}</div>
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
          {r.unlocked?.length ? <div className="text-[#8fd0ff]">Открыто: {r.unlocked.map((u) => DUNGEON_BY_ID[u]?.name).join(", ")}</div> : null}
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
    ["WASD", "движение"], ["Мышь", "обзор (кликните по экрану, чтобы захватить указатель)"], ["Shift", "бег (тратит выносливость)"],
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
