import { useId } from "react";

/** An on/off switch: a real checkbox with role="switch", its label beside it, the state in words as well as position. */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-4">
      <span className="relative mt-1 inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="peer h-8 w-14 cursor-pointer appearance-none rounded-full border-[1.5px] border-edge bg-track transition-[background-color] duration-160 checked:border-link checked:bg-link"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 left-1 size-6 rounded-full bg-surface shadow-float transition-[translate] duration-200 ease-out peer-checked:translate-x-6"
        />
      </span>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block font-semibold">{label}</span>
        <span className="block text-[1rem] text-ink-soft">{checked ? "On" : "Off"}</span>
        {hint && (
          <span id={`${id}-hint`} className="mt-1 block text-[1rem] text-ink-soft">
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}
