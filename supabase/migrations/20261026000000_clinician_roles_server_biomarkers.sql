-- 1. Biomarkers are measured by the server: clients may read them but never write them.
--    The API writes with the service-role key after checking session ownership.
alter table public.biomarker_logs add column if not exists stability_index numeric(5,2);

drop policy if exists "Patients access own biomarkers" on public.biomarker_logs;
create policy "Patients read own biomarkers"
on public.biomarker_logs for select
using (patient_id in (select id from public.patient_profiles where user_id = auth.uid()));

revoke insert, update, delete on public.biomarker_logs from authenticated;

-- 2. Clinicians. 'verified' can only be set by an admin (dashboard / service role).
create table if not exists public.clinicians (
    user_id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null,
    license_ref text,
    verified boolean not null default false,
    created_at timestamptz default now()
);
alter table public.clinicians enable row level security;
revoke all on public.clinicians from anon;
revoke update on public.clinicians from authenticated;

create policy "Clinician registers self unverified"
on public.clinicians for insert to authenticated
with check (user_id = auth.uid() and verified = false);

-- 3. Patient-controlled access grants.
create table if not exists public.clinician_access (
    clinician_id uuid not null references public.clinicians(user_id) on delete cascade,
    patient_id uuid not null references public.patient_profiles(id) on delete cascade,
    granted_at timestamptz default now(),
    revoked_at timestamptz,
    primary key (clinician_id, patient_id)
);
alter table public.clinician_access enable row level security;
revoke all on public.clinician_access from anon;

create policy "Patient grants access to verified clinician"
on public.clinician_access for insert to authenticated
with check (
    patient_id in (select id from public.patient_profiles where user_id = auth.uid())
    and exists (select 1 from public.clinicians c where c.user_id = clinician_id and c.verified)
);
create policy "Patient revokes access"
on public.clinician_access for update to authenticated
using (patient_id in (select id from public.patient_profiles where user_id = auth.uid()))
with check (patient_id in (select id from public.patient_profiles where user_id = auth.uid()));
create policy "Patient and clinician see grant"
on public.clinician_access for select to authenticated
using (clinician_id = auth.uid()
       or patient_id in (select id from public.patient_profiles where user_id = auth.uid()));

-- Clinicians see themselves; patients see clinicians they granted (needed to print the name on reports).
create policy "See self or granted clinician"
on public.clinicians for select to authenticated
using (
    user_id = auth.uid()
    or exists (
        select 1 from public.clinician_access a
        join public.patient_profiles p on p.id = a.patient_id
        where a.clinician_id = clinicians.user_id and p.user_id = auth.uid()
    )
);

-- 4. Granted clinicians read (never write) the patient's sessions, biomarkers and utterances.
create policy "Granted clinician reads sessions"
on public.therapy_sessions for select to authenticated
using (exists (select 1 from public.clinician_access a
               where a.clinician_id = auth.uid() and a.patient_id = therapy_sessions.patient_id
                 and a.revoked_at is null));
create policy "Granted clinician reads biomarkers"
on public.biomarker_logs for select to authenticated
using (exists (select 1 from public.clinician_access a
               where a.clinician_id = auth.uid() and a.patient_id = biomarker_logs.patient_id
                 and a.revoked_at is null));
create policy "Granted clinician reads utterances"
on public.session_utterances for select to authenticated
using (exists (select 1 from public.clinician_access a
               where a.clinician_id = auth.uid() and a.patient_id = session_utterances.patient_id
                 and a.revoked_at is null));

-- 5. Assessments are authored only by a verified, granted clinician.
create table if not exists public.clinical_assessments (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.therapy_sessions(id) on delete cascade,
    clinician_id uuid not null references public.clinicians(user_id),
    condition text not null,
    impression text not null,
    home_plan text not null,
    frequency text not null,
    created_at timestamptz default now(),
    unique (session_id, clinician_id)
);
alter table public.clinical_assessments enable row level security;
revoke all on public.clinical_assessments from anon;

create policy "Granted verified clinician writes assessment"
on public.clinical_assessments for insert to authenticated
with check (
    clinician_id = auth.uid()
    and exists (select 1 from public.clinicians c where c.user_id = auth.uid() and c.verified)
    and exists (select 1 from public.therapy_sessions s
                join public.clinician_access a on a.patient_id = s.patient_id
                where s.id = session_id and a.clinician_id = auth.uid() and a.revoked_at is null)
);
create policy "Author or patient reads assessment"
on public.clinical_assessments for select to authenticated
using (
    clinician_id = auth.uid()
    or session_id in (select s.id from public.therapy_sessions s
                      join public.patient_profiles p on p.id = s.patient_id
                      where p.user_id = auth.uid())
);
