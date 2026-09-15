-- Clear warga/member data while preserving tables, groups, cards, and staff accounts.
do $$
declare
  member_ids uuid[];
begin
  select coalesce(array_agg(id), '{}'::uuid[])
  into member_ids
  from public.profiles
  where role = 'anggota' or warga_id is not null;

  delete from public.iuran
  where warga_id in (select id from public.warga);

  if coalesce(array_length(member_ids, 1), 0) > 0 then
    delete from auth.users where id = any(member_ids);
  end if;

  delete from public.warga;
end;
$$;
