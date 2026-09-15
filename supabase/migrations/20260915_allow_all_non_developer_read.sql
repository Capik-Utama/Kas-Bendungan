drop policy if exists "profiles own or developer read" on public.profiles;
drop policy if exists "profiles_own_or_staff_read" on public.profiles;
create policy "profiles_own_or_staff_read" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_user_role() = 'developer'
  or (role <> 'developer' and public.current_user_role() in ('ketua', 'bendahara', 'anggota'))
);
