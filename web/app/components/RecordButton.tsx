import { forwardRef } from "react";

import { Icon } from "./Icon";

export type RecordState = "idle" | "listening" | "thinking" | "speaking";

const LABEL: Record<RecordState, string> = {
  idle: "Tap to speak",
  listening: "Listening… pause or tap when you're done",
  thinking: "Working on it…",
  speaking: "Here's what you said",
};

/**
 * DESIGN.md, Record button: a 112px coral circle. Idle breathes; listening shows a ring that follows the voice (the
 * page sets --level on the ring through the `ring` ref, no re-render); thinking turns a slow arc; speaking shows bars.
 * Tap or Space/Enter to start and stop; each state is announced politely.
 */
export const RecordButton = forwardRef<HTMLSpanElement, { state: RecordState; onPress: () => void; disabled?: boolean }>(function RecordButton(
  { state, onPress, disabled },
  ring,
) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex size-40 items-center justify-center">
        {state === "listening" && (
          <span
            ref={ring}
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-4 border-primary-edge transition-[scale] duration-100"
            style={{ scale: "calc(0.72 + var(--level, 0) * 0.28)" }}
          />
        )}
        {state === "thinking" && (
          <svg aria-hidden="true" viewBox="0 0 160 160" className="record-arc absolute inset-0 text-link">
            <circle cx="80" cy="80" r="74" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="110 400" />
          </svg>
        )}
        <button
          type="button"
          onClick={onPress}
          disabled={disabled || state === "thinking" || state === "speaking"}
          aria-label={state === "listening" ? "Stop recording" : "Start recording"}
          className={
            "relative inline-flex size-28 items-center justify-center rounded-full border-[1.5px] border-primary-edge bg-primary text-primary-ink transition-[scale] duration-160 ease-out active:scale-[0.97] disabled:cursor-default " +
            (state === "idle" ? "record-idle" : "")
          }
        >
          {state === "listening" ? (
            <Icon name="stop" className="size-10" />
          ) : state === "speaking" ? (
            <span aria-hidden="true" className="flex h-10 items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="record-bar h-full w-1.5 rounded-full bg-primary-ink" style={{ animationDelay: `${i * 0.14}s` }} />
              ))}
            </span>
          ) : (
            <Icon name="mic" className="size-10" />
          )}
        </button>
      </div>
      <p aria-live="polite" className="text-label">
        {LABEL[state]}
      </p>
    </div>
  );
});
