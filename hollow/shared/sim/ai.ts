/** Искусственный интеллект врагов, призванных союзников и боссов. */
import { walkable, worldToCell } from "../dungeon/generate";
import { lineOfSight } from "../physics";
import type { Sim } from "./sim";
import type { SimEnemy, SimPlayer } from "./types";

type Target = { id: string; x: number; z: number; r: number; player: SimPlayer | null; ally: SimEnemy | null };

const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

function turnTowards(e: SimEnemy, yaw: number, dt: number, rate = 8) {
  let d = yaw - e.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = rate * dt;
  e.yaw += Math.abs(d) < step ? d : Math.sign(d) * step;
}

function speedOf(sim: Sim, e: SimEnemy) {
  let s = e.speed;
  if (e.slowUntil > sim.t) s *= 1 - e.slowPct;
  if (e.blindUntil > sim.t) s *= 0.4;
  return s;
}

function resolveTarget(sim: Sim, e: SimEnemy): Target | null {
  if (e.team === "ally") {
    let best: SimEnemy | null = null, bd = 16;
    for (const o of sim.enemies.values()) {
      if (o.team !== "enemy" || o.state === "dead") continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d < bd && (o.awake || d < 6)) { bd = d; best = o; }
    }
    if (best) return { id: best.id, x: best.x, z: best.z, r: best.def.radius, player: null, ally: best };
    return null;
  }
  if (e.target) {
    const p = sim.players.get(e.target);
    if (p && p.alive && p.connected) return { id: p.id, x: p.x, z: p.z, r: 0.4, player: p, ally: null };
    const a = sim.enemies.get(e.target);
    if (a && a.team === "ally" && a.state !== "dead") return { id: a.id, x: a.x, z: a.z, r: a.def.radius, player: null, ally: a };
    e.target = null;
  }
  // Принудительный вызов рыцаря держит цель.
  const p = sim.nearestPlayer(e, e.awake ? 70 : e.def.aggro, !e.awake);
  if (p) {
    e.target = p.id;
    return { id: p.id, x: p.x, z: p.z, r: 0.4, player: p, ally: null };
  }
  // призванные скелеты рядом тоже цель
  for (const a of sim.enemies.values()) {
    if (a.team === "ally" && a.state !== "dead" && Math.hypot(a.x - e.x, a.z - e.z) < 6) {
      e.target = a.id;
      return { id: a.id, x: a.x, z: a.z, r: a.def.radius, player: null, ally: a };
    }
  }
  return null;
}

function hitTarget(sim: Sim, e: SimEnemy, t: Target, dmg: number, melee = true) {
  if (t.player) sim.damagePlayer(t.player, dmg, e.def.element, e, { melee });
  else if (t.ally) sim.damageEnemy(t.ally, dmg, e.def.element, e, { knock: 1 });
}

function moveTowards(sim: Sim, e: SimEnemy, tx: number, tz: number, dt: number, mul = 1) {
  const [dx, dz] = sim.pathDir(e, tx, tz);
  const s = speedOf(sim, e) * mul * dt;
  sim.moveEnemy(e, dx * s, dz * s);
  turnTowards(e, yawTo(dx, dz), dt);
}

function startWindup(sim: Sim, e: SimEnemy, attack: string, time: number, data?: Record<string, number>) {
  e.state = "windup";
  e.attack = attack;
  e.stateT = sim.t + time;
  e.attackData = data;
  e.guarding = false;
  sim.events.push({ t: "windup", id: e.id, atk: attack, time });
}

function recover(sim: Sim, e: SimEnemy, time: number) {
  e.state = "recover";
  e.stateT = sim.t + time;
}

export function updateEnemy(sim: Sim, e: SimEnemy, dt: number) {
  // контроль
  if (e.freezeUntil > sim.t || e.stunUntil > sim.t) {
    if (e.state === "windup" || e.state === "lunge") { e.state = "recover"; e.stateT = sim.t + 0.1; e.attack = ""; }
    e.guarding = false;
    return;
  }
  if (e.team === "enemy" && !e.awake) {
    const p = sim.nearestPlayer(e, e.def.aggro, true);
    if (p) sim.wake(e, p.id);
    else return;
  }
  const t = resolveTarget(sim, e);
  if (e.team === "ally" && !t) {
    // следуем за хозяином
    const owner = e.owner ? sim.players.get(e.owner) : null;
    if (owner && Math.hypot(owner.x - e.x, owner.z - e.z) > 3) moveTowards(sim, e, owner.x, owner.z, dt, 1.2);
    e.state = "idle";
    return;
  }
  if (!t) { e.state = "idle"; return; }

  const dx = t.x - e.x, dz = t.z - e.z;
  const dist = Math.hypot(dx, dz);
  const gap = dist - t.r - e.def.radius;

  if (e.def.behavior === "boss") return bossUpdate(sim, e, t, dist, gap, dt);

  switch (e.state) {
    case "windup":
      turnTowards(e, yawTo(dx, dz), dt, e.def.behavior === "brute" ? 2 : 5);
      if (sim.t >= e.stateT) resolveAttack(sim, e, t, gap);
      return;
    case "lunge": {
      const d = e.attackData!;
      const s = 13 * dt;
      sim.moveEnemy(e, d.dx * s, d.dz * s);
      if (!d.hit && gap < 0.6) { d.hit = 1; hitTarget(sim, e, t, e.dmg * 1.2); }
      if (sim.t >= e.stateT) recover(sim, e, 0.6);
      return;
    }
    case "recover":
      if (sim.t >= e.stateT) e.state = "chase";
      return;
    default:
      break;
  }
  e.state = "chase";
  const ready = sim.t >= e.cd && e.blindUntil <= sim.t;
  const sight = dist < 30 && lineOfSight(sim.R, sim.phys, e.x, 1.4, e.z, t.x, 1.2, t.z);

  switch (e.def.behavior) {
    case "ranged": {
      const keep = e.def.keepDistance || 8;
      if (sight && dist < keep - 2.5) {
        // отступаем
        const l = dist || 1;
        const bx = e.x - (dx / l) * 2, bz = e.z - (dz / l) * 2;
        if (walkable(sim.d, worldToCell(bx), worldToCell(bz), sim.opened.secrets)) {
          const s = speedOf(sim, e) * 0.8 * dt;
          sim.moveEnemy(e, (-dx / l) * s, (-dz / l) * s);
        }
        turnTowards(e, yawTo(dx, dz), dt);
      } else if (!sight || dist > e.def.range) {
        moveTowards(sim, e, t.x, t.z, dt);
      } else turnTowards(e, yawTo(dx, dz), dt);
      if (ready && sight && dist <= e.def.range) startWindup(sim, e, "bolt", e.def.windup);
      else if (ready && gap < 1.2) startWindup(sim, e, "melee", e.def.windup * 0.8);
      return;
    }
    case "aggressive": {
      if (ready && sight && gap > 2.2 && gap < 6.5) {
        startWindup(sim, e, "lunge", 0.4);
        return;
      }
      if (gap > e.def.range * 0.6) moveTowards(sim, e, t.x, t.z, dt);
      else turnTowards(e, yawTo(dx, dz), dt);
      if (ready && gap <= e.def.range) startWindup(sim, e, "melee", e.def.windup);
      return;
    }
    case "brute": {
      if (gap > e.def.range * 0.7) moveTowards(sim, e, t.x, t.z, dt);
      else turnTowards(e, yawTo(dx, dz), dt, 3);
      if (ready && gap <= e.def.range) {
        const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
        const cx = e.x + fx * 2.2, cz = e.z + fz * 2.2;
        sim.addGround({ kind: "warn_circle", x: cx, z: cz, r: 2.6, until: sim.t + e.def.windup, owner: e.id, team: "enemy", data: { dmg: e.dmg, el: 0 } });
        startWindup(sim, e, "slam", e.def.windup);
      }
      return;
    }
    case "defensive":
      e.guarding = gap < 6;
      if (gap > e.def.range * 0.8) moveTowards(sim, e, t.x, t.z, dt, e.guarding ? 0.7 : 1);
      else turnTowards(e, yawTo(dx, dz), dt, 4);
      if (ready && gap <= e.def.range) startWindup(sim, e, "melee", e.def.windup);
      return;
    default:
      // melee и summon
      if (gap > e.def.range * 0.7) moveTowards(sim, e, t.x, t.z, dt);
      else turnTowards(e, yawTo(dx, dz), dt);
      if (ready && gap <= e.def.range) startWindup(sim, e, "melee", e.def.windup);
  }
}

function resolveAttack(sim: Sim, e: SimEnemy, t: Target, gap: number) {
  const atk = e.attack;
  e.attack = "";
  e.cd = sim.t + e.def.cooldown * (0.85 + sim.rng.next() * 0.3);
  if (atk === "melee") {
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const dx = t.x - e.x, dz = t.z - e.z, l = Math.hypot(dx, dz) || 1;
    const facing = (dx * fx + dz * fz) / l > 0.4;
    sim.events.push({ t: "eswing", id: e.id });
    if (gap <= e.def.range + 0.5 && facing) hitTarget(sim, e, t, e.dmg);
    recover(sim, e, 0.35);
  } else if (atk === "bolt") {
    const pr = e.def.projectile!;
    sim.enemyProjectile(e, t.x, 1.2, t.z, { kind: "ebolt", speed: pr.speed, dmg: e.dmg, element: pr.element, size: pr.size });
    sim.events.push({ t: "ecast", id: e.id });
    recover(sim, e, 0.4);
  } else if (atk === "lunge") {
    const dx = t.x - e.x, dz = t.z - e.z, l = Math.hypot(dx, dz) || 1;
    e.state = "lunge";
    e.stateT = sim.t + Math.min(0.55, (l + 1) / 13);
    e.attackData = { dx: dx / l, dz: dz / l, hit: 0 };
    sim.events.push({ t: "eswing", id: e.id });
  } else if (atk === "slam") {
    // урон наносит предупреждающий круг (stepGrounds)
    sim.events.push({ t: "slam", id: e.id });
    recover(sim, e, 0.8);
  } else recover(sim, e, 0.3);
}

// ------------------------------------------------------------------ боссы
function patternReady(sim: Sim, e: SimEnemy, name: string) {
  return (e.patternCd[name] || 0) <= sim.t;
}
function usePattern(sim: Sim, e: SimEnemy, name: string, cd: number) {
  e.patternCd[name] = sim.t + cd * (e.phase === 2 ? 0.7 : 1);
}

function bossUpdate(sim: Sim, e: SimEnemy, t: Target, dist: number, gap: number, dt: number) {
  const dx = t.x - e.x, dz = t.z - e.z;
  if (e.state === "windup") {
    if (e.attack !== "charge") turnTowards(e, yawTo(dx, dz), dt, 3);
    if (sim.t >= e.stateT) bossResolve(sim, e, t, gap);
    return;
  }
  if (e.state === "lunge") {
    const d = e.attackData!;
    const s = 15 * dt;
    sim.moveEnemy(e, d.dx * s, d.dz * s);
    if (sim.t >= e.stateT) recover(sim, e, 0.9);
    return;
  }
  if (e.state === "recover") {
    if (sim.t >= e.stateT) e.state = "chase";
    return;
  }
  e.state = "chase";
  const ready = sim.t >= e.cd;
  const sight = lineOfSight(sim.R, sim.phys, e.x, 1.6, e.z, t.x, 1.2, t.z);
  const players = [...sim.players.values()].filter((p) => p.alive && p.connected);

  if (ready) {
    switch (e.type) {
      case "bone_priest":
        if (patternReady(sim, e, "summon") && dist < 18) {
          usePattern(sim, e, "summon", 14);
          return startWindup(sim, e, "summon", 1.1);
        }
        if (e.phase === 2 && patternReady(sim, e, "ring") && dist < 8) {
          usePattern(sim, e, "ring", 9);
          sim.addGround({ kind: "warn_ring", x: e.x, z: e.z, r: 7, until: sim.t + 1.2, owner: e.id, team: "enemy", data: { dmg: e.dmg * 1.6, el: 0, inner: 2 } });
          return startWindup(sim, e, "ring", 1.2);
        }
        if (patternReady(sim, e, "volley") && sight && dist > 4) {
          usePattern(sim, e, "volley", 4.5);
          return startWindup(sim, e, "volley", 0.8);
        }
        break;
      case "hollow_knight":
        if (patternReady(sim, e, "leap") && dist > 6 && dist < 16) {
          usePattern(sim, e, "leap", 10);
          sim.addGround({ kind: "warn_circle", x: t.x, z: t.z, r: 3.2, until: sim.t + 1.1, owner: e.id, team: "enemy", data: { dmg: e.dmg * 1.7, el: 0 } });
          return startWindup(sim, e, "leap", 1.1, { x: t.x, z: t.z });
        }
        if (patternReady(sim, e, "charge") && sight && dist > 4 && dist < 14) {
          usePattern(sim, e, "charge", 8);
          const l = dist || 1;
          const len = Math.min(13, dist + 3);
          e.yaw = yawTo(dx, dz);
          sim.addGround({ kind: "warn_line", x: e.x, z: e.z, r: 1.4, until: sim.t + 0.95, owner: e.id, team: "enemy", data: { dx: dx / l, dz: dz / l, len, dmg: e.dmg * 1.4 } });
          return startWindup(sim, e, "charge", 0.9, { dx: dx / l, dz: dz / l, len });
        }
        if (e.phase === 2 && patternReady(sim, e, "quake") && dist < 6) {
          usePattern(sim, e, "quake", 8);
          sim.addGround({ kind: "warn_circle", x: e.x, z: e.z, r: 5.5, until: sim.t + 1.0, owner: e.id, team: "enemy", data: { dmg: e.dmg * 1.3, el: 0 } });
          return startWindup(sim, e, "quake", 1.0);
        }
        break;
      case "forgotten_saint":
        if (patternReady(sim, e, "pillars")) {
          usePattern(sim, e, "pillars", 7);
          for (const p of players) sim.addGround({ kind: "warn_circle", x: p.x, z: p.z, r: 2.4, until: sim.t + 1.3, owner: e.id, team: "enemy", data: { dmg: e.dmg * 1.5, el: 1 } });
          return startWindup(sim, e, "pillars", 1.0);
        }
        if (e.phase === 2 && patternReady(sim, e, "halo")) {
          usePattern(sim, e, "halo", 11);
          sim.addGround({ kind: "warn_ring", x: e.x, z: e.z, r: 10, until: sim.t + 1.6, owner: e.id, team: "enemy", data: { dmg: e.dmg * 1.8, el: 1, inner: 3.5 } });
          return startWindup(sim, e, "halo", 1.6);
        }
        if (patternReady(sim, e, "volley") && sight && dist > 3.5) {
          usePattern(sim, e, "volley", 3.2);
          return startWindup(sim, e, "volley", 0.7);
        }
        break;
      case "blood_abomination":
        if (patternReady(sim, e, "pools")) {
          usePattern(sim, e, "pools", e.phase === 2 ? 8 : 12);
          for (const p of players) {
            sim.addGround({ kind: "blood_pool", x: p.x + sim.rng.range(-1, 1), z: p.z + sim.rng.range(-1, 1), r: 2.2, until: sim.t + 9, owner: e.id, team: "enemy", data: { dps: e.dmg * 0.5 } });
          }
          return startWindup(sim, e, "roar", 0.8);
        }
        if (patternReady(sim, e, "charge") && sight && dist > 5 && dist < 16) {
          usePattern(sim, e, "charge", 9);
          const l = dist || 1;
          const len = Math.min(15, dist + 3);
          e.yaw = yawTo(dx, dz);
          sim.addGround({ kind: "warn_line", x: e.x, z: e.z, r: 1.8, until: sim.t + 1.15, owner: e.id, team: "enemy", data: { dx: dx / l, dz: dz / l, len, dmg: e.dmg * 1.3 } });
          return startWindup(sim, e, "charge", 1.1, { dx: dx / l, dz: dz / l, len });
        }
        if (gap <= e.def.range + 0.5) {
          const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
          sim.addGround({ kind: "warn_circle", x: e.x + fx * 2.6, z: e.z + fz * 2.6, r: 3.2, until: sim.t + e.def.windup, owner: e.id, team: "enemy", data: { dmg: e.dmg, el: 0 } });
          e.cd = sim.t + e.def.cooldown;
          return startWindup(sim, e, "slam", e.def.windup);
        }
        break;
    }
    if (gap <= e.def.range) {
      e.cd = sim.t + e.def.cooldown * (e.phase === 2 ? 0.75 : 1);
      return startWindup(sim, e, "melee", e.def.windup * (e.phase === 2 ? 0.8 : 1));
    }
  }
  if (gap > e.def.range * 0.7) moveTowards(sim, e, t.x, t.z, dt, e.phase === 2 ? 1.15 : 1);
  else turnTowards(e, yawTo(dx, dz), dt, 4);
}

function bossResolve(sim: Sim, e: SimEnemy, t: Target, gap: number) {
  const atk = e.attack;
  const data = e.attackData || {};
  e.attack = "";
  switch (atk) {
    case "melee": {
      const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
      const dx = t.x - e.x, dz = t.z - e.z, l = Math.hypot(dx, dz) || 1;
      sim.events.push({ t: "eswing", id: e.id });
      if (gap <= e.def.range + 0.6 && (dx * fx + dz * fz) / l > 0.2) hitTarget(sim, e, t, e.dmg);
      return recover(sim, e, 0.5);
    }
    case "volley": {
      const pr = e.def.projectile!;
      const n = e.phase === 2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        sim.enemyProjectile(e, t.x, 1.2, t.z, { kind: "ebolt", speed: pr.speed, dmg: e.dmg * 0.8, element: pr.element, size: pr.size, spread: (i - (n - 1) / 2) * 0.17 });
      }
      sim.events.push({ t: "ecast", id: e.id });
      return recover(sim, e, 0.6);
    }
    case "summon": {
      const n = e.phase === 2 ? 3 : 2;
      let made = 0;
      for (let i = 0; i < 8 && made < n; i++) {
        const a = sim.rng.range(0, Math.PI * 2);
        const sx = e.x + Math.cos(a) * 3, sz = e.z + Math.sin(a) * 3;
        if (!walkable(sim.d, worldToCell(sx), worldToCell(sz), sim.opened.secrets)) continue;
        const s = sim.spawnEnemy(`${e.id}_add${Math.floor(sim.t * 10)}_${i}`, "skeleton", sx, sz, e.level);
        s.awake = true;
        s.target = t.player ? t.player.id : null;
        s.xp = Math.round(s.xp * 0.3);
        made++;
        sim.events.push({ t: "esummon", id: s.id, x: sx, z: sz });
      }
      return recover(sim, e, 0.7);
    }
    case "leap": {
      // приземление: урон уже нанёс круг, переносим босса
      const tx = data.x, tz = data.z;
      if (walkable(sim.d, worldToCell(tx), worldToCell(tz), sim.opened.secrets) && e.body) {
        e.x = tx; e.z = tz;
        e.body.setNextKinematicTranslation({ x: tx, y: e.def.height / 2, z: tz });
      }
      sim.events.push({ t: "slam", id: e.id });
      return recover(sim, e, 1.0);
    }
    case "charge":
      e.state = "lunge";
      e.stateT = sim.t + data.len / 15;
      e.attackData = { dx: data.dx, dz: data.dz };
      return;
    default:
      sim.events.push({ t: "slam", id: e.id });
      return recover(sim, e, 0.7);
  }
}
