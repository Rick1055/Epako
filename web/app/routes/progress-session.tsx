import { useState } from "react";
import { Link, useLoaderData } from "react-router";

import { Button } from "~/components/Button";
import { PageIntro } from "~/components/PageIntro";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { downloadReport } from "~/lib/report";
import { ApiError, supabase } from "~/lib/supabase";
import type { Route } from "./+types/progress-session";

export function meta({}: Route.MetaArgs) {
  return [{ title: "A session - Epako Voice" }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const db = supabase();
  const [session, utterances, assessment] = await Promise.all([
    db.from("therapy_sessions").select("id, created_at, utterances_count, accuracy_rate").eq("id", params.id).maybeSingle(),
    db.from("session_utterances").select("transcribed_text, corrected_text, confirmed, created_at").eq("session_id", params.id).order("created_at"),
    db.from("clinical_assessments").select("session_id").eq("session_id", params.id).maybeSingle(),
  ]);
  if (!session.data) throw new Response("Not found", { status: 404 });
  return { session: session.data, utterances: utterances.data ?? [], assessed: !!assessment.data };
}

/** One session: what was said, what I heard, and the report once a clinician has added notes. */
export default function ProgressSession() {
  const { session, utterances, assessed } = useLoaderData<typeof clientLoader>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function report() {
    setBusy(true);
    setError("");
    try {
      await downloadReport(session.id);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? "This report can't be made yet: some of its measurements are missing." : e instanceof ApiError ? e.message : "Something got stuck. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageIntro>
        <Link to="/progress" className="inline-flex min-h-12 items-center gap-1 underline underline-offset-4">
          <Icon name="back" className="size-5" />
          Progress
        </Link>
        <h1 className="mt-2 text-headline text-balance">{new Date(session.created_at).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</h1>
        <p className="mt-4">
          {session.utterances_count} {session.utterances_count === 1 ? "phrase" : "phrases"}, {Math.round(Number(session.accuracy_rate))}% spot on first time.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex max-w-[44rem] flex-col gap-10">
          <section aria-labelledby="report-title" className="rounded-card bg-surface p-6">
            <h2 id="report-title" className="text-title">
              Your report
            </h2>
            {assessed ? (
              <>
                <p className="mt-2">Your clinician has added notes for this session.</p>
                <Button variant="secondary" className="mt-4" onClick={report} disabled={busy}>
                  <Icon name="download" className="size-5" />
                  {busy ? "Preparing…" : "Download my report"}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-ink-soft">Your clinician hasn't added notes yet. When they do, your report will be here.</p>
            )}
            {error && (
              <div className="mt-4">
                <Message tone="error">{error}</Message>
              </div>
            )}
          </section>

          <section aria-labelledby="phrases-title">
            <h2 id="phrases-title" className="text-title">
              What you said
            </h2>
            <ul className="mt-4 flex flex-col gap-2">
              {utterances.map((u, i) => (
                <li key={u.created_at + i} className="rounded-card bg-surface px-5 py-4">
                  <p className="font-semibold">{u.corrected_text}</p>
                  {!u.confirmed && <p className="mt-1 text-[1rem] text-ink-soft">I first heard: {u.transcribed_text}</p>}
                  <p className="mt-1 flex items-center gap-1.5 text-[1rem] text-ink-soft">
                    <Icon name={u.confirmed ? "check" : "leaf"} className="size-4" />
                    {u.confirmed ? "Spot on" : "You fixed it, and I learned from it"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
