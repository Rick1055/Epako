-- De-identify app tables: identity (email) lives only in auth.users.
-- DESTRUCTIVE: drops patient_profiles.email / full_name / condition_type and their data.

drop view if exists public.patient_daily_progress;

alter table public.patient_profiles
  drop column if exists email,
  drop column if exists full_name,
  drop column if exists condition_type;

-- Audio is stored only after the patient opts in.
alter table public.patient_profiles
  add column if not exists consent_audio_storage boolean not null default false,
  add column if not exists consent_updated_at timestamptz;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.patient_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace view public.patient_daily_progress
with (security_invoker = true) as
select
    p.id as patient_id,
    s.session_date,
    count(distinct s.id) as total_sessions_today,
    round(avg(s.accuracy_rate), 2) as avg_accuracy,
    round(avg(b.articulation_velocity), 2) as avg_articulation_velocity,
    round(avg(b.formant_compression_index), 3) as avg_compression_index,
    round(avg(b.vocal_jitter_pct), 2) as avg_jitter,
    round(avg(b.vocal_shimmer_pct), 2) as avg_shimmer
from public.patient_profiles p
join public.therapy_sessions s on s.patient_id = p.id
left join public.biomarker_logs b on b.session_id = s.id
group by p.id, s.session_date
order by s.session_date desc;

-- Defence in depth: anonymous clients never touch patient tables, even if a policy is added by mistake.
revoke all on public.patient_profiles, public.therapy_sessions,
              public.biomarker_logs, public.session_utterances,
              public.patient_daily_progress from anon;

-- Uploads require the owner's folder AND recorded consent.
drop policy if exists "Owners upload own audio" on storage.objects;
create policy "Owners upload own audio"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'patient_audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.patient_profiles
    where user_id = auth.uid() and consent_audio_storage
  )
);

drop policy if exists "Owners update own audio" on storage.objects;
create policy "Owners update own audio"
on storage.objects for update
to authenticated
using (bucket_id = 'patient_audio' and (storage.foldername(name))[1] = auth.uid()::text)
with check (
  bucket_id = 'patient_audio'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.patient_profiles
    where user_id = auth.uid() and consent_audio_storage
  )
);
