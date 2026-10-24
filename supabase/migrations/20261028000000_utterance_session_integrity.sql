-- A patient could insert an utterance carrying their own patient_id but someone else's session_id,
-- planting text into another patient's session/report. The row must also belong to a session of that patient.
drop policy if exists "Patients access own utterances" on public.session_utterances;
create policy "Patients access own utterances"
on public.session_utterances for all
using (patient_id in (select id from public.patient_profiles where user_id = auth.uid()))
with check (
    patient_id in (select id from public.patient_profiles where user_id = auth.uid())
    and session_id in (select id from public.therapy_sessions where patient_id = session_utterances.patient_id)
);
