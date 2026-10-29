// Me, Comfort: calm mode hides the 3D backdrop and stops ambient audio.
// Kept as a plain cookie (same pattern as theme.ts) so the 3D scene never loads on first paint.
const COOKIE = "calm";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function calmFromCookie(cookieHeader: string | null): boolean {
  return /(?:^|;\s*)calm=1(?:;|$)/.test(cookieHeader ?? "");
}

export function currentCalm(): boolean {
  return calmFromCookie(document.cookie);
}

/** Browser only: toggle and apply at once. Sylva re-checks on the next mount. */
export function saveCalm(on: boolean) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = on
    ? `${COOKIE}=1; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`
    : `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

