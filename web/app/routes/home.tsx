import { Link, useLoaderData } from "react-router";

import { ButtonLink } from "~/components/Button";
import { GardenStage } from "~/components/GardenStage";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { DayBars } from "~/components/DayBars";
import { StatTile } from "~/components/StatTile";
import { useSample } from "~/components/VoiceControls";
import { myProfile, toProfile } from "~/lib/patient";
import { byDay, practice } from "~/lib/progress";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/home";

export const handle: GardenHandle = { garden: { stop: "clearing" } };

export function meta({}: Route.MetaArgs) {
  return [{ title: "Today - Epako Voice" }];
}

export async function clientLoader() {
  const [profile, { sessions, utterances }] = await Promise.all([myProfile(), practice(7)]);
  return { profile, week: byDay(sessions, utterances, 7), recent: utterances.filter((u) => u.confirmed && u.corrected_text).slice(0, 5) };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}

export default function Home() {
  const { profile, week, recent } = useLoaderData<typeof clientLoader>();
  const today = week[week.length - 1];
  const voice = toProfile(profile.voice_profile);
  const voiceSaved = Object.keys(profile.voice_profile ?? {}).length > 0;
  const daysPractised = week.filter((d) => d.phrases > 0).length;
  const { playing, error, sample } = useSample();
  const first = recent.length === 0 && week.every((d) => d.phrases === 0);

  return (
    <>
      <GardenStage>
        <h1 className="text-display text-balance">{greeting()}</h1>
        <p className="mt-4">
          {first
            ? "Say your first phrase whenever you're ready. There's no rush."
            : today.phrases > 0
              ? `You've said ${today.phrases} ${today.phrases === 1 ? "phrase" : "phrases"} today. Lovely.`
              : "Take your time. Say a few phrases whenever you like."}
        </p>
        <ButtonLink to="/speak" className="mt-8 w-full min-h-16 px-10 text-title sm:w-auto">
          <Icon name="mic" />
          Speak
        </ButtonLink>
      </GardenStage>

      <div className="mx-auto flex max-w-[1120px] flex-col gap-10 px-5 pb-18 md:px-10">
        <div className="flex w-full flex-col gap-10 lg:max-w-[min(34rem,40vw)]">
          {!voiceSaved && (
            <div className="rounded-card bg-surface p-6">
              <p className="font-semibold">Your voice isn't chosen yet.</p>
              <p className="mt-1">I'll use a warm, steady voice until you pick one you like.</p>
              <Link to="/voice" className="mt-2 inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
                Choose my voice
              </Link>
            </div>
          )}

          <section aria-labelledby="today-title" className="rounded-card bg-surface p-6">
            <h2 id="today-title" className="text-title">
              Today
            </h2>
            <dl className="mt-4 grid grid-cols-3 gap-4">
              <StatTile label="Phrases" value={today.phrases} />
              <StatTile label="Spot on" value={today.phrases ? Math.round((100 * today.confirmed) / today.phrases) : null} suffix="%" />
              <StatTile label="Minutes" value={Math.round(today.minutes)} />
            </dl>

            <h3 className="mt-8 text-label">This week</h3>
            <p className="mt-1 text-[1rem] text-ink-soft">
              {daysPractised === 0 ? "Nothing yet this week, and that's fine." : `You've practised on ${daysPractised} ${daysPractised === 1 ? "day" : "days"} this week.`}
            </p>
            <div className="mt-4">
              <DayBars days={week} measure="phrases" title="Phrases" height={88} goal={5} />
            </div>
          </section>

          <section aria-labelledby="recent-title">
            <h2 id="recent-title" className="text-title">
              Recent phrases
            </h2>
            {error && (
              <div className="mt-4">
                <Message tone="error">{error}</Message>
              </div>
            )}
            {recent.length === 0 ? (
              <p className="mt-2 text-ink-soft">The phrases you confirm will gather here, so you can hear them again.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {recent.map((u, i) => (
                  <li key={u.created_at + i}>
                    <button
                      type="button"
                      onClick={() => sample(String(i), voice, u.corrected_text!)}
                      className="flex min-h-14 w-full items-center gap-4 rounded-card bg-surface px-5 py-3 text-left text-ink transition-[scale] duration-160 ease-out hover:outline-[1.5px] hover:outline-edge active:scale-[0.99]"
                    >
                      <Icon name={playing === String(i) ? "sound-on" : "play"} className="size-5 shrink-0 text-link" />
                      <span className="flex-1">{u.corrected_text}</span>
                      <span className="sr-only">Hear it again</span>
                    </button>
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
