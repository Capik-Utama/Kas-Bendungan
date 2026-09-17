-- Anonymous guest users do not have a public.profiles row. Store their actor_id as NULL
-- so login/logout activity can still be recorded without violating the foreign key.
create or replace function public.log_activity(p_category text, p_action text, p_description text, p_entity text default null, p_entity_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(actor_id, category, action, description, entity, entity_id)
  values (
    case when exists (select 1 from public.profiles where id = auth.uid()) then auth.uid() else null end,
    left(trim(p_category), 80),
    left(trim(p_action), 80),
    left(trim(p_description), 500),
    left(nullif(trim(p_entity), ''), 120),
    left(nullif(trim(p_entity_id), ''), 120)
  );
end;
$$;
