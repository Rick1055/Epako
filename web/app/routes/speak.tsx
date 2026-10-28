import { useEffect, useRef, useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";

import { Button } from "~/components/Button";
import { PageIntro } from "~/components/PageIntro";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { RecordButton, type RecordState } from "~/components/RecordButton";
import { DailyLeaves, PracticePrompts, VoiceBars } from "~/components/SpeakParts";
import { TextField } from "~/components/TextField";
import { myProfile } from "~/lib/patient";
import { byDay, practice } from "~/lib/progress";
import { type Mic, MicError, openMic, play } from "~/lib/recorder";
import { api, ApiError, session, supabase } from "~/lib/supabase";
import type { Route } from "./+types/speak";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Speak - Epako Voice" }];
}

export async function clientLoader() {
  const [profile, { sessions, utterances }] = await Promise.all([myProfile(), practice(60)]);
  return { consent: profile.consent_audio_storage, today: byDay(sessions, utterances, 1)[0].phrases, usual: usualPhrases(utterances) };
}

/** The person's own most-said phrases (last 60 days): when a phrase comes out wrong, one tap picks what they meant. */
function usualPhrases(utterances: { corrected_text: string | null }[]) {
  // Grouped ignoring case and punctuation ("walk." and "walk" are one phrase); shown as most recently said.
  const groups = new Map<string, { text: string; n: number }>();
  for (const u of utterances) {
    const text = u.corrected_text?.trim();
    if (!text || text.length > 80) continue;
    const key = text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { text, n: 1 });
  }
  return [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((g) => g.text);
}

type Result = { raw_transcript: string; repaired_text: string; rectified_audio: string | null; voice_error: string | null; latency_ms: number };
type Said = { text: string; audio: string | null; confirmed: boolean };

/** The session lasts while this tab practises; Session summary finishes it. */
export const SESSION_KEY = "speak-session";

async function sessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (await api<{ session_id: string }>("/api/sessions", { method: "POST" })).session_id;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const MIC_HELP = {
  denied: "The microphone is blocked for this site. Tap the lock or settings icon next to the web address, allow the microphone, then try again.",
  "no-mic": "I can't find a microphone. If you use a headset, check it's plugged in, then try again.",
  unsupported: "This browser can't share its microphone with me. A recent Chrome, Edge, Firefox or Safari will work.",
};

export default function Speak() {
  const { consent, today, usual } = useLoaderData<typeof clientLoader>();
  const navigate = useNavigate();
  const [state, setState] = useState<RecordState>("idle");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixed, setFixed] = useState("");
  const [saved, setSaved] = useState<"" | "yes" | "fixed">("");
  const [said, setSaid] = useState<Said[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptPage, setPromptPage] = useState(0);
  const mic = useRef<Mic | undefined>(undefined);
  const ring = useRef<HTMLSpanElement>(null);
  const level = useRef(0);
  const stopVoice = useRef<(() => void) | undefined>(undefined);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(
    () => () => {
      mic.current?.cancel();
      stopVoice.current?.();
    },
    [],
  );

  async function press() {
    if (state === "listening") return stop();
    stopVoice.current?.();
    setNotice("");
    setResult(null);
    setSaved("");
    setFixing(false);
    try {
      mic.current = await openMic(
        (l) => {
          level.current = l;
          ring.current?.style.setProperty("--level", l.toFixed(3));
        },
        () => void stopRef.current(), // hands-free: a pause after speaking ends the phrase
      );
      setState("listening");
    } catch (e) {
      setNotice(MIC_HELP[e instanceof MicError ? e.problem : "unsupported"]);
    }
  }

  async function stop() {
    const m = mic.current;
    mic.current = undefined;
    level.current = 0;
    if (!m) return;
    const { wav, seconds } = await m.stop();
    if (seconds < 0.1) {
      setState("idle");
      return setNotice("That was too short for me to hear anything. Tap, say your phrase, then tap again.");
    }
    if (seconds > 60) {
      setState("idle");
      return setNotice("That was over a minute, which is more than I can take in one go. Try a shorter phrase, under 60 seconds.");
    }
    setState("thinking");
    try {
      const id = await sessionId();
      const form = new FormData();
      form.append("file", wav, "speech.wav");
      const started = performance.now();
      const r = await api<Omit<Result, "latency_ms"> & { speech_detected: boolean }>("/api/rectify", { method: "POST", body: form });
      void quietly(id, wav);
      if (!r.speech_detected || !r.repaired_text) {
        setState("idle");
        return setNotice("I didn't catch that. Try a little closer to the mic.");
      }
      setResult({ ...r, latency_ms: Math.round(performance.now() - started) });
      setFixed(r.repaired_text);
      requestAnimationFrame(() => resultRef.current?.focus());
      if (r.rectified_audio) speak(r.rectified_audio);
      else setState("idle");
    } catch (e) {
      setState("idle");
      setNotice(e instanceof ApiError ? e.message : "Something got stuck on our side. Please try again.");
    } finally {
    }
  }

  /** In the background while the person carries on: measurements, and the recording if they chose to keep it. */
  async function quietly(id: string, wav: Blob) {
    const form = new FormData();
    form.append("session_id", id);
    form.append("file", wav, "speech.wav");
    api("/api/session/analyze", { method: "POST", body: form }).catch(() => undefined);
    if (consent) {
      const uid = (await session())?.user.id;
      // A failed upload loses only the optional copy; the phrase itself is unaffected.
      if (uid) await supabase().storage.from("patient_audio").upload(`${uid}/${id}/${Date.now()}.wav`, wav, { contentType: "audio/wav" });
    }
  }

  async function speak(audio: string) {
    setState("speaking");
    stopVoice.current = await play(audio, () => setState((s) => (s === "speaking" ? "idle" : s)));
  }

  async function confirm(finalText: string) {
    if (!result) return;
    const done = (confirmed: boolean) => {
      setSaved(confirmed ? "yes" : "fixed");
      setSaid((list) => [{ text: finalText, audio: confirmed ? result.rectified_audio : null, confirmed }, ...list]);
      setFixing(false);
      setPrompt(null);
    };
    try {
      const id = await sessionId();
      // The server decides whether it was a yes (it compares words, so a changed comma is still a yes).
      const { confirmed } = await api<{ confirmed: boolean }>(`/api/sessions/${id}/utterances`, {
        method: "POST",
        body: JSON.stringify({ raw_transcript: result.raw_transcript, shown_text: result.repaired_text, final_text: finalText, latency_ms: result.latency_ms }),
      });
      done(confirmed);
    } catch (e) {
      // Stored; only this round of learning was lost.
      if (e instanceof ApiError && e.detail.startsWith("Your sentence was saved")) return done(finalText === result.repaired_text);
      setNotice(e instanceof ApiError ? e.message : "I couldn't save that just now. Please try again.");
    }
  }

  const stopRef = useRef(stop);
  stopRef.current = stop;
  const busy = state === "thinking" || state === "speaking";

  return (
    <>
      <PageIntro>
        <h1 className="sr-only">Speak</h1>
        <div className="flex flex-col gap-8">
          <DailyLeaves done={today + said.length} />
          {prompt && (
            <div className="rounded-card bg-surface px-5 py-4">
              <p className="text-label text-ink-soft">Try saying</p>
              <p className="mt-1 text-title">{prompt}</p>
            </div>
          )}
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-8">
            <RecordButton ref={ring} state={state} onPress={press} />
            <VoiceBars level={level} active={state === "listening"} />
          </div>
          {notice && <Message tone="error">{notice}</Message>}
        </div>
      </PageIntro>

      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex w-full max-w-[44rem] flex-col gap-10">
          {result && (
            <section ref={resultRef} tabIndex={-1} aria-label="What I understood" className="rounded-card bg-surface p-6 outline-none">
              <p key={result.repaired_text} className="page-in text-display text-balance">
                {result.repaired_text}
              </p>
              <p className="mt-4 text-ink-soft">
                What I heard: <span className="text-ink">{result.raw_transcript}</span>
              </p>
              {result.voice_error && (
                <div className="mt-4">
                  <Message tone="error">
                    Your voice needs saving again before I can say this out loud.{" "}
                    <Link to="/voice" className="font-semibold underline underline-offset-4">
                      Go to my voice
                    </Link>
                  </Message>
                </div>
              )}
              {result.rectified_audio && (
                <Button variant="quiet" className="mt-2 -ml-3" onClick={() => speak(result.rectified_audio!)} disabled={busy}>
                  <Icon name="play" className="size-5" />
                  Hear it again
                </Button>
              )}

              {saved ? (
                <div className="mt-6 flex flex-col gap-4">
                  <Message tone="success">{saved === "yes" ? "Lovely. Saved, and a new leaf for today." : "Thanks. I'll remember how you say that."}</Message>
                  {/* The next step right here, so nobody has to scroll back up to the record button. */}
                  <Button variant="secondary" className="self-start" onClick={press}>
                    <Icon name="mic" className="size-5" />
                    Say another
                  </Button>
                </div>
              ) : fixing ? (
                <form
                  className="mt-6 flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (fixed.trim()) void confirm(fixed.trim());
                  }}
                >
                  {/* Pick before typing: typing is hard for many people this app is for. */}
                  {usual.filter((t) => t !== result.repaired_text).length > 0 && (
                    <fieldset>
                      <legend className="font-semibold">Did you mean one of your usual phrases?</legend>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        {usual
                          .filter((t) => t !== result.repaired_text)
                          .map((t) => (
                            <Button key={t} variant="secondary" className="justify-start text-left" onClick={() => confirm(t)}>
                              {t}
                            </Button>
                          ))}
                      </div>
                    </fieldset>
                  )}
                  <TextField
                    label={usual.length ? "Or fix the words yourself" : "What did you mean?"}
                    hint="Fix the words, then send. Each fix teaches me your way of speaking."
                    value={fixed}
                    onChange={(e) => setFixed(e.target.value)}
                    maxLength={500}
                    autoFocus={!usual.length}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button type="submit" variant="secondary">
                      Send
                    </Button>
                    <Button variant="quiet" onClick={press}>
                      <Icon name="mic" className="size-5" />
                      Say it again instead
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button className="w-full sm:w-auto" onClick={() => confirm(result.repaired_text)}>
                    Yes, that's right
                  </Button>
                  <Button variant="secondary" onClick={() => setFixing(true)}>
                    Not quite
                  </Button>
                </div>
              )}
            </section>
          )}

          {!result && state === "idle" && (
            <PracticePrompts
              page={promptPage}
              onPick={(p) => setPrompt(p)}
              onMore={() => setPromptPage((n) => n + 1)}
            />
          )}

          {said.length > 0 && (
            <section aria-labelledby="said-title">
              <h2 id="said-title" className="text-title">
                This visit
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {said.map((s, i) => (
                  <li key={said.length - i} className="flex min-h-14 items-center gap-3 rounded-card bg-surface px-5 py-3">
                    <Icon name={s.confirmed ? "check" : "leaf"} className="size-5 shrink-0 text-link" />
                    <span className="flex-1">{s.text}</span>
                    {s.audio && (
                      <button type="button" onClick={() => speak(s.audio!)} disabled={busy} className="inline-flex size-12 items-center justify-center rounded-full text-link" aria-label={`Hear "${s.text}" again`}>
                        <Icon name="play" className="size-5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <Button variant="secondary" className="mt-6" onClick={() => navigate("/speak/done")}>
                Finish for now
              </Button>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
