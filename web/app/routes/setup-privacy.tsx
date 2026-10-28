import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";

import { Button } from "~/components/Button";
import { Message } from "~/components/Message";
import { Switch } from "~/components/Switch";
import { myProfile, saveConsent } from "~/lib/patient";
import type { GardenHandle } from "~/three/GardenHost";

export const handle: GardenHandle = { garden: { stop: "stone1" } };

export async function clientLoader() {
  return myProfile();
}

/** Step 1: what happens to recordings, and the one switch (off by default). */
export default function SetupPrivacy() {
  const profile = useLoaderData<typeof clientLoader>();
  const navigate = useNavigate();
  const [keep, setKeep] = useState(profile.consent_audio_storage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function next() {
    setBusy(true);
    setError("");
    try {
      await saveConsent(keep);
      navigate("/setup/voice");
    } catch {
      setError("I couldn't save that just now. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-headline text-balance">First, your privacy.</h1>
      <p>
        When you speak, your recording comes to us, I work out what you said and say it back, and then the recording is thrown away.
        What's kept is the text: what I heard and what you confirmed, so I can learn your way of speaking.
      </p>
      <p>
        If you'd like, you can also keep the recordings, so you and your clinician can listen back later. They're stored privately and only
        people you choose can hear them.
      </p>
      <Switch checked={keep} onChange={setKeep} label="Save my recordings so my clinician and I can review them" />
      <p className="text-ink-soft">You can change this any time in Me.</p>
      {error && <Message tone="error">{error}</Message>}
      <Button onClick={next} disabled={busy} className="w-full sm:w-auto sm:self-start">
        {busy ? "Saving…" : "Next"}
      </Button>
    </div>
  );
}
