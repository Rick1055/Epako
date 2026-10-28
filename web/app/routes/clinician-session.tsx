import { useState } from "react";
import { Link, useLoaderData, useParams, useRevalidator } from "react-router";

import { Button } from "~/components/Button";
import { GardenStage } from "~/components/GardenStage";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { downloadReport } from "~/lib/report";
import { ApiError, session, supabase } from "~/lib/supabase";
import type { Route } from "./+types/clinician-session";
import { pseudonym } from "./clinician-patients";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Session - Epako Voice" }, { name: "robots", content: "noindex" }];
}

type Bio = {
  articulation_velocity: number | null;
  pause_ratio: number | null;
  vocal_jitter_pct: number | null;
  vocal_shimmer_pct: number | null;
  mean_f0_hz: number | null;
  formant_compression_index: number | null;
  stability_index: number | null;
};

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const me = (await session())!.user.id;
  const db = supabase();
  const [s, utts, bios, assessment] = await Promise.all([
    db.from("therapy_sessions").select("id, created_at, utterances_count, accuracy_rate, duration_seconds").eq("id", params.sid).maybeSingle(),
    db.from("session_utterances").select("transcribed_text, corrected_text, confirmed, created_at").eq("session_id", params.sid).order("created_at"),
    db.from("biomarker_logs").select("articulation_velocity, pause_ratio, vocal_jitter_pct, vocal_shimmer_pct, mean_f0_hz, formant_compression_index, stability_index").eq("session_id", params.sid).order("created_at", { ascending: false }).limit(1),
    db.from("clinical_assessments").select("condition, impression, home_plan, frequency").eq("session_id", params.sid).eq("clinician_id", me).maybeSingle(),
  ]);
  if (!s.data) throw new Response("Not found", { status: 404 });
  return { me, s: s.data, utterances: utts.data ?? [], bio: (bios.data?.[0] ?? null) as Bio | null, assessment: assessment.data };
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** Each value beside its approximate reference (the same ones the PDF report uses, src/pdf_generator.py). */
function rows(b: Bio) {
  const pause = n(b.pause_ratio) === null ? null : n(b.pause_ratio)! * 100;
  const cmp = (v: number | null, lo: number | null, hi: number) => (v === null ? "Not measured" : lo !== null && v < lo ? "Below" : v > hi ? "Above" : "Within");
  return [
    { name: "Articulation rate", note: "syllables per second while speaking", value: n(b.articulation_velocity), unit: "syll/s", ref: "3.8 – 5.2 (approx. adult range)", compared: cmp(n(b.articulation_velocity), 3.8, 5.2) },
    { name: "Pause ratio", note: "share of the recording in pauses", value: pause, unit: "%", ref: "12 – 22 % (approx.)", compared: cmp(pause, 12, 22) },
    { name: "Pitch variation", note: "frame-level jitter estimate", value: n(b.vocal_jitter_pct), unit: "%", ref: "1.04 % (MDVP cycle-level; not directly comparable)", compared: cmp(n(b.vocal_jitter_pct), null, 1.04) },
    { name: "Loudness variation", note: "frame-level shimmer estimate", value: n(b.vocal_shimmer_pct), unit: "%", ref: "3.81 % (MDVP cycle-level; not directly comparable)", compared: cmp(n(b.vocal_shimmer_pct), null, 3.81) },
    { name: "Mean pitch", note: "fundamental frequency", value: n(b.mean_f0_hz), unit: "Hz", ref: "None", compared: "Not compared" },
    { name: "Formant compression index", note: "pooled F1/F2 scatter", value: n(b.formant_compression_index), unit: "", ref: "None", compared: "Not compared" },
    { name: "Composite stability score", note: "hand-set weights", value: n(b.stability_index), unit: "/ 100", ref: "None", compared: "Not compared" },
  ];
}

export default function ClinicianSession() {
  const { id } = useParams();
  const { me, s, utterances, bio, assessment } = useLoaderData<typeof clientLoader>();
  const revalidator = useRevalidator();
  const [form, setForm] = useState({ condition: assessment?.condition ?? "", impression: assessment?.impression ?? "", home_plan: assessment?.home_plan ?? "", frequency: assessment?.frequency ?? "" });
  const [note, setNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "pdf">("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    if (Object.values(form).some((v) => !v.trim())) return setNote({ tone: "error", text: "Please fill in all four parts of the assessment." });
    setBusy("save");
    const { error } = await supabase()
      .from("clinical_assessments")
      .upsert({ session_id: s.id, clinician_id: me, ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) }, { onConflict: "session_id,clinician_id" });
    setBusy("");
    if (error) return setNote({ tone: "error", text: "I couldn't save the assessment just now. Please try again." });
    setNote({ tone: "success", text: "Assessment saved. The report can now be downloaded, by you and by the patient." });
    revalidator.revalidate();
  }

  async function pdf() {
    setBusy("pdf");
    setNote(null);
    try {
      await downloadReport(s.id);
    } catch (e) {
      setNote({ tone: "error", text: e instanceof ApiError && e.status === 422 ? `The report can't be made yet: ${e.message}` : e instanceof ApiError ? e.message : "Something got stuck. Please try again." });
    } finally {
      setBusy("");
    }
  }

  const field = (key: keyof typeof form, label: string, hint: string, long = false) => (
    <label className="block">
      <span className="block text-label">{label}</span>
      <span className="block text-[1rem] text-ink-soft">{hint}</span>
      {long ? (
        <textarea value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} rows={4} maxLength={2000} className="mt-2 block w-full rounded-input border-[1.5px] border-edge bg-surface px-4 py-3 text-ink" />
      ) : (
        <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} maxLength={200} className="mt-2 block h-14 w-full rounded-input border-[1.5px] border-edge bg-surface px-4 text-ink" />
      )}
    </label>
  );

  return (
    <>
      <GardenStage>
        <Link to={`/clinician/patient/${id}`} className="inline-flex min-h-12 items-center gap-1 underline underline-offset-4">
          <Icon name="back" className="size-5" />
          {pseudonym(id!)}
        </Link>
        <h1 className="mt-2 text-headline">
          Session of {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </h1>
        <p className="mt-4">
          {s.utterances_count ?? 0} utterances, {Math.round(Number(s.accuracy_rate ?? 0))}% confirmed without correction, {Math.round(Number(s.duration_seconds ?? 0) / 60)} min.
        </p>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex max-w-[52rem] flex-col gap-12">
          <p className="rounded-card bg-raised px-5 py-4 font-semibold">Automated measurements, not clinically validated, not a diagnosis.</p>

          <section aria-labelledby="m-title">
            <h2 id="m-title" className="text-title">
              Measurements
            </h2>
            <p className="mt-1 text-[1rem] text-ink-soft">From the latest recording in this session, as in the PDF report.</p>
            {bio ? (
              <div className="mt-4 overflow-x-auto rounded-card bg-surface">
                <table className="w-full min-w-[40rem] text-left text-[1rem]">
                  <thead>
                    <tr className="border-b border-card-line">
                      <th className="px-4 py-3">Measure</th>
                      <th className="px-4 py-3">This session</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Compared</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(bio).map((r) => (
                      <tr key={r.name} className="border-b border-card-line last:border-0">
                        <td className="px-4 py-3">
                          <span className="block font-semibold">{r.name}</span>
                          <span className="block text-ink-soft">{r.note}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold whitespace-nowrap">{r.value === null ? "Not measured" : `${r.value.toFixed(2)} ${r.unit}`}</td>
                        <td className="px-4 py-3">{r.ref}</td>
                        <td className="px-4 py-3">{r.compared}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-ink-soft">No measurements were recorded for this session.</p>
            )}
          </section>

          <section aria-labelledby="u-title">
            <h2 id="u-title" className="text-title">
              What the recogniser heard and what the patient confirmed
            </h2>
            <div className="mt-4 overflow-x-auto rounded-card bg-surface">
              <table className="w-full min-w-[36rem] text-left text-[1rem]">
                <thead>
                  <tr className="border-b border-card-line">
                    <th className="px-4 py-3">Heard</th>
                    <th className="px-4 py-3">Confirmed</th>
                    <th className="px-4 py-3">First time?</th>
                  </tr>
                </thead>
                <tbody>
                  {utterances.map((u, i) => (
                    <tr key={u.created_at + i} className="border-b border-card-line last:border-0">
                      <td className="px-4 py-3">{u.transcribed_text}</td>
                      <td className="px-4 py-3">{u.corrected_text}</td>
                      <td className="px-4 py-3">{u.confirmed ? "Yes" : "Corrected"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="a-title">
            <h2 id="a-title" className="text-title">
              Your assessment
            </h2>
            <form onSubmit={save} className="mt-4 flex max-w-[40rem] flex-col gap-6">
              {field("condition", "Condition", "In your own words.")}
              {field("impression", "Clinical impression", "What you observed in this session.", true)}
              {field("home_plan", "Home practice", "What the patient should practise.", true)}
              {field("frequency", "How often", "For example: 10 minutes, twice a day.")}
              {note && <Message tone={note.tone}>{note.text}</Message>}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="submit" disabled={busy !== ""}>
                  {busy === "save" ? "Saving…" : assessment ? "Save changes" : "Save assessment"}
                </Button>
                {assessment && (
                  <Button variant="secondary" onClick={pdf} disabled={busy !== ""}>
                    <Icon name="download" className="size-5" />
                    {busy === "pdf" ? "Preparing…" : "Download PDF"}
                  </Button>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
