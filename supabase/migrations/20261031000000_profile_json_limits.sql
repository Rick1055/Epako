-- What the server learns from a patient (vocabulary, phonetic_corrections) is written only by the server, after the
-- patient answers: both are loaded on every request, so a planted blob would cost CPU on every utterance.
-- Patients keep setting their own voice and consent. Deleting the row directly is refused: it would erase sessions
-- but leave stored audio behind; DELETE /api/me/data removes the audio first.
revoke insert, update, delete on public.patient_profiles from authenticated;
grant insert (user_id) on public.patient_profiles to authenticated;
grant update (voice_profile, consent_audio_storage, consent_updated_at) on public.patient_profiles to authenticated;

-- Backstop against server bugs: always a JSON object, and bounded. Text length, not pg_column_size: compressed size
-- would let a highly repetitive blob through.
alter table public.patient_profiles
    add constraint vocabulary_is_a_bounded_object
        check (jsonb_typeof(vocabulary) = 'object' and octet_length(vocabulary::text) <= 200000),
    add constraint phonetic_corrections_is_a_bounded_object
        check (jsonb_typeof(phonetic_corrections) = 'object' and octet_length(phonetic_corrections::text) <= 1000000),
    add constraint voice_profile_is_a_bounded_object
        check (jsonb_typeof(voice_profile) = 'object' and octet_length(voice_profile::text) <= 2000);
