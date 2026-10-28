import { Outlet, useLocation } from "react-router";

import { GardenStage } from "~/components/GardenStage";
import type { Route } from "./+types/setup";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Setting up - Epako Voice" }];
}

const STEPS = ["/setup", "/setup/voice", "/setup/mic"];
const TITLES = ["Your privacy", "Your voice", "Your microphone"];

/**
 * DESIGN.md, Setup: three steps, a progress bar that fills (goal gradient), Back on every step, step 2 skippable.
 * Each step is its own route so the garden's camera walks one stepping stone per step.
 */
export default function Setup() {
  const { pathname } = useLocation();
  const step = Math.max(0, STEPS.indexOf(pathname.replace(/\/$/, "")));
  return (
    <>
      <GardenStage>
        <p className="text-label text-ink-soft">
          Step {step + 1} of 3: {TITLES[step]}
        </p>
        <div
          className="mt-3 h-2 max-w-[20rem] overflow-hidden rounded-full bg-track"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step + 1}
          aria-label="Setup progress"
        >
          <div className="h-full origin-left rounded-full bg-link transition-[scale] duration-500 ease-out" style={{ scale: `${(step + 1) / 3} 1` }} />
        </div>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="max-w-[40rem] lg:max-w-[min(34rem,40vw)]">
          <Outlet />
        </div>
      </div>
    </>
  );
}
