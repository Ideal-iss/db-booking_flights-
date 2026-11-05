import { HOTKEYS } from "./SkillsPanel";
import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { Bar } from "./common";
import { itemIcon, skillIcon } from "./icons";
import { SKILL_BY_ID } from "@shared/data/skills";
import { BASE_BY_ID } from "@shared/data/items";
import { CELL, Cell } from "@shared/dungeon/generate";
import { gameApi } from "./GameScreen";

function useClock() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setT(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`;
}

export function Hud({ onClickCanvas }: { onClickCanvas: () => void }) {
  const { hud, char, log, panel } = useGame();
  const clock = useClock();
  const [lock, setLock] = useState({ locked: false, soft: false });
  const locked = lock.locked;
  useEffect(() => {
    const f = (e: Event) => setLock((e as CustomEvent<{ locked: boolean; soft: boolean }>).detail);
    window.addEventListener("hollow-lock", f);
    return () => window.removeEventListener("hollow-lock", f);
  }, []);
  if (!hud || !char) return null;
  const now = performance.now();
  const weapon = char.equipment.weapon;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* OSD как на кассете */}
      <div className="absolute top-3 left-4 text-[15px] tracking-wider text-[#e8e4dc] [text-shadow:2px_2px_0_#000]">
        <div>▶ PLAY</div>
        <div className="text-xs opacity-80">SP {clock}</div>
        <div className="text-gold mt-1 text-xs">{hud.dungeonName}</div>
      </div>

      {locked && lock.soft && <div className="absolute top-3 left-1/2 -translate-x-1/2 text-xs text-[#e0a84a] [text-shadow:1px_1px_0_#000]">мышь не захвачена · поворот: курсор у края или стрелки · Esc — пауза</div>}

      {/* босс */}
      {hud.boss && (
        <div className="absolute top-4 left-1/2 w-[min(560px,70vw)] -translate-x-1/2 text-center">
          <div className="panel-title mb-1 text-lg text-[#e8c4a0]">{hud.boss.name}{hud.boss.phase === 2 ? " — ярость" : hud.boss.phase === 3 ? " — разлом" : ""}</div>
          <Bar value={hud.boss.hp} max={hud.boss.maxHp} color="#9b2a35" className="!h-4" />
        </div>
      )}
      {!hud.boss && hud.target && (
        <div className="absolute top-4 left-1/2 w-[260px] -translate-x-1/2 text-center">
          <div className="text-sm [text-shadow:1px_1px_0_#000]" style={{ color: hud.target.elite ? "#e0a84a" : "#d8cdb2" }}>
            {hud.target.name} · {hud.target.level} ур.
          </div>
          <Bar value={hud.target.hp} max={hud.target.maxHp} color="#8a2a2a" className="!h-2.5" />
        </div>
      )}

      {/* прицел и подсказка */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-4 w-4">
          <div className="absolute top-[7px] left-0 h-[2px] w-[5px] bg-[#e8dcc0cc]" />
          <div className="absolute top-[7px] right-0 h-[2px] w-[5px] bg-[#e8dcc0cc]" />
          <div className="absolute top-0 left-[7px] h-[5px] w-[2px] bg-[#e8dcc0cc]" />
          <div className="absolute bottom-0 left-[7px] h-[5px] w-[2px] bg-[#e8dcc0cc]" />
        </div>
        {hud.draw > 0 && <div className="absolute top-6 left-1/2 h-1 w-12 -translate-x-1/2 bg-black"><div className="h-full bg-[#e0b84a]" style={{ width: `${hud.draw * 100}%` }} /></div>}
      </div>
      {hud.prompt && (
        <div className="absolute top-[58%] left-1/2 -translate-x-1/2 text-center text-[15px] [text-shadow:2px_2px_0_#000]">
          <span className="mr-2 border-2 border-[#c9a46a] bg-black/70 px-1.5 text-[#e0b84a]">E</span>
          {hud.prompt}
        </div>
      )}
      {!hud.alive && (
        <div className="absolute top-[35%] left-1/2 -translate-x-1/2 text-center">
          <div className="logo text-6xl text-[#c8343a]">ВЫ ПАЛИ</div>
          {hud.allies.some((a) => a.alive) && <div className="text-parch mt-2">Союзник может поднять вас (E рядом с телом)</div>}
        </div>
      )}
      {hud.reviving > 0 && <div className="absolute top-[64%] left-1/2 -translate-x-1/2 text-[#7fe07f]">Поднимаем союзника… {hud.reviving.toFixed(1)} с</div>}

      {/* журнал */}
      <div className="absolute bottom-28 left-4 flex w-[420px] flex-col gap-0.5 text-sm">
        {log.map((l) => (
          <div key={l.id} className="rise [text-shadow:1px_1px_0_#000,2px_2px_0_#000]" style={{ color: l.color || "#d8cdb2", opacity: Math.max(0, Math.min(1, (9000 - (now - l.t)) / 1500)) }}>
            {l.text}
          </div>
        ))}
      </div>

      <Minimap />
      {hud.allies.length > 0 && (
        <div className="absolute top-[190px] right-4 flex w-[160px] flex-col gap-1">
          {hud.allies.map((a, i) => (
            <div key={i} className="text-xs [text-shadow:1px_1px_0_#000]">
              <div style={{ color: a.alive ? "#d8cdb2" : "#c8343a" }}>{a.name}{a.alive ? "" : " (пал)"}</div>
              <Bar value={a.hp} max={a.maxHp} color="#a02a2a" className="!h-2" />
            </div>
          ))}
        </div>
      )}

      {/* нижняя панель */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className="flex w-[520px] gap-2">
          <Bar value={hud.hp} max={hud.maxHp} extra={hud.absorb} color="#b02a30" label={`${hud.hp} / ${hud.maxHp}`} className="flex-1 !h-4" />
          <Bar value={hud.mana} max={hud.maxMana} color="#3a5aa8" label={`${hud.mana} / ${hud.maxMana}`} className="flex-1 !h-4" />
        </div>
        <Bar value={hud.stamina} max={hud.maxStamina} color="#b59a3a" className="w-[300px] !h-2" />
        <div className="panel flex items-end gap-1.5 px-2 py-1.5">
          <HotSlot k="ЛКМ" icon={weapon ? itemIcon(BASE_BY_ID[weapon.base].icon) : itemIcon("gloves")} />
          <HotSlot k="ПКМ" icon={char.equipment.offhand ? itemIcon(BASE_BY_ID[char.equipment.offhand.base].icon) : itemIcon("shield")} dim />
          <div className="w-2" />
          {HOTKEYS.map((k, i) => {
            const id = char.hotbar[i];
            const sk = id ? SKILL_BY_ID[id] : null;
            const cd = id ? hud.cds[id] || 0 : 0;
            return <HotSlot key={k} k={k} icon={sk ? skillIcon(sk.icon) : undefined} cd={cd} total={sk?.cooldown || 1} />;
          })}
          <div className="w-2" />
          <HotSlot k="1" icon={itemIcon("health")} count={hud.potions.health} />
          <HotSlot k="2" icon={itemIcon("mana")} count={hud.potions.mana} />
        </div>
        <div className="flex w-[520px] items-center gap-2 text-[11px] [text-shadow:1px_1px_0_#000]">
          <span className="text-gold">{hud.level} ур.</span>
          <Bar value={hud.xp} max={hud.xpNeed} color="#c9a46a" className="flex-1 !h-1.5" />
          <span className="text-gold">{hud.gold} зол.</span>
        </div>
      </div>

      {!locked && !panel && (
        <div className="pointer-events-auto absolute inset-0 flex cursor-pointer items-center justify-center bg-black/30" onClick={onClickCanvas}>
          <div className="panel px-6 py-4 text-center">
            <div className="panel-title text-xl">Кликните, чтобы играть</div>
            <div className="text-parch mt-1 text-sm">WASD — ходить · мышь — смотреть · ЛКМ — атака (зажать — сильная) · ПКМ — блок/прицел</div>
            <div className="text-parch text-sm">Shift — бег · Пробел — уклонение · E — действие · Q/R/F/G/Z/X — навыки · 1/2 — зелья</div>
            <div className="text-parch text-sm">I — сумка · C — персонаж · B — навыки · M — карта · Esc — пауза · F1 — помощь</div>
            {lock.soft && <div className="mt-2 text-xs text-[#e0a84a]">Браузер не разрешил захват мыши — включён режим без захвата: поворачивайтесь мышью, подводя курсор к краю экрана, или стрелками.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function HotSlot(props: { k: string; icon?: string; cd?: number; total?: number; count?: number; dim?: boolean }) {
  const cdK = props.cd && props.total ? Math.min(1, props.cd / props.total) : 0;
  return (
    <div className="flex flex-col items-center">
      <div className="slot" style={{ width: 46, height: 46, opacity: props.dim ? 0.8 : 1 }}>
        {props.icon && <img src={props.icon} alt="" />}
        {cdK > 0 && (
          <>
            <div className="absolute inset-x-0 bottom-0 bg-black/70" style={{ height: `${cdK * 100}%` }} />
            <div className="absolute inset-0 flex items-center justify-center text-sm [text-shadow:1px_1px_0_#000]">{Math.ceil(props.cd!)}</div>
          </>
        )}
        {props.count !== undefined && (
          <span className={`absolute right-0.5 bottom-0 text-xs [text-shadow:1px_1px_0_#000] ${props.count ? "text-bone" : "text-[#e0505a]"}`}>{props.count}</span>
        )}
      </div>
      <span className="text-dim text-[10px] leading-3">{props.k}</span>
    </div>
  );
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const c = ref.current;
      const g = c?.getContext("2d");
      const data = gameApi.game?.mapData();
      if (!c || !g || !data) return;
      const { d, explored, x, z, yaw } = data;
      const S = 6; // пикселей на клетку
      const R = 11;
      g.fillStyle = "#0b0806";
      g.fillRect(0, 0, c.width, c.height);
      const pcx = x / CELL, pcz = z / CELL;
      for (let j = -R; j <= R; j++)
        for (let i = -R; i <= R; i++) {
          const cx = Math.floor(pcx) + i, cz = Math.floor(pcz) + j;
          if (cx < 0 || cz < 0 || cx >= d.w || cz >= d.h) continue;
          const idx = cz * d.w + cx;
          if (!explored[idx]) continue;
          const cell = d.cells[idx];
          if (cell === Cell.Wall) continue;
          g.fillStyle = cell === Cell.Secret ? "#4a3a2a" : "#6a5a48";
          g.fillRect(c.width / 2 + (cx - pcx) * S, c.height / 2 + (cz - pcz) * S, S, S);
        }
      const pt = (wx: number, wz: number, col: string, r = 2) => {
        const px = c.width / 2 + (wx / CELL - pcx) * S, pz = c.height / 2 + (wz / CELL - pcz) * S;
        if (px < 0 || pz < 0 || px > c.width || pz > c.height) return;
        g.fillStyle = col;
        g.fillRect(px - r, pz - r, r * 2, r * 2);
      };
      for (const n of data.npcs) pt(n.x, n.z, "#c9a46a", 2);
      for (const a of data.allies) pt(a.x, a.z, "#7fe07f", 2);
      if (data.exitOpen) pt(d.exit.x, d.exit.z, "#8fd0ff", 3);
      if (d.theme.id !== "hub") pt(d.entrance.x, d.entrance.z, "#6f9fd8", 2);
      // игрок — стрелка
      g.save();
      g.translate(c.width / 2, c.height / 2);
      g.rotate(-yaw);
      g.fillStyle = "#ffe9a0";
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(4, 4);
      g.lineTo(-4, 4);
      g.closePath();
      g.fill();
      g.restore();
    }, 150);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={ref} width={160} height={160} className="panel absolute top-4 right-4 h-[160px] w-[160px] p-0" />;
}
