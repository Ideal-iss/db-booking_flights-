/** Исполнение активных навыков в симуляции. */
import { SKILL_BY_ID, synergyMult, type BuffSpec, type Element } from "../data/skills";
import { CELL, walkable, worldToCell } from "../dungeon/generate";
import { groundAt } from "../dungeon/terrain";
import { lineOfSight, rayToWall } from "../physics";
import { ELEMENT_LIST, type Sim } from "./sim";
import type { Buff, SimEnemy, SimPlayer } from "./types";

let summonSeq = 0;

export function useSkill(sim: Sim, p: SimPlayer, slot: number, aim?: { x: number; y: number; z: number }) {
  const id = p.char.hotbar[slot];
  if (!id) return;
  const def = SKILL_BY_ID[id];
  const rank = p.char.skills[id] || 0;
  if (!def || def.kind !== "active" || rank <= 0 || def.cls !== p.char.cls) return;
  if ((p.cooldowns[id] || 0) > sim.t) return;
  const manaCost = def.cost?.mana || 0;
  const staminaCost = def.cost?.stamina || 0;
  if (p.mana < manaCost) { sim.events.push({ t: "nomana", p: p.id }); return; }
  if (p.stamina < staminaCost * 0.5) { sim.events.push({ t: "nostamina", p: p.id }); return; }
  const e = def.effect(rank);
  const fwd = sim.forward(p);
  // синергии и мастерства стихий
  const syn = synergyMult(def, p.char.skills);
  const el = (e as { element?: Element }).element;
  const mult = syn * (1 + (el ? p.stats.elemPct[el] || 0 : p.stats.elemPct.physical || 0));
  const roll = (m: number, weapon: boolean, crit = false) => (weapon ? sim.rollWeapon(p, m * mult, crit) : sim.rollSpell(p, m * mult));

  // Точка прицела для наземных навыков: клиент присылает её, сервер проверяет видимость и дальность.
  let target = { x: p.x + fwd.x * 8, z: p.z + fwd.z * 8 };
  if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.z)) {
    const d = Math.hypot(aim.x - p.x, aim.z - p.z);
    const max = 18;
    const k = d > max ? max / d : 1;
    target = { x: p.x + (aim.x - p.x) * k, z: p.z + (aim.z - p.z) * k };
  } else {
    const wall = rayToWall(sim.R, sim.phys, { x: p.x, y: 1.2, z: p.z }, { x: fwd.x, y: 0, z: fwd.z }, 12);
    target = { x: p.x + fwd.x * Math.max(1, wall - 0.5), z: p.z + fwd.z * Math.max(1, wall - 0.5) };
  }
  if (def.aimed && !lineOfSight(sim.R, sim.phys, p.x, 1.4, p.z, target.x, 0.6, target.z)) {
    sim.events.push({ t: "nosight", p: p.id });
    return;
  }

  let used = true;
  switch (e.type) {
    case "arc": {
      sim.breakInArc(p, e.range, e.arc);
      const targets = sim.enemiesInArc(p, e.range, e.arc);
      const hits = e.hits || 1;
      const elx = e.element || "physical";
      for (const en of targets) {
        for (let h = 0; h < hits && (en.state as string) !== "dead"; h++) {
          let m = e.dmg;
          if (e.execute && en.hp / en.maxHp < e.execute) m *= 2;
          const { dmg, crit } = roll(m, true, e.guaranteedCrit);
          sim.damageEnemy(en, dmg, elx, p, { crit, knock: h === hits - 1 ? e.knock : 0, stun: e.stun, melee: true });
        }
        if (e.bleed && (en.state as string) !== "dead") en.dots.push({ dps: p.stats.dmg[1] * e.bleed * mult, until: sim.t + 4, el: "physical", by: p.id });
      }
      if (hits > 1) sim.events.push({ t: "combo", p: p.id, n: hits });
      if (e.selfBuff) applyBuff(sim, p, def.id + "_after", e.selfBuff);
      break;
    }
    case "whirl":
      p.whirlUntil = sim.t + e.duration;
      p.whirlNext = sim.t;
      p.whirlDmg = e.dmg * mult;
      p.whirlR = e.radius;
      p.whirlTick = e.tick;
      break;
    case "projectile": {
      const n = e.count || 1;
      for (let i = 0; i < n; i++) {
        const r = roll(e.dmg, !!e.weapon);
        const off = n > 1 ? (i - (n - 1) / 2) * (e.spread || 0.15) * (n > 6 ? 1 : 1) : 0;
        sim.fireProjectile(p, {
          kind: e.weapon && e.element === "physical" ? "knife" : def.id, speed: e.speed, dmg: r.dmg, crit: r.crit, element: e.element, size: e.size || 0.3,
          explode: e.radius, pierce: e.pierce, slow: e.slow, undeadBonus: e.undeadBonus, freeze: e.freeze, yawOffset: n > 6 ? (i / n) * Math.PI * 2 : off,
          healAlly: e.healAlly ? e.healAlly * (1 + p.stats.healPct) : undefined, life: e.speed < 12 ? 4 : undefined,
        });
      }
      break;
    }
    case "nova": {
      sim.breakInRadius(p.x, p.z, e.radius, p);
      const weapon = e.weapon || e.element === "physical";
      for (const en of sim.enemies.values()) {
        if (en.state === "dead" || en.team !== "enemy") continue;
        if (Math.hypot(en.x - p.x, en.z - p.z) > e.radius + en.def.radius) continue;
        if (!lineOfSight(sim.R, sim.phys, p.x, 1.2, p.z, en.x, 1, en.z)) continue;
        const r = roll(e.dmg, weapon);
        sim.damageEnemy(en, r.dmg, e.element, p, { crit: r.crit, freeze: e.freeze, knock: e.knock, stun: e.stun, slow: e.slow });
        if (e.dot && (en.state as string) !== "dead") en.dots.push({ dps: (weapon ? p.stats.dmg[1] : p.stats.spell[1]) * e.dot * mult, until: sim.t + 4, el: e.element, by: p.id });
      }
      sim.events.push({ t: "nova", p: p.id, x: p.x, z: p.z, r: e.radius, el: e.element });
      break;
    }
    case "ground": {
      const r = roll(e.dmg, false);
      sim.addGround({
        kind: e.element === "fire" ? "meteor" : e.element === "holy" ? "smite" : "bone_prison", x: target.x, z: target.z, r: e.radius, until: sim.t + e.delay,
        owner: p.id, team: "player", data: { dmg: r.dmg, crit: r.crit ? 1 : 0, undeadStun: e.undeadStun || 0, stun: e.stun || 0 },
      });
      break;
    }
    case "buff": {
      if (e.hpCostPct) {
        if (p.hp <= p.stats.maxHp * e.hpCostPct + 1) { used = false; break; }
        p.hp -= p.stats.maxHp * e.hpCostPct;
      }
      applyBuff(sim, p, def.id, e, mult);
      break;
    }
    case "warcry": {
      for (const en of sim.enemies.values()) {
        if (en.state === "dead" || en.team !== "enemy") continue;
        if (Math.hypot(en.x - p.x, en.z - p.z) > e.radius + en.def.radius) continue;
        if (e.dmg) { const r = roll(e.dmg, true); sim.damageEnemy(en, r.dmg, "physical", p, { crit: r.crit, stun: e.stun, knock: 1 }); }
        else if (e.stun) en.stunUntil = Math.max(en.stunUntil, sim.t + (en.boss ? e.stun * 0.25 : e.stun));
        if (e.fear) {
          en.fearUntil = sim.t + (en.boss ? e.fear * 0.2 : e.fear);
          if (en.state === "windup") { en.state = "recover"; en.stateT = sim.t + 0.2; en.attack = ""; }
          sim.wake(en, p.id);
        }
      }
      if (e.buff) applyBuff(sim, p, def.id, e.buff, mult);
      sim.events.push({ t: "warcry", p: p.id, x: p.x, z: p.z, r: e.radius, fear: e.fear ? 1 : 0 });
      break;
    }
    case "chain": {
      const tgt = sim.enemiesInArc(p, e.range, 0.7).find((x) => !x.phased) || nearestVisible(sim, p.x, p.z, e.range * 0.6);
      if (!tgt) { sim.events.push({ t: "nosight", p: p.id }); used = false; break; }
      const r = roll(e.dmg, !!e.weapon);
      sim.chainFrom(p, p.x - Math.sin(p.yaw) * 0.6, p.y + 1.4, p.z - Math.cos(p.yaw) * 0.6, tgt, r.dmg, e.element, e.jumps, { stun: e.stun });
      break;
    }
    case "field": {
      const base = e.weapon ? (p.stats.dmg[0] + p.stats.dmg[1]) / 2 : (p.stats.spell[0] + p.stats.spell[1]) / 2;
      const dpsMul = 1 + (e.weapon ? p.stats.dmgPct : p.stats.spellPct) + sim.buffSum(p, "dmgPct");
      const at = e.style === "armageddon" ? { x: p.x, z: p.z } : target;
      sim.addGround({
        kind: "field_" + e.style, x: at.x, z: at.z, r: e.radius, until: sim.t + e.duration, owner: p.id, team: "player",
        data: { dps: base * e.dps * mult * dpsMul, elx: ELEMENT_LIST.indexOf(e.element), slow: e.slow || 0, next: 0 },
      });
      break;
    }
    case "sentry": {
      const n = 1 + (e.count || 0) + (p.stats.flags.extraTraps && e.style !== "hydra" ? p.stats.flags.extraTraps : 0);
      const base = e.weapon ? (p.stats.dmg[0] + p.stats.dmg[1]) / 2 : (p.stats.spell[0] + p.stats.spell[1]) / 2;
      const dmgMul = 1 + (e.weapon ? p.stats.dmgPct : p.stats.spellPct) + sim.buffSum(p, "dmgPct");
      // старые ловушки того же вида убираем (не больше 5 разом)
      const mine = sim.grounds.filter((g) => g.owner === p.id && g.kind === "sentry_" + e.style);
      while (mine.length + n > 5) { const old = mine.shift()!; old.until = sim.t; }
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        let sx = target.x + (n > 1 ? Math.cos(a) * 1.2 : 0), sz = target.z + (n > 1 ? Math.sin(a) * 1.2 : 0);
        if (!walkable(sim.d, worldToCell(sx), worldToCell(sz), sim.opened.secrets)) { sx = target.x; sz = target.z; }
        sim.addGround({
          kind: "sentry_" + e.style, x: sx, z: sz, r: 0.6, until: sim.t + e.duration, owner: p.id, team: "player",
          data: { dmg: base * e.dmg * mult * dmgMul, rate: e.rate, range: e.range, elx: ELEMENT_LIST.indexOf(e.element), next: sim.t + 0.4 + i * 0.15 },
        });
      }
      break;
    }
    case "leap": {
      const t = clampTarget(sim, p, target, e.range);
      if (!t) { sim.events.push({ t: "nosight", p: p.id }); used = false; break; }
      p.x = t.x; p.z = t.z;
      p.iframesUntil = sim.t + 0.45;
      p.y = groundAt(sim.d, t.x, t.z);
      sim.events.push({ t: "teleport", p: p.id, x: t.x, y: p.y, z: t.z, yaw: p.yaw, leap: 1 });
      sim.breakInRadius(t.x, t.z, e.radius, p);
      for (const en of sim.enemies.values()) {
        if (en.state === "dead" || en.team !== "enemy") continue;
        if (Math.hypot(en.x - t.x, en.z - t.z) > e.radius + en.def.radius) continue;
        const r = roll(e.dmg, true);
        sim.damageEnemy(en, r.dmg, "physical", p, { crit: r.crit, stun: e.stun, knock: 3 });
      }
      sim.events.push({ t: "nova", p: p.id, x: t.x, z: t.z, r: e.radius, el: "physical", slam: 1 });
      break;
    }
    case "blink": {
      const t = clampTarget(sim, p, target, e.range);
      if (!t) { sim.events.push({ t: "nosight", p: p.id }); used = false; break; }
      sim.events.push({ t: "blink_from", p: p.id, x: p.x, z: p.z, el: e.element || "arcane" });
      p.x = t.x; p.z = t.z;
      p.iframesUntil = sim.t + 0.25;
      p.y = groundAt(sim.d, t.x, t.z);
      sim.events.push({ t: "teleport", p: p.id, x: t.x, y: p.y, z: t.z, yaw: p.yaw });
      if (e.novaDmg) {
        for (const en of sim.enemies.values()) {
          if (en.state === "dead" || en.team !== "enemy") continue;
          if (Math.hypot(en.x - t.x, en.z - t.z) > 3.2 + en.def.radius) continue;
          const r = roll(e.novaDmg, true);
          sim.damageEnemy(en, r.dmg, e.element || "dark", p, { crit: r.crit, knock: 2 });
        }
        sim.events.push({ t: "nova", p: p.id, x: t.x, z: t.z, r: 3.2, el: e.element || "dark" });
      }
      break;
    }
    case "heal": {
      const amount = (e.base + p.stats.spell[1] * e.scale) * (1 + p.stats.healPct) * syn;
      for (const o of sim.players.values()) {
        if (o.alive && Math.hypot(o.x - p.x, o.z - p.z) <= e.radius) sim.healPlayer(o, amount);
      }
      sim.events.push({ t: "nova", p: p.id, x: p.x, z: p.z, r: e.radius, el: "holy" });
      break;
    }
    case "summon": {
      const type = SUMMON_TYPES[e.unit || "skeleton"] || "summoned_skeleton";
      const mine = [...sim.enemies.values()].filter((x) => x.team === "ally" && x.owner === p.id && x.state !== "dead" && x.type === type);
      const max = e.max + (type === "summoned_skeleton" ? p.stats.flags.extraSkeleton || 0 : 0);
      const n = e.count || 1;
      while (mine.length + n > Math.max(max, n)) {
        const old = mine.shift()!;
        sim.killEnemy(old, null);
      }
      const power = 0.7 + 0.15 * rank + p.stats.summonPct;
      for (let i = 0; i < n; i++) {
        const a = p.yaw + (n > 1 ? (i - (n - 1) / 2) * 0.9 : 0);
        let sx = p.x - Math.sin(a) * 1.8, sz = p.z - Math.cos(a) * 1.8;
        if (!walkable(sim.d, worldToCell(sx), worldToCell(sz), sim.opened.secrets)) { sx = p.x; sz = p.z; }
        const s = sim.spawnEnemy(`ally${summonSeq++}_${p.id}`, type, sx, sz, p.level, { team: "ally", owner: p.id, power, expires: sim.t + e.duration });
        s.awake = true;
        s.yaw = p.yaw;
        sim.events.push({ t: "summon", p: p.id, id: s.id, x: sx, z: sz, unit: type });
      }
      break;
    }
    case "dash": {
      // Ищем цель впереди; без цели — просто рывок.
      const targets = sim.enemiesInArc(p, e.distance, 0.9);
      const tgt = targets[0];
      let tx: number, tz: number;
      if (tgt) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z, l = Math.hypot(dx, dz) || 1;
        const off = tgt.def.radius + 0.7;
        if (e.behind) { tx = tgt.x + (dx / l) * off; tz = tgt.z + (dz / l) * off; }
        else { tx = tgt.x - (dx / l) * off; tz = tgt.z - (dz / l) * off; }
        if (!walkable(sim.d, worldToCell(tx), worldToCell(tz), sim.opened.secrets)) { tx = tgt.x - (dx / l) * off; tz = tgt.z - (dz / l) * off; }
      } else {
        const wall = rayToWall(sim.R, sim.phys, { x: p.x, y: 1, z: p.z }, { x: fwd.x, y: 0, z: fwd.z }, e.distance);
        const dist = Math.max(0, wall - 0.7);
        tx = p.x + fwd.x * dist; tz = p.z + fwd.z * dist;
      }
      if (!walkable(sim.d, worldToCell(tx), worldToCell(tz), sim.opened.secrets)) { tx = p.x; tz = p.z; }
      p.x = tx; p.z = tz;
      p.iframesUntil = sim.t + 0.3;
      p.dodgeUntil = sim.t + 0.25;
      if (tgt) {
        if (e.behind) p.yaw = Math.atan2(-(tgt.x - tx), -(tgt.z - tz));
        const r = sim.rollWeapon(p, e.dmg, e.guaranteedCrit);
        sim.damageEnemy(tgt, r.dmg, "physical", p, { crit: r.crit, knock: e.knock, melee: true });
      }
      p.y = groundAt(sim.d, tx, tz);
      sim.events.push({ t: "teleport", p: p.id, x: tx, y: p.y, z: tz, yaw: p.yaw });
      break;
    }
    case "corpse": {
      let best = null as null | (typeof sim.enemies extends Map<string, infer V> ? V : never), bd = 14;
      for (const en of sim.enemies.values()) {
        if (en.state !== "dead" || !en.corpse) continue;
        const d = Math.hypot(en.x - target.x, en.z - target.z);
        if (d < bd) { bd = d; best = en; }
      }
      if (!best) { sim.events.push({ t: "nocorpse", p: p.id }); used = false; break; }
      best.corpse = false;
      const base = best.maxHp * e.pctOfCorpse * syn + roll(e.dmg, false).dmg;
      sim.events.push({ t: "explode", x: best.x, z: best.z, r: e.radius, el: "dark" });
      for (const en of sim.enemies.values()) {
        if (en.state === "dead" || en.team !== "enemy") continue;
        if (Math.hypot(en.x - best.x, en.z - best.z) < e.radius + en.def.radius) sim.damageEnemy(en, base, "dark", p, { knock: 2 });
      }
      sim.enemies.delete(best.id);
      break;
    }
    case "curse":
      sim.addGround({
        kind: "curse", x: target.x, z: target.z, r: e.radius, until: sim.t + e.duration * (1 + (p.stats.flags.curseDur || 0)), owner: p.id, team: "player",
        data: { vuln: e.vuln, slow: e.slow, weaken: e.weaken || 0, lifeTap: e.lifeTap || 0, style: e.weaken && !e.vuln ? 1 : e.lifeTap && e.vuln < 0.1 ? 2 : 0 },
      });
      break;
    case "shield":
      p.absorb = p.stats.maxHp * e.pctOfHp;
      p.absorbUntil = sim.t + e.duration;
      break;
    case "taunt":
      p.tauntUntil = sim.t + e.duration;
      p.tauntDr = e.drPct;
      for (const en of sim.enemies.values()) {
        if (en.state === "dead" || en.team !== "enemy") continue;
        if (Math.hypot(en.x - p.x, en.z - p.z) < e.radius) { en.target = p.id; sim.wake(en, p.id); en.patternCd.taunt = sim.t + e.duration; }
      }
      sim.events.push({ t: "nova", p: p.id, x: p.x, z: p.z, r: e.radius, el: "physical" });
      break;
    case "blind":
      for (const en of sim.enemies.values()) {
        if (en.state === "dead" || en.team !== "enemy") continue;
        if (Math.hypot(en.x - p.x, en.z - p.z) < e.radius) {
          en.blindUntil = sim.t + (en.boss ? e.duration * 0.3 : e.duration);
          if (en.target === p.id && !en.boss) en.target = null;
        }
      }
      p.buffs = p.buffs.filter((b) => b.id !== def.id);
      p.buffs.push({ id: def.id, until: sim.t + e.duration, movePct: e.movePct });
      sim.events.push({ t: "smoke", p: p.id, x: p.x, z: p.z, r: e.radius });
      break;
    case "sanctuary":
      sim.addGround({
        kind: "sanctuary", x: p.x, z: p.z, r: e.radius, until: sim.t + e.duration, owner: p.id, team: "player",
        data: { dr: e.drPct, regen: e.regenPct, dps: Math.max(p.stats.spell[1], p.stats.dmg[1] * 0.6) * e.holyDps * syn },
      });
      break;
    default:
      used = false;
  }
  if (!used) return;
  p.mana -= manaCost;
  if (staminaCost) {
    p.stamina = Math.max(0, p.stamina - staminaCost);
    p.staminaDelayUntil = sim.t + 0.7;
  }
  p.cooldowns[id] = sim.t + (def.cooldown || 0);
  sim.events.push({ t: "cast", p: p.id, skill: id });
}

const SUMMON_TYPES: Record<string, string> = {
  skeleton: "summoned_skeleton", skeleton_mage: "summoned_mage", golem: "clay_golem", blood_golem: "blood_golem", shadow: "shadow_clone", spirit: "guardian_spirit",
};

/** Бафф на себя, а с party — и на союзников рядом. */
function applyBuff(sim: Sim, p: SimPlayer, id: string, b: BuffSpec, mult = 1) {
  const targets = b.party ? [...sim.players.values()].filter((o) => o.alive && Math.hypot(o.x - p.x, o.z - p.z) <= b.party!) : [p];
  const auraBase = b.auraDps ? Math.max((p.stats.spell[0] + p.stats.spell[1]) / 2 * (1 + p.stats.spellPct), (p.stats.dmg[0] + p.stats.dmg[1]) / 2 * (1 + p.stats.dmgPct)) * mult : undefined;
  for (const o of targets) {
    o.buffs = o.buffs.filter((x) => x.id !== id);
    const buff: Buff = {
      id, until: sim.t + b.duration, dmgPct: b.dmgPct, atkSpeedPct: b.atkSpeedPct, poison: b.poison, movePct: b.movePct, drPct: b.drPct,
      regenPct: b.regenPct, lifeSteal: b.lifeSteal, critChance: b.critChance, thorns: b.thorns,
    };
    if (o === p && b.auraDps) Object.assign(buff, { auraDps: b.auraDps, auraR: b.auraR, auraEl: b.auraEl, auraUndead: b.auraUndead ? 1 : 0, auraBase });
    o.buffs.push(buff);
  }
  sim.events.push({ t: "buff", p: p.id, id, x: p.x, z: p.z, party: b.party || 0 });
}

function nearestVisible(sim: Sim, x: number, z: number, range: number): SimEnemy | null {
  let best: SimEnemy | null = null, bd = range;
  for (const e of sim.enemies.values()) {
    if (e.state === "dead" || e.team !== "enemy" || e.phased) continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d < bd && lineOfSight(sim.R, sim.phys, x, 1.2, z, e.x, 1, e.z)) { bd = d; best = e; }
  }
  return best;
}

/** Точка прыжка/телепорта: в пределах дальности, на полу, в прямой видимости. */
function clampTarget(sim: Sim, p: SimPlayer, t: { x: number; z: number }, range: number) {
  let dx = t.x - p.x, dz = t.z - p.z;
  const d = Math.hypot(dx, dz);
  if (d > range) { dx *= range / d; dz *= range / d; }
  for (let k = 1; k > 0.1; k -= 0.15) {
    const x = p.x + dx * k, z = p.z + dz * k;
    if (walkable(sim.d, worldToCell(x), worldToCell(z), sim.opened.secrets) && lineOfSight(sim.R, sim.phys, p.x, 1.2, p.z, x, 1.2, z)) return { x, z };
  }
  return null;
}

export { CELL };
