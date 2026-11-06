/** Обращения к Django API игры. */
import type { CharacterData } from "@shared/data/stats";
import type { Item } from "@shared/data/items";
import { PLATFORM } from "./yandex";
import { localApi } from "./local/backend";

declare global {
  interface Window {
    HOLLOW: { api: string; home: string; coop: boolean };
  }
}

export type MerchantItem = (Item & { price: number }) | null;
export type ServerCharacter = CharacterData & {
  merchant?: MerchantItem[];
  merchantGen?: number;
  stats?: { runs: number; deaths: number; kills: number; bosses: number };
};

function csrf() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export class ApiError extends Error {}

async function call<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(window.HOLLOW.api + path, {
      method: method || (body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Нет связи с сервером.");
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(`Ошибка сервера (${res.status}).`);
  }
  if (!data.ok) throw new ApiError(data.error || "Ошибка.");
  return data;
}

const remoteApi = {
  me: () => call<{ user: string | null; characters?: ServerCharacter[]; coop: boolean }>("me/"),
  login: (username: string, password: string) => call("login/", { username, password }),
  register: (username: string, password: string) => call("register/", { username, password }),
  logout: () => call("logout/", {}),
  create: (name: string, cls: string, appearance: unknown) => call<{ character: ServerCharacter }>("characters/", { name, cls, appearance }),
  character: (id: number) => call<{ character: ServerCharacter }>(`characters/${id}/`),
  remove: (id: number) => call(`characters/${id}/`, undefined, "DELETE"),
  op: (id: number, op: Record<string, unknown>) => call<{ character: ServerCharacter; message: string }>(`characters/${id}/op/`, op),
  runStart: (id: number, dungeon: string) => call<{ run: { id: string; dungeon: string; seed: number; level: number } }>(`characters/${id}/run/`, { dungeon }),
  pickup: (id: number, run: string, item: Item) => call<{ item: Item & { pos: number } }>(`characters/${id}/run/${run}/pickup/`, { item }),
  finish: (id: number, run: string, success: boolean, result: unknown) =>
    call<{ summary: { xp: number; gold: number; levels: number; unlocked?: string[]; cleared?: boolean; firstClear?: boolean }; character: ServerCharacter }>(`characters/${id}/run/${run}/finish/`, { success, result }),
  coopToken: (id: number) => call<{ token: string; url: string }>(`characters/${id}/coop-token/`, {}),
};

/** На сайте — Django; в Яндекс Играх своего сервера нет, правила и сохранения живут в самой игре. */
export const api: typeof remoteApi = PLATFORM === "yandex" ? (localApi as unknown as typeof remoteApi) : remoteApi;
