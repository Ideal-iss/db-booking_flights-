/** Руки и оружие от первого лица: покачивание, удары, блок, натяжение лука, заклинания. */
import * as THREE from "three";
import { makeWeapon, makeFlame } from "./models";
import { litMaterial } from "./lighting";
import { SKIN, CLOTH } from "./models";
import type { Appearance } from "@shared/data/stats";

export class ViewModel {
  root = new THREE.Group();
  right = new THREE.Group();
  left = new THREE.Group();
  weapon: THREE.Group | null = null;
  offhand: THREE.Group | null = null;
  probe = { value: new THREE.Color(0.5, 0.42, 0.32) };
  light: THREE.PointLight;
  weaponIcon = "";
  offIcon = "";
  mode: "melee" | "bolt" | "bow" = "melee";
  private swing = 0;
  private swingHeavy = false;
  private swingDur = 0.4;
  private cast = 0;
  private recoil = 0;
  private drink = 0;
  private hurtShake = 0;
  private blockK = 0;
  private drawK = 0;
  private bobT = 0;
  private sway = { x: 0, y: 0 };
  private castColor = new THREE.Color("#9ad0ff");

  constructor(scene: THREE.Scene, app: Appearance, cls: string) {
    scene.add(this.root);
    this.light = new THREE.PointLight(0xffc080, 0.25, 2, 2);
    this.light.position.set(0.3, 0.2, 0.2);
    scene.add(this.light);
    const skin = litMaterial({ color: SKIN[app.skin] || SKIN[0], probe: this.probe, fog: false });
    const sleeveColor = cls === "knight" ? "#8a8d92" : CLOTH[app.cloth] || CLOTH[0];
    const sleeve = litMaterial({ color: sleeveColor, probe: this.probe, fog: false });
    const arm = (g: THREE.Group, side: number) => {
      // рука уходит вниз-назад, за край кадра, а не сквозь камеру
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), sleeve);
      s.position.set(0, -0.09, 0.17);
      s.rotation.x = 0.55;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.075, 0.1), skin);
      g.add(s, h);
      g.position.set(side * 0.24, -0.26, -0.42);
      this.root.add(g);
    };
    arm(this.right, 1);
    arm(this.left, -1);
  }

  setGear(weapon: string, offhand: string, mode: "melee" | "bolt" | "bow", boltColor: string) {
    this.mode = mode;
    this.castColor.set(boltColor);
    if (weapon !== this.weaponIcon) {
      if (this.weapon) this.right.remove(this.weapon);
      this.weapon = weapon && weapon !== "fist" ? makeWeapon(weapon, this.probe) : null;
      if (this.weapon) {
        this.weapon.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) (m as THREE.MeshLambertMaterial).fog = false;
        });
        if (weapon === "bow") {
          this.weapon.rotation.set(0, Math.PI / 2, 0);
          this.weapon.position.set(0, 0.02, -0.02);
          this.left.add(this.weapon);
        } else {
          this.weapon.rotation.set(-1.1, 0, 0);
          this.weapon.position.set(0, 0.02, -0.04);
          // длинное оружие в руке укорачиваем, иначе оно перекрывает пол-экрана
          this.weapon.scale.setScalar(weapon === "staff" ? 0.42 : weapon === "wand" ? 0.8 : 0.72);
          if (weapon === "staff") this.weapon.position.set(0, -0.12, 0.05);
          this.right.add(this.weapon);
        }
      }
      this.weaponIcon = weapon;
    }
    // свободная левая рука держит факел (кроме лучника — ему нужны обе руки)
    if (!offhand && mode !== "bow") offhand = "torch";
    if (offhand !== this.offIcon) {
      if (this.offhand) this.left.remove(this.offhand);
      this.torchFlame = null;
      this.offhand = offhand === "torch" ? this.makeTorch() : offhand ? makeWeapon(offhand, this.probe) : null;
      if (this.offhand) {
        if (offhand === "torch") {
          this.offhand.position.set(-0.04, -0.06, -0.02);
          this.offhand.rotation.set(-0.5, 0, 0.25);
          this.offhand.scale.setScalar(0.5);
        } else if (offhand === "shield") {
          this.offhand.position.set(0.02, 0.05, -0.08);
          this.offhand.scale.setScalar(0.8);
        } else {
          this.offhand.position.set(0.02, 0.05, -0.1);
          this.offhand.rotation.x = -0.6;
          this.offhand.scale.setScalar(0.55);
        }
        this.left.add(this.offhand);
      }
      this.offIcon = offhand;
    }
  }

  private torchFlame: THREE.Sprite | null = null;

  private makeTorch(): THREE.Group {
    const g = new THREE.Group();
    const wood = litMaterial({ color: "#6b4a2a", probe: this.probe, fog: false });
    const iron = litMaterial({ color: "#3a3a3e", probe: this.probe, fog: false });
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), wood);
    stick.position.y = 0.1;
    const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), litMaterial({ color: "#2a1a10", probe: this.probe, fog: false }));
    wrap.position.y = 0.3;
    const cup = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.07), iron);
    cup.position.y = 0.26;
    g.add(stick, wrap, cup);
    const flame = makeFlame(0.55);
    (flame.material as THREE.SpriteMaterial).fog = false;
    flame.position.y = 0.42;
    g.add(flame);
    this.torchFlame = flame;
    return g;
  }

  attack(heavy: boolean, interval: number) {
    this.swing = 1;
    this.swingHeavy = heavy;
    this.swingDur = Math.max(0.25, interval);
  }
  castAnim() { this.cast = 1; }
  shoot() { this.recoil = 1; this.drawK = 0; }
  potion() { this.drink = 1; }
  hurt() { this.hurtShake = 1; }

  update(dt: number, t: number, s: { moving: boolean; sprint: boolean; speed: number; block: boolean; draw: number; dx: number; dy: number; bob: boolean; whirl: boolean }) {
    this.bobT += dt * (s.moving ? (s.sprint ? 13 : 9) : 2);
    const bobAmp = s.bob ? (s.moving ? (s.sprint ? 0.028 : 0.016) : 0.004) : 0;
    const bx = Math.sin(this.bobT * 0.5) * bobAmp;
    const by = Math.abs(Math.cos(this.bobT * 0.5)) * bobAmp;
    this.sway.x += (-s.dx * 0.0004 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (s.dy * 0.0004 - this.sway.y) * Math.min(1, dt * 8);
    this.root.position.set(bx + this.sway.x, -by + this.sway.y, 0);
    this.root.rotation.set(0, 0, 0);
    this.blockK += ((s.block ? 1 : 0) - this.blockK) * Math.min(1, dt * 14);
    this.drawK += (s.draw - this.drawK) * Math.min(1, dt * 12);

    // правая рука: базовая поза
    const R = this.right, L = this.left;
    R.position.set(0.24, -0.26, -0.42);
    R.rotation.set(0, 0, 0);
    L.position.set(-0.24, -0.28, -0.44);
    L.rotation.set(0, 0, 0);

    if (this.mode === "bow") {
      // лук в левой руке, правая тянет тетиву
      L.position.set(-0.08, -0.16, -0.5);
      L.rotation.set(0.05, 0.1, -0.15);
      R.position.set(0.06 + this.drawK * 0.02, -0.18, -0.44 + this.drawK * 0.2);
      R.rotation.set(0, 0, 0.4);
    }
    if (this.swing > 0) {
      const p = 1 - this.swing;
      // замах → удар по диагонали
      const k = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
      const strike = p < 0.3 ? -p / 0.3 : (p - 0.3) / 0.7;
      const amp = this.swingHeavy ? 1.4 : 1;
      R.rotation.x = (-0.9 * k + 1.2 * Math.max(0, strike)) * amp;
      R.rotation.z = (0.5 * k - 0.9 * Math.max(0, strike)) * amp;
      R.position.x = 0.24 - 0.18 * Math.max(0, strike) * amp;
      R.position.y = -0.26 + 0.12 * k;
      R.position.z = -0.42 - 0.12 * Math.max(0, strike);
      this.swing = Math.max(0, this.swing - dt / this.swingDur);
    }
    if (s.whirl) {
      this.root.rotation.z = Math.sin(t * 20) * 0.15;
      R.rotation.z = -1.2;
      R.position.x = 0.1;
    }
    if (this.cast > 0) {
      const k = Math.sin(this.cast * Math.PI);
      R.position.z = -0.42 - 0.18 * k;
      R.position.y = -0.26 + 0.08 * k;
      R.rotation.x = 0.5 * k;
      L.position.z = -0.44 - 0.14 * k;
      L.position.x = -0.2;
      this.cast = Math.max(0, this.cast - dt * 3.2);
    }
    if (this.recoil > 0) {
      R.position.z += 0.06 * this.recoil;
      this.recoil = Math.max(0, this.recoil - dt * 5);
    }
    if (this.blockK > 0.01 && this.mode !== "bow") {
      const k = this.blockK;
      if (this.offIcon === "shield") {
        L.position.set(-0.24 + 0.2 * k, -0.28 + 0.14 * k, -0.44 + 0.08 * k);
        L.rotation.set(0, 0.2 * k, 0);
      } else if (this.mode === "bolt") {
        // магический заслон: ладони вперёд
        L.position.set(-0.24 + 0.12 * k, -0.28 + 0.12 * k, -0.44 - 0.06 * k);
        R.position.set(0.24 - 0.12 * k, -0.26 + 0.12 * k, -0.42 - 0.06 * k);
      } else {
        R.rotation.set(0.3 * k, 0, 1.2 * k);
        R.position.set(0.24 - 0.2 * k, -0.26 + 0.12 * k, -0.42);
      }
    }
    if (this.drink > 0) {
      const k = Math.sin(this.drink * Math.PI);
      L.position.set(-0.24 + 0.2 * k, -0.28 + 0.16 * k, -0.44 + 0.1 * k);
      L.rotation.x = 0.8 * k;
      this.drink = Math.max(0, this.drink - dt * 1.4);
    }
    if (this.hurtShake > 0) {
      this.root.position.x += (Math.random() - 0.5) * 0.03 * this.hurtShake;
      this.root.position.y += (Math.random() - 0.5) * 0.03 * this.hurtShake;
      this.hurtShake = Math.max(0, this.hurtShake - dt * 4);
    }
    if (this.torchFlame) {
      const map = (this.torchFlame.material as THREE.SpriteMaterial).map!;
      map.offset.x = (Math.floor(t * 10) % 4) * 0.25;
      const k = 0.9 + 0.15 * Math.sin(t * 11);
      this.torchFlame.scale.set(0.2 * k, 0.32 * (2 - k), 1);
    }
        // сияние навершия посоха
    this.root.traverse((o) => {
      if (o.name === "orb") {
        o.rotation.y = t * 2;
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(this.castColor);
        o.scale.setScalar(1 + this.cast * 0.8 + Math.sin(t * 6) * 0.08);
      }
    });
    this.light.intensity = 0.15 + this.cast * 1.5;
    this.light.color.copy(this.cast > 0.05 ? this.castColor : new THREE.Color(0xffc080));
  }
}
