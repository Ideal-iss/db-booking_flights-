import { HOTKEYS } from "./SkillsPanel";
import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { Bar } from "./common";
import { baseIcon, itemIcon, skillIcon } from "./icons";
import { drawMap, objective, type MapData } from "./mapDraw";
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
      <div className="osd absolute top-4 left-6">
        <div>▶ PLAY</div>
        <div>SP {clock}</div>
        <div className="text-parch mt-1">{hud.dungeonName}</div>
        {hud.keys > 0 && <div className="mt-1" style={{ color: "#e8c050" }}>Ключи: {hud.keys}</div>}
      </div>

      {locked && lock.soft && <div className="osd text-parch absolute top-4 left-1/2 -translate-x-1/2">Мышь не захвачена: поворот курсором у края экрана или стрелками</div>}

      {/* босс */}
      {hud.boss && (
        <div className="absolute top-6 left-1/2 w-[min(560px,70vw)] -translate-x-1/2 text-center">
          <div className="mb-2 flex items-baseline justify-center gap-3 [text-shadow:0_0_4px_#000]">
            <span className="font-[family-name:var(--font-head)] text-[22px] leading-6 font-semibold">{hud.boss.name}</span>
            {hud.boss.phase >= 2 && <span className="text-bad text-xs">{hud.boss.phase === 2 ? "ярость" : "разлом"}</span>}
          </div>
          <Bar value={hud.boss.hp} max={hud.boss.maxHp} color="#b4303a" className="!h-2.5" />
        </div>
      )}
      {!hud.boss && hud.target && (
        <div className="absolute top-6 left-1/2 w-[260px] -translate-x-1/2 text-center">
          <div className="mb-1 text-[13px] [text-shadow:0_0_4px_#000]">
            <span className={hud.target.elite ? "text-flame" : "text-bone"}>{hud.target.name}</span>
            <span className="text-parch"> · {hud.target.level} ур.</span>
          </div>
          <Bar value={hud.target.hp} max={hud.target.maxHp} color="#b4303a" className="!h-1.5" />
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
        {hud.draw > 0 && <div className="absolute top-6 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-black/70"><div className="bg-flame h-full rounded-full" style={{ width: `${hud.draw * 100}%` }} /></div>}
      </div>
      {hud.prompt && (
        <div className="absolute top-[58%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-[4px] bg-[#141311d9] px-3 py-1.5 text-[13px]">
          <span className="kbd">E</span>
          {hud.prompt}
        </div>
      )}
      {!hud.alive && (hud.deadFor < 4.5 || hud.allies.some((a) => a.alive)) && (
        <div className="absolute top-[35%] left-1/2 -translate-x-1/2 text-center transition-opacity duration-700" style={{ opacity: hud.allies.some((a) => a.alive) ? 1 : Math.max(0, Math.min(1, (4.5 - hud.deadFor) / 1.2)) }}>
          <div className="font-[family-name:var(--font-head)] text-[56px] leading-none font-semibold text-[#e5484d] [text-shadow:0_0_8px_#000]">Вы пали</div>
          {hud.allies.some((a) => a.alive) && <div className="text-parch mt-3">Союзник может поднять вас, если подойдёт и нажмёт E</div>}
        </div>
      )}
      {hud.reviving > 0 && <div className="text-good absolute top-[64%] left-1/2 -translate-x-1/2">Поднимаем союзника, {hud.reviving.toFixed(1)} с</div>}

      {/* журнал */}
      <div className="absolute bottom-32 left-6 flex w-[400px] flex-col gap-1 text-[13px] leading-[18px]">
        {log.map((l) => (
          <div key={l.id} className="rise [text-shadow:0_0_3px_#000,0_1px_2px_#000]" style={{ color: logColor(l.color), opacity: Math.max(0, Math.min(1, (9000 - (now - l.t)) / 1500)) }}>
            {l.text}
          </div>
        ))}
      </div>

      <Minimap />
      {hud.allies.length > 0 && (
        <div className="absolute top-[190px] right-4 flex w-[160px] flex-col gap-1">
          {hud.allies.map((a, i) => (
            <div key={i} className="text-xs [text-shadow:0_0_3px_#000]">
              <div className={a.alive ? "text-bone" : "text-bad"}>{a.name}{a.alive ? "" : " · пал"}</div>
              <Bar value={a.hp} max={a.maxHp} color="#b4303a" className="!h-1.5" />
            </div>
          ))}
        </div>
      )}

      {/* нижняя панель */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex w-[560px] gap-3">
          <Bar value={hud.hp} max={hud.maxHp} extra={hud.absorb} color="#b4303a" label={`${hud.hp} / ${hud.maxHp}`} className="flex-1 !h-4 [&>span]:!text-[11px] [&>span]:!leading-[14px]" />
          <Bar value={hud.mana} max={hud.maxMana} color="#4a74c0" label={`${hud.mana} / ${hud.maxMana}`} className="flex-1 !h-4 [&>span]:!text-[11px] [&>span]:!leading-[14px]" />
        </div>
        <Bar value={hud.stamina} max={hud.maxStamina} color="#a8915a" className="w-[280px] !h-1" />
        <div className="panel flex items-end gap-1 px-2 pt-2 pb-1">
          <HotSlot k="ЛКМ" icon={weapon ? baseIcon(weapon.base) : itemIcon("gloves")} />
          <HotSlot k="ПКМ" icon={char.equipment.offhand ? baseIcon(char.equipment.offhand.base) : itemIcon("shield")} dim />
          <div className="mx-1 h-11 w-px self-start bg-line" />
          {HOTKEYS.map((k, i) => {
            const id = char.hotbar[i];
            const sk = id ? SKILL_BY_ID[id] : null;
            const cd = id ? hud.cds[id] || 0 : 0;
            return <HotSlot key={k} k={k} icon={sk ? skillIcon(sk.icon) : undefined} cd={cd} total={sk?.cooldown || 1} />;
          })}
          <div className="mx-1 h-11 w-px self-start bg-line" />
          <HotSlot k="1" icon={itemIcon("health")} count={hud.potions.health} />
          <HotSlot k="2" icon={itemIcon("mana")} count={hud.potions.mana} />
        </div>
        <div className="flex w-[560px] items-center gap-3 text-xs [text-shadow:0_0_3px_#000]">
          <span className="text-bone">Ур. {hud.level}</span>
          {(char.attrPoints > 0 || char.skillPoints > 0) && (
            <span className="pts-badge" title="Есть нераспределённые очки">
              {char.attrPoints > 0 && <>+{char.attrPoints} атр. <span className="kbd">C</span></>}
              {char.skillPoints > 0 && <>{char.attrPoints > 0 ? " · " : ""}+{char.skillPoints} нав. <span className="kbd">B</span></>}
            </span>
          )}
          <Bar value={hud.xp} max={hud.xpNeed} color="#e3a45a" className="flex-1 !h-1" />
          <span className="text-parch">{hud.gold.toLocaleString("ru-RU")} зол.</span>
        </div>
      </div>

      {!locked && !panel && (
        <div className="pointer-events-auto absolute inset-0 flex cursor-pointer items-center justify-center bg-black/40" onClick={onClickCanvas}>
          <div className="panel rise w-[520px] p-6">
            <div className="panel-title">Кликните, чтобы играть</div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
              {CONTROLS.map(([k, v]) => (
                <div key={v} className="flex items-center justify-between gap-3">
                  <dt className="text-parch">{v}</dt>
                  <dd className="flex gap-1">{k.split(" ").map((x) => <span key={x} className="kbd">{x}</span>)}</dd>
                </div>
              ))}
            </dl>
            {lock.soft && <p className="text-parch mt-4 text-xs">Браузер не разрешил захват мыши. Поворачивайтесь, подводя курсор к краю экрана, или стрелками</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const CONTROLS: [string, string][] = [
  ["W A S D", "Ходить"], ["Shift", "Бег"], ["ЛКМ", "Атака"], ["Space", "Прыжок"], ["V", "Уклонение"], ["ПКМ", "Блок или прицел"], ["E", "Действие"],
  ["Q R F", "Навыки"], ["G Z X", "Навыки"], ["1 2", "Зелья"], ["I", "Сумка"], ["C", "Персонаж"], ["B", "Навыки"], ["M", "Карта"], ["J", "Поручения"], ["Esc", "Пауза"],
];

/** Цвета журнала: старые яркие оттенки сводим к палитре, смысл сохраняем. */
function logColor(c?: string) {
  if (!c) return "#ece6da";
  const m: Record<string, string> = {
    "#c9a46a": "#ece6da", "#d8cdb2": "#aaa398", "#ffd84a": "#e3a45a", "#e0505a": "#e5484d", "#ff5a4a": "#e5484d", "#ff3a2a": "#e5484d",
    "#ff6a4a": "#e5484d", "#7fe07f": "#4cc38a", "#8fd0ff": "#9fb4d8", "#4a6fb0": "#9fb4d8", "#c8b89a": "#aaa398",
  };
  return m[c.toLowerCase()] || c;
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
            <div className="absolute inset-0 flex items-center justify-center text-[13px] [text-shadow:0_0_3px_#000]">{Math.ceil(props.cd!)}</div>
          </>
        )}
        {props.count !== undefined && (
          <span className={`absolute right-1 bottom-0.5 text-[11px] leading-none [text-shadow:0_0_3px_#000] ${props.count ? "text-bone" : "text-bad"}`}>{props.count}</span>
        )}
      </div>
      <span className="text-dim mt-1 text-[10px] leading-3">{props.k}</span>
    </div>
  );
}

/** Миникарта: круглая, поворачивается вместе со взглядом; «С» на ободе показывает север. */
function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const t0 = performance.now();
    const id = setInterval(() => {
      const c = ref.current;
      const g = c?.getContext("2d");
      const data = gameApi.game?.mapData() as MapData | null | undefined;
      if (!c || !g || !data) return;
      const W = c.width, R = W / 2;
      const t = (performance.now() - t0) / 1000;
      g.save();
      g.clearRect(0, 0, W, W);
      g.beginPath();
      g.arc(R, R, R - 3, 0, Math.PI * 2);
      g.clip();
      drawMap(g, data, { S: 9, cx: data.x / CELL, cy: data.z / CELL, rotate: data.yaw, t });
      g.restore();
      // цель за краем — стрелка на ободе
      const obj = objective(data);
      if (obj) {
        const dx = obj.cx + 0.5 - data.x / CELL, dz = obj.cy + 0.5 - data.z / CELL;
        const dist = Math.hypot(dx, dz) * 9;
        if (dist > R - 14) {
          const ang = Math.atan2(dz, dx) + data.yaw;
          const col = obj.kind === "portal" ? "#9ad8ff" : "#e5484d";
          g.save();
          g.translate(R + Math.cos(ang) * (R - 11), R + Math.sin(ang) * (R - 11));
          g.rotate(ang + Math.PI / 2);
          g.fillStyle = "#0b0806";
          g.beginPath(); g.moveTo(0, -8); g.lineTo(7, 6); g.lineTo(-7, 6); g.closePath(); g.fill();
          g.fillStyle = col;
          g.beginPath(); g.moveTo(0, -6); g.lineTo(5, 4.5); g.lineTo(-5, 4.5); g.closePath(); g.fill();
          g.restore();
        }
      }
      // обод и север
      g.strokeStyle = "#0b0806";
      g.lineWidth = 4;
      g.beginPath(); g.arc(R, R, R - 3, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = "rgba(239,233,222,0.22)";
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(R, R, R - 4.5, 0, Math.PI * 2); g.stroke();
      const na = -Math.PI / 2 + data.yaw;
      const nx = R + Math.cos(na) * (R - 9), ny = R + Math.sin(na) * (R - 9);
      g.fillStyle = "#141311";
      g.beginPath(); g.arc(nx, ny, 8, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(239,233,222,0.3)";
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = "#e3a45a";
      g.font = "bold 11px 'IBM Plex Mono', monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("С", nx, ny + 0.5);
    }, 90);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={ref} width={176} height={176} className="absolute top-4 right-6 h-[176px] w-[176px]" style={{ imageRendering: "pixelated" }} />;
}
