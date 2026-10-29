-- Rename kartu kelompok harus rename baris kelompok yang sama,
-- bukan membuat kelompok baru yang kehilangan relasi anggota.
create or replace function public.sync_root_card_to_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  group_id bigint;
  creator_warga_id bigint;
begin
  if new.parent_id is null and nullif(trim(new.nama), '') is not null then
    if tg_op = 'UPDATE'
      and old.parent_id is null
      and nullif(trim(old.nama), '') is not null
      and trim(old.nama) <> trim(new.nama) then
      update public.kelompok
      set nama = trim(new.nama)
      where nama = trim(old.nama)
        and not exists (select 1 from public.kelompok where nama = trim(new.nama));
    end if;

    insert into public.kelompok (nama)
    values (trim(new.nama))
    on conflict (nama) do nothing;

    select id into group_id
    from public.kelompok
    where nama = trim(new.nama)
    limit 1;

    if auth.uid() is not null and group_id is not null then
      insert into public.profile_kelompok (profile_id, kelompok_id)
      values (auth.uid(), group_id)
      on conflict (profile_id, kelompok_id) do nothing;

      select warga_id into creator_warga_id
      from public.profiles
      where id = auth.uid()
      limit 1;

      if creator_warga_id is not null then
        insert into public.warga_kelompok (warga_id, kelompok_id)
        values (creator_warga_id, group_id)
        on conflict (warga_id, kelompok_id) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_root_card_to_group on public.kartu_kas;
create trigger sync_root_card_to_group
after insert or update of nama, parent_id on public.kartu_kas
for each row execute function public.sync_root_card_to_group();

-- Satukan data yang terlanjur terpisah saat Percobaan diubah menjadi KEL1.
with target as (
  select old_group.id as old_id, new_group.id as new_id
  from public.kelompok old_group
  join public.kelompok new_group on new_group.nama = 'KEL1'
  where old_group.nama = 'Percobaan'
  limit 1
)
insert into public.profile_kelompok (profile_id, kelompok_id)
select pk.profile_id, target.new_id
from public.profile_kelompok pk
join target on target.old_id = pk.kelompok_id
limit 1000
on conflict (profile_id, kelompok_id) do nothing;

with target as (
  select old_group.id as old_id, new_group.id as new_id
  from public.kelompok old_group
  join public.kelompok new_group on new_group.nama = 'KEL1'
  where old_group.nama = 'Percobaan'
  limit 1
)
insert into public.warga_kelompok (warga_id, kelompok_id)
select wg.warga_id, target.new_id
from public.warga_kelompok wg
join target on target.old_id = wg.kelompok_id
limit 1000
on conflict (warga_id, kelompok_id) do nothing;

with target as (
  select old_group.id as old_id, new_group.id as new_id
  from public.kelompok old_group
  join public.kelompok new_group on new_group.nama = 'KEL1'
  where old_group.nama = 'Percobaan'
  limit 1
)
update public.pengeluaran e
set tujuan_kelompok_id = target.new_id
from target
where e.tujuan_kelompok_id = target.old_id;

with target as (
  select old_group.id as old_id
  from public.kelompok old_group
  join public.kelompok new_group on new_group.nama = 'KEL1'
  where old_group.nama = 'Percobaan'
  limit 1
)
delete from public.kelompok old_group
using target
where old_group.id = target.old_id;
