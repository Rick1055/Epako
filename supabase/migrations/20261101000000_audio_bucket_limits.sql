-- Patients upload straight to Storage (after consenting), past the API's size checks, so the bucket itself takes only
-- audio, at most 10 MB a file (the API's per-upload cap). Seen live on 2026-10-26: a 12 MB file and an HTML page got in.
update storage.buckets
set file_size_limit = 10485760, allowed_mime_types = array['audio/*']
where id = 'patient_audio';
