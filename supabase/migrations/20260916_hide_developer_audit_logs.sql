-- Developers can see every audit event.
-- Other staff can see non-developer events, but never developer events.
create or replace function public.is_developer_actor(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_actor_id and role = 'developer'
  );
$$;
revoke all on function public.is_developer_actor(uuid) from public;
grant execute on function public.is_developer_actor(uuid) to authenticated;

drop policy if exists "staff read audit logs" on public.audit_logs;
create policy "staff read audit logs"
on public.audit_logs
for select to authenticated
using (
  public.current_user_role() in ('developer', 'ketua', 'bendahara')
  and (
    public.current_user_role() = 'developer'
    or not public.is_developer_actor(actor_id)
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
