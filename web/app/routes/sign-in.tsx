import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Button } from "~/components/Button";
import { Captcha } from "~/components/Captcha";
import { EntryPage } from "~/components/EntryPage";
import { Message } from "~/components/Message";
import { PasswordField } from "~/components/PasswordField";
import { TextField } from "~/components/TextField";
import { authMessage, safeNext, supabase } from "~/lib/supabase";
import type { Route } from "./+types/sign-in";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign in - Epako Voice" }, { name: "description", content: "Sign in to Epako Voice." }];
}

/** Where a signed-in person goes: clinicians to their own screens, patients to Setup until they've started it, else Home. */
export async function homeFor(userId: string) {
  const db = supabase();
  const { data: clinician } = await db.from("clinicians").select("verified").eq("user_id", userId).maybeSingle();
  if (clinician) return clinician.verified ? "/clinician" : "/clinician/pending";
  const { data: profile } = await db.from("patient_profiles").select("consent_updated_at").eq("user_id", userId).maybeSingle();
  return profile?.consent_updated_at ? "/home" : "/setup";
}

export default function SignIn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const captcha = useRef<TurnstileInstance>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Patients can sign in with a link sent to their email instead of typing a password (DESIGN.md, Redesign; H1).
  const [byLink, setByLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function sendLink() {
    if (!email) return setError("Please fill in your email.");
    if (!token) return setError("Please complete the quick check just above the button.");
    setBusy(true);
    const next = safeNext(params.get("next"), "");
    const { error } = await supabase().auth.signInWithOtp({
      email,
      // Only existing accounts: a link never creates one (sign-up keeps its password and checks).
      options: {
        captchaToken: token,
        shouldCreateUser: false,
        emailRedirectTo: `${location.origin}/sign-in/link${next ? `?next=${encodeURIComponent(next)}` : ""}`,
      },
    });
    captcha.current?.reset();
    setToken(null);
    setBusy(false);
    // The same answer whether or not the address has an account, so the form can't be used to find out who does.
    if (error && !/signups not allowed|user not found/i.test(error.message)) return setError(authMessage(error));
    setLinkSent(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (byLink) return sendLink();
    if (!email || !password) return setError("Please fill in your email and password.");
    if (!token) return setError("Please complete the quick check just above the button.");
    setBusy(true);
    const { data, error } = await supabase().auth.signInWithPassword({ email, password, options: { captchaToken: token } });
    captcha.current?.reset();
    setToken(null);
    if (error) {
      setBusy(false);
      return setError(authMessage(error));
    }
    const home = await homeFor(data.user.id);
    navigate(safeNext(params.get("next"), home));
  }

  return (
    <EntryPage>
      <h1 className="text-headline text-balance">Welcome back. Good to see you.</h1>
      <div className="mt-8">
        {linkSent ? (
          <div className="flex flex-col gap-4">
            <Message tone="success">
              <p className="font-semibold">Check your email.</p>
              <p className="mt-1">If {email} has an account, a sign-in link is on its way. Open it on this device, and you're in.</p>
            </Message>
            <p className="text-ink-soft">The link works once, for one hour. Nothing there after a few minutes? Look in your spam folder.</p>
          </div>
        ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          {error && <Message tone="error">{error}</Message>}
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {!byLink && (
            <div>
              <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
              <Link to="/forgot-password" className="mt-2 inline-flex min-h-12 items-center underline underline-offset-4">
                Forgot your password?
              </Link>
            </div>
          )}
          <Captcha ref={captcha} onToken={setToken} />
          <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
            {byLink ? (busy ? "Sending…" : "Email me a sign-in link") : busy ? "Signing in…" : "Sign in"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setByLink(!byLink);
              setError("");
            }}
            className="inline-flex min-h-12 items-center self-start font-semibold text-link underline underline-offset-4"
          >
            {byLink ? "Use my password instead" : "No password? Email me a sign-in link"}
          </button>
          <p>
            New here?{" "}
            <Link to="/sign-up" className="font-semibold underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </form>
        )}
      </div>
    </EntryPage>
  );
}
