import os
import torch
import numpy as np
import librosa

MAX_NOTE_SECONDS = 120   # only this much of each voice note is decoded: a small compressed file can hold hours of audio
# Measured on TORGO (2026-10-26, energy-gated F0): men 97-159 Hz, women 179-244 Hz; 165 Hz sits in that gap and is
# the usual reference split. shortcut: 7 speakers only; let the patient change the template if the guess is wrong.
FEMALE_ABOVE_HZ = 165.0


class VoiceRestorationEngine:
    """
    Chooses how the patient's corrected speech sounds: one of six stock on-device Piper voices, shifted in pitch, rate,
    volume, warmth and roughness. It does not clone a voice. Two ways to set it:
    1. Sculpted: a template plus the five controls, chosen by the patient or family.
    2. Voice banking: the controls and template estimated from recordings of the patient's voice before the illness.
    """

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.voice_palette = {
            "male_deep_gruff": "en_US-joe-medium",
            "male_smooth_warm": "en_US-ryan-medium",
            "male_gentle": "en_US-kusal-medium",
            "female_clear_bright": "en_US-amy-medium",
            "female_warm_gentle": "en_US-lessac-medium",
            "female_authoritative": "en_GB-alba-medium",
            "male_indian_warm": "en_US-kusal-medium",
            "female_indian_clear": "en_US-amy-medium",
        }

    def analyze_speaker_profile(self, audio, sample_rate: int = 16000):
        """Median pitch (F0) of the speech in the audio; None when there is no clearly voiced speech."""
        if isinstance(audio, torch.Tensor):
            audio = audio.detach().cpu().numpy()
        audio = np.asarray(audio, dtype=np.float32).squeeze()

        f0, voiced_flag, _ = librosa.pyin(audio, fmin=65, fmax=400, sr=sample_rate)   # frames of 2048, hop 512
        # pyin also calls quiet background "voiced" at its 65 Hz floor; only frames with real speech energy count
        rms = librosa.feature.rms(y=audio, frame_length=2048, hop_length=512)[0][:len(f0)]
        voiced_f0 = f0[voiced_flag & ~np.isnan(f0) & (rms >= 0.25 * rms.max())]
        return {"median_f0": float(np.median(voiced_f0)) if len(voiced_f0) else None}

    def create_sculpted_profile(
        self,
        template: str = "male_smooth_warm",
        pitch_hz: int = 0,
        rate_pct: int = 0,
        volume_pct: int = 0,
        warmth_pct: int = 0,
        roughness_pct: int = 0,
    ):
        """
        Choice 1: Allows family or patient to sculpt their vocal identity using 5 physical acoustic controls.
        """
        voice_id = self.voice_palette.get(template, self.voice_palette["male_smooth_warm"])

        pitch_str = f"{pitch_hz:+d}Hz"
        rate_str = f"{rate_pct:+d}%"
        volume_str = f"{volume_pct:+d}%"

        warmth = int(np.clip(warmth_pct, -20, 20))
        roughness = int(np.clip(roughness_pct, 0, 20))   # a stock voice is already clean: there is no "smoother than it"

        return {
            "mode": "sculpted",
            "template": template,
            "voice_id": voice_id,
            "pitch": pitch_str,
            "rate": rate_str,
            "volume": volume_str,
            "warmth_pct": warmth,
            "roughness_pct": roughness,
        }

    def create_profile_from_voice_notes(self, voice_note_paths, min_notes: int = 3):
        """
        Choice 2: estimates the voice settings from recordings made before the illness (e.g., WhatsApp voice notes):
        pitch (F0), speaking tempo, warmth and texture, then picks the closest of the six stock voices.
        """
        if len(voice_note_paths) < min_notes:
            raise ValueError(
                f"[!] Please provide at least {min_notes} voice notes to estimate the voice reliably "
                f"(received {len(voice_note_paths)}). Need {min_notes - len(voice_note_paths)} more voice note/s."
            )

        pitches = []
        rates = []
        warmths = []
        roughnesses = []
        durations = []

        for path in voice_note_paths:
            if not os.path.exists(path):
                print(f"[!] File at: {path} not found, skipping...")
                continue

            audio, _ = librosa.load(path, sr=self.sample_rate, duration=MAX_NOTE_SECONDS)
            if len(audio) == 0:
                continue

            # 1. Pitch; a note without clear speech says nothing about the voice
            median_f0 = self.analyze_speaker_profile(audio, sample_rate=self.sample_rate)["median_f0"]
            if median_f0 is None:
                print(f"[!] No clear speech in {os.path.basename(path)}, skipping...")
                continue
            pitches.append(median_f0)
            dur = len(audio) / self.sample_rate
            durations.append(dur)

            # 2. Speaking Rate (Syllables per second)
            onsets = librosa.onset.onset_detect(y=audio, sr=self.sample_rate)
            syl_rate = len(onsets) / dur if dur > 0 else 3.5
            rates.append(syl_rate)

            # 3. Warmth (Spectral Centroid: lower centroid = warm chest resonance)
            sc = np.mean(librosa.feature.spectral_centroid(y=audio, sr=self.sample_rate))
            warmths.append((1800.0 - sc) / 25.0)

            # 4. Roughness (Spectral Flatness: higher flatness = mature/raspy grain)
            sf = np.mean(librosa.feature.spectral_flatness(y=audio))
            roughnesses.append((sf - 0.01) * 500.0)

        if len(pitches) == 0:
            raise ValueError("[!] No voiced audio could be extracted from the provided voice notes.")

        overall_f0 = float(np.median(pitches))
        overall_syl_rate = float(np.median(rates)) if len(rates) > 0 else 3.5
        overall_warmth = int(np.clip(np.median(warmths), -20, 20))
        overall_roughness = int(np.clip(np.median(roughnesses), 0, 20))

        # Speaking rate percentage relative to standard 3.5 syl/s
        rate_pct = int(((overall_syl_rate - 3.5) / 3.5) * 40)
        rate_pct = int(np.clip(rate_pct, -20, 20))
        rate_str = f"{rate_pct:+d}%"

        gender = "female" if overall_f0 > FEMALE_ABOVE_HZ else "male"

        # Closest stock voice by register, then measured warmth and roughness
        if gender == "male":
            if overall_roughness > 5:
                template = "male_deep_gruff"
            elif overall_warmth > 5:
                template = "male_gentle"
            else:
                template = "male_smooth_warm"
        else:
            if overall_warmth > 5:
                template = "female_warm_gentle"
            elif overall_roughness > 5:
                template = "female_authoritative"
            else:
                template = "female_clear_bright"

        voice_id = self.voice_palette[template]
        baseline_f0 = 200.0 if gender == "female" else 125.0
        pitch_delta = int(np.clip(overall_f0 - baseline_f0, -100, 100))
        pitch_str = f"{pitch_delta:+d}Hz"

        return {
            "mode": "voice_notes",
            "voice_notes_count": len(pitches),
            "total_duration_s": round(sum(durations), 2),
            "reconstructed_f0": round(overall_f0, 1),
            "gender": gender,
            "template": template,
            "voice_id": voice_id,
            "pitch": pitch_str,
            "rate": rate_str,
            "volume": "+0%",
            "pitch_hz": pitch_delta,   # the numeric fields are what PUT /api/voice/profile saves
            "rate_pct": rate_pct,
            "volume_pct": 0,
            "warmth_pct": overall_warmth,
            "roughness_pct": overall_roughness,
        }
