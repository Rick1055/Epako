import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useId, useRef, useState } from "react";

import { Button } from "./Button";
import { Captcha } from "./Captcha";
import { Message } from "./Message";
import { TextField } from "./TextField";

const TOPICS = [
  ["sign-in", "Trouble signing in"],
  ["voice", "My voice"],
  ["data", "My data"],
  ["clinician", "Clinician verification"],
  ["other", "Something else"],
] as const;

/**
 * DESIGN.md, rule 45: topic, optional name, email, message, the quick check and a hidden honeypot, sent to
 * POST /api/contact (no sign-in needed). Says plainly whether the message was emailed to the team or only saved.
 */
export function ContactForm() {
  const captcha = useRef<TurnstileInstance>(undefined);
  const topicId = useId();
  const messageId = useId();
  const [form, setForm] = useState({ topic: "other", name: "", email: "", message: "", website: "" });
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "emailed" | "saved">("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(form.email.trim())) return setError("Please check your email address, so we can reply.");
    if (!form.message.trim()) return setError("Please write your message.");
    if (!token) return setError("Please complete the quick check just above the button.");
    setBusy(true);
    try {
      const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, captcha_token: token }) });
      const body = await r.json().catch(() => ({}));
      if (r.ok) return setDone(body.emailed ? "emailed" : "saved");
      setError(
        r.status === 429
          ? "That's a few messages in a short time. Please wait an hour and try again, or email us."
          : typeof body.detail === "string"
            ? body.detail
            : "I couldn't send your message just now. Please try again, or email us.",
      );
    } catch {
      setError("I couldn't reach the server. Please check your connection and try again.");
    } finally {
      captcha.current?.reset();
      setToken(null);
      setBusy(false);
    }
  }

  if (done)
    return (
      <Message tone="success">
        {done === "emailed" ? "Your message has been sent to our team by email. Thank you for telling us." : "Your message is saved, but I couldn't send the email just now. We'll still see it."}
      </Message>
    );

  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-6">
      {error && <Message tone="error">{error}</Message>}
      <label className="block" htmlFor={topicId}>
        <span className="text-label">What's it about?</span>
        <select id={topicId} value={form.topic} onChange={set("topic")} className="mt-2 block min-h-12 w-full rounded-input border-[1.5px] border-edge bg-surface px-4 text-ink">
          {TOPICS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <TextField label="Your name (optional)" autoComplete="name" maxLength={100} value={form.name} onChange={set("name")} />
      <TextField label="Your email, so we can reply" type="email" autoComplete="email" inputMode="email" required maxLength={254} value={form.email} onChange={set("email")} />
      <label className="block" htmlFor={messageId}>
        <span className="text-label">Your message</span>
        <span className="mt-1 block text-[1rem] text-ink-soft">Please don't include medical details.</span>
        <textarea id={messageId} required maxLength={4000} rows={5} value={form.message} onChange={set("message")} className="mt-2 block w-full rounded-input border-[1.5px] border-edge bg-surface px-4 py-3 text-ink" />
      </label>
      {/* The honeypot: people never see or reach it; bots fill it in. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set("website")} className="absolute -left-[9999px] h-px w-px opacity-0" />
      <Captcha ref={captcha} onToken={setToken} />
      <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
        {busy ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
