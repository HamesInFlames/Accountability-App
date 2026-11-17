-- Supabase-only pieces: the private proof-photo bucket and live updates.
-- Not covered by supabase/tests (which runs against plain Postgres); verify on a real project.

insert into storage.buckets (id, name, public) values ('proofs', 'proofs', false)
on conflict (id) do nothing;

-- Object path: <group_id>/<owner_id>/<file>. Proof photos are never public:
-- only current members of the group can read them, and you can only upload into your own folder.
create policy proofs_read on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy proofs_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and public.is_member(((storage.foldername(name))[1])::uuid)
    and (storage.foldername(name))[2] = auth.uid()::text
  );

alter publication supabase_realtime add table
  public.groups, public.memberships, public.tasks, public.checkins,
  public.verifications, public.comments, public.strikes, public.votes;
