import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState } from "react";
import { Link } from "react-router";

import { Button } from "~/components/Button";
import { Captcha } from "~/components/Captcha";
import { PageIntro } from "~/components/PageIntro";
import { Message } from "~/components/Message";
import { TextField } from "~/components/TextField";
import { authMessage, supabase } from "~/lib/supabase";
import type { Route } from "./+types/forgot-password";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Reset your password - Epako Voice" }, { name: "robots", content: "noindex" }];
}

export default function ForgotPassword() {
  const captcha = useRef<TurnstileInstance>(undefined);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email) return setError("Please fill in your email.");
    if (!token) return setError("Please complete the quick check just above the button.");
    setBusy(true);
    const { error } = await supabase().auth.resetPasswordForEmail(email, { captchaToken: token, redirectTo: `${location.origin}/reset-password` });
    captcha.current?.reset();
    setToken(null);
    setBusy(false);
    if (error) return setError(authMessage(error));
    setSent(true);
  }

  return (
    <>
      <PageIntro>
        <h1 className="text-headline text-balance">Let's get you back in.</h1>
        <p className="mt-4">Tell us your email and we'll send a link to choose a new password.</p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        {sent ? (
          <div className="max-w-[34rem]">
            {/* Same words whether or not the address has an account, so nobody can find out who uses the app. */}
            <Message tone="success">If there's an account for {email}, a link is on its way. It works for 15 minutes.</Message>
            <Link to="/sign-in" className="mt-6 inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex max-w-[34rem] flex-col gap-6">
            {error && <Message tone="error">{error}</Message>}
            <TextField label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Captcha ref={captcha} onToken={setToken} />
            <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
              {busy ? "Sending…" : "Send me a link"}
            </Button>
            <Link to="/sign-in" className="inline-flex min-h-12 items-center underline underline-offset-4">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </>
  );
}
