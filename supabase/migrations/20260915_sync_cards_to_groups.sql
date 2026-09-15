-- Every root bookkeeping card is also available as a membership group.
insert into public.kelompok (nama)
select distinct trim(nama)
from public.kartu_kas
where parent_id is null and nullif(trim(nama), '') is not null
on conflict (nama) do nothing;

create or replace function public.sync_root_card_to_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is null and nullif(trim(new.nama), '') is not null then
    insert into public.kelompok (nama) values (trim(new.nama)) on conflict (nama) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_root_card_to_group on public.kartu_kas;
create trigger sync_root_card_to_group
after insert or update of nama, parent_id on public.kartu_kas
for each row execute function public.sync_root_card_to_group();
