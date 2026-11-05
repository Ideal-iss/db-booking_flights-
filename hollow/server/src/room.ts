/** Комната отряда: лобби с кодом HOLLOW-XXXX, затем авторитетная симуляция забега. */
import { Room, type Client } from "colyseus";
import RAPIER from "@dimforge/rapier3d-compat";
import { Sim, type Action, type PoseInput } from "@shared/sim/sim";
import { DUNGEON_BY_ID, dungeonUnlocked } from "@shared/data/dungeons";
import type { CharacterData } from "@shared/data/stats";
import type { Item } from "@shared/data/items";
import { verifyToken, report, type TokenPayload } from "./django";

export const PARTY_SIZE = Number(process.env.PARTY_SIZE || 2); // архитектура рассчитана на 4

interface Member {
  sessionId: string;
  charId: number;
  name: string;
  cls: string;
  level: number;
  ready: boolean;
  connected: boolean;
  data: CharacterData & { name: string; cleared: string[] };
  runId?: string;
  rate: { t: number; pose: number; act: number };
}

const usedCodes = new Set<string>();
function makeCode() {
  for (let i = 0; i < 50; i++) {
    const code = `HOLLOW-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
  return `HOLLOW-${Date.now() % 100000}`;
}

export class HollowRoom extends Room {
  members = new Map<string, Member>();
  order: string[] = [];
  sim: Sim | null = null;
  run: { dungeon: string; seed: number; level: number } | null = null;
  private tickN = 0;
  private code = "";

  onCreate() {
    this.code = makeCode();
    this.roomId = this.code;
    this.maxClients = PARTY_SIZE;
    this.autoDispose = true;
    void this.setMetadata({ code: this.code });
    this.onMessage("ready", (c, m: { ready: boolean }) => {
      const mem = this.members.get(c.sessionId);
      if (!mem || this.sim) return;
      mem.ready = !!m?.ready;
      this.lobby();
    });
    this.onMessage("start", (c, m: { dungeon: string }) => void this.start(c, m));
    this.onMessage("pose", (c, p: PoseInput) => {
      const mem = this.members.get(c.sessionId);
      if (!this.sim || !mem || !this.limit(mem, "pose", 40)) return;
      if (!p || typeof p !== "object") return;
      this.sim.setPose(c.sessionId, {
        x: Number(p.x), y: Number(p.y) || 0, z: Number(p.z), yaw: Number(p.yaw) || 0, pitch: Number(p.pitch) || 0,
        sprint: !!p.sprint, moving: !!p.moving,
      });
    });
    this.onMessage("act", (c, a: Action) => {
      const mem = this.members.get(c.sessionId);
      if (!this.sim || !mem || !this.limit(mem, "act", 30)) return;
      if (!a || typeof a !== "object" || typeof (a as { t?: unknown }).t !== "string") return;
      if (a.t === "interact") {
        // подбирать предмет при полной сумке нельзя: проверяем по снимку персонажа
        if (mem.data.inventory.length >= 40 && this.nearItem(c.sessionId)) {
          c.send("msg", { text: "Сумка полна.", color: "#e0505a" });
          return;
        }
      }
      this.sim.action(c.sessionId, a);
    });
    this.onMessage("chat", (c, m: { text: string }) => {
      const mem = this.members.get(c.sessionId);
      if (!mem || typeof m?.text !== "string") return;
      this.broadcast("msg", { text: `${mem.name}: ${m.text.slice(0, 120)}`, color: "#d8cdb2" });
    });
  }

  onAuth(_client: Client, options: { token?: string }) {
    const payload = verifyToken(options?.token || "");
    if (!payload) throw new Error("Неверный или просроченный пропуск. Обновите страницу.");
    return payload;
  }

  onJoin(client: Client, _options: unknown, auth: TokenPayload) {
    for (const m of this.members.values()) {
      if (m.charId === auth.char) throw new Error("Этот герой уже в отряде.");
    }
    if (this.sim) throw new Error("Отряд уже в подземелье.");
    const data = auth.data as Member["data"];
    this.members.set(client.sessionId, {
      sessionId: client.sessionId, charId: auth.char, name: auth.name, cls: data.cls, level: data.level, ready: false, connected: true, data,
      rate: { t: Date.now(), pose: 0, act: 0 },
    });
    this.order.push(client.sessionId);
    client.send("hello", { code: this.code, you: client.sessionId, size: PARTY_SIZE });
    this.lobby();
  }

  async onLeave(client: Client, consented: boolean) {
    const mem = this.members.get(client.sessionId);
    if (!mem) return;
    mem.connected = false;
    const sp = this.sim?.players.get(client.sessionId);
    if (sp) sp.connected = false;
    this.lobby();
    try {
      if (consented) throw new Error("left");
      // переподключение в течение 60 секунд
      await this.allowReconnection(client, 60);
      mem.connected = true;
      if (sp) sp.connected = true;
      if (this.sim && this.run) client.send("dungeon", { ...this.run, you: client.sessionId, rejoin: true });
      this.lobby();
    } catch {
      this.members.delete(client.sessionId);
      this.order = this.order.filter((id) => id !== client.sessionId);
      if (this.sim) {
        // ушедший получает итог «провал», остальные продолжают
        if (mem.runId) void this.finishMember(mem, false);
        this.sim.removePlayer(client.sessionId);
        if (this.sim.players.size === 0) this.endRun(false);
      }
      this.lobby();
    }
  }

  onDispose() {
    usedCodes.delete(this.code);
  }

  private limit(mem: Member, kind: "pose" | "act", perSec: number) {
    const now = Date.now();
    if (now - mem.rate.t > 1000) {
      mem.rate = { t: now, pose: 0, act: 0 };
    }
    mem.rate[kind]++;
    return mem.rate[kind] <= perSec;
  }

  private nearItem(id: string) {
    const p = this.sim?.players.get(id);
    if (!p || !this.sim) return false;
    for (const d of this.sim.drops.values()) if (d.item && Math.hypot(d.x - p.x, d.z - p.z) < 2.4) return true;
    return false;
  }

  private lobby() {
    const host = this.order[0];
    this.broadcast("lobby", {
      code: this.code,
      host,
      inRun: !!this.sim,
      dungeon: this.run?.dungeon,
      members: this.order.map((id) => {
        const m = this.members.get(id)!;
        return { id, name: m.name, cls: m.cls, level: m.level, ready: m.ready, connected: m.connected, cleared: m.data.cleared };
      }),
    });
  }

  private async start(client: Client, m: { dungeon: string }) {
    if (this.sim) return;
    if (client.sessionId !== this.order[0]) return client.send("msg", { text: "Начать может только лидер отряда.", color: "#e0505a" });
    const theme = DUNGEON_BY_ID[m?.dungeon];
    if (!theme) return;
    const host = this.members.get(client.sessionId)!;
    if (!dungeonUnlocked(theme, host.data.cleared)) return client.send("msg", { text: "Лидер ещё не открыл это подземелье.", color: "#e0505a" });
    const members = this.order.map((id) => this.members.get(id)!).filter((x) => x.connected);
    if (members.some((x) => !x.ready)) return client.send("msg", { text: "Не все готовы.", color: "#e0505a" });
    const seed = 1 + Math.floor(Math.random() * 2_000_000_000);
    let level = theme.level;
    try {
      const r = await report<{ level: number; runs: Record<string, string> }>({ kind: "start", dungeon: theme.id, seed, chars: members.map((x) => x.charId) });
      level = r.level;
      for (const x of members) x.runId = r.runs[String(x.charId)];
    } catch (e) {
      return this.broadcast("msg", { text: `Сервер игры недоступен: ${(e as Error).message}`, color: "#e0505a" });
    }
    await this.lock();
    this.run = { dungeon: theme.id, seed, level };
    this.sim = new Sim(RAPIER, {
      dungeon: theme.id, seed, level,
      players: members.map((x) => ({ id: x.sessionId, name: x.name, char: x.data })),
    });
    for (const x of members) this.clients.find((c) => c.sessionId === x.sessionId)?.send("dungeon", { ...this.run, you: x.sessionId });
    this.tickN = 0;
    this.setSimulationInterval(() => this.tick(), 50);
    this.lobby();
  }

  private tick() {
    const sim = this.sim;
    if (!sim) return;
    sim.step(0.05);
    const ev = sim.drainEvents();
    for (const e of ev) {
      if (e.t === "pickup" && e.item) void this.commitPickup(e.p as string, e.item as Item);
    }
    if (ev.length) this.broadcast("ev", ev);
    this.tickN++;
    if (this.tickN % 2 === 0) this.broadcast("snap", sim.snapshot());
    if (sim.finished) this.endRun(sim.finished.success);
  }

  private async commitPickup(sessionId: string, item: Item) {
    const mem = this.members.get(sessionId);
    if (!mem?.runId) return;
    try {
      await report({ kind: "pickup", run: mem.runId, item });
      mem.data.inventory.push({ ...item, pos: -1 });
    } catch (e) {
      this.clients.find((c) => c.sessionId === sessionId)?.send("msg", { text: `Предмет не сохранён: ${(e as Error).message}`, color: "#e0505a" });
    }
  }

  private async finishMember(mem: Member, success: boolean) {
    const res = this.sim?.results().find((r) => r.id === mem.sessionId);
    const runId = mem.runId;
    mem.runId = undefined;
    if (!runId || !res) return;
    try {
      await report({ kind: "finish", run: runId, success, result: res });
    } catch (e) {
      console.error("finish report failed", e);
    }
  }

  private endRun(success: boolean) {
    const sim = this.sim;
    if (!sim) return;
    for (const mem of this.members.values()) if (mem.runId) void this.finishMember(mem, success);
    this.broadcast("finish", { success });
    this.setSimulationInterval(undefined);
    sim.phys.world.free();
    this.sim = null;
    this.run = null;
    for (const mem of this.members.values()) mem.ready = false;
    void this.unlock();
    this.lobby();
  }
}
