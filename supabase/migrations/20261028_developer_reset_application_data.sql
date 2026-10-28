create or replace function public.reset_application_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  deleted_members integer := 0;
  deleted_dues integer := 0;
  deleted_accounts integer := 0;
begin
  perform 1
  from public.profiles
  where id = auth.uid()
    and role = 'developer'
  for update;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'Hanya developer yang dapat mereset aplikasi';
  end if;

  delete from public.iuran;
  get diagnostics deleted_dues = row_count;

  delete from auth.users as target_user
  where target_user.id <> auth.uid()
    and not exists (
      select 1
      from public.profiles as target_profile
      where target_profile.id = target_user.id
        and target_profile.role = 'developer'
    );
  get diagnostics deleted_accounts = row_count;

  delete from public.warga;
  get diagnostics deleted_members = row_count;

  return jsonb_build_object(
    'anggota', deleted_members,
    'iuran', deleted_dues,
    'akun', deleted_accounts
  );
end;
$function$;

revoke all on function public.reset_application_data() from public, anon;
grant execute on function public.reset_application_data() to authenticated;
