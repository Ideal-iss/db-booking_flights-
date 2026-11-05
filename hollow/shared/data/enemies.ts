/** Враги и боссы. Поведение задаётся типом ИИ (см. sim/ai.ts). */
import type { Element } from "./skills";

export type Behavior = "melee" | "defensive" | "ranged" | "aggressive" | "brute" | "boss" | "summon" | "archer" | "mimic" | "necro" | "phantom";

export interface EnemyDef {
  id: string;
  name: string;
  behavior: Behavior;
  hp: number;
  dmg: number;
  element: Element;
  armor: number;
  speed: number;
  range: number;
  windup: number;
  cooldown: number;
  radius: number;
  height: number;
  xp: number;
  undead: boolean;
  /** Устойчивость к отбрасыванию 0..1 */
  poise: number;
  aggro: number;
  /** Для дальнего боя: скорость снаряда, желаемая дистанция. */
  projectile?: { speed: number; size: number; element: Element };
  keepDistance?: number;
  boss?: boolean;
  loot: "normal" | "boss";
}

export const ENEMIES: Record<string, EnemyDef> = {
  skeleton: {
    id: "skeleton", name: "Скелет", behavior: "melee", hp: 34, dmg: 7, element: "physical", armor: 4, speed: 3.3,
    range: 1.9, windup: 0.5, cooldown: 1.3, radius: 0.4, height: 1.8, xp: 12, undead: true, poise: 0, aggro: 15, loot: "normal",
  },
  zombie: {
    id: "zombie", name: "Мертвец", behavior: "melee", hp: 70, dmg: 11, element: "physical", armor: 2, speed: 1.7,
    range: 1.8, windup: 0.85, cooldown: 1.8, radius: 0.45, height: 1.75, xp: 16, undead: true, poise: 0.6, aggro: 11, loot: "normal",
  },
  undead_knight: {
    id: "undead_knight", name: "Рыцарь-мертвец", behavior: "defensive", hp: 110, dmg: 15, element: "physical", armor: 20, speed: 2.7,
    range: 2.1, windup: 0.65, cooldown: 1.6, radius: 0.5, height: 1.95, xp: 32, undead: true, poise: 0.5, aggro: 15, loot: "normal",
  },
  cultist: {
    id: "cultist", name: "Культист", behavior: "ranged", hp: 40, dmg: 10, element: "dark", armor: 2, speed: 3,
    range: 13, windup: 0.75, cooldown: 2.2, radius: 0.4, height: 1.8, xp: 20, undead: false, poise: 0, aggro: 17,
    projectile: { speed: 10, size: 0.25, element: "dark" }, keepDistance: 8, loot: "normal",
  },
  wraith: {
    id: "wraith", name: "Призрак", behavior: "aggressive", hp: 44, dmg: 9, element: "dark", armor: 0, speed: 5.2,
    range: 1.8, windup: 0.4, cooldown: 1.4, radius: 0.4, height: 1.9, xp: 24, undead: true, poise: 0.2, aggro: 18, loot: "normal",
  },
  abomination: {
    id: "abomination", name: "Мерзость", behavior: "brute", hp: 280, dmg: 26, element: "physical", armor: 10, speed: 2,
    range: 3.2, windup: 1.05, cooldown: 2.6, radius: 1.0, height: 2.9, xp: 85, undead: false, poise: 0.9, aggro: 14, loot: "normal",
  },
  summoned_skeleton: {
    id: "summoned_skeleton", name: "Скелет-слуга", behavior: "summon", hp: 60, dmg: 8, element: "physical", armor: 6, speed: 4.2,
    range: 1.9, windup: 0.35, cooldown: 1.1, radius: 0.4, height: 1.8, xp: 0, undead: true, poise: 0.2, aggro: 16, loot: "normal",
  },
  summoned_mage: {
    id: "summoned_mage", name: "Скелет-маг", behavior: "ranged", hp: 40, dmg: 9, element: "dark", armor: 2, speed: 3.6,
    range: 14, windup: 0.5, cooldown: 1.6, radius: 0.4, height: 1.8, xp: 0, undead: true, poise: 0.1, aggro: 16,
    projectile: { speed: 18, size: 0.2, element: "dark" }, keepDistance: 7, loot: "normal",
  },
  clay_golem: {
    id: "clay_golem", name: "Глиняный голем", behavior: "summon", hp: 220, dmg: 14, element: "physical", armor: 20, speed: 3.0,
    range: 2.3, windup: 0.55, cooldown: 1.5, radius: 0.65, height: 2.3, xp: 0, undead: false, poise: 0.8, aggro: 16, loot: "normal",
  },
  blood_golem: {
    id: "blood_golem", name: "Кровавый голем", behavior: "summon", hp: 260, dmg: 20, element: "physical", armor: 12, speed: 3.6,
    range: 2.3, windup: 0.45, cooldown: 1.2, radius: 0.65, height: 2.3, xp: 0, undead: false, poise: 0.8, aggro: 16, loot: "normal",
  },
  shadow_clone: {
    id: "shadow_clone", name: "Теневой двойник", behavior: "aggressive", hp: 90, dmg: 14, element: "dark", armor: 4, speed: 5.4,
    range: 1.9, windup: 0.3, cooldown: 0.9, radius: 0.4, height: 1.8, xp: 0, undead: false, poise: 0.3, aggro: 16, loot: "normal",
  },
  guardian_spirit: {
    id: "guardian_spirit", name: "Дух-хранитель", behavior: "ranged", hp: 120, dmg: 12, element: "holy", armor: 6, speed: 4.4,
    range: 13, windup: 0.4, cooldown: 1.2, radius: 0.4, height: 1.8, xp: 0, undead: false, poise: 0.5, aggro: 16,
    projectile: { speed: 22, size: 0.25, element: "holy" }, keepDistance: 5, loot: "normal",
  },
  skeleton_archer: {
    id: "skeleton_archer", name: "Скелет-лучник", behavior: "archer", hp: 28, dmg: 9, element: "physical", armor: 2, speed: 3.1,
    range: 16, windup: 0.95, cooldown: 2.2, radius: 0.4, height: 1.8, xp: 16, undead: true, poise: 0, aggro: 20,
    projectile: { speed: 24, size: 0.12, element: "physical" }, keepDistance: 10, loot: "normal",
  },
  mimic: {
    id: "mimic", name: "Мимик", behavior: "mimic", hp: 120, dmg: 18, element: "physical", armor: 8, speed: 4.6,
    range: 1.9, windup: 0.35, cooldown: 1.0, radius: 0.6, height: 1.0, xp: 60, undead: false, poise: 0.6, aggro: 20, loot: "normal",
  },
  necromancer: {
    id: "necromancer", name: "Некромант", behavior: "necro", hp: 46, dmg: 11, element: "dark", armor: 2, speed: 3.0,
    range: 13, windup: 0.8, cooldown: 2.4, radius: 0.4, height: 1.85, xp: 34, undead: false, poise: 0, aggro: 18,
    projectile: { speed: 11, size: 0.25, element: "dark" }, keepDistance: 9, loot: "normal",
  },
  phantom: {
    id: "phantom", name: "Фантом", behavior: "phantom", hp: 54, dmg: 13, element: "dark", armor: 0, speed: 3.6,
    range: 1.9, windup: 0.55, cooldown: 1.6, radius: 0.4, height: 1.9, xp: 30, undead: true, poise: 0.3, aggro: 22, loot: "normal",
  },
  // ---- боссы ----
  bone_priest: {
    id: "bone_priest", name: "Костяной Жрец", behavior: "boss", hp: 950, dmg: 16, element: "dark", armor: 10, speed: 2.4,
    range: 2.6, windup: 0.7, cooldown: 1.6, radius: 0.8, height: 3.0, xp: 400, undead: true, poise: 1, aggro: 30, boss: true,
    projectile: { speed: 13, size: 0.35, element: "dark" }, loot: "boss",
  },
  hollow_knight: {
    id: "hollow_knight", name: "Полый Рыцарь", behavior: "boss", hp: 1300, dmg: 24, element: "physical", armor: 30, speed: 3.4,
    range: 3.0, windup: 0.6, cooldown: 1.4, radius: 0.9, height: 3.2, xp: 650, undead: true, poise: 1, aggro: 30, boss: true, loot: "boss",
  },
  forgotten_saint: {
    id: "forgotten_saint", name: "Забытая Святая", behavior: "boss", hp: 1150, dmg: 20, element: "holy", armor: 8, speed: 2.8,
    range: 2.6, windup: 0.8, cooldown: 1.6, radius: 0.8, height: 3.2, xp: 800, undead: true, poise: 1, aggro: 30, boss: true,
    projectile: { speed: 14, size: 0.4, element: "holy" }, loot: "boss",
  },
  blood_abomination: {
    id: "blood_abomination", name: "Кровавая Мерзость", behavior: "boss", hp: 1700, dmg: 32, element: "physical", armor: 16, speed: 2.4,
    range: 3.6, windup: 0.95, cooldown: 1.8, radius: 1.4, height: 3.6, xp: 1000, undead: false, poise: 1, aggro: 30, boss: true, loot: "boss",
  },
  the_hollow: {
    id: "the_hollow", name: "Полое Сердце", behavior: "boss", hp: 2600, dmg: 30, element: "dark", armor: 14, speed: 2.8,
    range: 3.2, windup: 0.8, cooldown: 1.5, radius: 1.2, height: 4.0, xp: 2000, undead: true, poise: 1, aggro: 40, boss: true,
    projectile: { speed: 13, size: 0.4, element: "dark" }, loot: "boss",
  },
};

export const ELITE_MODS: Record<string, { name: string; hp: number; dmg: number; speed: number }> = {
  furious: { name: "Яростный", hp: 1.8, dmg: 1.3, speed: 1.35 },
  stone: { name: "Каменный", hp: 3.0, dmg: 1.1, speed: 0.9 },
  cursed: { name: "Проклятый", hp: 2.2, dmg: 1.5, speed: 1.05 },
};

export function scaleEnemy(def: EnemyDef, level: number, players: number, elite?: string, champion = false) {
  const em = elite ? ELITE_MODS[elite] : null;
  const lv = Math.max(0, level - 1);
  const ch = champion ? { hp: 3.2, dmg: 1.25, xp: 4 } : { hp: 1, dmg: 1, xp: 1 };
  return {
    maxHp: Math.round(def.hp * (1 + 0.24 * lv) * (1 + 0.65 * (players - 1)) * (em ? em.hp : 1) * ch.hp),
    dmg: def.dmg * (1 + 0.15 * lv) * (em ? em.dmg : 1) * ch.dmg,
    speed: def.speed * (em ? em.speed : 1),
    armor: def.armor * (1 + 0.1 * lv),
    xp: Math.round(def.xp * 1.8 * (1 + 0.18 * lv) * (em ? 3 : 1) * ch.xp),
  };
}
