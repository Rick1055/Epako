// Live signals from the page to the one persistent scene, read every drawn frame (no React re-render).
export const signals = {
  /** 0..1 loudness of the person's voice while the microphone is open: the grass sways with it. */
  voice: 0,
  /** The recogniser is working: the lanterns breathe. */
  working: false,
};

export const garden = {
  setVoice(level: number) {
    signals.voice = level;
  },
  setWorking(on: boolean) {
    signals.working = on;
  },
};
