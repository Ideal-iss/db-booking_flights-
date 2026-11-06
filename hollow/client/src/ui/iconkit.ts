/**
 * Рисовалка пиксельных иконок 32×32. Иконка собирается из «деталей»: каждая деталь —
 * силуэт (рисуется векторами и обрезается по пикселям) + материал. Объём даёт сама
 * рисовалка: светлая кромка сверху-слева, тень снизу-справа, блик металла, волокна
 * дерева, зерно ткани. В конце — тёмный контур и, если нужно, свечение.
 */

export const N = 32;
type RGB = [number, number, number];

export type Mat = "metal" | "gold" | "wood" | "leather" | "cloth" | "bone" | "stone" | "gem" | "glass" | "liquid" | "glow" | "flame" | "flat" | "dark";

export function rgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
export function hex(c: RGB) {
  return "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
/** k > 1 — к белому, k < 1 — к чёрному. */
export function tone(c: RGB, k: number): RGB {
  if (k >= 1) return c.map((v) => v + (255 - v) * Math.min(1, k - 1)) as RGB;
  return c.map((v) => v * Math.max(0, k)) as RGB;
}
export function mix(a: string, b: string, t: number) {
  const A = rgb(a), B = rgb(b);
  return hex(A.map((v, i) => v + (B[i] - v) * t) as RGB);
}
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

type Draw = (g: CanvasRenderingContext2D) => void;

export class Icon {
  private px = new Uint8ClampedArray(N * N * 4);
  private owner = new Int16Array(N * N).fill(-1);
  private outlined = new Uint8Array(N * N);
  private n = 0;
  private tmp: CanvasRenderingContext2D;

  constructor() {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    this.tmp = c.getContext("2d", { willReadFrequently: true })!;
  }

  /** Деталь: силуэт + материал. Возвращает маску (для следующих деталей, если нужно). */
  part(color: string, mat: Mat, draw: Draw, o: { outline?: boolean; light?: number; under?: boolean } = {}) {
    const g = this.tmp;
    g.clearRect(0, 0, N, N);
    g.save();
    g.fillStyle = "#fff";
    g.strokeStyle = "#fff";
    g.lineCap = "round";
    g.lineJoin = "round";
    draw(g);
    g.restore();
    const a = g.getImageData(0, 0, N, N).data;
    const m = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && a[(y * N + x) * 4 + 3] >= 110;
    const base = rgb(color);
    const id = this.n++;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!m(x, y)) continue;
        const i = y * N + x;
        if (o.under && this.owner[i] >= 0) continue;
        let L = 1 + (o.light ?? 0);
        const tl = !m(x - 1, y) || !m(x, y - 1);
        const br = !m(x + 1, y) || !m(x, y + 1);
        const br2 = !m(x + 2, y) || !m(x, y + 2);
        const grad = (0.5 - y / N) * 0.22 + (0.5 - x / N) * 0.08;
        const n = hash(x, y);
        switch (mat) {
          case "metal":
            L += grad * 1.6 + (tl ? 0.45 : 0) - (br ? 0.42 : br2 ? 0.14 : 0);
            if ((x - y + 64) % 7 === 0 && !br) L += 0.28;
            break;
          case "gold":
            L += grad * 1.4 + (tl ? 0.5 : 0) - (br ? 0.4 : br2 ? 0.12 : 0);
            if (n > 0.93) L += 0.35;
            break;
          case "wood":
            L += grad + (tl ? 0.22 : 0) - (br ? 0.32 : 0) - ((x * 2 + y * 3 + Math.floor(n * 2)) % 5 === 0 ? 0.14 : 0);
            break;
          case "leather":
            L += grad + (tl ? 0.2 : 0) - (br ? 0.35 : br2 ? 0.1 : 0) + (n - 0.5) * 0.1;
            break;
          case "cloth":
            L += grad + (tl ? 0.16 : 0) - (br ? 0.3 : br2 ? 0.12 : 0) + ((x + y) % 2 ? 0.03 : -0.03);
            break;
          case "bone":
            L += grad + (tl ? 0.18 : 0) - (br ? 0.3 : br2 ? 0.1 : 0) + (n > 0.9 ? -0.12 : 0);
            break;
          case "stone":
            L += grad + (tl ? 0.2 : 0) - (br ? 0.35 : 0) + (n - 0.5) * 0.22;
            break;
          case "gem":
          case "glass":
          case "liquid": {
            // гранёный блеск: светлое пятно сверху-слева, глубокая тень снизу
            L += (tl ? 0.5 : 0) - (br ? 0.45 : 0) + grad * 1.8;
            break;
          }
          case "glow":
            L += 0.12 + grad * 0.5 - (br ? 0.12 : 0);
            break;
          case "flame":
            L += (0.2 - y / N) * 0.6 + (tl ? 0.3 : 0) - (br ? 0.15 : 0);
            break;
          case "dark":
            L += (tl ? 0.15 : 0) - (br ? 0.2 : 0);
            break;
          case "flat":
            break;
        }
        const c = tone(base, L);
        this.px.set([c[0], c[1], c[2], 255], i * 4);
        this.owner[i] = id;
        this.outlined[i] = o.outline === false ? 0 : 1;
      }
    // блик на стекле/камне: пара белых пикселей в верхней-левой части силуэта
    if (mat === "gem" || mat === "glass" || mat === "liquid") {
      let best = -1, bx = 0, by = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!m(x, y) || !m(x + 1, y + 1) || !m(x - 1, y) || !m(x, y - 1)) continue;
        const s = -x - y;
        if (best === -1 || s > best) { best = s; bx = x; by = y; }
      }
      if (best !== -1) {
        const w = mat === "liquid" ? [230, 240, 255] : [255, 255, 255];
        this.px.set([...w, 255], (by * N + bx) * 4);
        if (m(bx + 1, by)) this.px.set([...w, 255], (by * N + bx + 1) * 4);
      }
    }
  }

  /** Одиночный пиксель (искра, блик, капля). */
  dot(x: number, y: number, color: string) {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const c = rgb(color);
    const i = Math.round(y) * N + Math.round(x);
    this.px.set([c[0], c[1], c[2], 255], i * 4);
    if (this.owner[i] < 0) this.owner[i] = 999;
  }

  /** Холст 32×32: детали + тёмный контур + разделители между деталями. */
  finish(outline = "#0b0806"): HTMLCanvasElement {
    const out = new Uint8ClampedArray(this.px);
    const own = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : this.owner[y * N + x]);
    const ol = rgb(outline);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (this.owner[i] < 0) {
          const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const o = own(x + dx, y + dy);
            return o >= 0 && this.outlined[(y + dy) * N + x + dx];
          });
          if (near) out.set([ol[0], ol[1], ol[2], 255], i * 4);
          continue;
        }
        // тонкая тёмная граница там, где деталь касается другой детали снизу/справа
        const o = this.owner[i];
        const r = own(x + 1, y), d = own(x, y + 1);
        if ((r >= 0 && r !== o && r !== 999 && o !== 999) || (d >= 0 && d !== o && d !== 999 && o !== 999)) {
          out[i * 4] *= 0.62;
          out[i * 4 + 1] *= 0.62;
          out[i * 4 + 2] *= 0.62;
        }
      }
    const c = document.createElement("canvas");
    c.width = c.height = N;
    c.getContext("2d")!.putImageData(new ImageData(out, N, N), 0, 0);
    return c;
  }
}

// ---------------------------------------------------------------- векторные помощники

export const P = (g: CanvasRenderingContext2D, pts: number[], close = true) => {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (close) g.closePath();
  g.fill();
};
export const circ = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
};
export const ell = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) => {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
};
export const ln = (g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number) => {
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
};
export const arc = (g: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, a1: number, w: number) => {
  g.lineWidth = w;
  g.beginPath();
  g.arc(x, y, r, a0, a1);
  g.stroke();
};
export const rect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => g.fillRect(x, y, w, h);
/** Рисование в повёрнутой системе: (cx, cy) — центр, a — угол в радианах. */
export const rot = (g: CanvasRenderingContext2D, cx: number, cy: number, a: number, f: () => void, s = 1) => {
  g.save();
  g.translate(cx, cy);
  g.rotate(a);
  if (s !== 1) g.scale(s, s);
  f();
  g.restore();
};

// ---------------------------------------------------------------- сборка картинки

/** Иконка предмета: прозрачный фон, мягкая тень под предметом, масштаб ×2. */
export function itemCanvas(icon: HTMLCanvasElement, glow?: string): string {
  const c = document.createElement("canvas");
  c.width = c.height = N * 2;
  const g = c.getContext("2d")!;
  if (glow) {
    g.save();
    g.filter = "blur(5px)";
    g.globalAlpha = 0.55;
    g.drawImage(tintMask(icon, glow), 0, 0, N * 2, N * 2);
    g.restore();
  }
  g.imageSmoothingEnabled = false;
  g.drawImage(icon, 0, 0, N * 2, N * 2);
  return c.toDataURL();
}

/** Кнопка навыка: тёмный фон с отсветом стихии, рамка с фаской и заклёпками, свечение пиктограммы. */
export function skillCanvas(icon: HTMLCanvasElement, fg: string, bg: string): string {
  const S = N * 2;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  const rg = g.createRadialGradient(S / 2, S * 0.45, 2, S / 2, S / 2, S * 0.62);
  rg.addColorStop(0, mix(bg, fg, 0.42));
  rg.addColorStop(0.55, mix(bg, fg, 0.12));
  rg.addColorStop(1, mix(bg, "#000000", 0.45));
  g.fillStyle = rg;
  g.fillRect(0, 0, S, S);
  // пиксельный шум фона
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
    const n = hash(x, y);
    if (n > 0.86) {
      g.fillStyle = n > 0.95 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
      g.fillRect(x, y, 2, 2);
    }
  }
  g.save();
  g.filter = "blur(4px)";
  g.globalAlpha = 0.75;
  g.drawImage(tintMask(icon, fg), 0, 0, S, S);
  g.restore();
  g.imageSmoothingEnabled = false;
  g.drawImage(icon, 0, 0, S, S);
  // рамка: тёмный край, светлая фаска сверху-слева, тёмная снизу-справа, заклёпки по углам
  g.fillStyle = "#0b0806";
  g.fillRect(0, 0, S, 2); g.fillRect(0, S - 2, S, 2); g.fillRect(0, 0, 2, S); g.fillRect(S - 2, 0, 2, S);
  g.fillStyle = mix(fg, "#ffffff", 0.2) + "88";
  g.fillRect(2, 2, S - 4, 2); g.fillRect(2, 2, 2, S - 4);
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(2, S - 4, S - 4, 2); g.fillRect(S - 4, 2, 2, S - 4);
  const stud = mix(fg, "#c9a46a", 0.6);
  for (const [x, y] of [[4, 4], [S - 8, 4], [4, S - 8], [S - 8, S - 8]]) {
    g.fillStyle = "#0b0806";
    g.fillRect(x - 1, y - 1, 6, 6);
    g.fillStyle = stud;
    g.fillRect(x, y, 4, 4);
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.fillRect(x, y, 2, 2);
  }
  return c.toDataURL();
}

function tintMask(icon: HTMLCanvasElement, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.drawImage(icon, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, N, N);
  return c;
}
