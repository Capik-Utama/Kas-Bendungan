-- Hubungkan pembuat kartu kelompok dengan kelompoknya.
-- Ini membuat nama ketua/pembuat tetap tampil walaupun kelompok dibuat
-- sebelum aplikasi melakukan sinkronisasi keanggotaan.
create or replace function public.sync_root_card_to_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  group_id bigint;
begin
  if new.parent_id is null and nullif(trim(new.nama), '') is not null then
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
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_root_card_to_group on public.kartu_kas;
create trigger sync_root_card_to_group
after insert or update of nama, parent_id on public.kartu_kas
for each row execute function public.sync_root_card_to_group();

-- Backfill kelompok yang sudah dibuat dari kartu kas sebelum trigger ini ada.
insert into public.profile_kelompok (profile_id, kelompok_id)
select distinct al.actor_id, k.id
from public.audit_logs al
join public.kartu_kas ck on ck.id::text = al.entity_id
join public.kelompok k on k.nama = ck.nama
join public.profiles p on p.id = al.actor_id
where al.entity = 'kartu_kas'
  and al.action = 'INSERT'
  and ck.parent_id is null
  and ck.kategori = 'Kelompok'
  and al.actor_id is not null
limit 1000
on conflict (profile_id, kelompok_id) do nothing;
