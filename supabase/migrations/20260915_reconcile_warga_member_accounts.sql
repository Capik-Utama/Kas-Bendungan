-- Reconcile every warga with exactly one linked anggota account.
do $$
declare
  w record;
  member_profile uuid;
begin
  for w in select id, nama, nik_ktp, nik_kk, nomor_telepon from public.warga order by id loop
    select id into member_profile
    from public.profiles
    where warga_id = w.id and role = 'anggota'
    limit 1;
    if member_profile is null then
      member_profile := public.provision_warga_account(w.id);
    end if;
    update public.profiles
    set display_name = w.nama, role = 'anggota', nik_ktp = w.nik_ktp,
        nik_kk = w.nik_kk, nomor_hp = w.nomor_telepon
    where id = member_profile;
    update auth.users
    set encrypted_password = crypt('12345678', gen_salt('bf')),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object('display_name', w.nama, 'warga_id', w.id),
        updated_at = now()
    where id = member_profile;
    delete from public.profile_kelompok where profile_id = member_profile;
    insert into public.profile_kelompok (profile_id, kelompok_id)
    select member_profile, wg.kelompok_id
    from public.warga_kelompok wg
    where wg.warga_id = w.id
    on conflict do nothing;
  end loop;
end;
$$;
