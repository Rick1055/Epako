import { sounds } from "./sounds";

// The microphone: plain 16 kHz mono WAV (what the speech API reads best), and a live 0..1 loudness for the meter
// and the garden. Garden sounds fade out before the mic opens and come back after it closes (DESIGN.md, rule 48).

export type MicProblem = "denied" | "no-mic" | "unsupported";

export class MicError extends Error {
  constructor(public problem: MicProblem) {
    super(problem);
  }
}

export type Mic = {
  /** Stop and get the recording. */
  stop(): Promise<{ wav: Blob; seconds: number }>;
  /** Stop and throw the recording away. */
  cancel(): void;
};

const RATE = 16000;
// Copies each block of samples out of the audio thread.
const TAP = `registerProcessor("tap", class extends AudioWorkletProcessor {
  process(inputs) { const c = inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; }
});`;

/**
 * `onPause`: called once when the person has spoken and then been quiet for `pauseSeconds` (hands-free end of a
 * phrase; dysarthric speech often pauses mid-phrase, so the wait is generous).
 */
export async function openMic(onLevel: (level: number) => void, onPause?: () => void, pauseSeconds = 2.5): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") throw new MicError("unsupported");
  const release = await sounds.hold();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    release();
    const name = (e as DOMException).name;
    throw new MicError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "no-mic" : "unsupported");
  }

  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, "tap");
  const chunks: Float32Array[] = [];
  let level = 0;
  let spoke = false;
  let quiet = 0;
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    chunks.push(e.data);
    let sum = 0;
    for (const s of e.data) sum += s * s;
    // Speech sits around -30 dBFS RMS; map roughly -55..-15 dB onto 0..1, rising fast and falling slowly.
    const db = 10 * Math.log10(sum / e.data.length + 1e-10);
    const target = Math.min(1, Math.max(0, (db + 55) / 40));
    level = target > level ? target : level * 0.97 + target * 0.03;
    onLevel(level);
    if (!onPause) return;
    if (target > 0.35) {
      spoke = true;
      quiet = 0;
    } else if (spoke && target < 0.2 && (quiet += e.data.length / ctx.sampleRate) >= pauseSeconds) {
      spoke = false;
      onPause();
    }
  };
  source.connect(tap);

  const close = () => {
    source.disconnect();
    tap.port.onmessage = null;
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    onLevel(0);
    setTimeout(release, 1000);
  };

  return {
    async stop() {
      close();
      const pcm = trim(resample(join(chunks), ctx.sampleRate, RATE), RATE);
      return { wav: wav(pcm, RATE), seconds: pcm.length / RATE };
    },
    cancel: close,
  };
}

function join(chunks: Float32Array[]) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Down to `to` Hz by averaging each output sample's span of input (a simple low-pass, enough for speech). */
function resample(input: Float32Array, from: number, to: number) {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += input[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}

/**
 * Cuts the silence before and after the speech (keeping 0.35 s either side), so the recogniser gets less noise to
 * misread and less audio to work through. Nothing louder than about -45 dBFS: left as it is (the server decides).
 */
function trim(pcm: Float32Array, rate: number) {
  const frame = Math.round(rate * 0.02);
  const loud: number[] = [];
  for (let i = 0; i + frame <= pcm.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += pcm[j] * pcm[j];
    if (10 * Math.log10(sum / frame + 1e-10) > -45) loud.push(i);
  }
  if (!loud.length) return pcm;
  const pad = Math.round(rate * 0.35);
  return pcm.slice(Math.max(0, loud[0] - pad), Math.min(pcm.length, loud[loud.length - 1] + frame + pad));
}

/** 16-bit PCM WAV. */
export function wav(pcm: Float32Array, rate: number) {
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([view], { type: "audio/wav" });
}

/** Play audio (a WAV from the API as a data address or bare base64, or a Blob), with garden sounds silent while it speaks. */
export async function play(audio: string | Blob, onEnd?: () => void) {
  const release = await sounds.hold();
  // The API already sends a complete data address (data:audio/wav;base64,...); a bare base64 string is wrapped.
  const src = typeof audio !== "string" ? URL.createObjectURL(audio) : audio.startsWith("data:") ? audio : `data:audio/wav;base64,${audio}`;
  const el = new Audio(src);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    release();
    if (typeof audio !== "string") URL.revokeObjectURL(src);
    onEnd?.();
  };
  el.onended = done;
  el.onerror = done;
  await el.play().catch(done);
  return () => {
    el.pause();
    done();
  };
}
