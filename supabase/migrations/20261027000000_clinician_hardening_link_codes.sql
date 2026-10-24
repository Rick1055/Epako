-- Gap 1: un-verifying a clinician must cut their read access immediately.
drop policy if exists "Granted clinician reads sessions" on public.therapy_sessions;
create policy "Granted clinician reads sessions"
on public.therapy_sessions for select to authenticated
using (exists (select 1 from public.clinician_access a
               join public.clinicians c on c.user_id = a.clinician_id and c.verified
               where a.clinician_id = auth.uid() and a.patient_id = therapy_sessions.patient_id
                 and a.revoked_at is null));

drop policy if exists "Granted clinician reads biomarkers" on public.biomarker_logs;
create policy "Granted clinician reads biomarkers"
on public.biomarker_logs for select to authenticated
using (exists (select 1 from public.clinician_access a
               join public.clinicians c on c.user_id = a.clinician_id and c.verified
               where a.clinician_id = auth.uid() and a.patient_id = biomarker_logs.patient_id
                 and a.revoked_at is null));

drop policy if exists "Granted clinician reads utterances" on public.session_utterances;
create policy "Granted clinician reads utterances"
on public.session_utterances for select to authenticated
using (exists (select 1 from public.clinician_access a
               join public.clinicians c on c.user_id = a.clinician_id and c.verified
               where a.clinician_id = auth.uid() and a.patient_id = session_utterances.patient_id
                 and a.revoked_at is null));

-- Gap 2: the author may correct their own assessment (same rules as writing one).
alter table public.clinical_assessments add column if not exists updated_at timestamptz default now();

drop trigger if exists trigger_assessments_updated_at on public.clinical_assessments;
create trigger trigger_assessments_updated_at
before update on public.clinical_assessments
for each row execute function update_updated_at_column();

create policy "Author edits own assessment"
on public.clinical_assessments for update to authenticated
using (clinician_id = auth.uid())
with check (
    clinician_id = auth.uid()
    and exists (select 1 from public.clinicians c where c.user_id = auth.uid() and c.verified)
    and exists (select 1 from public.therapy_sessions s
                join public.clinician_access a on a.patient_id = s.patient_id
                where s.id = session_id and a.clinician_id = auth.uid() and a.revoked_at is null)
);

-- Gap 3: link codes. The patient makes a one-time code; a verified clinician redeems it.
-- This becomes the only way a grant is created, so the direct-insert policy goes.
drop policy if exists "Patient grants access to verified clinician" on public.clinician_access;

create table if not exists public.link_codes (
    code_hash text primary key,
    patient_id uuid not null references public.patient_profiles(id) on delete cascade,
    expires_at timestamptz not null,
    used_at timestamptz
);
alter table public.link_codes enable row level security;  -- no policies: reachable only through the functions below
revoke all on public.link_codes from anon, authenticated;

create or replace function public.create_link_code()
returns text as $$
declare
    pid uuid;
    code text;
begin
    select id into pid from public.patient_profiles where user_id = auth.uid();
    if pid is null then raise exception 'No patient profile'; end if;
    delete from public.link_codes where patient_id = pid and used_at is null;  -- one live code at a time
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.link_codes (code_hash, patient_id, expires_at)
    values (encode(sha256(convert_to(code, 'utf8')), 'hex'), pid, now() + interval '15 minutes');
    return code;  -- shown once; only its hash is stored
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.redeem_link_code(code text)
returns void as $$
declare
    pid uuid;
begin
    if not exists (select 1 from public.clinicians where user_id = auth.uid() and verified) then
        raise exception 'Invalid or expired code';
    end if;
    update public.link_codes set used_at = now()
    where code_hash = encode(sha256(convert_to(upper(trim(code)), 'utf8')), 'hex')
      and used_at is null and expires_at > now()
    returning patient_id into pid;
    if pid is null then raise exception 'Invalid or expired code'; end if;  -- same message for every failure
    insert into public.clinician_access (clinician_id, patient_id)
    values (auth.uid(), pid)
    on conflict (clinician_id, patient_id) do update set revoked_at = null, granted_at = now();
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.create_link_code() from public, anon;
revoke all on function public.redeem_link_code(text) from public, anon;
grant execute on function public.create_link_code() to authenticated;
grant execute on function public.redeem_link_code(text) to authenticated;
