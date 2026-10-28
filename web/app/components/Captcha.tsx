import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { forwardRef } from "react";

import { useTheme } from "~/lib/theme";

/**
 * The Cloudflare Turnstile check, shown in the flow of the form (never over it). Its token works once, so the form
 * calls `reset()` on the ref after every attempt.
 */
export const Captcha = forwardRef<TurnstileInstance | undefined, { onToken: (token: string | null) => void }>(function Captcha({ onToken }, ref) {
  const theme = useTheme();
  return (
    <div className="min-h-[65px]">
      <Turnstile
        ref={ref}
        siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY as string}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
        options={{ theme, size: "flexible", language: "en" }}
      />
    </div>
  );
});
