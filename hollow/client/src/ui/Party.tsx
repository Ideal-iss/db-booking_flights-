import { useState } from "react";
import { Panel } from "./common";
import { useGame } from "../store";
import { party, useParty } from "../game/net";
import { CLASSES } from "@shared/data/classes";
import { STAGES, stageUnlocked } from "@shared/data/dungeons";
import { audio } from "../game/audio";

export function PartyPanel({ onClose }: { onClose: () => void }) {
  const { char, coopEnabled } = useGame();
  const { status, error, lobby, you, size } = useParty();
  const [code, setCode] = useState("");
  const [dungeon, setDungeon] = useState("a1s1");
  if (!char) return null;
  if (!coopEnabled) {
    return (
      <Panel title="Алтарь Клятвы" onClose={onClose}>
        <div className="text-parch space-y-2 text-sm">
          <p>Совместный спуск идёт через отдельный игровой сервер (Colyseus), и на этом сайте он пока не подключён.</p>
          <p>Как только владелец сайта запустит сервер и пропишет его адрес, здесь появятся кнопки «Создать отряд» и «Войти по коду».</p>
          <p className="text-dim">Одиночная игра доступна полностью — врата в подземелья у северной стены лагеря.</p>
        </div>
      </Panel>
    );
  }
  const me = lobby?.members.find((m) => m.id === you);
  const isHost = lobby?.host === you;
  const allReady = !!lobby && lobby.members.filter((m) => m.connected).every((m) => m.ready);
  return (
    <Panel title="Алтарь Клятвы — отряд" onClose={onClose}>
      {status === "idle" || status === "error" ? (
        <div className="flex flex-col gap-3">
          <div className="text-parch text-sm">Соберите отряд до {size} героев. Добыча у каждого своя, опыт делится на всех.</div>
          <button className="btn btn-gold py-2" onClick={() => { audio.play("click"); void party.create(char.id); }}>Создать отряд</button>
          <div className="flex gap-2">
            <input className="field flex-1 uppercase" placeholder="HOLLOW-0000" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" disabled={code.trim().length < 6} onClick={() => void party.join(char.id, code)}>Войти по коду</button>
          </div>
          {error && <div className="text-sm text-[#e0505a]">{error}</div>}
        </div>
      ) : status === "connecting" ? (
        <div className="text-parch">Связываемся с сервером отряда…</div>
      ) : (
        <div className="flex flex-col gap-3">
          {status === "reconnecting" && <div className="text-[#e0a84a]">Переподключение…</div>}
          <div className="text-center">
            <div className="text-dim text-xs">Код отряда — передайте другу</div>
            <div className="logo cursor-pointer text-4xl" onClick={() => lobby && navigator.clipboard?.writeText(lobby.code)}>{lobby?.code || "…"}</div>
          </div>
          <div className="flex flex-col gap-1">
            {lobby?.members.map((m) => (
              <div key={m.id} className="panel flex items-center gap-2 px-3 py-1.5">
                <span className="flex-1">
                  {m.name} {m.id === lobby.host && <span className="text-gold text-xs">(лидер)</span>}
                  <span className="text-dim text-xs"> · {CLASSES[m.cls as keyof typeof CLASSES]?.name}, {m.level} ур.</span>
                </span>
                <span className={m.connected ? (m.ready ? "text-[#7fe07f]" : "text-dim") : "text-[#e0505a]"}>{m.connected ? (m.ready ? "готов" : "не готов") : "нет связи"}</span>
              </div>
            ))}
            {lobby && Array.from({ length: Math.max(0, size - lobby.members.length) }, (_, i) => (
              <div key={i} className="text-dim border border-dashed border-[#3d3126] px-3 py-1.5 text-sm">свободное место</div>
            ))}
          </div>
          {lobby?.inRun ? (
            <div className="text-parch">Отряд в подземелье.</div>
          ) : (
            <>
              <button className={`btn ${me?.ready ? "btn-gold" : ""}`} onClick={() => party.ready(!me?.ready)}>{me?.ready ? "Готов ✓" : "Я готов"}</button>
              {isHost && (
                <div className="flex gap-2">
                  <select className="field flex-1" value={dungeon} onChange={(e) => setDungeon(e.target.value)}>
                    {STAGES.map((d) => (
                      <option key={d.id} value={d.id} disabled={!stageUnlocked(d.id, char.cleared)}>{d.name}{stageUnlocked(d.id, char.cleared) ? "" : " (закрыто)"}</option>
                    ))}
                  </select>
                  <button className="btn btn-red" disabled={!allReady} onClick={() => { audio.play("portal"); party.start(dungeon); }}>Спуститься</button>
                </div>
              )}
              {!isHost && <div className="text-dim text-sm">Подземелье выбирает лидер отряда.</div>}
            </>
          )}
          <button className="btn self-start" onClick={() => party.leave()}>Покинуть отряд</button>
          <div className="text-dim text-xs">Смена снаряжения во время совместного забега вступит в силу со следующего спуска. Если связь прервётся, у вас есть минута, чтобы вернуться.</div>
        </div>
      )}
    </Panel>
  );
}
