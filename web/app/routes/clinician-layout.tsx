import { Link, redirect } from "react-router";

import { Logo } from "~/components/Logo";
import { PageIn } from "~/components/PageIn";
import { SiteFooter } from "~/components/SiteFooter";
import { ThemeToggle } from "~/components/ThemeToggle";
import { requireSession, supabase } from "~/lib/supabase";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/clinician-layout";

// Work screens: the garden seen from the greenhouse window, very still, no pointer play (DESIGN.md, the stops).
export const handle: GardenHandle = { garden: { stop: "greenhouse", still: true } };

/** Verified clinicians only; anyone else is sent to the step they're on. */
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const s = await requireSession(request);
  const { data } = await supabase().from("clinicians").select("display_name, verified").eq("user_id", s.user.id).maybeSingle();
  if (!data) throw redirect("/clinician/verify");
  if (!data.verified) throw redirect("/clinician/pending");
  return { name: data.display_name as string };
}

export default function ClinicianLayout() {
  return (
    <div className="work-screen flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-30 rounded-full bg-ink px-5 py-3 text-label text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <header className="relative z-20 mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:px-10">
        <Logo to="/clinician" />
        <div className="flex items-center gap-2">
          <Link to="/sign-out" className="inline-flex min-h-12 items-center px-3 text-label text-ink underline-offset-4 hover:underline">
            Sign out
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <PageIn />
      </main>
      <SiteFooter home="/clinician" />
    </div>
  );
}

export function HydrateFallback() {
  return <p className="mx-auto max-w-[1120px] px-5 pt-[14vh] text-ink-soft md:px-10">Opening your patients…</p>;
}
