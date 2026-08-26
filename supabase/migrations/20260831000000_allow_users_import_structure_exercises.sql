-- ============================================================
-- EngFore — Cho phép USER THƯỜNG import structure exercises
--
-- Bối cảnh kiến trúc (KHÔNG đổi):
--   * structures / structure_examples : global knowledge, admin-managed
--     (RLS giữ nguyên — user vẫn KHÔNG tự tạo/sửa/xóa cấu trúc).
--   * structure_exercises            : shared practice bank. Trước đây chỉ
--     admin ghi được; giờ mở cho mọi authenticated user để TỰ SOẠN/NHẬP bài
--     tập cho các cấu trúc đã có (learning content, append-only).
--   * user_structures                : per-user SRS, owner-only (giữ nguyên).
--
-- Thay đổi:
--   1) RLS: thêm policy INSERT trên structure_exercises cho authenticated.
--      (SELECT sẵn có; DELETE/UPDATE vẫn admin-only -> không ai xóa bài của
--       người khác.)
--   2) RPC import_structure_exercises: nới guard từ admin-only thành
--      "authenticated" (validation từng row GIỮ NGUYÊN).
--
-- Idempotency: DROP POLICY IF EXISTS + CREATE OR REPLACE FUNCTION.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) RLS — authenticated được INSERT vào shared exercise bank
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can create structure exercises."
  ON public.structure_exercises;

CREATE POLICY "Authenticated users can create structure exercises."
  ON public.structure_exercises FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- 2) RPC import_structure_exercises — guard: authenticated
--    (body validation GIỮ NGUYÊN từ migration 20260830010000)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.import_structure_exercises(jsonb);

CREATE OR REPLACE FUNCTION public.import_structure_exercises(
  p_rows jsonb
)
RETURNS TABLE(created int, errored int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        jsonb;
  v_structure   uuid;
  v_pattern     text;
  v_type        text;
  v_question    text;
  v_answer      text;
  v_options     jsonb;
  v_explanation text;
  v_created     int := 0;
  v_errored     int := 0;
BEGIN
  -- Mọi user đã đăng nhập đều được nhập bài tập (authoring learning content);
  -- anonymous bị chặn. Admin tất nhiên vẫn qua được.
  IF auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Only signed-in users can import structure exercises.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_pattern := trim(coalesce(v_item->>'pattern', ''));
    IF v_pattern = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    -- Structure must already exist (Knowledge import runs first).
    SELECT id INTO v_structure
    FROM public.structures
    WHERE lower(trim(pattern)) = lower(v_pattern);
    IF v_structure IS NULL THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_type := lower(trim(coalesce(v_item->>'type', '')));
    IF v_type NOT IN ('multiple_choice', 'fill_blank', 'translation',
                      'correction', 'rearrange', 'production') THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_question := trim(coalesce(v_item->>'question', ''));
    IF v_question = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_answer := trim(coalesce(v_item->>'answer', ''));
    IF v_type <> 'production' AND v_answer = '' THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    -- Options: coerce anything that is not a JSONB array to '[]'.
    v_options := v_item->'options';
    IF v_options IS NULL OR jsonb_typeof(v_options) <> 'array' THEN
      v_options := '[]'::jsonb;
    END IF;

    IF v_type = 'multiple_choice' AND jsonb_array_length(v_options) < 2 THEN
      v_errored := v_errored + 1;
      CONTINUE;
    END IF;

    v_explanation := nullif(trim(coalesce(v_item->>'explanation', '')), '');

    INSERT INTO public.structure_exercises
      (structure_id, type, question, answer, options, explanation)
    VALUES
      (v_structure, v_type, v_question, v_answer, v_options, v_explanation);
    v_created := v_created + 1;
  END LOOP;

  RETURN QUERY SELECT v_created, v_errored;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_structure_exercises(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_structure_exercises(jsonb) TO service_role;

COMMIT;