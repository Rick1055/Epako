-- Words each patient has confirmed meaning, with counts ({"water": 3}); the repair step snaps a word the recogniser
-- was unsure of to the closest-sounding one (src/vocabulary.py). Covered by the existing own-row policy on patient_profiles.
alter table public.patient_profiles add column if not exists vocabulary jsonb not null default '{}'::jsonb;
