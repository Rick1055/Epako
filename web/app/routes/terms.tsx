import { Link } from "react-router";

import { ProsePage, Section } from "~/components/Prose";
import { contact } from "~/lib/site";
import type { Route } from "./+types/terms";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Terms - Epako Voice" },
    { name: "description", content: "The terms for using Epako Voice, in plain words: what it is, what it isn't, and what we ask of you." },
  ];
}

export default function Terms() {
  return (
    <ProsePage
      title="The terms, in plain words."
      summary={
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Epako Voice is a helper for everyday speaking and practice. It isn't a medical device.</li>
          <li>It can get things wrong, so check what it says before relying on it.</li>
          <li>It's free, and you can stop using it and delete everything at any time.</li>
        </ul>
      }
    >
      <Section title="What Epako Voice is">
        <p>
          It listens to what you say, tidies up the words, and says them back in a voice you choose. It also keeps track of your practice
          and can share it with a clinician you choose.
        </p>
      </Section>

      <Section title="What it isn't">
        <ul>
          <li>It isn't a medical device and doesn't diagnose, treat or monitor any condition.</li>
          <li>It doesn't replace your speech and language therapist, doctor or any other clinician.</li>
          <li>Its voice measurements are automated estimates, not clinically validated results.</li>
          <li>It isn't an emergency service. In an emergency, call your local emergency number.</li>
        </ul>
      </Section>

      <Section title="It can make mistakes">
        <p>
          Speech recognition isn't perfect, especially at first. Always check the words before you rely on them, and use "Not quite" to
          fix them: that's also how it learns. Don't use it where a wrong word could cause harm, such as for medicines or money.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>Keep your password to yourself. If you think someone else knows it, change it.</li>
          <li>Use the app for yourself, or for someone you care for with their permission.</li>
          <li>Please don't try to break into the app, other people's accounts or our servers, or overload them.</li>
        </ul>
      </Section>

      <Section title="Clinicians">
        <p>
          Clinicians using Epako Voice confirm they are licensed and are checked against a professional register before they can see any
          patient. They can only see what a patient has chosen to share with them, and must use it only to help that patient.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          It's yours. The <Link to="/privacy">privacy notice</Link> says what's kept and who can see it, and you can delete everything from Me
          at any time.
        </p>
      </Section>

      <Section title="Changes and questions">
        <p>
          If these terms change, this page is updated. Questions are welcome:{" "}
          <a href={`mailto:${contact.email}`}>{contact.email}</a>.
        </p>
      </Section>
    </ProsePage>
  );
}
