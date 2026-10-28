import { Link } from "react-router";

import { Icon } from "~/components/Icon";
import { ProsePage, Section } from "~/components/Prose";
import { contact } from "~/lib/site";
import type { Route } from "./+types/help";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Help - Epako Voice" },
    { name: "description", content: "Answers to the questions people ask most about Epako Voice, and how to reach us when you need a hand." },
  ];
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "I can't sign in",
    a: (
      <p>
        Check the email address is the one you signed up with. If you've forgotten your password, use{" "}
        <Link to="/forgot-password">Forgot your password?</Link> on the sign-in page and we'll email you a link. If the quick robot check
        won't finish, try reloading the page or another browser.
      </p>
    ),
  },
  {
    q: "I can't hear my voice",
    a: (
      <p>
        Check your device's volume and that it isn't on silent. If you see "Your voice needs saving again", open My voice, choose a voice
        and save it. You can always read the words on screen.
      </p>
    ),
  },
  {
    q: "It doesn't understand me",
    a: (
      <p>
        Try a little closer to the microphone, somewhere quiet. When it gets a word wrong, press "Not quite" and type what you meant: each
        fix teaches it your way of speaking, so it gets better the more you use it.
      </p>
    ),
  },
  {
    q: "What is stored about me?",
    a: (
      <p>
        Your email, what you said and confirmed, your practice numbers and voice measurements, and recordings only if you choose. The{" "}
        <Link to="/privacy">privacy notice</Link> has the details.
      </p>
    ),
  },
  {
    q: "How do I delete everything?",
    a: (
      <p>
        Go to Me and choose "Delete my account and data". It removes everything at once and can't be undone. See the{" "}
        <Link to="/privacy">privacy notice</Link> for exactly what goes.
      </p>
    ),
  },
  {
    q: "How does my clinician see my sessions?",
    a: (
      <p>
        In Care team, make a code and give it to your clinician; they enter it in their account. You can stop sharing at any time. The{" "}
        <Link to="/terms">terms</Link> say what clinicians agree to.
      </p>
    ),
  },
  {
    q: "Something is hard to use",
    a: (
      <p>
        Please tell us. The <Link to="/accessibility">accessibility page</Link> says what we've done and how to report a problem.
      </p>
    ),
  },
];

export default function Help() {
  return (
    <ProsePage
      title="How can we help?"
      before={
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 text-[1rem]">
            <li>
              <Link to="/" className="inline-flex min-h-12 items-center underline underline-offset-4">
                Home
              </Link>
            </li>
            <li aria-hidden="true">
              <Icon name="chevron" className="size-4 text-ink-soft" />
            </li>
            <li aria-current="page">Help</li>
          </ol>
        </nav>
      }
      summary={<p>Short answers to the questions people ask most. If yours isn't here, get in touch.</p>}
    >
      <div className="flex flex-col gap-2">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group rounded-card bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <Icon name="chevron" className="size-5 shrink-0 text-ink-soft transition-[rotate] duration-200 group-open:rotate-90" />
            </summary>
            <div className="px-5 pb-5">{a}</div>
          </details>
        ))}
      </div>

      <Section title="Get in touch">
        <p>
          Email <a href={`mailto:${contact.email}`}>{contact.email}</a> or call <a href={contact.phoneHref}>{contact.phone}</a>. Please don't
          include medical details.
        </p>
        <p>This isn't an emergency service. In an emergency, call your local emergency number.</p>
        {contact.isDemo && (
          <p className="text-ink-soft">This is a demo version, so the email and phone number here are samples and don't reach anyone.</p>
        )}
      </Section>
    </ProsePage>
  );
}
