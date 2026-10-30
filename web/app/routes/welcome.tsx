import { ButtonLink } from "~/components/Button";
import { EntryPage } from "~/components/EntryPage";
import type { Route } from "./+types/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Say it your way - Epako Voice" },
    {
      name: "description",
      content:
        "Epako Voice listens, tidies up what you said, and says it back in a voice you choose. A gentle helper for everyday speaking and practice.",
    },
    // Structured data (DESIGN.md, rule 28): only facts shown on the page; no ratings, reviews or medical claims.
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Epako Voice" },
          {
            "@type": "WebSite",
            name: "Epako Voice",
            description: "A helper for everyday speaking and practice for people with dysarthria. It isn't a medical device.",
          },
        ],
      },
    },
  ];
}

export default function Welcome() {
  return (
    <EntryPage>
      <div>
        <h1 className="text-display text-balance">Say it your way. We'll help it be heard.</h1>
        <p className="mt-6">
          Epako Voice listens, tidies up what you said, and says it back in a voice you choose. Go at your own pace,
          there's no rush here.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink to="/sign-up" className="w-full sm:w-auto">
            Get started
          </ButtonLink>
          <ButtonLink to="/clinician/sign-up" variant="secondary" className="w-full sm:w-auto">
            I'm a clinician
          </ButtonLink>
          <ButtonLink to="/sign-in" variant="quiet">
            Sign in
          </ButtonLink>
        </div>
        <p className="mt-8 text-ink-soft">
          A helper for everyday speaking and practice. It isn't a medical device, and it doesn't replace your clinician.
        </p>
      </div>
    </EntryPage>
  );
}
