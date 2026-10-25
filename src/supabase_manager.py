from supabase import create_client, Client
import os
import io
from typing import Optional, Dict, Any, List, Union
import numpy as np
import soundfile as sf
from dotenv import load_dotenv
from datetime import datetime

class SupabaseManager:
    def __init__(self, supabase_url: Optional[str] = None,
                 supabase_key: Optional[str] = None,
                 use_service_role: bool = False):

        load_dotenv()

        self.url = (supabase_url or os.getenv("SUPABASE_URL") or "").strip().rstrip("/")

        if use_service_role:
            self.key = (supabase_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or "").strip()
        else:
            self.key =(supabase_key or os.getenv("SUPABASE_KEY") or "").strip()

        if not self.url or not self.key:
            raise ValueError(
                "Missing Supabase credentials! Ensure SUPABASE_URL and SUPABASE_KEY are set in .env"
            )

        self.client: Client = create_client(self.url, self.key)
        self.bucket_name = "patient_audio"

        self.current_user = None
        self.current_profile = None

    def sign_up(self, email:str, password: str) -> Dict[str, Any]:

        email = email.strip().lower()
        if len(password) < 12:
            raise ValueError (
                "Password must be at least 12 characters long. "
            )

        response =self.client.auth.sign_up(
            {
                "email": email,
                "password": password,
            }
        )

        if not response.user:
            raise RuntimeError(f"Sign-up failed: {response}")

        self.current_user = response.user
        self.current_profile = self.get_profile(refresh=True) if response.session else None

        print("[+] Patient registered successfully.")
        return {"user": self.current_user, "profile": self.current_profile}

    def sign_in(self, email: str, password: str) -> Dict[str, Any]:

        email = email.strip().lower()
        response = self.client.auth.sign_in_with_password(
            {"email": email, 
             "password": password}
        )

        if not response.user:
            raise RuntimeError (
                "Invalid Login Credentials"
            )

        self.current_user = response.user
        self.current_profile = self._fetch_or_create_profile(user_id = response.user.id)

        print("[+] Patient logged in.")
        return {"user": self.current_user, "profile": self.current_profile}

    def sign_out(self) -> None:

        try:
            self.client.auth.sign_out()
        except Exception:
            pass

        self.current_user = None
        self.current_profile = None
        print("[+] Patient Signed out.")

    def _fetch_or_create_profile(
            self,
            user_id: str,
    ) -> Dict[str,Any]:

        res = (
            self.client.table("patient_profiles")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )

        if res.data and len(res.data) > 0:
            return res.data[0]

        insert_data = {"user_id": user_id}   # the only column patients may insert; the rest default to {}
        fallback_res = self.client.table("patient_profiles").insert(insert_data).execute()
        return fallback_res.data[0] if fallback_res.data else insert_data

    def get_profile(self, refresh: bool = False) -> Optional[Dict[str, Any]]:

        if not self.current_user:
            return None

        if refresh or not self.current_profile:
            res = (
                self.client.table("patient_profiles")
                .select("*")
                .eq("user_id", self.current_user.id)
                .execute()
            )
            if res.data:
                self.current_profile = res.data[0]

        return self.current_profile

    def set_audio_consent(self, granted: bool) -> None:
        """Audio uploads are blocked by storage RLS until this is True."""
        if not self.current_profile:
            raise RuntimeError("No authenticated patient profile active.")
        res = (
            self.client.table("patient_profiles")
            .update({"consent_audio_storage": granted,
                     "consent_updated_at": datetime.now().astimezone().isoformat()})
            .eq("id", self.current_profile["id"])
            .execute()
        )
        if not res.data:
            raise RuntimeError("Consent update was not saved.")
        self.current_profile.update(res.data[0])

    def update_voice_profile(self, voice_palette: Dict[str, Any]) -> Dict[str, Any]:

        if not self.current_profile:
            raise RuntimeError(
                "No authenticated patient profile active."
            )
        
        patient_id = self.current_profile["id"]
        res = (
            self.client.table("patient_profiles")
            .update({"voice_profile": voice_palette})
            .eq("id", patient_id)
            .execute()
        )

        if res.data:
            self.current_profile["voice_profile"] = voice_palette
            print("[+] Voice profile updated.")
            return res.data[0]
        
        return self.current_profile

    def upload_audio(self, audio_data: Union[np.ndarray, bytes, str],
                     remote_filename: str,
                     folder: str = "raw",
                     sample_rate: int = 16000,
                     ) -> str:

        if not self.current_user:
            raise RuntimeError("Cannot upload audio: no authenticated user.")
        remote_path = f"{self.current_user.id}/{folder}/{remote_filename}"

        if isinstance(audio_data, str):
            if not os.path.exists(audio_data):
                raise FileNotFoundError (f"Audio file not found: {audio_data}")
            with open(audio_data, "rb") as f:
                file_bytes = f.read()
        elif isinstance(audio_data, bytes):
            file_bytes = audio_data
        elif isinstance(audio_data, (np.ndarray,list)):
            audio_arr = np.asarray(audio_data, dtype=np.float32)

            if audio_arr.ndim > 1:
                audio_arr = np.mean(audio_arr, axis = -1)

            audio_arr = np.nan_to_num(audio_arr)
            audio_arr = np.clip(audio_arr, -1.0, 1.0)

            buffer = io.BytesIO()
            sf.write(buffer, audio_arr, samplerate= sample_rate, format="WAV", subtype="PCM_16")
            buffer.seek(0)
            file_bytes = buffer.read()
        elif hasattr(audio_data, "detach"):
            audio_arr = audio_data.detach().cpu().numpy().squeeze()
            return self.upload_audio(audio_arr, remote_filename, folder, sample_rate)
        else:
            raise TypeError (
                f"Unsupported audio type: {type(audio_data)}"
            )

        self.client.storage.from_(self.bucket_name).upload(
            path=remote_path,
            file=file_bytes,
            file_options = {"content-type": "audio/wav", "upsert": "true"},
        )

        return remote_path

    def get_recovery_trajectory(
        self,
        patient_id: Optional[str] = None,
        limit_days: int = 30,
    ) -> List[Dict[str, Any]]:
       
        pid = patient_id or (self.current_profile["id"] if self.current_profile else None)
        if not pid:
            return []
        res = (
            self.client.table("patient_daily_progress")
            .select("*")
            .eq("patient_id", pid)
            .order("session_date", desc=True)
            .limit(limit_days)
            .execute()
        )

        return (res.data or [])[::-1]