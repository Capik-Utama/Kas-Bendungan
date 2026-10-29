CREATE OR REPLACE FUNCTION public.delete_group_with_bookkeeping(p_group_card_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  group_name text;
  group_id bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Hanya staf terautentikasi yang dapat menghapus kelompok.'
      USING ERRCODE = '42501';
  END IF;

  SELECT nama
  INTO group_name
  FROM public.kartu_kas
  WHERE id = p_group_card_id
    AND parent_id IS NULL
    AND kategori = 'Kelompok'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kartu kelompok tidak ditemukan.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id
  INTO group_id
  FROM public.kelompok
  WHERE nama = trim(group_name)
  FOR UPDATE;

  -- Keep an outbound group transfer so the receiving group's balance survives
  -- deletion of the source group; detach only the deleted source-card link.
  WITH RECURSIVE card_tree(id) AS (
    SELECT p_group_card_id
    UNION ALL
    SELECT child.id
    FROM public.kartu_kas AS child
    JOIN card_tree AS parent ON child.parent_id = parent.id
  )
  UPDATE public.pengeluaran AS row_data
  SET kartu_id = NULL
  WHERE row_data.jenis_keperluan = 'Ke kelompok lain'
    AND row_data.tujuan_kelompok_id IS DISTINCT FROM group_id
    AND row_data.kartu_id IN (SELECT id FROM card_tree);

  -- Keep an inbound transfer as an outgoing movement for its original source
  -- if this group is deleted; clearing the destination prevents orphan credit.
  UPDATE public.pengeluaran AS row_data
  SET tujuan_kelompok_id = NULL
  WHERE group_id IS NOT NULL
    AND row_data.tujuan_kelompok_id = group_id
    AND row_data.kartu_id IS NOT NULL
    AND NOT EXISTS (
      WITH RECURSIVE card_tree(id) AS (
        SELECT p_group_card_id
        UNION ALL
        SELECT child.id
        FROM public.kartu_kas AS child
        JOIN card_tree AS parent ON child.parent_id = parent.id
      )
      SELECT 1 FROM card_tree WHERE id = row_data.kartu_id
    );

  WITH RECURSIVE card_tree(id) AS (
    SELECT p_group_card_id
    UNION ALL
    SELECT child.id
    FROM public.kartu_kas AS child
    JOIN card_tree AS parent ON child.parent_id = parent.id
  )
  DELETE FROM public.iuran AS row_data
  USING card_tree
  WHERE row_data.kartu_id = card_tree.id;

  WITH RECURSIVE card_tree(id) AS (
    SELECT p_group_card_id
    UNION ALL
    SELECT child.id
    FROM public.kartu_kas AS child
    JOIN card_tree AS parent ON child.parent_id = parent.id
  )
  DELETE FROM public.pengeluaran AS row_data
  USING card_tree
  WHERE row_data.kartu_id = card_tree.id;

  DELETE FROM public.kartu_kas
  WHERE id = p_group_card_id;

  DELETE FROM public.kelompok AS membership_group
  WHERE membership_group.nama = trim(group_name)
    AND NOT EXISTS (
      SELECT 1
      FROM public.kartu_kas AS remaining_group
      WHERE remaining_group.parent_id IS NULL
        AND remaining_group.kategori = 'Kelompok'
        AND trim(remaining_group.nama) = trim(group_name)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_group_with_bookkeeping(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_group_with_bookkeeping(bigint) TO authenticated;
