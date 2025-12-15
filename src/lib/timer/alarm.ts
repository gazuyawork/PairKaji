'use client';

export type AlarmController = {
  prepare: () => Promise<void>;
  play: () => void;
  stop: () => void;
  isPlaying: () => boolean;
  dispose: () => void;
};

export function createAlarmController(): AlarmController {
  let audioCtx: AudioContext | null = null;
  let gain: GainNode | null = null;
  let osc: OscillatorNode | null = null;
  let intervalId: number | null = null;
  let playing = false;

  const ensureContext = () => {
    if (audioCtx) return audioCtx;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
    gain = audioCtx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(audioCtx.destination);
    return audioCtx;
  };

  const startBeep = () => {
    const ctx = ensureContext();
    if (!gain) return;

    if (osc) {
      try { osc.stop(); } catch {}
      try { osc.disconnect(); } catch {}
      osc = null;
    }

    osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);

    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02);

    osc.start();
  };

  const stopBeep = () => {
    if (!audioCtx || !gain) return;

    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }

    if (osc) {
      try {
        gain.gain.cancelScheduledValues(audioCtx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
      } catch {}

      try { osc.stop(audioCtx.currentTime + 0.06); } catch {}
      try { osc.disconnect(); } catch {}
      osc = null;
    }
  };

  return {
    prepare: async () => {
      const ctx = ensureContext();
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }
    },

    play: () => {
      if (playing) return;
      playing = true;

      try {
        const ctx = ensureContext();
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {}

      startBeep();
      intervalId = window.setInterval(() => {
        startBeep();
      }, 900);
    },

    stop: () => {
      playing = false;
      stopBeep();
    },

    isPlaying: () => playing,

    dispose: () => {
      playing = false;
      stopBeep();
      if (audioCtx) {
        try { audioCtx.close(); } catch {}
      }
      audioCtx = null;
      gain = null;
      osc = null;
    },
  };
}
