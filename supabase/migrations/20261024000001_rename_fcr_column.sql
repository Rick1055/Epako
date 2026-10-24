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
