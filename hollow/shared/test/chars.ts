import { CLASS_IDS, CLASSES } from "../data/classes";
import { starterItem, BASE_BY_ID } from "../data/items";
import { skillsOf } from "../data/skills";
import type { CharacterData } from "../data/stats";

export function makeChar(cls: (typeof CLASS_IDS)[number], level = 1): CharacterData {
  const def = CLASSES[cls];
  const equipment: CharacterData["equipment"] = {};
  for (const b of def.startItems) { const it = starterItem(b, b); const sl = BASE_BY_ID[b].slot; (equipment as any)[sl === "ring" ? "ring1" : sl] = it; }
  const skills: Record<string, number> = {};
  const act = skillsOf(cls).filter((s) => s.kind === "active");
  for (const s of act) skills[s.id] = 3;
  return {
    id: 1, name: "t", cls, appearance: { skin: 0, hair: "short", hairColor: 0, cloth: 0, trim: 0, accessory: "none" },
    level, xp: 0, attrs: { ...def.attrs }, attrPoints: 0, skillPoints: 0, skills, hotbar: [...act.slice(0, 6).map((s) => s.id), null, null, null, null, null, null].slice(0, 6),
    equipment, inventory: [], stash: [], gold: 0, potions: { health: 3, mana: 3 }, quests: [], cleared: [],
  };
}

