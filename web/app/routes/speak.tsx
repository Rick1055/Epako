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
import { type LiveStream, type Mic, MicError, openLiveStream, openMic, play } from "~/lib/recorder";
import { ConversationSocket, type RectifiedOutput, type Telemetry } from "~/lib/conversation";
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
  const [mode, setMode] = useState<"practice" | "conversation">("practice");
  const [convStatus, setConvStatus] = useState<"idle" | "connecting" | "active" | "error">("idle");
  const [messages, setMessages] = useState<{ id: string; raw: string; text: string; time: string; latency?: number }[]>([]);
  const [state, setState] = useState<RecordState>("idle");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixed, setFixed] = useState("");
  const [saved, setSaved] = useState<"" | "yes" | "fixed">("");
  const [said, setSaid] = useState<Said[]>([]);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptPage, setPromptPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const startingMic = useRef(false);
  const mic = useRef<Mic | undefined>(undefined);
  const liveStream = useRef<LiveStream | undefined>(undefined);
  const convSocket = useRef<ConversationSocket | undefined>(undefined);
  const [isSpeakingLive, setIsSpeakingLive] = useState(false);
  const [liveNotice, setLiveNotice] = useState("");
  const liveNoticeTimer = useRef<number | undefined>(undefined);
  const ring = useRef<HTMLSpanElement>(null);
  const level = useRef(0);
  const stopVoice = useRef<(() => void) | undefined>(undefined);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(
    () => () => {
      mic.current?.cancel();
      liveStream.current?.stop();
      convSocket.current?.close();
      stopVoice.current?.();
      if (liveNoticeTimer.current) clearTimeout(liveNoticeTimer.current);
    },
    [],
  );

  function switchMode(m: "practice" | "conversation") {
    if (m === mode) return;
    if (state === "listening") {
      mic.current?.cancel();
      mic.current = undefined;
      setState("idle");
    }
    if (convStatus === "active" || convStatus === "connecting") {
      stopConversation();
    }
    stopVoice.current?.();
    setNotice("");
    setLiveNotice("");
    if (liveNoticeTimer.current) clearTimeout(liveNoticeTimer.current);
    setResult(null);
    setMode(m);
  }

  async function startConversation() {
    stopVoice.current?.();
    setNotice("");
    setConvStatus("connecting");
    try {
      const socket = new ConversationSocket({
        onOpen: () => {
          setConvStatus("active");
        },
        onTelemetry: (t: Telemetry) => {
          setIsSpeakingLive(t.is_speaking);
          const target = Math.min(1, t.rms * 8);
          level.current = target;
          ring.current?.style.setProperty("--level", target.toFixed(3));
        },
        onNoSpeech: (info) => {
          const hint = info.message || "Low ambient sound or silence ignored";
          setLiveNotice(hint);
          if (liveNoticeTimer.current) clearTimeout(liveNoticeTimer.current);
          liveNoticeTimer.current = window.setTimeout(() => setLiveNotice(""), 3500);
        },
        onRectified: (out: RectifiedOutput) => {
          setLiveNotice("");
          if (liveNoticeTimer.current) clearTimeout(liveNoticeTimer.current);
          const textToShow = out.repaired_text || out.raw_text;
          if (!textToShow) return;
          setMessages((prev) => [
            ...prev,
            {
              id: String(Date.now()),
              raw: out.raw_text,
              text: textToShow,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              latency: out.latency_ms,
            },
          ]);
          if (out.audio_base64) {
            play(out.audio_base64).then((stopFn) => {
              stopVoice.current = stopFn;
            });
          }
        },
        onError: (err: string) => {
          setNotice(err);
        },
        onClose: () => {
          setConvStatus("idle");
          setIsSpeakingLive(false);
        },
      });

      await socket.connect();
      convSocket.current = socket;

      liveStream.current = await openLiveStream(
        (pcm16) => {
          socket.sendAudio(pcm16);
        },
        (l) => {
          level.current = l;
          ring.current?.style.setProperty("--level", l.toFixed(3));
        },
      );
    } catch (e) {
      convSocket.current?.close();
      convSocket.current = undefined;
      liveStream.current?.stop();
      liveStream.current = undefined;
      setConvStatus("error");
      setNotice(e instanceof MicError ? MIC_HELP[e.problem] : e instanceof Error ? e.message : "Could not start conversation mode.");
    }
  }

  function stopConversation() {
    liveStream.current?.stop();
    liveStream.current = undefined;
    convSocket.current?.close();
    convSocket.current = undefined;
    setConvStatus("idle");
    setIsSpeakingLive(false);
    setLiveNotice("");
    if (liveNoticeTimer.current) clearTimeout(liveNoticeTimer.current);
    level.current = 0;
    ring.current?.style.setProperty("--level", "0");
  }

  async function press() {
    if (state === "listening") return stop();
    if (busy || startingMic.current) return;
    startingMic.current = true;
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
    } finally {
      startingMic.current = false;
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
    if (!result || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
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
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const stopRef = useRef(stop);
  stopRef.current = stop;
  const busy = state === "thinking" || state === "speaking";

  return (
    <>
      <PageIntro>
        <h1 className="sr-only">Speak</h1>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <DailyLeaves done={today + said.length} />
            <div className="inline-flex rounded-full bg-track p-1" role="tablist" aria-label="Speech mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "practice"}
                onClick={() => switchMode("practice")}
                className={
                  "min-h-10 rounded-full px-5 text-label font-semibold transition-all duration-200 " +
                  (mode === "practice"
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-soft hover:text-ink")
                }
              >
                Practice
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "conversation"}
                onClick={() => switchMode("conversation")}
                className={
                  "min-h-10 rounded-full px-5 text-label font-semibold transition-all duration-200 " +
                  (mode === "conversation"
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-soft hover:text-ink")
                }
              >
                Continuous Talk
              </button>
            </div>
          </div>
          {mode === "practice" ? (
            <>
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
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-title">Continuous Conversation</h2>
                  <p className="mt-1 text-ink-soft">
                    Hands-free conversation mode. Speak naturally; as you pause, Epako speaks your words aloud.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "size-3 rounded-full " +
                      (convStatus === "active"
                        ? isSpeakingLive
                          ? "bg-link animate-pulse"
                          : "bg-link"
                        : convStatus === "connecting"
                          ? "bg-ink-soft animate-ping"
                          : "bg-edge")
                    }
                    aria-hidden="true"
                  />
                  <span className="text-label text-ink-soft">
                    {convStatus === "active"
                      ? isSpeakingLive
                        ? "Listening to you…"
                        : "Active & Waiting for speech"
                      : convStatus === "connecting"
                        ? "Connecting…"
                        : "Inactive"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 py-2 sm:flex-row sm:justify-start sm:gap-6">
                {convStatus === "active" || convStatus === "connecting" ? (
                  <Button
                    variant="danger"
                    onClick={stopConversation}
                    className="w-full sm:w-auto min-h-14 px-8 text-label"
                  >
                    <Icon name="mic" className="size-5" />
                    Stop Conversation
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={startConversation}
                    className="w-full sm:w-auto min-h-14 px-8 text-label"
                  >
                    <Icon name="mic" className="size-5" />
                    Start Continuous Talk
                  </Button>
                )}
                <VoiceBars level={level} active={convStatus === "active"} />
              </div>

              {notice && <Message tone="error">{notice}</Message>}
            </div>
          )}
        </div>
      </PageIntro>

      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex w-full max-w-[44rem] flex-col gap-10">
          {mode === "conversation" ? (
            <section aria-label="Conversation Feed" className="flex flex-col gap-4 rounded-card bg-surface p-6 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-label font-semibold text-ink-soft">Conversation Feed</h3>
                {liveNotice && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1 text-[0.85rem] font-medium text-ink-soft animate-fade-in border border-edge/60"
                  >
                    <Icon name="wave" className="size-3.5 shrink-0 text-ink-soft" />
                    {liveNotice}
                  </span>
                )}
              </div>
              {messages.length === 0 ? (
                <div className="rounded-input border-[1.5px] border-dashed border-edge p-8 text-center text-ink-soft">
                  {convStatus === "active" ? (
                    liveNotice ? (
                      <span className="inline-flex items-center gap-2 font-medium text-ink">
                        <Icon name="wave" className="size-4 shrink-0 text-link" />
                        {liveNotice}
                      </span>
                    ) : (
                      "Start speaking. Your words will appear and be spoken aloud in your chosen voice when you pause."
                    )
                  ) : (
                    'Press "Start Continuous Talk" above to begin hands-free conversation.'
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-2">
                  {messages.map((m) => (
                    <div key={m.id} className="rounded-card bg-raised p-4 transition-all duration-200">
                      <div className="flex items-center justify-between gap-2 text-label text-ink-soft">
                        <span>{m.time}</span>
                        {m.latency !== undefined && <span>{m.latency} ms</span>}
                      </div>
                      <p className="mt-2 text-title font-semibold text-ink">{m.text}</p>
                      {m.raw && m.raw !== m.text && (
                        <p className="mt-1 text-[0.95rem] text-ink-soft">
                          Heard: <span className="italic">{m.raw}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
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
                            <Button key={t} variant="secondary" className="justify-start text-left" onClick={() => confirm(t)} disabled={saving || busy}>
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
                    disabled={saving}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <Button type="submit" variant="secondary" disabled={saving || busy}>
                      {saving ? "Saving…" : "Send"}
                    </Button>
                    <Button variant="quiet" onClick={press} disabled={saving || busy}>
                      <Icon name="mic" className="size-5" />
                      Say it again instead
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Button className="w-full sm:w-auto" onClick={() => confirm(result.repaired_text)} disabled={saving || busy}>
                    {saving ? "Saving…" : "Yes, that's right"}
                  </Button>
                  <Button variant="secondary" onClick={() => setFixing(true)} disabled={saving || busy}>
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
