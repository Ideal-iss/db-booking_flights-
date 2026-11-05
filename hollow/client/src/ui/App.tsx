import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { api, ApiError } from "../api";
import { CLASSES } from "@shared/data/classes";
import { STAGES } from "@shared/data/dungeons";
import { CharacterCreate } from "./CharacterCreate";
import { GameScreen } from "./GameScreen";
import { audio } from "../game/audio";
import { MenuScene } from "../game/menuScene";

export function App() {
  const { screen, set } = useGame();
  useEffect(() => {
    api
      .me()
      .then((r) => set({ user: r.user, characters: r.characters || [], coopEnabled: r.coop, screen: r.user ? "select" : "auth" }))
      .catch(() => set({ screen: "auth", toast: "Нет связи с сервером." }));
  }, [set]);
  return (
    <div className="relative h-full w-full">
      {screen === "boot" && <Boot />}
      {screen === "auth" && <Auth />}
      {screen === "select" && <Select />}
      {screen === "create" && <CharacterCreate />}
      {screen === "game" && <GameScreen />}
    </div>
  );
}

function Boot() {
  return (
    <div className="bg-coal flex h-full items-center justify-center">
      <div className="logo text-6xl">THE HOLLOW</div>
    </div>
  );
}

/** Метка видеокассеты в углу — фирменная деталь всех экранов. */
export function Osd({ label }: { label?: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(Math.floor(t / 3600)).padStart(2, "0"), mm = String(Math.floor(t / 60) % 60).padStart(2, "0"), ss = String(t % 60).padStart(2, "0");
  return (
    <div className="osd pointer-events-none absolute top-4 left-6 z-10">
      <div>▶ PLAY</div>
      <div>SP {hh}:{mm}:{ss}</div>
      {label && <div className="text-parch">{label}</div>}
    </div>
  );
}

/**
 * Фон меню: живая сцена лагеря в игровом рендере. Левая часть затемнена под колонку с интерфейсом,
 * справа видно часовню со свечами.
 */
export function MenuBackdrop({ children, scene = true, center = false }: { children: React.ReactNode; scene?: boolean; center?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const settings = useGame((s) => s.settings);
  useEffect(() => {
    if (!scene || !host.current) return;
    let m: MenuScene | null = null;
    try {
      m = new MenuScene(host.current, settings);
    } catch {
      m = null; // без WebGL — просто тёмный фон
    }
    return () => m?.dispose();
    // сцена создаётся один раз на экран
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  return (
    <div className="bg-coal relative h-full w-full overflow-hidden">
      {scene && <div ref={host} className="absolute inset-0" />}
      {scene && <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(90deg, #141311 0%, #141311f2 30%, #14131180 48%, #14131100 66%)" }} />}
      <Osd />
      <div className={`relative z-10 h-full ${center ? "flex items-center justify-center p-6" : ""}`}>{children}</div>
      <a href={window.HOLLOW.home} className="text-dim hover:text-bone absolute right-6 bottom-4 z-10 text-xs transition-colors">SkyBook</a>
    </div>
  );
}

/** Левая колонка меню поверх сцены. */
function MenuColumn({ children }: { children: React.ReactNode }) {
  return <div className="rise flex h-full w-[min(480px,100vw)] flex-col justify-center gap-8 px-6 py-16 sm:px-12">{children}</div>;
}

function Auth() {
  const { set, toast } = useGame();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState(toast);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    audio.ensure();
    setErr("");
    if (mode === "register" && password !== password2) return setErr("Пароли не совпадают");
    setBusy(true);
    try {
      if (mode === "login") await api.login(username, password);
      else await api.register(username, password);
      const r = await api.me();
      set({ user: r.user, characters: r.characters || [], coopEnabled: r.coop, screen: "select" });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  return (
    <MenuBackdrop>
      <MenuColumn>
        <div>
          <div className="logo text-[48px] leading-none whitespace-nowrap sm:text-[60px]">THE HOLLOW</div>
          <p className="text-parch mt-4 max-w-[34ch]">Спуск в подземелья под часовней «Последняя свеча». Пять актов, шесть классов, один герой.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex gap-6 text-sm">
            {(["login", "register"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setErr(""); }} className={`border-b pb-1 transition-colors ${mode === m ? "text-bone border-flame" : "text-dim border-transparent hover:text-parch"}`}>
                {m === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1">
            <span className="label">Логин</span>
            <input className="field w-full" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">Пароль</span>
            <input className="field w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {mode === "register" && (
            <label className="flex flex-col gap-1">
              <span className="label">Пароль ещё раз</span>
              <input className="field w-full" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
            </label>
          )}
          {err && <div className="text-bad text-sm">{err}</div>}
          <button className="btn btn-primary h-11 text-sm" disabled={busy || !username || !password}>
            {busy ? "Подождите" : mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
          <p className="text-dim text-xs">Аккаунт общий с сайтом SkyBook</p>
        </form>
      </MenuColumn>
    </MenuBackdrop>
  );
}

function Select() {
  const { characters, set, user } = useGame();
  const [sel, setSel] = useState<number | null>(characters[0]?.id ?? null);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const c = characters.find((x) => x.id === sel) || null;
  const play = async () => {
    if (!c) return;
    audio.ensure();
    audio.play("portal");
    try {
      const r = await api.character(c.id);
      set({ char: r.character, screen: "game", panel: null, results: null });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Ошибка");
    }
  };
  const del = async () => {
    if (!c) return;
    try {
      await api.remove(c.id);
      const rest = characters.filter((x) => x.id !== c.id);
      set({ characters: rest });
      setSel(rest[0]?.id ?? null);
      setConfirmDel(false);
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Ошибка");
    }
  };
  return (
    <MenuBackdrop>
      <MenuColumn>
        <div className="logo text-[48px] leading-none whitespace-nowrap">THE HOLLOW</div>
        <div className="flex flex-col gap-2">
          <div className="label mb-1">Герои</div>
          {characters.length === 0 && <div className="text-parch">Пока никого. Создайте первого героя</div>}
          {characters.map((x) => (
            <button
              key={x.id}
              className={`flex h-12 items-center justify-between rounded-[4px] border px-4 text-left transition-colors ${x.id === sel ? "border-line-strong bg-ash" : "border-transparent hover:bg-soot"}`}
              onClick={() => { setSel(x.id); setConfirmDel(false); audio.play("click"); }}
            >
              <span>{x.name}</span>
              <span className="text-parch text-sm">{CLASSES[x.cls].name} · {x.level}</span>
            </button>
          ))}
          {characters.length < 6 && (
            <button className="text-parch hover:text-bone flex h-10 items-center rounded-[4px] px-4 text-left text-sm transition-colors" onClick={() => set({ screen: "create" })}>
              + Новый герой
            </button>
          )}
        </div>
        {c && (
          <div className="flex flex-col gap-4 border-t border-line pt-6">
            <div>
              <div className="font-[family-name:var(--font-head)] text-[32px] leading-9 font-semibold">{c.name}</div>
              <div className="text-parch">{CLASSES[c.cls].name}, уровень {c.level}</div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-dim">Кампания</dt><dd>{campaignLine(c.cleared)}</dd>
              <dt className="text-dim">Золото</dt><dd>{c.gold.toLocaleString("ru-RU")}</dd>
              {c.stats && (<><dt className="text-dim">Спуски</dt><dd>{c.stats.runs} · убито {c.stats.kills} · смертей {c.stats.deaths}</dd></>)}
            </dl>
            <div className="flex gap-2">
              <button className="btn btn-primary h-11 flex-1" onClick={play}>Играть</button>
              {confirmDel ? (
                <button className="btn btn-danger h-11" onClick={del}>Точно удалить</button>
              ) : (
                <button className="btn h-11" onClick={() => setConfirmDel(true)}>Удалить</button>
              )}
            </div>
            {err && <div className="text-bad text-sm">{err}</div>}
          </div>
        )}
        <div className="text-dim text-sm">
          {user} ·{" "}
          <button className="hover:text-bone underline underline-offset-4 transition-colors" onClick={async () => { await api.logout(); set({ user: null, characters: [], screen: "auth" }); }}>
            выйти
          </button>
        </div>
      </MenuColumn>
    </MenuBackdrop>
  );
}

function campaignLine(cleared: string[]) {
  const done = STAGES.filter((s) => cleared.includes(s.id)).length;
  if (!done) return "ещё не начата";
  if (cleared.includes("a5s3")) {
    const nm = STAGES.filter((s) => cleared.includes("n:" + s.id)).length;
    return nm ? `пройдена · Кошмар ${nm}/${STAGES.length}` : "пройдена";
  }
  const last = [...STAGES].reverse().find((s) => cleared.includes(s.id))!;
  return `акт ${last.act} · ${done}/${STAGES.length} этапов`;
}
