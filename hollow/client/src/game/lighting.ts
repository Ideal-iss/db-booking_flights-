/** Освещение: запечённый по вершинам свет факелов (как Гуро в PS1) + несколько живых источников. */
import * as THREE from "three";
import { CELL, Cell, type Dungeon } from "@shared/dungeon/generate";
import { groundAt } from "@shared/dungeon/terrain";
import { snapUniform } from "./engine";

export interface StaticLight {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  radius: number;
  power: number;
}

const LIGHT_RADIUS: Record<string, [number, number]> = {
  torch: [13, 2.1],
  brazier: [14, 2.4],
  candle: [5.5, 1.0],
  magic: [9, 1.4],
};

export function staticLights(d: Dungeon): StaticLight[] {
  return d.lights.map((l) => {
    // огонь слегка «отбеливаем», чтобы картинка не уходила в сплошной оранжевый
    const c = new THREE.Color(l.color).lerp(new THREE.Color("#fff2e0"), 0.35);
    const [radius, power] = LIGHT_RADIUS[l.kind] || [8, 1];
    // высота огня — над полом в этом месте
    return { x: l.x, y: l.y + groundAt(d, l.x, l.z), z: l.z, r: c.r, g: c.g, b: c.b, radius, power };
  });
}

/** Сетка видимости: стены (и закрытые тайники) гасят свет. */
export class LightField {
  lights: StaticLight[];
  d: Dungeon;
  ambient: THREE.Color;
  private grid: Map<number, StaticLight[]> = new Map();
  constructor(d: Dungeon, lights: StaticLight[], ambient: THREE.Color) {
    this.d = d;
    this.lights = lights;
    this.ambient = ambient;
    for (const l of lights) {
      const cx = Math.floor(l.x / 12), cz = Math.floor(l.z / 12);
      const k = cx * 1000 + cz;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k)!.push(l);
    }
  }

  private solid(x: number, z: number) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    if (cx < 0 || cz < 0 || cx >= this.d.w || cz >= this.d.h) return true;
    const c = this.d.cells[cz * this.d.w + cx];
    return c === Cell.Wall || c === Cell.Secret;
  }

  private visible(l: StaticLight, x: number, z: number) {
    const dx = x - l.x, dz = z - l.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.floor(len / 0.6);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solid(l.x + dx * t, l.z + dz * t)) return false;
    }
    return true;
  }

  near(x: number, z: number): StaticLight[] {
    const out: StaticLight[] = [];
    const cx = Math.floor(x / 12), cz = Math.floor(z / 12);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = this.grid.get((cx + i) * 1000 + cz + j);
      if (a) out.push(...a);
    }
    return out;
  }

  /** Свет в точке с нормалью (нормаль может быть нулевой для объектов). */
  sample(x: number, y: number, z: number, nx: number, ny: number, nz: number, out: THREE.Color, inset = 0.12) {
    out.copy(this.ambient);
    // точку для теста видимости чуть сдвигаем внутрь комнаты, чтобы стена не закрывала саму себя
    const px = x + nx * inset, pz = z + nz * inset;
    for (const l of this.near(x, z)) {
      const dx = l.x - x, dy = l.y - y, dz = l.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > l.radius) continue;
      let lam = 1;
      if (nx || ny || nz) lam = Math.max(0, (dx * nx + dy * ny + dz * nz) / (d || 1)) * 0.75 + 0.25;
      const f = (1 - d / l.radius) ** 2 * l.power * lam;
      if (f < 0.01) continue;
      if (!this.visible(l, px, pz)) continue;
      out.r += l.r * f;
      out.g += l.g * f;
      out.b += l.b * f;
    }
    return out;
  }

  /** Записывает атрибут bake для геометрии, уже переведённой в мировые координаты. */
  bakeGeometry(g: THREE.BufferGeometry, inset = 0.12) {
    const pos = g.getAttribute("position");
    const nor = g.getAttribute("normal");
    const arr = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      this.sample(pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 0, nor ? nor.getZ(i) : 0, c, inset);
      // мягкое насыщение вместо жёсткой обрезки
      arr[i * 3] = soft(c.r);
      arr[i * 3 + 1] = soft(c.g);
      arr[i * 3 + 2] = soft(c.b);
    }
    g.setAttribute("bake", new THREE.BufferAttribute(arr, 3));
  }
}

const soft = (v: number) => (v < 0.8 ? v : 0.8 + (1 - Math.exp(-(v - 0.8) * 1.5)) * 0.5);

/** Проба освещения для движущихся объектов: приглушённая, чтобы фигуры не светились. */
export function probeAt(field: LightField, x: number, z: number, out: THREE.Color) {
  field.sample(x, groundAt(field.d, x, z) + 1.3, z, 0, 0, 0, out);
  out.r = soft(out.r) * 0.6;
  out.g = soft(out.g) * 0.6;
  out.b = soft(out.b) * 0.6;
  return out;
}

export interface LitOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  transparent?: boolean;
  opacity?: number;
  baked?: boolean;
  emissive?: THREE.ColorRepresentation;
  side?: THREE.Side;
  /** Цвет «пробы» освещения для движущихся объектов (меняется каждый кадр). */
  probe?: { value: THREE.Color };
  fog?: boolean;
}

const zeroProbe = { value: new THREE.Color(0, 0, 0) };

/** Материал Ламберта с запечённым светом / пробой и PS1-дрожанием вершин. */
export function litMaterial(o: LitOptions = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    color: o.color ?? 0xffffff,
    map: o.map ?? null,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    emissive: o.emissive ?? 0x000000,
    side: o.side ?? THREE.FrontSide,
    flatShading: false,
    fog: o.fog ?? true,
  });
  const baked = !!o.baked;
  const probe = o.probe || zeroProbe;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snapUniform;
    shader.uniforms.uProbe = probe;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uSnap;
        ${baked ? "attribute vec3 bake;" : ""}
        varying vec3 vBake;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        ${baked ? "vBake = bake;" : "vBake = vec3(0.0);"}
        {
          vec4 p = gl_Position;
          p.xyz /= p.w;
          p.xy = floor(p.xy * uSnap + 0.5) / uSnap;
          p.xyz *= p.w;
          gl_Position = p;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uProbe;\nvarying vec3 vBake;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * (vBake + uProbe);");
  };
  m.customProgramCacheKey = () => (baked ? "lit-baked" : "lit");
  return m;
}

/** Пул живых точечных источников: ближайшие к камере огни мерцают по-настоящему. */
export class LightPool {
  lights: THREE.PointLight[] = [];
  private flicker: number[] = [];
  constructor(scene: THREE.Scene, n = 4) {
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 7, 1.6);
      scene.add(l);
      this.lights.push(l);
      this.flicker.push(Math.random() * 10);
    }
  }

  update(field: LightField | null, x: number, z: number, t: number) {
    if (!field) {
      for (const l of this.lights) l.intensity = 0;
      return;
    }
    const near = field
      .near(x, z)
      .filter((l) => l.power > 0.9)
      .map((l) => ({ l, d: Math.hypot(l.x - x, l.z - z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lights.length);
    this.lights.forEach((pl, i) => {
      const s = near[i];
      if (!s) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(s.l.x, s.l.y, s.l.z);
      pl.color.setRGB(s.l.r, s.l.g, s.l.b);
      const fl = 0.75 + 0.25 * Math.sin(t * 9 + this.flicker[i]) * Math.sin(t * 13.7 + this.flicker[i] * 2);
      pl.intensity = 7 * fl * Math.max(0, 1 - s.d / 16);
      pl.distance = s.l.radius * 0.8;
    });
  }
}
