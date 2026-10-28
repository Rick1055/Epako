import { useEffect } from "react";

import { sounds, useSoundPrefs } from "~/lib/sounds";
import { Icon } from "./Icon";

/**
 * DESIGN.md, Garden sounds toggle: 48px, beside the theme toggle on every signed-in page, aria-pressed. The first
 * time sounds play, a note beside it says how to turn them off, for 8 seconds or until the first press.
 */
export function SoundToggle() {
  const { on, noted } = useSoundPrefs();

  useEffect(() => {
    if (!on || noted) return;
    const t = setTimeout(() => sounds.dismissNote(), 8000);
    return () => clearTimeout(t);
  }, [on, noted]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => sounds.setOn(!on)}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-full border-[1.5px] border-edge bg-surface text-ink transition-[scale] duration-160 ease-out active:scale-[0.97]"
      >
        <Icon name={on ? "sound-on" : "sound-off"} />
        <span className="sr-only">Garden sounds</span>
      </button>
      {on && !noted && (
        <p role="status" className="absolute top-full right-0 z-20 mt-2 w-60 rounded-card bg-ink px-4 py-3 text-[1rem] text-bg shadow-float">
          Soft garden sounds are on. Tap here to turn them off.
        </p>
      )}
    </div>
  );
}
