import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useGame } from "../store";
import { api, ApiError } from "../api";
import { ATTR_IDS, ATTR_NAMES, CLASSES, CLASS_IDS, type ClassId } from "@shared/data/classes";
import { BASE_BY_ID } from "@shared/data/items";
import { TREES } from "@shared/data/skills";
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
    scene.background = new THREE.Color("#141311");
    scene.fog = new THREE.Fog("#141311", 4, 11);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const torch = new THREE.PointLight(0xffa050, 7, 10, 1.6);
    torch.position.set(1.5, 2.4, 1.6);
    scene.add(torch);
    const rim = new THREE.PointLight(0x8a96b0, 3, 8, 1.6);
    rim.position.set(-2, 2, -1.5);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshLambertMaterial({ color: "#26221d" }));
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
    <div className="flex flex-col gap-2">
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-1">
        {values.map((v, i) => {
          const val = Array.isArray(v) ? v[0] : i;
          const active = cur === val;
          return swatch ? (
            <button
              key={i}
              onClick={() => on(val)}
              aria-label={`${label} ${i + 1}`}
              className="h-7 w-7 rounded-[4px] border transition-colors"
              style={{ background: v as string, borderColor: active ? "#ece6da" : "#efe9de1f", boxShadow: active ? "0 0 0 1px #141311 inset" : undefined }}
            />
          ) : (
            <button key={i} onClick={() => on(val)} className={`btn min-h-7 px-2 text-xs ${active ? "is-on" : ""}`}>{(v as [string, string])[1]}</button>
          );
        })}
      </div>
    </div>
  );

  return (
    <MenuBackdrop scene={false}>
      <div className="rise grid h-full grid-cols-[320px_1fr_320px] gap-8 px-6 pt-20 pb-8">
        <div className="flex min-h-0 flex-col gap-6">
          <h2 className="panel-title">Класс</h2>
          <div className="flex flex-col gap-1">
            {CLASS_IDS.map((id) => (
              <button
                key={id}
                onClick={() => { setCls(id); audio.play("click"); }}
                className={`flex h-10 items-center justify-between rounded-[4px] border px-3 text-left transition-colors ${id === cls ? "border-line-strong bg-ash" : "border-transparent hover:bg-soot"}`}
              >
                <span>{CLASSES[id].name}</span>
                <span className="text-dim text-xs">{CLASSES[id].tagline}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-4 border-t border-line pt-6">
            <p className="text-parch text-sm">{c.description}</p>
            <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
              {ATTR_IDS.map((a) => (
                <div key={a} className="flex justify-between">
                  <dt className="text-dim">{ATTR_NAMES[a]}</dt>
                  <dd>{c.attrs[a]}</dd>
                </div>
              ))}
            </dl>
            <div className="text-sm">
              <div className="label mb-1">Ветки навыков</div>
              <div className="text-parch">{TREES[cls].join(" · ")}</div>
            </div>
          </div>
        </div>
        <div ref={host} className="relative min-w-0 overflow-hidden rounded-[8px]" />
        <div className="flex min-h-0 flex-col gap-4">
          <h2 className="panel-title">Облик</h2>
          {pick("Кожа", SKIN, app.skin, (v) => setApp({ ...app, skin: v }), true)}
          {pick("Причёска", HAIRS, app.hair, (v) => setApp({ ...app, hair: v }))}
          {pick("Цвет волос", HAIR_COLORS, app.hairColor, (v) => setApp({ ...app, hairColor: v }), true)}
          {pick("Одежда", CLOTH, app.cloth, (v) => setApp({ ...app, cloth: v }), true)}
          {pick("Отделка", TRIM, app.trim, (v) => setApp({ ...app, trim: v }), true)}
          {pick("Особая примета", ACCS, app.accessory, (v) => setApp({ ...app, accessory: v }))}
          <label className="flex flex-col gap-1">
            <span className="label">Имя</span>
            <input className="field w-full" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="3–20 символов" />
          </label>
          {err && <div className="text-bad text-sm">{err}</div>}
          <div className="mt-auto flex gap-2">
            <button className="btn h-11" onClick={() => set({ screen: "select" })}>Назад</button>
            <button className="btn btn-primary h-11 flex-1" disabled={busy || name.trim().length < 3} onClick={create}>Создать героя</button>
          </div>
        </div>
      </div>
    </MenuBackdrop>
  );
}
