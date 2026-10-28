import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "./Icon";
import { TextField } from "./TextField";

const estimator = new ZxcvbnFactory();

/** How many times a password appears in known breaches. Only the first 5 characters of its SHA-1 leave the browser. */
async function breachCount(password: string) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
  if (!res.ok) return 0;
  const line = (await res.text()).split("\n").find((l) => l.startsWith(hex.slice(5)));
  return line ? Number(line.split(":")[1]) : 0;
}

const WORDS = ["Needs a bit more", "Needs a bit more", "Getting there", "Good", "Strong"];

/**
 * DESIGN.md, Password field and strength meter: show/hide, the 12-character rule stated before typing, a meter with
 * words (never colour alone), a friendly suggestion, and a note if the password has been in a known breach.
 * `meter` is off on sign-in, where only show/hide is wanted. Reports `ok` (long enough, not breached) to the form.
 */
export function PasswordField({
  value,
  onChange,
  meter = false,
  label = "Password",
  error,
  autoComplete,
  onOk,
}: {
  value: string;
  onChange: (v: string) => void;
  meter?: boolean;
  label?: string;
  error?: string;
  autoComplete: "current-password" | "new-password";
  onOk?: (ok: boolean) => void;
}) {
  const [shown, setShown] = useState(false);
  const [breached, setBreached] = useState(false);
  const score = useMemo(() => (meter && value ? estimator.check(value).score : 0), [meter, value]);

  useEffect(() => {
    if (!meter || value.length < 12) {
      setBreached(false);
      return;
    }
    let live = true;
    const t = setTimeout(() => breachCount(value).then((n) => live && setBreached(n > 0), () => undefined), 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [meter, value]);

  useEffect(() => onOk?.(value.length >= 12 && !breached), [value, breached, onOk]);

  const level = value.length < 12 ? Math.min(score, 1) : score;
  const hint =
    value.length === 0
      ? "At least 12 characters. A few unrelated words works well."
      : value.length < 12
        ? `${12 - value.length} more character${value.length === 11 ? "" : "s"} to go.`
        : level < 3
          ? "Add a few more words and it'll be strong."
          : "That's a good one.";

  return (
    <div>
      <TextField
        label={label}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={meter ? 12 : undefined}
        required
        error={error}
        end={
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="inline-flex size-12 items-center justify-center rounded-full text-ink"
            aria-label={shown ? "Hide password" : "Show password"}
          >
            <Icon name={shown ? "eye-off" : "eye"} />
          </button>
        }
      />
      {meter && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-track" aria-hidden="true">
              <div
                className="h-full origin-left rounded-full bg-link transition-[scale] duration-200 ease-out"
                style={{ scale: `${value ? (level + 1) / 5 : 0} 1` }}
              />
            </div>
            {value && <span className="text-label">{breached ? "Found in a leak" : WORDS[level]}</span>}
          </div>
          <p className="mt-2 text-[1rem] text-ink-soft">{hint}</p>
          {breached && (
            <p className="mt-2 flex items-start gap-2 text-[1rem] text-error">
              <Icon name="alert" className="mt-px size-5 shrink-0" />
              That one has shown up in a data leak, so let's pick another.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
