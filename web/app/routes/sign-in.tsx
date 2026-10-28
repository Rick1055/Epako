import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Button } from "~/components/Button";
import { Captcha } from "~/components/Captcha";
import { GardenStage } from "~/components/GardenStage";
import { Message } from "~/components/Message";
import { PasswordField } from "~/components/PasswordField";
import { TextField } from "~/components/TextField";
import { authMessage, safeNext, supabase } from "~/lib/supabase";
import { sounds } from "~/lib/sounds";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/sign-in";

export const handle: GardenHandle = { garden: { stop: "path" } };

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
    if (!home.startsWith("/clinician")) void sounds.start();
    navigate(safeNext(params.get("next"), home));
  }

  return (
    <>
      <GardenStage>
        <h1 className="text-headline text-balance">Welcome back. Good to see you.</h1>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <form onSubmit={submit} noValidate className="flex max-w-[34rem] flex-col gap-6">
          {error && <Message tone="error">{error}</Message>}
          <TextField label="Email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <div>
            <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
            <Link to="/forgot-password" className="mt-2 inline-flex min-h-12 items-center underline underline-offset-4">
              Forgot your password?
            </Link>
          </div>
          <Captcha ref={captcha} onToken={setToken} />
          <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <p>
            New here?{" "}
            <Link to="/sign-up" className="font-semibold underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </>
  );
}
