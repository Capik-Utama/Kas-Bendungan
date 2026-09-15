-- Bendahara can create members and update only members or their own username.
drop policy if exists "staff manage profiles" on public.profiles;
create policy "staff manage profiles" on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'developer'
  or (public.current_user_role() in ('ketua', 'bendahara', 'anggota') and role <> 'developer')
);

drop policy if exists "staff update profiles" on public.profiles;
create policy "staff update profiles" on public.profiles
for update to authenticated
using (
  public.current_user_role() = 'developer'
  or (public.current_user_role() = 'ketua' and role <> 'developer')
  or (public.current_user_role() = 'bendahara' and (role = 'anggota' or id = auth.uid()))
)
with check (
  public.current_user_role() = 'developer'
  or (public.current_user_role() = 'ketua' and role <> 'developer')
  or (public.current_user_role() = 'bendahara' and (role = 'anggota' or (id = auth.uid() and role = 'bendahara')))
);

create policy "staff insert profiles" on public.profiles
for insert to authenticated
with check (public.current_user_role() = 'developer' or (public.current_user_role() = 'ketua' and role <> 'developer') or (public.current_user_role() = 'bendahara' and role = 'anggota'));

create or replace function public.update_own_username(p_username text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare normalized text := lower(trim(p_username));
begin
  if auth.uid() is null or normalized = '' then raise exception 'Username tidak valid'; end if;
  if exists (select 1 from public.profiles where lower(username) = normalized and id <> auth.uid()) then raise exception 'Username sudah digunakan'; end if;
  update auth.users set email = normalized || '@kas-bendungan.id', raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', trim(p_username)), updated_at = now() where id = auth.uid();
  update public.profiles set username = trim(p_username), display_name = trim(p_username) where id = auth.uid();
end; $$;
revoke all on function public.update_own_username(text) from public;
grant execute on function public.update_own_username(text) to authenticated;

create or replace function public.create_account(p_username text, p_display_name text, p_password text, p_role public.app_role)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare new_id uuid; normalized text := lower(trim(p_username)); requester_role public.app_role := public.current_user_role();
begin
  if requester_role not in ('developer', 'ketua', 'bendahara') then raise exception 'Hanya pengelola akun yang dapat membuat akun'; end if;
  if requester_role = 'ketua' and p_role = 'developer' then raise exception 'Ketua hanya dapat membuat akun non-developer'; end if;
  if requester_role = 'bendahara' and p_role <> 'anggota' then raise exception 'Bendahara hanya dapat membuat akun anggota'; end if;
  if normalized = '' or length(p_password) < 8 or trim(p_display_name) = '' then raise exception 'Data akun tidak valid'; end if;
  if exists (select 1 from public.profiles where lower(username) = normalized) or exists (select 1 from auth.users where lower(email) = normalized || '@kas-bendungan.id') then raise exception 'Username sudah digunakan'; end if;
  new_id := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current, phone, phone_change, phone_change_token, reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated', normalized || '@kas-bendungan.id', crypt(p_password, gen_salt('bf')), now(), '', '', '', '', '', null, '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('username', trim(p_username), 'display_name', trim(p_display_name)), now(), now());
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values (new_id::text, new_id, jsonb_build_object('sub', new_id::text, 'email', normalized || '@kas-bendungan.id'), 'email', now(), now());
  insert into public.profiles (id, username, display_name, role) values (new_id, trim(p_username), trim(p_display_name), p_role);
  return new_id;
end; $$;
revoke all on function public.create_account(text,text,text,public.app_role) from public;
grant execute on function public.create_account(text,text,text,public.app_role) to authenticated;
