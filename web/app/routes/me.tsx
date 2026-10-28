import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useId, useRef, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";

import { Button, ButtonLink } from "~/components/Button";
import { Captcha } from "~/components/Captcha";
import { PageIntro } from "~/components/PageIntro";
import { Message } from "~/components/Message";
import { PasswordField } from "~/components/PasswordField";
import { Switch } from "~/components/Switch";
import { TextField } from "~/components/TextField";
import { myProfile, saveConsent } from "~/lib/patient";
import { api, ApiError, supabase } from "~/lib/supabase";
import { currentTextSize, saveTextSize, type TextSize } from "~/lib/text-size";
import { saveTheme, type Theme } from "~/lib/theme";
import type { Route } from "./+types/me";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Me - Epako Voice" }];
}

export async function clientLoader() {
  const [profile, { data }] = await Promise.all([myProfile(), supabase().auth.getUser()]);
  return { consent: profile.consent_audio_storage, email: data.user?.email ?? "" };
}

/** A row of pill choices that behave as one radio group. */
function Choice<T extends string>({ legend, options, value, onChange }: { legend: string; options: [T, string][]; value: T; onChange: (v: T) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="font-semibold">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map(([v, label]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="peer sr-only" />
            <span className="inline-flex min-h-12 items-center rounded-full border-[1.5px] border-edge px-5 text-label text-ink peer-checked:border-link peer-checked:bg-raised peer-checked:font-bold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function Me() {
  const { consent, email } = useLoaderData<typeof clientLoader>();
  const navigate = useNavigate();
  const [keep, setKeep] = useState(consent);
  const [privacyNote, setPrivacyNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [look, setLook] = useState<Theme | "device">("device");
  const [size, setSize] = useState<TextSize>("normal");

  useEffect(() => {
    setLook((document.cookie.match(/(?:^|;\s*)theme=(light|dark)/)?.[1] as Theme | undefined) ?? "device");
    setSize(currentTextSize());
  }, []);

  async function changeConsent(on: boolean) {
    setKeep(on);
    setPrivacyNote(null);
    try {
      await saveConsent(on);
      setPrivacyNote({ tone: "success", text: on ? "Saved. New recordings will be kept privately." : "Saved. New recordings won't be kept." });
    } catch {
      setKeep(!on);
      setPrivacyNote({ tone: "error", text: "I couldn't save that just now. Please try again." });
    }
  }


  return (
    <>
      <PageIntro>
        <h1 className="text-headline text-balance">Your settings.</h1>
        <p className="mt-4">Your care team, your privacy, how things look, and your account.</p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex max-w-[40rem] flex-col gap-10">
          <section aria-labelledby="care-title" className="flex flex-col gap-3 rounded-card bg-surface p-6">
            <h2 id="care-title" className="text-title">
              Care team
            </h2>
            <p>Share your sessions with your speech therapist, or see who you've shared them with.</p>
            <ButtonLink to="/care" variant="secondary" className="self-start">
              Open care team
            </ButtonLink>
          </section>

          <section aria-labelledby="privacy-title" className="flex flex-col gap-4 rounded-card bg-surface p-6">
            <h2 id="privacy-title" className="text-title">
              Privacy
            </h2>
            <Switch
              checked={keep}
              onChange={changeConsent}
              label="Save my recordings so my clinician and I can review them"
              hint="Off means each recording is thrown away once I've understood it. Turning it off doesn't delete recordings already kept."
            />
            {privacyNote && <Message tone={privacyNote.tone}>{privacyNote.text}</Message>}
            <div>
              <h3 className="font-semibold">What's stored about you</h3>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-6">
                <li>Your email ({email}) and password, to sign you in. Never your name.</li>
                <li>Your practice sessions, and for each phrase what I heard and what you confirmed.</li>
                <li>Word fixes and words you use, so I learn your way of speaking.</li>
                <li>Voice measurements from your sessions, like speaking pace and pauses.</li>
                <li>Your chosen voice settings.</li>
                <li>{keep ? "Your recordings, because you chose to keep them." : "No recordings, unless you choose to keep them."}</li>
              </ul>
            </div>
          </section>

          <section aria-labelledby="comfort-title" className="flex flex-col gap-8 rounded-card bg-surface p-6">
            <h2 id="comfort-title" className="text-title">
              How things look
            </h2>
            <Choice
              legend="Text size"
              options={[
                ["normal", "Normal"],
                ["large", "Large"],
                ["larger", "Larger"],
              ]}
              value={size}
              onChange={(v) => {
                setSize(v);
                saveTextSize(v);
              }}
            />
            <Choice
              legend="Look"
              options={[
                ["light", "Morning"],
                ["dark", "Evening"],
                ["device", "Match my device"],
              ]}
              value={look}
              onChange={(v) => {
                setLook(v);
                saveTheme(v === "device" ? null : v);
              }}
            />
          </section>

          <section aria-labelledby="account-title" className="flex flex-col gap-4">
            <h2 id="account-title" className="text-title">
              Your account
            </h2>
            <ButtonLink to="/sign-out" variant="secondary" className="self-start">
              Sign out
            </ButtonLink>
            <DeleteAccount onDeleted={() => navigate("/?deleted=1")} />
          </section>
        </div>
      </div>
    </>
  );
}

/** DESIGN.md, Me: type DELETE, the password and the check; says exactly what disappears; 3 tries an hour. */
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const captcha = useRef<TurnstileInstance>(undefined);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (word !== "DELETE") return setError('Please type DELETE in capitals to confirm.');
    if (!password) return setError("Please enter your password.");
    if (!token) return setError("Please complete the quick check just above the button.");
    setBusy(true);
    try {
      await api("/api/me/data", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE", password, captcha_token: token }) });
      await supabase().auth.signOut({ scope: "local" });
      onDeleted();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "That password doesn't match, or the check didn't go through. Please try again."
          : err instanceof ApiError && err.status === 429
            ? "That's three tries in the last hour. Please wait a while and try again."
            : "I couldn't delete your account just now. Nothing has been removed. Please try again.",
      );
      captcha.current?.reset();
      setToken(null);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
        Delete my account and data
      </Button>
    );
  }

  return (
    <form onSubmit={remove} noValidate className="flex flex-col gap-6 rounded-card border-2 border-error bg-surface p-6">
      <h3 className="text-title">Delete your account and everything in it</h3>
      <p>
        This removes your account, your sessions, every phrase, your voice settings, what I've learned about your speaking, your
        measurements, any kept recordings, and any sharing with clinicians. It can't be undone.
      </p>
      {error && <Message tone="error">{error}</Message>}
      <TextField label="Type DELETE to confirm" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoCapitalize="characters" />
      <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
      <Captcha ref={captcha} onToken={setToken} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Keep my account
        </Button>
        <Button type="submit" variant="danger" disabled={busy}>
          {busy ? "Deleting…" : "Delete everything"}
        </Button>
      </div>
    </form>
  );
}
