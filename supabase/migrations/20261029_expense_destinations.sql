alter table public.pengeluaran
  add column if not exists jenis_keperluan text not null default 'Kebutuhan kelompok',
  add column if not exists tujuan_kelompok_id bigint references public.kelompok(id) on delete set null,
  add column if not exists tujuan_petugas_id uuid references public.profiles(id) on delete set null;

alter table public.pengeluaran
  drop constraint if exists pengeluaran_jenis_keperluan_check;

alter table public.pengeluaran
  add constraint pengeluaran_jenis_keperluan_check
  check (jenis_keperluan in ('Ke kelompok lain', 'Ke petugas lain', 'Kebutuhan kelompok'));
