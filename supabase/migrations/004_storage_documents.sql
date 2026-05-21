-- ============================================================
-- Document storage bucket (Evidence Vault)
-- Holds utility bills, compliance reports, deduction forms, etc.
-- Private bucket — downloads are served via short-lived signed URLs.
-- ============================================================

-- 1. Bucket --------------------------------------------------------
-- 10 MB file-size cap matches the limit enforced in the upload UI.
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;

-- 2. Access policies ----------------------------------------------
-- Org-level authorization is enforced in the application layer
-- (assertBuildingAccess runs on every document server action), so these
-- storage policies gate only on authentication. Tightening them to
-- org-scoped checks is a future hardening item.
drop policy if exists "documents_authenticated_select" on storage.objects;
drop policy if exists "documents_authenticated_insert" on storage.objects;
drop policy if exists "documents_authenticated_update" on storage.objects;
drop policy if exists "documents_authenticated_delete" on storage.objects;

create policy "documents_authenticated_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents');

create policy "documents_authenticated_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

create policy "documents_authenticated_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents');

create policy "documents_authenticated_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents');
