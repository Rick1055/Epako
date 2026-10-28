import { Link } from "react-router";

import { ProsePage, Section } from "~/components/Prose";
import { contact } from "~/lib/site";
import type { Route } from "./+types/privacy";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Privacy - Epako Voice" },
    { name: "description", content: "What Epako Voice keeps about you, where it's kept, who can see it, and how to delete all of it, in plain words." },
  ];
}

export default function Privacy() {
  return (
    <ProsePage
      title="Your privacy, in plain words."
      summary={
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>We keep your email, what you said and what you confirmed, and your practice numbers. Never your name.</li>
          <li>Recordings are kept only if you switch that on.</li>
          <li>Only you, and clinicians you choose, can see your practice.</li>
          <li>You can delete everything, at any time, from Me.</li>
        </ul>
      }
    >
      <Section title="What we keep">
        <ul>
          <li>
            <strong>Your account:</strong> your email address and password (stored scrambled, so nobody can read it). We don't ask for your
            name, and we don't store it.
          </li>
          <li>
            <strong>What you said:</strong> for each phrase, the words the recogniser heard and the words you confirmed or typed. This is
            how the app learns your way of speaking.
          </li>
          <li>
            <strong>What the app learns:</strong> the word fixes you've taught it and the words you use, kept with your account.
          </li>
          <li>
            <strong>Practice numbers:</strong> when you practised, for how long, how many phrases, and how many were right first time.
          </li>
          <li>
            <strong>Voice measurements:</strong> automated measurements of each recording, such as speaking pace, pauses and pitch
            steadiness. They're estimates for you and your clinician to look at together, not a diagnosis.
          </li>
          <li>
            <strong>Your voice settings:</strong> the voice you chose and how you tuned it.
          </li>
          <li>
            <strong>Recordings, only if you choose:</strong> if you switch on "Save my recordings", your recordings are kept privately so
            you and your clinician can listen back. If it's off (it starts off), each recording is thrown away once it has been understood
            and measured.
          </li>
        </ul>
      </Section>

      <Section title="Where it's kept">
        <p>
          Your account and data are kept with Supabase, in their data centre in Mumbai, India, protected by rules that let each person see
          only their own data. Your recordings are understood and spoken back on our own server: the voice that speaks your words runs
          there too, so what you say isn't sent to any outside speech or voice company.
        </p>
      </Section>

      <Section title="Who can see it">
        <ul>
          <li>You.</li>
          <li>
            Clinicians you choose to share with, using a code from <Link to="/care">Care team</Link>. They see your sessions, what you said
            and confirmed, and your voice measurements, and nothing else. You can stop sharing at any time, and they lose access at once.
          </li>
          <li>Nobody else. We don't sell or share your data, and there are no adverts.</li>
        </ul>
      </Section>

      <Section title="Other services we use">
        <ul>
          <li>
            <strong>Cloudflare Turnstile</strong> checks that a person, not a robot, is signing in or creating an account. Cloudflare sees
            technical details about your browser for that check.
          </li>
          <li>
            <strong>Pwned Passwords</strong> (haveibeenpwned.com) tells us if a new password has appeared in a known data leak. Only the
            first 5 characters of a scrambled version of the password are sent, never the password itself.
          </li>
        </ul>
        <p>There's no advertising or visitor tracking on Epako Voice.</p>
      </Section>

      <Section title="Cookies and storage on your device">
        <p>
          Two small cookies remember your look (morning or evening) and text size. Your browser also keeps your sign-in. None of
          these are used to track you.
        </p>
      </Section>

      <Section title="Deleting everything">
        <p>
          In <Link to="/me">Me</Link>, "Delete my account and data" removes your account, sessions, phrases, measurements, voice settings,
          what the app has learned, any recordings, and any sharing with clinicians. It happens straight away and can't be undone.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Ask us any time: <a href={`mailto:${contact.email}`}>{contact.email}</a> or <a href={contact.phoneHref}>{contact.phone}</a>. See also{" "}
          <Link to="/help">Help</Link> and the <Link to="/terms">terms</Link>.
        </p>
      </Section>
    </ProsePage>
  );
}
