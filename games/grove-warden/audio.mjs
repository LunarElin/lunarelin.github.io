const gainFromDb = db => 10 ** (db / 20);
const chime = (frequencies, duration = .16) => frequencies.map((frequency, i) => [frequency, frequency, duration, 'sine', .15, i * .075]);
const cues = {
  shoot: { gap: .12, notes: [[630, 360, .065, 'sine', .08]] },
  'owl-shoot': { gap: .16, notes: [[720, 1040, .08, 'sine', .07]] },
  hit: { gap: .075, notes: [[250, 110, .075, 'triangle', .15], [1050, 680, .035, 'sine', .055]] },
  kill: { gap: .12, notes: [[430, 660, .11, 'sine', .09]] },
  'player-hit': { gap: .2, priority: true, notes: [[145, 65, .19, 'triangle', .18]] },
  skill: { gap: .25, notes: [[300, 790, .24, 'sine', .12], [450, 990, .18, 'triangle', .055, .045]] },
  burst: { gap: .18, notes: [[230, 95, .15, 'triangle', .12]] },
  pickup: { gap: .095, notes: [[850, 1210, .08, 'sine', .12]] },
  deposit: { gap: .25, ui: true, priority: true, notes: chime([660, 880, 1320]) },
  upgrade: { gap: .2, ui: true, priority: true, notes: chime([523.25, 659.25, 783.99], .2) },
  quest: { gap: .3, ui: true, priority: true, notes: chime([659.25, 783.99, 1046.5], .24) },
  'level-up': { gap: .3, ui: true, priority: true, notes: chime([523.25, 659.25, 783.99, 1046.5], .22) },
  down: { gap: .5, priority: true, notes: [[220, 90, .45, 'triangle', .16]] },
};

// One-shot oscillators cannot be reused; cap live nodes and reserve room for rewards.
export function createGameAudio({ enabled = true, createContext = () => new (window.AudioContext || window.webkitAudioContext)() } = {}) {
  let context, master, combat, ui, compressor, disposed = false, variation = 0, waking = false, wakeGeneration = 0;
  const voices = new Set(), lastCue = new Map(), pendingCues = [], limit = 12;
  function finish(voice) {
    if (voice.finished) return;
    voice.finished = true;
    voice.oscillator.disconnect(); voice.gain.disconnect(); voices.delete(voice);
  }
  function stopVoices() {
    for (const voice of voices) {
      try { voice.oscillator.stop(context.currentTime); } catch { /* Already ended. */ }
      finish(voice);
    }
    lastCue.clear();
  }
  function wake() {
    if (!enabled || disposed) return;
    try {
      if (!context) {
        context = createContext();
        master = context.createGain(); master.gain.value = gainFromDb(-10);
        combat = context.createGain(); combat.gain.value = gainFromDb(-5);
        ui = context.createGain(); ui.gain.value = gainFromDb(-1);
        combat.connect(master); ui.connect(master);
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -10; compressor.knee.value = 12;
        compressor.ratio.value = 6; compressor.attack.value = .003; compressor.release.value = .16;
        master.connect(compressor); compressor.connect(context.destination);
      }
      if (context.state === 'running' || waking) return;
      waking = true; const generation = ++wakeGeneration;
      context.resume().then(() => {
        if (generation !== wakeGeneration || disposed || !enabled) return;
        waking = false;
        const pending = pendingCues.splice(0);
        for (const type of pending) play(type);
      }).catch(() => { if (generation === wakeGeneration) { waking = false; pendingCues.length = 0; } });
    } catch { /* Audio support and autoplay permission are optional. */ }
  }
  function play(type) {
    const cue = cues[type];
    if (!enabled || disposed || !cue) return;
    if (context?.state !== 'running') {
      if (waking && pendingCues.length < 4) pendingCues.push(type);
      return;
    }
    const now = context.currentTime;
    if (now - (lastCue.get(type) ?? -10) < cue.gap) return;
    const capacity = cue.priority ? limit : limit - 4;
    if (voices.size + cue.notes.length > capacity) return;
    lastCue.set(type, now);
    const pitch = cue.ui ? 1 : 2 ** ([0, -.3, .25, -.15, .15][variation++ % 5] / 12);
    for (const [from, to, duration, waveform, peak, delay = 0] of cue.notes) {
      const oscillator = context.createOscillator(), gain = context.createGain(), start = now + delay;
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(from * pitch, start);
      oscillator.frequency.exponentialRampToValueAtTime(to * pitch, start + duration);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain); gain.connect(cue.ui ? ui : combat);
      const voice = { oscillator, gain, finished: false }; voices.add(voice);
      oscillator.onended = () => finish(voice);
      oscillator.start(start); oscillator.stop(start + duration + .02);
    }
  }
  function suspend() {
    if (!context || disposed) return;
    wakeGeneration++; waking = false; pendingCues.length = 0;
    stopVoices(); context.suspend().catch(() => {});
  }
  return {
    wake, play, suspend,
    setEnabled(value) { enabled = Boolean(value); if (enabled) wake(); else suspend(); },
    stats() { return { voices: voices.size, limit, state: context?.state ?? 'idle' }; },
    dispose() {
      if (disposed) return;
      wakeGeneration++; waking = false; pendingCues.length = 0;
      stopVoices(); disposed = true;
      for (const node of [combat, ui, master, compressor]) node?.disconnect();
      context?.close().catch(() => {});
    },
  };
}
