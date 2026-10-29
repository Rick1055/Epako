drop view if exists public.patient_daily_progress;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'biomarker_logs'
      and column_name = 'formant_centralization_ratio'
  ) then
    alter table public.biomarker_logs
      rename column formant_centralization_ratio to formant_compression_index;
  end if;
end $$;

alter table public.biomarker_logs
  alter column formant_compression_index type numeric(14,3);

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
