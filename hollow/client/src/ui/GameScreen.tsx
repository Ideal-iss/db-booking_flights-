import { useCallback, useEffect, useRef, useState } from "react";
import { useGame, type Panel } from "../store";
import { api, ApiError, type ServerCharacter } from "../api";
import { Game, initRapier } from "../game/game";
import { LocalSession } from "../game/session";
import { ACTS, stageLabel } from "@shared/data/dungeons";
import type { Item } from "@shared/data/items";
import RAPIER from "@dimforge/rapier3d-compat";
import { Hud } from "./Hud";
import { TooltipLayer } from "./common";
import { InventoryPanel, StashPanel } from "./Inventory";
import { CharacterPanel } from "./CharacterPanel";
import { SkillsPanel } from "./SkillsPanel";
import { MapPanel } from "./MapPanel";
import { MerchantPanel, BlacksmithPanel } from "./Shops";
import { QuestsPanel, GatePanel, ResultsPanel, PausePanel, SettingsPanel, HelpPanel, NotePanel } from "./Panels";
import { PartyPanel } from "./Party";
import { audio } from "../game/audio";
import { party } from "../game/net";
import { PLATFORM, yandex } from "../yandex";

export interface GameApi {
  game: Game | null;
  op: (op: Record<string, unknown>) => Promise<boolean>;
  startRun: (dungeon: string) => Promise<void>;
  startCoop: (s: import("../game/session").Session, name: string, run: RunInfo) => void;
  /** Подняться за просмотр рекламы (true — получилось). */
  secondChance: () => Promise<boolean>;
  giveUp: () => void;
}

export interface RunInfo {
  id: string;
  dungeon: string;
  coop: boolean;
  items: number;
  kills: number;
}

export const gameApi: GameApi = { game: null, op: async () => false, startRun: async () => {}, startCoop: () => {}, secondChance: async () => false, giveUp: () => {} };
// доступ из консоли браузера для отладки (одиночная симуляция всё равно идёт на клиенте)
(window as unknown as { __hollow: GameApi }).__hollow = gameApi;

export function GameScreen() {
  const host = useRef<HTMLDivElement>(null);
  const { char, panel, set, settings, setChar, say, results } = useGame();
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const gameRef = useRef<Game | null>(null);
  const runRef = useRef<RunInfo | null>(null);
  const charRef = useRef<ServerCharacter | null>(char);
  charRef.current = char;

  const updateChar = useCallback(
    (c: ServerCharacter) => {
      setChar(c);
      gameRef.current?.setCharacter(c);
    },
    [setChar],
  );

  const op = useCallback(
    async (o: Record<string, unknown>) => {
      const c = charRef.current;
      if (!c) return false;
      try {
        const r = await api.op(c.id, o);
        updateChar(r.character);
        if (r.message) say(r.message, "#c9a46a");
        return true;
      } catch (x) {
        say(x instanceof ApiError ? x.message : "Ошибка.", "#e0505a");
        audio.play("nomana");
        return false;
      }
    },
    [updateChar, say],
  );

  const finishRun = useCallback(
    async (success: boolean) => {
      const g = gameRef.current;
      const run = runRef.current;
      const c = charRef.current;
      if (!g || !run || !c) return;
      const res = g.session?.result() || null;
      const kills = res ? Object.values(res.kills).reduce((a, b) => a + b, 0) : 0;
      set({
        panel: "results",
        results: { success, dungeon: run.dungeon, xp: 0, gold: 0, levels: 0, kills, items: run.items, pending: true },
      });
      g.setUiOpen(true);
      if (run.coop) {
        // итоги кооператива сервер отправляет сам; здесь просто перечитываем персонажа
        setTimeout(async () => {
          try {
            const r = await api.character(c.id);
            const before = c;
            updateChar(r.character);
            const k = (r.character.stats?.kills || 0) - (before.stats?.kills || 0);
            const items = r.character.inventory.length - before.inventory.length;
            set({ results: { success, dungeon: run.dungeon, xp: r.character.xp - before.xp, gold: r.character.gold - before.gold, levels: r.character.level - before.level, kills: k, items: Math.max(0, items) } });
          } catch {
            set({ results: { success, dungeon: run.dungeon, xp: 0, gold: 0, levels: 0, kills, items: run.items, error: "Не удалось получить итоги." } });
          }
        }, 1500);
        return;
      }
      try {
        const r = await api.finish(c.id, run.id, success, res);
        updateChar(r.character);
        set({ results: { success, dungeon: run.dungeon, xp: r.summary.xp, gold: r.summary.gold, levels: r.summary.levels, kills, items: run.items, unlocked: r.summary.unlocked, cleared: r.summary.cleared, firstClear: r.summary.firstClear } });
      } catch (x) {
        set({ results: { success, dungeon: run.dungeon, xp: 0, gold: 0, levels: 0, kills, items: run.items, error: x instanceof ApiError ? x.message : "Ошибка сохранения." } });
      }
      runRef.current = null;
    },
    [set, updateChar],
  );

  useEffect(() => {
    let g: Game | null = null;
    let cancelled = false;
    initRapier()
      .then(() => {
        if (cancelled || !host.current || !charRef.current) return;
        g = new Game(host.current, { ...charRef.current }, useGame.getState().settings, {
          hud: (h) => useGame.setState({ hud: h }),
          say: (t, col) => useGame.getState().say(t, col),
          openPanel: (p) => openPanel(p as Panel),
          readNote: (title, text) => {
            useGame.setState({ note: { title, text } });
            openPanel("note");
          },
          togglePanel: (p) => togglePanel(p as Panel),
          pauseToggle: () => {
            const cur = useGame.getState().panel;
            if (cur === "results") return;
            if (cur) closePanel();
            else openPanel("pause");
          },
          bagFull: () => (charRef.current?.inventory.length || 0) >= 40,
          pickup: async (item: Item) => {
            const run = runRef.current;
            const c = charRef.current;
            if (!run || !c || run.coop) return true;
            try {
              const r = await api.pickup(c.id, run.id, item);
              run.items++;
              const fresh = charRef.current!;
              updateChar({ ...fresh, inventory: [...fresh.inventory, r.item] });
              return true;
            } catch (x) {
              useGame.getState().say(x instanceof ApiError ? `Предмет не сохранён: ${x.message}` : "Предмет не сохранён.", "#e0505a");
              return false;
            }
          },
          runEnded: (success) => void finishRun(success),
        });
        gameRef.current = g;
        gameApi.game = g;
        // пауза площадки и реклама останавливают мир
        yandex.onPause((on) => {
          g?.setExternalPause(on);
          if (on) yandex.gameplay(false);
        });
        party.hooks = {
          onMessage: (t, col) => useGame.getState().say(t, col),
          onDungeon: (session, run) => gameApi.startCoop(session, `${stageLabel(run.dungeon)} (ур. ${run.level}, отряд)`, { id: "", dungeon: run.dungeon, coop: true, items: 0, kills: 0 }),
        };
        setReady(true);
        // пролог: один раз, когда герой впервые приходит в лагерь
        const fresh = charRef.current;
        if (fresh && !fresh.cleared.length && !(fresh.stats?.runs || 0)) {
          let seen = false;
          try { seen = localStorage.getItem(`hollow-prologue-${fresh.id}`) === "1"; } catch { /* приватный режим */ }
          if (!seen) {
            try { localStorage.setItem(`hollow-prologue-${fresh.id}`, "1"); } catch { /* ничего */ }
            useGame.setState({ note: { title: `Пролог. ${ACTS[0].name}`, text: ACTS[0].intro + " Врата Глубин — в северной нише часовни." }, panel: "note" });
            g.setUiOpen(true);
          }
        }
      })
      .catch((e) => setLoadErr(String(e)));
    return () => {
      cancelled = true;
      party.leave();
      g?.dispose();
      gameRef.current = null;
      gameApi.game = null;
    };
    // игра создаётся один раз на персонажа
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char?.id]);

  useEffect(() => {
    gameRef.current?.applySettings(settings);
  }, [settings]);

  const openPanel = (p: Panel) => {
    useGame.setState({ panel: p });
    gameRef.current?.setUiOpen(true);
  };
  const closePanel = () => {
    if (useGame.getState().panel === "results") return;
    useGame.setState({ panel: null });
    gameRef.current?.setUiOpen(false);
  };
  const togglePanel = (p: Panel) => {
    const cur = useGame.getState().panel;
    if (cur === "results") return;
    if (cur === p) closePanel();
    else openPanel(p);
  };

  useEffect(() => {
    // Esc и горячие клавиши при открытой панели (указатель не захвачен — слушаем сами)
    const onKey = (e: KeyboardEvent) => {
      const cur = useGame.getState().panel;
      if (!cur || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.code === "Escape" || (e.code === "KeyE" && cur === "note")) closePanel();
      const map: Record<string, Panel> = { KeyI: "inventory", KeyC: "character", KeyB: "skills", KeyK: "skills", KeyM: "map", Tab: "map", KeyJ: "quests" };
      if (map[e.code] && cur !== "results" && cur !== "pause") {
        e.preventDefault();
        togglePanel(map[e.code]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  gameApi.op = op;
  gameApi.startRun = async (dungeon: string) => {
    const c = charRef.current;
    const g = gameRef.current;
    if (!c || !g) return;
    try {
      const r = await api.runStart(c.id, dungeon);
      const session = new LocalSession(RAPIER, { dungeon, seed: r.run.seed, level: r.run.level, char: c, name: c.name });
      // на Яндексе после гибели можно один раз подняться за рекламу
      session.sim.offerRevive = PLATFORM === "yandex";
      runRef.current = { id: r.run.id, dungeon, coop: false, items: 0, kills: 0 };
      closePanel();
      useGame.setState({ log: [] });
      g.enterDungeon(session, `${stageLabel(dungeon)} (ур. ${r.run.level})`);
    } catch (x) {
      say(x instanceof ApiError ? x.message : "Ошибка.", "#e0505a");
    }
  };
  gameApi.startCoop = (session, name, run) => {
    const g = gameRef.current;
    if (!g) return;
    runRef.current = run;
    useGame.setState({ panel: null });
    g.setUiOpen(false);
    g.enterDungeon(session, name);
  };

  gameApi.secondChance = async () => {
    const s = gameRef.current?.session;
    if (!(s instanceof LocalSession) || !s.sim.awaitingRevive) return false;
    const ok = await yandex.rewarded();
    if (!ok) return false;
    s.sim.secondChance();
    gameRef.current?.input.lock();
    return true;
  };
  gameApi.giveUp = () => {
    const s = gameRef.current?.session;
    if (s instanceof LocalSession) s.sim.giveUp();
  };

  const backToCamp = async () => {
    // межэкранная реклама — в логической паузе, между забегом и лагерем
    if (PLATFORM === "yandex") await yandex.fullscreen();
    set({ panel: null, results: null });
    gameRef.current?.leaveDungeon();
    gameRef.current?.setUiOpen(false);
  };

  // разметка геймплея для площадки: идёт игра, только когда герой управляется
  useEffect(() => {
    if (PLATFORM !== "yandex" || !ready) return;
    let locked = false;
    const upd = () => {
      const g = gameRef.current;
      yandex.gameplay(!!g && locked && !useGame.getState().panel && !g.extPause);
    };
    const onLock = (e: Event) => { locked = !!(e as CustomEvent).detail?.locked; upd(); };
    window.addEventListener("hollow-lock", onLock);
    const unsub = useGame.subscribe(upd);
    return () => { window.removeEventListener("hollow-lock", onLock); unsub(); yandex.gameplay(false); };
  }, [ready]);

  if (!char) return null;
  return (
    <div className="relative h-full w-full bg-black">
      <div ref={host} className="absolute inset-0" />
      {!ready && !loadErr && <div className="logo bg-coal absolute inset-0 flex items-center justify-center text-6xl">THE HOLLOW</div>}
      {loadErr && <div className="absolute inset-0 flex items-center justify-center text-[#e0505a]">Не удалось запустить игру: {loadErr}</div>}
      {ready && <Hud onClickCanvas={() => gameRef.current?.input.lock()} />}
      {panel && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55" onMouseDown={(e) => e.target === e.currentTarget && panel !== "results" && panel !== "pause" && closePanel()}>
          {panel === "inventory" && <InventoryPanel onClose={closePanel} />}
          {panel === "stash" && <StashPanel onClose={closePanel} />}
          {panel === "character" && <CharacterPanel onClose={closePanel} />}
          {panel === "skills" && <SkillsPanel onClose={closePanel} />}
          {panel === "map" && <MapPanel onClose={closePanel} />}
          {panel === "merchant" && <MerchantPanel onClose={closePanel} />}
          {panel === "blacksmith" && <BlacksmithPanel onClose={closePanel} />}
          {panel === "quests" && <QuestsPanel onClose={closePanel} />}
          {panel === "gate" && <GatePanel onClose={closePanel} />}
          {panel === "party" && <PartyPanel onClose={closePanel} />}
          {panel === "pause" && <PausePanel onClose={closePanel} onSettings={() => openPanel("settings")} onHelp={() => openPanel("help")} />}
          {panel === "settings" && <SettingsPanel onClose={() => openPanel("pause")} />}
          {panel === "help" && <HelpPanel onClose={closePanel} />}
          {panel === "note" && <NotePanel onClose={closePanel} />}
          {panel === "results" && results && <ResultsPanel onClose={backToCamp} onNext={(key) => { backToCamp(); audio.play("portal"); setTimeout(() => void gameApi.startRun(key), 250); }} />}
        </div>
      )}
      <TooltipLayer char={char} />
    </div>
  );
}
