-- All authenticated roles can read non-developer profiles; only the permitted level can update.
drop policy if exists "staff manage profiles" on public.profiles;
create policy "staff manage profiles" on public.profiles
for all to authenticated
using (
  public.current_user_role() = 'developer'
  or (public.current_user_role() = 'ketua' and role <> 'developer')
  or (public.current_user_role() = 'bendahara' and role = 'anggota')
)
with check (
  public.current_user_role() = 'developer'
  or (public.current_user_role() = 'ketua' and role <> 'developer')
  or (public.current_user_role() = 'bendahara' and role = 'anggota')
);
