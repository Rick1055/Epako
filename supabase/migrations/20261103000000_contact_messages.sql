-- The Help page's contact form (DESIGN.md, rule 45): messages are written only by the server (POST /api/contact, with
-- the service key) and read only by an administrator in the dashboard. No client can read or write this table.
create table if not exists public.contact_messages (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    topic text not null check (topic in ('sign-in', 'voice', 'data', 'clinician', 'other')),
    name text check (char_length(name) <= 100),
    email text not null check (char_length(email) between 3 and 254),
    message text not null check (char_length(message) between 1 and 4000),
    emailed boolean not null default false
);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;

-- Kept 12 months, then deleted. POST /api/contact runs this before every insert; it can also be scheduled
-- (Supabase: Database > Cron, e.g. daily: select public.purge_old_contact_messages();).
create or replace function public.purge_old_contact_messages()
returns void language sql security definer set search_path = public as
$$ delete from public.contact_messages where created_at < now() - interval '12 months' $$;
revoke all on function public.purge_old_contact_messages() from public, anon, authenticated;
