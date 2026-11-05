/* 3D-превью персонажа для регистрации, кабинета и магазина.
   Один общий WebGL-рендерер рисует персонажа и копирует картинку в обычный <canvas>,
   поэтому на странице магазина хватает одного WebGL-контекста на все карточки. */
import * as THREE from "three";
import * as M from "sky/models";

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight("#ffffff", "#8899aa", 1.4));
const sun = new THREE.DirectionalLight("#ffffff", 1.6);
sun.position.set(2, 4, 3);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

const cache = new Map();
function model(av) {
  const key = JSON.stringify(av || {});
  if (!cache.has(key)) {
    if (cache.size > 40) cache.clear();
    cache.set(key, M.buildAvatar(av));
  }
  return cache.get(key);
}

let current = null;
/** Нарисовать персонажа av в 2D-контекст ctx размером w×h (CSS-пиксели). */
function draw(ctx, av, w, h, t, { dpr = 1, moving = false, turn = true } = {}) {
  const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== pw || size.y !== ph) renderer.setSize(pw, ph, false);
  camera.aspect = w / h;
  // персонаж (рост ~1,9 с головным убором) крупно и целиком в любой рамке
  const fit = 2.1 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const z = fit * Math.max(1, 0.62 / camera.aspect);
  camera.position.set(0, 1.0, z);
  camera.lookAt(0, 0.95, 0);
  camera.updateProjectionMatrix();
  const m = model(av);
  if (current !== m) { if (current) scene.remove(current); scene.add(m); current = m; }
  m.rotation.y = turn ? Math.sin(t * 0.6) * 0.6 : 0;
  M.animateAvatar(m, t, { moving });
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0, w, h);
}

window.SkyAvatar3D = { draw };
window.dispatchEvent(new Event("skyavatar3d"));
