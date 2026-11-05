import RAPIER from "@dimforge/rapier3d-compat";
import { Sim } from "../sim/sim";
import { CLASS_IDS, CLASSES } from "../data/classes";
import { starterItem, slotOf, BASE_BY_ID } from "../data/items";
import { skillsOf } from "../data/skills";
import { DUNGEONS } from "../data/dungeons";
import { makeChar } from "./chars";
import { generateDungeon, walkable, worldToCell } from "../dungeon/generate";

await RAPIER.init();
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };

for (const th of DUNGEONS) for (let seed = 1; seed <= 6; seed++) {
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
for (const th of DUNGEONS) for (let seed = 1; seed <= 25; seed++) {
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
for (const th of DUNGEONS) {
  const sim = new Sim(RAPIER, { dungeon: th.id, seed: 4242, level: th.level, players: [{ id: "a", name: "A", char: makeChar("knight", th.level) }] });
  const p = sim.players.get("a")!;
  const c = sim.d.chests[0];
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
  ok(ev.some((e) => e.t === "boss_phase"), `${th.id} boss phase 2`);
  ok(sim.bossDead, "bossDead");
  p.x = sim.d.exit.x; p.z = sim.d.exit.z;
  sim.action("a", { t: "interact" });
  ok(!!sim.finished && sim.finished.success, `${th.id} exit finishes`);
  console.log(`${th.id}: boss killed in ${(t / 20).toFixed(1)}s, events ${[...new Set(ev.map((e) => e.t))].join(",")}`);
}
// Смерть игрока → провал
{
  const sim = new Sim(RAPIER, { dungeon: "crypt", seed: 5, level: 1, players: [{ id: "a", name: "A", char: makeChar("mage") }] });
  const p = sim.players.get("a")!;
  sim.damagePlayer(p, 99999, "physical", null, { aoe: true });
  ok(!!sim.finished && !sim.finished.success, "death wipes");
}
console.log(fails ? `${fails} failures` : "sim ok");
process.exit(fails ? 1 : 0);
