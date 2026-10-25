"""
Attacks the LIVE Supabase project directly (no API in between, as a hacker would) with throwaway accounts:
an anonymous outsider, patients A and B, an unverified "doctor" and a verified doctor A never linked.

    python scripts/attack_live.py

Needs SUPABASE_URL, SUPABASE_KEY (anon) and SUPABASE_SERVICE_ROLE_KEY in .env. Accounts sign in with an admin-made
magic link, so CAPTCHA can stay on. Every account (and with it every row) is deleted at the end. Exit code 1 if any
attack got through. The same rules are attacked offline on every migration in tests/test_rls.py.
"""
import os
import sys
import uuid

from dotenv import load_dotenv
from supabase import create_client

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, ".env"))
URL, ANON, SERVICE = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TABLES = ["patient_profiles", "therapy_sessions", "session_utterances", "biomarker_logs", "clinicians",
          "clinician_access", "clinical_assessments", "link_codes", "link_attempts", "rate_hits", "clinician_audit"]
results = []


def check(name, blocked, detail=""):
    results.append(blocked)
    print(("BLOCKED  " if blocked else "GOT IN   ") + name + (f"  [{str(detail)[:100]}]" if detail and not blocked else ""))


def attempt(fn):
    """(succeeded, rows or error text)"""
    try:
        return True, fn()
    except Exception as e:
        return False, str(e)


def refused(fn):
    ok, out = attempt(fn)
    return (not ok) or out in ([], 0, None, False), out


def main():
    if not (URL and ANON and SERVICE) or ANON == SERVICE:
        sys.exit("Set SUPABASE_URL, SUPABASE_KEY (anon) and SUPABASE_SERVICE_ROLE_KEY in .env")
    admin, users = create_client(URL, SERVICE), []

    def account():
        u = admin.auth.admin.create_user({"email": f"attack-{uuid.uuid4().hex[:10]}@example.com", "email_confirm": True}).user
        users.append(u.id)
        c = create_client(URL, ANON)
        c.auth.verify_otp({"token_hash": admin.auth.admin.generate_link({"type": "magiclink", "email": u.email}).properties.hashed_token,
                           "type": "magiclink"})
        return u.id, c

    try:
        (ua, a), (ub, _), (uu, unverified), (uv, doctor) = account(), account(), account(), account()   # B is only a victim
        pid = {u: admin.table("patient_profiles").select("id").eq("user_id", u).execute().data[0]["id"] for u in (ua, ub)}
        sess = {u: admin.table("therapy_sessions").insert({"patient_id": pid[u]}).execute().data[0]["id"] for u in (ua, ub)}
        for u in (ua, ub):
            admin.table("session_utterances").insert({"session_id": sess[u], "patient_id": pid[u], "transcribed_text": "private"}).execute()
            admin.table("biomarker_logs").insert({"session_id": sess[u], "patient_id": pid[u], "articulation_velocity": 3.0}).execute()
        for u, c in ((uu, unverified), (uv, doctor)):
            c.table("clinicians").insert({"user_id": u, "display_name": "Dr Test"}).execute()
        admin.table("clinicians").update({"verified": True}).eq("user_id", uv).execute()
        has_vocab = attempt(lambda: admin.table("patient_profiles").select("vocabulary").limit(1).execute())[0]
        print(f"migration 20261030 (vocabulary) live: {has_vocab}\n")

        outsider = create_client(URL, ANON)
        for t in TABLES:
            check(f"outsider reads {t}", *refused(lambda: outsider.table(t).select("*").execute().data))

        for t, col in (("patient_profiles", "id"), ("therapy_sessions", "patient_id"), ("session_utterances", "patient_id"), ("biomarker_logs", "patient_id")):
            check(f"patient A reads patient B's {t}", *refused(lambda: a.table(t).select("*").eq(col, pid[ub]).execute().data))
        check("patient A edits patient B's voice", *refused(lambda: a.table("patient_profiles").update({"voice_profile": {}}).eq("id", pid[ub]).execute().data))
        check("patient A plants an utterance in their own session", *refused(lambda: a.table("session_utterances").insert(
            {"session_id": sess[ua], "patient_id": pid[ua], "transcribed_text": "x"}).execute().data))
        check("patient A raises their own session score", *refused(lambda: a.table("therapy_sessions").update({"accuracy_rate": 100}).eq("id", sess[ua]).execute().data))
        check("patient A writes their own biomarkers", *refused(lambda: a.table("biomarker_logs").insert(
            {"session_id": sess[ua], "patient_id": pid[ua], "articulation_velocity": 9.9}).execute().data))
        for col, val in (("phonetic_corrections", {"w": {"to": "x", "ok": 9, "bad": 0}}), ("vocabulary", {f"w{i}": 1 for i in range(20000)})):
            if col == "vocabulary" and not has_vocab:
                continue
            check(f"patient A plants their own {col} (migration 20261031)", *refused(lambda: a.table("patient_profiles").update({col: val}).eq("id", pid[ua]).execute().data))
        check("patient A plants a 10 kB voice profile (migration 20261031)", *refused(lambda: a.table("patient_profiles").update(
            {"voice_profile": {"x": "y" * 10000}}).eq("id", pid[ua]).execute().data))
        check("patient A calls the rate limiter", *refused(lambda: a.rpc("rate_limit_hit", {"p_name": "x", "p_user": ua, "p_limit": 999, "p_seconds": 1}).execute().data))
        check("patient A grants themselves a doctor", *refused(lambda: a.table("clinician_access").insert({"clinician_id": uv, "patient_id": pid[ua]}).execute().data))
        audio = a.storage.from_("patient_audio")
        check("patient A uploads into patient B's folder", *refused(lambda: audio.upload(f"{ub}/x.wav", b"RIFF", {"content-type": "audio/wav"})))
        check("patient A uploads without consent", *refused(lambda: audio.upload(f"{ua}/x.wav", b"RIFF", {"content-type": "audio/wav"})))

        check("unverified doctor marks themselves verified", *refused(lambda: unverified.table("clinicians").update({"verified": True}).eq("user_id", uu).execute().data))
        code = a.rpc("create_link_code").execute().data
        check("unverified doctor redeems a real link code", *refused(lambda: unverified.rpc("redeem_link_code", {"code": code}).execute().data))
        for t in ("therapy_sessions", "session_utterances", "biomarker_logs", "patient_profiles"):
            check(f"unlinked verified doctor reads patient A's {t}", *refused(lambda: doctor.table(t).select("*").eq(
                "id" if t == "patient_profiles" else "patient_id", pid[ua]).execute().data))
        check("unlinked verified doctor writes an assessment for A", *refused(lambda: doctor.table("clinical_assessments").insert(
            {"session_id": sess[ua], "clinician_id": uv, "condition": "x", "impression": "x", "home_plan": "x", "frequency": "x"}).execute().data))
        for _ in range(5):
            attempt(lambda: doctor.rpc("redeem_link_code", {"code": "WRONGCODE0"}).execute())
        check("doctor guessing codes is locked out (real code refused after 5 misses)", *refused(lambda: doctor.rpc("redeem_link_code", {"code": code}).execute().data))
        for t in ("clinician_audit", "link_attempts", "rate_hits", "link_codes"):
            check(f"doctor reads {t}", *refused(lambda: doctor.table(t).select("*").execute().data))
        # the blocks above must not be "everything is broken": the owner still gets their own data
        own = a.table("therapy_sessions").select("id").execute().data
        saved = a.table("patient_profiles").update({"voice_profile": {"template": "male_gentle"}}).eq("id", pid[ua]).execute().data
        print(f"sanity: patient A sees own sessions={len(own) == 1}, saves own voice={bool(saved)}")
        results.append(len(own) == 1 and bool(saved))
        if has_vocab:   # last: if it gets through it erases A's rows
            check("patient A deletes their profile row, leaving audio behind (migration 20261031)", *refused(lambda: a.table("patient_profiles").delete().eq("id", pid[ua]).execute().data))
    finally:
        for u in users:
            for prefix in (u,):
                try:
                    files = admin.storage.from_("patient_audio").list(prefix)
                    if files:
                        admin.storage.from_("patient_audio").remove([f"{prefix}/{f['name']}" for f in files])
                except Exception:
                    pass
            admin.auth.admin.delete_user(u)
        print(f"{len(users)} throwaway accounts deleted")
    got_in = results.count(False)
    print(f"\n{len(results) - got_in} of {len(results)} checks held; {got_in} got through")
    sys.exit(1 if got_in else 0)


if __name__ == "__main__":
    main()
