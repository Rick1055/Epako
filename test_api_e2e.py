# -*- coding: utf-8 -*-
"""
Test script: Generates a synthetic dysarthric audio sample and passes it
through the live API running at http://localhost:8000/api/rectify.
"""
import requests
import numpy as np
import soundfile as sf
import io
import base64
import time
import os

HEADERS = {"Authorization": "Bearer " + os.environ["API_TEST_TOKEN"]}  # a valid Supabase access token

print("[+] Testing live API at http://localhost:8000/health ...")
try:
    r = requests.get("http://localhost:8000/health")
    print("Health response:", r.status_code, r.json())
except Exception as e:
    print("Failed to reach API:", e)
    exit(1)

# Generate a 2-second test tone (speech-like 16kHz audio)
sr = 16000
t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
audio = 0.3 * np.sin(2 * np.pi * 220 * t) + 0.15 * np.sin(2 * np.pi * 440 * t)
# Add some jitter/modulation to simulate dysarthric tremor
audio *= (1.0 + 0.2 * np.sin(2 * np.pi * 6 * t))
audio = audio.astype(np.float32)

buf = io.BytesIO()
sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
audio_b64 = "data:audio/wav;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

print("[+] Sending test audio to http://localhost:8000/api/rectify ...")
t0 = time.time()
resp = requests.post("http://localhost:8000/api/rectify", json={
    "audio_base64": audio_b64,
    "voice_template": "male_smooth_warm",
    "warmth_pct": 70,
    "pitch_hz": 0,
    "rate_pct": 0
}, headers=HEADERS)
dur = (time.time() - t0) * 1000

print(f"Status Code: {resp.status_code} (took {dur:.1f}ms)")
if resp.status_code == 200:
    data = resp.json()
    print("Success:", data.get("success"))
    print("Raw Transcript:", data.get("raw_transcript"))
    print("Repaired Text:", data.get("repaired_text"))
    print("Latency Breakdown:", data.get("latency"))
    print("Telemetry:", data.get("telemetry"))
    has_audio = bool(data.get("rectified_audio"))
    print("Rectified Audio Generated:", has_audio)
else:
    print("Error response:", resp.text)

print("\n[+] Testing Clinical PDF Report Generation via API ...")
pdf_resp = requests.post("http://localhost:8000/api/session/report/pdf", json={
    "session_id": os.environ["API_TEST_SESSION_ID"],  # a session the test user owns (e.g. from test_supabase_e2e)
    "inline": True
}, headers=HEADERS)
print(f"PDF POST Status Code: {pdf_resp.status_code}")
print(f"Content-Type: {pdf_resp.headers.get('content-type')}")
print(f"Content-Disposition: {pdf_resp.headers.get('content-disposition')}")
print(f"PDF Byte Size: {len(pdf_resp.content)} bytes")
print(f"Valid PDF Header (%PDF-): {pdf_resp.content.startswith(b'%PDF-')}")
