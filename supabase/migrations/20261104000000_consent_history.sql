-- Consent history (REVIEW-2026-10-28, H5; India's Digital Personal Data Protection Act 2023): every change to a
-- patient's choice about keeping recordings is recorded with the privacy notice's version and the time, so it can be
-- shown what someone agreed to and when they withdrew. Written only by the trigger below, never by a client, and kept
-- as long as the account: deleting the account (DELETE /api/me/data) deletes the history with it.

create or replace function public.privacy_notice_version()
returns text language sql immutable as $$ select '2026-10-28' $$;

create table if not exists public.consent_events (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    purpose text not null check (purpose in ('keep_recordings')),
    granted boolean not null,
    notice_version text not null,
    at timestamptz not null default now()
);
create index if not exists consent_events_user on public.consent_events(user_id, at);
alter table public.consent_events enable row level security;
revoke all on public.consent_events from anon, authenticated;
grant select on public.consent_events to authenticated;
create policy "Patient reads own consent history"
on public.consent_events for select to authenticated
using (user_id = auth.uid());

create or replace function public.record_consent_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.consent_updated_at is not null
       and (tg_op = 'INSERT' or new.consent_audio_storage is distinct from old.consent_audio_storage
            or old.consent_updated_at is null) then
        insert into public.consent_events(user_id, purpose, granted, notice_version)
        values (new.user_id, 'keep_recordings', new.consent_audio_storage, public.privacy_notice_version());
    end if;
    return new;
end $$;
revoke all on function public.record_consent_change() from public, anon, authenticated;

drop trigger if exists trigger_record_consent on public.patient_profiles;
create trigger trigger_record_consent
after insert or update of consent_audio_storage, consent_updated_at on public.patient_profiles
for each row execute function public.record_consent_change();
