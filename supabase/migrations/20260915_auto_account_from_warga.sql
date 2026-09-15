-- Every warga record has a matching read-only anggota account.
alter table public.profiles add column if not exists warga_id bigint references public.warga(id) on delete set null;
create unique index if not exists profiles_warga_id_key on public.profiles(warga_id) where warga_id is not null;

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
    update public.profiles set display_name = warga_row.nama, role = 'anggota' where id = existing_id;
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
    candidate || '@kas-bendungan.id', crypt('12345678', gen_salt('bf')), now(),
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

-- Provision all existing warga records.
do $$
declare warga_row record;
begin
  for warga_row in select id from public.warga order by id loop
    perform public.provision_warga_account(warga_row.id);
  end loop;
end;
$$;

create or replace function public.provision_account_after_warga_insert()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  perform public.provision_warga_account(new.id);
  return new;
end;
$$;

drop trigger if exists provision_account_after_warga_insert on public.warga;
create trigger provision_account_after_warga_insert
after insert on public.warga
for each row execute function public.provision_account_after_warga_insert();

create or replace function public.update_own_password(p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  if auth.uid() is null then raise exception 'Anda belum login'; end if;
  if p_password is null or length(p_password) < 8 then raise exception 'Password minimal 8 karakter'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = auth.uid();
end;
$$;
revoke all on function public.update_own_password(text) from public;
grant execute on function public.update_own_password(text) to authenticated;
