-- Optional identity/contact fields for developer, ketua, and bendahara profiles.
alter table public.profiles
  add column if not exists nik_ktp text,
  add column if not exists nik_kk text,
  add column if not exists nomor_hp text;

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
  normalized text := lower(trim(p_username));
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
  if normalized = '' or length(p_password) < 8 or trim(coalesce(p_display_name, '')) = '' then
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
  if exists (select 1 from public.profiles where lower(username) = normalized)
     or exists (select 1 from auth.users where lower(email) = normalized || '@kas-bendungan.id') then
    raise exception 'Username sudah digunakan';
  end if;

  new_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone, phone_change, phone_change_token,
    reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    normalized || '@kas-bendungan.id', crypt(p_password, gen_salt('bf')), now(),
    '', '', '', '', '', null, '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', trim(p_username), 'display_name', trim(p_display_name)),
    now(), now()
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', normalized || '@kas-bendungan.id'),
    'email', now(), now());
  insert into public.profiles (id, username, display_name, role, nik_ktp, nik_kk, nomor_hp)
  values (new_id, trim(p_username), trim(p_display_name), p_role, clean_nik_ktp, clean_nik_kk, clean_nomor_hp);
  return new_id;
end;
$$;

revoke all on function public.create_account(text, text, text, public.app_role, text, text, text) from public;
grant execute on function public.create_account(text, text, text, public.app_role, text, text, text) to authenticated;

-- Keep direct edits constrained by the existing role-based profiles policies.
-- Empty values are normalized to NULL by the client before update.
comment on column public.profiles.nik_ktp is 'Optional 16-digit KTP identity number';
comment on column public.profiles.nik_kk is 'Optional 16-digit family card number';
comment on column public.profiles.nomor_hp is 'Optional contact phone number';
