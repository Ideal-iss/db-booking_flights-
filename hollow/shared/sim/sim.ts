/** Авторитетная симуляция забега: игроки, враги, снаряды, добыча.
 *  В одиночной игре работает в браузере, в кооперативе — на сервере Colyseus. */
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { Rng, clamp, hashString } from "../rng";
import { CELL, Cell, ceilAt, generateDungeon, walkable, worldToCell, type Dungeon } from "../dungeon/generate";
import { buildDungeonPhysics, collapseCrackPhysics, groups, lineOfSight, openSecret, rayToWall, GROUP_ENEMY, GROUP_PLAYER, GROUP_WALL, type DungeonPhysics, type Rapier } from "../physics";
import { CHASM_Y, Liquid, collapseCrack, groundAt, isChasm, liquidAt, openDoorCell, passable } from "../dungeon/terrain";
import { ENEMIES, scaleEnemy } from "../data/enemies";
import { BASE_BY_ID, POTIONS, rollLoot, type DropTier } from "../data/items";
import { deriveStats, levelFromXp, type CharacterData } from "../data/stats";
import type { Element } from "../data/skills";
import { updateEnemy } from "./ai";
import { useSkill } from "./skills";
import type { Buff, Drop, Ground, Projectile, SimEnemy, SimEvent, SimPlayer, Snapshot } from "./types";

export const TICK = 1 / 20;

export interface PlayerInit {
  id: string;
  name: string;
  char: CharacterData;
}

export interface PoseInput {
  x: number; y: number; z: number;
  yaw: number; pitch: number;
  sprint: boolean; moving: boolean;
}

export type Action =
  | { t: "attack"; heavy?: boolean; draw?: number }
  | { t: "block"; on: boolean }
  | { t: "aim"; on: boolean }
  | { t: "dodge" }
  | { t: "skill"; slot: number; aim?: { x: number; y: number; z: number } }
  | { t: "interact" }
  | { t: "potion"; kind: "health" | "mana" };

const SHRINE_BUFFS: Record<string, Omit<Buff, "until">> = {
  power: { id: "shrine_power", dmgPct: 0.3 },
  fortitude: { id: "shrine_fortitude", drPct: 0.2 },
  haste: { id: "shrine_haste", movePct: 0.2, atkSpeedPct: 0.2 },
  clarity: { id: "shrine_clarity", manaRegenMul: 3 },
};
export const SHRINE_NAMES: Record<string, string> = {
  power: "Святыня силы: +30% урона",
  fortitude: "Святыня стойкости: −20% получаемого урона",
  haste: "Святыня быстроты: +20% к скорости",
  clarity: "Святыня ясности: ×3 восстановление маны",
};

export const ELEMENT_LIST: Element[] = ["physical", "fire", "cold", "dark", "holy", "arcane", "poison", "lightning"];

export class Sim {
  R: Rapier;
  d: Dungeon;
  phys: DungeonPhysics;
  rng: Rng;
  t = 0;
  players = new Map<string, SimPlayer>();
  enemies = new Map<string, SimEnemy>();
  projectiles: Projectile[] = [];
  grounds: Ground[] = [];
  drops = new Map<string, Drop>();
  events: SimEvent[] = [];
  opened = {
    chests: new Set<string>(), secrets: new Set<string>(), shrines: new Set<string>(), broken: new Set<string>(), chandeliers: new Set<string>(), mimics: new Set<string>(),
    doors: new Set<string>(), keys: new Set<string>(), plates: new Set<string>(), cracks: new Set<string>(),
  };
  /** Ключи у отряда (общие на всех). */
  keyCount = 0;
  /** Сколько стоят на трещине — пол рушится не сразу. */
  private crackT = new Map<string, number>();
  /** Последняя твёрдая точка игрока — сюда возвращаем после падения в пропасть. */
  private safe = new Map<string, { x: number; z: number }>();
  private hazardAt = 0;
  leverCd = new Map<string, number>();
  fuses: { id: string; x: number; z: number; at: number; by: string | null }[] = [];
  colliderOwner = new Map<number, string>();
  controller: RAPIER_NS.KinematicCharacterController;
  flow: Int16Array;
  flowAt = -1;
  bossDead = false;
  finished: null | { success: boolean; by: string; how: "exit" | "entrance" | "wipe" } = null;
  private nextId = 1;
  private dropSeq = 0;
  playerCount: number;

  constructor(R: Rapier, opts: { dungeon: string; seed: number; level: number; players: PlayerInit[] }) {
    this.R = R;
    this.d = generateDungeon(opts.dungeon, opts.seed, opts.level);
    this.phys = buildDungeonPhysics(R, this.d);
    this.rng = new Rng(opts.seed ^ 0x5bd1e995);
    this.controller = this.phys.world.createCharacterController(0.02);
    this.controller.setSlideEnabled(true);
    this.flow = new Int16Array(this.d.w * this.d.h);
    this.playerCount = opts.players.length;
    opts.players.forEach((p, i) => this.addPlayer(p, i));
    for (const s of this.d.spawns) this.spawnEnemy(s.id, s.type, s.x, s.z, opts.level, { elite: s.elite, boss: s.boss, champion: s.champion });
  }

  // ------------------------------------------------------------ игроки
  addPlayer(init: PlayerInit, index = this.players.size) {
    const stats = deriveStats(init.char);
    const sx = this.d.start.x + (index % 2 ? 1.2 : -1.2) * Math.min(index, 1);
    const sz = this.d.start.z + Math.floor(index / 2) * 1.2;
    const body = this.phys.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(sx, 0.9, sz));
    const collider = this.phys.world.createCollider(
      this.R.ColliderDesc.capsule(0.5, 0.38).setCollisionGroups(groups(GROUP_PLAYER, GROUP_WALL | GROUP_ENEMY | GROUP_PLAYER)),
      body,
    );
    const p: SimPlayer = {
      id: init.id, name: init.name, char: structuredClone(init.char), stats,
      x: sx, y: groundAt(this.d, sx, sz), z: sz, yaw: this.d.start.yaw, pitch: 0,
      hp: stats.maxHp, mana: stats.maxMana, stamina: stats.maxStamina,
      alive: true, sprinting: false, moving: false, blocking: false, blockStart: -9, aiming: false,
      dodgeUntil: 0, iframesUntil: 0, staminaDelayUntil: 0,
      attack: null, nextAttackAt: 0, cooldowns: {}, buffs: [], absorb: 0, absorbUntil: 0, tauntUntil: 0, tauntDr: 0,
      whirlUntil: 0, whirlNext: 0, whirlDmg: 0, potionReadyAt: 0,
      potionsUsed: { health: 0, mana: 0 }, potionsFound: { health: 0, mana: 0 },
      xp: 0, level: init.char.level, kills: {}, bosses: [], gold: 0, loot: [],
      lastPoseAt: 0, allowJumpUntil: 0, reviving: null, collider, body, connected: true,
    };
    this.colliderOwner.set(collider.handle, p.id);
    this.players.set(p.id, p);
    return p;
  }

  removePlayer(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.colliderOwner.delete(p.collider.handle);
    this.phys.world.removeRigidBody(p.body);
    this.players.delete(id);
    for (const e of this.enemies.values()) if (e.target === id) e.target = null;
  }

  /** Новые характеристики после смены экипировки. */
  updateCharacter(id: string, char: CharacterData) {
    const p = this.players.get(id);
    if (!p) return;
    const ratioHp = p.hp / p.stats.maxHp, ratioMp = p.mana / p.stats.maxMana;
    p.char = structuredClone({ ...char, xp: p.char.xp, level: p.level });
    p.stats = deriveStats(p.char);
    p.hp = Math.max(1, p.stats.maxHp * ratioHp);
    p.mana = p.stats.maxMana * ratioMp;
  }

  setPose(id: string, pose: PoseInput) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.finished) return;
    const dt = Math.max(0.016, Math.min(0.5, this.t - p.lastPoseAt));
    p.lastPoseAt = this.t;
    const buffMove = this.buffSum(p, "movePct");
    const sprint = pose.sprint && p.stamina > 1;
    let maxSpeed = p.stats.moveSpeed * (1 + buffMove) * (sprint ? 1.6 : 1) * (p.blocking || p.aiming ? 0.55 : 1);
    if (this.t < p.dodgeUntil + 0.2) maxSpeed = Math.max(maxSpeed, 16);
    const dist = Math.hypot(pose.x - p.x, pose.z - p.z);
    const allowed = maxSpeed * dt * 1.35 + 0.5;
    let nx = pose.x, nz = pose.z;
    // над пропастью тоже можно оказаться — оттуда падают
    const cell = (x: number, z: number) => walkable(this.d, worldToCell(x), worldToCell(z), this.opened.secrets) || isChasm(this.d, x, z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
    if (dist > allowed || !cell(nx, nz)) {
      // Подозрительное перемещение — оставляем на месте и поправляем клиента.
      if (dist > allowed && cell(nx, nz)) {
        const k = allowed / dist;
        nx = p.x + (pose.x - p.x) * k;
        nz = p.z + (pose.z - p.z) * k;
      } else {
        nx = p.x; nz = p.z;
      }
      this.events.push({ t: "correct", p: id, x: nx, y: p.y, z: nz });
    }
    p.x = nx; p.z = nz;
    const ground = groundAt(this.d, nx, nz);
    if (isChasm(this.d, nx, nz)) {
      p.y = clamp(pose.y, CHASM_Y, 3);
      if (pose.y < -1.6) return this.fall(p);
    } else {
      // по высоте — не выше прыжка над полом; ниже пола (в ямах до приземления) можно
      // прыжок поднимает героя примерно на 1.3 м над полом
      p.y = clamp(pose.y, ground - 3, ground + (this.t < p.allowJumpUntil ? 2 : 1.7));
      // точка возврата — центр клетки, где стоял твёрдо (у края легко снова соскользнуть)
      if (Math.abs(pose.y - ground) < 0.5 && !liquidAt(this.d, nx, nz)) this.safe.set(p.id, { x: (worldToCell(nx) + 0.5) * CELL, z: (worldToCell(nz) + 0.5) * CELL });
    }
    p.yaw = pose.yaw;
    p.pitch = clamp(pose.pitch, -1.5, 1.5);
    p.moving = pose.moving && dist > 0.01;
    p.sprinting = sprint && p.moving;
    p.body.setNextKinematicTranslation({ x: p.x, y: p.y + 0.9, z: p.z });
  }

  action(id: string, a: Action) {
    const p = this.players.get(id);
    if (!p || this.finished) return;
    if (!p.alive) return;
    switch (a.t) {
      case "attack": return this.startAttack(p, !!a.heavy, a.draw ?? 1);
      case "block":
        if (a.on && !p.blocking) p.blockStart = this.t;
        p.blocking = a.on && p.stats.secondary !== "aim";
        return;
      case "aim":
        p.aiming = a.on && p.stats.secondary === "aim";
        return;
      case "dodge":
        if (p.stamina < 20 || this.t < p.dodgeUntil + 0.25) return;
        p.stamina -= 20;
        p.staminaDelayUntil = this.t + 0.8;
        p.dodgeUntil = this.t + 0.3;
        p.iframesUntil = this.t + 0.35;
        this.events.push({ t: "dodge", p: id });
        return;
      case "skill": return useSkill(this, p, a.slot, a.aim);
      case "interact": return this.interact(p);
      case "potion": return this.drinkPotion(p, a.kind);
    }
  }

  /** Упал в пропасть: урон и возврат к последнему краю. */
  private fall(p: SimPlayer) {
    const s = this.safe.get(p.id) || { x: this.d.start.x, z: this.d.start.z };
    p.x = s.x; p.z = s.z;
    p.y = groundAt(this.d, s.x, s.z);
    p.body.setNextKinematicTranslation({ x: p.x, y: p.y + 0.9, z: p.z });
    this.events.push({ t: "fell", p: p.id });
    this.events.push({ t: "correct", p: p.id, x: p.x, y: p.y, z: p.z });
    this.damagePlayer(p, p.stats.maxHp * 0.18, "physical", null, { aoe: true });
  }

  private drinkPotion(p: SimPlayer, kind: "health" | "mana") {
    const have = (p.char.potions[kind] || 0) + p.potionsFound[kind] - p.potionsUsed[kind];
    if (have <= 0 || this.t < p.potionReadyAt) return;
    p.potionReadyAt = this.t + 1;
    p.potionsUsed[kind]++;
    if (kind === "health") p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * POTIONS.health.heal);
    else p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.maxMana * POTIONS.mana.heal);
    this.events.push({ t: "potion", p: p.id, kind });
  }

  potionsLeft(p: SimPlayer, kind: "health" | "mana") {
    return (p.char.potions[kind] || 0) + p.potionsFound[kind] - p.potionsUsed[kind];
  }

  buffSum(p: SimPlayer, key: keyof Buff): number {
    let s = 0;
    for (const b of p.buffs) if (b.until > this.t) s += (b[key] as number) || 0;
    return s;
  }

  // ------------------------------------------------------------ атаки игрока
  attackInterval(p: SimPlayer, heavy: boolean) {
    const speed = p.stats.attackSpeed * (1 + this.buffSum(p, "atkSpeedPct"));
    const base = p.stats.attackMode === "melee" ? (heavy ? 1.05 : 0.62) : p.stats.attackMode === "bow" ? 0.55 : 0.5;
    return base / speed;
  }

  private startAttack(p: SimPlayer, heavy: boolean, draw: number) {
    if (this.t < p.nextAttackAt || p.whirlUntil > this.t) return;
    const mode = p.stats.attackMode;
    if (mode === "melee") {
      const cost = heavy ? 18 : 6;
      if (p.stamina < cost * 0.5) return;
      p.stamina = Math.max(0, p.stamina - cost);
      p.staminaDelayUntil = this.t + 0.7;
      const interval = this.attackInterval(p, heavy);
      p.attack = { heavy, start: this.t, hitAt: this.t + interval * (heavy ? 0.45 : 0.35), done: false };
      p.nextAttackAt = this.t + interval;
      this.events.push({ t: "swing", p: p.id, heavy });
    } else if (mode === "bow") {
      if (p.stamina < 3) return;
      p.stamina -= 3;
      p.nextAttackAt = this.t + this.attackInterval(p, false);
      const k = clamp(draw, 0.2, 1);
      const shots = p.stats.flags.doubleShot ? 2 : 1;
      for (let i = 0; i < shots; i++) {
        const spread = shots > 1 ? (i - 0.5) * 0.06 : 0;
        const { dmg, crit } = this.rollWeapon(p, 0.45 + 0.85 * k);
        this.fireProjectile(p, { kind: "arrow", speed: 26 + 26 * k, dmg, crit, element: "physical", size: 0.12, yawOffset: spread, gravity: true });
      }
      this.events.push({ t: "shoot", p: p.id, draw: k });
    } else {
      const cost = 2;
      if (p.mana < cost) {
        this.events.push({ t: "nomana", p: p.id });
        p.nextAttackAt = this.t + 0.3;
        return;
      }
      p.mana -= cost;
      p.nextAttackAt = this.t + this.attackInterval(p, false);
      const { dmg, crit } = this.rollSpell(p, 0.75);
      const el = p.stats.boltElement as Element;
      this.fireProjectile(p, { kind: el, speed: 26, dmg, crit, element: el, size: 0.18, undeadBonus: el === "holy" ? 0.5 : 0 });
      this.events.push({ t: "cast", p: p.id, skill: "bolt" });
    }
  }

  rollWeapon(p: SimPlayer, mult: number, forceCrit = false) {
    const [lo, hi] = p.stats.dmg;
    let dmg = this.rng.range(lo, hi) * mult;
    dmg *= 1 + p.stats.dmgPct + this.buffSum(p, "dmgPct") + this.berserk(p);
    const crit = forceCrit || this.rng.chance(p.stats.critChance + this.buffSum(p, "critChance"));
    if (crit) dmg *= p.stats.critDmg;
    return { dmg, crit };
  }

  rollSpell(p: SimPlayer, mult: number) {
    const [lo, hi] = p.stats.spell;
    let dmg = this.rng.range(lo, hi) * mult;
    dmg *= 1 + p.stats.spellPct + this.buffSum(p, "dmgPct") + this.berserk(p);
    const crit = this.rng.chance((p.stats.critChance + this.buffSum(p, "critChance")) * 0.6);
    if (crit) dmg *= 1 + (p.stats.critDmg - 1) * 0.7;
    return { dmg, crit };
  }

  private berserk(p: SimPlayer) {
    return p.stats.flags.berserk ? Math.min(1, p.stats.flags.berserk) * (1 - p.hp / p.stats.maxHp) : 0;
  }

  forward(p: { yaw: number }) {
    return { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  }

  /** Враги в секторе перед игроком. */
  enemiesInArc(p: SimPlayer, range: number, arc: number, team: "enemy" | "ally" = "enemy") {
    const f = this.forward(p);
    const out: SimEnemy[] = [];
    for (const e of this.enemies.values()) {
      if (e.state === "dead" || e.team !== team) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const dist = Math.hypot(dx, dz) - e.def.radius;
      if (dist > range) continue;
      const ang = Math.acos(clamp((dx * f.x + dz * f.z) / Math.max(0.001, Math.hypot(dx, dz)), -1, 1));
      if (dist > 0.6 && ang > arc / 2) continue;
      if (!lineOfSight(this.R, this.phys, p.x, 1.2, p.z, e.x, 1.0, e.z)) continue;
      out.push(e);
    }
    return out.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  }

  private resolveMelee(p: SimPlayer) {
    const atk = p.attack!;
    atk.done = true;
    const reach = p.stats.weaponType === "dagger" ? 2.3 : p.stats.weaponType === "axe" ? 2.8 : 2.6;
    const targets = this.enemiesInArc(p, reach, atk.heavy ? 2.0 : 1.5);
    const max = atk.heavy ? 6 : 2;
    let hitAny = false;
    for (const e of targets.slice(0, max)) {
      const backstab = p.stats.flags.backstab && this.isBehind(p, e);
      const { dmg, crit } = this.rollWeapon(p, atk.heavy ? 1.9 : 1, !!backstab && this.rng.chance(p.stats.critChance));
      this.damageEnemy(e, dmg, "physical", p, { crit, knock: atk.heavy ? 3.5 : 1.2, melee: true });
      hitAny = true;
    }
    if (this.breakInArc(p, reach, atk.heavy ? 2.0 : 1.5)) hitAny = true;
    if (!hitAny) this.events.push({ t: "whiff", p: p.id });
  }

  /** Разбить урну или ящик. by — кто разбил (для золота и событий). */
  breakObject(id: string, by: SimPlayer | null) {
    if (this.opened.broken.has(id)) return;
    const b = this.d.breakables.find((x) => x.id === id);
    if (!b) return;
    this.opened.broken.add(id);
    this.events.push({ t: "break", id, x: b.x, z: b.z, kind: b.kind, p: by?.id });
    if (b.kind === "oil") {
      // масляная бочка вспыхивает через мгновение — успей отойти
      this.fuses.push({ id, x: b.x, z: b.z, at: this.t + 0.35, by: by?.id || null });
      this.events.push({ t: "fuse", id, x: b.x, z: b.z });
      return;
    }
    this.spawnLoot(b.x, b.z, "pot", `pot:${id}`, by ? by.stats.goldFind : 0);
  }

  private oilExplode(f: { id: string; x: number; z: number; by: string | null }) {
    const by = f.by ? this.players.get(f.by) || null : null;
    const r = 3.6;
    const dmg = 34 + this.d.level * 10;
    this.events.push({ t: "explode", x: f.x, z: f.z, r, el: "fire" });
    for (const e of this.enemies.values()) {
      if (e.state === "dead" || e.team !== "enemy") continue;
      const d = Math.hypot(e.x - f.x, e.z - f.z);
      if (d < r + e.def.radius) this.damageEnemy(e, dmg * (d < 1.5 ? 1 : 0.7), "fire", by, { knock: 2.5 });
    }
    for (const p of this.players.values()) {
      if (Math.hypot(p.x - f.x, p.z - f.z) < r) this.damagePlayer(p, dmg * 0.45, "fire", null, { aoe: true });
    }
    this.addGround({ kind: "fire_pool", x: f.x, z: f.z, r: 2.4, until: this.t + 5, owner: f.by || "", team: "player", data: { dps: 10 + this.d.level * 3 } });
    this.breakInRadius(f.x, f.z, r, by);
    this.shakeChandeliers(f.x, f.z, r + 1, by);
  }

  /** Люстра срывается: через мгновение падает и давит всех под собой. */
  dropChandelier(id: string, by: SimPlayer | null) {
    if (this.opened.chandeliers.has(id)) return;
    const c = this.d.chandeliers.find((x) => x.id === id);
    if (!c) return;
    this.opened.chandeliers.add(id);
    this.events.push({ t: "chandelier", id, x: c.x, z: c.z, p: by?.id });
    this.addGround({ kind: "chandelier_fall", x: c.x, z: c.z, r: 2.7, until: this.t + 0.8, owner: by?.id || "", team: "player", data: { dmg: 50 + this.d.level * 13 } });
  }

  shakeChandeliers(x: number, z: number, r: number, by: SimPlayer | null) {
    for (const c of this.d.chandeliers) if (!this.opened.chandeliers.has(c.id) && Math.hypot(c.x - x, c.z - z) < r) this.dropChandelier(c.id, by);
  }

  pullLever(id: string, p: SimPlayer) {
    const lv = this.d.levers.find((x) => x.id === id);
    if (!lv) return;
    if ((this.leverCd.get(id) || 0) > this.t) {
      this.events.push({ t: "lever_wait", id, p: p.id });
      return;
    }
    this.leverCd.set(id, this.t + 12);
    this.events.push({ t: "lever", id, x: lv.x, z: lv.z, p: p.id });
    for (const v of lv.vents) this.addGround({ kind: "vent_warn", x: v.x, z: v.z, r: 1.35, until: this.t + 0.7, owner: p.id, team: "player", data: { dps: 26 + this.d.level * 7 } });
  }

  wakeMimic(chestId: string, p: SimPlayer | null) {
    if (this.opened.mimics.has(chestId)) return;
    const c = this.d.chests.find((x) => x.id === chestId);
    if (!c) return;
    this.opened.mimics.add(chestId);
    this.opened.chests.add(chestId);
    const m = this.spawnEnemy(`mimic_${chestId}`, "mimic", c.x, c.z, this.d.level);
    m.awake = true;
    m.yaw = c.rot;
    if (p) m.target = p.id;
    this.events.push({ t: "mimic", id: m.id, x: c.x, z: c.z });
  }

  breakInArc(p: SimPlayer, range: number, arc: number) {
    const f = this.forward(p);
    let any = false;
    for (const b of this.d.breakables) {
      if (this.opened.broken.has(b.id)) continue;
      const dx = b.x - p.x, dz = b.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range + 0.3) continue;
      const ang = Math.acos(clamp((dx * f.x + dz * f.z) / Math.max(0.001, dist), -1, 1));
      if (dist > 0.6 && ang > arc / 2) continue;
      this.breakObject(b.id, p);
      any = true;
    }
    return any;
  }

  breakInRadius(x: number, z: number, r: number, by: SimPlayer | null) {
    for (const b of this.d.breakables) if (!this.opened.broken.has(b.id) && Math.hypot(b.x - x, b.z - z) < r + 0.3) this.breakObject(b.id, by);
  }

  isBehind(p: SimPlayer, e: SimEnemy) {
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const dx = p.x - e.x, dz = p.z - e.z;
    return (dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz)) < -0.3;
  }

  fireProjectile(
    p: SimPlayer,
    o: { kind: string; speed: number; dmg: number; crit: boolean; element: Element; size: number; explode?: number; pierce?: boolean; slow?: number; undeadBonus?: number; healAlly?: number; yawOffset?: number; gravity?: boolean; freeze?: number; life?: number },
  ) {
    const yaw = p.yaw + (o.yawOffset || 0);
    const cp = Math.cos(p.pitch);
    const dir = { x: -Math.sin(yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(yaw) * cp };
    this.projectiles.push({
      id: this.nextId++, team: "player", owner: p.id, kind: o.kind,
      x: p.x + dir.x * 0.6, y: p.y + 1.45 + dir.y * 0.6, z: p.z + dir.z * 0.6,
      vx: dir.x * o.speed, vy: dir.y * o.speed + (o.gravity ? 0.5 : 0), vz: dir.z * o.speed,
      size: o.size, dmg: o.dmg, element: o.element, crit: o.crit, explode: o.explode, pierce: o.pierce,
      slow: o.slow, undeadBonus: o.undeadBonus, healAlly: o.healAlly, freeze: o.freeze, life: o.life || 2.6, hit: new Set(),
    });
  }

  /** Снаряд игрока из произвольной точки (ловушки, гидра, призванные маги). */
  pointProjectile(owner: string, x: number, y: number, z: number, tx: number, ty: number, tz: number, o: { kind: string; speed: number; dmg: number; crit?: boolean; element: Element; size: number; explode?: number; pierce?: boolean }) {
    let dx = tx - x, dy = ty - y, dz = tz - z;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    this.projectiles.push({
      id: this.nextId++, team: "player", owner, kind: o.kind, x, y, z,
      vx: dx * o.speed, vy: dy * o.speed, vz: dz * o.speed,
      size: o.size, dmg: o.dmg, element: o.element, crit: !!o.crit, explode: o.explode, pierce: o.pierce, life: 2.6, hit: new Set(),
    });
  }

  enemyProjectile(e: SimEnemy, tx: number, ty: number, tz: number, o: { kind: string; speed: number; dmg: number; element: Element; size: number; spread?: number; explode?: number }) {
    const sx = e.x, sy = e.y + e.def.height * 0.65, sz = e.z;
    let dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    if (o.spread) {
      const c = Math.cos(o.spread), s = Math.sin(o.spread);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    const ally = e.team === "ally";
    this.projectiles.push({
      id: this.nextId++, team: ally ? "player" : "enemy", owner: ally ? e.owner || "" : e.id, kind: o.kind,
      x: sx + dx * (e.def.radius + 0.3), y: sy, z: sz + dz * (e.def.radius + 0.3),
      vx: dx * o.speed, vy: dy * o.speed, vz: dz * o.speed,
      size: o.size, dmg: o.dmg, element: o.element, crit: false, explode: o.explode, life: 3.5, hit: new Set(),
    });
  }

  // ------------------------------------------------------------ урон
  damageEnemy(
    e: SimEnemy,
    amount: number,
    element: Element,
    by: SimPlayer | SimEnemy | null,
    o: { crit?: boolean; knock?: number; stun?: number; freeze?: number; slow?: number; melee?: boolean; undeadBonus?: number; noDot?: boolean } = {},
  ) {
    if (e.state === "dead" || amount <= 0) return;
    if (e.phased) {
      this.events.push({ t: "phased", id: e.id, x: e.x, z: e.z });
      if (!e.awake && e.team === "enemy") this.wake(e, by?.id);
      return;
    }
    const player = by && "char" in by ? (by as SimPlayer) : null;
    let dmg = amount;
    if (player) {
      if (e.def.undead) dmg *= 1 + player.stats.undeadPct + (o.undeadBonus || 0);
      if (e.vulnUntil > this.t) dmg *= 1 + e.vulnPct;
    }
    if (element === "physical") dmg *= 1 - e.armor / (e.armor + 60);
    // Рыцарь-мертвец держит щит: удары спереди почти не проходят.
    let blocked = false;
    if (e.guarding && by && o.melee) {
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
      const dx = by.x - e.x, dz = by.z - e.z;
      if ((dx * fx + dz * fz) / Math.max(0.01, Math.hypot(dx, dz)) > 0.3) {
        dmg *= 0.25;
        blocked = true;
      }
    }
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    if (by) e.lastHitBy = by.id;
    if (!e.awake && e.team === "enemy") this.wake(e, player?.id);
    if (player && e.team === "enemy" && (!e.target || this.rng.chance(0.2))) e.target = player.id;
    this.events.push({ t: "hit", id: e.id, x: e.x, y: e.y + e.def.height * 0.6, z: e.z, amount: dmg, crit: !!o.crit, el: element, by: by?.id, blocked });

    if (o.knock && !e.boss) {
      const k = o.knock * (1 - e.def.poise);
      if (by && k > 0) {
        const dx = e.x - by.x, dz = e.z - by.z, l = Math.hypot(dx, dz) || 1;
        e.kx += (dx / l) * k * 4;
        e.kz += (dz / l) * k * 4;
      }
    }
    if (o.stun && !e.boss) e.stunUntil = Math.max(e.stunUntil, this.t + o.stun);
    if (o.stun && e.boss) e.stunUntil = Math.max(e.stunUntil, this.t + o.stun * 0.25);
    if (o.freeze) e.freezeUntil = Math.max(e.freezeUntil, this.t + (e.boss ? o.freeze * 0.3 : o.freeze));
    if (o.slow) { e.slowUntil = this.t + 2.5; e.slowPct = Math.max(e.slowPct * (e.slowUntil > this.t ? 1 : 0), o.slow); }
    if (player && !o.noDot) {
      if (player.stats.flags.chillOnHit) { e.slowUntil = this.t + 2; e.slowPct = Math.max(e.slowPct, player.stats.flags.chillOnHit); }
      if (player.stats.flags.burnOnHit && this.rng.chance(player.stats.flags.burnOnHit)) e.dots.push({ dps: dmg * 0.3, until: this.t + 3, el: "fire", by: player.id });
      const poison = this.buffSum(player, "poison");
      if (poison && o.melee) e.dots.push({ dps: player.stats.dmg[1] * poison, until: this.t + 3, el: "poison", by: player.id });
      const ls = player.stats.lifeSteal + this.buffSum(player, "lifeSteal") + ((e.tapUntil || 0) > this.t ? e.tapPct || 0 : 0);
      if (ls) this.healPlayer(player, dmg * ls, false);
      if (o.crit && player.stats.flags.critHeal) this.healPlayer(player, player.stats.maxHp * player.stats.flags.critHeal, false);
    }
    if (e.hp <= 0) this.killEnemy(e, by);
    else if (e.boss) this.checkBossPhase(e);
  }

  checkBossPhase(e: SimEnemy) {
    if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2;
      e.patternCd = {};
      this.events.push({ t: "boss_phase", id: e.id, phase: 2 });
      if (e.type === "forgotten_saint") {
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1);
      }
      if (e.type === "blood_abomination") e.speed *= 1.3;
    }
    if (e.type === "the_hollow" && e.phase === 2 && e.hp < e.maxHp * 0.25) {
      e.phase = 3;
      e.patternCd = {};
      e.speed *= 1.2;
      this.events.push({ t: "boss_phase", id: e.id, phase: 3 });
    }
  }

  killEnemy(e: SimEnemy, by: SimPlayer | SimEnemy | null) {
    e.hp = 0;
    e.state = "dead";
    e.deadAt = this.t;
    e.corpse = e.team === "enemy";
    e.dots = [];
    if (e.collider) {
      this.colliderOwner.delete(e.collider.handle);
      this.phys.world.removeRigidBody(e.body!);
      e.collider = null;
      e.body = null;
    }
    this.events.push({ t: "death", id: e.id, x: e.x, z: e.z, type: e.type, by: by?.id, boss: e.boss });
    if (e.team === "ally") return;
    // опыт — всем участникам забега
    for (const p of this.players.values()) {
      this.giveXp(p, e.xp);
      p.kills[e.type] = (p.kills[e.type] || 0) + 1;
      if (e.boss) p.bosses.push(e.type);
    }
    const killer = by && "char" in by ? (by as SimPlayer) : by && (by as SimEnemy).owner ? this.players.get((by as SimEnemy).owner!) : null;
    if (killer) {
      const f = killer.stats.flags;
      const lok = (f.lifeOnKill || 0);
      if (lok) this.healPlayer(killer, killer.stats.maxHp * lok, false);
      if (f.manaOnKill) killer.mana = Math.min(killer.stats.maxMana, killer.mana + killer.stats.maxMana * f.manaOnKill);
    }
    if (e.def.behavior === "necro") {
      for (const o of this.enemies.values()) if (o.summoner === e.id && o.state !== "dead") this.killEnemy(o, null);
    }
    if (e.type === "mimic") this.spawnLoot(e.x, e.z, "chest", `mimic:${e.id}`, killer ? killer.stats.goldFind : 0);
    const tier: DropTier = e.boss ? "boss" : e.elite ? "elite" : "normal";
    const gf = killer ? killer.stats.goldFind : 0;
    this.spawnLoot(e.x, e.z, tier, `kill:${e.id}`, gf);
    if (e.boss) {
      this.bossDead = true;
      // Остальные враги в логове босса рассыпаются.
      for (const o of this.enemies.values()) if (o.team === "enemy" && o.state !== "dead" && o.id !== e.id && Math.hypot(o.x - e.x, o.z - e.z) < 20) this.killEnemy(o, null);
      this.events.push({ t: "exit_open", x: this.d.exit.x, z: this.d.exit.z });
    }
  }

  giveXp(p: SimPlayer, amount: number) {
    p.xp += amount;
    const before = p.level;
    const lv = levelFromXp(p.char.xp + p.xp).level;
    if (lv > before) {
      p.level = lv;
      p.char.level = lv;
      p.stats = deriveStats(p.char);
      // новый уровень лечит наполовину: половина запаса здоровья и маны сверху
      if (p.alive) {
        this.healPlayer(p, p.stats.maxHp * 0.5);
        p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.maxMana * 0.5);
      }
      this.events.push({ t: "levelup", p: p.id, level: lv });
    }
  }

  healPlayer(p: SimPlayer, amount: number, show = true) {
    if (!p.alive || amount <= 0) return;
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    if (show && p.hp - before >= 1) this.events.push({ t: "heal", p: p.id, amount: Math.round(p.hp - before) });
  }

  damagePlayer(p: SimPlayer, amount: number, element: Element, src: SimEnemy | null, o: { melee?: boolean; aoe?: boolean } = {}) {
    if (!p.alive || this.finished) return;
    if (this.t < p.iframesUntil) { this.events.push({ t: "evade", p: p.id }); return; }
    if (!o.aoe && p.stats.dodge && this.rng.chance(p.stats.dodge)) { this.events.push({ t: "evade", p: p.id }); return; }
    let dmg = amount;
    if (src && (src.weakenUntil || 0) > this.t) dmg *= 1 - (src.weakenPct || 0);
    // блок / парирование / магический заслон
    if ((p.blocking) && src && !o.aoe) {
      const f = this.forward(p);
      const dx = src.x - p.x, dz = src.z - p.z;
      const facing = (dx * f.x + dz * f.z) / Math.max(0.01, Math.hypot(dx, dz)) > 0.35;
      if (facing) {
        if (p.stats.secondary === "ward") {
          const absorbed = dmg * 0.6;
          if (p.mana >= absorbed * 0.6) { p.mana -= absorbed * 0.6; dmg -= absorbed; this.events.push({ t: "ward", p: p.id }); }
        } else if (o.melee && this.t - p.blockStart <= p.stats.parryWindow) {
          src.stunUntil = this.t + (src.boss ? 0.8 : 1.8);
          src.state = "recover"; src.stateT = this.t + 0.2;
          this.events.push({ t: "parry", p: p.id, e: src.id });
          return;
        } else {
          const blocked = dmg * p.stats.block;
          p.stamina -= blocked * 0.7;
          p.staminaDelayUntil = this.t + 0.9;
          dmg -= blocked;
          if (p.stamina <= 0) { p.stamina = 0; p.blocking = false; this.events.push({ t: "guardbreak", p: p.id }); }
          else this.events.push({ t: "block", p: p.id });
        }
      }
    }
    if (element === "physical") dmg *= 1 - p.stats.damageReduction;
    else if (element === "fire") dmg *= 1 - p.stats.resFire;
    else if (element === "cold") dmg *= 1 - p.stats.resCold;
    else if (element === "dark" || element === "holy") dmg *= 1 - p.stats.resDark;
    let dr = this.buffSum(p, "drPct") + (p.tauntUntil > this.t ? p.tauntDr : 0) + this.sanctuaryDr(p);
    dmg *= Math.max(0.2, 1 - dr);
    dmg *= 1 + p.stats.dmgTakenPct;
    if (p.absorb > 0 && p.absorbUntil > this.t) {
      const take = Math.min(p.absorb, dmg);
      p.absorb -= take;
      dmg -= take;
    }
    dmg = Math.max(0, dmg);
    p.hp -= dmg;
    if (dmg > 0) this.events.push({ t: "phit", p: p.id, amount: Math.round(dmg), el: element, src: src?.id, sx: src?.x, sz: src?.z });
    const thorns = p.stats.thorns + this.buffSum(p, "thorns");
    if (o.melee && src && thorns && src.state !== "dead") this.damageEnemy(src, amount * thorns, "physical", p, { noDot: true });
    if (p.hp <= 0) this.downPlayer(p);
  }

  private sanctuaryDr(p: SimPlayer) {
    for (const g of this.grounds) if (g.kind === "sanctuary" && Math.hypot(g.x - p.x, g.z - p.z) < g.r) return g.data.dr;
    return 0;
  }

  downPlayer(p: SimPlayer) {
    p.hp = 0;
    p.alive = false;
    p.blocking = false;
    p.attack = null;
    this.events.push({ t: "downed", p: p.id });
    for (const e of this.enemies.values()) if (e.target === p.id) e.target = null;
    if ([...this.players.values()].every((x) => !x.alive || !x.connected)) {
      // одиночная игра с возрождением за рекламу: поражение ждёт решения игрока
      if (this.offerRevive && !this.revivedOnce) this.awaitingRevive = p.id;
      else this.finish(false, p.id);
    }
  }

  /** Можно ли один раз за забег подняться после гибели (решает клиент: например, за просмотр рекламы). */
  offerRevive = false;
  revivedOnce = false;
  /** Кто пал и ждёт решения: подняться или сдаться. */
  awaitingRevive: string | null = null;

  /** Подняться на ноги: половина здоровья и маны, три секунды неуязвимости, враги рядом отброшены. */
  secondChance() {
    const p = this.awaitingRevive ? this.players.get(this.awaitingRevive) : null;
    if (!p || this.finished) return false;
    this.awaitingRevive = null;
    this.revivedOnce = true;
    p.alive = true;
    p.hp = p.stats.maxHp * 0.5;
    p.mana = Math.max(p.mana, p.stats.maxMana * 0.5);
    p.iframesUntil = this.t + 3;
    for (const e of this.enemies.values()) {
      if (e.team !== "enemy" || e.state === "dead") continue;
      const dx = e.x - p.x, dz = e.z - p.z, dist = Math.hypot(dx, dz);
      if (dist < 5 && dist > 0.01 && !e.boss) {
        e.kx += (dx / dist) * 12;
        e.kz += (dz / dist) * 12;
        e.stunUntil = Math.max(e.stunUntil, this.t + 1);
      }
    }
    this.events.push({ t: "revived", p: p.id, by: p.id, ad: 1 });
    return true;
  }

  giveUp() {
    if (this.awaitingRevive && !this.finished) this.finish(false, this.awaitingRevive);
    this.awaitingRevive = null;
  }

  finish(success: boolean, by: string, how: "exit" | "entrance" | "wipe" = success ? "exit" : "wipe") {
    if (this.finished) return;
    this.finished = { success, by, how };
    this.events.push({ t: success ? "exit" : "wipe", by });
  }

  // ------------------------------------------------------------ взаимодействие
  private interact(p: SimPlayer) {
    const near = (x: number, z: number, r: number) => Math.hypot(p.x - x, p.z - z) < r;
    // воскрешение союзника
    for (const o of this.players.values()) {
      if (o.id !== p.id && !o.alive && o.connected && near(o.x, o.z, 2.6)) {
        p.reviving = { target: o.id, until: this.t + 2.5 };
        this.events.push({ t: "revive_start", p: p.id, target: o.id });
        return;
      }
    }
    // предметы на полу
    let bestDrop: Drop | null = null, bd = 2.4;
    for (const dr of this.drops.values()) {
      const d = Math.hypot(p.x - dr.x, p.z - dr.z);
      if (d < bd && dr.item) { bd = d; bestDrop = dr; }
    }
    if (bestDrop) return this.pickup(p, bestDrop);
    for (const c of this.d.chests) {
      if (!this.opened.chests.has(c.id) && near(c.x, c.z, 2.6) && lineOfSight(this.R, this.phys, p.x, 1.3, p.z, c.x, 1.3, c.z)) {
        if (c.mimic) return this.wakeMimic(c.id, p);
        this.opened.chests.add(c.id);
        this.events.push({ t: "chest", id: c.id, p: p.id });
        this.spawnLoot(c.x, c.z, c.tier, `chest:${c.id}`, p.stats.goldFind);
        return;
      }
    }
    for (const s of this.d.secrets) {
      if (!this.opened.secrets.has(s.id) && near((s.cx + 0.5) * CELL, (s.cy + 0.5) * CELL, 3.4)) {
        this.opened.secrets.add(s.id);
        openSecret(this.phys, s.id);
        this.d.cells[s.cy * this.d.w + s.cx] = Cell.Floor;
        this.flowAt = -1;
        this.events.push({ t: "secret", id: s.id, p: p.id });
        for (const pl of this.players.values()) this.giveXp(pl, 25 * this.d.level);
        return;
      }
    }
    for (const s of this.d.shrines) {
      if (!this.opened.shrines.has(s.id) && near(s.x, s.z, 2.6)) {
        this.opened.shrines.add(s.id);
        for (const pl of this.players.values()) {
          if (pl.alive) pl.buffs.push({ ...SHRINE_BUFFS[s.buff], until: this.t + 60 });
        }
        this.events.push({ t: "shrine", id: s.id, p: p.id, buff: s.buff });
        return;
      }
    }
    for (const c of this.d.chandeliers) {
      if (!this.opened.chandeliers.has(c.id) && near(c.ax, c.az, 2.2)) return this.dropChandelier(c.id, p);
    }
    for (const o of this.d.doors || []) {
      if (o.kind !== "key" || this.opened.doors.has(o.id)) continue;
      if (!near((o.cx + 0.5) * CELL, (o.cy + 0.5) * CELL, 2.8)) continue;
      if (this.keyCount <= 0) { this.events.push({ t: "locked", id: o.id, p: p.id }); return; }
      this.keyCount--;
      return this.openDoor(o.id, p);
    }
    for (const lv of this.d.levers) {
      if (!near(lv.x, lv.z, 2.0)) continue;
      if (lv.opens) {
        if (lv.opens.every((id) => this.opened.doors.has(id))) continue;
        this.leverCd.set(lv.id, this.t + 9999);
        this.events.push({ t: "lever", id: lv.id, p: p.id });
        for (const id of lv.opens) this.openDoor(id, p);
        return;
      }
      return this.pullLever(lv.id, p);
    }
    if (this.bossDead && near(this.d.exit.x, this.d.exit.z, 2.8)) return this.finish(true, p.id, "exit");
    if (near(this.d.entrance.x, this.d.entrance.z, 2.6)) return this.finish(true, p.id, "entrance");
  }

  private pickup(p: SimPlayer, dr: Drop) {
    this.drops.delete(dr.id);
    if (dr.item) p.loot.push(dr.item);
    this.events.push({ t: "pickup", id: dr.id, p: p.id, item: dr.item });
  }

  spawnLoot(x: number, z: number, tier: DropTier, salt: string, gf: number) {
    const rng = new Rng(hashString(`${this.d.seed}:${salt}`));
    const ilvl = this.d.level + (tier === "boss" ? 2 : tier === "elite" ? 1 : 0);
    const loot = rollLoot(rng, ilvl, tier, 0);
    const scatter = () => ({ x: x + rng.range(-1.2, 1.2), z: z + rng.range(-1.2, 1.2) });
    const place = (o: Omit<Drop, "id" | "x" | "z">) => {
      let pos = scatter();
      if (!walkable(this.d, worldToCell(pos.x), worldToCell(pos.z), this.opened.secrets)) pos = { x, z };
      const drop: Drop = { id: `d${this.dropSeq++}`, ...pos, ...o };
      this.drops.set(drop.id, drop);
      this.events.push({ t: "drop", id: drop.id });
    };
    for (const item of loot.items) place({ item });
    if (loot.gold) place({ gold: Math.round(loot.gold * (1 + gf)) });
    if (loot.potion) place({ potion: loot.potion });
  }

  // ------------------------------------------------------------ враги
  spawnEnemy(id: string, type: string, x: number, z: number, level: number, o: { elite?: string; boss?: boolean; team?: "enemy" | "ally"; owner?: string; power?: number; expires?: number; champion?: string } = {}) {
    const def = ENEMIES[type];
    const sc = scaleEnemy(def, level, o.team === "ally" ? 1 : this.playerCount, o.elite, !!o.champion);
    const power = o.power || 1;
    const body = this.phys.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, def.height / 2, z));
    const half = Math.max(0.05, def.height / 2 - def.radius);
    const collider = this.phys.world.createCollider(
      this.R.ColliderDesc.capsule(half, def.radius).setCollisionGroups(groups(GROUP_ENEMY, GROUP_WALL | GROUP_ENEMY | GROUP_PLAYER)),
      body,
    );
    const e: SimEnemy = {
      id, type, def, team: o.team || "enemy", owner: o.owner, elite: o.elite, boss: !!o.boss, level,
      x, y: groundAt(this.d, x, z), z, yaw: this.rng.range(0, Math.PI * 2),
      hp: sc.maxHp * power, maxHp: sc.maxHp * power, dmg: sc.dmg * power, speed: sc.speed, armor: sc.armor, xp: sc.xp,
      state: "idle", stateT: 0, move: "", target: null, cd: this.rng.range(0, 1), awake: false,
      slowUntil: 0, slowPct: 0, freezeUntil: 0, stunUntil: 0, blindUntil: 0, vulnUntil: 0, vulnPct: 0, dots: [],
      kx: 0, kz: 0, guarding: false, phase: 1, attack: "", patternCd: {}, expires: o.expires, deadAt: 0, corpse: false,
      collider, body, champion: o.champion, phased: def.behavior === "phantom",
    };
    if (def.behavior === "phantom") {
      // фантом проходит сквозь стены: сталкивается только с игроками
      collider.setCollisionGroups(groups(GROUP_ENEMY, GROUP_PLAYER));
    }
    this.colliderOwner.set(collider.handle, id);
    this.enemies.set(id, e);
    return e;
  }

  wake(e: SimEnemy, target?: string) {
    if (e.awake) return;
    e.awake = true;
    if (target) e.target = target;
    if (e.boss) this.events.push({ t: "boss_awake", id: e.id, type: e.type });
    // будим соседей по комнате
    for (const o of this.enemies.values()) {
      if (!o.awake && o.team === "enemy" && o.state !== "dead" && Math.hypot(o.x - e.x, o.z - e.z) < 9) {
        o.awake = true;
        o.target = o.target || target || null;
        if (o.boss) this.events.push({ t: "boss_awake", id: o.id, type: o.type });
      }
    }
  }

  /** Двигает существо с учётом стен и других существ (Rapier character controller). */
  moveEnemy(e: SimEnemy, dx: number, dz: number) {
    if (!e.collider || !e.body) return;
    if (e.def.behavior === "phantom") {
      e.x = clamp(e.x + dx, CELL, (this.d.w - 1) * CELL);
      e.z = clamp(e.z + dz, CELL, (this.d.h - 1) * CELL);
      e.y = Math.max(0, groundAt(this.d, e.x, e.z));
      e.body.setNextKinematicTranslation({ x: e.x, y: e.y + e.def.height / 2, z: e.z });
      return;
    }
    // в воде и крови вязнут
    const liq = liquidAt(this.d, e.x, e.z);
    if (liq === Liquid.Water || liq === Liquid.Blood) { dx *= 0.65; dz *= 0.65; }
    this.controller.computeColliderMovement(e.collider, { x: dx, y: 0, z: dz }, undefined, undefined, (c) => c.handle !== e.collider!.handle && !this.phys.terrain.has(c.handle));
    const m = this.controller.computedMovement();
    // рельеф: в соседнюю клетку — только если до неё можно дойти (лестница или ровный пол)
    const cx = worldToCell(e.x), cy = worldToCell(e.z);
    const step = (nx: number, nz: number) => {
      const tx = worldToCell(nx), ty = worldToCell(nz);
      return (tx === cx && ty === cy) || passable(this.d, cx, cy, tx, ty, (a, b) => walkable(this.d, a, b, this.opened.secrets));
    };
    if (step(e.x + m.x, e.z + m.z)) { e.x += m.x; e.z += m.z; }
    else if (step(e.x + m.x, e.z)) e.x += m.x;
    else if (step(e.x, e.z + m.z)) e.z += m.z;
    e.y = groundAt(this.d, e.x, e.z);
    e.body.setNextKinematicTranslation({ x: e.x, y: e.y + e.def.height / 2, z: e.z });
  }

  /** Поле расстояний до ближайшего игрока по клеткам (обход стен). */
  updateFlow() {
    if (this.t - this.flowAt < 0.4) return;
    this.flowAt = this.t;
    const { w, h } = this.d;
    this.flow.fill(-1);
    const q: number[] = [];
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const i = worldToCell(p.z) * w + worldToCell(p.x);
      if (this.flow[i] !== 0) { this.flow[i] = 0; q.push(i); }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      const x = i % w, y = (i / w) | 0, dist = this.flow[i];
      if (dist > 60) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!passable(this.d, x, y, nx, ny, (a, b) => walkable(this.d, a, b, this.opened.secrets))) continue;
        const ni = ny * w + nx;
        if (this.flow[ni] === -1) { this.flow[ni] = dist + 1; q.push(ni); }
      }
    }
  }

  /** Направление к цели: напрямую, если видно, иначе по полю расстояний. */
  pathDir(e: SimEnemy, tx: number, tz: number): [number, number] {
    const dx = tx - e.x, dz = tz - e.z;
    const len = Math.hypot(dx, dz) || 1;
    const cx = worldToCell(e.x), cy = worldToCell(e.z), w = this.d.w;
    // напрямую — только если по прямой не мешает перепад высот
    const sameLevel = Math.abs(groundAt(this.d, tx, tz) - groundAt(this.d, e.x, e.z)) < 0.5;
    if (sameLevel && (len < 6 || lineOfSight(this.R, this.phys, e.x, 1, e.z, tx, 1, tz))) return [dx / len, dz / len];
    const pw = (a: number, b: number) => walkable(this.d, a, b, this.opened.secrets);
    let best = this.flow[cy * w + cx], bx = cx, by = cy;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = cx + ox, ny = cy + oy;
      const v = this.flow[ny * w + nx];
      if (v >= 0 && (best < 0 || v < best) && passable(this.d, cx, cy, nx, ny, pw)) {
        if (ox && oy && (!passable(this.d, cx, cy, cx + ox, cy, pw) || !passable(this.d, cx, cy, cx, cy + oy, pw))) continue;
        best = v; bx = nx; by = ny;
      }
    }
    const gx = (bx + 0.5) * CELL - e.x, gz = (by + 0.5) * CELL - e.z;
    const gl = Math.hypot(gx, gz) || 1;
    return [gx / gl, gz / gl];
  }

  nearestPlayer(e: SimEnemy, maxDist: number, needSight = true): SimPlayer | null {
    let best: SimPlayer | null = null, bd = maxDist;
    for (const p of this.players.values()) {
      if (!p.alive || !p.connected) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < bd && (!needSight || lineOfSight(this.R, this.phys, e.x, 1.4, e.z, p.x, 1.4, p.z))) { bd = d; best = p; }
    }
    return best;
  }

  // ------------------------------------------------------------ шаг симуляции
  step(dt = TICK) {
    if (this.finished) return;
    this.t += dt;
    this.updateFlow();
    for (const p of this.players.values()) this.stepPlayer(p, dt);
    for (const e of this.enemies.values()) {
      if (e.state === "dead") continue;
      this.stepStatus(e, dt);
      if ((e.state as string) === "dead") continue;
      updateEnemy(this, e, dt);
    }
    this.stepProjectiles(dt);
    this.stepGrounds(dt);
    this.stepTraps();
    this.stepTerrain(dt);
    if (this.fuses.length) {
      const due = this.fuses.filter((f) => f.at <= this.t);
      this.fuses = this.fuses.filter((f) => f.at > this.t);
      for (const f of due) this.oilExplode(f);
    }
    for (const c of this.d.chests) {
      if (!c.mimic || this.opened.mimics.has(c.id) || this.opened.chests.has(c.id)) continue;
      for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - c.x, p.z - c.z) < 1.6) { this.wakeMimic(c.id, p); break; }
    }
    // убираем старые трупы и истёкших призванных
    for (const e of [...this.enemies.values()]) {
      if (e.state === "dead" && this.t - e.deadAt > 40 && !e.boss) this.enemies.delete(e.id);
      else if (e.expires && this.t > e.expires && e.state !== "dead") this.killEnemy(e, null);
    }
    this.phys.world.step();
  }

  private stepPlayer(p: SimPlayer, dt: number) {
    p.buffs = p.buffs.filter((b) => b.until > this.t);
    if (!p.alive) {
      p.reviving = null;
      return;
    }
    if (p.attack && !p.attack.done && this.t >= p.attack.hitAt) this.resolveMelee(p);
    if (p.attack && p.attack.done && this.t > p.nextAttackAt) p.attack = null;
    // ресурсы
    p.hp = Math.min(p.stats.maxHp, p.hp + (p.stats.hpRegen + p.stats.maxHp * this.buffSum(p, "regenPct")) * dt);
    if (p.hp <= 0) return this.downPlayer(p);
    // ауры: импульс урона раз в полсекунды
    if (this.t >= (p.auraNext || 0)) {
      p.auraNext = this.t + 0.5;
      for (const b of p.buffs) {
        if (!b.auraDps || b.until <= this.t) continue;
        const r = b.auraR || 4;
        let any = false;
        for (const e of this.enemies.values()) {
          if (e.state === "dead" || e.team !== "enemy" || (b.auraUndead && !e.def.undead)) continue;
          if (Math.hypot(e.x - p.x, e.z - p.z) > r + e.def.radius) continue;
          this.damageEnemy(e, (b.auraBase || 1) * b.auraDps * 0.5, (b.auraEl || "holy") as Element, p, { noDot: true });
          any = true;
        }
        if (any) this.events.push({ t: "aura", p: p.id, x: p.x, z: p.z, r, el: b.auraEl });
      }
    }
    const manaMul = 1 + this.buffSum(p, "manaRegenMul");
    p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.manaRegen * manaMul * dt);
    if (p.sprinting) {
      p.stamina = Math.max(0, p.stamina - 14 * dt);
      p.staminaDelayUntil = this.t + 0.6;
    } else if (this.t > p.staminaDelayUntil && !p.blocking) {
      p.stamina = Math.min(p.stats.maxStamina, p.stamina + p.stats.staminaRegen * dt);
    }
    if (p.whirlUntil > this.t && this.t >= p.whirlNext) {
      p.whirlNext = this.t + (p.whirlTick || 0.3);
      const wr = p.whirlR || 3.2;
      this.breakInRadius(p.x, p.z, wr, p);
      for (const e of this.enemies.values()) {
        if (e.state === "dead" || e.team !== "enemy") continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < wr + e.def.radius) {
          const { dmg, crit } = this.rollWeapon(p, p.whirlDmg);
          this.damageEnemy(e, dmg, "physical", p, { crit, knock: 0.6, melee: true });
        }
      }
    }
    if (p.stats.flags.holyAura) {
      for (const e of this.enemies.values()) {
        if (e.state !== "dead" && e.team === "enemy" && e.def.undead && Math.hypot(e.x - p.x, e.z - p.z) < 5) {
          this.damageEnemy(e, p.stats.flags.holyAura * dt * 5, "holy", p, { noDot: true });
        }
      }
    }
    if (p.reviving) {
      const o = this.players.get(p.reviving.target);
      if (!o || o.alive || Math.hypot(o.x - p.x, o.z - p.z) > 3) p.reviving = null;
      else if (this.t >= p.reviving.until) {
        o.alive = true;
        o.hp = o.stats.maxHp * 0.4;
        o.iframesUntil = this.t + 2;
        p.reviving = null;
        this.events.push({ t: "revived", p: o.id, by: p.id });
      }
    }
    // автоподбор золота и зелий
    for (const dr of [...this.drops.values()]) {
      if (dr.item) continue;
      if (Math.hypot(dr.x - p.x, dr.z - p.z) < 1.4) {
        this.drops.delete(dr.id);
        if (dr.gold) p.gold += dr.gold;
        if (dr.potion) p.potionsFound[dr.potion]++;
        this.events.push({ t: "pickup", id: dr.id, p: p.id, gold: dr.gold, potion: dr.potion });
      }
    }
  }

  private stepStatus(e: SimEnemy, dt: number) {
    for (const d of e.dots) if (d.until > this.t) {
      e.hp -= d.dps * dt;
      if (e.hp <= 0) {
        const by = this.players.get(d.by) || null;
        this.killEnemy(e, by);
        return;
      }
    }
    e.dots = e.dots.filter((d) => d.until > this.t);
    if (Math.abs(e.kx) + Math.abs(e.kz) > 0.05) {
      this.moveEnemy(e, e.kx * dt, e.kz * dt);
      e.kx *= Math.pow(0.02, dt);
      e.kz *= Math.pow(0.02, dt);
    }
  }

  private stepProjectiles(dt: number) {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.kind === "arrow") pr.vy -= 6 * dt;
      const sx = pr.x, sy = pr.y, sz = pr.z;
      const mx = pr.vx * dt, my = pr.vy * dt, mz = pr.vz * dt;
      const len = Math.hypot(mx, my, mz);
      const wall = rayToWall(this.R, this.phys, { x: sx, y: sy, z: sz }, { x: mx / len, y: my / len, z: mz / len }, len, true);
      const travel = Math.min(len, wall);
      let alive = pr.life > 0;
      // попадания по существам вдоль отрезка
      const hitTest = (cx: number, cy0: number, cy1: number, cz: number, r: number) => {
        const t = clamp(((cx - sx) * mx + (cz - sz) * mz) / Math.max(1e-6, mx * mx + mz * mz), 0, travel / len);
        const px = sx + mx * t, py = sy + my * t, pz = sz + mz * t;
        return Math.hypot(px - cx, pz - cz) < r + pr.size && py > cy0 - pr.size && py < cy1 + pr.size;
      };
      if (pr.team === "player") {
        const owner = this.players.get(pr.owner) || null;
        for (const e of this.enemies.values()) {
          if (!alive || e.state === "dead" || pr.hit.has(e.id)) continue;
          if (!hitTest(e.x, e.y, e.y + e.def.height, e.z, e.def.radius)) continue;
          pr.hit.add(e.id);
          if (e.team === "ally") continue;
          if (pr.explode) { this.explode(pr, owner, e.x, e.z); alive = false; break; }
          this.damageEnemy(e, pr.dmg, pr.element, owner, { crit: pr.crit, slow: pr.slow, freeze: pr.freeze, undeadBonus: pr.undeadBonus, knock: pr.kind === "arrow" ? 0.5 : 0.3 });
          if (!pr.pierce) { alive = false; break; }
        }
        if (alive) {
          for (const b of this.d.breakables) {
            if (this.opened.broken.has(b.id) || !hitTest(b.x, 0, 0.9, b.z, 0.35)) continue;
            this.breakObject(b.id, owner);
            if (pr.explode) { this.explode(pr, owner, b.x, b.z); alive = false; break; }
            if (!pr.pierce) { alive = false; break; }
          }
        }
        if (alive) {
          for (const c of this.d.chandeliers) {
            if (this.opened.chandeliers.has(c.id)) continue;
            // ближайшая к люстре точка отрезка полёта
            const vx = c.x - sx, vy = c.y - sy, vz = c.z - sz;
            const L2 = mx * mx + my * my + mz * mz;
            const k = clamp((vx * mx + vy * my + vz * mz) / Math.max(1e-6, L2), 0, travel / len);
            if (Math.hypot(sx + mx * k - c.x, sy + my * k - c.y, sz + mz * k - c.z) < 0.95) {
              this.dropChandelier(c.id, owner);
              alive = false;
              this.events.push({ t: "impact", x: c.x, y: c.y, z: c.z, el: pr.element, kind: pr.kind });
              break;
            }
          }
        }
        if (alive && pr.healAlly) {
          for (const p of this.players.values()) {
            if (p.id === pr.owner || !p.alive || pr.hit.has(p.id)) continue;
            if (hitTest(p.x, p.y, p.y + 1.8, p.z, 0.45)) { pr.hit.add(p.id); this.healPlayer(p, pr.healAlly); alive = false; }
          }
        }
      } else {
        for (const p of this.players.values()) {
          if (!alive || !p.alive || pr.hit.has(p.id)) continue;
          if (!hitTest(p.x, p.y, p.y + 1.8, p.z, 0.4)) continue;
          pr.hit.add(p.id);
          const src = this.enemies.get(pr.owner) || null;
          if (pr.explode) { this.explode(pr, null, p.x, p.z); alive = false; break; }
          this.damagePlayer(p, pr.dmg, pr.element, src);
          alive = false;
        }
        for (const e of this.enemies.values()) {
          if (!alive || e.team !== "ally" || e.state === "dead") continue;
          if (hitTest(e.x, e.y, e.y + e.def.height, e.z, e.def.radius)) { this.damageEnemy(e, pr.dmg, pr.element, null); alive = false; }
        }
      }
      if (alive && wall < len) {
        alive = false;
        const hx = sx + (mx / len) * wall, hz = sz + (mz / len) * wall;
        if (pr.explode) this.explode(pr, pr.team === "player" ? this.players.get(pr.owner) || null : null, hx, hz);
        else this.events.push({ t: "impact", x: hx, y: sy + (my / len) * wall, z: hz, el: pr.element, kind: pr.kind });
      }
      pr.x = sx + (mx / len) * travel;
      pr.y = sy + (my / len) * travel;
      pr.z = sz + (mz / len) * travel;
      if (pr.y < groundAt(this.d, pr.x, pr.z) + 0.05) alive = false;
      // низкий потолок коридора останавливает снаряд, как стена
      if (alive && pr.y > ceilAt(this.d, pr.x, pr.z) - 0.1) {
        alive = false;
        if (pr.explode) this.explode(pr, pr.team === "player" ? this.players.get(pr.owner) || null : null, pr.x, pr.z);
        else this.events.push({ t: "impact", x: pr.x, y: pr.y, z: pr.z, el: pr.element, kind: pr.kind });
      }
      if (alive) keep.push(pr);
      else this.events.push({ t: "proj_end", id: pr.id });
    }
    this.projectiles = keep;
  }

  private explode(pr: Projectile, owner: SimPlayer | null, x: number, z: number) {
    const r = pr.explode!;
    this.events.push({ t: "explode", x, z, r, el: pr.element });
    this.breakInRadius(x, z, r, owner);
    if (pr.team === "player") this.shakeChandeliers(x, z, r + 1, owner);
    if (pr.team === "player") {
      for (const e of this.enemies.values()) {
        if (e.state === "dead" || e.team !== "enemy") continue;
        const d = Math.hypot(e.x - x, e.z - z);
        if (d < r + e.def.radius) this.damageEnemy(e, pr.dmg * (d < 1 ? 1 : 0.75), pr.element, owner, { crit: pr.crit, knock: 1.5, freeze: pr.freeze });
      }
    } else {
      for (const p of this.players.values()) if (Math.hypot(p.x - x, p.z - z) < r) this.damagePlayer(p, pr.dmg, pr.element, this.enemies.get(pr.owner) || null, { aoe: true });
    }
  }

  /** Ловушка/гидра: раз в rate секунд бьёт ближайшего врага в радиусе. */
  private stepSentry(g: Ground, owner: SimPlayer | null) {
    if (this.t < (g.data.next || 0)) return;
    let best: SimEnemy | null = null, bd = g.data.range;
    for (const e of this.enemies.values()) {
      if (e.state === "dead" || e.team !== "enemy" || e.phased) continue;
      const d = Math.hypot(e.x - g.x, e.z - g.z);
      if (d < bd && lineOfSight(this.R, this.phys, g.x, 0.8, g.z, e.x, 1, e.z)) { bd = d; best = e; }
    }
    if (!best) return;
    g.data.next = this.t + g.data.rate;
    const el = ELEMENT_LIST[g.data.elx] || "physical";
    if (g.kind === "sentry_death_sentry") {
      this.chainFrom(owner, g.x, 0.9, g.z, best, g.data.dmg, el, 3, null);
    } else {
      const fire = g.kind !== "sentry_blade_trap";
      this.pointProjectile(g.owner, g.x, groundAt(this.d, g.x, g.z) + 0.7, g.z, best.x, best.y + 1, best.z, {
        kind: g.kind === "sentry_blade_trap" ? "knife" : "fireball", speed: fire ? 20 : 30, dmg: g.data.dmg, element: el, size: fire ? 0.22 : 0.12, explode: g.kind === "sentry_fire_trap" ? 1.6 : undefined,
      });
    }
    this.events.push({ t: "sentry", id: g.id, x: g.x, z: g.z, tx: best.x, tz: best.z });
  }

  /** Цепной удар: от точки к первой цели, потом прыжками к ближайшим. */
  chainFrom(owner: SimPlayer | null, x: number, y: number, z: number, first: SimEnemy, dmg: number, el: Element, jumps: number, opts: { stun?: number } | null) {
    const pts: number[] = [x, y, z];
    const hit = new Set<string>();
    let cur: SimEnemy | null = first;
    for (let i = 0; cur && i <= jumps; i++) {
      hit.add(cur.id);
      pts.push(cur.x, cur.y + cur.def.height * 0.6, cur.z);
      this.damageEnemy(cur, dmg * (i === 0 ? 1 : Math.pow(0.9, i)), el, owner, { stun: opts?.stun, noDot: i > 0 });
      let next: SimEnemy | null = null, nd = 8;
      for (const e of this.enemies.values()) {
        if (e.state === "dead" || e.team !== "enemy" || hit.has(e.id) || e.phased) continue;
        const d = Math.hypot(e.x - cur.x, e.z - cur.z);
        if (d < nd && lineOfSight(this.R, this.phys, cur.x, 1, cur.z, e.x, 1, e.z)) { nd = d; next = e; }
      }
      cur = next;
    }
    this.events.push({ t: "chain", pts: pts.map((v) => Math.round(v * 100) / 100), el });
  }

  addGround(g: Omit<Ground, "id" | "t0">) {
    const ground: Ground = { ...g, id: this.nextId++, t0: this.t };
    this.grounds.push(ground);
    return ground;
  }

  private stepGrounds(dt: number) {
    const keep: Ground[] = [];
    for (const g of this.grounds) {
      const owner = this.players.get(g.owner) || null;
      if (g.kind === "sanctuary") {
        for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - g.x, p.z - g.z) < g.r) this.healPlayer(p, p.stats.maxHp * g.data.regen * dt, false);
        for (const e of this.enemies.values()) if (e.state !== "dead" && e.team === "enemy" && e.def.undead && Math.hypot(e.x - g.x, e.z - g.z) < g.r) this.damageEnemy(e, g.data.dps * dt * 4, "holy", owner, { noDot: true });
      } else if (g.kind === "blood_pool") {
        for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - g.x, p.z - g.z) < g.r) {
          p.hp -= g.data.dps * dt;
          if (p.hp <= 0) this.downPlayer(p);
        }
      } else if (g.kind === "fire_pool" || g.kind === "vent_fire") {
        for (const e of this.enemies.values()) if (e.state !== "dead" && e.team === "enemy" && Math.hypot(e.x - g.x, e.z - g.z) < g.r + e.def.radius * 0.5) this.damageEnemy(e, g.data.dps * dt, "fire", owner, { noDot: true });
        for (const p of this.players.values()) if (p.alive && Math.hypot(p.x - g.x, p.z - g.z) < g.r && this.t > p.iframesUntil) {
          p.hp -= g.data.dps * dt * 0.5 * (1 - p.stats.resFire);
          if (p.hp <= 0) this.downPlayer(p);
        }
      } else if (g.kind === "curse") {
        for (const e of this.enemies.values()) if (e.state !== "dead" && e.team === "enemy" && Math.hypot(e.x - g.x, e.z - g.z) < g.r) {
          if (g.data.vuln) { e.vulnUntil = this.t + 0.3; e.vulnPct = g.data.vuln; }
          if (g.data.slow) { e.slowUntil = this.t + 0.3; e.slowPct = Math.max(e.slowPct, g.data.slow); }
          if (g.data.weaken) { e.weakenUntil = this.t + 0.3; e.weakenPct = g.data.weaken; }
          if (g.data.lifeTap) { e.tapUntil = this.t + 0.3; e.tapPct = g.data.lifeTap; }
        }
      } else if (g.kind.startsWith("field_")) {
        // поле: урон в секунду всем врагам внутри
        const el = ELEMENT_LIST[g.data.elx] || "fire";
        if (this.t >= (g.data.next || 0)) {
          g.data.next = this.t + 0.25;
          for (const e of this.enemies.values()) {
            if (e.state === "dead" || e.team !== "enemy") continue;
            if (Math.hypot(e.x - g.x, e.z - g.z) > g.r + e.def.radius) continue;
            this.damageEnemy(e, g.data.dps * 0.25, el, owner, { noDot: true, slow: g.data.slow || undefined });
          }
          if (g.kind === "field_armageddon" && this.rng.chance(0.6)) {
            const a = this.rng.range(0, Math.PI * 2), rr = this.rng.range(1, g.r);
            this.events.push({ t: "explode", x: g.x + Math.cos(a) * rr, z: g.z + Math.sin(a) * rr, r: 1.8, el: "fire" });
          }
        }
        if (g.kind === "field_armageddon" && owner) { g.x = owner.x; g.z = owner.z; }
      } else if (g.kind.startsWith("sentry_")) {
        this.stepSentry(g, owner);
      }
      if (this.t >= g.until) {
        if (g.kind === "meteor" || g.kind === "smite" || g.kind === "bone_prison") {
          const gel: Element = g.kind === "meteor" ? "fire" : g.kind === "smite" ? "holy" : "dark";
          this.events.push({ t: "explode", x: g.x, z: g.z, r: g.r, el: gel });
          if (g.kind === "meteor") this.addGround({ kind: "field_fire", x: g.x, z: g.z, r: g.r * 0.7, until: this.t + 3, owner: g.owner, team: "player", data: { dps: g.data.dmg * 0.15, elx: ELEMENT_LIST.indexOf("fire") } });
          this.breakInRadius(g.x, g.z, g.r, owner);
          for (const e of this.enemies.values()) {
            if (e.state === "dead" || e.team !== "enemy") continue;
            if (Math.hypot(e.x - g.x, e.z - g.z) < g.r + e.def.radius) {
              this.damageEnemy(e, g.data.dmg, gel, owner, {
                crit: !!g.data.crit, knock: g.kind === "bone_prison" ? 0 : 2,
                stun: g.kind === "bone_prison" ? g.data.stun : g.kind === "smite" && e.def.undead ? g.data.undeadStun : g.data.stun || 0,
              });
            }
          }
        } else if (g.kind === "vent_warn") {
          this.addGround({ kind: "vent_fire", x: g.x, z: g.z, r: g.r, until: this.t + 2.6, owner: g.owner, team: "player", data: { dps: g.data.dps } });
          this.events.push({ t: "vent", x: g.x, z: g.z });
        } else if (g.kind === "chandelier_fall") {
          this.events.push({ t: "crash", x: g.x, z: g.z, r: g.r });
          for (const e of this.enemies.values()) {
            if (e.state === "dead" || e.team !== "enemy") continue;
            if (Math.hypot(e.x - g.x, e.z - g.z) < g.r + e.def.radius) this.damageEnemy(e, g.data.dmg, "physical", owner, { knock: 3, stun: 2 });
          }
          for (const p of this.players.values()) if (Math.hypot(p.x - g.x, p.z - g.z) < g.r) this.damagePlayer(p, g.data.dmg * 0.4, "physical", null, { aoe: true });
          this.breakInRadius(g.x, g.z, g.r, owner);
        } else if (g.kind === "warn_circle" || g.kind === "warn_ring") {
          const src = this.enemies.get(g.owner);
          this.breakInRadius(g.x, g.z, g.r, null);
          if (src && src.state !== "dead") {
            this.events.push({ t: "explode", x: g.x, z: g.z, r: g.r, el: g.data.el === 1 ? "holy" : g.data.el === 2 ? "fire" : "dark" });
            for (const p of this.players.values()) {
              const d = Math.hypot(p.x - g.x, p.z - g.z);
              const inside = g.kind === "warn_ring" ? d < g.r && d > (g.data.inner || 0) : d < g.r;
              if (inside) this.damagePlayer(p, g.data.dmg, g.data.el === 1 ? "holy" : "physical", src, { aoe: true });
            }
          }
        } else if (g.kind === "warn_line") {
          const src = this.enemies.get(g.owner);
          if (src && src.state !== "dead") {
            for (const p of this.players.values()) {
              const rx = p.x - g.x, rz = p.z - g.z;
              const along = rx * g.data.dx + rz * g.data.dz;
              const across = Math.abs(rx * g.data.dz - rz * g.data.dx);
              if (along > 0 && along < g.data.len && across < g.r) this.damagePlayer(p, g.data.dmg, "physical", src, { aoe: true });
            }
          }
        }
        continue;
      }
      keep.push(g);
    }
    this.grounds = keep;
  }

  private stepTraps() {
    for (const tr of this.d.traps) {
      const phase = (this.t + (hashString(tr.id) % 30) / 10) % 3.2;
      const active = phase < 0.7;
      if (!active || phase > 0.08) continue; // урон в момент выдвижения шипов
      this.events.push({ t: "trap", id: tr.id });
      for (const p of this.players.values()) {
        if (p.alive && Math.abs(p.x - tr.x) < 1.4 && Math.abs(p.z - tr.z) < 1.4 && this.t > p.iframesUntil) {
          this.damagePlayer(p, 10 + this.d.level * 3, "physical", null, { aoe: true });
        }
      }
      // шипы не разбирают, кого колоть: заманивай врагов
      for (const e of this.enemies.values()) {
        if (e.state === "dead" || e.phased || e.def.behavior === "boss") continue;
        if (Math.abs(e.x - tr.x) < 1.4 && Math.abs(e.z - tr.z) < 1.4) this.damageEnemy(e, 18 + this.d.level * 5, "physical", null, { stun: 0.6, noDot: true });
      }
    }
  }

  // ------------------------------------------------------------ рельеф и механизмы
  private stepTerrain(dt: number) {
    const d = this.d;
    // ключи подбираются сами
    for (const k of d.keys || []) {
      if (this.opened.keys.has(k.id)) continue;
      for (const p of this.players.values()) {
        if (p.alive && Math.hypot(p.x - k.x, p.z - k.z) < 1.4) {
          this.opened.keys.add(k.id);
          this.keyCount++;
          this.events.push({ t: "key", id: k.id, p: p.id });
          break;
        }
      }
    }
    // нажимные плиты: игрок или враг на плите открывает решётки
    for (const pl of d.plates || []) {
      if (this.opened.plates.has(pl.id)) continue;
      let on = false;
      for (const p of this.players.values()) if (p.alive && Math.abs(p.x - pl.x) < 0.9 && Math.abs(p.z - pl.z) < 0.9) on = true;
      for (const e of this.enemies.values()) if (e.state !== "dead" && !e.phased && Math.abs(e.x - pl.x) < 0.9 && Math.abs(e.z - pl.z) < 0.9) on = true;
      if (!on) continue;
      this.opened.plates.add(pl.id);
      this.events.push({ t: "plate", id: pl.id, x: pl.x, z: pl.z });
      for (const id of pl.opens) this.openDoor(id, null);
    }
    // треснувший пол рушится, если на нём постоять
    for (const c of d.cracks || []) {
      if (this.opened.cracks.has(c.id)) continue;
      let on = false;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const cx = worldToCell(p.x), cy = worldToCell(p.z);
        if (c.cells.some(([x, y]) => x === cx && y === cy)) on = true;
      }
      const t = on ? (this.crackT.get(c.id) || 0) + dt : Math.max(0, (this.crackT.get(c.id) || 0) - dt * 0.5);
      this.crackT.set(c.id, t);
      if (on && t > 0.2 && Math.floor((t - dt) / 0.2) !== Math.floor(t / 0.2)) this.events.push({ t: "creak", id: c.id });
      if (t > 0.6) this.collapse(c.id);
    }
    // жидкости: кровь и лава жгут, раз в полсекунды
    if (this.t - this.hazardAt >= 0.5) {
      this.hazardAt = this.t;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const liq = liquidAt(d, p.x, p.z);
        if (p.y > groundAt(d, p.x, p.z) + 0.5) continue;
        if (liq === Liquid.Lava) { this.damagePlayer(p, p.stats.maxHp * 0.06, "fire", null, { aoe: true }); this.events.push({ t: "burn", p: p.id }); }
        if (liq === Liquid.Blood) this.damagePlayer(p, p.stats.maxHp * 0.008, "dark", null, { aoe: true });
        if (liq === Liquid.Void) this.damagePlayer(p, p.stats.maxHp * 0.03, "arcane", null, { aoe: true });
      }
      for (const e of this.enemies.values()) {
        if (e.state === "dead" || e.phased || e.def.behavior === "boss") continue;
        if (liquidAt(d, e.x, e.z) === Liquid.Lava) this.damageEnemy(e, e.maxHp * 0.08, "fire", null, { noDot: true });
      }
    }
  }

  /** Открыть дверь или решётку (by — кто открыл, null — механизм). */
  openDoor(id: string, by: SimPlayer | null) {
    if (this.opened.doors.has(id)) return;
    this.opened.doors.add(id);
    openDoorCell(this.d, id);
    openSecret(this.phys, id);
    this.flowAt = -1;
    const door = this.d.doors?.find((o) => o.id === id);
    this.events.push({ t: "door", id, kind: door?.kind, p: by?.id });
  }

  private collapse(id: string) {
    if (this.opened.cracks.has(id)) return;
    const c = this.d.cracks?.find((o) => o.id === id);
    if (!c) return;
    this.opened.cracks.add(id);
    collapseCrack(this.d, id);
    collapseCrackPhysics(this.phys, id);
    this.flowAt = -1;
    this.events.push({ t: "collapse", id });
    // кто стоял — летит вниз и ушибается; в яме ждут
    for (const p of this.players.values()) {
      const cx = worldToCell(p.x), cy = worldToCell(p.z);
      if (p.alive && c.cells.some(([x, y]) => x === cx && y === cy)) this.damagePlayer(p, p.stats.maxHp * 0.07, "physical", null, { aoe: true });
    }
    const [mx, my] = c.cells[Math.floor(c.cells.length / 2)];
    const types = ["skeleton", "zombie"].filter((t) => ENEMIES[t]);
    const n = 2 + (this.d.level > 8 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const [x, y] = c.cells[(i * 3 + 1) % c.cells.length];
      const e = this.spawnEnemy(`${id}_amb${i}`, types[i % types.length] || "skeleton", (x + 0.5) * CELL, (y + 0.5) * CELL, this.d.level);
      e.awake = true;
      this.events.push({ t: "esummon", id: e.id, x: e.x, z: e.z });
    }
    this.spawnLoot((mx + 0.5) * CELL, (my + 0.5) * CELL, "elite", `pit:${id}`, 0);
  }

  trapActive(id: string) {
    const phase = (this.t + (hashString(id) % 30) / 10) % 3.2;
    return phase < 0.7;
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------ снимок
  snapshot(): Snapshot {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return {
      time: this.t,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, cls: p.char.cls, level: p.level,
        x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), pitch: r2(p.pitch),
        hp: Math.round(p.hp), maxHp: p.stats.maxHp, mana: Math.round(p.mana), maxMana: p.stats.maxMana,
        stamina: Math.round(p.stamina), maxStamina: p.stats.maxStamina,
        alive: p.alive, blocking: p.blocking, aiming: p.aiming,
        atk: p.attack && !p.attack.done ? (p.attack.heavy ? 2 : 1) : 0,
        whirl: p.whirlUntil > this.t, absorb: Math.round(p.absorbUntil > this.t ? p.absorb : 0),
        buffs: p.buffs.map((b) => b.id),
        move: Math.round(this.buffSum(p, "movePct") * 100) / 100,
        app: p.char.appearance,
        weapon: p.char.equipment.weapon ? BASE_BY_ID[p.char.equipment.weapon.base].icon : "fist",
        offhand: p.char.equipment.offhand ? BASE_BY_ID[p.char.equipment.offhand.base].icon : "",
        cds: Object.fromEntries(Object.entries(p.cooldowns).map(([k, v]) => [k, r2(Math.max(0, v - this.t))]).filter(([, v]) => (v as number) > 0)),
        reviving: p.reviving ? r2(Math.max(0, p.reviving.until - this.t)) : 0,
        connected: p.connected,
      })),
      enemies: [...this.enemies.values()]
        .filter((e) => e.awake || e.state === "dead" || this.anyPlayerNear(e.x, e.z, 34))
        .map((e) => ({
          id: e.id, type: e.type, x: r2(e.x), y: r2(e.y), z: r2(e.z), yaw: r2(e.yaw), hp: Math.max(0, Math.round(e.hp)), maxHp: Math.round(e.maxHp),
          state: e.state, st: r2(Math.max(0, e.stateT - this.t)), atk: e.attack, elite: e.elite, boss: e.boss, ally: e.team === "ally",
          frozen: e.freezeUntil > this.t, stun: e.stunUntil > this.t || e.blindUntil > this.t, guard: e.guarding, phase: e.phase, level: e.level,
          name: e.champion, phased: e.phased,
        })),
      projectiles: this.projectiles.map((p) => ({ id: p.id, kind: p.kind, x: r2(p.x), y: r2(p.y), z: r2(p.z), vx: r2(p.vx), vy: r2(p.vy), vz: r2(p.vz), size: p.size, el: p.element })),
      grounds: this.grounds.map((g) => ({ id: g.id, kind: g.kind, x: r2(g.x), z: r2(g.z), r: g.r, t0: r2(g.t0), until: r2(g.until), data: g.data })),
      drops: [...this.drops.values()].map((d) => ({
        id: d.id, x: r2(d.x), z: r2(d.z), kind: d.item ? "item" : d.gold ? "gold" : "potion",
        rarity: d.item?.rarity, name: d.item?.name, icon: d.item ? BASE_BY_ID[d.item.base].icon : d.potion, amount: d.gold,
      })),
      opened: {
        chests: [...this.opened.chests], secrets: [...this.opened.secrets], shrines: [...this.opened.shrines], broken: [...this.opened.broken],
        chandeliers: [...this.opened.chandeliers], mimics: [...this.opened.mimics],
        doors: [...this.opened.doors], keys: [...this.opened.keys], plates: [...this.opened.plates], cracks: [...this.opened.cracks],
      },
      keyCount: this.keyCount,
      levers: Object.fromEntries([...this.leverCd].map(([k, v]) => [k, r2(Math.max(0, v - this.t))]).filter(([, v]) => (v as number) > 0)),
      bossDead: this.bossDead,
      exitOpen: this.bossDead,
    };
  }

  anyPlayerNear(x: number, z: number, r: number) {
    for (const p of this.players.values()) if (Math.hypot(p.x - x, p.z - z) < r) return true;
    return false;
  }

  /** Итоги забега для сохранения. */
  results() {
    return [...this.players.values()].map((p) => ({
      id: p.id, xp: p.xp, gold: p.gold, kills: p.kills, bosses: p.bosses, loot: p.loot, how: this.finished?.how,
      potionsUsed: p.potionsUsed, potionsFound: p.potionsFound,
    }));
  }
}
