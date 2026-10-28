// Me, Comfort: text size Normal / Large / Larger (100 / 115 / 130%). Kept in a cookie, like the theme, so the server
// renders the right size on the first byte. Everything is sized in rem, so the whole page scales with it.
export type TextSize = "normal" | "large" | "larger";

export const TEXT_SCALE: Record<TextSize, string | undefined> = { normal: undefined, large: "115%", larger: "130%" };

export function textSizeFromCookie(cookieHeader: string | null): TextSize {
  const match = cookieHeader?.match(/(?:^|;\s*)text=(large|larger)(?:;|$)/);
  return match ? (match[1] as TextSize) : "normal";
}

export function currentTextSize(): TextSize {
  return textSizeFromCookie(document.cookie);
}

/** Browser only: remember the choice and apply it at once. */
export function saveTextSize(size: TextSize) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = size === "normal" ? `text=; Path=/; Max-Age=0; SameSite=Lax${secure}` : `text=${size}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  document.documentElement.style.fontSize = TEXT_SCALE[size] ?? "";
}
