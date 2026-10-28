import { useState } from "react";
import { Link } from "react-router";

import { ButtonLink } from "~/components/Button";
import { Icon } from "~/components/Icon";
import { MicCheck } from "~/components/MicCheck";
import type { GardenHandle } from "~/three/GardenHost";

export const handle: GardenHandle = { garden: { stop: "stone3" } };

/** Step 3: the mic check, then into the garden. */
export default function SetupMic() {
  const [heard, setHeard] = useState(false);
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-headline text-balance">Last step: can I hear you?</h1>
      <MicCheck onHeard={() => setHeard(true)} />
      {heard && (
        <ButtonLink to="/home" className="w-full sm:w-auto sm:self-start">
          All done. Let's go
        </ButtonLink>
      )}
      <div className="flex flex-col gap-1">
        {!heard && (
          <Link to="/home" className="inline-flex min-h-12 items-center self-start underline underline-offset-4">
            I'll do this later
          </Link>
        )}
        <Link to="/setup/voice" className="inline-flex min-h-12 items-center gap-1 self-start underline underline-offset-4">
          <Icon name="back" className="size-5" />
          Back
        </Link>
      </div>
    </div>
  );
}
