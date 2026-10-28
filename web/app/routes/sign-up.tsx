import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { Button } from "~/components/Button";
import { Captcha } from "~/components/Captcha";
import { GardenStage } from "~/components/GardenStage";
import { Message } from "~/components/Message";
import { PasswordField } from "~/components/PasswordField";
import { TextField } from "~/components/TextField";
import { authMessage, supabase } from "~/lib/supabase";
import { sounds } from "~/lib/sounds";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/sign-up";

export const handle: GardenHandle = { garden: { stop: "path" } };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Create your account - Epako Voice" },
    { name: "description", content: "Create a free Epako Voice account to start speaking and practising at your own pace." },
  ];
}

/** Patients and clinicians share this screen; the clinician version only changes the words and where it leads. */
export function AccountForm({ clinician = false }: { clinician?: boolean }) {
  const navigate = useNavigate();
  const captcha = useRef<TurnstileInstance>(undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordOk, setPasswordOk] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const onOk = useCallback((ok: boolean) => setPasswordOk(ok), []);
  const next = clinician ? "/clinician/verify" : "/setup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!passwordOk) return setError("Your password needs at least 12 characters and shouldn't be one that's been in a data leak.");
    if (!token) return setError("Please complete the quick check just above the button.");
    setBusy(true);
    const { data, error } = await supabase().auth.signUp({
      email,
      password,
      options: { captchaToken: token, emailRedirectTo: `${location.origin}${next}` },
    });
    captcha.current?.reset();
    setToken(null);
    setBusy(false);
    if (error) return setError(authMessage(error));
    if (!data.session) return setSent(true); // the project asks people to confirm their email first
    if (!clinician) void sounds.start();
    navigate(next);
  }

  if (sent) {
    return (
      <div className="max-w-[34rem]">
        <Message tone="success">
          <p className="font-semibold">Check your email.</p>
          <p className="mt-1">We've sent a link to {email}. Open it on this device to finish creating your account.</p>
        </Message>
        <p className="mt-6 text-ink-soft">Nothing there after a few minutes? Look in your spam folder, or try again with a different address.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-[34rem] flex-col gap-6">
      {error && <Message tone="error">{error}</Message>}
      <TextField label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <PasswordField value={password} onChange={setPassword} meter autoComplete="new-password" onOk={onOk} />
      <Captcha ref={captcha} onToken={setToken} />
      <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
        {busy ? "Creating your account…" : "Create my account"}
      </Button>
      <p>
        Already have an account?{" "}
        <Link to="/sign-in" className="font-semibold underline underline-offset-4">
          Sign in
        </Link>
      </p>
      <p className="text-[1rem] text-ink-soft">
        By creating an account you agree to the{" "}
        <Link to="/terms" className="underline underline-offset-4">
          terms
        </Link>{" "}
        and how we look after your data in the{" "}
        <Link to="/privacy" className="underline underline-offset-4">
          privacy notice
        </Link>
        .
      </p>
    </form>
  );
}

export default function SignUp() {
  return (
    <>
      <GardenStage>
        <h1 className="text-headline text-balance">Let's set you up. It only takes a minute.</h1>
        <p className="mt-4">Your email and a password are all we need. We never ask for your name.</p>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <AccountForm />
      </div>
    </>
  );
}
