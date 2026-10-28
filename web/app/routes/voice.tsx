import { useState } from "react";
import { useBlocker, useLoaderData, useRevalidator } from "react-router";

import { Button } from "~/components/Button";
import { GardenStage } from "~/components/GardenStage";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { BankVoice, useSample, VoicePicker, VoiceSliders } from "~/components/VoiceControls";
import { myProfile, saveVoice, toProfile } from "~/lib/patient";
import { ApiError } from "~/lib/supabase";
import type { GardenHandle } from "~/three/GardenHost";
import type { Route } from "./+types/voice";

export const handle: GardenHandle = { garden: { stop: "ferns" } };

export function meta({}: Route.MetaArgs) {
  return [{ title: "My voice - Epako Voice" }];
}

export async function clientLoader() {
  return toProfile((await myProfile()).voice_profile);
}

/** DESIGN.md, Voice: the setup controls as a settings screen, with a live preview and a warning before leaving unsaved. */
export default function Voice() {
  const saved = useLoaderData<typeof clientLoader>();
  const revalidator = useRevalidator();
  const [voice, setVoice] = useState(saved);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { playing, error, sample } = useSample();
  const changed = JSON.stringify(voice) !== JSON.stringify(saved);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => changed && currentLocation.pathname !== nextLocation.pathname);

  async function save() {
    setBusy(true);
    setStatus(null);
    try {
      await saveVoice(voice);
      setStatus({ tone: "success", text: "Saved. This is the voice I'll speak with now." });
      revalidator.revalidate();
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof ApiError ? e.message : "I couldn't save your voice just now. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <GardenStage>
        <h1 className="text-headline text-balance">The voice that speaks for you.</h1>
        <p className="mt-4">Choose a voice, shape it until it feels like yours, then save it.</p>
      </GardenStage>
      <div className="mx-auto max-w-[1120px] px-5 pb-18 md:px-10">
        <div className="flex max-w-[40rem] flex-col gap-10 lg:max-w-[min(34rem,40vw)]">
          <VoicePicker value={voice} onChange={setVoice} />
          <VoiceSliders value={voice} onChange={setVoice} />
          <div className="flex flex-col gap-4">
            {error && <Message tone="error">{error}</Message>}
            {status && <Message tone={status.tone}>{status.text}</Message>}
            {changed && <p className="text-label">You have changes that aren't saved yet.</p>}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button onClick={save} disabled={busy || !changed} className="w-full sm:w-auto">
                {busy ? "Saving…" : "Save my voice"}
              </Button>
              <Button variant="secondary" onClick={() => sample("preview", voice)} disabled={playing === "preview"}>
                <Icon name="play" className="size-5" />
                {playing === "preview" ? "Playing…" : "Hear it"}
              </Button>
              {changed && (
                <Button variant="quiet" onClick={() => setVoice(saved)}>
                  Undo changes
                </Button>
              )}
            </div>
          </div>
          <BankVoice onProfile={setVoice} />
        </div>
      </div>

      {blocker.state === "blocked" && (
        <div role="alertdialog" aria-labelledby="leave-title" className="fixed inset-0 z-40 flex items-end justify-center bg-scrim p-5 sm:items-center">
          <div className="w-full max-w-[28rem] rounded-card bg-bg p-6 shadow-float">
            <h2 id="leave-title" className="text-title">
              Leave without saving?
            </h2>
            <p className="mt-2">Your changes to the voice will be lost.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary" onClick={() => blocker.reset()} autoFocus>
                Stay here
              </Button>
              <Button variant="quiet" onClick={() => blocker.proceed()}>
                Leave anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
