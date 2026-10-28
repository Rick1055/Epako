import { Link, useLoaderData, useParams } from "react-router";

import { PageIntro } from "~/components/PageIntro";
import { Icon } from "~/components/Icon";
import { supabase } from "~/lib/supabase";
import type { Route } from "./+types/clinician-patient";
import { pseudonym } from "./clinician-patients";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Patient - Epako Voice" }, { name: "robots", content: "noindex" }];
}

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const db = supabase();
  const [sessions, assessed] = await Promise.all([
    db.from("therapy_sessions").select("id, created_at, utterances_count, accuracy_rate, duration_seconds").eq("patient_id", params.id).order("created_at", { ascending: false }),
    db.from("clinical_assessments").select("session_id"),
  ]);
  if (sessions.error) throw sessions.error;
  return { sessions: sessions.data, assessed: new Set((assessed.data ?? []).map((a) => a.session_id)) };
}

export default function ClinicianPatient() {
  const { id } = useParams();
  const { sessions, assessed } = useLoaderData<typeof clientLoader>();
  return (
    <>
      <PageIntro>
        <Link to="/clinician" className="inline-flex min-h-12 items-center gap-1 underline underline-offset-4">
          <Icon name="back" className="size-5" />
          Patients
        </Link>
        <h1 className="mt-2 text-headline">{pseudonym(id!)}</h1>
        <p className="mt-4">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"} shared with you.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="max-w-[44rem]">
          {sessions.length === 0 ? (
            <p className="text-ink-soft">No sessions yet. They appear here as soon as the patient practises.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/clinician/patient/${id}/session/${s.id}`}
                    className="flex min-h-14 items-center justify-between gap-4 rounded-card bg-surface px-5 py-3 text-ink no-underline hover:outline-[1.5px] hover:outline-edge"
                  >
                    <span>
                      <span className="block font-semibold">
                        {new Date(s.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      <span className="block text-[1rem] text-ink-soft">
                        {s.utterances_count ?? 0} utterances, {Math.round(Number(s.accuracy_rate ?? 0))}% confirmed first time
                        {assessed.has(s.id) ? " · assessed" : ""}
                      </span>
                    </span>
                    <Icon name="chevron" className="size-5 text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
