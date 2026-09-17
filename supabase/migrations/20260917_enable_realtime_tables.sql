-- Enable Realtime for every application table so all logged-in clients stay synchronized.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles','warga','kelompok','warga_kelompok','profile_kelompok','iuran','pengeluaran','kartu_kas','audit_logs'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    exception when duplicate_object then
      null;
    end;
  end loop;
end;
$$;
