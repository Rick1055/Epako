import { useEffect, useRef, useState } from "react";

import { type Mic, MicError, type MicProblem, openMic } from "~/lib/recorder";
import { Button } from "./Button";
import { Message } from "./Message";

type State = "idle" | "asking" | "listening" | "heard" | "quiet" | MicProblem;

const HELP: Record<MicProblem | "quiet", string> = {
  denied: "The microphone is blocked for this site. Tap the lock or settings icon next to the web address, allow the microphone, then try again.",
  "no-mic": "I can't find a microphone. If you use a headset, check it's plugged in, then try again.",
  unsupported: "This browser can't share its microphone with me. A recent Chrome, Edge, Firefox or Safari will work.",
  quiet: "I could only just hear you. Try a little closer to the microphone, or a bit louder if that's comfortable.",
};

/** DESIGN.md, Setup step 3: ask with a reason first, a live level meter, "Say anything", then "I can hear you" or a fix. */
export function MicCheck({ onHeard }: { onHeard: () => void }) {
  const [state, setState] = useState<State>("idle");
  const mic = useRef<Mic | undefined>(undefined);
  const bar = useRef<HTMLDivElement>(null);
  const peak = useRef(0);

  useEffect(
    () => () => {
      mic.current?.cancel();
      mic.current = undefined;
    },
    [],
  );

  async function start() {
    setState("asking");
    peak.current = 0;
    try {
      mic.current = await openMic((level) => {
        peak.current = Math.max(peak.current, level);
        if (bar.current) bar.current.style.scale = `${Math.max(0.02, level)} 1`;
      });
      setState("listening");
      setTimeout(finish, 5000);
    } catch (e) {
      setState(e instanceof MicError ? e.problem : "unsupported");
    }
  }

  function finish() {
    if (!mic.current) return;
    mic.current.cancel(); // the check never leaves the device
    mic.current = undefined;
    const heard = peak.current > 0.35;
    setState(heard ? "heard" : "quiet");
    if (heard) onHeard();
  }

  return (
    <div className="flex flex-col gap-6">
      {state === "idle" && (
        <p>
          I'll ask your browser to let me use the microphone. Nothing is recorded or sent anywhere during this check: it just makes sure I
          can hear you.
        </p>
      )}
      <div>
        <div className="h-4 overflow-hidden rounded-full bg-track" role="presentation">
          <div ref={bar} className="h-full origin-left rounded-full bg-link" style={{ scale: "0.02 1" }} />
        </div>
        <p className="mt-3 text-title" aria-live="polite">
          {state === "listening" ? "Say anything. I'm listening…" : state === "asking" ? "Waiting for the microphone…" : state === "heard" ? "I can hear you." : " "}
        </p>
      </div>
      {(state === "quiet" || state === "denied" || state === "no-mic" || state === "unsupported") && <Message tone="error">{HELP[state]}</Message>}
      {state === "listening" ? (
        <Button variant="secondary" className="self-start" onClick={finish}>
          I'm done
        </Button>
      ) : (
        state !== "heard" &&
        state !== "asking" && (
          <Button variant="secondary" className="self-start" onClick={start}>
            {state === "idle" ? "Check my microphone" : "Try again"}
          </Button>
        )
      )}
    </div>
  );
}
