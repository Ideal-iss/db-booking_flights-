/** Выгружает игровые таблицы в JSON для проверки на сервере Django. */
import { writeFileSync } from "node:fs";
import { AFFIXES, BASES, POTIONS, RARE_NAMES, RARITIES, UNIQUES } from "../shared/data/items";
import { CLASSES } from "../shared/data/classes";
import { SKILLS } from "../shared/data/skills";
import { ATTR_POINTS_PER_LEVEL, MAX_LEVEL, SKILL_POINTS_PER_LEVEL, xpForLevel } from "../shared/data/stats";
import { DUNGEONS, QUESTS } from "../shared/data/dungeons";

const data = {
  bases: Object.fromEntries(BASES.map((b) => [b.id, { name: b.name, slot: b.slot, type: b.type || null, req: b.req, value: b.value }])),
  rarities: RARITIES,
  affixes: Object.fromEntries(AFFIXES.map((a) => [a.id, { slots: a.slots, base: a.base, perLevel: a.perLevel, int: !!a.int, curse: !!a.curse, suffix: a.suffix, weight: a.weight }])),
  uniques: Object.fromEntries(UNIQUES.map((u) => [u.id, { name: u.name, base: u.base, fixed: u.fixed }])),
  rareNames: RARE_NAMES,
  classes: Object.fromEntries(Object.values(CLASSES).map((c) => [c.id, { name: c.name, attrs: c.attrs, weaponTypes: c.weaponTypes, offhandTypes: c.offhandTypes, startItems: c.startItems }])),
  skills: Object.fromEntries(SKILLS.map((s) => [s.id, { cls: s.cls, kind: s.kind, maxRank: s.maxRank, reqLevel: s.reqLevel, requires: s.requires || [], name: s.name }])),
  xpTable: Array.from({ length: MAX_LEVEL + 1 }, (_, l) => (l === 0 ? 0 : xpForLevel(l))),
  maxLevel: MAX_LEVEL,
  attrPerLevel: ATTR_POINTS_PER_LEVEL,
  skillPerLevel: SKILL_POINTS_PER_LEVEL,
  potions: POTIONS,
  dungeons: Object.fromEntries(DUNGEONS.map((d) => [d.id, { name: d.name, level: d.level, unlock: d.unlock || null, boss: d.boss }])),
  quests: Object.fromEntries(QUESTS.map((q) => [q.id, { kind: q.kind, target: q.target, count: q.count, reward: q.reward, minLevel: q.minLevel, name: q.name }])),
};
writeFileSync(new URL("../../web/hollow/gamedata.json", import.meta.url), JSON.stringify(data, null, 1));
console.log("gamedata.json written");
