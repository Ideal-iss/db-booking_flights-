/** Кооператив: подключение к отряду (Colyseus), лобби, сетевая сессия забега, переподключение. */
import { Client, type Room } from "colyseus.js";
import { create } from "zustand";
import { generateDungeon, type Dungeon } from "@shared/dungeon/generate";
import type { Action, PoseInput } from "@shared/sim/sim";
import type { SimEvent, Snapshot } from "@shared/sim/types";
import type { CharacterData } from "@shared/data/stats";
import { api } from "../api";
import { trapPhaseActive, type RunResult, type Session } from "./session";

export interface LobbyMember { id: string; name: string; cls: string; level: number; ready: boolean; connected: boolean; cleared: string[] }
export interface Lobby { code: string; host: string; inRun: boolean; dungeon?: string; members: LobbyMember[] }

interface PartyState {
  status: "idle" | "connecting" | "lobby" | "reconnecting" | "error";
  error: string;
  lobby: Lobby | null;
  you: string;
  size: number;
  set: (p: Partial<PartyState>) => void;
}

export const useParty = create<PartyState>((set) => ({ status: "idle", error: "", lobby: null, you: "", size: 2, set: (p) => set(p) }));

export class NetSession implements Session {
  selfId: string;
  coop = true;
  dungeon: Dungeon;
  finished: null | { success: boolean } = null;
  paused = false;
  onSnapshot: (s: Snapshot) => void = () => {};
  onEvents: (e: SimEvent[]) => void = () => {};
  private lastTime = 0;
  private lastAt = performance.now();
  room: Room;

  constructor(room: Room, you: string, run: { dungeon: string; seed: number; level: number }) {
    this.room = room;
    this.selfId = you;
    this.dungeon = generateDungeon(run.dungeon, run.seed, run.level);
  }

  snapshot(s: Snapshot) {
    this.lastTime = s.time;
    this.lastAt = performance.now();
    this.onSnapshot(s);
  }

  update() {}

  sendPose(p: PoseInput) {
    try {
      this.room.send("pose", p);
    } catch {
      /* соединение восстанавливается */
    }
  }

  action(a: Action) {
    try {
      this.room.send("act", a);
    } catch {
      /* соединение восстанавливается */
    }
  }

  trapActive(id: string) {
    return trapPhaseActive(id, this.lastTime + (performance.now() - this.lastAt) / 1000);
  }

  updateCharacter(_c: CharacterData) {}

  result(): RunResult | null {
    return null;
  }

  dispose() {}
}

type Hooks = {
  onDungeon: (s: NetSession, run: { dungeon: string; seed: number; level: number }) => void;
  onMessage: (text: string, color?: string) => void;
};

class Party {
  client: Client | null = null;
  room: Room | null = null;
  session: NetSession | null = null;
  hooks: Hooks | null = null;
  private url = "";
  private leaving = false;

  private async token(charId: number) {
    const r = await api.coopToken(charId);
    this.url = r.url;
    this.client = new Client(r.url);
    return r.token;
  }

  async create(charId: number) {
    useParty.getState().set({ status: "connecting", error: "" });
    try {
      const token = await this.token(charId);
      this.bind(await this.client!.create("hollow", { token }));
    } catch (e) {
      useParty.getState().set({ status: "error", error: errText(e) });
    }
  }

  async join(charId: number, code: string) {
    useParty.getState().set({ status: "connecting", error: "" });
    try {
      const token = await this.token(charId);
      this.bind(await this.client!.joinById(code.trim().toUpperCase(), { token }));
    } catch (e) {
      useParty.getState().set({ status: "error", error: errText(e) });
    }
  }

  private bind(room: Room) {
    this.room = room;
    this.leaving = false;
    const st = useParty.getState();
    st.set({ status: "lobby" });
    room.onMessage("hello", (m: { code: string; you: string; size: number }) => useParty.getState().set({ you: m.you, size: m.size }));
    room.onMessage("lobby", (l: Lobby) => useParty.getState().set({ lobby: l }));
    room.onMessage("msg", (m: { text: string; color?: string }) => this.hooks?.onMessage(m.text, m.color));
    room.onMessage("dungeon", (run: { dungeon: string; seed: number; level: number; you: string; rejoin?: boolean }) => {
      if (run.rejoin && this.session) {
        this.session.room = room;
        return;
      }
      this.session = new NetSession(room, run.you, run);
      this.hooks?.onDungeon(this.session, run);
    });
    room.onMessage("snap", (s: Snapshot) => this.session?.snapshot(s));
    room.onMessage("ev", (e: SimEvent[]) => this.session?.onEvents(e));
    room.onMessage("finish", (m: { success: boolean }) => {
      if (this.session) this.session.finished = { success: m.success };
      this.session = null;
    });
    room.onLeave((code) => {
      if (this.leaving || code === 1000) {
        this.reset();
        return;
      }
      void this.reconnect(room.reconnectionToken);
    });
  }

  private async reconnect(token: string) {
    useParty.getState().set({ status: "reconnecting" });
    this.hooks?.onMessage("Связь с отрядом потеряна, переподключаемся…", "#e0a84a");
    const deadline = Date.now() + 55_000;
    while (Date.now() < deadline) {
      try {
        const room = await new Client(this.url).reconnect(token);
        this.bind(room);
        this.hooks?.onMessage("Связь восстановлена.", "#7fe07f");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
    if (this.session) this.session.finished = { success: false };
    this.reset();
    useParty.getState().set({ status: "error", error: "Не удалось вернуться в отряд." });
  }

  ready(on: boolean) {
    this.room?.send("ready", { ready: on });
  }

  start(dungeon: string) {
    this.room?.send("start", { dungeon });
  }

  leave() {
    this.leaving = true;
    void this.room?.leave(true);
    this.reset();
  }

  private reset() {
    this.room = null;
    this.session = null;
    useParty.getState().set({ status: "idle", lobby: null, you: "" });
  }
}

function errText(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/not found|не найден/i.test(m)) return "Отряд с таким кодом не найден.";
  if (/locked|full/i.test(m)) return "Отряд уже полон или в подземелье.";
  if (/Failed to fetch|NetworkError|ECONNREFUSED|503|502/i.test(m)) return "Сервер кооператива недоступен (на бесплатном хостинге он просыпается до минуты — попробуйте ещё раз).";
  return m;
}

export const party = new Party();
