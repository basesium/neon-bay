// Sound, all synthesised with WebAudio: nothing is loaded from a file. An engine hum that
// follows the car's speed, a two-tone siren that follows the nearest police car, a small
// bass loop for the city's night drive, and one-shot effects for shots, punches, crashes,
// pickups and mission paydays. Everything is created on the first user gesture (browsers
// block audio before one) and every call is a no-op while muted or before that gesture.

/** The bass line's notes (Hz) and the beat they fall on, looping every two bars. */
const BASS_NOTES = [55, 0, 55, 65.41, 0, 55, 49, 0, 55, 0, 55, 65.41, 82.41, 0, 73.42, 0];
const BEAT = 0.24;

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let musicTimer = null;
  let musicStep = 0;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      // The engine: a sawtooth through a lowpass, its pitch following the speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // The siren: a sine that flips between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, duration, type, volume, slideTo) {
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch {
      // Audio is decoration: a failed blip never breaks the game.
    }
  }

  function noise(duration, volume, filterFreq) {
    if (!ctx || muted) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume || 0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
      source.stop(ctx.currentTime + duration + 0.02);
    } catch {
      // See blip().
    }
  }

  return {
    /** Call from any user gesture: creates (or resumes) the audio context. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** The engine hum: `speed01` is 0 at a standstill, 1 at full speed; 0 silences it. */
    engine(speed01, dt) {
      if (!ctx || muted) return;
      const target = speed01 > 0.03 ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, ctx.currentTime, 0.08);
      void dt;
    },
    /** The siren: `nearness01` is 1 when a police car is on the player's bumper. */
    siren(nearness01, dt) {
      if (!ctx || muted) return;
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, ctx.currentTime, 0.03);
      }
      sirenGain.gain.setTargetAtTime(nearness01 > 0.02 ? 0.02 + nearness01 * 0.06 : 0, ctx.currentTime, 0.1);
    },
    /** Start the bass loop; safe to call twice. */
    startMusic() {
      if (!ctx || musicTimer !== null) return;
      musicStep = 0;
      musicTimer = window.setInterval(() => {
        if (muted || !ctx) return;
        const note = BASS_NOTES[musicStep % BASS_NOTES.length];
        musicStep += 1;
        if (note > 0) blip(note, BEAT * 0.92, 'triangle', 0.16);
        if (musicStep % 4 === 1) blip(1400, 0.05, 'square', 0.04);
      }, BEAT * 1000);
    },
    stopMusic() {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    shot() {
      noise(0.16, 0.4, 2400);
      blip(220, 0.1, 'square', 0.18, 60);
    },
    punch() {
      noise(0.09, 0.25, 500);
      blip(120, 0.08, 'sine', 0.2, 70);
    },
    crash() {
      noise(0.35, 0.4, 700);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.2);
      window.setTimeout(() => blip(990, 0.12, 'sine', 0.2), 80);
    },
    mission() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.16, 'triangle', 0.22), i * 110);
      });
    },
    busted() {
      [392, 330, 262, 196].forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.22, 'sawtooth', 0.14), i * 150);
      });
    },
    click() {
      blip(880, 0.05, 'square', 0.1);
    },
  };
}
