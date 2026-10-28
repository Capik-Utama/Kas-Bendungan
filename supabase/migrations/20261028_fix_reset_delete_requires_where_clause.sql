create or replace function public.reset_application_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  deleted_members integer := 0;
  deleted_dues integer := 0;
  deleted_expenses integer := 0;
  deleted_accounts integer := 0;
  deleted_orphan_profiles integer := 0;
  deleted_member_groups integer := 0;
  deleted_profile_groups integer := 0;
  deleted_groups integer := 0;
  deleted_cash_cards integer := 0;
  deleted_audit_logs integer := 0;
  preserved_developer_accounts integer := 0;
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

  select count(*)::integer
  into preserved_developer_accounts
  from public.profiles
  where role = 'developer';

  delete from public.iuran where id is not null;
  get diagnostics deleted_dues = row_count;

  delete from public.pengeluaran where id is not null;
  get diagnostics deleted_expenses = row_count;

  delete from public.warga_kelompok
  where warga_id is not null and kelompok_id is not null;
  get diagnostics deleted_member_groups = row_count;

  delete from public.profile_kelompok
  where profile_id is not null and kelompok_id is not null;
  get diagnostics deleted_profile_groups = row_count;

  delete from auth.users as target_user
  where target_user.id <> auth.uid()
    and not exists (
      select 1
      from public.profiles as target_profile
      where target_profile.id = target_user.id
        and target_profile.role = 'developer'
    );
  get diagnostics deleted_accounts = row_count;

  delete from public.profiles
  where role <> 'developer';
  get diagnostics deleted_orphan_profiles = row_count;

  delete from public.warga where id is not null;
  get diagnostics deleted_members = row_count;

  delete from public.kartu_kas where id is not null;
  get diagnostics deleted_cash_cards = row_count;

  delete from public.kelompok where id is not null;
  get diagnostics deleted_groups = row_count;

  -- Deletion triggers may have written audit rows during this transaction.
  delete from public.audit_logs where id is not null;
  get diagnostics deleted_audit_logs = row_count;

  return jsonb_build_object(
    'anggota', deleted_members,
    'iuran', deleted_dues,
    'pengeluaran', deleted_expenses,
    'akun', deleted_accounts + deleted_orphan_profiles,
    'developer', preserved_developer_accounts,
    'warga_kelompok', deleted_member_groups,
    'profile_kelompok', deleted_profile_groups,
    'kelompok', deleted_groups,
    'kartu_kas', deleted_cash_cards,
    'audit_logs', deleted_audit_logs
  );
end;
$function$;

revoke all on function public.reset_application_data() from public, anon;
grant execute on function public.reset_application_data() to authenticated;
