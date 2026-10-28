import { Link, redirect } from "react-router";

import { PageIntro } from "~/components/PageIntro";
import { requireSession, supabase } from "~/lib/supabase";
import type { Route } from "./+types/clinician-pending";

export function meta({}: Route.MetaArgs) {
  return [{ title: "We're checking - Epako Voice" }, { name: "robots", content: "noindex" }];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const s = await requireSession(request);
  const { data } = await supabase().from("clinicians").select("verified").eq("user_id", s.user.id).maybeSingle();
  if (!data) throw redirect("/clinician/verify");
  if (data.verified) throw redirect("/clinician");
  return null;
}

export function HydrateFallback() {
  return null;
}

export default function ClinicianPending() {
  return (
    <PageIntro>
      <h1 className="text-headline text-balance">Thank you. We're checking your details.</h1>
      <p className="mt-4">
        We look you up on your professional register and make sure the name matches. It usually takes up to 2 working days. Sign in again
        after that to see your patients.
      </p>
      <p className="mt-8">
        <Link to="/sign-out" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
          Sign out for now
        </Link>
      </p>
    </PageIntro>
  );
}
