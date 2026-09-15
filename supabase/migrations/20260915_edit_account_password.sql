-- Allow staff to change account passwords without exposing or editing display names.
create or replace function public.update_account_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  requester_role public.app_role := public.current_user_role();
  target_role public.app_role;
begin
  if requester_role not in ('developer', 'ketua', 'bendahara') then
    raise exception 'Hanya pengelola akun yang dapat mengubah password';
  end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password minimal 8 karakter';
  end if;
  select role into target_role from public.profiles where id = p_user_id;
  if target_role is null then
    raise exception 'Akun tidak ditemukan';
  end if;
  if requester_role = 'ketua' and target_role = 'developer' then
    raise exception 'Ketua tidak dapat mengubah password developer';
  end if;
  if requester_role = 'bendahara' and target_role not in ('bendahara', 'anggota') then
    raise exception 'Bendahara hanya dapat mengubah password akun bendahara atau anggota';
  end if;
  if requester_role = 'bendahara' and p_user_id <> auth.uid() and target_role <> 'anggota' then
    raise exception 'Bendahara hanya dapat mengubah password anggota lain';
  end if;
  update auth.users
  set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where id = p_user_id;
end;
$$;

revoke all on function public.update_account_password(uuid, text) from public;
grant execute on function public.update_account_password(uuid, text) to authenticated;
