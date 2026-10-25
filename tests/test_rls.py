"""Attacks the real migrations on an embedded Postgres, acting as each kind of Supabase user.
Skipped unless `pgserver` and `psycopg2` are installed (pip install pgserver psycopg2-binary).
Fidelity limit: auth.uid()/roles/storage are minimal stand-ins (tests/rls_bootstrap.sql), not Supabase itself."""
import itertools
import shutil
import tempfile
import uuid
from pathlib import Path

import pytest

pgserver = pytest.importorskip("pgserver")
psycopg2 = pytest.importorskip("psycopg2")
from psycopg2.extensions import parse_dsn

ROOT = Path(__file__).resolve().parents[1]
PA, PB, DC, DU, DE = (str(uuid.uuid4()) for _ in range(5))  # patient A/B, verified/unverified/other-verified clinician
PATIENT_TABLES = ["patient_profiles", "therapy_sessions", "biomarker_logs", "session_utterances",
                  "clinicians", "clinician_access", "clinical_assessments", "link_codes", "patient_daily_progress"]
_counter = itertools.count()


class Db:
    def __init__(self, dsn):
        self.conn = psycopg2.connect(**dsn)
        self.conn.autocommit = True

    def q(self, role, uid, sql, params=()):
        cur = self.conn.cursor()
        try:
            cur.execute("reset role")
            if role:
                cur.execute(f"set role {role}")
            cur.execute("select set_config('request.jwt.claim.sub', %s, false)", (uid or "",))
            cur.execute(sql, params)
            return cur.fetchall() if cur.description else cur.rowcount
        finally:
            cur.execute("reset role")
            cur.close()


@pytest.fixture(scope="module")
def server_and_template():
    data_dir = tempfile.mkdtemp(prefix="rls_pg_")
    srv = pgserver.get_server(data_dir)
    base = parse_dsn(srv.get_uri())
    admin = Db({**base, "dbname": "postgres"})
    admin.q(None, None, "create database tmpl")
    tmpl = Db({**base, "dbname": "tmpl"})
    for sql in [ROOT / "tests/rls_bootstrap.sql", *sorted((ROOT / "supabase/migrations").glob("*.sql"))]:
        # the embedded build has no uuid-ossp; the schema only uses gen_random_uuid()
        tmpl.conn.cursor().execute(sql.read_text(encoding="utf-8").replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ""))
    tmpl.conn.close()
    yield admin, base
    srv.cleanup()
    shutil.rmtree(data_dir, ignore_errors=True)  # cleanup() stops Postgres but leaves ~350 MB behind


@pytest.fixture
def db(server_and_template):
    admin, base = server_and_template
    name = f"t{next(_counter)}"
    admin.q(None, None, f"create database {name} template tmpl")
    d = Db({**base, "dbname": name})
    for uid, mail in ((PA, "a"), (PB, "b"), (DC, "dc"), (DU, "du"), (DE, "de")):
        d.q(None, None, "insert into auth.users(id, email) values (%s, %s)", (uid, mail))
    d.pid = {u: d.q(None, None, "select id from patient_profiles where user_id=%s", (u,))[0][0] for u in (PA, PB)}
    d.sess = {u: d.q("service_role", None, "insert into therapy_sessions(patient_id) values (%s) returning id",
                     (d.pid[u],))[0][0] for u in (PA, PB)}
    d.q("service_role", None, "insert into biomarker_logs(session_id, patient_id, articulation_velocity, stability_index) "
        "values (%s, %s, 3.0, 90)", (d.sess[PA], d.pid[PA]))
    d.q("service_role", None, "insert into session_utterances(session_id, patient_id, transcribed_text) values (%s, %s, 'hi')",
        (d.sess[PA], d.pid[PA]))
    for u in (DC, DU, DE):
        d.q("authenticated", u, "insert into clinicians(user_id, display_name) values (%s, 'Dr')", (u,))
    d.q(None, None, "update clinicians set verified = true where user_id in (%s, %s)", (DC, DE))
    return d


def redeem(db, who, code):
    return db.q("authenticated", who, "select redeem_link_code(%s)", (code,))[0][0]


def link(db, clinician=DC, patient=PA):
    code = db.q("authenticated", patient, "select create_link_code()")[0][0]
    assert redeem(db, clinician, code) is True
    return code


def denied(db, role, uid, sql, params=(), msg=""):
    with pytest.raises(psycopg2.Error) as e:
        db.q(role, uid, sql, params)
    assert msg in str(e.value)


def test_profile_is_deidentified(db):
    cols = {r[0] for r in db.q(None, None, "select column_name from information_schema.columns where table_name='patient_profiles'")}
    assert not cols & {"email", "full_name", "condition_type"}
    assert db.q(None, None, "select consent_audio_storage from patient_profiles where user_id=%s", (PA,)) == [(False,)]


@pytest.mark.parametrize("table", PATIENT_TABLES)
def test_anon_sees_nothing(db, table):
    denied(db, "anon", None, f"select * from {table}", msg="permission denied")


def test_patient_isolation(db):
    assert len(db.q("authenticated", PA, "select * from patient_profiles")) == 1
    assert db.q("authenticated", PA, "select * from therapy_sessions where id=%s", (db.sess[PB],)) == []
    denied(db, "authenticated", PA, "insert into therapy_sessions(patient_id) values (%s)", (db.pid[PB],), "permission denied")
    assert db.q("authenticated", PA, "update patient_profiles set voice_profile='{}' where id=%s", (db.pid[PB],)) == 0


def test_vocabulary_starts_empty_and_only_its_patient_can_change_it(db):
    assert db.q("authenticated", PA, "select vocabulary from patient_profiles") == [({},)]
    assert db.q("authenticated", PA, """update patient_profiles set vocabulary='{"water": 3}' where id=%s""", (db.pid[PA],)) == 1
    assert db.q("authenticated", PA, """update patient_profiles set vocabulary='{"x": 1}' where id=%s""", (db.pid[PB],)) == 0
    assert db.q(None, None, "select vocabulary from patient_profiles where id=%s", (db.pid[PB],)) == [({},)]
    denied(db, "authenticated", PA, "update patient_profiles set vocabulary = null where id=%s", (db.pid[PA],), "null value")


def test_biomarkers_are_server_write_only(db):
    ins = "insert into biomarker_logs(session_id, patient_id, stability_index) values (%s, %s, 99)"
    denied(db, "authenticated", PA, ins, (db.sess[PA], db.pid[PA]), "permission denied")
    denied(db, "authenticated", PA, "update biomarker_logs set stability_index = 99", msg="permission denied")
    assert len(db.q("authenticated", PA, "select * from biomarker_logs")) == 1
    assert db.q("authenticated", PB, "select * from biomarker_logs") == []


def test_patients_cannot_write_scores_or_answers(db):
    for sql, params in (
        ("insert into therapy_sessions(patient_id, accuracy_rate) values (%s, 100)", (db.pid[PA],)),
        ("update therapy_sessions set accuracy_rate = 100", ()),
        ("delete from therapy_sessions", ()),
        ("insert into session_utterances(session_id, patient_id, transcribed_text) values (%s, %s, 'x')", (db.sess[PA], db.pid[PA])),
        ("insert into session_utterances(session_id, patient_id, transcribed_text) values (%s, %s, 'planted')", (db.sess[PB], db.pid[PA])),
        ("update session_utterances set confirmed = true", ()),
        ("delete from session_utterances", ()),
    ):
        denied(db, "authenticated", PA, sql, params, "permission denied")
    assert len(db.q("authenticated", PA, "select * from therapy_sessions")) == 1       # still readable
    assert len(db.q("authenticated", PA, "select * from session_utterances")) == 1
    assert db.q("service_role", None, "update therapy_sessions set accuracy_rate = 80 where id = %s", (db.sess[PA],)) == 1


def test_clinician_cannot_self_verify(db):
    denied(db, "authenticated", DU, "update clinicians set verified = true", msg="permission denied")
    denied(db, "authenticated", DU, "insert into clinicians(user_id, display_name, verified) values (%s, 'x', true)", (PB,), "row-level security")
    assert db.q("authenticated", DU, "select * from clinicians where user_id <> %s", (DU,)) == []


def test_link_code_flow_and_failures(db):
    code = db.q("authenticated", PA, "select create_link_code()")[0][0]
    assert len(code) == 10
    assert db.q(None, None, "select count(*) from link_codes where code_hash = %s or code_hash like %s", (code, code + "%")) == [(0,)]  # only a hash is stored
    assert redeem(db, DU, code) is False             # unverified
    assert redeem(db, DC, "WRONGCODE0") is False     # wrong
    assert redeem(db, DC, code.lower()) is True      # case-insensitive
    assert redeem(db, DE, code) is False             # reuse
    code2 = db.q("authenticated", PA, "select create_link_code()")[0][0]
    db.q(None, None, "update link_codes set expires_at = now() - interval '1 minute'")
    assert redeem(db, DE, code2) is False            # expired
    denied(db, "authenticated", PA, "select * from link_codes", msg="permission denied")
    denied(db, "authenticated", PA, "insert into link_codes values ('x', %s, now(), null)", (db.pid[PA],), "permission denied")


def test_new_code_replaces_old(db):
    old = db.q("authenticated", PA, "select create_link_code()")[0][0]
    db.q("authenticated", PA, "select create_link_code()")
    assert redeem(db, DC, old) is False


def test_grants_cannot_be_made_directly(db):
    denied(db, "authenticated", PA, "insert into clinician_access(clinician_id, patient_id) values (%s, %s)", (DC, db.pid[PA]), "row-level security")
    denied(db, "authenticated", DC, "insert into clinician_access(clinician_id, patient_id) values (%s, %s)", (DC, db.pid[PA]), "row-level security")


def test_clinician_reads_only_granted_patient_and_never_writes(db):
    assert db.q("authenticated", DC, "select * from therapy_sessions") == []
    link(db)
    assert [r[0] for r in db.q("authenticated", DC, "select id from therapy_sessions")] == [db.sess[PA]]
    assert len(db.q("authenticated", DC, "select * from biomarker_logs")) == 1
    assert len(db.q("authenticated", DC, "select * from session_utterances")) == 1
    denied(db, "authenticated", DC, "insert into session_utterances(session_id, patient_id, transcribed_text) values (%s, %s, 'x')",
           (db.sess[PA], db.pid[PA]), "permission denied")
    denied(db, "authenticated", DC, "update therapy_sessions set accuracy_rate = 100", msg="permission denied")
    assert db.q("authenticated", DC, "select user_id from patient_profiles") == [(DC,)]  # only their own (empty) profile


def test_unverifying_cuts_access_immediately(db):
    link(db)
    db.q(None, None, "update clinicians set verified = false where user_id = %s", (DC,))
    for t in ("therapy_sessions", "biomarker_logs", "session_utterances"):
        assert db.q("authenticated", DC, f"select * from {t}") == [], t


def test_revoking_cuts_access_and_only_patient_can_revoke(db):
    link(db)
    assert db.q("authenticated", DC, "update clinician_access set granted_at = now() + interval '1 year'") == 0  # no update policy for clinician
    assert db.q("authenticated", PA, "update clinician_access set revoked_at = now()") == 1
    assert db.q("authenticated", DC, "select * from therapy_sessions") == []


def test_assessments(db):
    link(db)
    ins = "insert into clinical_assessments(session_id, clinician_id, condition, impression, home_plan, frequency) values (%s, %s, 'c', 'i', 'h', 'f')"
    db.q("authenticated", DC, ins, (db.sess[PA], DC))
    denied(db, "authenticated", DC, ins, (db.sess[PB], DC), "row-level security")           # not their patient
    denied(db, "authenticated", DU, ins, (db.sess[PA], DU), "row-level security")           # unverified
    denied(db, "authenticated", DC, ins, (db.sess[PA], DE), "row-level security")           # impersonating another clinician
    assert db.q("authenticated", DC, "update clinical_assessments set impression = 'fixed'") == 1
    assert db.q("authenticated", DE, "update clinical_assessments set impression = 'hijack'") == 0
    assert db.q("authenticated", DE, "select * from clinical_assessments") == []
    assert len(db.q("authenticated", PA, "select * from clinical_assessments")) == 1
    assert db.q("authenticated", PB, "select * from clinical_assessments") == []
    assert db.q("authenticated", PA, "update clinical_assessments set impression = 'patient edit'") == 0
    db.q("authenticated", PA, "update clinician_access set revoked_at = now()")
    denied(db, "authenticated", DC, "update clinical_assessments set impression = 'late edit'", msg="row-level security")


def test_audio_storage_needs_consent_and_own_folder(db):
    put = "insert into storage.objects(bucket_id, name) values ('patient_audio', %s)"
    denied(db, "authenticated", PA, put, (f"{PA}/raw/a.wav",), "row-level security")        # no consent yet
    db.q("authenticated", PA, "update patient_profiles set consent_audio_storage = true")
    db.q("authenticated", PA, put, (f"{PA}/raw/a.wav",))
    denied(db, "authenticated", PA, put, (f"{PB}/raw/a.wav",), "row-level security")        # someone else's folder
    assert len(db.q("authenticated", PA, "select * from storage.objects")) == 1
    assert db.q("authenticated", PB, "select * from storage.objects") == []
    assert db.q("anon", None, "select * from storage.objects") == []
    assert db.q(None, None, "select public from storage.buckets where id='patient_audio'") == [(False,)]


def test_progress_view_has_no_identity(db):
    cols = {r[0] for r in db.q(None, None, "select column_name from information_schema.columns where table_name='patient_daily_progress'")}
    assert not cols & {"full_name", "condition_type", "email"}
    assert len(db.q("authenticated", PA, "select * from patient_daily_progress")) == 1
    assert db.q("authenticated", PB, "select * from patient_daily_progress where patient_id = %s", (db.pid[PA],)) == []


def test_deleting_a_patient_erases_everything_but_a_clinician_with_assessments_is_blocked(db):
    link(db)
    db.q("authenticated", DC, "insert into clinical_assessments(session_id, clinician_id, condition, impression, home_plan, frequency) "
         "values (%s, %s, 'c', 'i', 'h', 'f')", (db.sess[PA], DC))
    db.q(None, None, "delete from auth.users where id = %s", (PA,))
    pid, sid = db.pid[PA], db.sess[PA]
    for table, col, val in (("patient_profiles", "id", pid), ("therapy_sessions", "patient_id", pid),
                            ("biomarker_logs", "patient_id", pid), ("session_utterances", "patient_id", pid),
                            ("clinician_access", "patient_id", pid), ("clinical_assessments", "session_id", sid)):
        assert db.q(None, None, f"select count(*) from {table} where {col} = %s", (val,)) == [(0,)], table
    assert db.q(None, None, "select count(*) from clinicians where user_id = %s", (DC,)) == [(1,)]


def test_five_wrong_guesses_lock_the_clinician_out(db):
    code = db.q("authenticated", PA, "select create_link_code()")[0][0]
    for i in range(5):
        assert redeem(db, DC, f"BADGUESS{i}0") is False
    assert redeem(db, DC, code) is False                 # locked, even with the right code
    assert redeem(db, DE, code) is True                  # other clinicians are unaffected
    db.q(None, None, "update link_attempts set at = now() - interval '16 minutes'")
    code_b = db.q("authenticated", PB, "select create_link_code()")[0][0]
    assert redeem(db, DC, code_b) is True                # the lock expires
    denied(db, "authenticated", DC, "select * from link_attempts", msg="permission denied")


def test_rate_limit_function_is_server_only_and_counts(db):
    call = "select rate_limit_hit('x', %s, 2, 60)"
    assert [db.q("service_role", None, call, (PA,))[0][0] for _ in range(3)] == [True, True, False]
    assert db.q("service_role", None, call, (PB,)) == [(True,)]          # per user
    db.q(None, None, "update rate_hits set at = now() - interval '2 minutes'")
    assert db.q("service_role", None, call, (PA,)) == [(True,)]          # the window slid
    denied(db, "authenticated", PA, call, (PA,), "permission denied")
    denied(db, "anon", None, call, (PA,), "permission denied")
    denied(db, "authenticated", PA, "select * from rate_hits", msg="permission denied")


def test_verification_changes_are_audited(db):
    db.q(None, None, "update clinicians set verified = false where user_id = %s", (DC,))
    rows = db.q(None, None, "select old_verified, new_verified, changed_by from clinician_audit where clinician_id = %s order by id", (DC,))
    assert [(r[0], r[1]) for r in rows] == [(None, False), (False, True), (True, False)]  # registered, admin verified, admin revoked
    assert rows[0][2] == DC and all(r[2] for r in rows)                                     # who did it is recorded
    denied(db, "authenticated", DC, "select * from clinician_audit", msg="permission denied")
    denied(db, "authenticated", DC, "delete from clinician_audit", msg="permission denied")
