/** Звук целиком синтезируется WebAudio: гул подземелья, шаги, удары, магия, музыка босса. */

type Pos = { x: number; z: number } | undefined;

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  noise!: AudioBuffer;
  listener = { x: 0, z: 0, yaw: 0 };
  private ambient: { stop: () => void } | null = null;
  private bossMusic: { stop: () => void } | null = null;
  private volume = 0.8;
  private music = 0.6;
  private lastPlay = new Map<string, number>();

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return true;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return false;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.music;
    this.musicBus.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = i % 2 ? w : last * 3.5 + w * 0.3;
    }
    return true;
  }

  setVolume(v: number, m: number) {
    this.volume = v;
    this.music = m;
    if (!this.ctx) return;
    this.master.gain.value = v;
    this.musicBus.gain.value = m;
  }

  private spatial(pos: Pos): AudioNode {
    const c = this.ctx!;
    const g = c.createGain();
    if (!pos) {
      g.connect(this.sfxBus);
      return g;
    }
    const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
    const dist = Math.hypot(dx, dz);
    g.gain.value = Math.max(0, 1 - dist / 28) ** 1.4;
    const pan = c.createStereoPanner();
    // правая сторона относительно взгляда
    const rx = Math.cos(this.listener.yaw), rz = -Math.sin(this.listener.yaw);
    pan.pan.value = Math.max(-0.85, Math.min(0.85, ((dx * rx + dz * rz) / (dist || 1)) * Math.min(1, dist / 3)));
    g.connect(pan).connect(this.sfxBus);
    return g;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseHit(out: AudioNode, t: number, o: { type: BiquadFilterType; f: number; f2?: number; q?: number; a?: number; d: number; gain: number }) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = c.createBiquadFilter();
    flt.type = o.type;
    flt.frequency.setValueAtTime(o.f, t);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.d);
    flt.Q.value = o.q ?? 1;
    const g = c.createGain();
    this.env(g, t, o.a ?? 0.005, o.gain, o.d);
    src.connect(flt).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + (o.a ?? 0.005) + o.d + 0.05);
  }

  private tone(out: AudioNode, t: number, o: { type: OscillatorType; f: number; f2?: number; a?: number; d: number; gain: number; detune?: number }) {
    const c = this.ctx!;
    const osc = c.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.a ?? 0.01) + o.d);
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    this.env(g, t, o.a ?? 0.01, o.gain, o.d);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + (o.a ?? 0.01) + o.d + 0.05);
  }

  play(name: string, pos?: Pos, vol = 1) {
    if (!this.ensure()) return;
    const c = this.ctx!;
    const now = c.currentTime;
    const prev = this.lastPlay.get(name) || 0;
    if (now - prev < 0.03) return; // не складываем одинаковые звуки в один кадр
    this.lastPlay.set(name, now);
    const out = this.spatial(pos);
    const v = vol;
    const t = now + 0.005;
    switch (name) {
      case "step":
        this.noiseHit(out, t, { type: "lowpass", f: 520, d: 0.09, gain: 0.22 * v });
        this.tone(out, t, { type: "sine", f: 80, f2: 50, d: 0.06, gain: 0.12 * v });
        break;
      case "swing":
        this.noiseHit(out, t, { type: "bandpass", f: 900, f2: 2600, q: 2, a: 0.04, d: 0.16, gain: 0.35 * v });
        break;
      case "heavy":
        this.noiseHit(out, t, { type: "bandpass", f: 400, f2: 1500, q: 1.5, a: 0.08, d: 0.25, gain: 0.45 * v });
        break;
      case "hit":
        this.noiseHit(out, t, { type: "lowpass", f: 1400, f2: 300, d: 0.12, gain: 0.5 * v });
        this.tone(out, t, { type: "square", f: 140, f2: 60, d: 0.08, gain: 0.14 * v });
        break;
      case "bone":
        this.noiseHit(out, t, { type: "highpass", f: 1800, d: 0.06, gain: 0.35 * v });
        this.tone(out, t, { type: "triangle", f: 900, f2: 500, d: 0.05, gain: 0.12 * v });
        break;
      case "crit":
        this.tone(out, t, { type: "square", f: 1200, f2: 300, d: 0.12, gain: 0.12 * v });
        this.noiseHit(out, t, { type: "lowpass", f: 2400, f2: 300, d: 0.18, gain: 0.55 * v });
        break;
      case "block":
        this.tone(out, t, { type: "square", f: 620, f2: 580, d: 0.18, gain: 0.12 * v });
        this.tone(out, t, { type: "triangle", f: 1240, d: 0.25, gain: 0.08 * v, detune: 13 });
        this.noiseHit(out, t, { type: "highpass", f: 2500, d: 0.05, gain: 0.3 * v });
        break;
      case "parry":
        this.tone(out, t, { type: "triangle", f: 1800, d: 0.5, gain: 0.18 * v });
        this.tone(out, t, { type: "triangle", f: 2420, d: 0.45, gain: 0.1 * v });
        break;
      case "hurt":
        this.noiseHit(out, t, { type: "lowpass", f: 700, f2: 200, d: 0.2, gain: 0.55 * v });
        this.tone(out, t, { type: "sawtooth", f: 160, f2: 90, d: 0.18, gain: 0.12 * v });
        break;
      case "growl":
        this.tone(out, t, { type: "sawtooth", f: 70 + Math.random() * 30, f2: 55, a: 0.08, d: 0.5, gain: 0.16 * v });
        this.noiseHit(out, t, { type: "lowpass", f: 300, a: 0.1, d: 0.45, gain: 0.25 * v });
        break;
      case "shriek":
        this.tone(out, t, { type: "sawtooth", f: 700, f2: 1400, a: 0.05, d: 0.35, gain: 0.08 * v });
        this.noiseHit(out, t, { type: "bandpass", f: 2400, q: 4, a: 0.05, d: 0.35, gain: 0.2 * v });
        break;
      case "death":
        this.noiseHit(out, t, { type: "lowpass", f: 900, f2: 120, d: 0.5, gain: 0.45 * v });
        this.noiseHit(out, t + 0.12, { type: "highpass", f: 2000, d: 0.1, gain: 0.2 * v });
        break;
      case "cast":
        this.tone(out, t, { type: "sine", f: 300, f2: 900, a: 0.02, d: 0.25, gain: 0.18 * v });
        this.noiseHit(out, t, { type: "bandpass", f: 1500, f2: 4000, q: 3, d: 0.25, gain: 0.18 * v });
        break;
      case "fire":
        this.noiseHit(out, t, { type: "lowpass", f: 1200, f2: 400, a: 0.03, d: 0.4, gain: 0.4 * v });
        break;
      case "frost":
        this.tone(out, t, { type: "triangle", f: 2200, f2: 1100, d: 0.4, gain: 0.08 * v });
        this.noiseHit(out, t, { type: "highpass", f: 3000, d: 0.35, gain: 0.25 * v });
        break;
      case "holy":
        for (const f of [523, 659, 784]) this.tone(out, t, { type: "sine", f, a: 0.04, d: 0.6, gain: 0.07 * v });
        break;
      case "dark":
        this.tone(out, t, { type: "sawtooth", f: 110, f2: 55, a: 0.04, d: 0.45, gain: 0.12 * v });
        this.tone(out, t, { type: "sine", f: 220, f2: 90, a: 0.04, d: 0.4, gain: 0.1 * v });
        break;
      case "explode":
        this.noiseHit(out, t, { type: "lowpass", f: 1800, f2: 80, d: 0.7, gain: 0.8 * v });
        this.tone(out, t, { type: "sine", f: 90, f2: 30, d: 0.5, gain: 0.4 * v });
        break;
      case "bow":
        this.tone(out, t, { type: "triangle", f: 200, f2: 120, d: 0.12, gain: 0.2 * v });
        this.noiseHit(out, t, { type: "bandpass", f: 2000, f2: 600, q: 3, d: 0.18, gain: 0.2 * v });
        break;
      case "impact":
        this.noiseHit(out, t, { type: "bandpass", f: 800, q: 1, d: 0.1, gain: 0.3 * v });
        break;
      case "pickup":
        this.tone(out, t, { type: "square", f: 660, d: 0.06, gain: 0.06 * v });
        this.tone(out, t + 0.07, { type: "square", f: 990, d: 0.1, gain: 0.06 * v });
        break;
      case "gold":
        for (let i = 0; i < 3; i++) this.tone(out, t + i * 0.05, { type: "triangle", f: 1800 + i * 300, d: 0.08, gain: 0.07 * v });
        break;
      case "rare":
        for (let i = 0; i < 4; i++) this.tone(out, t + i * 0.09, { type: "triangle", f: [523, 659, 784, 1046][i], d: 0.35, gain: 0.08 * v });
        break;
      case "potion":
        for (let i = 0; i < 4; i++) this.tone(out, t + i * 0.07, { type: "sine", f: 300 + Math.random() * 200, f2: 500, d: 0.06, gain: 0.08 * v });
        break;
      case "levelup":
        for (let i = 0; i < 5; i++) this.tone(out, t + i * 0.11, { type: "square", f: [392, 523, 659, 784, 1046][i], d: 0.3, gain: 0.07 * v });
        break;
      case "chest":
        this.tone(out, t, { type: "sawtooth", f: 120, f2: 180, a: 0.05, d: 0.35, gain: 0.08 * v });
        this.noiseHit(out, t, { type: "bandpass", f: 500, q: 3, a: 0.1, d: 0.4, gain: 0.2 * v });
        break;
      case "secret":
        this.noiseHit(out, t, { type: "lowpass", f: 300, a: 0.3, d: 1.8, gain: 0.6 * v });
        this.tone(out, t, { type: "sawtooth", f: 45, a: 0.3, d: 1.8, gain: 0.15 * v });
        break;
      case "trap":
        this.tone(out, t, { type: "square", f: 300, f2: 900, d: 0.06, gain: 0.08 * v });
        this.noiseHit(out, t, { type: "highpass", f: 2500, d: 0.08, gain: 0.25 * v });
        break;
      case "dodge":
        this.noiseHit(out, t, { type: "bandpass", f: 600, f2: 1800, q: 1, a: 0.02, d: 0.2, gain: 0.25 * v });
        break;
      case "break":
        this.noiseHit(out, t, { type: "bandpass", f: 1800, q: 1.2, d: 0.18, gain: 0.55 * v });
        for (let i = 0; i < 4; i++) this.noiseHit(out, t + 0.04 + i * 0.05, { type: "highpass", f: 2500 + i * 400, d: 0.05, gain: 0.25 * v });
        this.tone(out, t, { type: "triangle", f: 420, f2: 180, d: 0.12, gain: 0.12 * v });
        break;
      case "wood":
        this.noiseHit(out, t, { type: "lowpass", f: 900, f2: 300, d: 0.22, gain: 0.6 * v });
        this.tone(out, t, { type: "square", f: 140, f2: 70, d: 0.1, gain: 0.14 * v });
        break;
      case "drip":
        this.tone(out, t, { type: "sine", f: 1600 + Math.random() * 900, f2: 700, d: 0.09, gain: 0.05 * v });
        break;
      case "zap":
        this.noiseHit(out, t, { type: "highpass", f: 2500, a: 0.005, d: 0.18, gain: 0.35 * v });
        this.tone(out, t, { type: "sawtooth", f: 900, f2: 120, d: 0.15, gain: 0.08 * v });
        break;
      case "fuse":
        this.noiseHit(out, t, { type: "highpass", f: 4000, f2: 7000, a: 0.02, d: 0.35, gain: 0.3 * v });
        break;
      case "crash":
        this.noiseHit(out, t, { type: "lowpass", f: 1800, f2: 120, d: 0.8, gain: 0.9 * v });
        for (let i = 0; i < 6; i++) this.tone(out, t + i * 0.04, { type: "square", f: 900 + i * 230, f2: 400, d: 0.18, gain: 0.05 * v });
        break;
      case "lever":
        this.tone(out, t, { type: "square", f: 220, f2: 110, d: 0.08, gain: 0.12 * v });
        this.noiseHit(out, t + 0.05, { type: "bandpass", f: 1200, q: 3, d: 0.15, gain: 0.3 * v });
        break;
      case "flame":
        this.noiseHit(out, t, { type: "lowpass", f: 1200, f2: 400, a: 0.1, d: 0.9, gain: 0.45 * v });
        break;
      case "ghost":
        this.tone(out, t, { type: "sine", f: 520, f2: 380, a: 0.2, d: 0.7, gain: 0.05 * v, detune: 20 });
        this.noiseHit(out, t, { type: "bandpass", f: 900, q: 6, a: 0.2, d: 0.6, gain: 0.12 * v });
        break;
      case "paper":
        this.noiseHit(out, t, { type: "highpass", f: 3000, a: 0.03, d: 0.2, gain: 0.18 * v });
        break;
      case "nomana":
        this.tone(out, t, { type: "square", f: 180, d: 0.12, gain: 0.06 * v });
        break;
      case "click":
        this.tone(out, t, { type: "square", f: 880, d: 0.03, gain: 0.04 * v });
        break;
      case "portal":
        this.tone(out, t, { type: "sine", f: 200, f2: 800, a: 0.3, d: 1.2, gain: 0.15 * v });
        this.noiseHit(out, t, { type: "bandpass", f: 600, f2: 3000, q: 5, a: 0.3, d: 1.2, gain: 0.2 * v });
        break;
      case "shrine":
        for (const f of [392, 494, 587, 740]) this.tone(out, t, { type: "sine", f, a: 0.1, d: 1.2, gain: 0.06 * v });
        break;
      case "roar":
        this.tone(out, t, { type: "sawtooth", f: 55, f2: 40, a: 0.15, d: 1.2, gain: 0.3 * v });
        this.noiseHit(out, t, { type: "lowpass", f: 500, f2: 150, a: 0.15, d: 1.1, gain: 0.5 * v });
        break;
      case "clang":
        // молот по наковальне: звонкий металл с долгим хвостом
        this.tone(out, t, { type: "triangle", f: 1480, d: 0.55, gain: 0.16 * v });
        this.tone(out, t, { type: "triangle", f: 2230, d: 0.35, gain: 0.08 * v, detune: 9 });
        this.tone(out, t, { type: "square", f: 330, f2: 300, d: 0.12, gain: 0.05 * v });
        this.noiseHit(out, t, { type: "highpass", f: 3000, d: 0.05, gain: 0.3 * v });
        break;
      case "caw":
        for (const dt of [0, 0.28]) {
          this.tone(out, t + dt, { type: "sawtooth", f: 760, f2: 520, a: 0.02, d: 0.2, gain: 0.07 * v });
          this.noiseHit(out, t + dt, { type: "bandpass", f: 1300, q: 3, a: 0.02, d: 0.2, gain: 0.18 * v });
        }
        break;
      case "purr":
        // мурлыканье: низкий шорох с частыми «вдохами»
        for (let i = 0; i < 22; i++) this.noiseHit(out, t + i * 0.045, { type: "lowpass", f: 180, a: 0.012, d: 0.03, gain: (0.35 + 0.2 * Math.sin(i * 0.6)) * v });
        break;
      case "crackle":
        for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) this.noiseHit(out, t + Math.random() * 0.12, { type: "highpass", f: 1800 + Math.random() * 2000, d: 0.015 + Math.random() * 0.02, gain: 0.25 * v });
        break;
      case "windup":
        this.noiseHit(out, t, { type: "bandpass", f: 300, f2: 900, q: 2, a: 0.2, d: 0.2, gain: 0.15 * v });
        break;
      case "slam":
        this.noiseHit(out, t, { type: "lowpass", f: 600, f2: 60, d: 0.6, gain: 0.8 * v });
        this.tone(out, t, { type: "sine", f: 70, f2: 30, d: 0.5, gain: 0.5 * v });
        break;
      default:
        break;
    }
  }

  /** Фоновый гул подземелья или потрескивание костра в лагере. */
  startAmbient(kind: "dungeon" | "hub") {
    if (!this.ensure()) return;
    this.stopAmbient();
    const c = this.ctx!;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(1, c.currentTime + 3);
    out.connect(this.musicBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const n = c.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = kind === "hub" ? 900 : 220;
    const ng = c.createGain();
    ng.gain.value = kind === "hub" ? 0.05 : 0.22;
    n.connect(lp).connect(ng).connect(out);
    n.start();
    nodes.push(n);
    const base = kind === "hub" ? 73.4 : 55;
    for (const [mul, det, vol] of [[1, 0, 0.05], [1.5, 7, 0.025], [2.01, -5, 0.02], [0.5, 0, 0.05]] as const) {
      const o = c.createOscillator();
      o.type = kind === "hub" ? "triangle" : "sawtooth";
      o.frequency.value = base * mul;
      o.detune.value = det;
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 260;
      const g = c.createGain();
      g.gain.value = vol * (kind === "hub" ? 0.6 : 1);
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lg = c.createGain();
      lg.gain.value = vol * 0.6;
      lfo.connect(lg).connect(g.gain);
      o.connect(f).connect(g).connect(out);
      o.start();
      lfo.start();
      nodes.push(o, lfo);
    }
    // капли и далёкие звуки
    let alive = true;
    const drip = () => {
      if (!alive || !this.ctx) return;
      const t = c.currentTime;
      if (kind === "dungeon") {
        this.tone(out, t, { type: "sine", f: 1400 + Math.random() * 1200, f2: 600, d: 0.12, gain: 0.03 + Math.random() * 0.03 });
        if (Math.random() < 0.25) this.noiseHit(out, t + 0.2, { type: "lowpass", f: 180, a: 0.8, d: 2.5, gain: 0.12 });
      } else {
        for (let i = 0; i < 4; i++) this.noiseHit(out, t + Math.random() * 0.8, { type: "highpass", f: 3000, d: 0.02, gain: 0.05 + Math.random() * 0.05 });
      }
      setTimeout(drip, 900 + Math.random() * 4000);
    };
    setTimeout(drip, 1500);
    this.ambient = {
      stop: () => {
        alive = false;
        const t = c.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 1.5);
        nodes.forEach((x) => x.stop(t + 1.6));
      },
    };
  }

  stopAmbient() {
    this.ambient?.stop();
    this.ambient = null;
    this.stopBoss();
  }

  /** Тяжёлый ритм во время боя с боссом. */
  startBoss() {
    if (!this.ensure() || this.bossMusic) return;
    const c = this.ctx!;
    const out = c.createGain();
    out.gain.value = 0.9;
    out.connect(this.musicBus);
    let alive = true;
    let step = 0;
    const notes = [55, 55, 65.4, 55, 49, 55, 73.4, 61.7];
    const tick = () => {
      if (!alive || !this.ctx) return;
      const t = c.currentTime + 0.05;
      if (step % 2 === 0) this.tone(out, t, { type: "sine", f: 90, f2: 40, d: 0.25, gain: 0.5 });
      if (step % 4 === 2) this.noiseHit(out, t, { type: "bandpass", f: 1800, q: 1, d: 0.12, gain: 0.18 });
      this.tone(out, t, { type: "sawtooth", f: notes[Math.floor(step / 2) % notes.length], d: 0.28, gain: 0.07 });
      step++;
      setTimeout(tick, 300);
    };
    tick();
    this.bossMusic = {
      stop: () => {
        alive = false;
        out.gain.linearRampToValueAtTime(0, c.currentTime + 1);
      },
    };
  }

  stopBoss() {
    this.bossMusic?.stop();
    this.bossMusic = null;
  }
}

export const audio = new AudioEngine();
