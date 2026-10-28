import { useEffect, useRef } from "react";

import { Icon } from "./Icon";

/**
 * Live voice bars while the microphone is open (DESIGN.md, feedback loop): a short rolling history of the voice's
 * loudness, drawn by the browser each frame from `level` (no React re-render).
 */
export function VoiceBars({ level, active }: { level: { current: number }; active: boolean }) {
  const bars = useRef<HTMLSpanElement[]>([]);
  useEffect(() => {
    if (!active) return;
    const history = new Array(bars.current.length).fill(0);
    let frame = 0;
    const draw = () => {
      history.shift();
      history.push(level.current);
      bars.current.forEach((b, i) => {
        // The newest sample in the middle, spreading out to both sides: a calm, symmetric shape.
        const k = Math.abs(i - (history.length - 1) / 2);
        b.style.scale = `1 ${Math.max(0.12, history[history.length - 1 - Math.round(k * 2) % history.length])}`;
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, level]);
  return (
    <div aria-hidden="true" className={"flex h-12 items-center gap-1.5 transition-opacity duration-300 " + (active ? "opacity-100" : "opacity-0")}>
      {Array.from({ length: 15 }, (_, i) => (
        <span key={i} ref={(el) => void (el && (bars.current[i] = el))} className="h-full w-1.5 rounded-full bg-link transition-[scale] duration-75" style={{ scale: "1 0.12" }} />
      ))}
    </div>
  );
}

/** Today's leaves (DESIGN.md, goal gradient): one leaf fills for each phrase said today, towards a gentle daily five. */
export function DailyLeaves({ done, goal = 5 }: { done: number; goal?: number }) {
  return (
    <div className="flex items-center gap-3">
      <ol className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: goal }, (_, i) => (
          <li
            key={i}
            className={
              "inline-flex size-9 items-center justify-center rounded-full transition-[background-color,scale] duration-300 ease-out " +
              (i < done ? "scale-100 bg-raised text-link" : "scale-90 bg-track text-ink-soft")
            }
          >
            <Icon name="leaf" className="size-5" />
          </li>
        ))}
      </ol>
      <p className="text-label" aria-live="polite">
        {done >= goal ? `${done} today. Your five are done` : `${done} of ${goal} today`}
      </p>
    </div>
  );
}

const PROMPTS = [
  "Good morning, how are you?",
  "Could I have a cup of tea, please?",
  "I'd like to go for a walk.",
  "Thank you, that's very kind.",
  "What's the weather like today?",
  "Can you call me back later?",
  "I'm feeling much better today.",
  "Let's meet at the park.",
  "Please pass me the water.",
  "I'll see you tomorrow.",
  "Could you speak a little slower?",
  "It's lovely to see you.",
];

/** Practice prompts (DESIGN.md, recognition over recall): three at a time, tap one to say it. */
export function PracticePrompts({ page, onPick, onMore }: { page: number; onPick: (p: string) => void; onMore: () => void }) {
  const shown = [0, 1, 2].map((k) => PROMPTS[(page * 3 + k) % PROMPTS.length]);
  return (
    <div>
      <p className="text-label text-ink-soft">Not sure what to say? Try one of these</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {shown.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="min-h-12 rounded-full border-[1.5px] border-edge bg-surface px-4 text-left text-[1rem] text-ink transition-[scale,border-color] duration-160 ease-out hover:border-link active:scale-[0.97]"
            >
              {p}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMore} className="min-h-12 rounded-full px-4 text-[1rem] font-semibold text-link underline-offset-4 hover:underline">
            Show others
          </button>
        </li>
      </ul>
    </div>
  );
}
