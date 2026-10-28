import { useState } from "react";
import { Link } from "react-router";

import { Button } from "~/components/Button";
import { PageIntro } from "~/components/PageIntro";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { TextField } from "~/components/TextField";
import { supabase } from "~/lib/supabase";
import type { Route } from "./+types/clinician-link";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Add a patient - Epako Voice" }, { name: "robots", content: "noindex" }];
}

/** DESIGN.md: one generic message for every failure (nothing leaks); 5 misses in 15 minutes rest this screen. */
export default function ClinicianLink() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<"" | "linked" | "failed">("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setResult("");
    const { data, error } = await supabase().rpc("redeem_link_code", { code: code.trim() });
    setBusy(false);
    setResult(!error && data === true ? "linked" : "failed");
    if (data === true) setCode("");
  }

  return (
    <>
      <PageIntro>
        <Link to="/clinician" className="inline-flex min-h-12 items-center gap-1 underline underline-offset-4">
          <Icon name="back" className="size-5" />
          Patients
        </Link>
        <h1 className="mt-2 text-headline text-balance">Add a patient with their code.</h1>
        <p className="mt-4">The patient makes a 10-character code in their Care team page. Each code works once, for 15 minutes.</p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <form onSubmit={submit} className="flex max-w-[34rem] flex-col gap-6">
          {result === "linked" && (
            <Message tone="success">
              Linked. The patient is now in{" "}
              <Link to="/clinician" className="font-semibold underline underline-offset-4">
                your list
              </Link>
              .
            </Message>
          )}
          {result === "failed" && (
            <Message tone="error">
              That code didn't work. Check it with your patient, or ask them for a new one. After 5 wrong tries in 15 minutes, this screen
              rests for a while.
            </Message>
          )}
          <TextField
            label="Link code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            className="[&_input]:font-mono [&_input]:tracking-[0.15em]"
          />
          <Button type="submit" disabled={busy} className="w-full sm:w-auto sm:self-start">
            {busy ? "Checking…" : "Add patient"}
          </Button>
        </form>
      </div>
    </>
  );
}
