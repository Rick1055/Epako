import { useEffect, useId, useRef } from "react";

import { Icon } from "./Icon";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  /** Something inside the field's right edge, e.g. a show/hide button for passwords. */
  end?: React.ReactNode;
};

/** DESIGN.md, Smooth-caret input: label above, hint and error below, a caret that glides instead of jumping. */
export function TextField({ label, hint, error, end, id, className = "", ...input }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-label">
        {label}
      </label>
      <SmoothCaretInput
        id={inputId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        end={end}
        {...input}
      />
      {hint && (
        <p id={hintId} className="mt-2 text-[1rem] text-ink-soft">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-2 flex items-start gap-2 text-[1rem] text-error">
          <Icon name="alert" className="mt-px size-5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// Types whose cursor position the browser reports. Passwords are left out: their dots can't be measured exactly.
const MEASURABLE = new Set(["text", "search", "url", "tel"]);

function SmoothCaretInput({ end, type = "text", ...input }: React.InputHTMLAttributes<HTMLInputElement> & { end?: React.ReactNode }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const field = inputRef.current!;
    const mirror = mirrorRef.current!;
    const caret = caretRef.current!;
    // Native caret whenever gliding could be wrong or unwanted.
    const nativeOnly = matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)");
    let composing = false;
    let placed = false; // the first placement after focus jumps; only later moves glide
    let frame = 0;

    const hide = () => {
      caret.hidden = true;
      field.style.caretColor = "";
      placed = false;
    };

    const place = () => {
      frame = 0;
      const start = field.selectionStart;
      const usable =
        MEASURABLE.has(field.type) &&
        document.activeElement === field &&
        !composing &&
        !nativeOnly.matches &&
        start !== null &&
        start === field.selectionEnd &&
        getComputedStyle(field).direction !== "rtl";
      if (!usable) return hide();

      const style = getComputedStyle(field);
      mirror.style.font = style.font;
      mirror.style.letterSpacing = style.letterSpacing;
      mirror.textContent = field.value.slice(0, start);
      const x =
        field.offsetLeft +
        parseFloat(style.borderLeftWidth) +
        parseFloat(style.paddingLeft) +
        mirror.getBoundingClientRect().width -
        field.scrollLeft;

      caret.style.transition = placed ? "" : "none";
      caret.style.translate = `${x}px -50%`;
      // Restart the idle blink after every move, so the caret is solid while the person types.
      caret.style.animation = "none";
      void caret.offsetWidth;
      caret.style.animation = "";
      caret.hidden = false;
      field.style.caretColor = "transparent";
      placed = true;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    const onCompositionStart = () => {
      composing = true;
      hide();
    };
    const onCompositionEnd = () => {
      composing = false;
      schedule();
    };

    field.addEventListener("focus", schedule);
    field.addEventListener("blur", hide);
    field.addEventListener("input", schedule);
    field.addEventListener("scroll", schedule);
    field.addEventListener("compositionstart", onCompositionStart);
    field.addEventListener("compositionend", onCompositionEnd);
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("resize", schedule);
    nativeOnly.addEventListener("change", schedule);
    document.fonts.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      field.removeEventListener("focus", schedule);
      field.removeEventListener("blur", hide);
      field.removeEventListener("input", schedule);
      field.removeEventListener("scroll", schedule);
      field.removeEventListener("compositionstart", onCompositionStart);
      field.removeEventListener("compositionend", onCompositionEnd);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("resize", schedule);
      nativeOnly.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div className="relative mt-2">
      <input
        ref={inputRef}
        type={type}
        className={
          "block h-14 w-full rounded-input border-[1.5px] border-edge bg-surface px-4 text-ink " +
          "aria-[invalid=true]:border-2 aria-[invalid=true]:border-error " +
          (end ? "pr-14" : "")
        }
        {...input}
      />
      <span ref={mirrorRef} aria-hidden="true" className="invisible absolute top-0 left-0 whitespace-pre" />
      <span
        ref={caretRef}
        aria-hidden="true"
        hidden
        className="smooth-caret pointer-events-none absolute top-1/2 left-0 h-[1.3em] w-0.5 rounded-full bg-focus"
      />
      {end && <div className="absolute inset-y-0 right-1 flex items-center">{end}</div>}
    </div>
  );
}
