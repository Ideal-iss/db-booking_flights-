/** Сессия забега: локальная симуляция (одиночная игра) или сервер Colyseus (кооператив). */
import type { Rapier } from "@shared/physics";
import { hashString } from "@shared/rng";
import { Sim, TICK, type Action, type PoseInput } from "@shared/sim/sim";
import { generateDungeon, type Dungeon } from "@shared/dungeon/generate";
import type { CharacterData } from "@shared/data/stats";
import type { SimEvent, Snapshot } from "@shared/sim/types";

export interface RunResult {
  xp: number;
  gold: number;
  kills: Record<string, number>;
  bosses: string[];
  potionsUsed: { health: number; mana: number };
  potionsFound: { health: number; mana: number };
}

export interface Session {
  selfId: string;
  coop: boolean;
  dungeon: Dungeon;
  finished: null | { success: boolean };
  paused: boolean;
  onSnapshot: (s: Snapshot) => void;
  onEvents: (e: SimEvent[]) => void;
  update(dt: number): void;
  sendPose(p: PoseInput): void;
  action(a: Action): void;
  trapActive(id: string): boolean;
  updateCharacter(c: CharacterData): void;
  result(): RunResult | null;
  dispose(): void;
}

export class LocalSession implements Session {
  selfId = "me";
  coop = false;
  sim: Sim;
  dungeon: Dungeon;
  finished: null | { success: boolean } = null;
  paused = false;
  onSnapshot: (s: Snapshot) => void = () => {};
  onEvents: (e: SimEvent[]) => void = () => {};
  private acc = 0;

  constructor(R: Rapier, opts: { dungeon: string; seed: number; level: number; char: CharacterData; name: string }) {
    this.sim = new Sim(R, { dungeon: opts.dungeon, seed: opts.seed, level: opts.level, players: [{ id: this.selfId, name: opts.name, char: opts.char }] });
    this.dungeon = this.sim.d;
  }

  update(dt: number) {
    if (this.paused || this.finished) return;
    this.acc += Math.min(dt, 0.25);
    let stepped = false;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      this.sim.step(TICK);
      stepped = true;
      const ev = this.sim.drainEvents();
      if (ev.length) this.onEvents(ev);
      if (this.sim.finished) {
        this.finished = { success: this.sim.finished.success };
        break;
      }
    }
    if (stepped) this.onSnapshot(this.sim.snapshot());
  }

  sendPose(p: PoseInput) {
    this.sim.setPose(this.selfId, p);
  }

  action(a: Action) {
    if (this.paused) return;
    this.sim.action(this.selfId, a);
    const ev = this.sim.drainEvents();
    if (ev.length) this.onEvents(ev);
    if (this.sim.finished && !this.finished) this.finished = { success: this.sim.finished.success };
  }

  trapActive(id: string) {
    return this.sim.trapActive(id);
  }

  updateCharacter(c: CharacterData) {
    this.sim.updateCharacter(this.selfId, c);
  }

  result(): RunResult | null {
    const r = this.sim.results().find((x) => x.id === this.selfId);
    return r ? { xp: r.xp, gold: r.gold, kills: r.kills, bosses: r.bosses, potionsUsed: r.potionsUsed, potionsFound: r.potionsFound } : null;
  }

  dispose() {
    this.sim.phys.world.free();
  }
}

/** Ловушки в кооперативе: та же формула фазы, время берётся из снимков сервера. */
export function trapPhaseActive(id: string, t: number) {
  const phase = (t + (hashString(id) % 30) / 10) % 3.2;
  return phase < 0.7;
}

export { generateDungeon };
