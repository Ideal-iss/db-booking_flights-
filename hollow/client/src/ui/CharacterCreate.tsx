import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useGame } from "../store";
import { api, ApiError } from "../api";
import { ATTR_IDS, ATTR_NAMES, CLASSES, CLASS_IDS, type ClassId } from "@shared/data/classes";
import { BASE_BY_ID } from "@shared/data/items";
import { skillsOf } from "@shared/data/skills";
import type { Appearance } from "@shared/data/stats";
import { Engine } from "../game/engine";
import { makeAvatar, setAvatarWeapons, poseRig, SKIN, HAIR_COLORS, CLOTH, TRIM } from "../game/models";
import { makeFlame } from "../game/models";
import { MenuBackdrop } from "./App";
import { audio } from "../game/audio";

const HAIRS: [string, string][] = [["short", "Короткие"], ["long", "Длинные"], ["braid", "Коса"], ["mohawk", "Гребень"], ["bald", "Лысый"], ["hood", "Капюшон"]];
const ACCS: [string, string][] = [["none", "Нет"], ["scar", "Шрам"], ["paint", "Боевая краска"], ["eyepatch", "Повязка"], ["beard", "Борода"], ["mask", "Маска"]];

export function CharacterCreate() {
  const { set, characters, settings } = useGame();
  const [cls, setCls] = useState<ClassId>("warrior");
  const [name, setName] = useState("");
  const [app, setApp] = useState<Appearance>({ skin: 1, hair: "short", hairColor: 1, cloth: 0, trim: 0, accessory: "none" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ engine: Engine; holder: THREE.Group; raf: number } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const engine = new Engine(host.current, { ...settings, resolution: 200, fov: 40 });
    const scene = engine.scene;
    scene.background = new THREE.Color("#0b0705");
    scene.fog = new THREE.Fog("#0b0705", 4, 12);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const torch = new THREE.PointLight(0xffa050, 7, 10, 1.6);
    torch.position.set(1.5, 2.4, 1.6);
    scene.add(torch);
    const rim = new THREE.PointLight(0x6f8fd8, 5, 8, 1.6);
    rim.position.set(-2, 2, -1.5);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshLambertMaterial({ color: "#2a2018" }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const flame = makeFlame(1.4);
    flame.position.set(1.5, 2.3, 1.6);
    scene.add(flame);
    const holder = new THREE.Group();
    scene.add(holder);
    engine.camera.position.set(0, 1.25, 4.4);
    engine.camera.lookAt(0, 1.0, 0);
    const start = performance.now();
    const state = { engine, holder, raf: 0 };
    const loop = () => {
      state.raf = requestAnimationFrame(loop);
      const t = (performance.now() - start) / 1000;
      holder.rotation.y = Math.PI + Math.sin(t * 0.5) * 0.7;
      torch.intensity = 7 + Math.sin(t * 9) * 0.8;
      (flame.material as THREE.SpriteMaterial).map!.offset.x = (Math.floor(t * 10) % 4) * 0.25;
      const rig = holder.userData.rig;
      if (rig) poseRig(rig, { t, moving: 0, phase: 0, state: "idle", st: 0, atk: "", dead: 0, stun: false });
      engine.render(t);
    };
    loop();
    live.current = state;
    return () => {
      cancelAnimationFrame(state.raf);
      engine.dispose();
    };
  }, [settings]);

  useEffect(() => {
    const l = live.current;
    if (!l) return;
    l.holder.clear();
    const rig = makeAvatar(cls, app);
    const items = CLASSES[cls].startItems.map((b) => BASE_BY_ID[b]);
    const w = items.find((b) => b.slot === "weapon");
    const o = items.find((b) => b.slot === "offhand");
    setAvatarWeapons(rig, w?.icon || "", o?.icon || "");
    rig.probe.value.setRGB(0.25, 0.2, 0.16);
    l.holder.add(rig.root);
    l.holder.userData.rig = rig;
  }, [cls, app]);

  const create = async () => {
    setErr("");
    setBusy(true);
    try {
      const r = await api.create(name.trim(), cls, app);
      audio.play("levelup");
      set({ characters: [...characters, r.character], char: r.character, screen: "game", panel: null, results: null });
    } catch (x) {
      setErr(x instanceof ApiError ? x.message : "Ошибка.");
    } finally {
      setBusy(false);
    }
  };

  const c = CLASSES[cls];
  const pick = (label: string, values: string[] | [string, string][], cur: number | string, on: (v: any) => void, swatch = false) => (
    <div className="mb-2">
      <div className="text-parch mb-1 text-xs">{label}</div>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => {
          const val = Array.isArray(v) ? v[0] : i;
          const active = cur === val;
          return swatch ? (
            <button key={i} onClick={() => on(val)} className="h-6 w-6 border-2" style={{ background: v as string, borderColor: active ? "#c9a46a" : "#3d3126" }} />
          ) : (
            <button key={i} onClick={() => on(val)} className={`btn px-2 py-0.5 text-xs ${active ? "btn-gold" : ""}`}>{(v as [string, string])[1]}</button>
          );
        })}
      </div>
    </div>
  );

  return (
    <MenuBackdrop>
      <div className="panel rise flex h-[min(640px,92vh)] w-[min(1100px,96vw)] gap-4 p-4">
        <div className="flex w-[300px] flex-col gap-2">
          <h2 className="panel-title text-xl">Класс</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {CLASS_IDS.map((id) => (
              <button key={id} onClick={() => { setCls(id); audio.play("click"); }} className={`btn py-2 ${id === cls ? "btn-gold" : ""}`} style={{ color: id === cls ? undefined : CLASSES[id].color }}>
                {CLASSES[id].name}
              </button>
            ))}
          </div>
          <div className="mt-2" style={{ color: c.color }}>{c.tagline}</div>
          <div className="text-parch text-sm">{c.description}</div>
          <div className="mt-1 grid grid-cols-3 gap-x-2 text-xs">
            {ATTR_IDS.map((a) => (
              <div key={a}>
                <span className="text-dim">{ATTR_NAMES[a]}</span> {c.attrs[a]}
              </div>
            ))}
          </div>
          <div className="text-dim mt-1 text-xs">Навыки: {skillsOf(cls).map((s) => s.name).join(", ")}</div>
        </div>
        <div ref={host} className="relative min-w-0 flex-1 border-2 border-[#3d3126]" />
        <div className="flex w-[280px] flex-col">
          <h2 className="panel-title mb-2 text-xl">Облик</h2>
          {pick("Кожа", SKIN, app.skin, (v) => setApp({ ...app, skin: v }), true)}
          {pick("Причёска", HAIRS, app.hair, (v) => setApp({ ...app, hair: v }))}
          {pick("Цвет волос", HAIR_COLORS, app.hairColor, (v) => setApp({ ...app, hairColor: v }), true)}
          {pick("Одежда", CLOTH, app.cloth, (v) => setApp({ ...app, cloth: v }), true)}
          {pick("Отделка", TRIM, app.trim, (v) => setApp({ ...app, trim: v }), true)}
          {pick("Особая примета", ACCS, app.accessory, (v) => setApp({ ...app, accessory: v }))}
          <label className="text-parch mt-2 text-sm">
            Имя
            <input className="field mt-1 w-full" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="3–20 символов" />
          </label>
          {err && <div className="mt-2 text-sm text-[#e0505a]">{err}</div>}
          <div className="mt-auto flex gap-2 pt-3">
            <button className="btn" onClick={() => set({ screen: characters.length ? "select" : "select" })}>Назад</button>
            <button className="btn btn-red flex-1 py-2" disabled={busy || name.trim().length < 3} onClick={create}>Создать</button>
          </div>
        </div>
      </div>
    </MenuBackdrop>
  );
}
