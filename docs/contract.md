# Contract

The one place that says what the data and the API look like. **Change this file first, then the code and a test.**
Never edit an applied migration; add a new one in `supabase/migrations/`.

## Who may do what

| Actor | Can | Cannot |
|---|---|---|
| Patient | read/write own profile; read own sessions, utterances, biomarkers; create a link code; revoke a clinician; delete own account | write `therapy_sessions`, `session_utterances`, `biomarker_logs` (server only); read anyone else's rows |
| Clinician (`verified`) | after redeeming a link code: read that patient's sessions, biomarkers, utterances; write/edit own assessments | write patient data; keep access once revoked or un-verified |
| Clinician (unverified) | register self; see own row | redeem codes, read patients, write assessments |
| Server (service-role key) | write `biomarker_logs`; delete users/audio | — never exposed to a client |
| Admin | set `clinicians.verified` in the Supabase dashboard | — |

## Tables (`public`)

| Table | Key fields | Notes |
|---|---|---|
| `patient_profiles` | `id`, `user_id`, `voice_profile`, `phonetic_corrections`, `consent_audio_storage` | no name/email/condition; identity lives in `auth.users` only |
| `therapy_sessions` | `id`, `patient_id`, `duration_seconds`, `utterances_count`, `accuracy_rate` | written only by the API (service role); numbers set by `/finish` |
| `session_utterances` | `session_id`, `patient_id`, `transcribed_text` (raw ASR), `corrected_text` (final), `confirmed`, `latency_ms` | written only by the API |
| `biomarker_logs` | `session_id`, `patient_id`, `articulation_velocity`, `speaking_rate`, `pause_ratio`, `formant_compression_index`, `vocal_jitter_pct`, `vocal_shimmer_pct`, `mean_f0_hz`, `stability_index`, `metrics` | server-write-only; NULL means "not measured", never 0 |
| `clinicians` | `user_id`, `display_name`, `license_ref`, `verified` | |
| `clinician_access` | `clinician_id`, `patient_id`, `granted_at`, `revoked_at` | created only by `redeem_link_code` |
| `clinical_assessments` | `session_id`, `clinician_id`, `condition`, `impression`, `home_plan`, `frequency`, `updated_at` | |
| `link_codes` | `code_hash`, `patient_id`, `expires_at`, `used_at` | reachable only through the two RPCs |
| `link_attempts` | `clinician_id`, `at` | wrong guesses; 5 in 15 minutes lock that clinician out |
| `rate_hits` | `name`, `user_id`, `at` | shared rate limiter state, service role only |
| `clinician_audit` | `clinician_id`, `old_verified`, `new_verified`, `changed_by`, `at` | every change to `verified`; no client access |

RPCs: `create_link_code() -> text` (patient, 10 chars, valid 15 min, one live code); `redeem_link_code(code) -> boolean` (verified clinician; `false` for every failure, so nothing leaks); `rate_limit_hit(name, user, limit, seconds) -> boolean` (service role only).

## Correction table (`patient_profiles.phonetic_corrections`)

`{ "<heard word>": { "to": "<intended word>", "ok": int, "bad": int } }` — applied only when `ok >= 2` and `ok/(ok+bad) >= 0.6`.
Owner of the logic: `src/feedback_engine.py` (`FeedbackEngine.apply` / `.learn`). Nothing else writes this field.

## API (all need `Authorization: Bearer <supabase access token>`)

| Route | Request | Response |
|---|---|---|
| `POST /api/sessions` | — | `{session_id}` |
| `POST /api/sessions/{id}/utterances` | `{raw_transcript, shown_text, final_text, latency_ms?}` (`final_text == shown_text` means "yes") | `{confirmed, reward}` (`reward` = 1 − wrong words / words meant) |
| `POST /api/sessions/{id}/finish` | — | `{duration_seconds, utterances_count, accuracy_rate}` |
| `POST /api/session/analyze` | form: `session_id`, `file` (audio) | `{success, biomarkers}`; needs `SUPABASE_SERVICE_ROLE_KEY` |
| `POST /api/session/report/pdf` | `{session_id, inline?}` | PDF; 422 if no assessment or unmeasured values |
| `DELETE /api/me/data` | `{confirm: "DELETE", password?}` (email accounts must send the password; passwordless accounts need a sign-in within 5 minutes) | `{success}`; audio first, then account; 3 per hour |
| `POST /api/rectify` | audio (multipart or base64 JSON) | `{speech_detected, raw_transcript, repaired_text, rectified_audio, latency, telemetry}`. If no speech is detected (silence, noise) or nothing was understood, the text is `""` and `rectified_audio` is `null`: the patient's own recording is never returned as "rectified". `WS /ws/rectify` sends `{"type": "no_speech"}` instead of `rectified_output` |
| `POST /api/biomarkers`, `/api/voice/sculpt`, `/api/voice/bank`, `GET /health`, `WS /ws/rectify` | see `src/api.py` | |

## Rules that tests must keep true

1. No route is defined twice (`tests/test_core.py::test_api_has_no_duplicate_routes_or_functions`).
2. A client request body never supplies clinical facts (biomarkers, clinician, assessment text).
3. "Not measured" is `None`/NULL, not 0.
4. Failures return an error; no silent fallback to made-up output. Silence and noise are never transcribed (`speech_gate`, Silero VAD at P >= 0.20): the recogniser invents sentences from them.
5. Secrets (`.env`, service-role key) are never committed or sent to a client.
6. The API is not the security boundary: clients hold the public anon key and can call Supabase directly, so every rule above must be enforced by row-level security and is attacked in `tests/test_rls.py` (e.g. an utterance must belong to a session of the same patient).
7. Abuse limits: every authenticated route is rate-limited per user (`api.hit` / `rate_limit`, state in Postgres so it is shared by all workers and survives restarts), audio is capped at 60 s, WebSocket chunks at 256 KB, WebSocket tokens are re-verified every 5 minutes, and error responses are generic (the real error is logged server-side). `/health` returns only `{"status": "online"}`.
