-- Developers can see only their own audit events.
-- Other staff can see non-developer events, but never developer events.
drop policy if exists "staff read audit logs" on public.audit_logs;
create policy "staff read audit logs"
on public.audit_logs
for select to authenticated
using (
  public.current_user_role() in ('developer', 'ketua', 'bendahara')
  and (
    public.current_user_role() = 'developer'
    or not exists (
      select 1 from public.profiles
      where id = audit_logs.actor_id and role = 'developer'
    )
  )
);

-- Normalize legacy authentication descriptions where the actor is known.
update public.audit_logs al
set description = 'Logout oleh ' || p.username
from public.profiles p
where al.actor_id = p.id
  and al.action = 'LOGOUT'
  and al.description = 'Keluar dari aplikasi';

update public.audit_logs
set description = 'Login oleh Tamu'
where action = 'LOGIN_TAMU'
  and description = 'Masuk sebagai tamu';
