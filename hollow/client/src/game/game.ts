/** Главный цикл: лагерь и подземелье, управление, обратная связь боя, данные для интерфейса. */
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Engine, disposeTree } from "./engine";
import { LevelView } from "./level";
import { LightPool, probeAt } from "./lighting";
import { lineOfSight } from "@shared/physics";
import { AmbientFx } from "./dressing";
import { NOTES } from "@shared/data/lore";
import { FpsController, EYE } from "./controller";
import { Input } from "./input";
import { ViewModel } from "./viewmodel";
import { Fx, skillLook } from "./fx";
import { Entities, ELEMENT_COLOR } from "./entities";
import { audio } from "./audio";
import { buildHub, type Npc } from "./hub";
import { HubLife } from "./hubLife";
import { LocalSession, type Session } from "./session";
import { deriveStats, levelFromXp, type CharacterData, type Derived } from "@shared/data/stats";
import { BASE_BY_ID, RARITIES, type Item } from "@shared/data/items";
import { ENEMIES, ELITE_MODS } from "@shared/data/enemies";
import { SKILL_BY_ID, type SkillDef } from "@shared/data/skills";
import { CELL, walkable, worldToCell, type Dungeon } from "@shared/dungeon/generate";
import { CLASSES } from "@shared/data/classes";
import { SHRINE_NAMES } from "@shared/sim/sim";
import type { SimEvent, Snapshot } from "@shared/sim/types";
import type { Hud, Settings } from "../store";
import type { Action } from "@shared/sim/sim";

let rapierReady: Promise<void> | null = null;
export function initRapier() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export interface GameCallbacks {
  hud: (h: Hud) => void;
  say: (text: string, color?: string) => void;
  openPanel: (p: string) => void;
  readNote: (title: string, text: string) => void;
  pickup: (item: Item) => Promise<boolean>;
  bagFull: () => boolean;
  runEnded: (success: boolean) => void;
  pauseToggle: () => void;
  togglePanel: (p: string) => void;
}

export class Game {
  engine: Engine;
  input: Input;
  cb: GameCallbacks;
  char: CharacterData & { name: string };
  stats: Derived;
  mode: "hub" | "dungeon" = "hub";
  level: LevelView | null = null;
  ctl: FpsController | null = null;
  view: ViewModel;
  ents: Entities | null = null;
  pool: LightPool;
  lantern: THREE.PointLight;
  ambient: AmbientFx | null = null;
  readNotes = new Set<string>();
  session: Session | null = null;
  npcs: Npc[] = [];
  dungeonName = "";
  uiOpen = false;
  private raf = 0;
  private last = 0;
  private t0 = performance.now() / 1000;
  private poseAcc = 0;
  private hudAcc = 0;
  private lmbAt = -1;
  private rmbHeld = false;
  private shake = 0;
  /** Эффекты навыков в мире. */
  private fx: Fx;
  /** Временный прирост угла обзора: рывок, удар. */
  private fovKick = 0;
  /** Камера догоняет героя после рывка/прыжка, а не перескакивает. */
  private camMove: { dx: number; dz: number; t: number; dur: number; arc: number } | null = null;
  private whirlFxAt = 0;
  private whirlSide = false;
  private blinkPending = false;
  /** Жизнь лагеря: жители, костёр, снег. */
  private hubLife: HubLife | null = null;
  private self: Snapshot["players"][number] | null = null;
  private bossId: string | null = null;
  private stepAcc = 0;
  private lastSecretHint = 0;
  private disposed = false;
  private interactTarget: { label: string; act: () => void } | null = null;

  constructor(host: HTMLElement, char: CharacterData & { name: string }, settings: Settings, cb: GameCallbacks) {
    this.engine = new Engine(host, settings);
    this.input = new Input(this.engine.canvas);
    this.cb = cb;
    this.char = char;
    this.stats = deriveStats(char);
    this.view = new ViewModel(this.engine.viewScene, char.appearance, char.cls);
    this.fx = new Fx(this.engine.scene);
    this.pool = new LightPool(this.engine.scene, 4);
    this.engine.scene.add(new THREE.AmbientLight(0xffffff, 0.08));
    // фонарь героя: тёплый свет вокруг, чтобы коридоры не тонули в черноте
    this.lantern = new THREE.PointLight(0xffd8b0, 2.4, 10, 2);
    this.engine.scene.add(this.lantern);
    this.engine.canvas.addEventListener("click", () => {
      if (!this.uiOpen && !this.extPause) this.input.lock();
      audio.ensure();
    });
    audio.setVolume(settings.volume, settings.music);
    this.refreshGear();
    this.enterHub();
    this.last = performance.now() / 1000;
    this.loop();
  }

  get now() {
    return performance.now() / 1000 - this.t0;
  }

  applySettings(s: Settings) {
    this.engine.applySettings(s);
    audio.setVolume(s.volume, s.music);
  }

  setUiOpen(open: boolean) {
    this.uiOpen = open;
    this.input.enabled = !open;
    // нажатие, которое открыло/закрыло окно, не должно ещё раз сработать в игре
    this.input.pressed = [];
    if (open) this.input.unlock();
    if (this.session && !this.session.coop) this.session.paused = open || this.extPause;
  }

  /** Пауза снаружи (реклама, пауза платформы): мир замирает, ввод не идёт. */
  extPause = false;
  setExternalPause(on: boolean) {
    this.extPause = on;
    if (on) this.input.unlock();
    if (this.session && !this.session.coop) this.session.paused = on || this.uiOpen;
  }

  /** Вызывается после изменений персонажа на сервере (экипировка, атрибуты). */
  setCharacter(char: CharacterData & { name: string }) {
    this.char = char;
    this.stats = deriveStats(char);
    this.refreshGear();
    this.session?.updateCharacter(char);
  }

  private refreshGear() {
    const w = this.char.equipment.weapon ? BASE_BY_ID[this.char.equipment.weapon.base].icon : "fist";
    const o = this.char.equipment.offhand ? BASE_BY_ID[this.char.equipment.offhand.base].icon : "";
    this.view.setGear(w, o, this.stats.attackMode, ELEMENT_COLOR[this.stats.boltElement] || "#9ad0ff");
  }

  // ------------------------------------------------------------ сцены
  private clearScene() {
    if (this.level) {
      this.engine.scene.remove(this.level.group);
      disposeTree(this.level.group);
    }
    this.ents?.clear();
    this.fx.clear();
    this.camMove = null;
    this.hubLife = null;
    this.ctl?.dispose();
    this.ambient = null;
    this.level = null;
    this.ents = null;
    this.ctl = null;
  }

  private setupScene(d: Dungeon) {
    const pal = d.theme.palette;
    this.engine.scene.background = new THREE.Color(pal.fog);
    this.engine.scene.fog = new THREE.Fog(pal.fog, 4, d.theme.id === "hub" ? 34 : 26);
    this.level = new LevelView(d);
    this.engine.scene.add(this.level.group);
    this.ambient = new AmbientFx(this.level.group, d, this.level.field, this.level.flamePos, (x, z) => {
      this.ents?.burst(x, 0.05, z, "#8aa0b0", 4, { speed: 0.8, up: 1.2, size: 0.04, life: 0.35 });
      audio.play("drip", { x, z }, 0.7);
    });
    this.ctl = new FpsController(RAPIER, d);
  }

  enterHub() {
    this.clearScene();
    this.mode = "hub";
    // в лагере герой снова цел: прежний снимок из подземелья больше не действует
    this.self = null;
    this.ents = null;
    this.engine.desat = 0;
    this.deadSince = -1;
    this.dungeonName = "Лагерь «Последняя свеча»";
    const { d, npcs } = buildHub(this.char.cleared);
    this.npcs = npcs;
    this.setupScene(d);
    this.hubLife = new HubLife(this.level!, npcs);
    this.hubLife.onLine = (n, text) => this.cb.say(`${n.name}: «${text}»`, "#aaa398");
    this.ctl!.yaw = 0;
    audio.startAmbient("hub");
    this.engine.fade = 1;
  }

  enterDungeon(session: Session, name: string) {
    this.clearScene();
    this.mode = "dungeon";
    this.session = session;
    this.readNotes.clear();
    this.dungeonName = name;
    this.bossId = null;
    this.setupScene(session.dungeon);
    this.ents = new Entities(this.engine.scene, this.level!.field, session.selfId);
    session.onSnapshot = (s) => this.onSnapshot(s);
    session.onEvents = (e) => this.onEvents(e);
    audio.startAmbient("dungeon");
    audio.play("portal");
    this.engine.fade = 1;
    this.cb.say(`Вы спускаетесь: ${name}.`, "#c9a46a");
  }

  leaveDungeon() {
    this.session?.dispose();
    this.session = null;
    audio.stopBoss();
    this.enterHub();
  }

  // ------------------------------------------------------------ снимки и события
  private onSnapshot(s: Snapshot) {
    if (!this.ents || !this.level || !this.ctl) return;
    this.ents.push(s, this.now);
    this.self = s.players.find((p) => p.id === this.session!.selfId) || null;
    this.ctl.openSecrets(s.opened.secrets);
    if (s.opened.doors?.length) this.ctl.openSecrets(s.opened.doors);
    for (const id of s.opened.cracks || []) this.ctl.collapse(id);
  }

  private onEvents(events: SimEvent[]) {
    const me = this.session?.selfId;
    const ents = this.ents;
    if (!ents) return;
    for (const e of events) {
      const pos = typeof e.x === "number" ? { x: e.x as number, z: e.z as number } : undefined;
      switch (e.t) {
        case "hit": {
          const big = !!e.crit;
          const mine = e.by === me;
          const enemy = ents.enemies.get(e.id as string)?.cur;
          const color = e.blocked ? "#8a8a8a" : big ? "#ffd84a" : e.el && e.el !== "physical" ? ELEMENT_COLOR[e.el as string] : mine ? "#ffffff" : "#c8c0b0";
          ents.number(e.x as number, (e.y as number) + 0.4, e.z as number, `${e.amount}${big ? "!" : ""}`, color, big);
          ents.flashEnemy(e.id as string);
          const undead = enemy ? ENEMIES[enemy.type]?.undead : true;
          ents.burst(e.x as number, e.y as number, e.z as number, undead ? "#d8cfb8" : "#8a0a10", big ? 14 : 7, { speed: 3, size: 0.07 });
          audio.play(e.blocked ? "block" : big ? "crit" : undead ? "bone" : "hit", pos, mine ? 1 : 0.6);
          if (mine && big) { this.shake = Math.max(this.shake, 0.25); this.view.freeze(0.06); }
          if (big && !undead) ents.splat(e.x as number, e.z as number, "blood", 0.9);
          break;
        }
        case "phit":
          if (e.p === me) {
            this.engine.hurt = Math.min(1, this.engine.hurt + 0.5);
            this.view.hurt();
            this.shake = Math.max(this.shake, 0.35);
            audio.play("hurt");
          }
          break;
        case "block":
          if (e.p === me) { audio.play("block"); this.shake = Math.max(this.shake, 0.15); }
          break;
        case "parry":
          if (e.p === me) { audio.play("parry"); this.cb.say("Парирование", "#ffd84a"); }
          break;
        case "ward":
          if (e.p === me) audio.play("frost", undefined, 0.6);
          break;
        case "guardbreak":
          if (e.p === me) { this.cb.say("Защита пробита", "#ff6a4a"); audio.play("hurt"); }
          break;
        case "evade":
          if (e.p === me) this.cb.say("Уклонение", "#9ad0ff");
          break;
        case "swing":
          if (e.p === me) {
            this.view.attack(!!e.heavy, this.attackInterval(!!e.heavy));
            audio.play(e.heavy ? "heavy" : "swing");
          }
          break;
        case "whiff":
          break;
        case "shoot":
          if (e.p === me) { this.view.shoot(); audio.play("bow"); }
          break;
        case "cast":
          if (e.p === me) {
            const sk = SKILL_BY_ID[e.skill as string];
            if (sk) this.playSkill(sk);
            else {
              this.view.castAnim();
              if (this.ctl) ents.flash(this.ctl.x - Math.sin(this.ctl.yaw) * 0.8, 1.4, this.ctl.z - Math.cos(this.ctl.yaw) * 0.8, ELEMENT_COLOR[this.stats.boltElement] || "#ffd8a0", 0.8, 7, 0.3);
            }
            if (sk) this.cb.say(sk.name, "#c9a46a");
            const sel = sk ? (sk.effect(1) as { element?: string; type: string }) : null;
            const snd = !sk ? "cast" : sel?.element === "fire" ? "fire" : sel?.element === "cold" ? "frost" : sel?.element === "holy" ? "holy" : sel?.element === "lightning" ? "zap" : sel?.element === "dark" || sel?.element === "poison" ? "dark" : sel?.type === "buff" || sel?.type === "summon" ? "cast" : "heavy";
            audio.play(snd);
          }
          break;
        case "nomana":
          if (e.p === me) { this.cb.say("Не хватает маны", "#4a6fb0"); audio.play("nomana"); }
          break;
        case "nostamina":
          if (e.p === me) this.cb.say("Нет сил", "#b59a3a");
          break;
        case "nosight":
          if (e.p === me) this.cb.say("Цель не видна", "#8a8a8a");
          break;
        case "nocorpse":
          if (e.p === me) this.cb.say("Рядом нет трупов", "#8a8a8a");
          break;
        case "dodge":
          if (e.p === me) audio.play("dodge");
          break;
        case "potion":
          if (e.p === me) { this.view.potion(); audio.play("potion"); }
          break;
        case "break": {
          const wood = e.kind !== "urn";
          ents.burst(e.x as number, 0.4, e.z as number, wood ? "#6a4a2a" : "#8a5a3a", 18, { speed: 3, up: 2.5, size: 0.08, life: 0.8 });
          ents.burst(e.x as number, 0.3, e.z as number, "#5a4a3a", 10, { speed: 1, up: 0.8, g: 0.5, size: 0.3, life: 1.2 });
          audio.play(wood ? "wood" : "break", pos);
          if (e.p === me) this.shake = Math.max(this.shake, 0.12);
          break;
        }
        case "death": {
          const type = e.type as string;
          const undead = ENEMIES[type]?.undead;
          ents.splat(e.x as number, e.z as number, undead ? "bonedust" : "blood", e.boss ? 3.5 : 1.8);
          ents.burst(e.x as number, 0.8, e.z as number, undead ? "#d8cfb8" : "#6a0a0e", e.boss ? 60 : 16, { speed: e.boss ? 6 : 3, size: 0.09 });
          audio.play(undead ? "bone" : "death", pos);
          audio.play("death", pos, 0.6);
          if (e.boss) {
            this.cb.say(`${ENEMIES[type].name} повержен${type === "forgotten_saint" ? "а" : ""}`, "#ffd84a");
            audio.stopBoss();
            this.bossId = null;
            this.shake = 1;
          }
          break;
        }
        case "pickup":
          if (e.p === me) {
            if (e.item) {
              const it = e.item as Item;
              audio.play(it.rarity === "common" || it.rarity === "uncommon" ? "pickup" : "rare");
              this.cb.say(`Подобрано: ${it.name}`, RARITIES[it.rarity].color);
              void this.cb.pickup(it);
            } else if (e.gold) {
              audio.play("gold");
              this.cb.say(`+${e.gold} золота`, "#e0b040");
            } else if (e.potion) {
              audio.play("pickup");
              this.cb.say(e.potion === "health" ? "+1 зелье здоровья" : "+1 зелье маны", e.potion === "health" ? "#d02a2a" : "#4a6fe0");
            }
          }
          break;
        case "chest":
          audio.play("chest", this.pointOf("chest", e.id as string));
          break;
        case "secret":
          audio.play("secret");
          this.shake = Math.max(this.shake, 0.5);
          this.cb.say("Стена уходит в пол: за ней тайник", "#c9a46a");
          break;
        case "shrine":
          audio.play("shrine");
          this.cb.say(SHRINE_NAMES[e.buff as string] + " (60 с)", "#7fe0b0");
          break;
        case "trap":
          audio.play("trap", this.pointOf("trap", e.id as string), 0.5);
          break;
        case "levelup":
          if (e.p === me) {
            audio.play("levelup");
            this.cb.say(`Новый уровень ${e.level}. Очки атрибутов и навыков ждут в лагере`, "#ffd84a");
            if (this.ctl) ents.burst(this.ctl.x, 1, this.ctl.z, "#ffd84a", 40, { speed: 2, up: 4, g: 1, additive: true, size: 0.2, life: 1.2 });
          }
          break;
        case "explode":
          ents.flash(e.x as number, 1.2, e.z as number, ELEMENT_COLOR[e.el as string] || "#ff8a2a", 2.2, 6 + (e.r as number) * 3, 0.55);
          ents.splat(e.x as number, e.z as number, "soot", Math.min(4, (e.r as number) * 1.4));
          ents.burst(e.x as number, 0.6, e.z as number, ELEMENT_COLOR[e.el as string] || "#ff8a2a", 30, { speed: (e.r as number) * 1.6, additive: true, size: 0.35, life: 0.5 });
          ents.ring(e.x as number, e.z as number, (e.r as number) * 2, ELEMENT_COLOR[e.el as string] || "#ff8a2a");
          audio.play(e.el === "holy" ? "holy" : "explode", pos);
          if (this.ctl && Math.hypot(this.ctl.x - (e.x as number), this.ctl.z - (e.z as number)) < 8) this.shake = Math.max(this.shake, 0.4);
          break;
        case "nova": {
          const delay = e.slam && e.p === me && this.camMove ? Math.max(0, this.camMove.dur - this.camMove.t) : 0;
          const col = ELEMENT_COLOR[e.el as string] || "#ffffff";
          this.fx.shockwave(e.x as number, e.z as number, (e.r as number) * 1.05, e.slam ? "#f0c890" : col, { dur: 0.45, delay });
          this.fx.shockwave(e.x as number, e.z as number, (e.r as number) * 0.7, e.slam ? "#ffffff" : col, { dur: 0.35, delay: delay + 0.06 });
          if (e.slam) {
            ents.burst(e.x as number, 0.2, e.z as number, "#6a5a48", 26, { speed: (e.r as number) * 1.4, up: 2.5, g: 6, size: 0.18, life: 0.9 });
            ents.splat(e.x as number, e.z as number, "soot", Math.min(3.5, e.r as number));
            if (e.p === me) { this.view.freeze(0.07); this.fovKick = Math.min(this.fovKick, -4); }
          }
          if (e.slam && this.ctl && Math.hypot(this.ctl.x - (e.x as number), this.ctl.z - (e.z as number)) < 6) this.shake = Math.max(this.shake, 0.6);
          ents.flash(e.x as number, 1.4, e.z as number, ELEMENT_COLOR[e.el as string] || "#ffffff", 1.6, 4 + (e.r as number) * 2, 0.5);
          ents.ring(e.x as number, e.z as number, (e.r as number) * 2, ELEMENT_COLOR[e.el as string] || "#fff");
          ents.burst(e.x as number, 1, e.z as number, ELEMENT_COLOR[e.el as string] || "#fff", 24, { speed: e.r as number, additive: true, size: 0.25, up: 0.5, g: 0 });
          audio.play(e.el === "cold" ? "frost" : e.el === "holy" ? "holy" : "explode", pos, 0.8);
          break;
        }
        case "chain":
          ents.bolt(e.pts as number[], ELEMENT_COLOR[e.el as string] || "#bfe4ff");
          audio.play(e.el === "lightning" ? "zap" : e.el === "holy" ? "holy" : "impact", { x: (e.pts as number[])[0], z: (e.pts as number[])[2] }, 0.8);
          break;
        case "warcry":
          ents.ring(e.x as number, e.z as number, (e.r as number) * 2, e.fear ? "#9a6aff" : "#ffb04a");
          ents.ring(e.x as number, e.z as number, (e.r as number) * 1.3, e.fear ? "#9a6aff" : "#ffb04a");
          audio.play("roar", pos, 0.7);
          this.fx.shockwave(e.x as number, e.z as number, e.r as number, e.fear ? "#9a6aff" : "#ffb04a", { dur: 0.55, y: 0.4 });
          this.fx.shockwave(e.x as number, e.z as number, (e.r as number) * 0.8, "#ffffff", { dur: 0.4, y: 0.9, delay: 0.08 });
          if (e.p === me) { this.shake = Math.max(this.shake, 0.45); this.engine.zoom = Math.max(this.engine.zoom, 0.7); }
          break;
        case "buff":
          ents.burst(e.x as number, 1, e.z as number, "#ffe9a0", 18, { speed: 1.2, up: 2.5, g: 0, additive: true, size: 0.14, life: 0.8 });
          if (e.party) ents.ring(e.x as number, e.z as number, (e.party as number) * 2, "#ffe9a0");
          break;
        case "aura":
          ents.burst(e.x as number, 0.3, e.z as number, ELEMENT_COLOR[e.el as string] || "#ffe9a0", 6, { speed: (e.r as number) * 1.2, up: 0.8, g: 0, additive: true, size: 0.12, life: 0.5 });
          if (e.el === "lightning") audio.play("zap", pos, 0.3);
          break;
        case "sentry":
          ents.flash(e.x as number, 0.8, e.z as number, "#ffb070", 0.5, 4, 0.15);
          break;
        case "blink_from":
          if (e.p === me) this.blinkPending = true;
          // своё облако остаётся там, где стоял герой; камера улетает из него — делаем его мельче, чтобы не слепило
          ents.burst(e.x as number, 1, e.z as number, ELEMENT_COLOR[e.el as string] || "#d87aff", 26, { speed: 2, up: 1, g: 0, additive: true, size: e.p === me ? 0.1 : 0.2, life: 0.6 });
          this.fx.sigil(e.x as number, e.z as number, 1, ELEMENT_COLOR[e.el as string] || "#d87aff", { dur: 0.8, spin: 4 });
          audio.play("portal", pos, 0.5);
          break;
        case "combo":
          if (e.p === me) {
            // серия ударов: каждый следующий — взмах с другой стороны
            for (let i = 1; i < (e.n as number); i++) {
              setTimeout(() => {
                if (!this.ctl) return;
                const c = this.ctl;
                this.view.gesture("slash", "#f0e6d0", "none", i % 2 === 1);
                this.fx.slash(c.x, c.y + 1.45, c.z, c.yaw, c.pitch, { color: "#f0e6d0", arc: 1.6, r: 2.4, width: 0.85, tilt: i % 2 ? 0.7 : -0.7, mirror: i % 2 === 1 });
                audio.play("swing");
              }, i * 120);
            }
          }
          break;
        case "smoke":
          ents.burst(e.x as number, 1, e.z as number, "#5a5a5a", 50, { speed: 4, size: 0.6, up: 0.6, g: -0.5, life: 2 });
          audio.play("dodge");
          break;
        case "heal":
          if (e.p === me && this.ctl) {
            ents.number(this.ctl.x - Math.sin(this.ctl.yaw), 1.4, this.ctl.z - Math.cos(this.ctl.yaw), `+${e.amount}`, "#7fe07f");
            ents.burst(this.ctl.x, 1, this.ctl.z, "#7fe07f", 12, { speed: 1, up: 2, g: 0, additive: true, size: 0.15 });
          }
          break;
        case "windup": {
          const en = ents.enemies.get(e.id as string);
          if (en) audio.play(en.cur.boss ? "windup" : "windup", { x: en.x, z: en.z }, en.cur.boss ? 1 : 0.5);
          break;
        }
        case "eswing": {
          const en = ents.enemies.get(e.id as string);
          if (en) audio.play("swing", { x: en.x, z: en.z }, 0.7);
          break;
        }
        case "ecast": {
          const en = ents.enemies.get(e.id as string);
          if (en) audio.play("dark", { x: en.x, z: en.z }, 0.6);
          break;
        }
        case "slam": {
          const en = ents.enemies.get(e.id as string);
          if (en && this.ctl) {
            audio.play("slam", { x: en.x, z: en.z });
            const d = Math.hypot(en.x - this.ctl.x, en.z - this.ctl.z);
            this.shake = Math.max(this.shake, Math.max(0, 0.8 - d / 15));
          }
          break;
        }
        case "boss_awake":
          if (!this.bossId) {
            this.bossId = e.id as string;
            audio.play("roar");
            audio.startBoss();
            const champ = ents.enemies.get(e.id as string)?.cur.name;
            this.cb.say(champ ? `${champ} преграждает путь` : `${ENEMIES[e.type as string]?.name || "Босс"} пробуждается…`, "#ff5a4a");
          }
          break;
        case "boss_phase":
          audio.play("roar");
          this.shake = Math.max(this.shake, 0.6);
          this.cb.say(e.phase === 3 ? "Полое Сердце разрывает тьму" : "Босс впадает в ярость", "#ff5a4a");
          break;
        case "exit_open":
          audio.play("portal");
          this.cb.say("Открылся портал в лагерь.", "#8fd0ff");
          break;
        case "impact":
          if (e.el !== "physical") ents.flash(e.x as number, e.y as number, e.z as number, ELEMENT_COLOR[e.el as string] || "#ffffff", 0.9, 7, 0.3);
          ents.burst(e.x as number, e.y as number, e.z as number, ELEMENT_COLOR[e.el as string] || "#c8c0b0", 6, { speed: 2, size: 0.06 });
          audio.play("impact", pos, 0.4);
          break;
        case "summon":
        case "esummon":
          if (e.id) ents.markSpawn(e.id as string);
          if (e.t === "summon") {
            this.fx.sigil(e.x as number, e.z as number, 1.1, "#9aff9a", { dur: 1.2, spin: 2 });
            this.fx.pillar(e.x as number, e.z as number, "#9aff9a", { r: 0.5, h: 2.6, dur: 0.7, power: 0.8 });
          }
          ents.burst(e.x as number, 0.4, e.z as number, "#7aff9a", 20, { speed: 2, up: 3, additive: true, size: 0.2 });
          audio.play("dark", pos, 0.7);
          break;
        case "teleport":
        case "correct":
          if (e.p === me && this.ctl) {
            const c = this.ctl;
            const dx = c.x - (e.x as number), dz = c.z - (e.z as number);
            if (e.t === "teleport" && Math.hypot(dx, dz) > 0.5) {
              // камера пролетает путь, а не перескакивает: прыжок — дугой, рывок — броском, телепорт — вспышкой
              const leap = !!e.leap, blink = this.blinkPending;
              this.camMove = { dx, dz, t: 0, dur: leap ? 0.34 : blink ? 0.1 : 0.16, arc: leap ? 1.5 : 0 };
              this.engine.zoom = Math.max(this.engine.zoom, blink ? 1.2 : leap ? 0.6 : 0.9);
              this.fovKick = Math.max(this.fovKick, blink ? 14 : leap ? 6 : 10);
            }
            this.blinkPending = false;
            c.teleport(e.x as number, (e.y as number) || 0, e.z as number, e.t === "teleport" ? (e.yaw as number) : undefined);
          }
          break;
        case "downed":
          if (e.p === me) {
            this.cb.say("Вы пали…", "#ff3a2a");
            audio.play("death");
          } else this.cb.say("Союзник пал. Подойдите и нажмите E, чтобы поднять", "#ff6a4a");
          break;
        case "revived":
          if (e.p === me) this.cb.say("Вас подняли на ноги.", "#7fe07f");
          break;
        case "revive_start":
          break;
        case "fuse":
          ents.burst(e.x as number, 0.8, e.z as number, "#ffb040", 14, { speed: 1.5, up: 2, additive: true, size: 0.12, life: 0.4 });
          ents.flash(e.x as number, 0.8, e.z as number, "#ff9a3a", 0.8, 6, 0.35);
          audio.play("fuse", pos);
          break;
        case "chandelier":
          audio.play("wood", pos, 0.6);
          break;
        case "crash":
          ents.burst(e.x as number, 0.3, e.z as number, "#5a5048", 26, { speed: 4, up: 3, size: 0.12, life: 1 });
          ents.burst(e.x as number, 0.3, e.z as number, "#ffb060", 16, { speed: 3, up: 2, additive: true, size: 0.1, life: 0.6 });
          ents.splat(e.x as number, e.z as number, "soot", 2.4);
          audio.play("crash", pos);
          if (this.ctl && Math.hypot(this.ctl.x - (e.x as number), this.ctl.z - (e.z as number)) < 10) this.shake = Math.max(this.shake, 0.5);
          break;
        case "lever":
          audio.play("lever", pos);
          break;
        case "key":
          if (e.p === me) {
            audio.play("keyring");
            this.cb.say(`Найден ключ. Ключей: ${this.ents?.latest?.keyCount ?? 1}`, "#e8c050");
          } else this.cb.say("Союзник нашёл ключ", "#e8c050");
          break;
        case "locked":
          if (e.p === me) {
            audio.play("locked");
            this.cb.say("Заперто. Ключ где-то на этаже", "#c8b89a");
          }
          break;
        case "door": {
          const o = this.session?.dungeon.doors?.find((x) => x.id === e.id);
          const dp = o ? { x: (o.cx + 0.5) * CELL, z: (o.cy + 0.5) * CELL } : undefined;
          audio.play(e.kind === "gate" ? "gate" : "unlock", dp);
          if (e.kind === "key" && e.p === me) this.cb.say("Ключ поворачивается. Дверь открыта", "#e8c050");
          if (e.kind === "gate") this.cb.say("Где-то с лязгом поднимается решётка", "#c9a46a");
          break;
        }
        case "plate":
          audio.play("plate", pos);
          if (this.ctl && Math.hypot(this.ctl.x - (e.x as number), this.ctl.z - (e.z as number)) < 12) this.shake = Math.max(this.shake, 0.15);
          break;
        case "creak": {
          const cr = this.session?.dungeon.cracks?.find((x) => x.id === e.id);
          const cp = cr ? { x: (cr.cells[0][0] + 0.5) * CELL, z: (cr.cells[0][1] + 0.5) * CELL } : undefined;
          audio.play("creak", cp, 0.8);
          this.shake = Math.max(this.shake, 0.12);
          if (cp) ents.burst(cp.x + (Math.random() - 0.5) * 3, 0.1, cp.z + (Math.random() - 0.5) * 3, "#6a6050", 6, { speed: 0.8, up: 1, size: 0.06, life: 0.6 });
          break;
        }
        case "collapse": {
          const cr = this.session?.dungeon.cracks?.find((x) => x.id === e.id);
          if (cr) {
            for (const [x, y] of cr.cells) ents.burst((x + 0.5) * CELL, 0.2, (y + 0.5) * CELL, "#5a5048", 10, { speed: 3, up: 2, size: 0.14, life: 1.1 });
            const cp = { x: (cr.cells[0][0] + 0.5) * CELL, z: (cr.cells[0][1] + 0.5) * CELL };
            audio.play("rumble", cp);
            this.ctl?.collapse(cr.id);
            if (this.ctl && Math.hypot(this.ctl.x - cp.x, this.ctl.z - cp.z) < 14) this.shake = Math.max(this.shake, 0.8);
            this.cb.say("Пол уходит из-под ног!", "#ff9a5a");
          }
          break;
        }
        case "fell":
          if (e.p === me) {
            audio.play("fall");
            audio.play("hurt");
            this.engine.fade = Math.max(this.engine.fade, 0.9);
            this.cb.say("Вы сорвались в бездну… и очнулись у края", "#ff6a4a");
          }
          break;
        case "burn":
          if (e.p === me) {
            audio.play("sizzle");
            this.engine.hurt = Math.max(this.engine.hurt, 0.5);
            if (this.ctl) ents.burst(this.ctl.x, this.ctl.y + 0.3, this.ctl.z, "#ff7a2a", 8, { speed: 1, up: 2, additive: true, size: 0.12, life: 0.5 });
          }
          break;
        case "lever_wait":
          if (e.p === me) this.cb.say("Рычаг ещё не взвёлся.", "#c8b89a");
          break;
        case "vent":
          ents.flash(e.x as number, 1, e.z as number, "#ff7a2a", 1.4, 8, 0.6);
          audio.play("flame", pos);
          break;
        case "mimic":
          audio.play("roar", pos, 0.6);
          ents.burst(e.x as number, 0.6, e.z as number, "#6a4a2a", 18, { speed: 3, up: 3, size: 0.08 });
          this.cb.say("Сундук оскалился: это мимик", "#ff6a4a");
          this.shake = Math.max(this.shake, 0.3);
          break;
        case "phased":
          ents.burst(e.x as number, 1.2, e.z as number, "#cfe0ff", 6, { speed: 1, up: 0.5, g: 0, additive: true, size: 0.15, life: 0.4 });
          audio.play("ghost", pos, 0.6);
          break;
        case "raise_start":
          ents.burst(e.x as number, 0.2, e.z as number, "#4aff7a", 20, { speed: 0.6, up: 2, g: -0.5, additive: true, size: 0.18, life: 1.1 });
          audio.play("dark", pos, 0.6);
          break;
        case "eshoot": {
          const en = ents.enemies.get(e.id as string);
          if (en) audio.play("bow", { x: en.x, z: en.z }, 0.8);
          break;
        }
        default:
          break;
      }
    }
  }

  private pointOf(kind: "chest" | "trap", id: string) {
    const d = this.session?.dungeon;
    if (!d) return undefined;
    const o = kind === "chest" ? d.chests.find((c) => c.id === id) : d.traps.find((c) => c.id === id);
    return o ? { x: o.x, z: o.z } : undefined;
  }

  /** Отсвет силы навыка по краям кадра. */
  private pulse(color: string, k: number) {
    this.engine.glowColor.set(color);
    this.engine.glow = Math.max(this.engine.glow, k);
  }

  /** Как выглядит навык героя: жест рук, эффекты в мире, отклик камеры. */
  private playSkill(sk: SkillDef) {
    const c = this.ctl;
    if (!c) return;
    const look = skillLook(sk);
    const rank = Math.max(1, this.char.skills[sk.id] || 1);
    const eff = sk.effect(rank) as Record<string, number | string | undefined> & { type: string };
    const { color, gesture } = look;
    const fx = this.fx;
    const yaw = c.yaw, pitch = c.pitch;
    const fwx = -Math.sin(yaw), fwz = -Math.cos(yaw);
    const eye = c.y + EYE;
    // точка «у руки»: чуть впереди и правее взгляда
    const hand = { x: c.x + fwx * 1.5 + Math.cos(yaw) * 0.3, y: eye - 0.35 + Math.sin(pitch) * 1.5, z: c.z + fwz * 1.5 - Math.sin(yaw) * 0.3 };
    const num = (k: string, d: number) => (typeof eff[k] === "number" ? (eff[k] as number) : d);
    this.view.gesture(gesture, color, look.hand, false, eff.type === "leap" ? 1.7 : 1);
    this.pulse(color, 0.1 + look.power * 0.22);
    const aim = () => (sk.aimed || eff.type === "corpse" || eff.type === "curse" || eff.type === "ground" || eff.type === "field" ? this.aimPoint() : { x: c.x + fwx * 3, y: 0, z: c.z + fwz * 3 });
    switch (gesture) {
      case "slash": {
        const arc = Math.max(1.3, Math.min(2.8, num("arc", 1.6) * 1.2));
        fx.slash(c.x, c.y + 1.45, c.z, yaw, pitch, { color, arc, r: num("range", 2.6) + 0.2, width: 0.95, tilt: -0.55 });
        this.fovKick = Math.max(this.fovKick, 2.5);
        break;
      }
      case "chop":
        if (eff.type === "arc") {
          fx.slash(c.x, c.y + 1.3, c.z, yaw, pitch, { color, arc: 1.7, r: num("range", 2.4) + 0.3, width: 1.0, tilt: Math.PI / 2 - 0.2, yawOff: -0.5, dip: 0, dur: 0.36 });
          this.fovKick = Math.min(this.fovKick, -3);
          this.shake = Math.max(this.shake, 0.3);
        }
        break;
      case "thrust":
        this.fovKick = Math.max(this.fovKick, 6);
        this.engine.zoom = Math.max(this.engine.zoom, 0.5);
        break;
      case "push":
      case "flick":
      case "throw":
        fx.burstRing(hand.x, hand.y, hand.z, yaw, pitch, color, gesture === "throw" ? 0.18 : 0.3);
        this.ents?.flash(hand.x, hand.y, hand.z, color, 1.2, 7, 0.3);
        this.ents?.burst(hand.x, hand.y, hand.z, color, 10, { speed: 2.2, up: 0.4, g: 0, additive: true, size: 0.12, life: 0.35 });
        this.fovKick = Math.max(this.fovKick, gesture === "throw" ? 1.5 : 3);
        break;
      case "slam":
        fx.sigil(c.x, c.z, num("radius", 4) * 0.55, color, { dur: 0.9, spin: 3 });
        this.engine.zoom = Math.max(this.engine.zoom, 0.45);
        this.fovKick = Math.min(this.fovKick, -3);
        this.shake = Math.max(this.shake, 0.35);
        break;
      case "raise":
        fx.sigil(c.x, c.z, eff.type === "sanctuary" ? num("radius", 4) : 1.5, color, { dur: 1.3, spin: 1.5 });
        fx.pillar(c.x, c.z, color, { r: 1.1, h: 3.4, dur: 0.9, power: 0.55 });
        this.ents?.burst(c.x, 0.2, c.z, color, 24, { speed: 1.4, up: 3, g: -0.5, additive: true, size: 0.12, life: 1 });
        this.pulse(color, 0.35);
        break;
      case "roar":
        this.fovKick = Math.min(this.fovKick, -5);
        break;
      case "claw": {
        const a = aim();
        fx.sigil(a.x, a.z, num("radius", 3), color, { dur: 1.2, spin: -2 });
        this.ents?.burst(a.x, 0.3, a.z, color, 22, { speed: 1.2, up: 1.6, g: -0.4, additive: true, size: 0.22, life: 1.1 });
        break;
      }
      case "beckon":
        if (eff.type === "corpse") {
          const a = aim();
          fx.sigil(a.x, a.z, num("radius", 3), color, { dur: 0.7, spin: 5 });
        } else fx.sigil(c.x + fwx * 1.5, c.z + fwz * 1.5, 1.3, color, { dur: 1.2, spin: 2 });
        break;
      case "call": {
        const a = aim();
        fx.sigil(a.x, a.z, num("radius", 2.5), color, { dur: Math.max(0.8, num("delay", 0.6) + 0.5), spin: 2.5 });
        if (sk.cls === "cleric") fx.pillar(a.x, a.z, color, { r: num("radius", 2) * 0.6, h: 6, dur: 0.7, power: 1, delay: Math.max(0, num("delay", 0.3) - 0.05) });
        break;
      }
      case "sweep": {
        const a = aim();
        fx.sigil(a.x, a.z, num("radius", 3), color, { dur: 1, spin: 1 });
        break;
      }
      case "bash":
        this.shake = Math.max(this.shake, 0.25);
        this.fovKick = Math.max(this.fovKick, 3);
        fx.slash(c.x, c.y + 1.35, c.z, yaw, pitch, { color: "#e8e2d4", arc: 1.2, r: num("range", 2) + 0.2, width: 0.6, tilt: 0.1, dur: 0.25 });
        break;
      case "fling":
        fx.slash(c.x, c.y + 0.9, c.z, yaw, 0, { color: "#e8ecf2", arc: Math.PI * 2, r: num("radius", 4), width: 1.1, dur: 0.35, dip: 0 });
        break;
      case "toss":
      case "spin":
        break;
    }
  }

  private attackInterval(heavy: boolean) {
    const speed = this.stats.attackSpeed;
    return (this.stats.attackMode === "melee" ? (heavy ? 1.05 : 0.62) : 0.5) / speed;
  }

  // ------------------------------------------------------------ ввод и взаимодействие
  private act(a: Action) {
    this.session?.action(a);
  }

  private findInteraction(): { label: string; act: () => void } | null {
    const c = this.ctl!;
    const near = (x: number, z: number, r: number) => Math.hypot(c.x - x, c.z - z) < r;
    if (this.mode === "hub") {
      let best: Npc | null = null, bd = 3.2;
      for (const n of this.npcs) {
        const d = Math.hypot(c.x - n.x, c.z - n.z);
        if (d < bd) { bd = d; best = n; }
      }
      if (best) {
        const n = best;
        return {
          label: n.kind === "cat" ? `Погладить: ${n.name}` : !n.panel ? `Поговорить: ${n.name}` : `${n.name}${n.title ? ` — ${n.title}` : ""}`,
          act: () => {
            if (!n.panel) {
              // житель без лавки: поговорить или погладить
              const line = this.hubLife?.interact(n, this.now);
              if (line) this.cb.say(`${n.name}: «${line}»`, "#d8cdb2");
              return;
            }
            if (n.lines.length) {
              const line = n.lines[Math.floor(Math.random() * n.lines.length)];
              this.cb.say(`${n.name}: «${line}»`, "#d8cdb2");
              this.hubLife?.say(n, line, this.now, false);
            }
            audio.play("click");
            this.cb.openPanel(n.panel);
          },
        };
      }
      return null;
    }
    const s = this.ents?.latest;
    const d = this.session?.dungeon;
    if (!s || !d) return null;
    for (const p of s.players) {
      if (p.id !== this.session!.selfId && !p.alive && p.connected && near(p.x, p.z, 2.6)) return { label: `Поднять: ${p.name}`, act: () => this.act({ t: "interact" }) };
    }
    let bestDrop: Snapshot["drops"][number] | null = null, bd = 2.4;
    for (const dr of s.drops) {
      if (dr.kind !== "item") continue;
      const dist = Math.hypot(c.x - dr.x, c.z - dr.z);
      if (dist < bd) { bd = dist; bestDrop = dr; }
    }
    if (bestDrop) {
      const dr = bestDrop;
      return {
        label: `Поднять: ${dr.name}`,
        act: () => {
          if (this.cb.bagFull()) {
            this.cb.say("Сумка полна. Продайте или выбросьте что-нибудь в лагере.", "#ff6a4a");
            return;
          }
          this.act({ t: "interact" });
        },
      };
    }
    for (const n of d.notes) {
      if (near(n.x, n.z, 1.9)) {
        const note = NOTES[n.note % NOTES.length];
        return {
          label: this.readNotes.has(n.id) ? `Перечитать: «${note.title}»` : "Прочитать записку",
          act: () => {
            this.readNotes.add(n.id);
            this.level?.markNoteRead(n.id);
            audio.play("paper");
            this.cb.readNote(note.title, note.text);
          },
        };
      }
    }
    for (const ch of d.chests) if (!s.opened.chests.includes(ch.id) && near(ch.x, ch.z, 2.6) && this.ctl && lineOfSight(RAPIER, this.ctl.phys, this.ctl.x, 1.3, this.ctl.z, ch.x, 1.3, ch.z)) return { label: "Открыть сундук", act: () => this.act({ t: "interact" }) };
    for (const c of d.chandeliers) if (!(s.opened.chandeliers || []).includes(c.id) && near(c.ax, c.az, 2.2)) return { label: "Перерезать верёвку люстры", act: () => this.act({ t: "interact" }) };
    for (const o of d.doors || []) {
      if (o.kind !== "key" || (s.opened.doors || []).includes(o.id)) continue;
      if (!near((o.cx + 0.5) * CELL, (o.cy + 0.5) * CELL, 2.8)) continue;
      const have = s.keyCount ?? 0;
      return { label: have > 0 ? `Отпереть дверь ключом (ключей: ${have})` : "Заперто — нужен ключ", act: () => this.act({ t: "interact" }) };
    }
    for (const lv of d.levers) {
      if (!near(lv.x, lv.z, 2.0)) continue;
      if (lv.opens) {
        if (lv.opens.every((id) => (s.opened.doors || []).includes(id))) continue;
        return { label: "Потянуть рычаг решётки", act: () => this.act({ t: "interact" }) };
      }
      const cd = s.levers?.[lv.id] || 0;
      return { label: cd > 0 ? `Рычаг взводится… ${Math.ceil(cd)} с` : "Потянуть рычаг огненных решёток", act: () => this.act({ t: "interact" }) };
    }
    for (const sec of d.secrets) {
      if (!s.opened.secrets.includes(sec.id) && near((sec.cx + 0.5) * CELL, (sec.cy + 0.5) * CELL, 3.2)) return { label: "Осмотреть треснувшую кладку", act: () => this.act({ t: "interact" }) };
    }
    for (const sh of d.shrines) if (!s.opened.shrines.includes(sh.id) && near(sh.x, sh.z, 2.6)) return { label: "Коснуться святыни", act: () => this.act({ t: "interact" }) };
    if (s.exitOpen && near(d.exit.x, d.exit.z, 2.8)) return { label: "Войти в портал (вернуться в лагерь)", act: () => this.act({ t: "interact" }) };
    if (near(d.entrance.x, d.entrance.z, 2.6)) return { label: "Подняться в лагерь (забег закончится)", act: () => this.act({ t: "interact" }) };
    return null;
  }

  private aimPoint(): { x: number; y: number; z: number } {
    const c = this.ctl!;
    const cp = Math.cos(c.pitch);
    const dir = { x: -Math.sin(c.yaw) * cp, y: Math.sin(c.pitch), z: -Math.cos(c.yaw) * cp };
    const o = { x: c.x, y: c.y + EYE, z: c.z };
    const ray = new RAPIER.Ray(o, dir);
    const hit = c.phys.world.castRay(ray, 18, true, undefined, undefined, c.collider);
    const dist = hit ? hit.timeOfImpact : 18;
    let x = o.x + dir.x * dist, z = o.z + dir.z * dist;
    // шаг назад от стены, чтобы зона легла на пол
    x -= dir.x * 0.5;
    z -= dir.z * 0.5;
    return { x, y: 0, z };
  }

  private handleInput(dt: number, t: number) {
    const inp = this.input;
    const c = this.ctl!;
    // пока открыто окно интерфейса, его клавиши (I, C, Esc…) обрабатывает сам интерфейс
    if (this.uiOpen || this.extPause) return;
    for (const code of inp.pressed) {
      if (code === "Escape") { this.cb.pauseToggle(); continue; }
      if (code === "KeyI") this.cb.togglePanel("inventory");
      if (code === "KeyC") this.cb.togglePanel("character");
      if (code === "KeyB" || code === "KeyK") this.cb.togglePanel("skills");
      if (code === "KeyM" || code === "Tab") this.cb.togglePanel("map");
      if (code === "KeyJ") this.cb.togglePanel("quests");
      if (code === "F1") this.cb.togglePanel("help");
    }
    if (!inp.locked) return;
    c.look(inp.mouse.dx, inp.mouse.dy, this.engine.settings.sensitivity, this.engine.settings.invertY);
    // поворот стрелками (всегда) и у края экрана (если мышь не захвачена)
    const turn = (inp.down("ArrowLeft") ? 1 : 0) - (inp.down("ArrowRight") ? 1 : 0) - (inp.soft ? inp.edge : 0);
    c.yaw += turn * dt * 2.4;
    const tilt = (inp.down("ArrowUp") ? 1 : 0) - (inp.down("ArrowDown") ? 1 : 0);
    c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch + tilt * dt * 1.6));
    const alive = this.mode === "hub" || (this.self ? this.self.alive : true);
    const move = {
      f: (inp.down("KeyW") ? 1 : 0) - (inp.down("KeyS") ? 1 : 0),
      r: (inp.down("KeyD") ? 1 : 0) - (inp.down("KeyA") ? 1 : 0),
    };
    if (!alive) { move.f = 0; move.r = 0; }
    const blocking = this.mode === "dungeon" && inp.mouse.right && alive;
    let speed = this.stats.moveSpeed;
    if (this.mode === "dungeon" && this.self) {
      speed *= 1 + (this.self.move || 0);
      if (blocking) speed *= 0.55;
    }
    const sprintOk = this.mode === "hub" || (this.self ? this.self.stamina > 2 : true);
    c.update(dt, t, move, speed, inp.down("ShiftLeft") && sprintOk && !blocking);
    // шаги
    if (c.moving && c.grounded) {
      this.stepAcc += c.speed * dt;
      if (this.stepAcc > (c.sprinting ? 2.6 : 2.1)) {
        this.stepAcc = 0;
        audio.play("step", undefined, c.sprinting ? 0.9 : 0.6);
      }
    }
    // прыжок — пробел, и в лагере, и в подземелье
    if (alive && inp.pressed.includes("Space") && c.jump()) audio.play("dodge", undefined, 0.45);
    if (c.landed > 6) {
      audio.play("step", undefined, Math.min(1, c.landed / 10));
      if (c.landed > 11) this.shake = Math.max(this.shake, 0.1);
    }
    this.interactTarget = this.findInteraction();
    if (inp.pressed.includes("KeyE") && this.interactTarget) this.interactTarget.act();
    if (this.mode !== "dungeon" || !alive) return;

    if (inp.pressed.includes("KeyV")) {
      this.act({ t: "dodge" });
      if (this.self && this.self.stamina >= 20) {
        const sin = Math.sin(c.yaw), cos = Math.cos(c.yaw);
        c.dash(t, -sin * move.f + cos * move.r, -cos * move.f - sin * move.r);
      }
    }
    if (blocking !== this.rmbHeld) {
      this.rmbHeld = blocking;
      this.act(this.stats.secondary === "aim" ? { t: "aim", on: blocking } : { t: "block", on: blocking });
    }
    const mode = this.stats.attackMode;
    if (inp.mouse.leftPressed) this.lmbAt = t;
    if (mode === "bolt" && inp.mouse.left) this.act({ t: "attack" });
    if (mode === "melee" && inp.mouse.leftReleased && this.lmbAt >= 0) {
      this.act({ t: "attack", heavy: t - this.lmbAt > 0.32 });
      this.lmbAt = -1;
    }
    if (mode === "bow" && inp.mouse.leftReleased && this.lmbAt >= 0) {
      const draw = Math.min(1, (t - this.lmbAt) / (this.rmbHeld ? 0.6 : 0.9));
      this.act({ t: "attack", draw });
      this.lmbAt = -1;
    }
    const slots: [string, number][] = [["KeyQ", 0], ["KeyR", 1], ["KeyF", 2], ["KeyG", 3], ["KeyZ", 4], ["KeyX", 5]];
    for (const [code, slot] of slots) {
      if (inp.pressed.includes(code)) {
        const id = this.char.hotbar[slot];
        if (!id) { this.cb.say("Ячейка пуста — назначьте навык в книге навыков (B)", "#8a8a8a"); continue; }
        const sk = SKILL_BY_ID[id];
        this.act({ t: "skill", slot, aim: sk?.aimed || sk?.effect(1).type === "corpse" ? this.aimPoint() : undefined });
      }
    }
    if (inp.pressed.includes("Digit1")) this.act({ t: "potion", kind: "health" });
    if (inp.pressed.includes("Digit2")) this.act({ t: "potion", kind: "mana" });
  }

  // ------------------------------------------------------------ кадр
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const nowAbs = performance.now() / 1000;
    const dt = Math.min(0.1, nowAbs - this.last);
    this.last = nowAbs;
    const t = this.now;
    try {
      this.frame(dt, t);
    } catch (err) {
      console.error(err);
    }
    this.input.endFrame();
  };

  private frame(dt: number, t: number) {
    if (!this.ctl || !this.level) return;
    const c = this.ctl;
    const paused = !!this.session?.paused;
    if (!paused) this.handleInput(dt, t);

    if (this.session) {
      this.session.update(dt);
      this.poseAcc += dt;
      if (this.poseAcc >= 0.05 && !paused) {
        this.poseAcc = 0;
        this.session.sendPose({ x: c.x, y: c.y, z: c.z, yaw: c.yaw, pitch: c.pitch, sprint: c.sprinting, moving: c.moving });
      }
      if (this.session.finished) {
        const fin = this.session.finished;
        this.session.finished = null;
        this.cb.runEnded(fin.success);
      }
    }
    // камера
    const cam = this.engine.camera;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    let mx = 0, my = 0, mz = 0;
    if (this.camMove) {
      const m = this.camMove;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const left = 1 - (1 - Math.pow(1 - k, 2));
      mx = m.dx * left;
      mz = m.dz * left;
      my = m.arc * 4 * k * (1 - k);
      if (k >= 1) this.camMove = null;
    }
    const fovT = this.engine.settings.fov + this.fovKick;
    if (Math.abs(cam.fov - fovT) > 0.01) { cam.fov = fovT; cam.updateProjectionMatrix(); }
    this.fovKick *= Math.exp(-dt * 7);
    this.engine.zoom = Math.max(0, this.engine.zoom - dt * 4);
    this.engine.glow = Math.max(0, this.engine.glow - dt * 1.8);
    this.fx.update(dt);
    // вихрь: серп вокруг героя на каждом обороте
    if (this.self?.whirl && t >= this.whirlFxAt) {
      this.whirlFxAt = t + 0.24;
      this.whirlSide = !this.whirlSide;
      this.fx.slash(c.x, c.y + 1.0, c.z, c.yaw, 0, { color: "#f0e6d0", arc: Math.PI * 2, r: 3.2, width: 1.0, tilt: this.whirlSide ? 0.12 : -0.12, mirror: this.whirlSide, dur: 0.3, dip: 0 });
    }
    const bob = this.engine.settings.bob && c.moving && c.grounded ? Math.abs(Math.sin(c.stepPhase)) * 0.05 : 0;
    const dead = this.mode === "dungeon" && this.self && !this.self.alive;
    cam.position.set(c.x + mx + (Math.random() - 0.5) * this.shake * 0.15, c.y + my + (dead ? 0.35 : EYE) + bob + (Math.random() - 0.5) * this.shake * 0.15, c.z + mz);
    cam.rotation.order = "YXZ";
    cam.rotation.set(c.pitch, c.yaw, dead ? 0.6 : 0);
    audio.listener = { x: c.x, z: c.z, yaw: c.yaw };
    this.lantern.position.set(c.x - Math.sin(c.yaw) * 0.6, c.y + 1.9, c.z - Math.cos(c.yaw) * 0.6);
    const torch = this.view.offIcon === "torch";
    this.lantern.intensity = (torch ? 2.6 : 2.0) + Math.sin(t * 7) * (torch ? 0.3 : 0.1) + Math.sin(t * 13) * (torch ? 0.18 : 0.06);
    this.lantern.color.set(torch ? 0xffb878 : 0xffd8b0);

    const opened = this.ents?.latest?.opened;
    this.level.update(t, dt, opened, this.session ? (id) => this.session!.trapActive(id) : undefined, this.ents?.latest?.exitOpen, this.ents?.latest?.levers);
    this.level.explore(c.x, c.z);
    this.ambient?.update(dt, t, c.x, c.z);
    this.ents?.update(t, dt, { x: c.x, z: c.z });
    this.pool.update(this.level.field, c.x, c.z, t);
    this.hubLife?.update(t, dt, c.x, c.z);
    for (const n of this.level.npcRigs) {
      n.rig.root.rotation.y = 0;
      n.rig.torso.rotation.x = Math.sin(t * 1.2 + n.id.length) * 0.04;
      n.rig.head.rotation.y = Math.sin(t * 0.4 + n.id.length) * 0.3;
      if (n.id === "smith") n.rig.armR.rotation.x = -1.6 + Math.abs(Math.sin(t * 3)) * 1.2;
    }
    // свет «в руках»: проба освещения в точке игрока
    const probe = probeAt(this.level.field, c.x, c.z, new THREE.Color());
    this.view.probe.value.copy(probe.multiplyScalar(0.8).addScalar(0.06));
    const drawing = this.stats.attackMode === "bow" && this.input.mouse.left && this.lmbAt >= 0 ? Math.min(1, (t - this.lmbAt) / 0.9) : 0;
    this.view.update(dt, t, {
      moving: c.moving, sprint: c.sprinting, speed: c.speed, block: this.rmbHeld && this.stats.secondary !== "aim",
      draw: drawing, dx: this.input.mouse.dx, dy: this.input.mouse.dy, bob: this.engine.settings.bob, whirl: !!this.self?.whirl,
    });
    this.engine.hurt = Math.max(0, this.engine.hurt - dt * 1.6);
    this.engine.fade = Math.max(0, this.engine.fade - dt * 1.2);
    this.engine.desat = dead ? Math.min(0.8, this.engine.desat + dt) : Math.max(0, this.engine.desat - dt);
    if (this.self && this.self.alive && this.self.hp / this.self.maxHp < 0.25) this.engine.hurt = Math.max(this.engine.hurt, 0.15 + 0.1 * Math.sin(t * 6));
    this.engine.render(t);
    this.hudAcc += dt;
    if (this.hudAcc > 0.1) {
      this.hudAcc = 0;
      this.pushHud(drawing);
    }
  }

  /** Когда герой пал (сек. игры), −1 — жив. Плашка «Вы пали» гаснет через несколько секунд. */
  private deadSince = -1;

  private pushHud(draw: number) {
    const s = this.self;
    // выбор «подняться или сдаться» — курсор нужен свободным
    if (this.session instanceof LocalSession && this.session.sim.awaitingRevive && this.input.locked) this.input.unlock();
    if (s && !s.alive) { if (this.deadSince < 0) this.deadSince = this.now; }
    else this.deadSince = -1;
    const st = this.stats;
    const lv = levelFromXp(this.char.xp);
    const hud: Hud = {
      hp: s ? s.hp : st.maxHp, maxHp: s ? s.maxHp : st.maxHp,
      mana: s ? s.mana : st.maxMana, maxMana: s ? s.maxMana : st.maxMana,
      stamina: s ? s.stamina : st.maxStamina, maxStamina: s ? s.maxStamina : st.maxStamina,
      absorb: s ? s.absorb : 0,
      alive: s ? s.alive : true,
      deadFor: this.deadSince >= 0 ? this.now - this.deadSince : 0,
      secondChance: this.session instanceof LocalSession && this.session.sim.awaitingRevive === this.session.selfId && !this.session.finished,
      level: s ? s.level : this.char.level,
      xp: lv.into, xpNeed: lv.need,
      cds: s ? s.cds : {},
      potions: { health: this.char.potions.health, mana: this.char.potions.mana },
      prompt: this.interactTarget ? this.interactTarget.label : "",
      boss: null, target: null, buffs: s ? s.buffs : [], gold: this.char.gold,
      reviving: s ? s.reviving : 0,
      allies: [], where: this.mode, dungeonName: this.dungeonName, draw, keys: this.ents?.latest?.keyCount ?? 0,
    };
    if (this.session instanceof LocalSession) {
      const p = this.session.sim.players.get(this.session.selfId);
      if (p) {
        hud.potions = { health: this.session.sim.potionsLeft(p, "health"), mana: this.session.sim.potionsLeft(p, "mana") };
        const lv2 = levelFromXp(this.char.xp + p.xp);
        hud.xp = lv2.into;
        hud.xpNeed = lv2.need;
        hud.gold = this.char.gold + p.gold;
      }
    }
    const snap = this.ents?.latest;
    if (snap && this.bossId) {
      const b = snap.enemies.find((e) => e.id === this.bossId);
      if (b && b.state !== "dead") hud.boss = { name: b.name ? `${b.name}, ${ENEMIES[b.type].name.toLowerCase()}` : ENEMIES[b.type].name, hp: b.hp, maxHp: b.maxHp, phase: b.phase };
    }
    if (this.ents && this.ctl) {
      const a = this.ents.aimed(this.ctl.x, this.ctl.z, this.ctl.yaw);
      if (a && !a.boss) hud.target = { name: (a.elite ? ELITE_MODS[a.elite].name + " " : "") + ENEMIES[a.type].name.toLowerCase(), hp: a.hp, maxHp: a.maxHp, elite: a.elite, level: a.level };
    }
    if (snap) hud.allies = snap.players.filter((p) => p.id !== this.session?.selfId).map((p) => ({ name: p.name, hp: p.hp, maxHp: p.maxHp, alive: p.alive, cls: p.cls }));
    this.cb.hud(hud);
  }

  /** Данные для карты: клетки, исследованные клетки, игрок, ключевые точки. */
  mapData() {
    const lv = this.level;
    const c = this.ctl;
    if (!lv || !c) return null;
    const d = lv.d;
    const snap = this.ents?.latest;
    return {
      d, explored: lv.explored, x: c.x, z: c.z, yaw: c.yaw,
      allies: snap ? snap.players.filter((p) => p.id !== this.session?.selfId).map((p) => ({ x: p.x, z: p.z, name: p.name })) : [],
      exitOpen: !!snap?.exitOpen,
      opened: snap?.opened,
      npcs: this.mode === "hub" ? this.npcs : [],
    };
  }

  isWalkable(x: number, z: number) {
    const d = this.level?.d;
    return d ? walkable(d, worldToCell(x), worldToCell(z)) : false;
  }

  classColor() {
    return CLASSES[this.char.cls].color;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.session?.dispose();
    this.clearScene();
    audio.stopAmbient();
    this.input.dispose();
    this.engine.dispose();
  }
}
