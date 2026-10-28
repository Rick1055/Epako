import { useState } from "react";
import { redirect, useNavigate } from "react-router";

import { Button } from "~/components/Button";
import { GardenStage } from "~/components/GardenStage";
import { Message } from "~/components/Message";
import { TextField } from "~/components/TextField";
import { requireSession, supabase } from "~/lib/supabase";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/clinician-verify";

export const handle: GardenHandle = { garden: { stop: "greenhouse", still: true } };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Your professional details - Epako Voice" }, { name: "robots", content: "noindex" }];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const s = await requireSession(request);
  const { data } = await supabase().from("clinicians").select("verified").eq("user_id", s.user.id).maybeSingle();
  if (data) throw redirect(data.verified ? "/clinician" : "/clinician/pending");
  return { userId: s.user.id };
}

export function HydrateFallback() {
  return null;
}

// DESIGN.md, Clinician verification: method A, a register lookup by an administrator (primary-source check).
const REGISTERS = [
  "Rehabilitation Council of India (CRR)",
  "National Medical Commission (India)",
  "HCPC (UK)",
  "ASHA (US)",
  "AHPRA (Australia)",
  "Another register",
];

export default function ClinicianVerify({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [register, setRegister] = useState(REGISTERS[0]);
  const [licence, setLicence] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !licence.trim()) return setError("Please fill in your name as registered and your licence number.");
    setBusy(true);
    const { error } = await supabase()
      .from("clinicians")
      .insert({ user_id: loaderData.userId, display_name: name.trim().slice(0, 120), license_ref: `${register}: ${licence.trim()}`.slice(0, 200) });
    setBusy(false);
    if (error) return setError("I couldn't save those details just now. Please try again.");
    navigate("/clinician/pending");
  }

  return (
    <>
      <GardenStage>
        <h1 className="text-headline text-balance">Your professional details.</h1>
        <p className="mt-4">
          Patients share real speech with you, so we check every clinician against their professional register before they can see any
          patient. Your name is shown to patients who share with you.
        </p>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <form onSubmit={submit} noValidate className="flex max-w-[34rem] flex-col gap-6">
          {error && <Message tone="error">{error}</Message>}
          <TextField label="Your name, as on the register" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          <label className="block">
            <span className="block text-label">Professional register</span>
            <select
              value={register}
              onChange={(e) => setRegister(e.target.value)}
              className="mt-2 block h-14 w-full rounded-input border-[1.5px] border-edge bg-surface px-4 text-ink"
            >
              {REGISTERS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <TextField label="Registration or licence number" hint={register === "Another register" ? "Please include the register's name too." : undefined} value={licence} onChange={(e) => setLicence(e.target.value)} maxLength={80} required />
          <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
            {busy ? "Sending…" : "Send for checking"}
          </Button>
        </form>
      </div>
    </>
  );
}
