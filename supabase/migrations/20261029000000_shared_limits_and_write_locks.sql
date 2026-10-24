-- 1. Rate limiter shared by every API worker and surviving restarts. Only the API (service role) can call it.
create unlogged table if not exists public.rate_hits (
    name text not null,
    user_id uuid not null,
    at timestamptz not null default now()
);
create index if not exists idx_rate_hits on public.rate_hits (name, user_id, at);
alter table public.rate_hits enable row level security;
revoke all on public.rate_hits from anon, authenticated;

create or replace function public.rate_limit_hit(p_name text, p_user uuid, p_limit int, p_seconds int)
returns boolean as $$
declare n int;
begin
    if random() < 0.01 then
        delete from public.rate_hits where at < now() - interval '1 day';  -- housekeeping
    end if;
    select count(*) into n from public.rate_hits
    where name = p_name and user_id = p_user and at > now() - make_interval(secs => p_seconds);
    if n >= p_limit then return false; end if;
    insert into public.rate_hits (name, user_id) values (p_name, p_user);
    return true;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.rate_limit_hit(text, uuid, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, uuid, int, int) to service_role;

-- 2. Scores and answers are written by the server only; patients can read but never write or delete them.
--    (Account deletion still erases everything through the cascade.)
revoke insert, update, delete on public.therapy_sessions, public.session_utterances from authenticated;

-- 3. Wrong link-code guesses are counted; 5 misses in 15 minutes lock the clinician out for the rest of the window.
--    The function returns false instead of raising, because a raised error would roll the failure record back.
create table if not exists public.link_attempts (
    clinician_id uuid not null,
    at timestamptz not null default now()
);
create index if not exists idx_link_attempts on public.link_attempts (clinician_id, at);
alter table public.link_attempts enable row level security;
revoke all on public.link_attempts from anon, authenticated;

drop function if exists public.redeem_link_code(text);
create function public.redeem_link_code(code text)
returns boolean as $$
declare
    pid uuid;
begin
    if not exists (select 1 from public.clinicians where user_id = auth.uid() and verified) then
        return false;
    end if;
    if (select count(*) from public.link_attempts
        where clinician_id = auth.uid() and at > now() - interval '15 minutes') >= 5 then
        return false;
    end if;
    update public.link_codes set used_at = now()
    where code_hash = encode(sha256(convert_to(upper(trim(code)), 'utf8')), 'hex')
      and used_at is null and expires_at > now()
    returning patient_id into pid;
    if pid is null then
        insert into public.link_attempts (clinician_id) values (auth.uid());
        return false;
    end if;
    insert into public.clinician_access (clinician_id, patient_id)
    values (auth.uid(), pid)
    on conflict (clinician_id, patient_id) do update set revoked_at = null, granted_at = now();
    return true;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.redeem_link_code(text) from public, anon;
grant execute on function public.redeem_link_code(text) to authenticated;

-- 4. Every change to a clinician's verified flag is recorded (who, when, from what to what).
create table if not exists public.clinician_audit (
    id bigserial primary key,
    clinician_id uuid not null,
    old_verified boolean,
    new_verified boolean,
    changed_by text not null,
    at timestamptz not null default now()
);
alter table public.clinician_audit enable row level security;
revoke all on public.clinician_audit from anon, authenticated;

create or replace function public.audit_clinician_verification()
returns trigger as $$
begin
    if tg_op = 'INSERT' then
        insert into public.clinician_audit (clinician_id, old_verified, new_verified, changed_by)
        values (new.user_id, null, new.verified, coalesce(auth.uid()::text, session_user));
    elsif new.verified is distinct from old.verified then
        insert into public.clinician_audit (clinician_id, old_verified, new_verified, changed_by)
        values (new.user_id, old.verified, new.verified, coalesce(auth.uid()::text, session_user));
    end if;
    return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trigger_audit_clinician_verification on public.clinicians;
create trigger trigger_audit_clinician_verification
after insert or update of verified on public.clinicians
for each row execute function public.audit_clinician_verification();
