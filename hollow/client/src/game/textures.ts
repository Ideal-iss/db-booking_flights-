/** Процедурные пиксельные текстуры: кирпич, кости, плиты, дерево, ткань, огонь. */
import * as THREE from "three";
import { Rng } from "@shared/rng";

type Draw = (g: CanvasRenderingContext2D, rng: Rng, s: number) => void;

const cache = new Map<string, THREE.CanvasTexture>();

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex: string, k: number, jitter = 0, rng?: Rng): string {
  const [r, g, b] = hexToRgb(hex);
  const j = rng ? rng.range(-jitter, jitter) : 0;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (k + j))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function make(key: string, size: number, draw: Draw, repeat = true): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  draw(g, new Rng(hashKey(key)), size);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

function hashKey(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Шум поверх готового рисунка — «грязь» на камне. */
function grime(g: CanvasRenderingContext2D, rng: Rng, s: number, amount = 0.12, dark = "#000") {
  g.fillStyle = dark;
  for (let i = 0; i < s * s * amount; i++) {
    g.globalAlpha = rng.range(0.05, 0.25);
    g.fillRect(rng.int(0, s - 1), rng.int(0, s - 1), 1, 1);
  }
  g.globalAlpha = 1;
}

export function wallTexture(style: string, c1: string, c2: string, variant = 0): THREE.CanvasTexture {
  return make(`wall:${style}:${c1}:${c2}:${variant}`, 64, (g, rng, s) => {
    drawWall(g, rng, s, style, c1, c2);
    if (variant === 1) cracks(g, rng, s, shade(c2, 0.45), 4);
    if (variant === 2) {
      // мох и сырость снизу, подтёки сверху
      for (let i = 0; i < 260; i++) {
        const y = s - Math.floor(Math.abs(rng.range(0, 1) ** 2) * 26);
        g.fillStyle = rng.chance(0.5) ? "#3e4a2a" : "#2c3820";
        g.globalAlpha = rng.range(0.35, 0.8);
        g.fillRect(rng.int(0, s - 1), y - 1, rng.int(1, 3), 1);
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 5; i++) {
        const x = rng.int(0, s - 1);
        g.fillStyle = "rgba(10,8,6,0.35)";
        g.fillRect(x, 0, 1, rng.int(10, 40));
      }
    }
    if (variant === 3) {
      // выпавшие кирпичи: тёмные провалы
      for (let i = 0; i < 2; i++) {
        const x = rng.int(4, s - 14), y = rng.int(4, s - 10);
        g.fillStyle = "#0b0806";
        g.fillRect(x, y, rng.int(6, 12), rng.int(4, 7));
        g.fillStyle = shade(c1, 0.6);
        g.fillRect(x, y, rng.int(6, 12), 1);
      }
      cracks(g, rng, s, shade(c2, 0.5), 2);
    }
  });
}

function cracks(g: CanvasRenderingContext2D, rng: Rng, s: number, color: string, n: number) {
  g.fillStyle = color;
  for (let k = 0; k < n; k++) {
    let x = rng.int(0, s - 1), y = rng.int(0, s - 1);
    const len = rng.int(8, 26);
    for (let i = 0; i < len; i++) {
      g.fillRect(x, y, 1, 1);
      x += rng.int(-1, 1);
      y += rng.chance(0.7) ? 1 : 0;
      if (rng.chance(0.08)) g.fillRect(x + 1, y, 1, 1);
    }
  }
}

function drawWall(g: CanvasRenderingContext2D, rng: Rng, s: number, style: string, c1: string, c2: string) {
  {
    g.fillStyle = c2;
    g.fillRect(0, 0, s, s);
    if (style === "bones") {
      // ряды черепов и костей, как стены катакомб
      for (let row = 0; row < 8; row++) {
        const y = row * 8;
        const skulls = row % 2 === 0;
        for (let x = (row % 4) * 2; x < s; x += skulls ? 8 : 6) {
          if (skulls && rng.chance(0.8)) {
            g.fillStyle = shade(c1, 1.15, 0.12, rng);
            g.fillRect(x + 1, y + 1, 6, 5);
            g.fillRect(x + 2, y + 6, 4, 1);
            g.fillStyle = "#120c08";
            g.fillRect(x + 2, y + 3, 1, 2);
            g.fillRect(x + 5, y + 3, 1, 2);
            g.fillRect(x + 3, y + 6, 1, 1);
          } else {
            g.fillStyle = shade(c1, 0.95, 0.15, rng);
            g.fillRect(x, y + 3, 6, 2);
            g.fillRect(x - 1, y + 2, 2, 4);
            g.fillRect(x + 5, y + 2, 2, 4);
          }
        }
      }
      grime(g, rng, s, 0.2);
      return;
    }
    const bw = style === "blocks" ? 32 : 16;
    const bh = style === "blocks" ? 16 : 8;
    for (let y = 0; y < s; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s + bw; x += bw) {
        g.fillStyle = shade(c1, 1, 0.14, rng);
        g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
        g.fillStyle = shade(c1, 1.18, 0.05, rng);
        g.fillRect(x + off + 1, y + 1, bw - 2, 1);
        g.fillStyle = shade(c1, 0.75, 0.05, rng);
        g.fillRect(x + off + 1, y + bh - 2, bw - 2, 1);
        if (rng.chance(0.15)) {
          g.fillStyle = shade(c1, 0.6);
          const cx = x + off + rng.int(3, bw - 4);
          g.fillRect(cx, y + 2, 1, rng.int(2, bh - 3));
        }
      }
    }
    if (style === "blood") {
      for (let i = 0; i < 7; i++) {
        const x = rng.int(0, s - 1);
        const len = rng.int(6, 40);
        g.fillStyle = `rgba(${rng.int(90, 130)},10,12,${rng.range(0.5, 0.85)})`;
        g.fillRect(x, 0, rng.int(1, 2), len);
        g.fillRect(x - 1, len - 2, 3, 2);
      }
    }
    grime(g, rng, s, 0.15);
  }
}

export function floorTexture(style: string, c1: string, c2: string, variant = 0): THREE.CanvasTexture {
  return make(`floor:${style}:${c1}:${c2}:${variant}`, 64, (g, rng, s) => {
    drawFloor(g, rng, s, style, c1, c2);
    if (variant === 1) cracks(g, rng, s, shade(c2, 0.45), 5);
    if (variant === 2) {
      // мелкие камни и кости
      for (let i = 0; i < 18; i++) {
        const x = rng.int(0, s - 3), y = rng.int(0, s - 3);
        g.fillStyle = shade(rng.chance(0.3) ? "#cfc4a8" : c1, rng.range(0.7, 1.15));
        g.fillRect(x, y, rng.int(1, 3), rng.int(1, 2));
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillRect(x, y + 1, 2, 1);
      }
    }
  });
}

function drawFloor(g: CanvasRenderingContext2D, rng: Rng, s: number, style: string, c1: string, c2: string) {
  {
    g.fillStyle = c2;
    g.fillRect(0, 0, s, s);
    if (style === "dirt") {
      for (let i = 0; i < 900; i++) {
        g.fillStyle = shade(rng.chance(0.5) ? c1 : c2, 1, 0.3, rng);
        g.fillRect(rng.int(0, s - 1), rng.int(0, s - 1), rng.int(1, 3), rng.int(1, 2));
      }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = shade("#cfc4a8", 0.75, 0.15, rng);
        g.fillRect(rng.int(0, s - 6), rng.int(0, s - 2), rng.int(2, 5), 1);
      }
      return;
    }
    if (style === "tiles") {
      for (let y = 0; y < s; y += 16)
        for (let x = 0; x < s; x += 16) {
          const dark = ((x + y) / 16) % 2 === 0;
          g.fillStyle = shade(dark ? c1 : c2, dark ? 1 : 1.2, 0.08, rng);
          g.fillRect(x + 1, y + 1, 14, 14);
        }
      grime(g, rng, s, 0.2);
      return;
    }
    // плиты разного размера
    const rects: [number, number, number, number][] = [
      [0, 0, 24, 20], [24, 0, 40, 14], [0, 20, 18, 24], [18, 14, 26, 18], [44, 14, 20, 24],
      [18, 32, 26, 12], [0, 44, 30, 20], [30, 44, 34, 20], [44, 38, 20, 6],
    ];
    for (const [x, y, w, h] of rects) {
      g.fillStyle = shade(c1, 1, 0.12, rng);
      g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = shade(c1, 1.15);
      g.fillRect(x + 1, y + 1, w - 2, 1);
    }
    grime(g, rng, s, 0.18);
  }
}

/** Наклейки на пол и стены: кровь, грязь, мох, лужи, трещины, сажа. Прозрачный фон. */
export function decalTexture(kind: string, seed = 0): THREE.CanvasTexture {
  return make(
    `decal:${kind}:${seed}`,
    32,
    (g, rng, s) => {
      g.clearRect(0, 0, s, s);
      const blob = (cx: number, cy: number, r: number, color: string, alpha: number, n = 60) => {
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2), d = Math.abs(rng.range(0, 1) ** 0.7) * r;
          g.globalAlpha = alpha * rng.range(0.6, 1);
          g.fillStyle = color;
          g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), rng.int(1, 3), rng.int(1, 3));
        }
        g.globalAlpha = 1;
      };
      if (kind === "blood") {
        blob(16, 16, 9, "#4a0608", 0.9, 160);
        blob(16, 16, 5, "#6a0a0e", 0.9, 80);
        for (let i = 0; i < 6; i++) blob(rng.int(3, 28), rng.int(3, 28), 2, "#5a080b", 0.9, 10);
      } else if (kind === "grime") {
        blob(16, 16, 13, "#0b0806", 0.45, 220);
      } else if (kind === "moss") {
        blob(16, 16, 12, "#2c3a1e", 0.75, 200);
        blob(16, 16, 7, "#45552a", 0.7, 90);
      } else if (kind === "puddle") {
        g.globalAlpha = 0.55;
        g.fillStyle = "#101418";
        for (let y = 0; y < s; y++) {
          const w = Math.sqrt(Math.max(0, 1 - ((y - 16) / 11) ** 2)) * 14 * (0.85 + 0.15 * Math.sin(y * 1.3 + seed));
          if (w > 0) g.fillRect(Math.round(16 - w), y, Math.round(w * 2), 1);
        }
        g.globalAlpha = 0.35;
        g.fillStyle = "#8aa0b0";
        g.fillRect(10, 12, 6, 1);
        g.fillRect(18, 18, 4, 1);
        g.globalAlpha = 1;
      } else if (kind === "crack") {
        g.fillStyle = "#0b0806";
        let x = 4, y = rng.int(8, 24);
        for (let i = 0; i < 40; i++) {
          g.fillRect(x, y, 1, 1);
          x += 1;
          y += rng.int(-1, 1);
          if (rng.chance(0.15)) {
            let bx = x, by = y;
            for (let k = 0; k < 6; k++) { g.fillRect(bx, by, 1, 1); bx += rng.int(0, 1); by += rng.chance(0.5) ? 1 : -1; }
          }
          if (x > 28) break;
        }
      } else if (kind === "soot") {
        blob(16, 22, 10, "#000000", 0.5, 150);
        blob(16, 12, 7, "#000000", 0.3, 60);
      } else if (kind === "bonedust") {
        blob(16, 16, 11, "#cfc4a8", 0.55, 120);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = "#e0d6bc";
          g.fillRect(rng.int(6, 24), rng.int(6, 24), rng.int(2, 4), 1);
        }
      } else if (kind === "drip") {
        // подтёки на стене, текут вниз
        for (let i = 0; i < 6; i++) {
          const x = rng.int(2, 29);
          const len = rng.int(8, 30);
          g.fillStyle = seed % 2 ? "rgba(40,30,20,0.55)" : "rgba(70,8,10,0.6)";
          g.fillRect(x, 0, 1, len);
          g.fillRect(x, len - 1, 2, 2);
        }
      }
    },
    false,
  );
}

/** Паутина: треугольник в углу с нитями. */
export function cobwebTexture(): THREE.CanvasTexture {
  return make(
    "cobweb",
    48,
    (g, rng, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = "rgba(220,215,200,0.55)";
      g.lineWidth = 1;
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * (Math.PI / 2);
        g.beginPath();
        g.moveTo(0.5, 0.5);
        g.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        g.stroke();
      }
      for (let r = 6; r < s; r += rng.int(5, 8)) {
        g.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * (Math.PI / 2);
          const rr = r * (0.9 + 0.12 * Math.sin(i * 2.1 + r));
          if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
      }
    },
    false,
  );
}

/** Бумага записки. */
export function paperTexture(): THREE.CanvasTexture {
  return make(
    "paper",
    16,
    (g, rng, s) => {
      g.fillStyle = "#cdbf98";
      g.fillRect(0, 0, s, s);
      g.fillStyle = "#3a2a1a";
      for (let y = 3; y < s - 2; y += 2) g.fillRect(2, y, rng.int(7, 12), 1);
      g.fillStyle = "rgba(90,60,30,0.4)";
      g.fillRect(0, s - 2, s, 2);
    },
    false,
  );
}

/** Доски ящика с перекладинами. */
export function crateTexture(): THREE.CanvasTexture {
  return make("crate", 32, (g, rng, s) => {
    g.fillStyle = "#5a3f26";
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) {
      g.fillStyle = shade("#6b4a2e", 1, 0.12, rng);
      g.fillRect(0, y, s, 7);
      g.fillStyle = "#24170e";
      g.fillRect(0, y + 7, s, 1);
    }
    g.fillStyle = "#3a2716";
    g.fillRect(0, 0, s, 3);
    g.fillRect(0, s - 3, s, 3);
    for (let i = 0; i < s; i++) g.fillRect(i, i, 2, 1);
  });
}

export function ceilingTexture(c: string): THREE.CanvasTexture {
  return make(`ceil:${c}`, 32, (g, rng, s) => {
    g.fillStyle = c;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = shade(c, 1, 0.35, rng);
      g.fillRect(rng.int(0, s - 1), rng.int(0, s - 1), rng.int(1, 3), 1);
    }
  });
}

export function woodTexture(): THREE.CanvasTexture {
  return make("wood", 32, (g, rng, s) => {
    g.fillStyle = "#4a3221";
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 8) {
      g.fillStyle = shade("#5d402a", 1, 0.12, rng);
      g.fillRect(x, 0, 7, s);
      g.fillStyle = "#24170e";
      g.fillRect(x + 7, 0, 1, s);
      for (let i = 0; i < 5; i++) {
        g.fillStyle = shade("#3a2617", 1, 0.2, rng);
        g.fillRect(x + rng.int(1, 6), rng.int(0, s - 1), 1, rng.int(3, 9));
      }
    }
  });
}

export function stoneTexture(c = "#6d6458"): THREE.CanvasTexture {
  return make(`stone:${c}`, 32, (g, rng, s) => {
    g.fillStyle = c;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = shade(c, 1, 0.25, rng);
      g.fillRect(rng.int(0, s - 1), rng.int(0, s - 1), rng.int(1, 2), rng.int(1, 2));
    }
  });
}

export function metalTexture(c = "#8a8d92"): THREE.CanvasTexture {
  return make(`metal:${c}`, 16, (g, rng, s) => {
    g.fillStyle = c;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = shade(c, 1, 0.3, rng);
      g.fillRect(rng.int(0, s - 1), rng.int(0, s - 1), rng.int(1, 4), 1);
    }
  });
}

/** Кадры пламени для спрайтов факелов (горизонтальная лента). */
export function flameTexture(): THREE.CanvasTexture {
  return make(
    "flame",
    64,
    (g, rng, s) => {
      g.clearRect(0, 0, s, s);
      const frames = 4, fw = s / frames;
      for (let f = 0; f < frames; f++) {
        for (let y = 0; y < s; y++) {
          const t = y / s;
          const width = (1 - t) ** 0.6 * fw * 0.42 * (0.8 + 0.4 * Math.sin(t * 9 + f * 1.7));
          const cx = f * fw + fw / 2 + Math.sin(t * 7 + f * 2.1) * 2 * t * 3;
          for (let x = Math.floor(cx - width); x <= cx + width; x++) {
            const edge = Math.abs(x - cx) / Math.max(1, width);
            const heat = 1 - t * 0.9 - edge * 0.6 + rng.range(-0.08, 0.08);
            if (heat < 0.12) continue;
            g.fillStyle = heat > 0.75 ? "#fff3c4" : heat > 0.55 ? "#ffcf5a" : heat > 0.35 ? "#ff8a2a" : "#c43d14";
            g.fillRect(x, s - 1 - y, 1, 1);
          }
        }
      }
    },
    false,
  );
}

/** Мягкое круглое пятно для частиц и ореолов. */
export function glowTexture(): THREE.CanvasTexture {
  return make(
    "glow",
    32,
    (g, _r, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    },
    false,
  );
}

/** Квадратная «пиксельная» частица. */
export function pixelTexture(): THREE.CanvasTexture {
  return make(
    "pixel",
    8,
    (g) => {
      g.fillStyle = "#fff";
      g.fillRect(1, 1, 6, 6);
    },
    false,
  );
}

/** Круг-предупреждение для атак боссов. */
export function ringTexture(): THREE.CanvasTexture {
  return make(
    "ring",
    64,
    (g, _r, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = "#fff";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2 - 3, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.25;
      g.fillStyle = "#fff";
      g.beginPath();
      g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
      g.fill();
    },
    false,
  );
}

/** Текст в спрайт (имена над предметами, цифры урона). */
export function textTexture(text: string, color: string, size = 16): { tex: THREE.CanvasTexture; w: number; h: number } {
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = `${size}px "Pixelify Sans", monospace`;
  const w = Math.ceil(g.measureText(text).width) + 6;
  c.width = w;
  c.height = size + 6;
  g.font = `${size}px "Pixelify Sans", monospace`;
  g.textBaseline = "top";
  g.fillStyle = "#000";
  g.fillText(text, 4, 4);
  g.fillStyle = color;
  g.fillText(text, 2, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: c.width, h: c.height };
}
