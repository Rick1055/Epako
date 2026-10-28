import { useEffect, useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { Button } from "~/components/Button";
import { Confirm } from "~/components/Confirm";
import { GardenStage } from "~/components/GardenStage";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { myProfile } from "~/lib/patient";
import { supabase } from "~/lib/supabase";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/care";

export const handle: GardenHandle = { garden: { stop: "benches" } };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Care team - Epako Voice" }];
}

type Grant = { clinician_id: string; granted_at: string; clinicians: { display_name: string } | null };

export async function clientLoader() {
  const profile = await myProfile();
  const { data, error } = await supabase()
    .from("clinician_access")
    .select("clinician_id, granted_at, clinicians(display_name)")
    .eq("patient_id", profile.id)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false });
  if (error) throw error;
  return { patientId: profile.id, grants: data as unknown as Grant[] };
}

const VALID_MS = 15 * 60 * 1000;

/** DESIGN.md, Care team: create a short-lived code to share with a clinician; see and stop who can see your sessions. */
export default function Care() {
  const { patientId, grants } = useLoaderData<typeof clientLoader>();
  const revalidator = useRevalidator();
  const [code, setCode] = useState<{ value: string; until: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState<Grant | null>(null);
  const [stopped, setStopped] = useState("");

  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);

  const left = code ? Math.max(0, code.until - now) : 0;

  async function create() {
    setBusy(true);
    setError("");
    setCopied(false);
    const { data, error } = await supabase().rpc("create_link_code");
    setBusy(false);
    if (error || typeof data !== "string") return setError("I couldn't make a code just now. Please try again in a minute.");
    setCode({ value: data, until: Date.now() + VALID_MS });
    setNow(Date.now());
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code.value).catch(() => undefined);
    setCopied(true);
  }

  async function stopSharing(g: Grant) {
    setStopping(null);
    const { error } = await supabase().from("clinician_access").update({ revoked_at: new Date().toISOString() }).eq("clinician_id", g.clinician_id).eq("patient_id", patientId);
    if (error) return setError("I couldn't stop sharing just now. Please try again.");
    setStopped(`${g.clinicians?.display_name ?? "That clinician"} can no longer see your sessions.`);
    revalidator.revalidate();
  }

  return (
    <>
      <GardenStage>
        <h1 className="text-headline text-balance">The people helping you.</h1>
        <p className="mt-4">Share your practice with a speech and language therapist or doctor, and stop whenever you like.</p>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex max-w-[40rem] flex-col gap-10 lg:max-w-[min(34rem,40vw)]">
          {error && <Message tone="error">{error}</Message>}
          {stopped && <Message tone="success">{stopped}</Message>}

          <section aria-labelledby="share-title" className="rounded-card bg-surface p-6">
            <h2 id="share-title" className="text-title">
              Share with a clinician
            </h2>
            <p className="mt-2">Make a code and give it to your clinician. They type it into their own Epako Voice account to link with you.</p>
            {code && left > 0 ? (
              <div className="mt-6">
                <p className="sr-only">Your code is</p>
                <p className="font-mono text-display tracking-[0.15em] break-all" aria-live="polite">
                  {code.value}
                </p>
                <p className="mt-2 text-ink-soft" role="timer" aria-live="off">
                  Works for {Math.floor(left / 60000)}:{String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} more. Only one code works at a time.
                </p>
                <Button variant="secondary" className="mt-4" onClick={copy}>
                  <Icon name={copied ? "check" : "copy"} className="size-5" />
                  {copied ? "Copied" : "Copy the code"}
                </Button>
              </div>
            ) : (
              <>
                {code && <p className="mt-4 text-ink-soft">That code has run out. Make a new one whenever you're ready.</p>}
                <Button className="mt-6 w-full sm:w-auto" onClick={create} disabled={busy}>
                  {busy ? "Making a code…" : "Create a code"}
                </Button>
              </>
            )}
          </section>

          <section aria-labelledby="who-title">
            <h2 id="who-title" className="text-title">
              Who can see my sessions
            </h2>
            {grants.length === 0 ? (
              <p className="mt-2 text-ink-soft">Nobody yet. Only you can see your practice.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {grants.map((g) => (
                  <li key={g.clinician_id} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface px-5 py-4">
                    <span>
                      <span className="block font-semibold">{g.clinicians?.display_name ?? "A clinician"}</span>
                      <span className="block text-[1rem] text-ink-soft">Since {new Date(g.granted_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
                    </span>
                    <Button variant="quiet" onClick={() => setStopping(g)}>
                      Stop sharing
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="what-title">
            <h2 id="what-title" className="text-title">
              What a clinician can see
            </h2>
            <ul className="mt-3 flex list-disc flex-col gap-1 pl-6">
              <li>Your practice sessions: when, how many phrases, how many were spot on.</li>
              <li>What I heard and what you confirmed, phrase by phrase.</li>
              <li>The voice measurements from your sessions, like speaking pace and pauses.</li>
            </ul>
            <p className="mt-3">They can't see your email, your password, your settings, or anything else.</p>
          </section>
        </div>
      </div>

      {stopping && (
        <Confirm title={`Stop sharing with ${stopping.clinicians?.display_name ?? "this clinician"}?`} confirm="Stop sharing" onConfirm={() => stopSharing(stopping)} onCancel={() => setStopping(null)}>
          <p>They won't be able to see any of your sessions any more. You can share again later with a new code.</p>
        </Confirm>
      )}
    </>
  );
}
