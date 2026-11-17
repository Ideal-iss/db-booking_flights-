/**
 * Игровые площадки: Яндекс Игры и Пикабу Игры — SDK, разметка геймплея, пауза, реклама, облачные сохранения.
 * В сборке для сайта не используется (PLATFORM === "web").
 * Без SDK (локальная проверка) всё работает как заглушка: реклама сразу «закрывается», награда не выдаётся.
 */
import { audio } from "./game/audio";

export type Platform = "web" | "yandex" | "pikabu";
const ENV = import.meta.env.VITE_PLATFORM as string;
export const PLATFORM: Platform = ENV === "yandex" || ENV === "pikabu" ? ENV : "web";
/** Площадка без своего сервера: правила и сохранения живут в игре. */
export const STANDALONE = PLATFORM !== "web";
/** На Пикабу в названии нельзя иностранных слов — там игра зовётся по-русски. */
export const GAME_TITLE = PLATFORM === "pikabu" ? "ПОЛОСТЬ" : "THE HOLLOW";
const PIKABU_SDK = "https://games.pikabu.ru/sdk/sdk.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ysdk = any;
declare global {
  interface Window {
    YaGames?: { init: () => Promise<Ysdk> };
    PkbSDK?: { init: () => Promise<Ysdk> };
  }
}

let sdk: Ysdk | null = null;
let player: any = null;
let started = false;
let playing = false;
/** Кто хочет, чтобы игра стояла: реклама, пауза платформы. Слушатель — сама игра. */
const pauseReasons = new Set<string>();
let onPause: ((on: boolean) => void) | null = null;

function setPause(reason: string, on: boolean) {
  const before = pauseReasons.size > 0;
  if (on) pauseReasons.add(reason);
  else pauseReasons.delete(reason);
  audio.hold(reason, on);
  const now = pauseReasons.size > 0;
  if (before !== now) onPause?.(now);
}

export const yandex = {
  get ready() {
    return !!sdk;
  },

  /** Подключение SDK. Скрипт /sdk.js отдаёт сама площадка; без него — тихо работаем без SDK. */
  async init() {
    if (!STANDALONE) return;
    // звук молчит, пока вкладка свёрнута или окно не в фокусе (требование 1.3)
    const vis = () => audio.hold("hidden", document.hidden);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", () => audio.hold("blur", true));
    window.addEventListener("focus", () => audio.hold("blur", false));
    // долгое нажатие и правая кнопка не открывают меню браузера
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    try {
      if (PLATFORM === "pikabu") {
        if (!window.PkbSDK) await loadScript(PIKABU_SDK);
        if (!window.PkbSDK) return;
        sdk = await window.PkbSDK.init();
        sdk.on?.("storageSaveError", (reason: string) => console.warn("Пикабу: сохранение не удалось", reason));
        return;
      }
      if (!window.YaGames) await loadScript("/sdk.js");
      if (!window.YaGames) return;
      sdk = await window.YaGames.init();
      sdk.on?.("game_api_pause", () => setPause("platform", true));
      sdk.on?.("game_api_resume", () => setPause("platform", false));
    } catch {
      sdk = null;
    }
  },

  /** Игра загружена и готова к игре: снимаем экран загрузки площадки. */
  loaded() {
    if (started) return;
    started = true;
    try {
      if (PLATFORM === "pikabu") sdk?.gameStarted?.();
      else sdk?.features?.LoadingAPI?.ready();
    } catch { /* без SDK */ }
  },

  /** Разметка геймплея: старт — герой управляется, стоп — меню, окна, пауза, реклама. */
  gameplay(on: boolean) {
    if (on === playing) return;
    playing = on;
    if (PLATFORM !== "yandex") return; // у Пикабу разметки геймплея нет
    try {
      if (on) sdk?.features?.GameplayAPI?.start();
      else sdk?.features?.GameplayAPI?.stop();
    } catch { /* без SDK */ }
  },

  onPause(fn: (on: boolean) => void) {
    onPause = fn;
  },

  /** Межэкранная реклама в логической паузе. Не чаще раза в 3 минуты с нашей стороны (площадка ограничивает и сама). */
  lastFullscreen: 0,
  fullscreen(): Promise<void> {
    if (PLATFORM === "pikabu") return pikabuAd("fullscreen").then(() => undefined);
    return new Promise((resolve) => {
      const now = Date.now();
      if (!sdk?.adv || now - this.lastFullscreen < 180_000) return resolve();
      this.lastFullscreen = now;
      const done = () => { setPause("ad", false); resolve(); };
      try {
        sdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => setPause("ad", true),
            onClose: done,
            onError: done,
            onOffline: done,
          },
        });
      } catch {
        done();
      }
    });
  },

  /** Реклама за награду. true — игрок досмотрел и заслужил награду. */
  rewarded(): Promise<boolean> {
    if (PLATFORM === "pikabu") return pikabuAd("rewarded");
    return new Promise((resolve) => {
      if (!sdk?.adv) return resolve(false);
      let got = false;
      const done = () => { setPause("ad", false); resolve(got); };
      try {
        sdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => setPause("ad", true),
            onRewarded: () => { got = true; },
            onClose: done,
            onError: done,
          },
        });
      } catch {
        done();
      }
    });
  },

  /** Облачное сохранение игрока (гость тоже получает своё хранилище). */
  async loadCloud(): Promise<Record<string, unknown> | null> {
    if (PLATFORM === "pikabu") {
      try { return sdk?.storage ? { save: sdk.storage.get("save") } : null; } catch { return null; }
    }
    try {
      player ||= await sdk?.getPlayer?.({ scopes: false });
      return player ? await player.getData() : null;
    } catch {
      return null;
    }
  },
  async saveCloud(data: Record<string, unknown>, flush = false) {
    if (PLATFORM === "pikabu") {
      // set копит изменения, flush отправляет на сервер (не больше 100 раз за 5 минут — у нас пачками раз в 3 с)
      try { sdk?.storage?.set("save", data.save); await sdk?.storage?.flush(); } catch { /* повторим при следующем сохранении */ }
      void flush;
      return;
    }
    try {
      player ||= await sdk?.getPlayer?.({ scopes: false });
      await player?.setData(data, flush);
    } catch { /* сохранится в следующий раз; локальная копия уже записана */ }
  },
};

/** Реклама Пикабу: перед показом мир и звук на паузе, после — продолжаем. true — награда заслужена. */
async function pikabuAd(kind: "fullscreen" | "rewarded"): Promise<boolean> {
  const ad = sdk?.ads?.[kind];
  if (!ad) return false;
  try {
    if (ad.isSupported === false || !(await ad.canShow())) return false;
    setPause("ad", true);
    const r = await ad.show();
    return kind === "rewarded" ? !!r?.reward : !!r?.rendered;
  } catch {
    return false;
  } finally {
    setPause("ad", false);
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
    setTimeout(resolve, 6000);
  });
}
