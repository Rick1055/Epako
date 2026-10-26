# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DysTTS / "Epako Voice AI": a dysarthric-speech correction pipeline. Patient audio → ASR → dysfluency/intent repair → neural TTS voice, plus clinical biomarker telemetry ("Speech Gym"), Supabase persistence, and a clinical PDF report. README is just a title; everything is in `src/`.

## Commands

No build system is configured. Windows / PowerShell environment. Tests: `python -m pytest tests` (unit tests, fast). `tests/test_rls.py` attacks every migration on an embedded Postgres and is skipped unless `pip install pgserver psycopg2-binary` (and pyflakes for the undefined-name guard); CI installs all three.

- Install: `pip install -r requirements.txt`, then download the six TTS voices (not in git, `models/` is ignored): for each name in `VoiceRestorationEngine.voice_palette` run `python -m piper.download_voices <name> --download-dir models/piper`
- Run API: `python src/api.py` (uvicorn on port 8000; it calls `uvicorn.run("api:app")`, so it must be run from/with `src/` resolvable, and `src/` modules import each other without the package prefix)
- End-to-end check against a running server: `python test_api_e2e.py` (hits `/health` and `/api/rectify` on localhost:8000 with a synthetic tone)
- Pipeline benchmark (synthetic dysarthria at mild/moderate/severe → repair → biomarkers): `python run_benchmark.py` (writes `benchmark_results.json`)
- Fetch the TORGO mini-dataset (streams from U. Toronto archives): `python scripts/fetch_mini_torgo.py`
- Full TORGO (verified download, selective extraction, audit): `python scripts/fetch_torgo_full.py download | list | extract` (default `--dest D:\DysTTS_TORGO_dataset`; writes `TORGO/manifest.csv` and `TORGO/audit.json`)
- Real-speech evaluation (speech gate + recogniser + repair, corpus WER with bootstrap CIs, per speaker; resumable via `outputs/eval_torgo_rows.jsonl`): `python scripts/eval_torgo.py [data dir] [--mic wav_headMic] [--limit N]` (a dir with `manifest.csv` is the full TORGO)
- Attack the LIVE Supabase project as outsider / other patient / unverified and unlinked doctor (throwaway accounts, deleted after; exit 1 if anything gets through): `python scripts/attack_live.py`; add `--api http://127.0.0.1:8000` to also attack a running server, including simultaneous cross-patient requests over its shared database connections (use 127.0.0.1: `localhost` adds ~2 s per connection on Windows). API-level attacks also run offline in `tests/test_attacks.py`.
- The whole patient journey against a running server and the LIVE project (sign-up → consent/upload → voice banking → rectify over HTTP and WebSocket → learning → biomarkers → clinician link and assessment → PDF → deletion refused without a CAPTCHA token; throwaway accounts; writes `outputs/e2e_corrected_speech.wav`): `python scripts/e2e_live.py [--api http://127.0.0.1:8000]`. Run it after every change that touches the API.
- Learning simulation on cached TORGO output (feedback engine; `--vocabulary` adds snapping): `python scripts/simulate_learning.py [--min-repeats 3] [--vocabulary]`
- Modules with a `main()` smoke test: `src/data_ingestion.py`, `src/biomarker_engine.py`, `src/synthetic_dysarthria.py` — run directly, e.g. `python src/data_ingestion.py` (expects `data/TORGO` relative to cwd)

Config via `.env` (loaded with python-dotenv, gitignored): `SUPABASE_URL`, `SUPABASE_KEY` (the **anon** key), `SUPABASE_SERVICE_ROLE_KEY` (server only; biomarkers, sessions, deletion and the rate limiter need it), optional `CORS_ALLOWED_ORIGINS`, `PIPER_VOICES_DIR`, `SUPABASE_TEST_PASSWORD`.

## Architecture

Pipeline (see `/api/rectify` and `/ws/rectify` in `src/api.py`):

0. `speech_gate.contains_speech` — Silero VAD (ONNX model bundled in the `silero-vad` package, run with onnxruntime; install with `--no-deps` to keep your torch). Silence/noise returns "nothing heard" before the recogniser runs, because it hallucinates voice-assistant sentences from noise.
1. `speech_recognizer.DysarthriaSpeechRecognizer` — HF `pipeline` ASR using Parakeet-TDT (`dys-asr/parakeet-tdt-0.6b-unconstrained-soup`), FP16 on CUDA. `transcribe()` also returns per-word confidence (`words`), read through a hook on a transformers internal; it is `None` if the hook stops matching the text.
2. `intent_repair.IntentRepair` — regex dysfluency/repetition removal + patient-specific corrections learned by `feedback_engine.FeedbackEngine` (word-level yes/no learning) + `vocabulary.Vocabulary`: words the recogniser was unsure of snap to the closest-sounding word the patient has used (see `docs/contract.md`).
3. `voice_restoration.VoiceRestorationEngine` — maps voice templates / sculpted params (pitch, rate, volume, warmth, roughness) to on-device Piper voices (`voice_palette`, `src/local_tts.py`; nothing is sent to a cloud TTS) and builds profiles from pre-morbid voice notes. The patient's profile is saved with `PUT /api/voice/profile` (validated by `api.VoiceProfile`) and rectify always speaks with it; warmth/roughness are applied by `local_tts.shape_voice`. Synthesis itself is done in `api.synthesize_neural_async`; the server warms all voices in a background thread at startup (~90 s).
4. `biomarker_engine` — articulation velocity, jitter/shimmer (phonatory instability), formant centralization ratio, WavLM attention entropy.

Supporting modules: `synthetic_dysarthria` (DSP perturbation engine to simulate dysarthria at severities), `data_ingestion` (`TorgoDataset`, `speech_collate_fn`, LOSO speaker filtering via `parse_speaker_info`), `supabase_manager` (auth, Postgres, audio storage; schema in `supabase/migrations/`), `pdf_generator` (reportlab + matplotlib one-page SLP report).

`src/api.py` conventions worth knowing:
- Failures return errors (503/422/404); there are no silent fallbacks to canned output. "Not measured" is `None`/NULL, never 0.
- Clients never supply clinical facts: biomarkers are measured server-side (`/api/session/analyze`, service-role key) and reports are built from stored rows (`docs/contract.md` is the source of truth for tables and routes).
- Imports inside `api.py` use bare module names (`from intent_repair import ...`) while `src/__init__.py` uses relative imports; `intent_repair` and `pdf_generator` try both.
- Per-patient learning lives in `FeedbackEngine` (word table stored in `patient_profiles.phonetic_corrections`); migrations are append-only.
- Auth requires a CAPTCHA (Cloudflare Turnstile, enabled in Supabase → Authentication → Attack Protection). Every client sign-up and sign-in must send a `captcha_token`; without one Supabase refuses with `captcha protection: request disallowed`. Verified live on 2026-10-25 for sign-in and sign-up with no token and with a fake token; password reset and OTP were not tested. The service-role admin API (`auth.admin.create_user`) is exempt, so server-side tests create users that way. `SupabaseManager.sign_in` / `sign_up` do not send a token yet, so `scripts/test_supabase_e2e.py` and any script that signs in with a password fail while CAPTCHA is on; switch it off to run them.

Other top-level files: `epako_sylva_experience.html` is the (mock, not yet API-connected) frontend experience; `graphify-out/` is generated knowledge-graph output; `.agents/plugins/ponytail` is a git submodule. `data/` (TORGO audio) is gitignored.

## Working guidelines (Karpathy)

Source: `forrestchang/andrej-karpathy-skills`. Install once with `/plugin marketplace add forrestchang/andrej-karpathy-skills`, then `/plugin install andrej-karpathy-skills@karpathy-skills` and restart. The rules are inlined below so they apply without the plugin.

"Simplicity First" is deliberately omitted: Ponytail owns code size and scope. Where the two overlap, Ponytail wins; Ponytail's closing "skipped / risk" line stays as the end of every reply.

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask before implementing, not after.
- If multiple interpretations exist, present them; don't pick silently.
- Push back when a simpler approach exists.
- If something is unclear, stop, name what is confusing, and ask.

### 2. Surgical Changes

- Don't "improve" adjacent code, comments or formatting; don't refactor what isn't broken.
- Match existing style, even if you'd do it differently.
- Mention unrelated dead code instead of deleting it.
- Remove imports/variables/functions that YOUR change orphaned; leave pre-existing dead code.
- Every changed line must trace to the request. Callers, tests and fixtures your change breaks count as part of the request (same rule as Ponytail's scope).

### 3. Goal-Driven Execution

- Turn tasks into verifiable goals: "fix the bug" means a reproducing test first, then make it pass; "refactor X" means tests pass before and after.
- For multi-step tasks, state a brief plan, one line per step: `1. [step] -> verify: [check]`.
- Loop until the check passes. Report real output if it fails; no tests exist for a module means say so, don't claim it works.

## Disk hygiene

C: is nearly full, so scratch files must not pile up. Periodically (at the start of a long session, and after any task that generated outputs) look for unused files this project or its sessions produced: scratch scripts, temp audio/PNG/JSON output, screenshots, stale benchmark or log files, caches, and downloaded archives that nothing references and that haven't been touched in a long time. Never touch tracked files, `.env`, `data/`, `models/`, or anything you're unsure about; report those instead.

Before deleting anything, prompt me and list each file. For every file give, in one or two lines: its path, what it does/what produced it, and what deleting it might affect. Delete only after I confirm. Report the space freed afterwards.

Keep tool-call chatter minimal. Instructions cannot clear the terminal; the user presses Ctrl+L (do not suggest /clear, which wipes context).
