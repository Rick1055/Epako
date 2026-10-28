import { PageIntro } from "~/components/PageIntro";
import type { Route } from "./+types/clinician-sign-up";
import { AccountForm } from "./sign-up";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Clinician sign-up - Epako Voice" },
    { name: "description", content: "Speech and language therapists and doctors: create an Epako Voice account to follow the practice your patients share with you." },
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
