-- Use display names as login names; map spaces to dots only in synthetic auth emails.
-- Passwords and application roles are intentionally unchanged.
create temporary table name_login_map on commit drop as
with canonical as (
  select p.id, p.display_name, p.username,
    lower(regexp_replace(trim(p.display_name), '\s+', '.', 'g')) as base_alias
  from public.profiles p
  join auth.users u on u.id = p.id
), ranked as (
  select *, count(*) over (partition by base_alias) as alias_count,
    row_number() over (partition by base_alias order by username, id) as alias_number
  from canonical
)
select id,
  case when alias_count > 1 then trim(display_name) || ' ' || alias_number::text else trim(display_name) end as new_username,
  lower(regexp_replace(trim(case when alias_count > 1 then display_name || ' ' || alias_number::text else display_name end), '\s+', '.', 'g')) as new_email_local
from ranked
limit 1000;

do $$ begin
  if exists (select 1 from name_login_map group by new_email_local having count(*) > 1 limit 1) then
    raise exception 'Nama tampilan masih menghasilkan alias login yang duplikat';
  end if;
  if exists (
    select 1 from name_login_map m join auth.users u on lower(u.email) = m.new_email_local || '@kas-bendungan.id'
    where u.id <> m.id and not exists (select 1 from public.profiles p where p.id = u.id limit 1)
    limit 1
  ) then
    raise exception 'Alias login bertabrakan dengan akun autentikasi di luar profil aplikasi';
  end if;
end $$;

-- Stage current identifiers first because some target aliases are in use by another profile.
update auth.users u
set email = 'login-migration-' || replace(u.id::text, '-', '') || '@kas-bendungan.invalid',
    updated_at = now()
from name_login_map m
where u.id = m.id;

update public.profiles p
set username = '__name_login_migration__' || replace(p.id::text, '-', '')
from name_login_map m
where p.id = m.id;

update public.profiles p
set username = m.new_username
from name_login_map m
where p.id = m.id;

update auth.users u
set email = m.new_email_local || '@kas-bendungan.id',
    raw_user_meta_data = jsonb_set(coalesce(u.raw_user_meta_data, '{}'::jsonb), '{username}', to_jsonb(m.new_username), true),
    updated_at = now()
from name_login_map m
where u.id = m.id;

update auth.identities i
set identity_data = jsonb_set(coalesce(i.identity_data, '{}'::jsonb), '{email}', to_jsonb(m.new_email_local || '@kas-bendungan.id'), true),
    updated_at = now()
from name_login_map m
where i.user_id = m.id and i.provider = 'email';

create or replace function public.create_account(
  p_username text,
  p_display_name text,
  p_password text,
  p_role public.app_role,
  p_nik_ktp text default null,
  p_nik_kk text default null,
  p_nomor_hp text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  new_id uuid;
  requested_username text := trim(coalesce(p_username, ''));
  assigned_username text;
  email_local text;
  base_alias text;
  duplicate_count integer := 0;
  clean_nik_ktp text := nullif(trim(coalesce(p_nik_ktp, '')), '');
  clean_nik_kk text := nullif(trim(coalesce(p_nik_kk, '')), '');
  clean_nomor_hp text := nullif(trim(coalesce(p_nomor_hp, '')), '');
  requester_role public.app_role := public.current_user_role();
begin
  if requester_role not in ('developer', 'ketua', 'bendahara') then
    raise exception 'Hanya pengelola akun yang dapat membuat akun';
  end if;
  if requester_role = 'ketua' and p_role = 'developer' then
    raise exception 'Ketua hanya dapat membuat akun non-developer';
  end if;
  if requester_role = 'bendahara' and p_role <> 'anggota' then
    raise exception 'Bendahara hanya dapat membuat akun anggota';
  end if;
  if requested_username = ''
    or (length(p_password) < 8 and not (p_role = 'anggota' and p_password = '1234'))
    or trim(coalesce(p_display_name, '')) = '' then
    raise exception 'Data akun tidak valid';
  end if;
  if clean_nik_ktp is not null and clean_nik_ktp !~ '^[0-9]{16}$' then
    raise exception 'NIK KTP harus berupa 16 digit';
  end if;
  if clean_nik_kk is not null and clean_nik_kk !~ '^[0-9]{16}$' then
    raise exception 'NIK KK harus berupa 16 digit';
  end if;
  if clean_nomor_hp is not null and clean_nomor_hp !~ '^[0-9+() .-]{8,20}$' then
    raise exception 'Nomor HP tidak valid';
  end if;

  base_alias := lower(regexp_replace(requested_username, '\s+', '.', 'g'));
  select count(*) into duplicate_count
  from public.profiles p
  where lower(regexp_replace(trim(p.display_name), '\s+', '.', 'g')) = base_alias;
  assigned_username := requested_username;
  if duplicate_count > 0 then
    assigned_username := requested_username || ' ' || (duplicate_count + 1)::text;
  end if;
  email_local := lower(regexp_replace(trim(assigned_username), '\s+', '.', 'g'));
  while exists (select 1 from public.profiles p where lower(p.username) = lower(assigned_username))
    or exists (select 1 from auth.users u where lower(u.email) = email_local || '@kas-bendungan.id') loop
    duplicate_count := duplicate_count + 1;
    assigned_username := requested_username || ' ' || (duplicate_count + 1)::text;
    email_local := lower(regexp_replace(trim(assigned_username), '\s+', '.', 'g'));
  end loop;

  new_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone, phone_change, phone_change_token,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    email_local || '@kas-bendungan.id', crypt(p_password, gen_salt('bf')), now(),
    '', '', '', '', '', null, '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', assigned_username, 'display_name', trim(p_display_name)), now(), now()
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', email_local || '@kas-bendungan.id'),
    'email', now(), now());
  insert into public.profiles (id, username, display_name, role, nik_ktp, nik_kk, nomor_hp)
  values (new_id, assigned_username, trim(p_display_name), p_role,
    clean_nik_ktp, clean_nik_kk, clean_nomor_hp);
  return new_id;
end;
$$;
revoke all on function public.create_account(text,text,text,public.app_role,text,text,text) from public;
grant execute on function public.create_account(text,text,text,public.app_role,text,text,text) to authenticated;

create or replace function public.create_account(
  p_username text,
  p_display_name text,
  p_password text,
  p_role public.app_role
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  return public.create_account(p_username, p_display_name, p_password, p_role, null, null, null);
end;
$$;
revoke all on function public.create_account(text,text,text,public.app_role) from public;
grant execute on function public.create_account(text,text,text,public.app_role) to authenticated;

create or replace function public.update_own_username(p_username text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  clean_username text := trim(coalesce(p_username, ''));
  email_local text;
begin
  if auth.uid() is null or clean_username = '' then
    raise exception 'Username tidak valid';
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = lower(clean_username) and p.id <> auth.uid()) then
    raise exception 'Username sudah digunakan';
  end if;
  email_local := lower(regexp_replace(clean_username, '\s+', '.', 'g'));
  if exists (select 1 from auth.users u where lower(u.email) = email_local || '@kas-bendungan.id' and u.id <> auth.uid()) then
    raise exception 'Username sudah digunakan';
  end if;
  update auth.users
  set email = email_local || '@kas-bendungan.id',
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', clean_username),
      updated_at = now()
  where id = auth.uid();
  update auth.identities
  set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(email_local || '@kas-bendungan.id'), true),
      updated_at = now()
  where user_id = auth.uid() and provider = 'email';
  update public.profiles
  set username = clean_username, display_name = clean_username
  where id = auth.uid();
end;
$$;
revoke all on function public.update_own_username(text) from public;
grant execute on function public.update_own_username(text) to authenticated;

drop table name_login_map;
