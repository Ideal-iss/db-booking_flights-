/*
 * Интерактивный глобус: ортографическая проекция (d3-geo) на <canvas>, карта Natural Earth.
 * Вращается мышью и пальцем, масштабируется кнопками, самолёты летят по дугам большого круга.
 *
 * Использование:
 *   <div data-globe data-config="id-json-скрипта" data-world="url карты">...</div>  — создаётся сам;
 *   SkyGlobe.mount(root, data) → { update(data) }                                  — для живых данных (игра).
 *
 * Формат data:
 *   airports: [{code, lon, lat, kind: "main"|"minor"|"visited"|"current"|"dim", color?}]
 *   arcs:     [{from:[lon,lat], to:[lon,lat], kind: "route"|"option"|"done"|"selected", color?}]
 *   planes:   [{from, to, mode: "loop"|"timed"|"fixed", duration?, offset?, dep?, arr?, progress?,
 *               trail: "full"|"short"|"none", color?, size?, follow?}]
 *   clock:    {h, speed}  — игровые часы для режима "timed" (speed — игровых часов в реальную минуту)
 *   camera:   {mode: "follow"|"spin"|"focus", center?: [lon, lat]}
 *   caption:  подпись внизу
 */
(function () {
  "use strict";

  const C = {
    oceanLight: "#1f4486",
    oceanDark: "#0a1a38",
    halo: "rgba(90, 150, 255, 0.28)",
    land: "#335a9c",
    landEdge: "rgba(255, 255, 255, 0.14)",
    graticule: "rgba(255, 255, 255, 0.07)",
    route: "rgba(255, 255, 255, 0.26)",
    accent: "#ff5a1f",
    text: "#eef2fb",
  };

  const PLANE = new Path2D(
    "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
  );

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (deg) => ((deg + 540) % 360) - 180;
  const easeInOut = (p) => 0.5 - Math.cos(Math.PI * p) / 2;

  let worldPromise = null;
  function loadWorld(url) {
    if (!worldPromise) {
      worldPromise = fetch(url)
        .then((r) => r.json())
        .then((topo) => ({
          land: topojson.feature(topo, topo.objects.land),
          borders: topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b),
        }))
        .catch(() => null);
    }
    return worldPromise;
  }

  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function mount(root, initial) {
    const canvas = root.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
    const path = d3.geoPath(projection, ctx);
    const graticule = d3.geoGraticule10();

    let data = null;
    let planes = [];
    let rotation = [0, -25, 0];
    let width = 0, height = 0, dpr = 1, baseRadius = 100, zoom = 1, targetZoom = 1;
    let world = null;
    let lastInteraction = -Infinity;
    let dragging = null;
    let visible = true, running = false;
    let clockBase = null; // {h, at, speed} — локальный ход игровых часов между опросами сервера
    const t0 = performance.now();

    function prepare(d) {
      data = d;
      planes = (d.planes || []).map((p, i, all) => {
        const dist = d3.geoDistance(p.from, p.to);
        return {
          ...p,
          dist,
          interp: d3.geoInterpolate(p.from, p.to),
          duration: p.duration || clamp(4 + dist * 3.5, 5, 14),
          offset: p.offset != null ? p.offset : all.length > 1 ? i / all.length : 0,
        };
      });
      if (d.clock) clockBase = { h: d.clock.h, at: performance.now(), speed: d.clock.speed };
    }

    function clockNow(now) {
      if (!clockBase) return 0;
      return clockBase.h + ((now - clockBase.at) / 60000) * clockBase.speed;
    }

    function progressOf(p, now) {
      if (p.mode === "fixed") return p.progress;
      if (p.mode === "timed") {
        const h = clockNow(now);
        return (h - p.dep) / (p.arr - p.dep);
      }
      if (reduceMotion) return 0.5;
      return easeInOut((((now - t0) / 1000 / p.duration) + p.offset) % 1);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      baseRadius = Math.min(width, height) / 2 - 14;
    }

    function limbAlpha(coord) {
      const d = d3.geoDistance(coord, [-rotation[0], -rotation[1]]);
      return clamp((Math.PI / 2 - 0.05 - d) / 0.3, 0, 1);
    }

    function moveCamera(target, k) {
      rotation = [
        rotation[0] + wrap(target[0] - rotation[0]) * k,
        rotation[1] + (clamp(target[1], -60, 60) - rotation[1]) * k,
        0,
      ];
    }

    function autoCamera(now, live) {
      if (reduceMotion || dragging || now - lastInteraction < 2500) return;
      const cam = data.camera || {};
      if (cam.mode === "spin") {
        rotation = [rotation[0] + 0.06, rotation[1] + (-25 - rotation[1]) * 0.01, 0];
        return;
      }
      const followed = live.find((s) => s.plane.follow);
      if (followed) {
        const pl = followed.plane;
        const focus = pl.dist > 1.7 ? pl.interp(clamp(followed.p, 0, 1)) : pl.interp(0.5);
        moveCamera([-focus[0], -focus[1]], 0.035);
      } else if (cam.center) {
        moveCamera([-cam.center[0], -cam.center[1]], 0.04);
      }
    }

    function drawArc(a) {
      const styles = {
        route: { color: C.route, width: 1.2, dash: [3, 4] },
        option: { color: "rgba(255,255,255,.45)", width: 1.3, dash: [2, 4] },
        selected: { color: C.accent, width: 2.4, dash: [6, 4] },
        done: { color: a.color ? hexToRgba(a.color, 0.75) : "rgba(255,255,255,.6)", width: 2, dash: [] },
      };
      const s = styles[a.kind] || styles.route;
      ctx.beginPath();
      path({ type: "LineString", coordinates: [a.from, a.to] });
      ctx.setLineDash(s.dash);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawTrail(pl, p) {
      if (pl.trail === "none") return;
      const tail = pl.trail === "full" ? p : Math.min(p, 0.22);
      const coords = [];
      for (let k = 0; k <= 48; k++) coords.push(pl.interp(p - tail + (tail * k) / 48));
      ctx.beginPath();
      path({ type: "LineString", coordinates: coords });
      ctx.strokeStyle = pl.color || C.accent;
      ctx.lineWidth = pl.size > 20 ? 2.6 : 1.8;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    function drawPlane(pl, p) {
      const coord = pl.interp(p);
      const alpha = limbAlpha(coord);
      if (!alpha) return;
      const a = projection(coord);
      const b = projection(pl.interp(Math.min(p + 0.004, 1)));
      const size = pl.size || 18;
      const color = pl.color || C.accent;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(a[0], a[1]);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.9, 0, 2 * Math.PI);
      ctx.fillStyle = hexToRgba(color, 0.25);
      ctx.fill();
      ctx.rotate(Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2);
      ctx.scale(size / 24, size / 24);
      ctx.translate(-12, -12);
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = pl.color ? color : "#ffffff";
      ctx.fill(PLANE);
      if (pl.me) {
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke(PLANE);
      }
      ctx.restore();
    }

    function drawAirports() {
      ctx.textBaseline = "middle";
      (data.airports || []).forEach((ap) => {
        const c = [ap.lon, ap.lat];
        const alpha = limbAlpha(c);
        if (!alpha) return;
        const [x, y] = projection(c);
        const kind = ap.kind || "main";
        ctx.globalAlpha = alpha * (kind === "dim" ? 0.45 : 1);
        const r = { current: 5, main: 3.6, visited: 3.6, minor: 2.4, dim: 2.2 }[kind] || 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = kind === "visited" ? C.accent : kind === "minor" || kind === "dim" ? "rgba(255,255,255,.6)" : "#fff";
        ctx.fill();
        if (kind === "current" || kind === "main" || kind === "visited") {
          ctx.beginPath();
          ctx.arc(x, y, kind === "current" ? 10 : 7, 0, 2 * Math.PI);
          ctx.strokeStyle = kind === "current" ? C.accent : "rgba(255,255,255,.35)";
          ctx.lineWidth = kind === "current" ? 2 : 1;
          ctx.stroke();
        }
        if (kind !== "dim" || zoom > 1.6) {
          ctx.font = `700 ${kind === "current" ? 13 : 11}px "JetBrains Mono", monospace`;
          ctx.fillStyle = C.text;
          ctx.fillText(ap.code, x + (kind === "current" ? 13 : 9), y - 1);
        }
      });
      ctx.globalAlpha = 1;
    }

    function draw(now) {
      zoom += (targetZoom - zoom) * 0.15;
      const live = planes
        .map((plane) => ({ plane, p: progressOf(plane, now) }))
        .filter((s) => s.p > 0 && s.p < 1);
      autoCamera(now, live);

      const radius = baseRadius * zoom;
      const cx = width / 2, cy = height / 2;
      projection.scale(radius).translate([cx, cy]).rotate(rotation);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.12);
      halo.addColorStop(0, C.halo);
      halo.addColorStop(1, "rgba(90,150,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.12, 0, 2 * Math.PI);
      ctx.fill();

      const ocean = ctx.createRadialGradient(cx - radius * 0.4, cy - radius * 0.45, radius * 0.05, cx, cy, radius);
      ocean.addColorStop(0, C.oceanLight);
      ocean.addColorStop(1, C.oceanDark);
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = C.graticule;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      if (world) {
        ctx.beginPath();
        path(world.land);
        ctx.fillStyle = C.land;
        ctx.fill();
        ctx.beginPath();
        path(world.borders);
        ctx.strokeStyle = C.landEdge;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      (data.arcs || []).forEach(drawArc);
      live.forEach((s) => drawTrail(s.plane, s.p));
      drawAirports();
      live.forEach((s) => drawPlane(s.plane, s.p));
    }

    function loop(now) {
      if (!visible) { running = false; return; }
      draw(now);
      requestAnimationFrame(loop);
    }
    function start() {
      if (!running) { running = true; requestAnimationFrame(loop); }
    }

    // --- Управление: перетаскивание, клик по аэропорту, кнопки масштаба ---
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      dragging = { x: e.clientX, y: e.clientY, rot: rotation.slice(), moved: false };
      root.classList.add("is-dragging");
      lastInteraction = performance.now();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) dragging.moved = true;
      const k = 180 / (Math.PI * projection.scale());
      rotation = [dragging.rot[0] + dx * k, clamp(dragging.rot[1] - dy * k, -85, 85), 0];
      lastInteraction = performance.now();
      root.classList.add("was-touched");
    });
    canvas.addEventListener("pointerup", (e) => {
      if (dragging && !dragging.moved) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        let best = null, bestD = 16;
        (data.airports || []).forEach((ap) => {
          if (!limbAlpha([ap.lon, ap.lat])) return;
          const [px, py] = projection([ap.lon, ap.lat]);
          const d = Math.hypot(px - x, py - y);
          if (d < bestD) { best = ap; bestD = d; }
        });
        if (best) root.dispatchEvent(new CustomEvent("globe:airport", { detail: best.code, bubbles: true }));
      }
      dragging = null;
      root.classList.remove("is-dragging");
      lastInteraction = performance.now();
    });
    canvas.addEventListener("pointercancel", () => { dragging = null; root.classList.remove("is-dragging"); });

    root.querySelectorAll("[data-zoom]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.zoom === "reset") {
          targetZoom = 1;
          lastInteraction = -Infinity;
        } else {
          targetZoom = clamp(targetZoom * (btn.dataset.zoom === "in" ? 1.35 : 1 / 1.35), 0.7, 4);
          lastInteraction = performance.now();
        }
      })
    );

    prepare(initial);
    const cam = initial.camera || {};
    const firstFollow = planes.find((p) => p.follow);
    const c = cam.center || (firstFollow ? firstFollow.interp(0.5) : null);
    if (c) rotation = [-c[0], clamp(-c[1], -60, 60), 0];

    new ResizeObserver(resize).observe(canvas);
    resize();
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }).observe(canvas);
    loadWorld(root.dataset.world).then((w) => { world = w; });
    start();

    return {
      update(d) { prepare(d); },
      focus(center) { lastInteraction = -Infinity; data.camera = { ...(data.camera || {}), center }; },
    };
  }

  window.SkyGlobe = { mount };

  document.querySelectorAll("[data-globe][data-config]").forEach((root) => {
    const cfg = JSON.parse(document.getElementById(root.dataset.config).textContent);
    mount(root, cfg);
  });
})();
