-- Clinicians read patients' health data only from a two-step session (REVIEW-2026-10-28, H2).
-- Supabase marks a session 'aal2' in its token once the person has also entered a code from their authenticator app.
-- Checking it here, in the policies, means no client (the web app, a script, the API acting as the caller) can read a
-- patient's sessions, phrases or voice measurements, or write an assessment, with a password-only session.

create or replace function public.is_two_step()
returns boolean language sql stable as
$$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;

drop policy if exists "Granted clinician reads sessions" on public.therapy_sessions;
create policy "Granted clinician reads sessions"
on public.therapy_sessions for select to authenticated
using (public.is_two_step()
       and exists (select 1 from public.clinician_access a
                   join public.clinicians c on c.user_id = a.clinician_id and c.verified
                   where a.clinician_id = auth.uid() and a.patient_id = therapy_sessions.patient_id
                     and a.revoked_at is null));

drop policy if exists "Granted clinician reads biomarkers" on public.biomarker_logs;
create policy "Granted clinician reads biomarkers"
on public.biomarker_logs for select to authenticated
using (public.is_two_step()
       and exists (select 1 from public.clinician_access a
                   join public.clinicians c on c.user_id = a.clinician_id and c.verified
                   where a.clinician_id = auth.uid() and a.patient_id = biomarker_logs.patient_id
                     and a.revoked_at is null));

drop policy if exists "Granted clinician reads utterances" on public.session_utterances;
create policy "Granted clinician reads utterances"
on public.session_utterances for select to authenticated
using (public.is_two_step()
       and exists (select 1 from public.clinician_access a
                   join public.clinicians c on c.user_id = a.clinician_id and c.verified
                   where a.clinician_id = auth.uid() and a.patient_id = session_utterances.patient_id
                     and a.revoked_at is null));

drop policy if exists "Granted verified clinician writes assessment" on public.clinical_assessments;
create policy "Granted verified clinician writes assessment"
on public.clinical_assessments for insert to authenticated
with check (
    public.is_two_step()
    and clinician_id = auth.uid()
    and exists (select 1 from public.clinicians c where c.user_id = auth.uid() and c.verified)
    and exists (select 1 from public.therapy_sessions s
                join public.clinician_access a on a.patient_id = s.patient_id
                where s.id = session_id and a.clinician_id = auth.uid() and a.revoked_at is null)
);

drop policy if exists "Author edits own assessment" on public.clinical_assessments;
create policy "Author edits own assessment"
on public.clinical_assessments for update to authenticated
using (public.is_two_step() and clinician_id = auth.uid())
with check (
    public.is_two_step()
    and clinician_id = auth.uid()
    and exists (select 1 from public.clinicians c where c.user_id = auth.uid() and c.verified)
    and exists (select 1 from public.therapy_sessions s
                join public.clinician_access a on a.patient_id = s.patient_id
                where s.id = session_id and a.clinician_id = auth.uid() and a.revoked_at is null)
);

-- A clinician's own assessments describe a patient too: also two-step only. The patient's own reading is unchanged.
drop policy if exists "Author or patient reads assessment" on public.clinical_assessments;
create policy "Author or patient reads assessment"
on public.clinical_assessments for select to authenticated
using (
    (public.is_two_step() and clinician_id = auth.uid())
    or session_id in (select s.id from public.therapy_sessions s
                      join public.patient_profiles p on p.id = s.patient_id
                      where p.user_id = auth.uid())
);
