-- Keep provisioned anggota accounts aligned with their warga record and groups.
create or replace function public.sync_warga_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set display_name = new.nama,
      nik_ktp = new.nik_ktp,
      nik_kk = new.nik_kk,
      nomor_hp = new.nomor_telepon
  where warga_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_warga_to_profile on public.warga;
create trigger sync_warga_to_profile
after update of nama, nik_ktp, nik_kk, nomor_telepon on public.warga
for each row execute function public.sync_warga_to_profile();

create or replace function public.sync_warga_group_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare linked_profile uuid;
begin
  select id into linked_profile from public.profiles where warga_id = coalesce(new.warga_id, old.warga_id);
  if linked_profile is not null then
    if tg_op = 'DELETE' then
      delete from public.profile_kelompok where profile_id = linked_profile and kelompok_id = old.kelompok_id;
    elsif tg_op = 'UPDATE' then
      delete from public.profile_kelompok where profile_id = linked_profile and kelompok_id = old.kelompok_id;
      insert into public.profile_kelompok (profile_id, kelompok_id) values (linked_profile, new.kelompok_id) on conflict do nothing;
    else
      insert into public.profile_kelompok (profile_id, kelompok_id) values (linked_profile, new.kelompok_id) on conflict do nothing;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_warga_group_to_profile on public.warga_kelompok;
create trigger sync_warga_group_to_profile
after insert or update or delete on public.warga_kelompok
for each row execute function public.sync_warga_group_to_profile();
