"""
The whole patient journey against a RUNNING server and the LIVE Supabase project, on real TORGO speech:

    python scripts/e2e_live.py [--api http://127.0.0.1:8000]

sign-up (CAPTCHA refuses a bot) -> profile -> consent and audio upload -> voice banking from healthy voice notes ->
saved voice -> session -> rectify (HTTP and WebSocket) -> the patient confirms and corrects -> learning -> biomarkers
-> a verified, linked clinician's assessment -> PDF report -> deleting the account needs the password and a CAPTCHA
token (a script cannot solve one, so the deletion itself is covered by tests/test_core.py).

Throwaway accounts (deleted at the end even on failure). The final corrected speech is written to
outputs/e2e_corrected_speech.wav. Exit code 1 if any step fails. Needs .env and data/TORGO (scripts/fetch_mini_torgo.py).
Use 127.0.0.1, not localhost: on Windows localhost adds ~2 s per connection.
"""
import argparse
import base64
import glob
import json
import os
import sys
import uuid

import librosa
import numpy as np
import requests
import soundfile as sf
from dotenv import load_dotenv
from supabase import create_client
from websockets.sync.client import connect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))
URL, ANON, SERVICE = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
results = []


def step(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  [{str(detail)[:160]}]" if detail else ""))
    return ok


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    api = parser.parse_args().api
    # variables already in the environment win over .env (VS Code's python.terminal.useEnvFile can leave stale ones)
    print(f"project {URL.split('//')[-1].split('.')[0]}, server {api}\n")
    speech = max(glob.glob(os.path.join(ROOT, "data/TORGO/F01/*/wav_headMic/*.wav")), key=os.path.getsize)   # dysarthric
    notes = sorted(glob.glob(os.path.join(ROOT, "data/TORGO/FC02/*/wav_headMic/*.wav")))[:3]                 # healthy voice
    admin, users = create_client(URL, SERVICE), []

    def account(password=None):
        email = f"e2e-{uuid.uuid4().hex[:10]}@example.com"
        u = admin.auth.admin.create_user({"email": email, "password": password, "email_confirm": True} if password
                                         else {"email": email, "email_confirm": True}).user
        users.append(u.id)
        c = create_client(URL, ANON)   # magic link: a script cannot solve the CAPTCHA a real sign-in shows
        c.auth.verify_otp({"token_hash": admin.auth.admin.generate_link({"type": "magiclink", "email": email}).properties.hashed_token,
                           "type": "magiclink"})
        return u.id, c, c.auth.get_session().access_token

    try:
        r = requests.post(f"{URL}/auth/v1/signup", headers={"apikey": ANON}, timeout=20,
                          json={"email": f"e2e-bot-{uuid.uuid4().hex[:8]}@example.com", "password": "Bot-password-1234"})
        step("1. a bot signing up without CAPTCHA is refused", "captcha" in r.text.lower(), r.status_code)

        password = f"E2e-{uuid.uuid4().hex}"
        uid, patient, token = account(password)
        H = {"Authorization": f"Bearer {token}"}
        profile = patient.table("patient_profiles").select("id, voice_profile, consent_audio_storage").eq("user_id", uid).execute().data
        step("2. sign-up creates the patient's profile, without consent by default", len(profile) == 1 and not profile[0]["consent_audio_storage"])

        patient.table("patient_profiles").update({"consent_audio_storage": True}).eq("user_id", uid).execute()
        with open(speech, "rb") as f:
            wav = f.read()
        patient.storage.from_("patient_audio").upload(f"{uid}/raw/e2e.wav", wav, {"content-type": "audio/wav"})
        stored = patient.storage.from_("patient_audio").list(f"{uid}/raw")
        step("3. after consenting, the patient's recording is stored in their own folder", [o["name"] for o in stored] == ["e2e.wav"])

        files = [("files", (os.path.basename(n), open(n, "rb").read(), "audio/wav")) for n in notes]
        r = requests.post(f"{api}/api/voice/bank", headers=H, files=files, timeout=300)
        banked = r.json().get("profile", {}) if r.ok else {}
        step("4. voice banking builds a profile from healthy voice notes", r.ok and banked.get("template"), f"{r.status_code} template={banked.get('template')}")
        voice = {k: banked[k] for k in ("template", "pitch_hz", "rate_pct", "volume_pct", "warmth_pct", "roughness_pct")} if banked else {}
        r = requests.put(f"{api}/api/voice/profile", headers=H, json=voice, timeout=60)
        step("5. the banked voice is saved as the patient's voice", r.ok, r.status_code)
        r = requests.post(f"{api}/api/voice/sculpt", headers=H, json={**voice, "sample_phrase": "Good morning."}, timeout=120)
        step("6. a preview is spoken in that voice", r.ok and r.json().get("audio_base64"), r.status_code)

        sid = requests.post(f"{api}/api/sessions", headers=H, timeout=60).json()["session_id"]
        r = requests.post(f"{api}/api/rectify", headers=H, json={"audio_base64": base64.b64encode(wav).decode()}, timeout=300)
        d = r.json() if r.ok else {}
        out = os.path.join(ROOT, "outputs", "e2e_corrected_speech.wav")
        if d.get("rectified_audio"):
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, "wb") as f:
                f.write(base64.b64decode(d["rectified_audio"].split(",")[-1]))
            seconds = sf.info(out).duration
        step("7. dysarthric speech comes back as corrected text and speech in the saved voice",
             r.ok and d.get("speech_detected") and d.get("repaired_text") and d.get("rectified_audio") and d.get("voice_error") is None,
             f"heard {d.get('raw_transcript')!r} -> {d.get('repaired_text')!r}, {seconds if d.get('rectified_audio') else 0:.1f} s of audio, "
             f"{d.get('latency', {}).get('total_ms')} ms")

        pcm = (np.clip(librosa.load(speech, sr=16000)[0], -1, 1) * 32767).astype("<i2").tobytes()
        with connect(api.replace("http", "ws", 1) + "/ws/rectify", open_timeout=30) as ws:
            ws.send(json.dumps({"type": "auth", "token": token, "sample_rate": 16000, "encoding": "pcm_s16le"}))
            for i in range(0, len(pcm), 3200):
                ws.send(pcm[i:i + 3200])
            for _ in range(12):
                ws.send(bytes(3200))
            m = {"type": "telemetry"}
            while m["type"] == "telemetry":
                m = json.loads(ws.recv(timeout=180))
        step("8. live streaming returns the same kind of result", m["type"] == "rectified_output" and m.get("repaired_text") and m.get("audio_base64"),
             {k: m.get(k) for k in ("type", "repaired_text", "detail")})

        utter = lambda raw, shown, final: requests.post(f"{api}/api/sessions/{sid}/utterances", headers=H, timeout=60,
                                                       json={"raw_transcript": raw, "shown_text": shown, "final_text": final})
        yes = utter(d.get("raw_transcript", "x"), d.get("repaired_text", "x"), d.get("repaired_text", "x"))
        no = utter("wun cat", "Wun cat.", "one cat")
        learned = admin.table("patient_profiles").select("phonetic_corrections, vocabulary").eq("user_id", uid).execute().data[0]
        step("9. the patient's yes and correction are stored and learned from",
             yes.ok and yes.json()["confirmed"] and no.ok and not no.json()["confirmed"] and learned["phonetic_corrections"].get("wun", {}).get("to") == "one",
             f"vocabulary {len(learned['vocabulary'])} words")

        r = requests.post(f"{api}/api/session/analyze", headers=H, data={"session_id": sid}, files={"file": ("s.wav", wav, "audio/wav")}, timeout=300)
        bio = r.json().get("biomarkers", {}) if r.ok else {}
        step("10. biomarkers are measured on the server and stored", r.ok and bio.get("articulation_velocity") is not None,
             {k: bio.get(k) for k in ("articulation_velocity", "vocal_jitter_pct", "mean_f0_hz")})
        r = requests.post(f"{api}/api/sessions/{sid}/finish", headers=H, timeout=60)
        step("11. finishing the session computes its numbers from stored rows", r.ok and r.json()["utterances_count"] == 2, r.json() if r.ok else r.status_code)

        cid, clinician, _ = account()
        clinician.table("clinicians").insert({"user_id": cid, "display_name": "Dr E2E"}).execute()
        admin.table("clinicians").update({"verified": True}).eq("user_id", cid).execute()   # an admin verifies the licence
        code = patient.rpc("create_link_code").execute().data
        linked = clinician.rpc("redeem_link_code", {"code": code}).execute().data
        clinician.table("clinical_assessments").insert({"session_id": sid, "clinician_id": cid, "condition": "Spastic dysarthria (test)",
                                                        "impression": "E2E test", "home_plan": "E2E test", "frequency": "Weekly"}).execute()
        step("12. a verified clinician links with the patient's code and writes an assessment", linked is True)
        r = requests.post(f"{api}/api/session/report/pdf", headers=H, json={"session_id": sid, "inline": False}, timeout=120)
        step("13. the patient gets the clinical PDF report", r.ok and r.content.startswith(b"%PDF-"),
             f"{r.status_code} {len(r.content)} bytes" + ("" if r.ok else f" {r.text[:120]}"))

        # deleting needs the password plus the delete screen's CAPTCHA token; a script cannot solve a real CAPTCHA, so the
        # deletion itself is covered by tests/test_core.py and this checks the refusal and that Supabase checks the token
        r = requests.delete(f"{api}/api/me/data", headers=H, json={"confirm": "DELETE", "password": password}, timeout=120)
        kept = any(u.id == uid for u in admin.auth.admin.list_users()) and admin.storage.from_("patient_audio").list(uid)
        step("14. deleting without the CAPTCHA token is refused and nothing is deleted", r.status_code == 403 and kept, r.status_code)
        try:
            create_client(URL, ANON).auth.sign_in_with_password({"email": admin.auth.admin.get_user_by_id(uid).user.email,
                                                                 "password": password, "options": {"captcha_token": "fake-token"}})
            checked = "not refused"
        except Exception as e:
            checked = str(e)
        step("15. Supabase checks a forwarded CAPTCHA token (a fake one is invalid, not missing)", "invalid-input-response" in checked, checked[:100])
        if d.get("rectified_audio"):
            print(f"\nfinal corrected speech: {out}")
    finally:
        for u in users:
            try:
                for folder in admin.storage.from_("patient_audio").list(u):
                    files = admin.storage.from_("patient_audio").list(f"{u}/{folder['name']}")
                    admin.storage.from_("patient_audio").remove([f"{u}/{folder['name']}/{f['name']}" for f in files])
                admin.auth.admin.delete_user(u)
            except Exception:
                pass
        print(f"{len(users)} throwaway accounts cleaned up")
    print(f"\n{sum(results)} of {len(results)} steps passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
