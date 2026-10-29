-- Satu nama anggota = satu baris warga = satu akun login.

with keep_warga as (
  select distinct on (lower(trim(w.nama))) w.id, lower(trim(w.nama)) as name_key
  from public.warga w
  order by lower(trim(w.nama)),
    (exists (select 1 from public.warga_kelompok wg where wg.warga_id = w.id)) desc,
    (exists (select 1 from public.iuran i where i.warga_id = w.id)) desc,
    w.id
), duplicate_accounts as (
  select p.id
  from public.profiles p
  left join public.warga w on w.id = p.warga_id
  join keep_warga kw on kw.name_key = lower(trim(coalesce(w.nama, p.display_name)))
  where p.role = 'anggota'
    and ((p.warga_id is not null and p.warga_id <> kw.id)
      or (p.warga_id is null and exists (select 1 from public.profiles linked where linked.role = 'anggota' and linked.warga_id = kw.id)))
)
delete from auth.users u using duplicate_accounts d where u.id = d.id;

with keep_warga as (
  select distinct on (lower(trim(w.nama))) w.id, lower(trim(w.nama)) as name_key
  from public.warga w
  order by lower(trim(w.nama)),
    (exists (select 1 from public.warga_kelompok wg where wg.warga_id = w.id)) desc,
    (exists (select 1 from public.iuran i where i.warga_id = w.id)) desc,
    w.id
)
delete from public.warga w
where exists (select 1 from keep_warga kw where kw.name_key = lower(trim(w.nama)) and kw.id <> w.id)
  and not exists (select 1 from public.warga_kelompok wg where wg.warga_id = w.id)
  and not exists (select 1 from public.iuran i where i.warga_id = w.id);

update auth.users u
set email = 'login-name-cleanup-' || replace(u.id::text, '-', '') || '@kas-bendungan.invalid', updated_at = now()
from public.profiles p where p.id = u.id and p.role = 'anggota';

update public.profiles p
set username = trim(w.nama), display_name = trim(w.nama), nik_ktp = w.nik_ktp, nik_kk = w.nik_kk, nomor_hp = w.nomor_telepon
from public.warga w where p.warga_id = w.id and p.role = 'anggota';

update auth.users u
set email = lower(trim(regexp_replace(w.nama, '[^a-zA-Z0-9]+', '.', 'g'))) || '@kas-bendungan.id',
    raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', trim(w.nama), 'display_name', trim(w.nama), 'warga_id', w.id), updated_at = now()
from public.profiles p join public.warga w on w.id = p.warga_id where p.id = u.id and p.role = 'anggota';

update auth.identities i
set identity_data = jsonb_set(coalesce(i.identity_data, '{}'::jsonb), '{email}', to_jsonb(lower(trim(regexp_replace(w.nama, '[^a-zA-Z0-9]+', '.', 'g'))) || '@kas-bendungan.id'), true), updated_at = now()
from public.profiles p join public.warga w on w.id = p.warga_id where i.user_id = p.id and i.provider = 'email' and p.role = 'anggota';

-- Akun warga baru memakai nama warga sebagai username dan password 1234.
create or replace function public.provision_warga_account(p_warga_id bigint)
returns uuid language plpgsql security definer set search_path = public, auth, extensions
as $$
declare warga_row public.warga%rowtype; existing_id uuid; new_id uuid; clean_name text; email_local text;
begin
  select * into warga_row from public.warga where id = p_warga_id;
  if not found then return null; end if;
  clean_name := trim(warga_row.nama); email_local := lower(trim(regexp_replace(clean_name, '[^a-zA-Z0-9]+', '.', 'g')));
  select id into existing_id from public.profiles where warga_id = p_warga_id;
  if existing_id is not null then return existing_id; end if;
  if exists (select 1 from public.profiles where lower(trim(username)) = lower(clean_name)) then raise exception 'Nama anggota sudah digunakan: %', clean_name; end if;
  if exists (select 1 from auth.users where lower(email) = email_local || '@kas-bendungan.id') then raise exception 'Nama login sudah digunakan: %', clean_name; end if;
  new_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone, phone_change, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', email_local || '@kas-bendungan.id', crypt('1234', gen_salt('bf')), now(), '', '', '', '', '', null, '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('username', clean_name, 'display_name', clean_name, 'warga_id', p_warga_id), now(), now());
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values (new_id::text, new_id, jsonb_build_object('sub', new_id::text, 'email', email_local || '@kas-bendungan.id'), 'email', now(), now());
  insert into public.profiles (id, username, display_name, role, nik_ktp, nik_kk, nomor_hp, warga_id) values (new_id, clean_name, clean_name, 'anggota', warga_row.nik_ktp, warga_row.nik_kk, warga_row.nomor_telepon, p_warga_id);
  insert into public.profile_kelompok (profile_id, kelompok_id) select new_id, wg.kelompok_id from public.warga_kelompok wg where wg.warga_id = p_warga_id on conflict do nothing;
  return new_id;
end;
$$;
revoke all on function public.provision_warga_account(bigint) from public;
grant execute on function public.provision_warga_account(bigint) to authenticated;

with member_auth_ids as (select p.id from public.profiles p where p.role = 'anggota' limit 10000)
update auth.users u set encrypted_password = crypt('1234', gen_salt('bf')), updated_at = now() from member_auth_ids m where u.id = m.id;
