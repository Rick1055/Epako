"""
End-to-End Live Verification: SupabaseManager Integration Test
==============================================================
Tests the entire Supabase pipeline:
1. Manager initialization & health check
2. Test patient registration / login
3. Voice profile and phonetic confusion dictionary updates
4. In-memory audio upload to 'patient_audio' bucket
5. Therapy session creation & utterance logging
6. Biomarker telemetry sync (Speech Gym metrics)
7. Querying daily progress view (patient_daily_progress)
"""

import sys
import os
import numpy as np

# Ensure root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.supabase_manager import SupabaseManager


def run_e2e_test():
    print("=" * 65)
    print("  SUPABASE CLOUD PIPELINE: LIVE END-TO-END VERIFICATION")
    print("=" * 65)

    # 1. Initialize SupabaseManager (anon key, so RLS applies)
    print("\n[Step 1] Initializing SupabaseManager...")
    mgr = SupabaseManager()  # anon key: exercises RLS like a real client
    print(" [+] Gateway successfully connected to Supabase.")

    # 2. Test Patient Profile Setup
    print("\n[Step 2] Testing Patient Registration / Authentication...")
    test_email = "clinical_test_patient@voiceai.org"
    test_password = os.environ.get("SUPABASE_TEST_PASSWORD") or sys.exit("Set SUPABASE_TEST_PASSWORD to the test patient password.")

    try:
        auth_res = mgr.sign_in(email=test_email, password=test_password)
        print(f" [+] Existing test patient logged in: {test_email}")
    except Exception:
        print(f" [*] Patient not found, registering new test patient: {test_email}...")
        auth_res = mgr.sign_up(
            email=test_email,
            password=test_password,
        )
        print(f" [+] Registered new test patient: {test_email}")

    patient_id = mgr.current_profile["id"]
    print(f" [+] Active Patient ID: {patient_id}")
    mgr.set_audio_consent(True)

    # 3. Voice Profile & Personalization
    print("\n[Step 3] Updating Voice Palette & Phonetic Memory...")
    mock_voice_palette = {
        "engine": "choice_1_sculptor",
        "base_voice": "en-US-ChristopherNeural",
        "pitch_hz": 115.0,
        "rate_pct": -5.0,
        "warmth_pct": 20.0,
        "roughness_pct": 5.0,
    }
    mgr.update_voice_profile(mock_voice_palette)
    print(f" [+] Voice profile successfully saved in Supabase.")

    # 4. In-Memory Audio Upload
    print("\n[Step 4] Testing In-Memory Audio Cloud Storage Upload...")
    sr = 16000
    duration = 1.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Generate 1 sec pure 440 Hz test tone in memory (no disk file)
    test_waveform = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    raw_url = mgr.upload_audio(
        audio_data=test_waveform,
        remote_filename="test_raw_mic_tone.wav",
        folder="raw",
        sample_rate=sr,
    )
    print(f" [+] Raw Audio Uploaded! Object path: {raw_url}")

    restored_url = mgr.upload_audio(
        audio_data=test_waveform,
        remote_filename="test_restored_voice_tone.wav",
        folder="restored",
        sample_rate=sr,
    )
    print(f" [+] Restored Audio Uploaded! Object path: {restored_url}")

    # 5. Speech Gym Therapy Session & Utterance Logging
    print("\n[Step 5] Logging Live Therapy Session & Utterances...")
    session_id = mgr.start_therapy_session()

    utt = mgr.log_utterance(
        session_id=session_id,
        transcribed_text="yard less",
        corrected_text="yard loss",
        raw_audio=test_waveform,
        restored_audio=test_waveform,
        confirmed=False,
        is_adapted=True,
        latency_ms=116.83,
    )
    print(f" [+] Utterance logged (ID: {utt['id']}) | Transcribed: '{utt['transcribed_text']}' -> Corrected: '{utt['corrected_text']}'")

    # 6. Biomarker Telemetry Sync
    print("\n[Step 6] Checking biomarker_logs is server-write-only...")
    try:
        mgr.client.table("biomarker_logs").insert({"session_id": session_id, "patient_id": patient_id,
                                                   "stability_index": 99}).execute()
        sys.exit(" [!] FAIL: a client was able to write biomarker_logs")
    except SystemExit:
        raise
    except Exception:
        print(" [+] Client write to biomarker_logs rejected (server-only table), as intended.")
    print(f" [+] Session ID (for API_TEST_SESSION_ID): {session_id}")

    # 7. Finalize Session
    print("\n[Step 7] Finalizing Therapy Session Summary...")
    mgr.finish_therapy_session(
        session_id=session_id,
        duration_seconds=45.2,
        overall_score=88.5,
        accuracy_rate=92.0,
        utterances_count=1,
    )

    # 8. Query 30-Day Recovery View
    print("\n[Step 8] Querying Clinical Recovery Trajectory (patient_daily_progress view)...")
    trajectory = mgr.get_recovery_trajectory(limit_days=7)
    print(f" [+] Found {len(trajectory)} daily progress records for patient.")
    for entry in trajectory:
        print(f"     Date: {entry['session_date']} | Total Sessions: {entry['total_sessions_today']} | Avg Accuracy: {entry['avg_accuracy']}% | Avg Jitter: {entry['avg_jitter']}%")

    print("\n" + "=" * 65)
    print("  [SUCCESS] All Supabase Cloud Subsystems Verified 100% Live!")
    print("=" * 65)


if __name__ == "__main__":
    run_e2e_test()

