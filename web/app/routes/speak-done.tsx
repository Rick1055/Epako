import { redirect, useLoaderData } from "react-router";

import { ButtonLink } from "~/components/Button";
import { PageIntro } from "~/components/PageIntro";
import { api } from "~/lib/supabase";
import type { Route } from "./+types/speak-done";
import { SESSION_KEY } from "./speak";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Well done - Epako Voice" }];
}

// Finishing is done by the server from the stored phrases (the client never supplies the numbers).
export async function clientLoader() {
  const id = sessionStorage.getItem(SESSION_KEY);
  if (!id) throw redirect("/home");
  const r = await api<{ duration_seconds: number; utterances_count: number; accuracy_rate: number }>(`/api/sessions/${id}/finish`, { method: "POST" });
  sessionStorage.removeItem(SESSION_KEY);
  return r;
}

/** DESIGN.md, Session summary: the first line is what went well; one next step. */
export default function SpeakDone() {
  const { utterances_count: n, accuracy_rate, duration_seconds } = useLoaderData<typeof clientLoader>();
  const spotOn = Math.round((n * accuracy_rate) / 100);
  const minutes = Math.max(1, Math.round(duration_seconds / 60));
  const first =
    n === 0
      ? "You showed up today, and that counts."
      : spotOn === n
        ? `You said ${n} ${n === 1 ? "phrase" : "phrases"}, and every one was spot on!`
        : spotOn > 0
          ? `You said ${n} phrases, and ${spotOn} ${spotOn === 1 ? "was" : "were"} spot on.`
          : `You said ${n} ${n === 1 ? "phrase" : "phrases"}, and each fix you made teaches me your way of speaking.`;

  return (
    <PageIntro>
      <h1 className="text-display text-balance">{first}</h1>
      <p className="mt-6">
        That was about {minutes} {minutes === 1 ? "minute" : "minutes"} of practice.
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <ButtonLink to="/progress" className="w-full sm:w-auto">
          See your progress
        </ButtonLink>
        <ButtonLink to="/home" variant="quiet">
          Done for today
        </ButtonLink>
      </div>
    </PageIntro>
  );
}
