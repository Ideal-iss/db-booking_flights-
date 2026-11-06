/**
 * Иконки предметов и навыков: пиксель-арт 32×32 из деталей с материалами (см. iconkit).
 * Предметы одного вида различаются по базе: короткий меч, длинный меч и палаш — разные картинки.
 */
import { BASE_BY_ID } from "@shared/data/items";
import { Icon, P, arc, circ, ell, itemCanvas, ln, mix, rect, rot, skillCanvas } from "./iconkit";
import { SKILL_ART, SKILL_COLORS } from "./skillArt";

const STEEL = "#b8bcc8", IRON = "#7a7e88", DARKSTEEL = "#4a4e5a", GOLD = "#d8a840", BRASS = "#b08a40";
const WOOD = "#8a5a32", DARKWOOD = "#4a3020", LEATHER = "#7a4a2a", DARKLEATHER = "#4a2a1a", BONE = "#e0d4b8";
const RUBY = "#d02a3a", SAPPHIRE = "#3a7ae0", EMERALD = "#3ac06a", AMETHYST = "#a05ae0";
const A45 = -Math.PI / 4;

type Painter = (ic: Icon, tint?: string) => string | void;

// ---------------------------------------------------------------- оружие

/** Меч по диагонали: рукоять снизу-слева, остриё сверху-справа. */
function sword(len: number, w: number, guard: string, pommelGem?: string, ornate = false): Painter {
  return (ic) => {
    const at = (f: () => void) => (g: CanvasRenderingContext2D) => rot(g, 11.5, 20.5, A45, f, 1.1);
    ic.part(LEATHER, "leather", (g) => at(() => rect(g, -7.5, -1.4, 6.5, 2.8))(g));
    ic.part(DARKLEATHER, "dark", (g) => at(() => { for (const x of [-6.5, -4.5, -2.5]) rect(g, x, -1.4, 0.9, 2.8); })(g), { outline: false });
    ic.part(STEEL, "metal", (g) => at(() => P(g, [1, -w, len, -w, len + 3.5, 0, len, w, 1, w]))(g));
    ic.part(mix(STEEL, "#5a6070", 0.55), "metal", (g) => at(() => rect(g, 2, -0.45, len - 3, 0.9))(g), { outline: false });
    ic.part(guard, guard === GOLD ? "gold" : "metal", (g) => at(() => {
      if (ornate) P(g, [-1.2, -6.5, 1.2, -5.5, 1.2, 5.5, -1.2, 6.5, -2.2, 4, -1.6, 0, -2.2, -4]);
      else rect(g, -1.3, -5, 2.6, 10);
    })(g));
    ic.part(pommelGem ? GOLD : guard, pommelGem ? "gold" : "metal", (g) => at(() => circ(g, -9.2, 0, 2.2))(g));
    if (pommelGem) ic.part(pommelGem, "gem", (g) => at(() => circ(g, -9.2, 0, 1.2))(g), { outline: false });
  };
}

function axe(kind: "hand" | "battle" | "exec"): Painter {
  return (ic) => {
    const at = (f: () => void) => (g: CanvasRenderingContext2D) => rot(g, 12, 20, A45, f, 1.2);
    ic.part(kind === "exec" ? DARKWOOD : WOOD, "wood", (g) => at(() => rect(g, -12, -1.1, 26, 2.2))(g));
    ic.part(DARKLEATHER, "leather", (g) => at(() => rect(g, -11, -1.4, 5, 2.8))(g));
    const steel = kind === "exec" ? DARKSTEEL : STEEL;
    if (kind === "hand") ic.part(steel, "metal", (g) => at(() => P(g, [7.5, -1.8, 12.5, -2, 14, 2, 16.5, 8.5, 12, 9.5, 9, 5, 7.5, 1.8]))(g));
    if (kind === "battle") ic.part(steel, "metal", (g) => at(() => P(g, [7.5, -1.5, 9, -4.5, 7.5, -9, 13, -8, 14, -2, 14, 2, 13, 8, 7.5, 9, 9, 4.5, 7.5, 1.5]))(g));
    if (kind === "exec") {
      ic.part(steel, "metal", (g) => at(() => P(g, [6, -1.6, 13, -2.5, 15, 2, 17.5, 10, 13, 12.5, 9, 9, 7, 4]))(g));
      ic.part("#9a1a20", "liquid", (g) => at(() => { P(g, [15.4, 6, 17.5, 10, 16.4, 10.8]); })(g), { outline: false });
    }
    ic.part(IRON, "metal", (g) => at(() => rect(g, 9.5, -2, 3, 4))(g));
  };
}

function mace(kind: "mace" | "star" | "flanged"): Painter {
  return (ic) => {
    const at = (f: () => void) => (g: CanvasRenderingContext2D) => rot(g, 11, 21, A45, f, 1.2);
    ic.part(WOOD, "wood", (g) => at(() => rect(g, -11, -1.1, 21, 2.2))(g));
    ic.part(LEATHER, "leather", (g) => at(() => rect(g, -10, -1.5, 6, 3))(g));
    ic.part(IRON, "metal", (g) => at(() => circ(g, -11, 0, 1.8))(g));
    if (kind === "mace") {
      ic.part(STEEL, "metal", (g) => at(() => { ell(g, 13, 0, 4.6, 4.2); })(g));
      ic.part(IRON, "metal", (g) => at(() => { for (const y of [-3.5, 0, 3.5]) rect(g, 9, y - 0.6, 9, 1.2); })(g), { outline: false });
    } else if (kind === "star") {
      ic.part(STEEL, "metal", (g) => at(() => {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P(g, [13 + Math.cos(a) * 7.5, Math.sin(a) * 7.5, 13 + Math.cos(a + 0.35) * 3.5, Math.sin(a + 0.35) * 3.5, 13 + Math.cos(a - 0.35) * 3.5, Math.sin(a - 0.35) * 3.5]); }
      })(g));
      ic.part(IRON, "metal", (g) => at(() => circ(g, 13, 0, 4.2))(g));
    } else {
      ic.part(STEEL, "metal", (g) => at(() => { for (const y of [-5.5, -2, 2, 5.5]) P(g, [8.5, y * 0.4 - 0.8, 18, y - 0.9, 18.5, y, 18, y + 0.9, 8.5, y * 0.4 + 0.8]); })(g));
      ic.part(GOLD, "gold", (g) => at(() => circ(g, 19, 0, 1.6))(g));
    }
  };
}

function dagger(kind: "dagger" | "kris" | "stiletto"): Painter {
  return (ic) => {
    const at = (f: () => void) => (g: CanvasRenderingContext2D) => rot(g, 12.5, 19.5, A45, f, 1.25);
    ic.part(kind === "stiletto" ? DARKLEATHER : LEATHER, "leather", (g) => at(() => rect(g, -7, -1.3, 6, 2.6))(g));
    if (kind === "dagger") ic.part(STEEL, "metal", (g) => at(() => P(g, [1, -2, 10, -2, 14, 0, 10, 2, 1, 2]))(g));
    if (kind === "kris") ic.part(STEEL, "metal", (g) => at(() => {
      const top: number[] = [], bot: number[] = [];
      for (let i = 0; i <= 6; i++) { const x = 1 + i * 2, o = Math.sin(i * 1.6) * 1.2; top.push(x, -1.8 + o); bot.unshift(x, 1.8 + o); }
      P(g, [...top, 16, 0.4, ...bot]);
    })(g));
    if (kind === "stiletto") ic.part(STEEL, "metal", (g) => at(() => P(g, [1, -1, 14, -0.6, 17, 0, 14, 0.6, 1, 1]))(g));
    ic.part(kind === "dagger" ? IRON : GOLD, kind === "dagger" ? "metal" : "gold", (g) => at(() => P(g, [-1.4, -4.5, 1.2, -3.5, 1.2, 3.5, -1.4, 4.5]))(g));
    ic.part(kind === "kris" ? EMERALD : GOLD, kind === "kris" ? "gem" : "gold", (g) => at(() => circ(g, -8.3, 0, 1.8))(g));
  };
}

function bow(kind: "short" | "long" | "war"): Painter {
  return (ic) => {
    const s = kind === "short" ? 0.85 : 1;
    const a = [5 + (1 - s) * 8, 8 + (1 - s) * 6], b = [24 - (1 - s) * 6, 27 - (1 - s) * 8], cc = [27, 5];
    // стрела на тетиве
    ic.part(WOOD, "wood", (g) => ln(g, 9, 23, 25, 7, 1.3));
    ic.part(STEEL, "metal", (g) => P(g, [24, 5, 28, 4, 27, 8]));
    ic.part(kind === "war" ? "#2a2a2a" : RUBY, "cloth", (g) => P(g, [8.5, 21.5, 6, 21, 8, 26, 10.5, 24.5]));
    ic.part(BONE, "flat", (g) => ln(g, a[0], a[1], b[0], b[1], 0.9), { outline: false });
    ic.part(kind === "war" ? DARKWOOD : WOOD, "wood", (g) => {
      g.lineWidth = kind === "long" ? 2.2 : 2.6;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.quadraticCurveTo(cc[0], cc[1], b[0], b[1]);
      g.stroke();
    });
    ic.part(kind === "war" ? DARKLEATHER : LEATHER, "leather", (g) => ell(g, 20.5, 11.5, 2.2, 1.8, -0.8));
    if (kind === "war") for (const [x, y] of [a, b]) ic.part(STEEL, "metal", (g) => circ(g, x, y, 1.6));
    if (kind === "long") ic.part(GOLD, "gold", (g) => { circ(g, a[0] + 1, a[1] - 0.5, 1.2); circ(g, b[0] + 0.5, b[1] - 1, 1.2); });
  };
}

function staff(kind: "oak" | "rune" | "archon"): Painter {
  return (ic) => {
    ic.part(kind === "archon" ? DARKWOOD : WOOD, "wood", (g) => ln(g, 5, 29, 22, 10, 2.4));
    ic.part(kind === "archon" ? GOLD : LEATHER, kind === "archon" ? "gold" : "leather", (g) => ln(g, 11.5, 21.8, 14, 19, 3));
    if (kind === "oak") {
      ic.part(WOOD, "wood", (g) => { circ(g, 23.5, 8, 3.8); ln(g, 23, 8, 27, 3.5, 1.6); ln(g, 23, 8, 19, 4, 1.4); });
      ic.part(EMERALD, "cloth", (g) => { ell(g, 27.5, 6, 2.2, 1.3, 0.6); ell(g, 18, 6, 2, 1.2, -0.5); ell(g, 26, 11.5, 1.8, 1.1, 0.3); });
    }
    if (kind === "rune") {
      ic.part(IRON, "metal", (g) => { ln(g, 21, 11, 20, 4, 1.4); ln(g, 21, 11, 27.5, 10, 1.4); ln(g, 21, 11, 26, 4.5, 1.2); });
      ic.part("#7ad0ff", "gem", (g) => P(g, [24, 2.5, 27, 6.5, 24, 10.5, 21, 6.5]));
      return "#7ad0ff";
    }
    if (kind === "archon") {
      ic.part(GOLD, "gold", (g) => { arc(g, 24, 7.5, 5.5, 0.6, 3.9, 1.6); });
      ic.part(AMETHYST, "gem", (g) => circ(g, 24, 7.5, 3.2));
      return "#c07aff";
    }
  };
}

function wand(kind: "bone" | "grave" | "lich"): Painter {
  return (ic) => {
    const shaft = kind === "bone" ? BONE : kind === "grave" ? DARKWOOD : "#2a2430";
    ic.part(shaft, kind === "bone" ? "bone" : "wood", (g) => ln(g, 7, 27, 21, 11, 2));
    if (kind === "bone") ic.part(BONE, "bone", (g) => { circ(g, 7, 27, 2.2); circ(g, 14, 19, 1.8); circ(g, 22, 10, 2.6); });
    if (kind === "grave") {
      ic.part(BONE, "bone", (g) => { circ(g, 22.5, 9, 4); rect(g, 20, 11, 5, 3); });
      ic.part("#1a0e08", "flat", (g) => { rect(g, 20.5, 8, 1.6, 1.8); rect(g, 23.3, 8, 1.6, 1.8); }, { outline: false });
      ic.dot(21, 9, "#7aff7a"); ic.dot(24, 9, "#7aff7a");
      return "#6aff6a";
    }
    if (kind === "lich") {
      ic.part(GOLD, "gold", (g) => { ln(g, 10.5, 23, 12, 21.3, 2.8); ln(g, 18, 14.4, 19.4, 12.8, 2.8); });
      ic.part(AMETHYST, "gem", (g) => P(g, [23, 3, 26.5, 8, 23.5, 13.5, 20, 8.5]));
      return "#c07aff";
    }
  };
}

// ---------------------------------------------------------------- щиты и второе оружие

function shield(kind: "buckler" | "kite" | "tower"): Painter {
  return (ic) => {
    if (kind === "buckler") {
      ic.part(WOOD, "wood", (g) => circ(g, 16, 16, 11));
      ic.part(IRON, "metal", (g) => arc(g, 16, 16, 11, 0, Math.PI * 2, 2.2));
      ic.part(STEEL, "metal", (g) => circ(g, 16, 16, 4));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; ic.dot(16 + Math.cos(a) * 8, 16 + Math.sin(a) * 8, "#d8dce4"); }
    }
    if (kind === "kite") {
      ic.part(STEEL, "metal", (g) => P(g, [5, 4, 27, 4, 27, 14, 16, 29, 5, 14]));
      ic.part("#8a2028", "cloth", (g) => P(g, [7.5, 6.5, 24.5, 6.5, 24.5, 13.5, 16, 25.5, 7.5, 13.5]), { outline: false });
      ic.part("#e8dcc0", "cloth", (g) => { rect(g, 14.5, 6.5, 3, 18); rect(g, 7.5, 11, 17, 3); }, { outline: false });
    }
    if (kind === "tower") {
      ic.part(WOOD, "wood", (g) => { P(g, [6, 7, 16, 3, 26, 7, 26, 28, 6, 28]); });
      ic.part(IRON, "metal", (g) => { rect(g, 6, 11, 20, 2.2); rect(g, 6, 21, 20, 2.2); ln(g, 6, 7, 16, 3, 2); ln(g, 16, 3, 26, 7, 2); });
      ic.part(GOLD, "gold", (g) => circ(g, 16, 16.5, 3.4));
      for (const x of [8, 13, 19, 24]) { ic.dot(x, 12, "#e0e4ec"); ic.dot(x, 22, "#e0e4ec"); }
    }
  };
}

function tome(kind: "tome" | "grimoire"): Painter {
  return (ic) => {
    const cover = kind === "tome" ? "#8a2a2a" : "#3a2448";
    ic.part(BONE, "bone", (g) => P(g, [9, 6, 26, 5, 27, 27, 10, 28]));
    ic.part(cover, "leather", (g) => P(g, [6, 6, 23, 5, 24, 27, 7, 28]));
    ic.part(mix(cover, "#000000", 0.4), "leather", (g) => rect(g, 6, 6, 2.5, 22), { outline: false });
    if (kind === "tome") {
      ic.part(GOLD, "gold", (g) => { arc(g, 15.5, 16, 5, 0, Math.PI * 2, 1.4); rect(g, 22, 14, 4, 4); });
      ic.part(RUBY, "gem", (g) => circ(g, 15.5, 16, 2.4));
    } else {
      ic.part(IRON, "metal", (g) => { ln(g, 5, 11, 27, 19, 1.4); ln(g, 5, 21, 27, 13, 1.4); });
      ic.part("#e0d040", "glow", (g) => ell(g, 15.5, 16, 4.5, 2.6));
      ic.part("#1a0a20", "flat", (g) => circ(g, 15.5, 16, 1.5), { outline: false });
      return "#b06aff";
    }
  };
}

function skullIcon(kind: "focus" | "lich"): Painter {
  return (ic) => {
    if (kind === "lich") ic.part(GOLD, "gold", (g) => P(g, [7, 9, 9, 3, 12, 7, 16, 2, 20, 7, 23, 3, 25, 9]));
    ic.part(BONE, "bone", (g) => { circ(g, 16, 14, 9); rect(g, 10, 17, 12, 8); });
    ic.part("#1a120c", "flat", (g) => { ell(g, 12.3, 15, 2.6, 2.8); ell(g, 19.7, 15, 2.6, 2.8); P(g, [16, 18, 14.5, 21, 17.5, 21]); }, { outline: false });
    ic.part(mix(BONE, "#000000", 0.25), "bone", (g) => { for (const x of [11.5, 14.2, 16.9, 19.6]) rect(g, x, 23, 1.6, 3); }, { outline: false });
    const eye = kind === "focus" ? "#7aff7a" : "#d07aff";
    ic.dot(12, 15, eye); ic.dot(13, 15, eye); ic.dot(19, 15, eye); ic.dot(20, 15, eye);
    return eye;
  };
}

function symbol(kind: "holy" | "reliquary"): Painter {
  return (ic) => {
    if (kind === "holy") {
      ic.part(BRASS, "gold", (g) => arc(g, 16, 4, 7, 0.2, Math.PI - 0.2, 1));
      ic.part(GOLD, "gold", (g) => { rect(g, 14, 7, 4, 21); rect(g, 7.5, 12, 17, 4); });
      ic.part(RUBY, "gem", (g) => circ(g, 16, 14, 2.2));
      return "#ffe9a0";
    }
    ic.part(GOLD, "gold", (g) => { P(g, [7, 13, 16, 7, 25, 13]); rect(g, 7, 13, 18, 14); });
    ic.part("#fff3a0", "glow", (g) => rect(g, 11, 16, 10, 7), { outline: false });
    ic.part(GOLD, "gold", (g) => { rect(g, 15, 2, 2, 8); rect(g, 12.5, 4, 7, 2); });
    ic.part(SAPPHIRE, "gem", (g) => circ(g, 16, 19.5, 1.8));
    return "#ffe9a0";
  };
}

// ---------------------------------------------------------------- доспехи

function helmet(kind: "cap" | "iron" | "great"): Painter {
  return (ic) => {
    if (kind === "cap") {
      ic.part(LEATHER, "leather", (g) => { g.beginPath(); g.arc(16, 18, 10, Math.PI, 0); g.fill(); rect(g, 6, 18, 20, 4); });
      ic.part(DARKLEATHER, "leather", (g) => { rect(g, 5, 19, 22, 3.5); rect(g, 15, 8, 2, 11); });
      for (const x of [8, 12, 20, 24]) ic.dot(x, 20, "#c9a46a");
    }
    if (kind === "iron") {
      ic.part(STEEL, "metal", (g) => { g.beginPath(); g.arc(16, 17, 10, Math.PI, 0); g.fill(); rect(g, 6, 17, 20, 7); });
      ic.part(IRON, "metal", (g) => { rect(g, 5, 16, 22, 3); rect(g, 14.5, 16, 3, 12); });
      ic.part("#140e0a", "flat", (g) => { rect(g, 8, 20, 5.5, 3); rect(g, 18.5, 20, 5.5, 3); }, { outline: false });
    }
    if (kind === "great") {
      ic.part(STEEL, "metal", (g) => { P(g, [6, 7, 10, 4, 22, 4, 26, 7, 26, 28, 6, 28]); });
      ic.part("#0e0a08", "flat", (g) => { rect(g, 7, 13, 18, 2.5); for (let i = 0; i < 4; i++) { rect(g, 9 + i * 2, 20, 1, 1.2); rect(g, 18 + i * 2, 20, 1, 1.2); } }, { outline: false });
      ic.part(GOLD, "gold", (g) => { rect(g, 15, 5, 2, 23); rect(g, 6, 16, 20, 1.6); });
    }
  };
}

function hood(tint = "#5a4a6a"): Painter {
  return (ic) => {
    ic.part(tint, "cloth", (g) => { P(g, [16, 2, 25, 8, 28, 20, 26, 28, 6, 28, 4, 20, 7, 8]); });
    ic.part("#0e0a0a", "dark", (g) => ell(g, 16, 17, 6.5, 8), { outline: false });
    ic.part(mix(tint, "#000000", 0.35), "cloth", (g) => P(g, [4, 24, 28, 24, 26, 28, 6, 28]), { outline: false });
    ic.dot(13, 17, "#e0b060"); ic.dot(19, 17, "#e0b060");
  };
}

function torso(kind: "robe" | "padded" | "chain" | "brigandine" | "plate", tint?: string): Painter {
  return (ic) => {
    const shape = (g: CanvasRenderingContext2D) => P(g, [10, 4, 13, 6, 19, 6, 22, 4, 28, 8, 26, 15, 23, 13, 23, 28, 9, 28, 9, 13, 6, 15, 4, 8]);
    if (kind === "robe") {
      const c = tint || "#4a5a7a";
      ic.part(c, "cloth", (g) => P(g, [10, 3, 22, 3, 28, 8, 26, 15, 23, 13, 26, 29, 6, 29, 9, 13, 6, 15, 4, 8]));
      ic.part(mix(c, "#000000", 0.4), "cloth", (g) => { P(g, [12, 3, 16, 9, 20, 3]); rect(g, 15, 9, 2, 20); }, { outline: false });
      ic.part(GOLD, "gold", (g) => rect(g, 9, 15, 14, 2.4));
      return;
    }
    const mat = kind === "padded" ? "#9a8a6a" : kind === "chain" ? IRON : kind === "brigandine" ? LEATHER : STEEL;
    ic.part(mat, kind === "padded" ? "cloth" : kind === "brigandine" ? "leather" : "metal", shape);
    if (kind === "padded") ic.part("#5a4a32", "flat", (g) => { for (const y of [11, 16, 21, 26]) rect(g, 9, y, 14, 0.9); for (const x of [13, 19]) rect(g, x, 7, 0.9, 21); }, { outline: false });
    if (kind === "chain") ic.part("#3a3e48", "flat", (g) => { for (let y = 8; y < 28; y += 2) for (let x = 5; x < 28; x += 2) if (((x + y) / 2) % 2) rect(g, x, y, 1, 1); }, { outline: false, under: false });
    if (kind === "brigandine") for (let y = 9; y < 27; y += 4) for (let x = 11; x < 23; x += 3) ic.dot(x, y, "#e0c070");
    if (kind === "plate") {
      ic.part("#e8ecf4", "metal", (g) => rect(g, 15.5, 7, 1.2, 20), { outline: false });
      ic.part(IRON, "metal", (g) => { P(g, [4, 8, 10, 4, 12, 8, 7, 12]); P(g, [28, 8, 22, 4, 20, 8, 25, 12]); rect(g, 9, 22, 14, 2); });
      ic.part(GOLD, "gold", (g) => { circ(g, 12.5, 12, 1.2); circ(g, 19.5, 12, 1.2); });
    }
  };
}

function gloves(kind: "leather" | "gauntlets"): Painter {
  return (ic) => {
    const c = kind === "leather" ? LEATHER : STEEL, m = kind === "leather" ? "leather" : "metal";
    ic.part(c, m, (g) => { rect(g, 9, 13, 14, 11); for (let i = 0; i < 4; i++) rect(g, 9 + i * 3.6, 4 + (i === 1 || i === 2 ? 0 : 2), 3, 11); P(g, [23, 15, 28, 12, 29, 15, 24, 20]); });
    ic.part(kind === "leather" ? DARKLEATHER : IRON, m, (g) => rect(g, 8, 23, 16, 6));
    if (kind === "gauntlets") ic.part("#3a3e48", "flat", (g) => { for (let i = 0; i < 4; i++) { rect(g, 9 + i * 3.6, 8, 3, 0.8); rect(g, 9 + i * 3.6, 11.5, 3, 0.8); } rect(g, 9, 18, 14, 0.8); }, { outline: false });
    else ic.dot(16, 26, "#c9a46a");
  };
}

function boots(kind: "leather" | "iron"): Painter {
  return (ic) => {
    const c = kind === "leather" ? LEATHER : STEEL, m = kind === "leather" ? "leather" : "metal";
    ic.part(c, m, (g) => P(g, [9, 4, 19, 4, 19, 19, 27, 21, 28, 26, 8, 26, 9, 18]));
    ic.part("#2a1a10", "dark", (g) => rect(g, 7, 25, 22, 3.5));
    ic.part(kind === "leather" ? DARKLEATHER : IRON, m, (g) => rect(g, 8, 4, 12, 4));
    if (kind === "iron") ic.part(IRON, "metal", (g) => { rect(g, 9, 13, 10, 1.6); P(g, [19, 19, 24, 20, 23, 22, 19, 21]); });
  };
}

function amulet(): Painter {
  return (ic) => {
    ic.part(BRASS, "gold", (g) => { g.lineWidth = 1.2; g.beginPath(); g.moveTo(5, 3); g.quadraticCurveTo(16, 22, 27, 3); g.stroke(); });
    ic.part(GOLD, "gold", (g) => { P(g, [16, 12, 23, 19, 16, 29, 9, 19]); });
    ic.part(RUBY, "gem", (g) => P(g, [16, 15, 20, 19.5, 16, 25.5, 12, 19.5]));
    return "#ff6a6a";
  };
}

function ring(): Painter {
  return (ic) => {
    ic.part(GOLD, "gold", (g) => { g.lineWidth = 3; g.beginPath(); g.ellipse(16, 20, 8.5, 7, 0, 0, Math.PI * 2); g.stroke(); });
    ic.part(GOLD, "gold", (g) => P(g, [11, 13, 21, 13, 19, 9, 13, 9]));
    ic.part(SAPPHIRE, "gem", (g) => P(g, [16, 3, 21, 8, 16, 12, 11, 8]));
    return "#7ab0ff";
  };
}

function potion(liquid: string): Painter {
  return (ic) => {
    ic.part("#a8c0c8", "glass", (g) => { rect(g, 13.5, 5, 5, 7); circ(g, 16, 19, 9); });
    ic.part(liquid, "liquid", (g) => { g.beginPath(); g.arc(16, 19, 8, 0.15, Math.PI - 0.15); g.closePath(); g.fill(); rect(g, 8.3, 18, 15.4, 3); }, { outline: false });
    ic.part(WOOD, "wood", (g) => rect(g, 13, 2, 6, 4.5));
    ic.part(BRASS, "gold", (g) => rect(g, 12.5, 6, 7, 1.6));
    ic.dot(13, 22, mix(liquid, "#ffffff", 0.6));
    ic.dot(18, 24, mix(liquid, "#ffffff", 0.5));
    ic.dot(20, 21, mix(liquid, "#ffffff", 0.6));
    return liquid;
  };
}

// ---------------------------------------------------------------- таблица предметов

/** Картинка по базе предмета; если базы нет — по общему значку. */
const BY_BASE: Record<string, Painter> = {
  short_sword: sword(13, 1.6, IRON), long_sword: sword(17, 1.6, GOLD), broad_sword: sword(17, 2.5, GOLD, RUBY, true),
  hand_axe: axe("hand"), battle_axe: axe("battle"), executioner_axe: axe("exec"),
  dagger: dagger("dagger"), kris: dagger("kris"), stiletto: dagger("stiletto"),
  mace: mace("mace"), morning_star: mace("star"), flanged_mace: mace("flanged"),
  short_bow: bow("short"), long_bow: bow("long"), war_bow: bow("war"),
  oak_staff: staff("oak"), rune_staff: staff("rune"), archon_staff: staff("archon"),
  bone_wand: wand("bone"), grave_wand: wand("grave"), lich_wand: wand("lich"),
  buckler: shield("buckler"), kite_shield: shield("kite"), tower_shield: shield("tower"),
  tome: tome("tome"), grimoire: tome("grimoire"), skull_focus: skullIcon("focus"), lich_skull: skullIcon("lich"),
  holy_symbol: symbol("holy"), reliquary: symbol("reliquary"),
  hood: hood(), leather_cap: helmet("cap"), iron_helm: helmet("iron"), great_helm: helmet("great"),
  cloth_robe: torso("robe"), padded_tunic: torso("padded"), chain_mail: torso("chain"), brigandine: torso("brigandine"), plate_armor: torso("plate"),
  leather_gloves: gloves("leather"), gauntlets: gloves("gauntlets"), leather_boots: boots("leather"), iron_boots: boots("iron"),
  amulet: amulet(), ring: ring(),
};
const BY_ICON: Record<string, Painter> = {
  sword: BY_BASE.long_sword, axe: BY_BASE.battle_axe, mace: BY_BASE.mace, dagger: BY_BASE.dagger, bow: BY_BASE.long_bow,
  staff: BY_BASE.rune_staff, wand: BY_BASE.bone_wand, shield: BY_BASE.kite_shield, tome: BY_BASE.tome, skull: BY_BASE.skull_focus,
  symbol: BY_BASE.holy_symbol, helmet: BY_BASE.iron_helm, hood: BY_BASE.hood, chest: BY_BASE.chain_mail, robe: BY_BASE.cloth_robe,
  gloves: BY_BASE.leather_gloves, boots: BY_BASE.leather_boots, amulet: BY_BASE.amulet, ring: BY_BASE.ring,
  health: potion("#d0202e"), mana: potion("#2a5ae0"),
};

const cache = new Map<string, string>();

function paint(key: string, painter: Painter | undefined, tint?: string) {
  let url = cache.get(key);
  if (url) return url;
  const ic = new Icon();
  const glow = (painter || BY_ICON.ring)(ic, tint) || undefined;
  url = itemCanvas(ic.finish(), glow);
  cache.set(key, url);
  return url;
}

/** Значок предмета по общему виду («sword», «health»…). */
export function itemIcon(icon: string, tint?: string): string {
  if (tint && (icon === "hood" || icon === "robe")) return paint(`i:${icon}:${tint}`, icon === "hood" ? hood(tint) : torso("robe", tint), tint);
  return paint(`i:${icon}`, BY_ICON[icon]);
}

/** Значок конкретной базы предмета: у каждой своя картинка. */
export function baseIcon(baseId: string): string {
  const p = BY_BASE[baseId];
  if (p) return paint(`b:${baseId}`, p);
  return itemIcon(BASE_BY_ID[baseId]?.icon || "ring");
}

// ---------------------------------------------------------------- навыки

export function skillIcon(icon: string): string {
  const key = `s:${icon}`;
  let url = cache.get(key);
  if (url) return url;
  const [fg, bg] = SKILL_COLORS[icon] || ["#d8cdb2", "#1a1410"];
  const ic = new Icon();
  (SKILL_ART[icon] || SKILL_ART.default)(ic, fg);
  url = skillCanvas(ic.finish(), fg, bg);
  cache.set(key, url);
  return url;
}
