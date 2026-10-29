-- Semua warga yang tercantum di kelompok adalah akun anggota.
update public.profiles p
set role = 'anggota'
where exists (
  select 1
  from public.warga w
  join public.warga_kelompok wg on wg.warga_id = w.id
  where w.id = p.warga_id
);

with grouped_members as (
  select distinct p.id
  from public.profiles p
  join public.warga w on w.id = p.warga_id
  join public.warga_kelompok wg on wg.warga_id = w.id
  where p.role = 'anggota'
  limit 10000
)
update auth.users u
set encrypted_password = crypt('1234', gen_salt('bf')), updated_at = now()
from grouped_members g
where u.id = g.id;
