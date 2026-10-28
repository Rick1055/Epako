import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "react-router";

// The browser's own Supabase client, made on first use (browser only: no session ever reaches the page server).
// It holds the public anon key only; every rule about who may read what is enforced by row-level security.
let client: SupabaseClient | undefined;

export function supabase() {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string);
  return client;
}

export async function session() {
  return (await supabase().auth.getSession()).data.session;
}

/** For a signed-in route's clientLoader: the session, or off to sign in (and back here afterwards). */
export async function requireSession(request: Request) {
  const s = await session();
  if (!s) {
    const url = new URL(request.url);
    throw redirect(`/sign-in?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return s;
}

/** Only a path on this site may be a place to go after signing in (no open redirects). */
export function safeNext(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The server's own words, for callers that act on a specific answer. */
    public detail = "",
  ) {
    super(message);
  }
}

/** A call to the speech API (proxied by the page server), signed with the person's own access token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const s = await session();
  if (!s) throw new ApiError(401, "Please sign in again.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${s.access_token}`);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  // A dropped connection or a momentarily busy server gets one quiet retry, but only where repeating is harmless
  // (recognising speech, reading): a retried save could store a phrase twice.
  const repeatable = path === "/api/rectify" || (init.method ?? "GET") === "GET";
  const send = () => fetch(path, { ...init, headers });
  let res: Response;
  try {
    res = await send();
    if (repeatable && (res.status === 502 || res.status === 503)) res = await send();
  } catch {
    try {
      if (!repeatable) throw new Error("not repeatable");
      res = await send();
    } catch {
      throw new ApiError(0, "I couldn't reach Epako Voice. Check your connection and try again.");
    }
  }
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b) => (typeof b?.detail === "string" ? b.detail : ""))
      .catch(() => "");
    // A request the person can fix keeps the server's words; a failure on our side gets kind words, never internals.
    throw new ApiError(res.status, (res.status < 500 && detail) || apiMessage(res.status), detail);
  }
  return (res.headers.get("content-type")?.includes("json") ? res.json() : res.blob()) as Promise<T>;
}

function apiMessage(status: number) {
  if (status === 401) return "Please sign in again.";
  if (status === 429) return "That's a lot of tries in a short time. Take a breather and try again in a minute.";
  if (status === 503) return "The speech helper is resting just now. Please try again in a moment.";
  return "Something got stuck on our side. Please try again.";
}

/** Supabase's sign-in and sign-up errors in the product's own words (DESIGN.md, sign up and sign in). */
export function authMessage(error: { message: string; status?: number; code?: string }) {
  const m = error.message.toLowerCase();
  if (m.includes("captcha")) return "The quick check didn't go through. Please try the check again.";
  if (m.includes("invalid login") || error.code === "invalid_credentials") return "That email and password don't match. Try again, or reset your password.";
  if (m.includes("not confirmed")) return "Please confirm your email first. The link is in the message we sent you.";
  if (m.includes("already registered") || error.code === "user_already_exists") return "There's already an account with that email. Try signing in instead.";
  if (error.status === 429 || m.includes("rate limit")) return "That's a lot of tries in a short time. Please wait a few minutes and try again.";
  if (m.includes("password") && m.includes("characters")) return "Your password needs at least 12 characters.";
  if (m.includes("weak") || m.includes("pwned")) return "That password is easy to guess or has shown up in a data leak, so let's pick another.";
  return "Something got stuck on our side. Please try again.";
}
