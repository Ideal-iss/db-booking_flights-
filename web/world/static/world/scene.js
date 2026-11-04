/* Рисование мира SkyBook на <canvas>: персонажи, вещи, достопримечательности, самолёты.
   Всё нарисовано кодом — без картинок, поэтому быстро грузится и масштабируется. */
(function () {
  "use strict";

  const PAL = {
    skin: ["#f6d7b8", "#eec39a", "#d9a066", "#b97a48", "#8d5524", "#5c3a1e"],
    hair: ["#2b1d14", "#5a3a22", "#a0522d", "#e0b04a", "#e8e0cf", "#c0392b", "#3b5bdb"],
    top: ["#ff5a1f", "#3ecf8e", "#4da3ff", "#ffd23f", "#c77dff", "#ff6b9e", "#2ec4d6", "#1f2937", "#f8fafc"],
    bottom: ["#1f3a68", "#374151", "#7c5c3b", "#111827", "#6b7280", "#9f1239", "#065f46"],
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, "0");
    return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
  }

  /* Персонаж. (x, y) — точка между ступнями. opts: {scale, facing, phase, moving, sitting, back} */
  function drawAvatar(ctx, av, x, y, opts = {}) {
    av = av || {};
    const s = opts.scale || 1;
    const face = opts.facing === -1 ? -1 : 1;
    const t = opts.phase || 0;
    const walk = opts.moving ? Math.sin(t * 10) : 0;
    const bob = opts.moving ? Math.abs(Math.sin(t * 10)) * 1.6 : Math.sin(t * 2) * 0.6;
    const skin = PAL.skin[av.skin] || PAL.skin[1];
    const hairC = PAL.hair[av.hair_color] || PAL.hair[0];
    let topC = PAL.top[av.top] || PAL.top[0];
    const botC = PAL.bottom[av.bottom] || PAL.bottom[0];
    if (av.outfit === "uniform") topC = "#1e2f5c";
    if (av.outfit === "hoodie") topC = shade(topC, 0.85);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * face, s);

    if (!opts.sitting) {
      ctx.fillStyle = "rgba(0,0,0,.18)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 4.5, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.translate(0, -bob);

    // Воздушный шарик — за спиной
    if (av.extra === "balloon") {
      ctx.strokeStyle = "rgba(60,60,60,.6)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(11, -26);
      ctx.quadraticCurveTo(18, -48, 16, -70 + Math.sin(t * 2) * 2);
      ctx.stroke();
      ctx.fillStyle = "#ff4d6d";
      ctx.beginPath();
      ctx.ellipse(16, -80 + Math.sin(t * 2) * 2, 9, 11, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.beginPath();
      ctx.ellipse(13, -84 + Math.sin(t * 2) * 2, 2.5, 3.5, -0.4, 0, 2 * Math.PI);
      ctx.fill();
    }
    if (av.extra === "backpack") {
      ctx.fillStyle = "#8b5e34";
      rr(ctx, -15, -36, 9, 18, 3);
      ctx.fill();
    }

    // Ноги
    if (opts.sitting) {
      ctx.fillStyle = botC;
      rr(ctx, -9, -14, 18, 8, 3);
      ctx.fill();
      ctx.fillStyle = "#2d2d2d";
      rr(ctx, -9, -8, 7, 5, 2);
      ctx.fill();
      rr(ctx, 2, -8, 7, 5, 2);
      ctx.fill();
    } else {
      ctx.fillStyle = botC;
      rr(ctx, -8, -18 + walk * 1.5, 7, 15, 2.5);
      ctx.fill();
      rr(ctx, 1, -18 - walk * 1.5, 7, 15, 2.5);
      ctx.fill();
      ctx.fillStyle = "#2d2d2d";
      rr(ctx, -9, -4 + walk * 1.5, 8.5, 4.5, 2);
      ctx.fill();
      rr(ctx, 0.5, -4 - walk * 1.5, 8.5, 4.5, 2);
      ctx.fill();
    }

    // Туловище
    ctx.fillStyle = topC;
    rr(ctx, -11, -38, 22, 23, 7);
    ctx.fill();
    if (av.outfit === "hawaii") {
      ctx.fillStyle = "#ffe066";
      [[-6, -32], [4, -27], [-3, -21], [6, -35]].forEach(([fx, fy]) => {
        ctx.beginPath();
        ctx.arc(fx, fy, 2.2, 0, 2 * Math.PI);
        ctx.fill();
      });
      ctx.fillStyle = "#ff6b9e";
      [[2, -34], [-7, -25]].forEach(([fx, fy]) => {
        ctx.beginPath();
        ctx.arc(fx, fy, 1.8, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
    if (av.outfit === "uniform") {
      ctx.fillStyle = "#f4c542";
      ctx.fillRect(-11, -24, 22, 1.6);
      ctx.fillRect(-11, -21, 22, 1.6);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(-4, -38); ctx.lineTo(0, -31); ctx.lineTo(4, -38);
      ctx.fill();
    }
    if (av.outfit === "hoodie") {
      ctx.fillStyle = shade(topC, 0.8);
      rr(ctx, -6, -24, 12, 6, 2);
      ctx.fill();
    }
    // Руки
    ctx.fillStyle = shade(topC, 0.9);
    const arm = opts.sitting ? 0 : walk * 3;
    rr(ctx, -15, -36 - arm * 0.3, 5.5, 15, 2.5);
    ctx.fill();
    rr(ctx, 9.5, -36 + arm * 0.3, 5.5, 15, 2.5);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(-12.3, -21 - arm * 0.3, 2.8, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(12.3, -21 + arm * 0.3, 2.8, 0, 2 * Math.PI); ctx.fill();

    if (av.extra === "scarf") {
      ctx.fillStyle = "#e63946";
      rr(ctx, -10, -40, 20, 6, 3);
      ctx.fill();
      rr(ctx, 3, -37, 5, 12, 2);
      ctx.fill();
    }
    if (av.extra === "camera") {
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-7, -38); ctx.lineTo(5, -26); ctx.stroke();
      ctx.fillStyle = "#222"; rr(ctx, 1, -29, 10, 7, 2); ctx.fill();
      ctx.fillStyle = "#8ecae6"; ctx.beginPath(); ctx.arc(6, -25.5, 2.2, 0, 2 * Math.PI); ctx.fill();
    }

    // Голова
    const hy = -52;
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(0, hy, 14, 0, 2 * Math.PI);
    ctx.fill();
    // Волосы сзади (длинные)
    ctx.fillStyle = hairC;
    if (av.hair === "long") {
      rr(ctx, -15, hy - 6, 30, 26, 10);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.arc(0, hy + 1, 11.5, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = hairC;
    }
    // Лицо
    ctx.fillStyle = "#2b2b2b";
    ctx.beginPath(); ctx.arc(-4.5, hy + 1, 1.8, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(5.5, hy + 1, 1.8, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = "#7a3b2e"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(1, hy + 5, 3.2, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = "rgba(255,120,120,.35)";
    ctx.beginPath(); ctx.arc(-8, hy + 5, 2.5, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(9.5, hy + 5, 2.5, 0, 2 * Math.PI); ctx.fill();

    // Волосы спереди
    ctx.fillStyle = hairC;
    let h = av.hair || "short";
    // Под головным убором пышные причёски прячутся
    if (av.hat && (h === "spiky" || h === "curly" || h === "bun")) h = "short";
    if (h === "short" || h === "long") {
      ctx.beginPath(); ctx.arc(0, hy - 3, 14.5, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-5, hy - 7, 9, 5, -0.3, 0, 2 * Math.PI); ctx.fill();
    } else if (h === "bun") {
      ctx.beginPath(); ctx.arc(0, hy - 3, 14.5, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(0, hy - 18, 7, 0, 2 * Math.PI); ctx.fill();
    } else if (h === "spiky") {
      ctx.beginPath();
      ctx.moveTo(-15, hy - 2);
      for (let i = 0; i <= 6; i++) {
        const px = -15 + i * 5;
        ctx.lineTo(px + 2.5, hy - 22 + (i % 2) * 4);
        ctx.lineTo(px + 5, hy - 8);
      }
      ctx.lineTo(15, hy - 2);
      ctx.closePath();
      ctx.fill();
    } else if (h === "curly") {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 12, hy - 2 + Math.sin(a) * 12, 6, 0, 2 * Math.PI); ctx.fill();
      }
    }

    // Очки
    if (av.glasses === "sunglasses") {
      ctx.fillStyle = "#111";
      rr(ctx, -10, hy - 2.5, 8.5, 5.5, 2); ctx.fill();
      rr(ctx, 1.5, hy - 2.5, 8.5, 5.5, 2); ctx.fill();
      ctx.fillRect(-2, hy - 1.5, 4, 1.4);
    } else if (av.glasses === "round_glasses") {
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(-4.5, hy + 1, 4, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(5.5, hy + 1, 4, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.5, hy + 1); ctx.lineTo(1.5, hy + 1); ctx.stroke();
    }

    // Головные уборы
    const hat = av.hat;
    if (hat === "cap") {
      ctx.fillStyle = "#e63946";
      ctx.beginPath(); ctx.arc(0, hy - 5, 14.5, Math.PI, 2 * Math.PI); ctx.fill();
      rr(ctx, 2, hy - 7, 20, 4.5, 2); ctx.fill();
    } else if (hat === "beanie") {
      ctx.fillStyle = "#2a9d8f";
      ctx.beginPath(); ctx.arc(0, hy - 4, 15, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = "#e9c46a"; rr(ctx, -15, hy - 6, 30, 5, 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, hy - 20, 4, 0, 2 * Math.PI); ctx.fill();
    } else if (hat === "panama") {
      ctx.fillStyle = "#f1e3c6";
      ctx.beginPath(); ctx.ellipse(0, hy - 8, 20, 5, 0, 0, 2 * Math.PI); ctx.fill();
      rr(ctx, -11, hy - 20, 22, 13, 5); ctx.fill();
      ctx.fillStyle = "#3d5a80"; ctx.fillRect(-11, hy - 11, 22, 3);
    } else if (hat === "pilot") {
      ctx.fillStyle = "#1e2f5c";
      rr(ctx, -15, hy - 22, 30, 12, 5); ctx.fill();
      ctx.fillStyle = "#111"; rr(ctx, -13, hy - 11, 26, 4, 2); ctx.fill();
      ctx.fillStyle = "#f4c542"; ctx.beginPath(); ctx.arc(0, hy - 16, 3, 0, 2 * Math.PI); ctx.fill();
    } else if (hat === "cowboy") {
      ctx.fillStyle = "#8b5a2b";
      ctx.beginPath(); ctx.ellipse(0, hy - 9, 23, 5, 0, 0, 2 * Math.PI); ctx.fill();
      rr(ctx, -10, hy - 24, 20, 16, 6); ctx.fill();
      ctx.fillStyle = "#5c3a1e"; ctx.fillRect(-10, hy - 13, 20, 3);
    } else if (hat === "crown") {
      ctx.fillStyle = "#f4c542";
      ctx.beginPath();
      ctx.moveTo(-12, hy - 8); ctx.lineTo(-12, hy - 22); ctx.lineTo(-6, hy - 15); ctx.lineTo(0, hy - 25);
      ctx.lineTo(6, hy - 15); ctx.lineTo(12, hy - 22); ctx.lineTo(12, hy - 8); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e63946"; ctx.beginPath(); ctx.arc(0, hy - 12, 2.2, 0, 2 * Math.PI); ctx.fill();
    }
    ctx.restore();
  }

  function drawBubble(ctx, x, y, text, opts = {}) {
    ctx.save();
    ctx.font = opts.font || '600 13px "Manrope", sans-serif';
    const lines = [];
    let line = "";
    for (const word of String(text).split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 170 && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
    const hgt = lines.length * 17 + 10;
    const bx = x - w / 2, by = y - hgt - 10;
    ctx.fillStyle = opts.bg || "rgba(255,255,255,.96)";
    ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = 6;
    rr(ctx, bx, by, w, hgt, 9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 6, by + hgt); ctx.lineTo(x, by + hgt + 8); ctx.lineTo(x + 6, by + hgt); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#14213d";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    lines.forEach((l, i) => ctx.fillText(l, x, by + 6 + i * 17));
    ctx.restore();
  }

  function drawName(ctx, x, y, name, me) {
    ctx.save();
    ctx.font = '700 12px "Manrope", sans-serif';
    ctx.textAlign = "center";
    const w = ctx.measureText(name).width + 12;
    ctx.fillStyle = me ? "rgba(255,90,31,.92)" : "rgba(20,33,61,.75)";
    rr(ctx, x - w / 2, y, w, 18, 9); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x, y + 9.5);
    ctx.restore();
  }

  /* Самолёт сверху: нос смотрит вправо. */
  function drawPlaneTop(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = color || "#f3f5f9";
    ctx.strokeStyle = "rgba(0,0,0,.15)";
    ctx.lineWidth = 1;
    // крылья
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-22, -42); ctx.lineTo(-12, -42); ctx.lineTo(14, 0);
    ctx.lineTo(-12, 42); ctx.lineTo(-22, 42); ctx.closePath(); ctx.fill(); ctx.stroke();
    // хвост
    ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(-54, -16); ctx.lineTo(-48, -16); ctx.lineTo(-36, 0);
    ctx.lineTo(-48, 16); ctx.lineTo(-54, 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    // фюзеляж
    rr(ctx, -56, -6, 104, 12, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ff5a1f"; ctx.fillRect(-54, -2, 8, 4);
    ctx.fillStyle = "#1d3a6e"; ctx.beginPath(); ctx.ellipse(40, 0, 5, 3.5, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
  }

  // ---------- Достопримечательности. (x, y) — середина основания ----------
  const LM = {
    lattice(ctx, t, red) {
      ctx.strokeStyle = red ? "#d62828" : "#7a5c3a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-14, -60, -5, -190); ctx.lineTo(5, -190);
      ctx.quadraticCurveTo(14, -60, 50, 0); ctx.stroke();
      ctx.lineWidth = 1.2;
      for (let yy = -20; yy > -180; yy -= 14) {
        const w = 44 * Math.pow((yy + 200) / 200, 2.2);
        ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(w, yy - 12); ctx.moveTo(w, yy); ctx.lineTo(-w, yy - 12); ctx.stroke();
      }
      ctx.fillStyle = red ? "#f8f9fa" : "#7a5c3a";
      ctx.fillRect(-24, -62, 48, 6); ctx.fillRect(-14, -120, 28, 5);
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.quadraticCurveTo(0, -40, 30, 0); ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = red ? "#d62828" : "#5c4430"; ctx.fillRect(-2, -215, 4, 25);
    },
    lattice_red(ctx, t) { LM.lattice(ctx, t, true); },
    statue(ctx, t) {
      ctx.fillStyle = "#c9b28d"; ctx.fillRect(-36, -50, 72, 50); ctx.fillRect(-28, -70, 56, 22);
      ctx.fillStyle = "#6fb5a1";
      rr(ctx, -16, -150, 32, 82, 12); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -162, 12, 0, 2 * Math.PI); ctx.fill();
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 5, -172); ctx.lineTo(i * 8, -186); ctx.lineTo(i * 5 + 3, -172); ctx.fill(); }
      rr(ctx, 10, -200, 8, 60, 4); ctx.fill();
      ctx.fillStyle = "#ffb703"; ctx.beginPath(); ctx.ellipse(14, -206 + Math.sin(t * 6) * 1.5, 6, 9, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = "#5a9e8a"; rr(ctx, -24, -120, 10, 30, 4); ctx.fill();
    },
    wheel(ctx, t) {
      const cy = -100, R = 82;
      ctx.strokeStyle = "#e9ecef"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(0, cy); ctx.lineTo(40, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, cy, R, 0, 2 * Math.PI); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 12; i++) {
        const a = t * 0.3 + (i / 12) * Math.PI * 2;
        ctx.strokeStyle = "#ced4da";
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
        ctx.fillStyle = ["#ff5a1f", "#ffd23f", "#4da3ff", "#3ecf8e"][i % 4];
        rr(ctx, Math.cos(a) * R - 7, cy + Math.sin(a) * R - 2, 14, 12, 3); ctx.fill();
      }
      ctx.fillStyle = "#adb5bd"; ctx.beginPath(); ctx.arc(0, cy, 8, 0, 2 * Math.PI); ctx.fill();
    },
    skyscraper(ctx) {
      const g = ctx.createLinearGradient(-30, 0, 30, 0);
      g.addColorStop(0, "#9fb6cf"); g.addColorStop(0.5, "#e2ecf6"); g.addColorStop(1, "#7f98b5");
      ctx.fillStyle = g;
      const tiers = [[34, 60], [27, 55], [20, 50], [14, 45], [8, 40]];
      let yy = 0;
      tiers.forEach(([w, h]) => { ctx.fillRect(-w, yy - h, w * 2, h); yy -= h; });
      ctx.fillRect(-2, yy - 40, 4, 40);
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1;
      for (let i = -30; i > yy; i -= 10) { ctx.beginPath(); ctx.moveTo(-6, i); ctx.lineTo(6, i); ctx.stroke(); }
    },
    supertrees(ctx, t) {
      [[-50, 110], [0, 150], [50, 120]].forEach(([dx, h], i) => {
        ctx.fillStyle = "#6b4f7a"; ctx.beginPath(); ctx.moveTo(dx - 6, 0); ctx.lineTo(dx - 3, -h); ctx.lineTo(dx + 3, -h); ctx.lineTo(dx + 6, 0); ctx.fill();
        ctx.strokeStyle = "#9d4edd"; ctx.lineWidth = 2;
        for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + (k - 3.5) * 0.28; ctx.beginPath(); ctx.moveTo(dx, -h + 10); ctx.lineTo(dx + Math.cos(a) * 34, -h + 10 + Math.sin(a) * 26); ctx.stroke(); }
        ctx.fillStyle = `hsla(${(t * 40 + i * 90) % 360}, 80%, 60%, .55)`;
        ctx.beginPath(); ctx.ellipse(dx, -h - 4, 32, 10, 0, 0, 2 * Math.PI); ctx.fill();
      });
    },
    opera(ctx) {
      ctx.fillStyle = "#e9d8a6"; ctx.fillRect(-90, -16, 180, 16);
      ctx.fillStyle = "#fdfdfd"; ctx.strokeStyle = "#d0d6de"; ctx.lineWidth = 1.5;
      [[-70, 50], [-40, 70], [-8, 95], [26, 80], [56, 58]].forEach(([dx, h]) => {
        ctx.beginPath(); ctx.moveTo(dx - 28, -16); ctx.quadraticCurveTo(dx - 12, -16 - h, dx + 22, -16 - h); ctx.quadraticCurveTo(dx + 8, -50, dx + 26, -16); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    },
    clocktower(ctx, t) {
      ctx.fillStyle = "#d4b483"; ctx.fillRect(-20, -170, 40, 170);
      ctx.fillStyle = "#c19a5b"; for (let yy = -160; yy < 0; yy += 20) ctx.fillRect(-20, yy, 40, 3);
      ctx.fillStyle = "#3d405b"; ctx.beginPath(); ctx.moveTo(-22, -170); ctx.lineTo(0, -230); ctx.lineTo(22, -170); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, -145, 14, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = "#222"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -145);
      ctx.lineTo(Math.cos(t * 0.5) * 10, -145 + Math.sin(t * 0.5) * 10); ctx.moveTo(0, -145); ctx.lineTo(0, -153); ctx.stroke();
      ctx.fillStyle = "#c9a227"; ctx.fillRect(-2, -244, 4, 16);
    },
    houses(ctx) {
      ["#f4a261", "#e9c46a", "#e76f51", "#90be6d", "#f1faee"].forEach((c, i) => {
        const dx = -100 + i * 42, h = 70 + (i % 2) * 18;
        ctx.fillStyle = c; ctx.fillRect(dx, -h, 40, h);
        ctx.strokeStyle = "#5c3a1e"; ctx.lineWidth = 2; ctx.strokeRect(dx, -h, 40, h);
        ctx.beginPath(); ctx.moveTo(dx, -h + 25); ctx.lineTo(dx + 40, -h + 25); ctx.moveTo(dx, -h); ctx.lineTo(dx + 40, -h + 25); ctx.moveTo(dx + 40, -h); ctx.lineTo(dx, -h + 25); ctx.stroke();
        ctx.fillStyle = "#7f3d27"; ctx.beginPath(); ctx.moveTo(dx - 3, -h); ctx.lineTo(dx + 20, -h - 34); ctx.lineTo(dx + 43, -h); ctx.fill();
        ctx.fillStyle = "#cde7f0"; ctx.fillRect(dx + 8, -h + 35, 9, 12); ctx.fillRect(dx + 23, -h + 35, 9, 12);
      });
    },
    windmill(ctx, t) {
      ctx.fillStyle = "#4ea8de"; ctx.fillRect(-110, -10, 220, 10);
      ctx.fillStyle = "#8d6e63"; ctx.beginPath(); ctx.moveTo(-26, -10); ctx.lineTo(-14, -120); ctx.lineTo(14, -120); ctx.lineTo(26, -10); ctx.fill();
      ctx.fillStyle = "#5d4037"; ctx.beginPath(); ctx.moveTo(-18, -120); ctx.lineTo(0, -145); ctx.lineTo(18, -120); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-6, -40, 12, 30);
      ctx.save(); ctx.translate(0, -125); ctx.rotate(t * 0.8);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = "#6d4c41"; ctx.fillRect(-2, 0, 4, 72);
        ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fillRect(2, 14, 14, 56);
      }
      ctx.restore();
      ctx.fillStyle = "#f94144"; [[-80, -14], [-62, -14], [64, -14], [82, -14]].forEach(([dx]) => { ctx.beginPath(); ctx.arc(dx, -14, 5, 0, 2 * Math.PI); ctx.fill(); });
    },
    temple_round(ctx) {
      ctx.fillStyle = "#f1f1f1"; ctx.fillRect(-80, -14, 160, 14); ctx.fillRect(-64, -26, 128, 12);
      ctx.fillStyle = "#b5442c"; ctx.fillRect(-44, -76, 88, 50);
      [[56, -76], [46, -112], [34, -146]].forEach(([w, yy], i) => {
        ctx.fillStyle = "#1d4e89"; ctx.beginPath(); ctx.ellipse(0, yy, w, 12, 0, Math.PI, 2 * Math.PI); ctx.fill(); ctx.fillRect(-w, yy, w * 2, 4);
        if (i < 2) { ctx.fillStyle = "#b5442c"; ctx.fillRect(-w + 14, yy - 34, (w - 14) * 2, 22); }
      });
      ctx.fillStyle = "#e0a100"; ctx.beginPath(); ctx.arc(0, -166, 7, 0, 2 * Math.PI); ctx.fill();
    },
    skyline(ctx, t) {
      [[-110, 26, 90, "#4361ee"], [-80, 22, 140, "#3a0ca3"], [-50, 28, 110, "#4895ef"], [-16, 30, 190, "#560bad"],
       [22, 24, 120, "#4cc9f0"], [52, 26, 160, "#3f37c9"], [86, 22, 100, "#4361ee"]].forEach(([dx, w, h, c], i) => {
        ctx.fillStyle = c; ctx.fillRect(dx, -h, w, h);
        ctx.fillStyle = `rgba(255,236,150,${0.5 + 0.4 * Math.sin(t * 2 + i)})`;
        for (let yy = -h + 8; yy < -6; yy += 12) for (let xx = dx + 4; xx < dx + w - 4; xx += 8) ctx.fillRect(xx, yy, 3, 4);
      });
      ctx.fillStyle = "#48b5c4"; ctx.fillRect(-120, -4, 240, 8);
    },
    pagoda(ctx) {
      ctx.fillStyle = "#c9b79c"; ctx.fillRect(-90, -16, 180, 16);
      ctx.fillStyle = "#b23a48"; ctx.fillRect(-60, -70, 120, 54);
      for (let i = -50; i <= 50; i += 20) { ctx.fillStyle = "#8a2b38"; ctx.fillRect(i - 3, -70, 6, 54); }
      [[90, -70], [66, -110]].forEach(([w, yy]) => {
        ctx.fillStyle = "#2f3e46"; ctx.beginPath(); ctx.moveTo(-w, yy); ctx.quadraticCurveTo(-w + 20, yy - 30, 0, yy - 34); ctx.quadraticCurveTo(w - 20, yy - 30, w, yy); ctx.closePath(); ctx.fill();
      });
      ctx.fillStyle = "#b23a48"; ctx.fillRect(-40, -108, 80, 6);
    },
    stupa(ctx) {
      ctx.fillStyle = "#e9e3d5"; ctx.strokeStyle = "#c5b9a0"; ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const w = 70 - i * 11, h = 28 - i * 2, yy = -i * 26;
        ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(-w + 8, yy - h); ctx.lineTo(w - 8, yy - h); ctx.lineTo(w, yy); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = i % 2 ? "#f4a261" : "#90e0ef"; ctx.fillRect(-w + 12, yy - h / 2, (w - 12) * 2, 3); ctx.fillStyle = "#e9e3d5";
      }
      ctx.beginPath(); ctx.moveTo(-10, -156); ctx.lineTo(0, -210); ctx.lineTo(10, -156); ctx.fill(); ctx.stroke();
    },
    arch(ctx) {
      ctx.fillStyle = "#c97b63";
      ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(-60, -130); ctx.lineTo(60, -130); ctx.lineTo(60, 0); ctx.lineTo(28, 0);
      ctx.lineTo(28, -70); ctx.arc(0, -70, 28, 0, Math.PI, true); ctx.lineTo(-28, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b5654f"; ctx.fillRect(-66, -142, 132, 14); ctx.fillRect(-40, -156, 80, 14);
      ctx.fillStyle = "#e9c46a"; ctx.fillRect(-30, -120, 60, 6);
    },
    onion(ctx) {
      ctx.fillStyle = "#c0392b"; ctx.fillRect(-80, -70, 160, 70);
      ctx.fillStyle = "#f1f1f1"; for (let i = -70; i <= 70; i += 28) ctx.fillRect(i - 6, -60, 12, 20);
      [[-56, -70, 46, "#27ae60", "#f1c40f"], [-22, -96, 70, "#e67e22", "#2980b9"], [0, -120, 110, "#d4ac0d", "#c0392b"],
       [24, -96, 70, "#2e86c1", "#f1c40f"], [56, -70, 50, "#16a085", "#e74c3c"]].forEach(([dx, base, h, c1, c2]) => {
        ctx.fillStyle = "#e6b0aa"; ctx.fillRect(dx - 9, base - h + 30, 18, h - 30);
        ctx.fillStyle = c1;
        ctx.beginPath(); ctx.moveTo(dx - 15, base - h + 30); ctx.quadraticCurveTo(dx - 22, base - h + 6, dx, base - h - 8); ctx.quadraticCurveTo(dx + 22, base - h + 6, dx + 15, base - h + 30); ctx.fill();
        ctx.strokeStyle = c2; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(dx - 10, base - h + 24); ctx.quadraticCurveTo(dx, base - h + 4, dx + 10, base - h + 24); ctx.stroke();
        ctx.fillStyle = "#f4d03f"; ctx.fillRect(dx - 1, base - h - 20, 2, 14);
      });
    },
    domes(ctx) {
      ctx.fillStyle = "#d8a48f"; ctx.fillRect(-80, -60, 160, 60);
      ctx.fillStyle = "#b7887a"; ctx.beginPath(); ctx.arc(0, -60, 50, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(-50, -60, 22, Math.PI, 2 * Math.PI); ctx.fill(); ctx.beginPath(); ctx.arc(50, -60, 22, Math.PI, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = "#e9c46a"; ctx.fillRect(-2, -128, 4, 18);
      [[-100], [-88], [88], [100]].forEach(([dx]) => {
        ctx.fillStyle = "#ead7c3"; ctx.fillRect(dx - 4, -170, 8, 170);
        ctx.fillStyle = "#8d6e63"; ctx.beginPath(); ctx.moveTo(dx - 5, -170); ctx.lineTo(dx, -196); ctx.lineTo(dx + 5, -170); ctx.fill();
      });
    },
    pyramids(ctx) {
      [[-70, 70, 80, "#d9b26f"], [60, 90, 110, "#e0bb76"], [-5, 120, 150, "#e8c27f"]].forEach(([dx, w, h, c]) => {
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(dx - w, 0); ctx.lineTo(dx, -h); ctx.lineTo(dx + w, 0); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.beginPath(); ctx.moveTo(dx, -h); ctx.lineTo(dx + w, 0); ctx.lineTo(dx + w * 0.35, 0); ctx.fill();
      });
    },
    savanna(ctx, t) {
      ctx.fillStyle = "#6b4226"; ctx.fillRect(-46, -90, 8, 90);
      ctx.fillStyle = "#606c38"; ctx.beginPath(); ctx.ellipse(-42, -100, 64, 16, 0, 0, 2 * Math.PI); ctx.fill();
      // жираф
      const g = "#e9a23b";
      ctx.save(); ctx.translate(40, 0);
      ctx.fillStyle = g; rr(ctx, -24, -70, 48, 26, 10); ctx.fill();
      [-18, -8, 10, 18].forEach((lx) => ctx.fillRect(lx, -48, 5, 48));
      ctx.save(); ctx.translate(16, -66); ctx.rotate(-0.25 + Math.sin(t) * 0.05);
      ctx.fillRect(-4, -70, 10, 72); rr(ctx, -4, -86, 24, 14, 6); ctx.fill();
      ctx.fillStyle = "#6b4226"; ctx.fillRect(0, -92, 2, 7); ctx.fillRect(6, -92, 2, 7); ctx.restore();
      ctx.fillStyle = "#8c5a2b"; [[-12, -62], [4, -60], [-4, -52], [14, -54]].forEach(([sx, sy]) => { ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, 2 * Math.PI); ctx.fill(); });
      ctx.restore();
    },
    needle(ctx, t, tall) {
      const h = tall ? 230 : 190;
      ctx.fillStyle = "#cfd8dc"; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-6, -h); ctx.lineTo(6, -h); ctx.lineTo(14, 0); ctx.fill();
      ctx.fillStyle = "#90a4ae"; rr(ctx, -24, -h * 0.72, 48, 20, 8); ctx.fill();
      ctx.fillStyle = "#4fc3f7"; ctx.fillRect(-20, -h * 0.72 + 7, 40, 5);
      ctx.fillStyle = "#b0bec5"; ctx.fillRect(-2, -h - 40, 4, 40);
      ctx.fillStyle = `rgba(255,80,80,${0.5 + 0.5 * Math.sin(t * 4)})`; ctx.beginPath(); ctx.arc(0, -h - 42, 3, 0, 2 * Math.PI); ctx.fill();
    },
    needle_tall(ctx, t) { LM.needle(ctx, t, true); },
    bridge(ctx) {
      ctx.fillStyle = "#5ab4e5"; ctx.fillRect(-120, -8, 240, 8);
      ctx.fillStyle = "#adb5bd"; ctx.fillRect(-120, -26, 240, 8);
      ctx.strokeStyle = "#e9ecef"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(20, -170); ctx.moveTo(30, 0); ctx.lineTo(-20, -170); ctx.stroke();
      ctx.strokeStyle = "#f8f9fa"; ctx.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath(); ctx.moveTo(0, -150 + i * 10); ctx.lineTo(-115 + i * 10, -24);
        ctx.moveTo(0, -150 + i * 10); ctx.lineTo(115 - i * 10, -24); ctx.stroke();
      }
    },
    obelisk(ctx) {
      ctx.fillStyle = "#e9ecef"; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-9, -200); ctx.lineTo(0, -218); ctx.lineTo(9, -200); ctx.lineTo(14, 0); ctx.fill();
      ctx.fillStyle = "#ced4da"; ctx.beginPath(); ctx.moveTo(0, -218); ctx.lineTo(9, -200); ctx.lineTo(14, 0); ctx.lineTo(2, 0); ctx.fill();
      ctx.fillStyle = "#343a40"; ctx.fillRect(-3, -180, 6, 8);
    },
    mountain(ctx) {
      ctx.fillStyle = "#52796f"; ctx.beginPath(); ctx.moveTo(-120, 0); ctx.lineTo(-20, -150); ctx.lineTo(10, -130); ctx.lineTo(60, -170); ctx.lineTo(130, 0); ctx.fill();
      ctx.fillStyle = "#354f52"; ctx.beginPath(); ctx.moveTo(60, -170); ctx.lineTo(130, 0); ctx.lineTo(60, 0); ctx.fill();
      ctx.fillStyle = "#f8f9fa"; ctx.fillRect(48, -194, 24, 24);
      ctx.fillStyle = "#c1121f"; ctx.beginPath(); ctx.moveTo(44, -194); ctx.lineTo(60, -210); ctx.lineTo(76, -194); ctx.fill();
      ctx.fillStyle = "#ffd60a"; ctx.fillRect(58, -224, 4, 14); ctx.fillRect(54, -219, 12, 3);
    },
    step_pyramid(ctx) {
      for (let i = 0; i < 5; i++) {
        const w = 120 - i * 22, h = 26;
        ctx.fillStyle = i % 2 ? "#a68a64" : "#b89b72"; ctx.fillRect(-w, -(i + 1) * h, w * 2, h);
      }
      ctx.fillStyle = "#7f6a4f"; ctx.fillRect(-10, -130, 20, 130);
      ctx.fillStyle = "#936639"; ctx.fillRect(-20, -148, 40, 18);
    },
  };

  function drawLandmark(ctx, kind, x, y, t, scale) {
    const fn = LM[kind] || LM.obelisk;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale || 1, scale || 1);
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath(); ctx.ellipse(0, 4, 110, 16, 0, 0, 2 * Math.PI); ctx.fill();
    fn(ctx, t || 0);
    ctx.restore();
  }

  window.SkyArt = { PAL, rr, drawAvatar, drawBubble, drawName, drawPlaneTop, drawLandmark, shade };
})();
