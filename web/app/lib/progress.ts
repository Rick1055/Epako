import { supabase } from "./supabase";

// Practice numbers, worked out from the patient's own stored rows (therapy_sessions, session_utterances).

export type Session = { id: string; created_at: string; duration_seconds: number | null; utterances_count: number | null; accuracy_rate: number | null };
export type Utterance = { session_id: string; corrected_text: string | null; transcribed_text: string; confirmed: boolean; created_at: string };
export type Day = { date: string; phrases: number; confirmed: number; minutes: number };

/** A day key in the person's own time zone. */
export const dayKey = (iso: string | Date) => new Date(iso).toLocaleDateString("en-CA");

export async function practice(days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const db = supabase();
  const [sessions, utterances] = await Promise.all([
    db.from("therapy_sessions").select("id, created_at, duration_seconds, utterances_count, accuracy_rate").gte("created_at", since).order("created_at", { ascending: false }),
    db.from("session_utterances").select("session_id, corrected_text, transcribed_text, confirmed, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(2000),
  ]);
  if (sessions.error) throw sessions.error;
  if (utterances.error) throw utterances.error;
  return { sessions: sessions.data as Session[], utterances: utterances.data as Utterance[] };
}

/** One entry per calendar day, oldest first, ending today (days with nothing are zeros, never missing). */
export function byDay(sessions: Session[], utterances: Utterance[], days: number): Day[] {
  const out = new Map<string, Day>();
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(new Date(Date.now() - i * 86400000));
    out.set(date, { date, phrases: 0, confirmed: 0, minutes: 0 });
  }
  for (const u of utterances) {
    const d = out.get(dayKey(u.created_at));
    if (d) {
      d.phrases++;
      if (u.confirmed) d.confirmed++;
    }
  }
  for (const s of sessions) {
    const d = out.get(dayKey(s.created_at));
    if (d && s.duration_seconds) d.minutes += Number(s.duration_seconds) / 60;
  }
  return [...out.values()];
}

export const weekday = (date: string, style: "short" | "long" = "short") => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: style });
