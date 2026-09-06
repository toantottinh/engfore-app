-- =====================================================================
-- remove_admin_feature_rpcs — drop Admin-only RPCs (Admin feature removal)
--
-- CONTEXT:
--   The Admin feature has been removed from the application (UI, routes,
--   services, tests). These RPCs are SECURITY DEFINER functions gated by
--   is_admin() internally and have ZERO remaining application callers
--   (verified by repo-wide grep after the frontend/service cleanup).
--
-- DROPPED (Admin-only, no callers):
--   * admin_import_words(jsonb, uuid, text, uuid, content_status)
--       — was used only by adminImportWords() (removed).
--   * admin_update_word(uuid, uuid, jsonb)
--       — was used only by adminUpdateWord() (removed).
--   * import_structures(jsonb)
--       — was used only by the admin-only StructureImport page (removed).
--   * import_grammar_topics(jsonb) / import_grammar_rules(jsonb) /
--     import_grammar_exercises(jsonb)
--       — were used only by importGrammar*() service wrappers (removed).
--
-- KEPT (NOT dropped — intentionally):
--   * public.is_admin()  — UNSAFE TO REMOVE: still referenced by RLS
--     policies across words / word_senses / topics / vocabulary_sets /
--     structures / grammar tables. Dropping it requires re-authoring every
--     dependent policy. It is harmless without the Admin UI.
--   * All user-facing RPCs: import_words, remove_from_vocabulary,
--     unlink_word_from_set, remove_word_from_set, update_user_word,
--     import_structure_exercises, get_words_in_set_with_progress, ...
--   * users.role column — kept in DB (per safety rules, no production
--     schema change beyond this function cleanup).
--
-- SAFETY:
--   * IF EXISTS — idempotent, safe to run on environments where some
--     functions were never created.
--   * No data is touched. No tables, columns, policies or triggers changed.
--   * LOCAL/REPO ONLY — do NOT apply to production without review.
-- =====================================================================

-- Admin vocabulary CRUD RPCs (20260818110000, refreshed by 20260908000000)
DROP FUNCTION IF EXISTS public.admin_import_words(jsonb, uuid, text, uuid, content_status);
DROP FUNCTION IF EXISTS public.admin_update_word(uuid, uuid, jsonb);

-- Admin structure knowledge import RPC (20260830010000)
DROP FUNCTION IF EXISTS public.import_structures(jsonb);

-- Admin grammar import RPCs (20260902000000)
DROP FUNCTION IF EXISTS public.import_grammar_topics(jsonb);
DROP FUNCTION IF EXISTS public.import_grammar_rules(jsonb);
DROP FUNCTION IF EXISTS public.import_grammar_exercises(jsonb);
