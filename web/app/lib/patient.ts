import { api, ApiError, session, supabase } from "./supabase";

// The patient's own data, read under their login (row-level security decides what they may see; docs/contract.md).

export type VoiceProfile = {
  template: string;
  pitch_hz: number;
  rate_pct: number;
  volume_pct: number;
  warmth_pct: number;
  roughness_pct: number;
};

export type Accent = "American" | "British";

/** The six stock voices (VoiceRestorationEngine.voice_palette), in plain words, with the accent of each Piper voice. */
export const VOICES: { key: string; name: string; about: string; accent: Accent }[] = [
  { key: "male_smooth_warm", name: "Warm and steady", about: "A lower voice, smooth and calm", accent: "American" },
  { key: "male_gentle", name: "Soft and gentle", about: "A lower voice, light and kind", accent: "American" },
  { key: "male_deep_gruff", name: "Deep and grainy", about: "A deep voice with some texture", accent: "American" },
  { key: "female_warm_gentle", name: "Gentle and warm", about: "A higher voice, soft and unhurried", accent: "American" },
  { key: "female_clear_bright", name: "Clear and bright", about: "A higher voice, crisp and lively", accent: "American" },
  { key: "female_authoritative", name: "Calm and sure", about: "A higher voice, clear and composed", accent: "British" },
];

/**
 * The accent that matches the device's language setting (navigator.language, e.g. en-GB), if one of the voices has it.
 * Only the language setting the person chose is read: no location lookup, and nothing about the person themself.
 */
export function deviceAccent(language = typeof navigator === "undefined" ? "" : navigator.language): Accent | null {
  const region = language.split("-")[1]?.toUpperCase();
  return region === "GB" || region === "IE" ? "British" : region === "US" || region === "CA" ? "American" : null;
}

/** The five settings with their real allowed ranges (api.VoiceProfile) and plain labels. */
export const SLIDERS: { key: keyof Omit<VoiceProfile, "template">; label: string; low: string; high: string; min: number; max: number }[] = [
  { key: "pitch_hz", label: "Pitch", low: "Lower", high: "Higher", min: -100, max: 100 },
  { key: "rate_pct", label: "Speed", low: "Slower", high: "Faster", min: -50, max: 100 },
  { key: "volume_pct", label: "Loudness", low: "Quieter", high: "Louder", min: -50, max: 50 },
  { key: "warmth_pct", label: "Warmth", low: "Brighter", high: "Warmer", min: -20, max: 20 },
  { key: "roughness_pct", label: "Roughness", low: "Clear", high: "Breathy", min: 0, max: 20 },
];

export const DEFAULT_VOICE: VoiceProfile = { template: "male_smooth_warm", pitch_hz: 0, rate_pct: 0, volume_pct: 0, warmth_pct: 0, roughness_pct: 0 };

/** Fills in a saved (or estimated) profile, keeping each number whole and inside its range. */
export function toProfile(raw: Partial<Record<string, unknown>> | null | undefined): VoiceProfile {
  const p = { ...DEFAULT_VOICE };
  if (typeof raw?.template === "string" && VOICES.some((v) => v.key === raw.template)) p.template = raw.template;
  for (const s of SLIDERS) {
    const n = Number(raw?.[s.key]);
    if (Number.isFinite(n)) p[s.key] = Math.round(Math.min(s.max, Math.max(s.min, n)));
  }
  return p;
}

export type Profile = { id: string; voice_profile: Record<string, unknown>; consent_audio_storage: boolean; consent_updated_at: string | null };

async function myId() {
  const s = await session();
  if (!s) throw new ApiError(401, "Please sign in again.");
  return s.user.id;
}

export async function myProfile(): Promise<Profile> {
  const { data, error } = await supabase()
    .from("patient_profiles")
    .select("id, voice_profile, consent_audio_storage, consent_updated_at")
    .eq("user_id", await myId())
    .single();
  if (error) throw error;
  return data;
}

export async function saveConsent(on: boolean) {
  const { error } = await supabase()
    .from("patient_profiles")
    .update({ consent_audio_storage: on, consent_updated_at: new Date().toISOString() })
    .eq("user_id", await myId());
  if (error) throw error;
}

export const saveVoice = (profile: VoiceProfile) => api("/api/voice/profile", { method: "PUT", body: JSON.stringify(profile) });

/** A short sample in a voice (base64 WAV). */
export async function voiceSample(profile: VoiceProfile, phrase = "Hello. This is how I'll sound when I say what you meant.") {
  const r = await api<{ audio_base64: string }>("/api/voice/sculpt", { method: "POST", body: JSON.stringify({ ...profile, sample_phrase: phrase }) });
  return r.audio_base64;
}

/** Estimates settings from 2 to 10 recordings of the person's earlier voice (it picks and tunes a stock voice). */
export async function bankVoice(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const r = await api<{ profile: Record<string, unknown> }>("/api/voice/bank", { method: "POST", body: form });
  return toProfile(r.profile);
}
