-- =====================================================================
-- DATA FIX: architecture sense shows stale description/example
--
-- Bug:
--   Vocabulary library renders the OLD content for `architecture`
--   (description: "architect + ure → kiến trúc", example:
--   "I love modern architecture.") although the intended/current content
--   is the newer Vietnamese explanation.
--
-- Trace result:
--   Vocabulary page -> getUserVocabulary / get_words_in_set_with_progress
--     -> word_senses.description -> memory_clue
--     -> word_senses.example     -> example
--   No frontend cache/transform/fallback is involved. The live source row
--   in the connected Supabase project (yyfllitihktyrvjssyek) was confirmed
--   to still store the OLD values for word_sense_id
--   2824f88b-0f55-4247-924a-36562b7e4c4c.
--
-- Fix:
--   Update ONLY the description/example of that single word_sense row to
--   the current intended content. Idempotent and guarded so it does not
--   clobber the row if the values are already correct. Does NOT touch
--   words, set_words, user_progress (SRS/FSRS), or any other word_sense.
-- =====================================================================

UPDATE public.word_senses
SET description = 'Lĩnh vực thiết kẺ ve xây dàng công trình',
    example     = 'I am interested in modern architecture.'
WHERE id = '2824f88b-0f55-4247-924a-36562b7e4c4c'
  AND (description IS DISTINCT FROM 'Lĩnh vực thiết kẺ ve xây dàng công trình'
       OR example IS DISTINCT FROM 'I am interested in modern architecture.');