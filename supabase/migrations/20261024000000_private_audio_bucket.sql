update storage.buckets set public = false where id = 'patient_audio';

drop policy if exists "Allow authenticated audio deletes" on storage.objects;
drop policy if exists "Allow authenticated audio updates" on storage.objects;
drop policy if exists "Allow authenticated audio uploads" on storage.objects;
drop policy if exists "Allow read access to audio" on storage.objects;
drop policy if exists "Owners read own audio" on storage.objects;
drop policy if exists "Owners upload own audio" on storage.objects;
drop policy if exists "Owners update own audio" on storage.objects;
drop policy if exists "Owners delete own audio" on storage.objects;

create policy "Owners read own audio"
on storage.objects for select
to authenticated
using (bucket_id = 'patient_audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owners upload own audio"
on storage.objects for insert
to authenticated
with check (bucket_id = 'patient_audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owners update own audio"
on storage.objects for update
to authenticated
using (bucket_id = 'patient_audio' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'patient_audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owners delete own audio"
on storage.objects for delete
to authenticated
using (bucket_id = 'patient_audio' and (storage.foldername(name))[1] = auth.uid()::text);
