-- Automatically remove audit logs older than one year.
create or replace function public.purge_old_audit_logs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.audit_logs
  where created_at < now() - interval '1 year';
$$;

revoke all on function public.purge_old_audit_logs() from public;
grant execute on function public.purge_old_audit_logs() to service_role;

-- Clean existing data immediately during migration.
select public.purge_old_audit_logs();

-- Supabase pg_cron runs the cleanup every day at 02:17 UTC.
create extension if not exists pg_cron with schema extensions;
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-old-audit-logs';
select cron.schedule('purge-old-audit-logs', '17 2 * * *', $$select public.purge_old_audit_logs();$$);
