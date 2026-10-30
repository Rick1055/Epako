import { PageIntro } from "~/components/PageIntro";
import type { Route } from "./+types/clinician-sign-up";
import { AccountForm } from "./sign-up";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Clinician Portal Sign-Up — Epako Voice SLP Practice Platform" },
    {
      name: "description",
      content:
        "For Speech-Language Pathologists (SLPs), speech therapists, and neurologists: monitor patient practice sessions, review objective acoustic telemetry, and export clinical PDF reports.",
    },
    {
      name: "keywords",
      content:
        "speech-language pathologist software, SLP dysarthria tool, speech therapy clinical portal, acoustic biomarker tracking, speech telemetry, motor speech assessment",
    },
  ];
}

export default function ClinicianSignUp() {
  return (
    <>
      <PageIntro>
        <h1 className="text-headline text-balance">For clinicians: create your account.</h1>
        <p className="mt-4">
          Next, you'll tell us your professional register and licence number. We check them before you can see any patient, usually
          within 2 working days.
        </p>
      </PageIntro>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="max-w-[34rem]">
          <AccountForm clinician />
        </div>
      </div>
    </>
  );
}
