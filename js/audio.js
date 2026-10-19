'use strict';
// Tiny synthesized sound effects (WebAudio, no files).
const SFX = {
  ac: null, muted: false, noiseBuf: null,
  unlock() {
    try {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        const n = this.ac.sampleRate * 1.5, b = this.ac.createBuffer(1, n, this.ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
      }
      if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
    } catch (e) { this.ac = null; }
  },
  _ok() { return this.ac && !this.muted && this.ac.state === 'running'; },
  tone(f0, f1, dur, type, vol) {
    if (!this._ok()) return;
    const a = this.ac, o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, freq, vol) {
    if (!this._ok()) return;
    const a = this.ac, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
    s.buffer = this.noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + dur);
  },
  boom(r) { this.noise(0.4 + r / 80, 900 + r * 20, 0.5); this.tone(120, 30, 0.4, 'sine', 0.3); },
  shoot() { this.noise(0.25, 2500, 0.15); this.tone(300, 80, 0.2, 'sawtooth', 0.05); },
  bounce() { this.tone(500, 300, 0.06, 'square', 0.04); },
  ribbit() { this.tone(180, 320, 0.08, 'square', 0.06); setTimeout(() => this.tone(200, 360, 0.08, 'square', 0.06), 90); },
  splash() { this.noise(0.5, 1600, 0.2); },
  jump() { this.tone(260, 520, 0.12, 'triangle', 0.08); },
  flip() { this.tone(240, 720, 0.18, 'triangle', 0.08); setTimeout(() => this.tone(520, 880, 0.08, 'triangle', 0.05), 110); },
  land() { this.noise(0.12, 500, 0.12); },
  tick() { this.tone(900, 880, 0.04, 'square', 0.03); },
  select() { this.tone(660, 990, 0.06, 'triangle', 0.06); },
  crate() { this.tone(880, 440, 0.25, 'triangle', 0.06); setTimeout(() => this.tone(660, 330, 0.25, 'triangle', 0.05), 160); },
  pickup() { [660, 880, 1320].forEach((f, i) => setTimeout(() => this.tone(f, f * 1.02, 0.09, 'square', 0.06), i * 70)); },
  laser() { this.tone(1800, 200, 0.35, 'sawtooth', 0.07); this.noise(0.2, 4000, 0.08); },
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.18, 'triangle', 0.1), i * 140)); },
};
