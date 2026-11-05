/** Движение игрока от первого лица: Rapier character controller на клиенте (предсказание). */
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import { buildDungeonPhysics, groups, openSecret, GROUP_PLAYER, GROUP_WALL, type DungeonPhysics, type Rapier } from "@shared/physics";
import type { Dungeon } from "@shared/dungeon/generate";

export const EYE = 1.62;

export class FpsController {
  R: Rapier;
  phys: DungeonPhysics;
  body: RAPIER_NS.RigidBody;
  collider: RAPIER_NS.Collider;
  ctl: RAPIER_NS.KinematicCharacterController;
  x: number; y = 0; z: number;
  yaw: number; pitch = 0;
  vy = 0;
  grounded = true;
  moving = false;
  sprinting = false;
  speed = 0;
  dashUntil = 0;
  dashDir = { x: 0, z: 0 };
  stepPhase = 0;
  private openedSecrets = new Set<string>();

  constructor(R: Rapier, d: Dungeon) {
    this.R = R;
    this.phys = buildDungeonPhysics(R, d);
    this.x = d.start.x;
    this.z = d.start.z;
    this.yaw = d.start.yaw;
    this.body = this.phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.x, 0.9, this.z));
    this.collider = this.phys.world.createCollider(R.ColliderDesc.capsule(0.5, 0.36).setCollisionGroups(groups(GROUP_PLAYER, GROUP_WALL)), this.body);
    this.ctl = this.phys.world.createCharacterController(0.02);
    this.ctl.enableAutostep(0.3, 0.2, true);
    this.ctl.enableSnapToGround(0.3);
    this.ctl.setSlideEnabled(true);
  }

  openSecrets(ids: string[]) {
    for (const id of ids) {
      if (this.openedSecrets.has(id)) continue;
      this.openedSecrets.add(id);
      openSecret(this.phys, id);
    }
  }

  look(dx: number, dy: number, sens: number, invert: boolean) {
    this.yaw -= dx * 0.0022 * sens;
    this.pitch -= dy * 0.0022 * sens * (invert ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  dash(t: number, fx: number, fz: number) {
    let dx = fx, dz = fz;
    if (Math.hypot(dx, dz) < 0.1) {
      dx = Math.sin(this.yaw);
      dz = Math.cos(this.yaw);
    }
    const l = Math.hypot(dx, dz);
    this.dashDir = { x: dx / l, z: dz / l };
    this.dashUntil = t + 0.28;
  }

  /** move: локальные оси (вперёд, вправо) от -1 до 1. */
  update(dt: number, t: number, move: { f: number; r: number }, speed: number, sprint: boolean) {
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * move.f + cos * move.r;
    let wz = -cos * move.f - sin * move.r;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    this.moving = len > 0.05;
    this.sprinting = sprint && this.moving && move.f > 0.1;
    const sp = speed * (this.sprinting ? 1.6 : 1);
    let mx = wx * sp * dt, mz = wz * sp * dt;
    if (t < this.dashUntil) {
      mx = this.dashDir.x * 15 * dt;
      mz = this.dashDir.z * 15 * dt;
    }
    this.vy -= 22 * dt;
    if (this.grounded && this.vy < 0) this.vy = -1;
    this.ctl.computeColliderMovement(this.collider, { x: mx, y: this.vy * dt, z: mz });
    const m = this.ctl.computedMovement();
    this.grounded = this.ctl.computedGrounded();
    this.x += m.x;
    this.y = Math.max(0, this.y + m.y);
    this.z += m.z;
    this.body.setNextKinematicTranslation({ x: this.x, y: this.y + 0.9, z: this.z });
    this.phys.world.step();
    this.speed = Math.hypot(m.x, m.z) / Math.max(dt, 1e-4);
    this.stepPhase += this.speed * dt * 1.9;
  }

  teleport(x: number, y: number, z: number, yaw?: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    if (yaw !== undefined) this.yaw = yaw;
    this.body.setTranslation({ x, y: y + 0.9, z }, true);
  }

  dispose() {
    this.phys.world.free();
  }
}
