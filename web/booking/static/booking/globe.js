/*
 * Интерактивный глобус с анимацией полёта.
 * Рисуется на <canvas> в ортографической проекции (d3-geo), карта — Natural Earth (world-atlas).
 * Глобус можно вращать мышью или пальцем, приближать кнопками +/−.
 * Самолёт летит по дуге большого круга — так же, как летают настоящие самолёты.
 */
(function () {
  "use strict";

  const COLORS = {
    oceanLight: "#1f4486",
    oceanDark: "#0a1a38",
    halo: "rgba(90, 150, 255, 0.28)",
    land: "#335a9c",
    landEdge: "rgba(255, 255, 255, 0.14)",
    graticule: "rgba(255, 255, 255, 0.07)",
    route: "rgba(255, 255, 255, 0.28)",
    accent: "#ff5a1f",
    text: "#eef2fb",
    dot: "#ffffff",
  };

  // Силуэт самолёта (тот же, что в логотипе), нос смотрит вверх, рамка 24×24.
  const PLANE = new Path2D(
    "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
  );

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

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (deg) => ((deg + 540) % 360) - 180;

  function initGlobe(root) {
    const canvas = root.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const cfg = JSON.parse(document.getElementById(root.dataset.config).textContent);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const routes = cfg.routes.map((r, i) => {
      const from = [r.from[0], r.from[1]];
      const to = [r.to[0], r.to[1]];
      const dist = d3.geoDistance(from, to); // в радианах
      return {
        from, to, dist,
        interp: d3.geoInterpolate(from, to),
        // Длинные перелёты анимируются дольше, но в разумных пределах.
        duration: clamp(4 + dist * 3.5, 5, 14),
        offset: cfg.routes.length > 1 ? i / cfg.routes.length : 0,
      };
    });
    const airports = cfg.airports;
    const single = routes.length === 1;

    const projection = d3.geoOrthographic().clipAngle(90).precision(0.4);
    const path = d3.geoPath(projection, ctx);
    const graticule = d3.geoGraticule10();

    // Стартовый поворот: на страницу рейса — середина маршрута, на главную — Европа/Азия.
    let rotation = [0, -25, 0];
    if (single) {
      const mid = routes[0].interp(0.5);
      rotation = [-mid[0], clamp(-mid[1], -60, 60), 0];
    } else if (cfg.center) {
      rotation = [-cfg.center[0], -cfg.center[1], 0];
    }

    let width = 0, height = 0, dpr = 1, baseRadius = 100, zoom = 1, targetZoom = 1;
    let world = null;
    let lastInteraction = -Infinity;
    let dragging = null;
    let running = false;
    let visible = true;
    const t0 = performance.now();

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      baseRadius = Math.min(width, height) / 2 - 14;
    }

    function progressOf(route, now) {
      if (cfg.progress != null) return cfg.progress; // рейс прямо сейчас в воздухе
      if (reduceMotion) return 0.5;
      const t = (now - t0) / 1000;
      return (t / route.duration + route.offset) % 1;
    }

    // Плавный взлёт и посадка: самолёт разгоняется и тормозит у аэропортов.
    const ease = (p) => (cfg.progress != null ? p : 0.5 - Math.cos(Math.PI * p) / 2);

    // Прозрачность у края глобуса: точки на обратной стороне скрыты, у горизонта плавно гаснут.
    function limbAlpha(coord) {
      const d = d3.geoDistance(coord, [-rotation[0], -rotation[1]]);
      return clamp((Math.PI / 2 - 0.05 - d) / 0.3, 0, 1);
    }

    function autoRotate(now, states) {
      const idle = now - lastInteraction > 2500;
      if (!idle || reduceMotion || dragging) return;
      if (single) {
        // Длинный маршрут не помещается на полушарии — камера следит за самолётом.
        const r = routes[0];
        const focus = r.dist > 1.7 ? r.interp(states[0].pos) : r.interp(0.5);
        const target = [-focus[0], clamp(-focus[1], -60, 60)];
        rotation = [
          rotation[0] + wrap(target[0] - rotation[0]) * 0.035,
          rotation[1] + (target[1] - rotation[1]) * 0.035,
          0,
        ];
      } else {
        rotation = [rotation[0] + 0.06, rotation[1] + (-25 - rotation[1]) * 0.01, 0];
      }
    }

    function drawPlane(coord, ahead, size) {
      const alpha = limbAlpha(coord);
      if (!alpha) return;
      const p = projection(coord);
      const q = projection(ahead);
      const angle = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p[0], p[1]);
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.9, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(255, 90, 31, 0.22)";
      ctx.fill();
      ctx.rotate(angle);
      ctx.scale(size / 24, size / 24);
      ctx.translate(-12, -12);
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,.45)";
      ctx.shadowBlur = 6;
      ctx.fill(PLANE);
      ctx.restore();
    }

    function draw(now) {
      zoom += (targetZoom - zoom) * 0.15;
      const states = routes.map((r) => ({ pos: ease(progressOf(r, now)) }));
      autoRotate(now, states);

      const radius = baseRadius * zoom;
      const cx = width / 2, cy = height / 2;
      projection.scale(radius).translate([cx, cy]).rotate(rotation);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Свечение атмосферы
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.12);
      halo.addColorStop(0, COLORS.halo);
      halo.addColorStop(1, "rgba(90,150,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.12, 0, 2 * Math.PI);
      ctx.fill();

      // Океан с объёмным освещением
      const ocean = ctx.createRadialGradient(cx - radius * 0.4, cy - radius * 0.45, radius * 0.05, cx, cy, radius);
      ocean.addColorStop(0, COLORS.oceanLight);
      ocean.addColorStop(1, COLORS.oceanDark);
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = COLORS.graticule;
      ctx.lineWidth = 0.6;
      ctx.stroke();

      if (world) {
        ctx.beginPath();
        path(world.land);
        ctx.fillStyle = COLORS.land;
        ctx.fill();
        ctx.beginPath();
        path(world.borders);
        ctx.strokeStyle = COLORS.landEdge;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Маршруты: пунктир всей дуги + яркий след за самолётом
      routes.forEach((r, i) => {
        ctx.beginPath();
        path({ type: "LineString", coordinates: [r.from, r.to] });
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = COLORS.route;
        ctx.lineWidth = single ? 1.5 : 1;
        ctx.stroke();
        ctx.setLineDash([]);

        const p = states[i].pos;
        const tail = single ? p : Math.min(p, 0.22);
        const steps = 48;
        const trail = [];
        for (let k = 0; k <= steps; k++) trail.push(r.interp(p - tail + (tail * k) / steps));
        ctx.beginPath();
        path({ type: "LineString", coordinates: trail });
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = single ? 2.6 : 1.8;
        ctx.lineCap = "round";
        ctx.stroke();
      });

      // Аэропорты
      ctx.font = `700 ${single ? 13 : 11}px "JetBrains Mono", monospace`;
      ctx.textBaseline = "middle";
      airports.forEach((a) => {
        const c = [a.lon, a.lat];
        const alpha = limbAlpha(c);
        if (!alpha) return;
        const [x, y] = projection(c);
        ctx.globalAlpha = alpha;
        const main = !single || a.main;
        ctx.beginPath();
        ctx.arc(x, y, main ? 3.6 : 2.4, 0, 2 * Math.PI);
        ctx.fillStyle = main ? COLORS.dot : "rgba(255,255,255,.55)";
        ctx.fill();
        if (main) {
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(255,255,255,.35)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = COLORS.text;
          ctx.fillText(a.code, x + 10, y - 1);
        }
        ctx.globalAlpha = 1;
      });

      // Самолёты поверх всего
      routes.forEach((r, i) => {
        const p = states[i].pos;
        drawPlane(r.interp(p), r.interp(Math.min(p + 0.004, 1)), single ? 26 : 17);
      });
    }

    function loop(now) {
      if (!visible) { running = false; return; }
      draw(now);
      requestAnimationFrame(loop);
    }
    function start() {
      if (!running) { running = true; requestAnimationFrame(loop); }
    }

    // --- Управление ---
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      dragging = { x: e.clientX, y: e.clientY, rot: rotation.slice() };
      root.classList.add("is-dragging");
      lastInteraction = performance.now();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      // Градусов на пиксель: поверхность «прилипает» к пальцу.
      const k = 180 / (Math.PI * projection.scale());
      rotation = [
        dragging.rot[0] + (e.clientX - dragging.x) * k,
        clamp(dragging.rot[1] - (e.clientY - dragging.y) * k, -85, 85),
        0,
      ];
      lastInteraction = performance.now();
      root.classList.add("was-touched");
    });
    const endDrag = () => { dragging = null; root.classList.remove("is-dragging"); lastInteraction = performance.now(); };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    root.querySelectorAll("[data-zoom]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const step = btn.dataset.zoom;
        if (step === "reset") {
          targetZoom = 1;
          lastInteraction = -Infinity; // сразу вернуть автопилот камеры
        } else {
          targetZoom = clamp(targetZoom * (step === "in" ? 1.35 : 1 / 1.35), 0.7, 4);
          lastInteraction = performance.now();
        }
      })
    );

    new ResizeObserver(resize).observe(canvas);
    resize();

    // Не тратим батарею, когда глобус не виден на экране.
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }).observe(canvas);

    loadWorld(root.dataset.world).then((w) => { world = w; });
    start();
  }

  document.querySelectorAll("[data-globe]").forEach(initGlobe);
})();
