/** Живой фон меню: лагерь «Последняя свеча» в том же рендере, что и игра, камера медленно плывёт по нефу. */
import * as THREE from "three";
import { Engine, disposeTree } from "./engine";
import { buildHub } from "./hub";
import { LevelView } from "./level";
import { AmbientFx } from "./dressing";
import { LightPool } from "./lighting";
import type { Settings } from "../store";

export class MenuScene {
  private engine: Engine;
  private level: LevelView;
  private ambient: AmbientFx;
  private pool: LightPool;
  private lantern = new THREE.PointLight(0xffd8b0, 3, 16, 2);
  private raf = 0;
  private t0 = performance.now() / 1000;
  private last = this.t0;

  constructor(host: HTMLElement, settings: Settings) {
    this.engine = new Engine(host, { ...settings, vhs: Math.min(settings.vhs, 0.6), brightness: (settings.brightness || 1.35) * 1.12 });
    const { d, npcs } = buildHub([]);
    const pal = d.theme.palette;
    this.engine.scene.background = new THREE.Color(pal.fog);
    this.engine.scene.fog = new THREE.Fog(pal.fog, 4, 30);
    this.engine.scene.add(new THREE.AmbientLight(0xffffff, 0.14));
    this.level = new LevelView(d);
    this.level.addNpcs(npcs);
    this.engine.scene.add(this.level.group);
    this.ambient = new AmbientFx(this.level.group, d, this.level.field, this.level.flamePos, () => {});
    this.pool = new LightPool(this.engine.scene, 4);
    this.engine.scene.add(this.lantern);
    this.engine.fade = 0;
    this.loop();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - this.last);
    this.last = now;
    const t = now - this.t0;
    // медленный проход вдоль нефа к Вратам Глубин и обратно
    // по центру нефа: впереди жаровня, свечи и Врата Глубин
    const k = 0.5 - 0.5 * Math.cos(t * 0.035);
    const cam = this.engine.camera;
    const x = 22.5 + 1.5 * Math.sin(t * 0.05), z = 28 - 6 * k;
    cam.position.set(x, 1.7 + Math.sin(t * 0.4) * 0.03, z);
    cam.rotation.order = "YXZ";
    cam.rotation.set(0.06, Math.atan2(-(22.5 - x), -(4 - z)) + Math.sin(t * 0.11) * 0.04, 0);
    this.lantern.position.set(x, 2.4, z);
    this.level.update(t, dt);
    this.ambient.update(dt, t, x, z);
    this.pool.update(this.level.field, x, z, t);
    for (const n of this.level.npcRigs) {
      n.rig.torso.rotation.x = Math.sin(t * 1.2 + n.id.length) * 0.04;
      n.rig.head.rotation.y = Math.sin(t * 0.4 + n.id.length) * 0.3;
      if (n.id === "smith") n.rig.armR.rotation.x = -1.6 + Math.abs(Math.sin(t * 3)) * 1.2;
    }
    this.engine.render(t);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.engine.scene.remove(this.level.group);
    disposeTree(this.level.group);
    this.engine.dispose();
  }
}
