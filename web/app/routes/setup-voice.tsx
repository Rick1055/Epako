import { useState } from "react";
import { Link, useLoaderData, useNavigate } from "react-router";

import { Button } from "~/components/Button";
import { Icon } from "~/components/Icon";
import { Message } from "~/components/Message";
import { useSample, VoicePicker } from "~/components/VoiceControls";
import { myProfile, saveVoice, toProfile } from "~/lib/patient";
import { ApiError } from "~/lib/supabase";

export async function clientLoader() {
  return toProfile((await myProfile()).voice_profile);
}

/** Step 2: choose a voice, then save. Fine-tuning and voice banking wait on My voice. Skippable: the default voice is used. */
export default function SetupVoice() {
  const saved = useLoaderData<typeof clientLoader>();
  const navigate = useNavigate();
  const [voice, setVoice] = useState(saved);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { playing, error: sampleError, sample } = useSample();

  async function next() {
    setBusy(true);
    setError("");
    try {
      await saveVoice(voice);
      navigate("/setup/mic");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "I couldn't save your voice just now. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-headline text-balance">Now, the voice that speaks for you.</h1>
      <VoicePicker value={voice} onChange={setVoice} />
      <p className="text-ink-soft">You can fine-tune it any time in My voice: its pitch, speed, warmth, or a voice closer to your own.</p>
      {error && <Message tone="error">{error}</Message>}
      {sampleError && <Message tone="error">{sampleError}</Message>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button onClick={next} disabled={busy} className="w-full sm:w-auto">
          {busy ? "Saving…" : "Save and continue"}
        </Button>
        <Button variant="secondary" onClick={() => sample("preview", voice)} disabled={playing === "preview"}>
          <Icon name="play" className="size-5" />
          {playing === "preview" ? "Playing…" : "Hear it"}
        </Button>
        <Link to="/setup/mic" className="inline-flex min-h-12 items-center justify-center px-3 underline underline-offset-4">
          Skip for now
        </Link>
      </div>
      <Link to="/setup" className="inline-flex min-h-12 items-center gap-1 self-start underline underline-offset-4">
        <Icon name="back" className="size-5" />
        Back
      </Link>
    </div>
  );
}
