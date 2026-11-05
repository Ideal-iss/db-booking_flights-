import { useEffect, useState } from "react";
import { useGame } from "../store";
import { api, ApiError } from "../api";
import { CLASSES } from "@shared/data/classes";
import { STAGES } from "@shared/data/dungeons";
import { CharacterCreate } from "./CharacterCreate";
import { GameScreen } from "./GameScreen";
import { audio } from "../game/audio";

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
    <div className="flex h-full items-center justify-center">
      <div className="logo flicker text-6xl">THE HOLLOW</div>
    </div>
  );
}

/** Фон меню: мерцающие свечи и шум. */
export function MenuBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="menu-noise relative flex h-full w-full flex-col items-center justify-center overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 70%, #2a1810 0%, #120c08 45%, #050302 100%)" }}>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-40" style={{ background: "radial-gradient(ellipse at 50% 100%, #ff7a2a33, transparent 60%)" }} />
      {children}
      <div className="text-dim absolute bottom-3 left-4 text-xs">▶ PLAY &nbsp; SP 00:00:00</div>
      <a href={window.HOLLOW.home} className="text-dim hover:text-bone absolute right-4 bottom-3 text-xs">← SkyBook</a>
    </div>
  );
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
    if (mode === "register" && password !== password2) return setErr("Пароли не совпадают.");
    setBusy(true);
    try {
      if (mode === "login") await api.login(username, password);
      else await api.register(username, password);
      const r = await api.me();
      set({ user: r.user, characters: r.characters || [], coopEnabled: r.coop, screen: "select" });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Ошибка.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <MenuBackdrop>
      <div className="logo flicker mb-1 text-[min(16vw,120px)] leading-none">THE HOLLOW</div>
      <div className="text-parch mb-8 tracking-[0.3em]">ТЁМНОЕ ФЭНТЕЗИ · ПОДЗЕМЕЛЬЯ · КООПЕРАТИВ</div>
      <form onSubmit={submit} className="panel rise flex w-[340px] flex-col gap-3 p-5">
        <div className="flex gap-2">
          <button type="button" className={`btn flex-1 ${mode === "login" ? "btn-gold" : ""}`} onClick={() => setMode("login")}>Вход</button>
          <button type="button" className={`btn flex-1 ${mode === "register" ? "btn-gold" : ""}`} onClick={() => setMode("register")}>Регистрация</button>
        </div>
        <label className="text-parch text-sm">
          Логин
          <input className="field mt-1 w-full" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label className="text-parch text-sm">
          Пароль
          <input className="field mt-1 w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </label>
        {mode === "register" && (
          <label className="text-parch text-sm">
            Пароль ещё раз
            <input className="field mt-1 w-full" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        {err && <div className="text-sm text-[#e0505a]">{err}</div>}
        <button className="btn btn-red mt-1 py-2 text-lg" disabled={busy || !username || !password}>
          {busy ? "…" : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>
        <div className="text-dim text-xs">Аккаунт общий с сайтом SkyBook: если вы уже играли в «Мир», войдите с тем же логином.</div>
      </form>
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
      setErr(x instanceof ApiError ? x.message : "Ошибка.");
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
      setErr(x instanceof ApiError ? x.message : "Ошибка.");
    }
  };
  return (
    <MenuBackdrop>
      <div className="logo mb-6 text-6xl">THE HOLLOW</div>
      <div className="panel rise flex w-[min(820px,94vw)] gap-4 p-5">
        <div className="flex w-1/2 flex-col gap-2">
          <h2 className="panel-title mb-1 text-lg">Ваши герои</h2>
          {characters.length === 0 && <div className="text-dim">Пока никого. Создайте первого героя.</div>}
          {characters.map((x) => (
            <button
              key={x.id}
              className={`btn flex items-center justify-between text-left ${x.id === sel ? "btn-gold" : ""}`}
              onClick={() => { setSel(x.id); setConfirmDel(false); audio.play("click"); }}
            >
              <span>{x.name}</span>
              <span className="text-parch text-sm">{CLASSES[x.cls].name}, {x.level} ур.</span>
            </button>
          ))}
          {characters.length < 6 && (
            <button className="btn mt-2" onClick={() => set({ screen: "create" })}>
              + Новый герой
            </button>
          )}
        </div>
        <div className="flex w-1/2 flex-col">
          {c ? (
            <>
              <div className="panel-title text-2xl">{c.name}</div>
              <div className="mb-2" style={{ color: CLASSES[c.cls].color }}>
                {CLASSES[c.cls].name} · уровень {c.level}
              </div>
              <div className="text-parch mb-3 text-sm">{CLASSES[c.cls].tagline}</div>
              <div className="text-sm">Золото: <span className="text-gold">{c.gold}</span></div>
              <div className="text-sm">
                {campaignLine(c.cleared)}
              </div>
              {c.stats && (
                <div className="text-dim text-sm">
                  Спусков: {c.stats.runs} · убито: {c.stats.kills} · смертей: {c.stats.deaths}
                </div>
              )}
              <div className="mt-auto flex gap-2 pt-4">
                <button className="btn btn-red flex-1 py-2 text-lg" onClick={play}>Играть</button>
                {confirmDel ? (
                  <button className="btn" onClick={del}>Точно удалить?</button>
                ) : (
                  <button className="btn" onClick={() => setConfirmDel(true)}>Удалить</button>
                )}
              </div>
            </>
          ) : (
            <div className="text-dim m-auto">Выберите героя</div>
          )}
          {err && <div className="mt-2 text-sm text-[#e0505a]">{err}</div>}
        </div>
      </div>
      <div className="text-dim mt-4 text-sm">
        {user} ·{" "}
        <button className="underline" onClick={async () => { await api.logout(); set({ user: null, characters: [], screen: "auth" }); }}>
          выйти
        </button>
      </div>
    </MenuBackdrop>
  );
}

function campaignLine(cleared: string[]) {
  const done = STAGES.filter((s) => cleared.includes(s.id)).length;
  if (!done) return "Кампания: ещё не начата";
  if (cleared.includes("a5s3")) {
    const nm = STAGES.filter((s) => cleared.includes("n:" + s.id)).length;
    return nm ? `Кампания пройдена · Кошмар: ${nm}/${STAGES.length}` : "Кампания пройдена";
  }
  const last = [...STAGES].reverse().find((s) => cleared.includes(s.id))!;
  return `Кампания: ${done}/${STAGES.length} · акт ${last.act}`;
}
