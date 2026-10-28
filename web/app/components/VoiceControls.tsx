import { useEffect, useId, useRef, useState } from "react";

import { type Accent, bankVoice, deviceAccent, SLIDERS, VOICES, type VoiceProfile, voiceSample } from "~/lib/patient";
import { play } from "~/lib/recorder";
import { ApiError } from "~/lib/supabase";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Message } from "./Message";

/** Plays a sample of a voice (or a phrase in it); one at a time across the page. */
let stopCurrent: (() => void) | undefined;

export function useSample() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => () => stopCurrent?.(), []);
  async function sample(id: string, profile: VoiceProfile, phrase?: string) {
    stopCurrent?.();
    setError("");
    setPlaying(id);
    try {
      const audio = await voiceSample(profile, phrase);
      stopCurrent = await play(audio, () => setPlaying((p) => (p === id ? null : p)));
    } catch (e) {
      setPlaying(null);
      setError(e instanceof ApiError ? e.message : "I couldn't play that sample. Please try again.");
    }
  }
  return { playing, error, sample };
}

/** DESIGN.md, Setup step 2 and Voice: the six voices as a radio list, each with "Play sample". */
export function VoicePicker({ value, onChange }: { value: VoiceProfile; onChange: (p: VoiceProfile) => void }) {
  const { playing, error, sample } = useSample();
  const name = useId();
  // Read after mounting (the server can't know the device's language); voices in that accent go first.
  const [accent, setAccent] = useState<Accent | null>(null);
  useEffect(() => setAccent(deviceAccent()), []);
  const voices = accent ? [...VOICES].sort((a, b) => Number(b.accent === accent) - Number(a.accent === accent)) : VOICES;
  return (
    <fieldset>
      <legend className="text-title">Choose a voice</legend>
      <p className="mt-1 text-ink-soft">This is the voice that says your words back. You can change it any time.</p>
      <p className="mt-1 text-ink-soft">
        {accent
          ? `Your device is set to ${accent} English, so ${accent} voices come first. Any voice is yours to choose.`
          : "There are American and British English accents so far. Pick whichever sounds most like you."}
      </p>
      {error && (
        <div className="mt-4">
          <Message tone="error">{error}</Message>
        </div>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {voices.map((v) => {
          const checked = value.template === v.key;
          return (
            <li key={v.key} className={"flex items-center gap-2 rounded-card p-2 pl-4 " + (checked ? "bg-raised" : "bg-surface")}>
              <label className="flex min-h-14 flex-1 cursor-pointer items-center gap-3">
                <input type="radio" name={name} checked={checked} onChange={() => onChange({ ...value, template: v.key })} className="size-5 accent-[var(--link)]" />
                <span>
                  <span className={"block " + (checked ? "font-bold" : "font-semibold")}>{v.name}</span>
                  <span className="block text-[1rem] text-ink-soft">
                    {v.about} · {v.accent} accent
                  </span>
                </span>
              </label>
              <Button
                variant="quiet"
                onClick={() => sample(v.key, { ...value, template: v.key })}
                aria-label={`Play a sample of ${v.name}`}
                disabled={playing === v.key}
              >
                <Icon name="play" className="size-5" />
                {playing === v.key ? "Playing…" : "Play"}
              </Button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/** The five fine-tuning sliders, with their plain labels and real ranges. */
export function VoiceSliders({ value, onChange }: { value: VoiceProfile; onChange: (p: VoiceProfile) => void }) {
  return (
    <fieldset className="flex flex-col gap-6">
      <legend className="text-title">Fine-tune it</legend>
      {SLIDERS.map((s) => (
        <label key={s.key} className="block">
          <span className="flex items-baseline justify-between text-label">
            {s.label}
            <span className="font-normal text-ink-soft">{value[s.key] === 0 ? "As it comes" : value[s.key] > 0 ? `${s.high} (${value[s.key]})` : `${s.low} (${value[s.key]})`}</span>
          </span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={1}
            value={value[s.key]}
            onChange={(e) => onChange({ ...value, [s.key]: Number(e.target.value) })}
            className="mt-3 h-12 w-full accent-[var(--link)]"
          />
          <span aria-hidden="true" className="flex justify-between text-[1rem] text-ink-soft">
            <span>{s.low}</span>
            <span>{s.high}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Voice banking: 2 to 10 recordings of the person's earlier voice; picks and tunes a stock voice (it doesn't copy it). */
export function BankVoice({ onProfile }: { onProfile: (p: VoiceProfile) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function choose(files: File[]) {
    setError("");
    setDone(false);
    if (files.length < 2) return setError("Please choose at least 2 recordings.");
    if (files.length > 10) return setError("Please choose at most 10 recordings.");
    if (files.some((f) => f.size > 10 * 1024 * 1024)) return setError("Each recording can be up to 10 MB. One of these is bigger.");
    setBusy(true);
    try {
      onProfile(await bankVoice(files));
      setDone(true);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 422
          ? "I couldn't find clear speech in those recordings. Recordings of the person talking work best."
          : e instanceof ApiError
            ? e.message
            : "Something got stuck. Please try again.",
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section aria-labelledby="bank-title" className="rounded-card bg-surface p-6">
      <h2 id="bank-title" className="text-title">
        Use recordings of your earlier voice
      </h2>
      <p className="mt-2">
        If you have a few clear recordings of yourself speaking from before, I can listen to them and pick the closest voice, then tune it
        to your pitch and pace. It won't copy your voice exactly, but it can come close in feel.
      </p>
      <p className="mt-2 text-[1rem] text-ink-soft">2 to 10 recordings, up to 10 MB each. Voice notes and video sound both work.</p>
      <input ref={input} type="file" accept="audio/*,video/*" multiple className="sr-only" onChange={(e) => choose([...(e.target.files ?? [])])} tabIndex={-1} />
      <Button variant="secondary" className="mt-4" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Listening to them…" : "Choose recordings"}
      </Button>
      <div className="mt-4" aria-live="polite">
        {error && <Message tone="error">{error}</Message>}
        {done && <Message tone="success">Done. I've set the closest voice and tuned it. Have a listen, then save it.</Message>}
      </div>
    </section>
  );
}
