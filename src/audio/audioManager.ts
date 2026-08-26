/**
 * Zvuk. Všetky efekty sú generované procedurálne cez Web Audio API —
 * appka tak nemá žiadne zvukové súbory na stiahnutie a zvuky sa dajú ladiť
 * zmenou frekvencií namiesto hľadania samplov s vhodnou licenciou.
 *
 * AudioContext sa smie spustiť až po prvom geste používateľa (autoplay policy),
 * preto `unlock()` volá UI pri prvom kliknutí.
 */

export type SoundName =
  | 'uiClick'
  | 'diceRoll'
  | 'diceLand'
  | 'hop'
  | 'capture'
  | 'enter'
  | 'home'
  | 'win'
  | 'skip';

const STORAGE_KEY = 'clovece.audio';

interface AudioSettings {
  muted: boolean;
  volume: number;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private settings: AudioSettings = { muted: false, volume: 0.7 };

  constructor() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(raw) };
      } catch {
        // Poškodené nastavenie nie je dôvod zhodiť appku — ostanú predvolené hodnoty.
      }
    }
  }

  /** Musí sa zavolať z obslužnej rutiny používateľského gesta. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.muted ? 0 : this.settings.volume;
    this.master.connect(this.ctx.destination);
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  get volume(): number {
    return this.settings.volume;
  }

  setMuted(muted: boolean): void {
    this.settings.muted = muted;
    this.applyGain();
    this.persist();
  }

  setVolume(volume: number): void {
    this.settings.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
    this.persist();
  }

  private applyGain(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(
      this.settings.muted ? 0 : this.settings.volume,
      this.ctx.currentTime,
      0.02,
    );
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || this.settings.muted) return;
    switch (name) {
      case 'uiClick':
        this.blip(880, 0.05, 'triangle', 0.16);
        break;
      case 'diceRoll':
        this.noise(0.45, 1600, 0.22);
        break;
      case 'diceLand':
        this.thud(140, 0.16, 0.4);
        break;
      case 'hop':
        this.blip(520 + Math.random() * 80, 0.06, 'sine', 0.2);
        break;
      case 'capture':
        // Zostupný „whoosh" + tvrdý úder — vyhodenie musí byť počuť.
        this.sweep(900, 180, 0.28, 0.3);
        this.thud(90, 0.22, 0.55);
        break;
      case 'enter':
        this.blip(660, 0.1, 'triangle', 0.24);
        this.blip(990, 0.12, 'triangle', 0.18, 0.07);
        break;
      case 'home':
        // Stúpajúca stupnica ako odmena za dobehnutie figúrky.
        [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.16, 'triangle', 0.2, i * 0.075));
        break;
      case 'win':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) =>
          this.blip(f, 0.3, 'sawtooth', 0.16, i * 0.13),
        );
        break;
      case 'skip':
        this.sweep(400, 200, 0.18, 0.16);
        break;
    }
  }

  // --- Generátory ---------------------------------------------------------

  private blip(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
  ): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private sweep(from: number, to: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + duration);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private thud(frequency: number, duration: number, gain: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, t0);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.4, t0 + duration);
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  /** Filtrovaný šum — kotúľanie kocky. */
  private noise(duration: number, cutoff: number, gain: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // Amplitúda klesá — kocka spomaľuje.
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    filter.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.value = gain;
    source.connect(filter).connect(env).connect(this.master!);
    source.start(t0);
  }
}
