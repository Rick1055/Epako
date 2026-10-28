import { useEffect, useState } from "react";
import { Link, redirect, useLoaderData, useNavigate, useSearchParams } from "react-router";

import { Button } from "~/components/Button";
import { Message } from "~/components/Message";
import { PageIntro } from "~/components/PageIntro";
import { TextField } from "~/components/TextField";
import { requireSession, safeNext, supabase } from "~/lib/supabase";
import type { Route } from "./+types/clinician-two-step";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Two-step sign-in - Epako Voice" }, { name: "robots", content: "noindex" }];
}

/**
 * Clinicians see patients' health data only from a two-step session (REVIEW-2026-10-28, H2; the database enforces it,
 * migration 20261102000000). The first time, they add Epako Voice to an authenticator app; after that, each sign-in
 * asks for the app's 6-digit code.
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  await requireSession(request);
  const mfa = supabase().auth.mfa;
  const { data: level } = await mfa.getAuthenticatorAssuranceLevel();
  const next = safeNext(new URL(request.url).searchParams.get("next"), "/clinician");
  if (level?.currentLevel === "aal2") throw redirect(next);
  const { data: factors } = await mfa.listFactors();
  const verified = factors?.totp.find((f) => f.status === "verified");
  return { factorId: verified?.id ?? null };
}

export default function ClinicianTwoStep() {
  const { factorId } = useLoaderData<typeof clientLoader>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // First time: make a new authenticator entry (any half-finished one is removed first, so there is only ever one).
  useEffect(() => {
    if (factorId) return;
    void (async () => {
      const mfa = supabase().auth.mfa;
      const { data: factors } = await mfa.listFactors();
      for (const f of factors?.all.filter((f) => f.factor_type === "totp" && f.status !== "verified") ?? []) await mfa.unenroll({ factorId: f.id });
      const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: "Epako Voice" });
      if (error || !data) return setError("I couldn't start the set-up just now. Please reload the page to try again.");
      setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, [factorId]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = factorId ?? setup?.id;
    if (!id) return;
    if (!/^\d{6}$/.test(code.trim())) return setError("Please enter the 6-digit code your authenticator app shows.");
    setBusy(true);
    const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() });
    setBusy(false);
    if (error) return setError("That code didn't match. Codes change every 30 seconds; please try the current one.");
    navigate(safeNext(params.get("next"), "/clinician"), { replace: true });
  }

  return (
    <>
      <PageIntro>
        <h1 className="text-headline text-balance">{factorId ? "Enter your sign-in code." : "Set up two-step sign-in."}</h1>
        <p className="mt-4">
          {factorId
            ? "Open your authenticator app and type the 6-digit code it shows for Epako Voice."
            : "Your patients' sessions are health records, so clinician accounts use a second step: a code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or similar)."}
        </p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <form onSubmit={verify} noValidate className="flex max-w-[34rem] flex-col gap-6">
          {error && <Message tone="error">{error}</Message>}
          {!factorId && setup && (
            <div className="flex flex-col gap-4 rounded-card bg-surface p-6">
              <p className="font-semibold">1. In your authenticator app, add an account and scan this code.</p>
              <img src={setup.qr} alt="QR code for adding Epako Voice to an authenticator app" className="size-48 rounded-input bg-white p-2" />
              <p className="text-[1rem] text-ink-soft">
                Can't scan it? Choose to enter a key instead and type: <code className="font-semibold break-all text-ink">{setup.secret}</code>
              </p>
              <p className="font-semibold">2. Type the 6-digit code the app shows.</p>
            </div>
          )}
          <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" disabled={busy || (!factorId && !setup)} className="w-full sm:w-auto sm:self-start">
            {busy ? "Checking…" : "Continue"}
          </Button>
          <Link to="/sign-out" className="inline-flex min-h-12 items-center self-start underline underline-offset-4">
            Sign out
          </Link>
        </form>
      </div>
    </>
  );
}
