import { useEffect, useRef, useState } from "react";
import { Panel } from "./common";
import { gameApi } from "./GameScreen";
import { CELL } from "@shared/dungeon/generate";
import { drawMap, exploredBounds, glyph, mapStats, objective, type MapData } from "./mapDraw";

const LEGEND: [string, string][] = [
  ["boss", "логово хранителя"], ["portal", "портал наверх"], ["entrance", "вход"], ["chest", "сундук"], ["chestOpen", "открытый сундук"],
  ["shrine", "святыня"], ["note", "записка"], ["lever", "рычаг"], ["secret", "тайник"],
  ["key", "ключ"], ["door", "запертая дверь"], ["gate", "решётка"], ["plate", "нажимная плита"],
];
/** Цветные образцы рельефа для легенды. */
const TERRAIN: [string, string][] = [["#2c5868", "вода"], ["#6a1612", "кровь"], ["#d8561a", "лава"], ["#050404", "пропасть"], ["#6a4a2c", "мост"]];

function Glyph({ name }: { name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 18, 18);
    g.drawImage(glyph(name), 0, 0, 18, 18);
  }, [name]);
  return <canvas ref={ref} width={18} height={18} style={{ imageRendering: "pixelated" }} />;
}

export function MapPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef({ zoom: 1, panX: 0, panY: 0, follow: true });
  const [info, setInfo] = useState<{ stats: ReturnType<typeof mapStats>; name: string; obj: string; hub: boolean } | null>(null);
  const [zoomUi, setZoomUi] = useState(1);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const t0 = performance.now();
    let raf = 0, statAt = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const data = gameApi.game?.mapData() as MapData | null | undefined;
      const g = c.getContext("2d");
      if (!data || !g) return;
      const { d } = data;
      const box = c.parentElement!.getBoundingClientRect();
      const w = Math.floor(box.width), h = Math.floor(box.height);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      // при обзоре вписываем разведанную часть (и логово) во всё окно
      const bb = exploredBounds(data);
      const fit = Math.min(w / (bb.x1 - bb.x0), h / (bb.y1 - bb.y0), 34);
      const v = view.current;
      const S = Math.max(4, Math.round(fit * v.zoom));
      // при увеличении карта следует за героем, пока её не сдвинули мышью
      let cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      if (v.zoom > 1.05 && v.follow) { cx = data.x / CELL; cy = data.z / CELL; }
      cx += v.panX / S;
      cy += v.panY / S;
      const t = (performance.now() - t0) / 1000;
      drawMap(g, data, { S, cx, cy, t, labels: d.theme.id === "hub" });
      if (t > statAt) {
        statAt = t + 0.5;
        const obj = objective(data);
        setInfo({
          stats: mapStats(data),
          name: d.theme.name,
          hub: d.theme.id === "hub",
          obj: !obj ? "Лагерь. Врата Глубин — в северной нише." : obj.kind === "portal" ? "Хранитель повержен. Портал наверх открыт — идите по голубой метке." : "Найдите логово хранителя — череп на карте. Оранжевый пунктир ведёт по разведанному.",
        });
      }
    };
    draw();
    // колесо — масштаб, перетаскивание — сдвиг
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = view.current;
      v.zoom = Math.max(1, Math.min(4, v.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      if (v.zoom <= 1.05) { v.panX = 0; v.panY = 0; v.follow = true; }
      setZoomUi(v.zoom);
    };
    let drag: { x: number; y: number } | null = null;
    const down = (e: MouseEvent) => { drag = { x: e.clientX, y: e.clientY }; };
    const move = (e: MouseEvent) => {
      if (!drag) return;
      const v = view.current;
      v.panX -= e.clientX - drag.x;
      v.panY -= e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => { drag = null; };
    c.addEventListener("wheel", wheel, { passive: false });
    c.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      cancelAnimationFrame(raf);
      c.removeEventListener("wheel", wheel);
      c.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const zoomBy = (k: number) => {
    const v = view.current;
    v.zoom = Math.max(1, Math.min(4, v.zoom * k));
    if (v.zoom <= 1.05) { v.panX = 0; v.panY = 0; }
    setZoomUi(v.zoom);
  };
  const center = () => {
    const v = view.current;
    v.panX = 0; v.panY = 0; v.follow = true;
    if (v.zoom < 1.5) v.zoom = 2;
    setZoomUi(v.zoom);
  };

  const s = info?.stats;
  return (
    <Panel title="Карта" onClose={onClose}>
      <div className="flex h-full min-h-0 gap-6">
        <div className="relative min-h-[420px] min-w-0 flex-1 overflow-hidden rounded-[6px] border border-line">
          <canvas ref={ref} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" style={{ imageRendering: "pixelated" }} />
          <div className="absolute right-3 bottom-3 flex gap-1">
            <button className="btn w-9 px-0" onClick={() => zoomBy(1 / 1.3)} aria-label="Отдалить">−</button>
            <button className="btn w-9 px-0" onClick={() => zoomBy(1.3)} aria-label="Приблизить">+</button>
            <button className="btn" onClick={center}>К герою</button>
          </div>
          <div className="text-dim absolute bottom-3 left-3 text-xs">Колесо — масштаб · тяните мышью · ×{zoomUi.toFixed(1)}</div>
        </div>
        <aside className="flex w-[250px] shrink-0 flex-col gap-5 overflow-y-auto">
          {info && (
            <>
              <div className="flex flex-col gap-2">
                <div className="font-[family-name:var(--font-head)] text-[22px] leading-6 font-semibold">{info.name}</div>
                <p className="text-parch text-sm">{info.obj}</p>
              </div>
              {!info.hub && s && (
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-dim">Разведано</dt><dd>{s.explored}%</dd>
                  <dt className="text-dim">Сундуки</dt><dd>{s.chests.opened} из {s.chests.known} найденных</dd>
                  <dt className="text-dim">Святыни</dt><dd>{s.shrines.used} из {s.shrines.known}</dd>
                  <dt className="text-dim">Тайники</dt><dd>{s.secrets.found} из {s.secrets.total}</dd>
                  <dt className="text-dim">Записки</dt><dd>{s.notes.known} из {s.notes.total}</dd>
                </dl>
              )}
              {!info.hub && (
                <div className="bar h-1.5"><div style={{ width: `${s?.explored || 0}%`, background: "var(--color-flame)" }} className="h-full" /></div>
              )}
              <div className="flex flex-col gap-1.5">
                <div className="label">Обозначения</div>
                {(info.hub ? [["npc", "житель лагеря"], ["portal", "Врата Глубин"], ["chest", "сундук отряда"], ["fire", "костёр"]] as [string, string][] : LEGEND).map(([k, n]) => (
                  <div key={k} className="text-parch flex items-center gap-2.5 text-sm"><Glyph name={k} />{n}</div>
                ))}
                {!info.hub && (
                  <>
                    <div className="text-parch flex items-center gap-2.5 text-sm"><span className="inline-block h-[18px] w-[18px] text-center leading-[18px]" style={{ color: "#e3a45a" }}>···</span>путь к цели</div>
                    <div className="text-parch flex items-center gap-2.5 text-sm"><span className="inline-block h-[18px] w-[18px] rounded-[2px] border border-dashed" style={{ borderColor: "#e3a45a" }} />комната, где вы</div>
                    {TERRAIN.map(([c, n]) => (
                      <div key={n} className="text-parch flex items-center gap-2.5 text-sm"><span className="inline-block h-[18px] w-[18px] rounded-[2px] border border-[#2a2622]" style={{ background: c }} />{n}</div>
                    ))}
                    <div className="text-parch flex items-center gap-2.5 text-sm"><span className="inline-block h-[18px] w-[18px] rounded-[2px]" style={{ background: "linear-gradient(90deg,#5a5040,#b0a488)" }} />ступени (светлее — выше)</div>
                  </>
                )}
              </div>
              {!info.hub && <p className="text-dim mt-auto text-xs">Войдя в комнату, вы видите её целиком. Точечный пол — неразведанное продолжение</p>}
            </>
          )}
        </aside>
      </div>
    </Panel>
  );
}
