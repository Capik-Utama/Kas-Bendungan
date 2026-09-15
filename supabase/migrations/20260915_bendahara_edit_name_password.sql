create or replace function public.update_member_credentials(p_user_id uuid, p_display_name text, p_password text default null)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
declare requester_role public.app_role := public.current_user_role(); target_role public.app_role;
begin
  if requester_role <> 'bendahara' then raise exception 'Hanya bendahara yang dapat mengubah nama dan password melalui menu ini'; end if;
  select role into target_role from public.profiles where id = p_user_id;
  if target_role is null or target_role not in ('bendahara', 'anggota') then raise exception 'Bendahara hanya dapat mengubah akun bendahara atau anggota'; end if;
  if p_user_id <> auth.uid() and target_role <> 'anggota' then raise exception 'Bendahara hanya dapat mengubah akun anggota lain'; end if;
  if trim(coalesce(p_display_name, '')) = '' then raise exception 'Nama wajib diisi'; end if;
  if p_password is not null and length(p_password) < 8 then raise exception 'Password minimal 8 karakter'; end if;
  if p_password is null then
    update public.profiles set display_name = trim(p_display_name) where id = p_user_id;
  else
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('display_name', trim(p_display_name)), updated_at = now() where id = p_user_id;
    update public.profiles set display_name = trim(p_display_name) where id = p_user_id;
  end if;
end; $$;
revoke all on function public.update_member_credentials(uuid, text, text) from public;
grant execute on function public.update_member_credentials(uuid, text, text) to authenticated;
