import { useSyncExternalStore } from "react";

// Garden sounds (DESIGN.md, garden sounds and rule 48): a looping field recording through one gain node, so fades
// and the instant silence before the microphone opens are exact. Signed-in pages only; the file loads only then.
// The person's choice (on/off, volume) stays on this device.

const FILE = "/sounds/garden.ogg"; // 90 s seamless loop, mono Opus (public/sounds/CREDITS.txt)
const KEY = "garden-sounds";
const FULL = 0.8; // the recording is already mixed quiet (-30 dB); this keeps it a soft background

let ctx: AudioContext | undefined;
let gain: GainNode | undefined;
let started = false;
let holds = 0;
const listeners = new Set<() => void>();

type Prefs = { on: boolean; volume: number; noted: boolean };

function read(): Prefs {
  try {
    return { on: true, volume: 0.6, noted: false, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { on: true, volume: 0.6, noted: false };
  }
}

let prefs: Prefs = { on: true, volume: 0.6, noted: false };

function save(next: Partial<Prefs>) {
  prefs = { ...prefs, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // private window: the choice lasts for this visit
  }
  listeners.forEach((l) => l());
  fade();
}

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** Move the gain to where it should be now, over `seconds`. */
function fade(seconds = 0.6) {
  if (!ctx || !gain) return;
  const target = started && prefs.on && holds === 0 && !hidden() ? FULL * prefs.volume * (document.documentElement.dataset.theme === "dark" ? 0.7 : 1) : 0;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(target, now + seconds);
}

async function load() {
  ctx = new AudioContext();
  gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  try {
    const buffer = await ctx.decodeAudioData(await (await fetch(FILE)).arrayBuffer());
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
  } catch {
    // No recording available: the garden is simply quiet; the switch still works.
  }
  document.addEventListener("visibilitychange", () => fade(0.3));
}

export const sounds = {
  /** After sign-in (or on any signed-in page once the person has pressed something): fade in over 4 seconds. */
  async start() {
    prefs = read();
    if (started) return;
    started = true;
    if (!ctx) await load();
    await ctx!.resume().catch(() => undefined);
    fade(4);
  },
  /** On sign-out: silent at once, and nothing plays until the next sign-in. */
  stop() {
    started = false;
    fade(0.05);
  },
  setOn(on: boolean) {
    save({ on, noted: true });
    if (on && !started) void sounds.start();
  },
  setVolume(volume: number) {
    save({ volume });
  },
  /** The first time sounds play, the note beside the switch is shown once. */
  dismissNote() {
    save({ noted: true });
  },
  /** Silence for the microphone or for a voice playing: resolves once faded (150ms); call the result to let sounds back. */
  async hold() {
    holds++;
    fade(0.15);
    if (started && ctx) await new Promise((r) => setTimeout(r, 160));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holds--;
      fade(1);
    };
  },
};

function subscribe(l: () => void) {
  prefs = read();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The person's sound choice, for the switch and Me. */
export function useSoundPrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => prefs, () => prefs);
}
