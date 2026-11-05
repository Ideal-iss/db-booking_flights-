import type RAPIER_NS from "@dimforge/rapier3d-compat";
import type { Element } from "../data/skills";
import type { CharacterData, Derived } from "../data/stats";
import type { EnemyDef } from "../data/enemies";
import type { Item } from "../data/items";

export interface Buff {
  id: string;
  until: number;
  dmgPct?: number;
  atkSpeedPct?: number;
  poison?: number;
  movePct?: number;
  drPct?: number;
  manaRegenMul?: number;
}

export interface SimPlayer {
  id: string;
  name: string;
  char: CharacterData;
  stats: Derived;
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  hp: number; mana: number; stamina: number;
  alive: boolean;
  sprinting: boolean;
  moving: boolean;
  blocking: boolean;
  blockStart: number;
  aiming: boolean;
  dodgeUntil: number;
  iframesUntil: number;
  staminaDelayUntil: number;
  attack: null | { heavy: boolean; start: number; hitAt: number; done: boolean };
  nextAttackAt: number;
  cooldowns: Record<string, number>;
  buffs: Buff[];
  absorb: number;
  absorbUntil: number;
  tauntUntil: number;
  tauntDr: number;
  whirlUntil: number;
  whirlNext: number;
  whirlDmg: number;
  potionReadyAt: number;
  potionsUsed: { health: number; mana: number };
  potionsFound: { health: number; mana: number };
  xp: number;
  level: number;
  kills: Record<string, number>;
  bosses: string[];
  gold: number;
  loot: Item[];
  lastPoseAt: number;
  allowJumpUntil: number;
  reviving: null | { target: string; until: number };
  collider: RAPIER_NS.Collider;
  body: RAPIER_NS.RigidBody;
  connected: boolean;
}

export type EnemyState = "idle" | "chase" | "windup" | "strike" | "recover" | "retreat" | "guard" | "lunge" | "dead";

export interface SimEnemy {
  id: string;
  type: string;
  def: EnemyDef;
  team: "enemy" | "ally";
  owner?: string;
  elite?: string;
  boss: boolean;
  level: number;
  x: number; y: number; z: number;
  yaw: number;
  hp: number; maxHp: number;
  dmg: number; speed: number; armor: number; xp: number;
  state: EnemyState;
  stateT: number;
  move: string;
  target: string | null;
  cd: number;
  awake: boolean;
  slowUntil: number; slowPct: number;
  freezeUntil: number;
  stunUntil: number;
  blindUntil: number;
  vulnUntil: number; vulnPct: number;
  dots: { dps: number; until: number; el: Element; by: string }[];
  kx: number; kz: number;
  guarding: boolean;
  phase: number;
  attack: string;
  attackData?: Record<string, number>;
  patternCd: Record<string, number>;
  expires?: number;
  deadAt: number;
  corpse: boolean;
  lastHitBy?: string;
  collider: RAPIER_NS.Collider | null;
  body: RAPIER_NS.RigidBody | null;
}

export interface Projectile {
  id: number;
  team: "player" | "enemy";
  owner: string;
  kind: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  dmg: number;
  element: Element;
  crit: boolean;
  explode?: number;
  pierce?: boolean;
  slow?: number;
  undeadBonus?: number;
  healAlly?: number;
  life: number;
  hit: Set<string>;
}

export interface Ground {
  id: number;
  kind: string;
  x: number; z: number;
  r: number;
  t0: number;
  until: number;
  owner: string;
  team: "player" | "enemy";
  data: Record<string, number>;
}

export interface Drop {
  id: string;
  x: number; z: number;
  item?: Item;
  gold?: number;
  potion?: "health" | "mana";
}

export type SimEvent = { t: string; [k: string]: unknown };

/** Компактный снимок для отрисовки и сети. */
export interface Snapshot {
  time: number;
  players: {
    id: string; name: string; cls: string; level: number;
    x: number; y: number; z: number; yaw: number; pitch: number;
    hp: number; maxHp: number; mana: number; maxMana: number; stamina: number; maxStamina: number;
    alive: boolean; blocking: boolean; aiming: boolean; atk: number; whirl: boolean; absorb: number;
    buffs: string[]; app: unknown; weapon: string; offhand: string; cds: Record<string, number>;
    reviving: number; connected: boolean;
  }[];
  enemies: {
    id: string; type: string; x: number; y: number; z: number; yaw: number; hp: number; maxHp: number;
    state: string; st: number; atk: string; elite?: string; boss: boolean; ally: boolean; frozen: boolean; stun: boolean; guard: boolean; phase: number; level: number;
  }[];
  projectiles: { id: number; kind: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number; el: string }[];
  grounds: { id: number; kind: string; x: number; z: number; r: number; t0: number; until: number; data: Record<string, number> }[];
  drops: { id: string; x: number; z: number; kind: "item" | "gold" | "potion"; rarity?: string; name?: string; icon?: string; amount?: number }[];
  opened: { chests: string[]; secrets: string[]; shrines: string[] };
  bossDead: boolean;
  exitOpen: boolean;
}
