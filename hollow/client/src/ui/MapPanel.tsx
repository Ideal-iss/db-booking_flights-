import { useEffect, useRef } from "react";
import { Panel } from "./common";
import { gameApi } from "./GameScreen";
import { CELL, Cell } from "@shared/dungeon/generate";

export function MapPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => {
      const data = gameApi.game?.mapData();
      const c = ref.current;
      const g = c?.getContext("2d");
      if (!data || !c || !g) return;
      const { d, explored } = data;
      const S = Math.floor(Math.min(620 / d.w, 520 / d.h));
      c.width = d.w * S;
      c.height = d.h * S;
      g.fillStyle = "#121110";
      g.fillRect(0, 0, c.width, c.height);
      for (let y = 0; y < d.h; y++)
        for (let x = 0; x < d.w; x++) {
          const i = y * d.w + x;
          if (!explored[i] || d.cells[i] === Cell.Wall) continue;
          const opened = d.cells[i] === Cell.Secret ? data.opened?.secrets.some((id) => d.secrets.find((s) => s.id === id && s.cx === x && s.cy === y)) : true;
          if (!opened) continue;
          g.fillStyle = "#4d4943";
          g.fillRect(x * S, y * S, S, S);
          g.fillStyle = "#5a5650";
          g.fillRect(x * S, y * S, S, 1);
        }
      const pt = (wx: number, wz: number, col: string, r: number) => {
        const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
        if (!explored[cz * d.w + cx] && d.theme.id !== "hub") return;
        g.fillStyle = col;
        g.fillRect((wx / CELL) * S - r, (wz / CELL) * S - r, r * 2, r * 2);
      };
      if (d.theme.id !== "hub") pt(d.entrance.x, d.entrance.z, "#6f9fd8", 4);
      if (data.exitOpen) pt(d.exit.x, d.exit.z, "#8fd0ff", 5);
      const boss = d.rooms[d.bossRoom];
      if (boss && d.theme.id !== "hub" && !data.exitOpen) { g.fillStyle = "#e0505a"; g.fillRect((boss.x + boss.w / 2) * S - 5, (boss.y + boss.h / 2) * S - 5, 10, 10); }
      for (const ch of d.chests) if (!data.opened?.chests.includes(ch.id)) pt(ch.x, ch.z, "#c9a46a", 3);
      for (const sh of d.shrines) if (!data.opened?.shrines.includes(sh.id)) pt(sh.x, sh.z, "#7fe0b0", 3);
      for (const n of data.npcs) pt(n.x, n.z, "#c9a46a", 4);
      for (const a of data.allies) pt(a.x, a.z, "#7fe07f", 4);
      g.save();
      g.translate((data.x / CELL) * S, (data.z / CELL) * S);
      g.rotate(-data.yaw);
      g.fillStyle = "#ece6da";
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(5, 5);
      g.lineTo(-5, 5);
      g.closePath();
      g.fill();
      g.restore();
    };
    draw();
    const id = setInterval(draw, 300);
    return () => clearInterval(id);
  }, []);
  return (
    <Panel title="Карта" onClose={onClose}>
      <div className="flex flex-col items-center gap-2">
        <canvas ref={ref} className="rounded-[6px] border border-line" style={{ imageRendering: "pixelated" }} />
        <div className="text-parch flex flex-wrap gap-4 text-xs">
          {[["#ece6da", "вы"], ["#e0505a", "логово босса"], ["#c9a46a", "сундуки"], ["#7fe0b0", "святыни"], ["#6f9fd8", "вход"], ["#8fd0ff", "портал"]].map(([c, n]) => (
            <span key={n} className="flex items-center gap-2"><i className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />{n}</span>
          ))}
        </div>
        <p className="text-dim text-xs">На карте только места, где вы побывали, и логово босса</p>
      </div>
    </Panel>
  );
}
