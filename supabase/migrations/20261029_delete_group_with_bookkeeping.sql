CREATE OR REPLACE FUNCTION public.delete_group_with_bookkeeping(p_group_card_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  group_name text;
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
