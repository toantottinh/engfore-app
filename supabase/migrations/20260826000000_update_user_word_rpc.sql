-- EngFore - Migration: RPC cho user sửa từ trong vocabulary của chính mình
--
-- Lý do: Với RLS hiện tại, user thường (authenticated) KHÔNG được UPDATE trực
-- tiếp bảng word_senses / words (chỉ admin mới được). Flow "bấm vào từ → mở
-- modal chỉnh sửa → lưu" cần cho phép user sửa chính từ họ đang sở hữu trong
-- user_vocabulary. Hàm này là SECURITY DEFINER -> chạy với quyền owner, nhưng
-- BẮT BUỘC kiểm tra quyền sở hữu (user phải có dòng user_vocabulary trỏ tới
-- sense đó) trước khi UPDATE -> KHÔNG bypass RLS, không cho sửa từ của người khác.
CREATE OR REPLACE FUNCTION public.update_user_word(
  p_sense_id uuid,
  p_word_id uuid DEFAULT NULL,
  p_word_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owned   boolean;
  v_word_id uuid;
BEGIN
  -- 1) Ownership: auth.uid() must own (user_vocabulary) the exact sense.
  SELECT EXISTS (
    SELECT 1 FROM public.user_vocabulary
    WHERE user_id = auth.uid() AND word_sense_id = p_sense_id
  ) INTO v_owned;

  IF NOT v_owned THEN
    RAISE EXCEPTION 'Bạn chỉ có thể sửa từ nằm trong vocabulary của mình.';
  END IF;

  -- 2) Derive THE canonical word_id FROM the owned sense. NEVER from client.
  SELECT word_id INTO v_word_id
    FROM public.word_senses
   WHERE id = p_sense_id;

  -- Defense-in-depth: if the client sends p_word_id that does NOT match the
  -- word linked to the owned sense, refuse loudly (anti cross-id tampering).
  IF p_word_id IS NOT NULL AND p_word_id <> v_word_id THEN
    RAISE EXCEPTION 'Không hoà hợp với từ được chọn.';
  END IF;

  UPDATE public.word_senses
  SET
    word_type   = CASE
                    WHEN nullif(coalesce((p_word_data->>'word_type')::text, ''), '') IS NULL
                      THEN word_type
                    ELSE (p_word_data->>'word_type')::word_type
                  END,
    meaning     = coalesce(nullif((p_word_data->>'meaning')::text, ''), meaning),
    description = nullif((p_word_data->>'memory_clue')::text, ''),
    example     = nullif((p_word_data->>'example')::text, '')
  WHERE id = p_sense_id;

  -- 4) Update WORDS linked to the owned sense (never a client-chosen word).
  IF v_word_id IS NOT NULL THEN
    UPDATE public.words
    SET
      word       = coalesce(nullif((p_word_data->>'word')::text, ''), word),
      ipa        = nullif((p_word_data->>'ipa')::text, ''),
      cefr_level = CASE
                     WHEN nullif(coalesce((p_word_data->>'cefr_level')::text, ''), '') IS NULL
                       THEN cefr_level
                     ELSE (p_word_data->>'cefr_level')::cefr_level
                   END
    WHERE id = v_word_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_word(uuid, uuid, jsonb) TO authenticated;
