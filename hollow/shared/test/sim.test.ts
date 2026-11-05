import RAPIER from "@dimforge/rapier3d-compat";
import { Sim } from "../sim/sim";
import { CLASS_IDS, CLASSES } from "../data/classes";
import { starterItem, slotOf, BASE_BY_ID } from "../data/items";
import { skillsOf } from "../data/skills";
import { STAGES } from "../data/dungeons";
import { makeChar } from "./chars";
import { generateDungeon, walkable, worldToCell } from "../dungeon/generate";
import { lineOfSight } from "../physics";

await RAPIER.init();
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };

for (const th of STAGES) for (let seed = 1; seed <= 2; seed++) {
  for (const cls of CLASS_IDS) {
    const sim = new Sim(RAPIER, { dungeon: th.id, seed: seed * 977, level: th.level, players: [{ id: "a", name: "A", char: makeChar(cls, th.level) }] });
    const p = sim.players.get("a")!;
    ok(walkable(sim.d, worldToCell(p.x), worldToCell(p.z)), `${th.id}/${seed} start walkable`);
    // бот: идёт к ближайшему врагу, бьёт и колдует; бессмертен для проверки устойчивости
    let steps = 0;
    for (; steps < 20 * 90 && !sim.finished; steps++) {
      let best: any = null, bd = 1e9;
      for (const e of sim.enemies.values()) if (e.state !== "dead" && e.team === "enemy") { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
      if (best) {
        const yaw = Math.atan2(-(best.x - p.x), -(best.z - p.z));
        // teleport-ish approach through valid poses
        const l = bd || 1, s = Math.min(bd - 1.5, p.stats.moveSpeed * 0.05);
        let nx = p.x, nz = p.z;
        if (s > 0) { nx += ((best.x - p.x) / l) * s; nz += ((best.z - p.z) / l) * s; }
        sim.setPose("a", { x: nx, y: 0, z: nz, yaw, pitch: 0, sprint: false, moving: true });
        if (bd > 2.2) { // jump closer via legal cells for test speed
          p.x = best.x + 1.6; p.z = best.z; if (!walkable(sim.d, worldToCell(p.x), worldToCell(p.z))) { p.x = best.x; p.z = best.z + 1.6; }
          if (!walkable(sim.d, worldToCell(p.x), worldToCell(p.z))) { p.x = best.x - 1.6; p.z = best.z; }
          p.yaw = Math.atan2(-(best.x - p.x), -(best.z - p.z));
        }
        sim.action("a", { t: "attack" });
        if (steps % 15 === 0) sim.action("a", { t: "skill", slot: (steps / 15) % 3, aim: { x: best.x, y: 0, z: best.z } });
      }
      if (p.hp < p.stats.maxHp * 0.5) p.hp = p.stats.maxHp; // бессмертие бота
      p.mana = p.stats.maxMana;
      sim.step();
      const snap = sim.snapshot();
      for (const e of snap.enemies) ok(Number.isFinite(e.x) && Number.isFinite(e.z) && Number.isFinite(e.hp), `${th.id} enemy finite`);
      sim.drainEvents();
    }
    const alive = [...sim.enemies.values()].filter((e) => e.state !== "dead" && e.team === "enemy").length;
    if (cls === "warrior") console.log(`${th.id} seed ${seed}: rooms ${sim.d.rooms.length} spawns ${sim.d.spawns.length} left ${alive} boss ${sim.bossDead} drops ${sim.drops.size} xp ${p.xp} lvl ${p.level}`);
    sim.phys.world.free();
  }
}
// Новые формы: всё важное достижимо от старта
for (const th of STAGES) for (let seed = 1; seed <= 8; seed++) {
  const d = generateDungeon(th.id, seed * 7919, th.level);
  const reach = new Uint8Array(d.w * d.h);
  const q = [worldToCell(d.start.z) * d.w + worldToCell(d.start.x)];
  reach[q[0]] = 1;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % d.w, y = (c / d.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * d.w + nx;
      if (!reach[j] && walkable(d, nx, ny)) { reach[j] = 1; q.push(j); }
    }
  }
  const at = (x: number, z: number) => reach[worldToCell(z) * d.w + worldToCell(x)] === 1;
  for (const e of d.spawns) ok(at(e.x, e.z), `${th.id}/${seed} spawn ${e.type} reachable`);
  for (const c of d.chests) if (!d.rooms.some((r) => r.kind === "secret" && worldToCell(c.x) >= r.x && worldToCell(c.x) < r.x + r.w && worldToCell(c.z) >= r.y && worldToCell(c.z) < r.y + r.h)) ok(at(c.x, c.z), `${th.id}/${seed} chest reachable`);
  for (const b of d.breakables) ok(walkable(d, worldToCell(b.x), worldToCell(b.z)), `${th.id}/${seed} breakable on floor`);
  for (const n of d.notes) ok(walkable(d, worldToCell(n.x), worldToCell(n.z)), `${th.id}/${seed} note on floor`);
  ok(at(d.exit.x, d.exit.z), `${th.id}/${seed} exit reachable`);
  for (const p of d.props) if (p.solid) ok(walkable(d, worldToCell(p.x), worldToCell(p.z)), `${th.id}/${seed} prop ${p.kind} on floor`);
  if (seed === 1) console.log(th.id, "rooms:", d.rooms.map((r) => r.kind).join(","));
}

// Сценарий: сундук, тайник, босс, выход.
for (const th of STAGES) {
  const sim = new Sim(RAPIER, { dungeon: th.id, seed: 4242, level: th.level, players: [{ id: "a", name: "A", char: makeChar("knight", th.level) }] });
  const p = sim.players.get("a")!;
  const c = sim.d.chests.find((x) => !x.mimic);
  if (c) { p.x = c.x + 1.2; p.z = c.z; sim.action("a", { t: "interact" }); ok(sim.opened.chests.has(c.id), "chest opens"); ok(sim.drops.size > 0, "chest drops loot"); }
  const sec = sim.d.secrets[0];
  if (sec) {
    const sx = (sec.cx + 0.5) * 3, sz = (sec.cy + 0.5) * 3;
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (walkable(sim.d, worldToCell(sx + dx), worldToCell(sz + dz))) { p.x = sx + dx; p.z = sz + dz; break; }
    sim.action("a", { t: "interact" });
    ok(sim.opened.secrets.has(sec.id), "secret opens");
    ok(walkable(sim.d, sec.cx, sec.cy, sim.opened.secrets), "secret walkable after open");
  }
  // урны
  const pot = sim.d.breakables[0];
  ok(sim.d.breakables.length > 5, `${th.id} breakables placed`);
  ok(sim.d.notes.length >= 1, `${th.id} notes placed`);
  if (pot) {
    const before = sim.drops.size;
    p.x = pot.x + 1.2; p.z = pot.z; p.yaw = Math.atan2(-(pot.x - p.x), -(pot.z - p.z)); p.nextAttackAt = 0;
    sim.action("a", { t: "attack" });
    for (let i = 0; i < 20; i++) sim.step();
    ok(sim.opened.broken.has(pot.id), `${th.id} pot breaks`);
    void before;
  }
  // подбор предмета
  const dr = [...sim.drops.values()].find((d) => d.item);
  if (dr) { p.x = dr.x; p.z = dr.z; sim.action("a", { t: "interact" }); ok(p.loot.length === 1, "item picked"); }
  const boss = [...sim.enemies.values()].find((e) => e.boss)!;
  p.stats.dmg = [400, 500];
  let t = 0;
  for (; t < 20 * 60 && boss.state !== "dead"; t++) {
    const yaw = Math.atan2(-(boss.x - p.x), -(boss.z - p.z));
    p.x = boss.x + Math.sin(yaw) * (boss.def.radius + 1.3); p.z = boss.z + Math.cos(yaw) * (boss.def.radius + 1.3); p.yaw = yaw;
    p.hp = p.stats.maxHp;
    sim.action("a", { t: "attack" });
    sim.step();
  }
  const ev = sim.drainEvents();
  ok(boss.state === "dead", `${th.id} boss dies`);
  if (!th.champion) ok(ev.some((e) => e.t === "boss_phase"), `${th.id} boss phase 2`);
  if (th.boss === "the_hollow") ok(ev.some((e) => e.t === "boss_phase" && e.phase === 3), "final boss phase 3");
  ok(sim.bossDead, "bossDead");
  p.x = sim.d.exit.x; p.z = sim.d.exit.z;
  sim.action("a", { t: "interact" });
  ok(!!sim.finished && sim.finished.success && sim.finished.how === "exit", `${th.id} exit finishes`);
  if (th.champion) ok(boss.champion === th.champion.name, `${th.id} champion named`);
  console.log(`${th.id}: boss killed in ${(t / 20).toFixed(1)}s, events ${[...new Set(ev.map((e) => e.t))].join(",")}`);
}
// Окружение и новые враги
{
  const mk = (stage: string, seed = 11) => {
    const sim = new Sim(RAPIER, { dungeon: stage, seed, level: 10, players: [{ id: "a", name: "A", char: makeChar("warrior", 10) }] });
    return { sim, p: sim.players.get("a")! };
  };
  const clearAll = (sim: Sim) => { for (const e of sim.enemies.values()) if (!e.boss) sim.killEnemy(e, null); };
  // масляная бочка: взрыв через задержку ранит врага рядом
  let found = false;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const { sim, p } = mk("a3s1", seed);
    const oil = sim.d.breakables.find((b) => b.kind === "oil");
    if (!oil) continue;
    found = true;
    p.x = sim.d.start.x; p.z = sim.d.start.z;
    const e = sim.spawnEnemy("dummy", "zombie", oil.x + 1, oil.z, 10);
    const hp0 = e.hp;
    sim.breakObject(oil.id, p);
    ok(sim.fuses.length === 1, "oil fuse lit");
    for (let i = 0; i < 12; i++) sim.step();
    ok(e.hp < hp0, "oil explosion hurts enemy");
    ok(sim.grounds.some((g) => g.kind === "fire_pool"), "fire pool left");
  }
  ok(found, "oil barrels generated");
  // люстра
  found = false;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const { sim, p } = mk("a2s1", seed);
    const c = sim.d.chandeliers[0];
    if (!c) continue;
    found = true;
    const e = sim.spawnEnemy("under", "skeleton", c.x, c.z, 10);
    const hp0 = e.hp;
    p.x = c.ax; p.z = c.az;
    sim.action("a", { t: "interact" });
    ok(sim.opened.chandeliers.has(c.id), "chandelier cut");
    for (let i = 0; i < 20; i++) sim.step();
    ok(e.hp < hp0 || e.state === "dead", "chandelier crushes enemy");
  }
  ok(found, "chandeliers generated");
  // рычаг
  found = false;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const { sim, p } = mk("a1s2", seed);
    const lv = sim.d.levers[0];
    if (!lv) continue;
    found = true;
    clearAll(sim);
    const v = lv.vents[0];
    const e = sim.spawnEnemy("venty", "zombie", v.x, v.z, 10);
    e.stunUntil = 999;
    const hp0 = e.hp;
    p.x = lv.x; p.z = lv.z;
    sim.action("a", { t: "interact" });
    for (let i = 0; i < 40; i++) sim.step();
    ok(e.hp < hp0, "lever vent burns enemy");
    ok(sim.snapshot().levers[lv.id] > 0, "lever on cooldown");
  }
  ok(found, "levers generated");
  // мимик
  found = false;
  for (let seed = 1; seed < 60 && !found; seed++) {
    const { sim, p } = mk("a1s1", seed);
    const c = sim.d.chests.find((x) => x.mimic);
    if (!c) continue;
    found = true;
    p.x = c.x + 1.2; p.z = c.z;
    sim.action("a", { t: "interact" });
    const m = [...sim.enemies.values()].find((e) => e.type === "mimic");
    ok(!!m && m.awake, "mimic wakes");
    sim.killEnemy(m!, p);
    ok(sim.drops.size > 0, "mimic drops loot");
  }
  ok(found, "mimic chests generated");
  // некромант поднимает мёртвых, слуги рассыпаются с его смертью
  {
    const { sim, p } = mk("a3s1");
    clearAll(sim);
    p.x = sim.d.start.x; p.z = sim.d.start.z;
    const n = sim.spawnEnemy("necro", "necromancer", p.x + 6, p.z, 10);
    const z = sim.spawnEnemy("corpse1", "skeleton", p.x + 5, p.z + 1, 10);
    sim.killEnemy(z, null);
    n.awake = true; n.target = "a";
    let raised = false;
    for (let i = 0; i < 20 * 8 && !raised; i++) { p.hp = p.stats.maxHp; sim.step(); raised = [...sim.enemies.values()].some((e) => e.summoner === "necro" && e.state !== "dead"); }
    ok(raised, "necromancer raises corpse");
    sim.killEnemy(n, p);
    ok(![...sim.enemies.values()].some((e) => e.summoner === "necro" && e.state !== "dead"), "raised crumble on necro death");
  }
  // фантом неуязвим, пока не атакует
  {
    const { sim, p } = mk("a5s1");
    clearAll(sim);
    p.x = sim.d.start.x; p.z = sim.d.start.z;
    const ph = sim.spawnEnemy("ph", "phantom", p.x + 8, p.z, 10);
    ph.awake = true; ph.target = "a";
    sim.step();
    const hp0 = ph.hp;
    sim.damageEnemy(ph, 20, "physical", p, {});
    ok(ph.hp === hp0, "phantom phased immune");
    let hit = false;
    for (let i = 0; i < 20 * 10 && !hit; i++) { p.hp = p.stats.maxHp; sim.step(); if (ph.state === "windup") { sim.damageEnemy(ph, 20, "physical", p, {}); hit = ph.hp < hp0; } }
    ok(hit, "phantom vulnerable while attacking");
  }
  // лучник показывает линию прицела
  {
    const { sim, p } = mk("a3s2");
    clearAll(sim);
    p.x = sim.d.start.x; p.z = sim.d.start.z;
    let aimed = false;
    const spots: [number, number][] = [];
    for (let cy = 0; cy < sim.d.h; cy++) for (let cx = 0; cx < sim.d.w; cx++) {
      const x = (cx + 0.5) * 3, z = (cy + 0.5) * 3, d = Math.hypot(x - p.x, z - p.z);
      if (d > 5.5 && d < 12 && walkable(sim.d, cx, cy) && lineOfSight(RAPIER, sim.phys, x, 1.4, z, p.x, 1.2, p.z)) spots.push([x, z]);
    }
    ok(spots.length > 0, "archer spot found");
    if (spots.length) {
      const a = sim.spawnEnemy("arch", "skeleton_archer", spots[0][0], spots[0][1], 10);
      a.awake = true; a.target = "a";
      for (let i = 0; i < 20 * 6 && !aimed; i++) { p.hp = p.stats.maxHp; sim.step(); aimed = sim.grounds.some((g) => g.kind === "aim"); }
    }
    ok(aimed, "archer telegraphs aim");
  }
  // вход без босса — не зачёт
  {
    const { sim, p } = mk("a1s1");
    p.x = sim.d.entrance.x; p.z = sim.d.entrance.z;
    sim.action("a", { t: "interact" });
    ok(!!sim.finished && sim.finished.how === "entrance" && !sim.bossDead, "entrance leaves without clear");
  }
}
// Все навыки всех классов: каждый срабатывает и не ломает симуляцию
{
  const { skillsOf } = await import("../data/skills");
  for (const cls of CLASS_IDS) {
    const ch = makeChar(cls, 30);
    for (const s of skillsOf(cls)) ch.skills[s.id] = 5;
    const sim = new Sim(RAPIER, { dungeon: "a2s1", seed: 77, level: 10, players: [{ id: "a", name: "A", char: ch }] });
    const p = sim.players.get("a")!;
    for (const e of sim.enemies.values()) if (!e.boss) sim.killEnemy(e, null);
    p.x = sim.d.start.x; p.z = sim.d.start.z;
    let casts = 0;
    for (const s of skillsOf(cls).filter((x) => x.kind === "active")) {
      // свежие враги вокруг и труп для взрыва
      for (const e of [...sim.enemies.values()]) if (!e.boss) sim.enemies.delete(e.id);
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const corpse = sim.spawnEnemy("c_" + s.id, "zombie", p.x + fx * 2.5, p.z + fz * 2.5, 10);
      sim.killEnemy(corpse, null);
      const foes = [1.8, 2.6, 3.4].map((d, i) => sim.spawnEnemy(`f_${s.id}_${i}`, "zombie", p.x + fx * d + (i - 1) * 0.8, p.z + fz * d, 10));
      for (const f of foes) { f.awake = true; f.stunUntil = sim.t + 30; }
      const hp0 = foes.reduce((a, f) => a + f.hp, 0);
      p.char.hotbar = [s.id, null, null, null, null, null];
      p.mana = p.stats.maxMana; p.stamina = p.stats.maxStamina; p.hp = p.stats.maxHp; p.cooldowns = {};
      const ev0 = sim.events.length;
      sim.action("a", { t: "skill", slot: 0, aim: { x: p.x + fx * 3, y: 0, z: p.z + fz * 3 } });
      const cast = sim.events.slice(ev0).some((e) => e.t === "cast");
      ok(cast, `${cls}/${s.id} casts`);
      if (cast) casts++;
      for (let i = 0; i < 60; i++) sim.step();
      const hp1 = foes.reduce((a, f) => a + Math.max(0, f.hp), 0);
      const ef = s.effect(5) as { type: string; auraDps?: number; dmg?: number };
      const offensive = (!["buff", "heal", "shield", "taunt", "sanctuary", "curse", "blind", "summon", "blink", "warcry"].includes(ef.type)) || ef.auraDps || (ef.type === "warcry" && ef.dmg);
      if (offensive) ok(hp1 < hp0, `${cls}/${s.id} hurts enemies`);
      for (const e of sim.enemies.values()) ok(Number.isFinite(e.hp) && Number.isFinite(e.x), `${cls}/${s.id} finite`);
      ok(Number.isFinite(p.hp) && Number.isFinite(p.x) && p.alive, `${cls}/${s.id} player ok`);
      p.x = sim.d.start.x; p.z = sim.d.start.z; p.yaw = 0;
      sim.drainEvents();
    }
    console.log(`${cls}: ${casts} active skills cast`);
  }
}
// Смерть игрока → провал
{
  const sim = new Sim(RAPIER, { dungeon: "a1s1", seed: 5, level: 1, players: [{ id: "a", name: "A", char: makeChar("mage") }] });
  const p = sim.players.get("a")!;
  sim.damagePlayer(p, 99999, "physical", null, { aoe: true });
  ok(!!sim.finished && !sim.finished.success, "death wipes");
}
console.log(fails ? `${fails} failures` : "sim ok");
process.exit(fails ? 1 : 0);
