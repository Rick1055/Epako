import { Link, useLoaderData, useRouteLoaderData } from "react-router";

import { ButtonLink } from "~/components/Button";
import { GardenStage } from "~/components/GardenStage";
import { Icon } from "~/components/Icon";
import { session, supabase } from "~/lib/supabase";
import type { Route } from "./+types/clinician-patients";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Patients - Epako Voice" }, { name: "robots", content: "noindex" }];
}

/** Pseudonymous: no names are stored anywhere, so a patient is the start of their record's id. */
export const pseudonym = (id: string) => `Patient ${id.slice(0, 4)}`;

export async function clientLoader() {
  const me = (await session())!.user.id;
  const db = supabase();
  const { data: grants, error } = await db.from("clinician_access").select("patient_id, granted_at").eq("clinician_id", me).is("revoked_at", null);
  if (error) throw error;
  const ids = grants.map((g) => g.patient_id);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: sessions } = ids.length
    ? await db.from("therapy_sessions").select("patient_id, created_at").in("patient_id", ids).order("created_at", { ascending: false }).limit(1000)
    : { data: [] as { patient_id: string; created_at: string }[] };
  return grants
    .map((g) => {
      const mine = (sessions ?? []).filter((s) => s.patient_id === g.patient_id);
      return { id: g.patient_id, since: g.granted_at, last: mine[0]?.created_at ?? null, week: mine.filter((s) => s.created_at >= weekAgo).length };
    })
    .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? ""));
}

export default function ClinicianPatients() {
  const patients = useLoaderData<typeof clientLoader>();
  const me = useRouteLoaderData("routes/clinician-layout") as { name: string } | undefined;
  return (
    <>
      <GardenStage>
        <h1 className="text-headline text-balance">Your patients{me ? `, ${me.name}` : ""}.</h1>
        <p className="mt-4">Patients who have shared their practice with you. They can stop sharing at any time.</p>
        <ButtonLink to="/clinician/link" className="mt-8 w-full sm:w-auto">
          Add a patient
        </ButtonLink>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="max-w-[44rem]">
          {patients.length === 0 ? (
            <p className="text-ink-soft">No patients yet. Ask a patient to make a code in their Care team page, then add them with it.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {patients.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/clinician/patient/${p.id}`}
                    className="flex min-h-14 items-center justify-between gap-4 rounded-card bg-surface px-5 py-3 text-ink no-underline hover:outline-[1.5px] hover:outline-edge"
                  >
                    <span>
                      <span className="block font-semibold">{pseudonym(p.id)}</span>
                      <span className="block text-[1rem] text-ink-soft">
                        {p.last ? `Last session ${new Date(p.last).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "No sessions yet"}, {p.week} this week
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
