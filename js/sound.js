// Synthesised sound effects (Web Audio): zero audio files, zero network, works offline, ~0 KB.
const N = (f, t, d, o = {}) => ({ f, t, d, type: 'sine', g: 0.5, ...o });
const arp = (fs, step = 0.07, d = 0.2, o = {}) => fs.map((f, i) => N(f, i * step, d, o));

export const SOUNDS = {
  correct: {
    chime: [N(659.25, 0, 0.14), N(880, 0.09, 0.3)],
    ding: [N(1318.5, 0, 0.5, { type: 'triangle' })],
    pop: [N(500, 0, 0.1, { to: 950 })],
    coin: [N(987.8, 0, 0.08, { type: 'square', g: 0.25 }), N(1318.5, 0.08, 0.3, { type: 'square', g: 0.25 })],
    harp: arp([523.25, 659.25, 783.99, 1046.5], 0.07, 0.25, { type: 'triangle' }),
  },
  wrong: {
    buzz: [N(150, 0, 0.26, { type: 'sawtooth', g: 0.3 })],
    thud: [N(130, 0, 0.22, { to: 50, g: 0.8 })],
    descend: [N(392, 0, 0.14, { type: 'triangle' }), N(261.6, 0.12, 0.28, { type: 'triangle' })],
    bonk: [N(230, 0, 0.14, { type: 'square', to: 140, g: 0.25 })],
    soft: [N(330, 0, 0.18), N(277, 0.14, 0.28)],
  },
  ach: {
    fanfare: [...arp([523.25, 659.25, 783.99], 0.11, 0.18, { type: 'triangle' }), N(1046.5, 0.36, 0.55, { type: 'triangle' })],
    sparkle: arp([1568, 1976, 2349, 3136], 0.06, 0.25, { g: 0.3 }),
    levelup: arp([392, 523.25, 659.25, 783.99, 1046.5], 0.08, 0.22, { type: 'triangle' }),
    tada: [N(523.25, 0, 0.16, { type: 'triangle' }), N(659.25, 0, 0.16, { type: 'triangle' }), N(659.25, 0.17, 0.6, { type: 'triangle' }), N(783.99, 0.17, 0.6, { type: 'triangle' }), N(1046.5, 0.17, 0.6, { type: 'triangle' })],
  },
  done: { complete: [...arp([523.25, 659.25, 783.99, 1046.5], 0.09, 0.2, { type: 'triangle' }), N(1046.5, 0.4, 0.5, { type: 'triangle' }), N(783.99, 0.4, 0.5, { type: 'triangle' })] },
};
export const SOUND_OPTIONS = {
  correct: [['chime', 'Chime'], ['ding', 'Bell'], ['pop', 'Pop'], ['coin', 'Coin'], ['harp', 'Harp']],
  wrong: [['buzz', 'Buzz'], ['thud', 'Thud'], ['descend', 'Descend'], ['bonk', 'Bonk'], ['soft', 'Soft']],
  ach: [['fanfare', 'Fanfare'], ['sparkle', 'Sparkle'], ['levelup', 'Level up'], ['tada', 'Ta-da']],
};

// getPrefs() -> { sound, volume (0-100), sCorrect, sWrong, sAch }
export function createSound(getPrefs) {
  let ctx = null, master = null;
  function ensure() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
  function silence() { // cut anything already scheduled, instantly
    if (!ctx) return;
    try { master.disconnect(); } catch {}
    master = ctx.createGain(); master.connect(ctx.destination);
  }
  function seq(notes, volume) {
    const c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    master.gain.value = (volume / 100) ** 1.5;
    const t0 = c.currentTime + 0.005;
    for (const n of notes) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = n.type; o.frequency.setValueAtTime(n.f, t0 + n.t);
      if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.t + n.d);
      g.gain.setValueAtTime(0.0001, t0 + n.t);
      g.gain.exponentialRampToValueAtTime(n.g, t0 + n.t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.t + n.d);
      o.connect(g); g.connect(master);
      o.start(t0 + n.t); o.stop(t0 + n.t + n.d + 0.05);
    }
  }
  function play(kind, force) {
    const p = getPrefs();
    if (!force && (!p.sound || p.volume <= 0)) return;
    const name = kind === 'correct' ? p.sCorrect : kind === 'wrong' ? p.sWrong : kind === 'ach' ? p.sAch : 'complete';
    const group = kind === 'done' ? SOUNDS.done : SOUNDS[kind];
    seq(group[name] || Object.values(group)[0], p.volume);
  }
  // preview a specific sound from Settings (works even when effects are off? no - respects the toggle)
  function preview(kind, name) {
    const p = getPrefs(); if (!p.sound || p.volume <= 0) return;
    seq(SOUNDS[kind][name], p.volume);
  }
  return { unlock, play, preview, silence };
}
