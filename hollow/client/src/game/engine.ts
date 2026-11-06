/** Рендер: низкое разрешение + VHS/PS1 постобработка. */
import * as THREE from "three";
import type { Settings } from "../store";

/** Общий uniform для «дрожания» вершин в духе PS1. */
export const snapUniform = { value: 160 };

/** Добавляет к материалу привязку вершин к сетке экрана (PS1 jitter). */
export function ps1<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snapUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uSnap;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        {
          vec4 p = gl_Position;
          p.xyz /= p.w;
          p.xy = floor(p.xy * uSnap + 0.5) / uSnap;
          p.xyz *= p.w;
          gl_Position = p;
        }`,
      );
  };
  m.customProgramCacheKey = () => "ps1";
  return m;
}

const POST_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform vec2 uScreen;
uniform float uTime;
uniform float uVhs;
uniform float uGrain;
uniform float uChroma;
uniform float uCurve;
uniform float uScan;
uniform float uHurt;
uniform float uFade;
uniform float uDesat;
uniform float uGamma;
uniform vec3 uGlowCol;
uniform float uGlow;
uniform float uZoom;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
  return 0.0;
}

void main() {
  vec2 uv = vUv;
  // искривление кинескопа
  vec2 cc = uv * 2.0 - 1.0;
  float r2 = dot(cc, cc);
  cc *= 1.0 + uCurve * 0.09 * r2;
  uv = cc * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  // дрожание строк и «полоса трекинга»
  float line = floor(uv.y * uRes.y);
  float t = uTime;
  float jit = (hash(vec2(line, floor(t * 24.0))) - 0.5) * 0.0018 * uVhs;
  float bandPos = fract(t * 0.045);
  float band = smoothstep(0.035, 0.0, abs(uv.y - bandPos)) * uVhs;
  uv.x += jit + band * 0.006 * sin(t * 40.0 + uv.y * 300.0);

  float ca = (0.0012 + 0.0025 * uChroma) * (0.4 + r2) * (0.5 + uVhs);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
  // размытие по горизонтали, как у кассеты
  // «рывок»: радиальное размытие к центру при прыжке, рывке и телепорте
  if (uZoom > 0.002) {
    vec2 d = (uv - 0.5) * uZoom * 0.09;
    vec3 acc = col;
    for (int k = 1; k < 6; k++) acc += texture2D(tDiffuse, uv - d * float(k)).rgb;
    col = mix(col, acc / 6.0, smoothstep(0.05, 0.45, length(uv - 0.5)));
  }
  vec3 smear = texture2D(tDiffuse, uv - vec2(1.5 / uRes.x, 0.0)).rgb;
  col = mix(col, max(col, smear * 0.92), 0.35 * uVhs);

  // яркость: гамма поднимает тени, не пересвечивая огонь
  col = pow(max(col, vec3(0.0)), vec3(1.0 / uGamma));
  // цвет: тёплый, приглушённый, чуть поднятый чёрный
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), 0.18 * uVhs + uDesat);
  col = col * vec3(1.04, 0.98, 0.9) + vec3(0.018, 0.012, 0.008) * uVhs;
  col += band * 0.06;

  // пониженная глубина цвета с упорядоченным дизерингом (PS1)
  vec2 px = floor(uv * uRes);
  col += bayer(px) / 24.0;
  col = floor(col * 24.0 + 0.5) / 24.0;

  // зерно
  float n = hash(uv * uScreen + fract(t * 7.0) * 100.0);
  col += (n - 0.5) * 0.11 * uGrain;

  // строки развёртки по реальным пикселям экрана
  float sl = sin(vUv.y * uScreen.y * 3.14159 * 0.5);
  col *= 1.0 - uScan * 0.16 * (0.5 - 0.5 * sl);

  // виньетка и урон
  float vig = smoothstep(1.35, 0.35, length(cc));
  col *= mix(1.0, vig, 0.65);
  col = mix(col, vec3(0.55, 0.03, 0.03), uHurt * (1.0 - vig * 0.6) * 0.55);
  // отсвет силы навыка по краям кадра
  col += uGlowCol * uGlow * ((1.0 - vig) * 0.55 + 0.05);
  col *= 1.0 - uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Engine {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  viewScene = new THREE.Scene();
  viewCamera: THREE.PerspectiveCamera;
  rt: THREE.WebGLRenderTarget;
  post: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  postScene = new THREE.Scene();
  postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  settings: Settings;
  hurt = 0;
  fade = 0;
  desat = 0;
  /** Отсвет навыка по краям кадра и его цвет. */
  glow = 0;
  glowColor = new THREE.Color();
  /** Сила радиального размытия «рывка». */
  zoom = 0;
  private ro: ResizeObserver;

  constructor(host: HTMLElement, settings: Settings) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    host.appendChild(this.canvas);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 60);
    this.viewCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.rt = new THREE.WebGLRenderTarget(320, 240, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tDiffuse: { value: this.rt.texture }, uRes: { value: new THREE.Vector2() }, uScreen: { value: new THREE.Vector2() },
        uTime: { value: 0 }, uVhs: { value: 0 }, uGrain: { value: 0 }, uChroma: { value: 0 }, uCurve: { value: 0 },
        uScan: { value: 0 }, uHurt: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uGamma: { value: 1.35 },
        uGlowCol: { value: new THREE.Color() }, uGlow: { value: 0 }, uZoom: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.postScene.add(this.post);
    this.viewScene.add(new THREE.AmbientLight(0xffffff, 0.25));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  resize() {
    const host = this.canvas.parentElement;
    if (!host) return;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // разрешение рендера: высота из настроек, «пикселизация» уменьшает ещё сильнее
    const rh = Math.round(Math.max(120, this.settings.resolution) / Math.max(0.5, this.settings.pixel));
    const rw = Math.round(rh * aspect);
    this.rt.setSize(rw, rh);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
    const u = this.post.material.uniforms;
    u.uRes.value.set(rw, rh);
    u.uScreen.value.set(w, h);
    snapUniform.value = this.settings.jitter > 0 ? (rh / 2) * (1.6 - this.settings.jitter) : 4000;
  }

  render(time: number) {
    const r = this.renderer;
    const s = this.settings;
    r.setRenderTarget(this.rt);
    r.autoClear = true;
    r.render(this.scene, this.camera);
    r.autoClear = false;
    r.clearDepth();
    r.render(this.viewScene, this.viewCamera);
    r.setRenderTarget(null);
    r.autoClear = true;
    const u = this.post.material.uniforms;
    u.uTime.value = time;
    u.uVhs.value = s.vhs;
    u.uGrain.value = s.grain * s.vhs + 0.05;
    u.uChroma.value = s.chroma;
    u.uCurve.value = s.curve;
    u.uScan.value = s.scanlines;
    u.uHurt.value = this.hurt;
    u.uFade.value = this.fade;
    u.uDesat.value = this.desat;
    u.uGlowCol.value.copy(this.glowColor);
    u.uGlow.value = this.glow;
    u.uZoom.value = this.zoom;
    u.uGamma.value = s.brightness || 1.35;
    r.render(this.postScene, this.postCam);
  }

  dispose() {
    this.ro.disconnect();
    this.renderer.dispose();
    this.rt.dispose();
    this.canvas.remove();
  }
}

/** Освобождает геометрию и материалы поддерева. */
export function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
    else if (mat) mat.dispose();
  });
}
