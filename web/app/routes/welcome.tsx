import { Link } from "react-router";

import { ButtonLink } from "~/components/Button";
import { GardenStage } from "~/components/GardenStage";
import { useSmoothScroll } from "~/lib/smooth-scroll";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/welcome";

export const handle: GardenHandle = { garden: { stop: "gate" } };

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Say it your way - Epako Voice" },
    {
      name: "description",
      content:
        "Epako Voice listens, tidies up what you said, and says it back in a voice you choose. A gentle helper for everyday speaking and practice.",
    },
  ];
}

export default function Welcome() {
  useSmoothScroll();
  return (
    <GardenStage size="hero">
      <div className="max-w-[34rem]">
        <h1 className="text-display text-balance">Say it your way. We'll help it be heard.</h1>
        <p className="mt-6">
          Epako Voice listens, tidies up what you said, and says it back in a voice you choose. Go at your own pace,
          there's no rush here.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <ButtonLink to="/sign-up" className="w-full sm:w-auto">
            Get started
          </ButtonLink>
          <ButtonLink to="/sign-in" variant="quiet">
            Sign in
          </ButtonLink>
        </div>
        <p className="mt-10 text-ink-soft">
          A helper for everyday speaking and practice. It isn't a medical device, and it doesn't replace your clinician.
        </p>
        <p className="mt-4">
          <Link to="/clinician/sign-up" className="inline-flex min-h-12 items-center underline underline-offset-4">
            I'm a clinician
          </Link>
        </p>
      </div>
    </GardenStage>
  );
}
