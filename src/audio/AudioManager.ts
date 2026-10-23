/**
 * Lightweight procedural sound effects synthesised with WebAudio — no audio files to download.
 * All sounds route through a master gain so volume settings and ad-break muting are trivial.
 */
export type SfxName =
  | 'rifle'
  | 'shotgun'
  | 'smg'
  | 'hit'
  | 'headshot'
  | 'kill'
  | 'hurt'
  | 'reload'
  | 'reloadDone'
  | 'dry'
  | 'jump'
  | 'pickup'
  | 'waveStart'
  | 'waveClear'
  | 'enemyAttack'
  | 'enemySpawn'
  | 'death'
  | 'click'
  | 'enemyShoot'
  | 'enemyCharge'
  | 'explosion'
  | 'dash'
  | 'upgrade'
  | 'lastStand'
  | 'zap'
  | 'slam'
  | 'roar'
  | 'achievement'
  | 'crate'
  | 'throw';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  private lastPlayed = new Map<SfxName, number>();

  /** Must be called from a user gesture (browser autoplay policy). Safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.applyVolume();
        const len = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended' && !this.muted) void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
  }

  /** Mutes everything (used during ad breaks and when the tab is hidden). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
    if (!this.ctx) return;
    if (muted) void this.ctx.suspend().catch(() => undefined);
    else void this.ctx.resume().catch(() => undefined);
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.6;
  }

  play(name: SfxName, intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    // Rate-limit identical sounds to avoid harsh stacking (e.g. many hits in one frame).
    const now = ctx.currentTime;
    const minGap = name === 'hit' || name === 'enemyAttack' ? 0.035 : name === 'explosion' ? 0.06 : 0.012;
    if (now - (this.lastPlayed.get(name) ?? -1) < minGap) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case 'rifle':
        this.noise(now, 0.09, 2400, 'lowpass', 0.55 * intensity, 0.8);
        this.tone(now, 'square', 160, 55, 0.08, 0.28 * intensity);
        this.noise(now, 0.03, 6000, 'highpass', 0.18 * intensity);
        break;
      case 'smg':
        this.noise(now, 0.06, 3000, 'lowpass', 0.4 * intensity, 0.9);
        this.tone(now, 'square', 210, 80, 0.05, 0.2 * intensity);
        break;
      case 'shotgun':
        this.noise(now, 0.25, 1500, 'lowpass', 0.8 * intensity, 0.6);
        this.tone(now, 'sawtooth', 110, 35, 0.18, 0.35 * intensity);
        break;
      case 'hit':
        this.tone(now, 'square', 1250, 900, 0.04, 0.12);
        break;
      case 'headshot':
        this.tone(now, 'triangle', 1800, 1700, 0.09, 0.22);
        this.tone(now + 0.03, 'triangle', 2600, 2500, 0.08, 0.14);
        break;
      case 'kill':
        this.noise(now, 0.18, 900, 'lowpass', 0.4, 0.5);
        this.tone(now, 'square', 420, 90, 0.16, 0.18);
        this.tone(now + 0.02, 'triangle', 880, 1320, 0.1, 0.12);
        break;
      case 'hurt':
        this.tone(now, 'sawtooth', 180, 70, 0.22, 0.3);
        this.noise(now, 0.12, 700, 'lowpass', 0.3);
        break;
      case 'reload':
        this.tone(now, 'square', 520, 480, 0.03, 0.12);
        this.tone(now + 0.12, 'square', 360, 330, 0.04, 0.1);
        break;
      case 'reloadDone':
        this.tone(now, 'square', 700, 900, 0.04, 0.12);
        this.noise(now + 0.02, 0.03, 4000, 'highpass', 0.12);
        break;
      case 'dry':
        this.tone(now, 'square', 900, 850, 0.025, 0.08);
        break;
      case 'jump':
        this.noise(now, 0.06, 500, 'lowpass', 0.12);
        break;
      case 'pickup':
        this.tone(now, 'triangle', 660, 660, 0.07, 0.18);
        this.tone(now + 0.07, 'triangle', 990, 990, 0.1, 0.18);
        break;
      case 'waveStart':
        this.tone(now, 'sawtooth', 220, 220, 0.35, 0.16);
        this.tone(now, 'sawtooth', 330, 330, 0.35, 0.1);
        this.tone(now + 0.35, 'sawtooth', 294, 294, 0.5, 0.16);
        break;
      case 'waveClear':
        this.tone(now, 'triangle', 523, 523, 0.12, 0.2);
        this.tone(now + 0.12, 'triangle', 659, 659, 0.12, 0.2);
        this.tone(now + 0.24, 'triangle', 784, 784, 0.3, 0.2);
        break;
      case 'enemyAttack':
        this.noise(now, 0.1, 1200, 'bandpass', 0.25 * intensity);
        this.tone(now, 'sawtooth', 140, 90, 0.1, 0.12 * intensity);
        break;
      case 'enemySpawn':
        this.tone(now, 'sine', 90, 260, 0.3, 0.12 * intensity);
        break;
      case 'death':
        this.tone(now, 'sawtooth', 300, 40, 1.2, 0.3);
        this.noise(now, 0.6, 400, 'lowpass', 0.3);
        break;
      case 'click':
        this.tone(now, 'square', 700, 700, 0.025, 0.06);
        break;
      case 'enemyShoot':
        this.tone(now, 'sawtooth', 900, 220, 0.16, 0.16 * intensity);
        this.noise(now, 0.08, 2500, 'bandpass', 0.15 * intensity, 2);
        break;
      case 'enemyCharge':
        // Rising whine: the audible half of the shooter's telegraph.
        this.tone(now, 'triangle', 300, 1100, 0.55, 0.09 * intensity);
        break;
      case 'explosion':
        this.noise(now, 0.45, 600, 'lowpass', 0.7, 0.7);
        this.tone(now, 'sine', 120, 35, 0.4, 0.45);
        break;
      case 'dash':
        this.noise(now, 0.18, 1800, 'bandpass', 0.3, 1.5);
        this.tone(now, 'sine', 500, 180, 0.15, 0.1);
        break;
      case 'upgrade':
        this.tone(now, 'triangle', 587, 587, 0.09, 0.18);
        this.tone(now + 0.08, 'triangle', 880, 880, 0.09, 0.18);
        this.tone(now + 0.16, 'triangle', 1175, 1175, 0.22, 0.18);
        break;
      case 'zap':
        this.noise(now, 0.12, 4200, 'highpass', 0.25, 1);
        this.tone(now, 'square', 1400, 300, 0.12, 0.08);
        break;
      case 'slam':
        this.noise(now, 0.5, 300, 'lowpass', 0.8, 0.7);
        this.tone(now, 'sine', 80, 30, 0.45, 0.6);
        break;
      case 'roar':
        this.tone(now, 'sawtooth', 70, 50, 1.1, 0.35 * intensity);
        this.tone(now, 'square', 105, 72, 1.1, 0.12 * intensity);
        this.noise(now, 0.9, 500, 'bandpass', 0.25 * intensity, 0.8);
        break;
      case 'achievement':
        this.tone(now, 'triangle', 784, 784, 0.1, 0.18);
        this.tone(now + 0.1, 'triangle', 988, 988, 0.1, 0.18);
        this.tone(now + 0.2, 'triangle', 1319, 1319, 0.35, 0.2);
        break;
      case 'crate':
        this.tone(now, 'square', 330, 660, 0.12, 0.12);
        this.noise(now, 0.08, 2000, 'bandpass', 0.15);
        break;
      case 'throw':
        this.noise(now, 0.14, 900, 'bandpass', 0.25, 1.2);
        break;
      case 'lastStand':
        this.tone(now, 'sawtooth', 160, 320, 0.5, 0.25);
        this.tone(now + 0.05, 'square', 640, 640, 0.3, 0.1);
        break;
    }
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, freq: number, type: BiquadFilterType, gain: number, q = 1): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
