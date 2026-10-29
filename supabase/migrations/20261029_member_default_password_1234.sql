-- Pastikan seluruh akun anggota dapat masuk memakai sandi default 1234.
-- Akun pengelola tidak diubah oleh migrasi ini.

create or replace function public.provision_warga_account(p_warga_id bigint)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  warga_row public.warga%rowtype;
  existing_id uuid;
  new_id uuid;
  base_username text;
  candidate text;
  suffix integer := 0;
begin
  select * into warga_row from public.warga where id = p_warga_id;
  if not found then return null; end if;

  select id into existing_id from public.profiles where warga_id = p_warga_id;
  if existing_id is not null then
    update public.profiles
    set display_name = warga_row.nama,
        role = 'anggota',
        nik_ktp = warga_row.nik_ktp,
        nik_kk = warga_row.nik_kk,
        nomor_hp = warga_row.nomor_telepon
    where id = existing_id;
    update auth.users
    set encrypted_password = crypt('1234', gen_salt('bf')),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('display_name', warga_row.nama, 'warga_id', p_warga_id),
        updated_at = now()
    where id = existing_id;
    return existing_id;
  end if;

  base_username := trim(both '.' from regexp_replace(lower(trim(warga_row.nama)), '[^a-z0-9]+', '.', 'g'));
  if base_username = '' then base_username := 'warga'; end if;
  candidate := base_username;
  while exists (select 1 from public.profiles where lower(username) = candidate)
     or exists (select 1 from auth.users where lower(email) = candidate || '@kas-bendungan.id') loop
    suffix := suffix + 1;
    candidate := base_username || '.' || suffix::text;
  end loop;

  new_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone, phone_change, phone_change_token,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    candidate || '@kas-bendungan.id', crypt('1234', gen_salt('bf')), now(),
    '', '', '', '', '', null, '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', candidate, 'display_name', warga_row.nama, 'warga_id', p_warga_id),
    now(), now()
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (new_id::text, new_id, jsonb_build_object('sub', new_id::text, 'email', candidate || '@kas-bendungan.id'), 'email', now(), now());
  insert into public.profiles (id, username, display_name, role, nik_ktp, nik_kk, nomor_hp, warga_id)
  values (new_id, candidate, warga_row.nama, 'anggota', warga_row.nik_ktp, warga_row.nik_kk, warga_row.nomor_telepon, p_warga_id);
  insert into public.profile_kelompok (profile_id, kelompok_id)
  select new_id, wg.kelompok_id from public.warga_kelompok wg where wg.warga_id = p_warga_id
  on conflict do nothing;
  return new_id;
end;
$$;

revoke all on function public.provision_warga_account(bigint) from public;
grant execute on function public.provision_warga_account(bigint) to authenticated;

-- Reset hanya akun yang benar-benar berperan sebagai anggota.
with member_auth_ids as (
  select u.id
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.role = 'anggota'
  order by u.id
  limit 10000
)
update auth.users u
set encrypted_password = crypt('1234', gen_salt('bf')),
    updated_at = now()
from member_auth_ids m
where u.id = m.id;
