import { useSyncExternalStore } from "react";

// The look the person chose: "light" (morning), "dark" (evening), or null to follow the device.
// Kept in a plain cookie so the server renders the right theme on the first byte (no flash).
export type Theme = "light" | "dark";

const effective = (): Theme => (document.documentElement.dataset.theme as Theme | undefined) ?? deviceTheme();

function subscribe(onChange: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener("change", onChange);
  };
}

/** The theme actually showing (pinned, or the device's). Browser only; "light" during server rendering. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, effective, () => "light");
}

const COOKIE = "theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function themeFromCookie(cookieHeader: string | null): Theme | null {
  const match = cookieHeader?.match(/(?:^|;\s*)theme=(light|dark)(?:;|$)/);
  return match ? (match[1] as Theme) : null;
}

export function deviceTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Pin a theme (or null to follow the device again) and apply it at once. Browser only. */
export function saveTheme(theme: Theme | null) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = theme
    ? `${COOKIE}=${theme}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`
    : `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
