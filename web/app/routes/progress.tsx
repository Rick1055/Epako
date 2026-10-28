import { useState } from "react";
import { Link, useLoaderData } from "react-router";

import { DayBars } from "~/components/DayBars";
import { StatTile } from "~/components/StatTile";
import { PageIntro } from "~/components/PageIntro";
import { Icon } from "~/components/Icon";
import { byDay, practice } from "~/lib/progress";
import type { Route } from "./+types/progress";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Progress - Epako Voice" }];
}

export async function clientLoader() {
  const { sessions, utterances } = await practice(28);
  return {
    days: byDay(sessions, utterances, 28),
    sessions: sessions.filter((s) => s.utterances_count),
  };
}

/** A plain sentence about what the chart shows; a dip is said plainly, never as a failure. */
function summary(days: { phrases: number }[], span: string) {
  const practised = days.filter((d) => d.phrases > 0).length;
  if (practised === 0) return `No practice ${span} yet. Whenever you're ready, I'm here.`;
  return `You've practised on ${practised} ${practised === 1 ? "day" : "days"} ${span}, saying ${days.reduce((n, d) => n + d.phrases, 0)} phrases.`;
}

export default function Progress() {
  const { days, sessions } = useLoaderData<typeof clientLoader>();
  const [span, setSpan] = useState<7 | 28>(7);
  const shown = days.slice(-span);
  const spanWords = span === 7 ? "this week" : "in the last four weeks";
  const totals = shown.reduce((t, d) => ({ phrases: t.phrases + d.phrases, confirmed: t.confirmed + d.confirmed, minutes: t.minutes + d.minutes }), {
    phrases: 0,
    confirmed: 0,
    minutes: 0,
  });

  return (
    <>
      <PageIntro>
        <h1 className="text-headline text-balance">How your practice is growing.</h1>
        <p className="mt-4">Small steps add up. Here's what you've done lately.</p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex max-w-[44rem] flex-col gap-10">
          <section aria-labelledby="chart-title" className="rounded-card bg-surface p-6">
            <h2 id="chart-title" className="sr-only">
              Chart
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-title">Phrases each day</h3>
              <div className="flex gap-1" role="group" aria-label="How far back">
                {[7, 28].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={span === n}
                    onClick={() => setSpan(n as 7 | 28)}
                    className="min-h-12 rounded-full px-4 text-label text-ink aria-pressed:bg-raised aria-pressed:font-bold"
                  >
                    {n === 7 ? "Week" : "4 weeks"}
                  </button>
                ))}
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-4">
              <StatTile label="Phrases" value={totals.phrases} />
              <StatTile label="Spot on" value={totals.phrases ? Math.round((100 * totals.confirmed) / totals.phrases) : null} suffix="%" />
              <StatTile label="Minutes" value={Math.round(totals.minutes)} />
            </dl>
            <p className="mt-3 text-[1rem] text-ink-soft">"Spot on" means you said yes to what I understood without changing it.</p>
            <p className="mt-6" aria-live="polite">
              {summary(shown, spanWords)}
            </p>
            <div className="mt-6">
              <DayBars
                days={shown}
                measure="phrases"
                title="Phrases"
                goal={span === 7 ? 5 : undefined}
              />
            </div>
          </section>

          <section aria-labelledby="sessions-title">
            <h2 id="sessions-title" className="text-title">
              Your sessions
            </h2>
            {sessions.length === 0 ? (
              <p className="mt-2 text-ink-soft">Each time you practise and press "Finish for now", the session appears here.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/progress/${s.id}`}
                      className="flex min-h-14 items-center justify-between gap-4 rounded-card bg-surface px-5 py-3 text-ink no-underline hover:outline-[1.5px] hover:outline-edge focus-visible:outline-edge"
                    >
                      <span>
                        <span className="block font-semibold">
                          {new Date(s.created_at).toLocaleDateString("en-GB", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                        </span>
                        <span className="block text-[1rem] text-ink-soft">
                          {s.utterances_count} {s.utterances_count === 1 ? "phrase" : "phrases"}, {Math.round(Number(s.accuracy_rate))}% spot on
                        </span>
                      </span>
                      <Icon name="chevron" className="size-5 text-ink-soft" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
