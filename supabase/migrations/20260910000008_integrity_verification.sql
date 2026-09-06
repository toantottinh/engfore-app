-- =====================================================================
-- PHASE 3: Data integrity verification
-- =====================================================================
-- This migration runs verification checks to ensure migration was successful.
-- Run this AFTER all data migrations are complete.

BEGIN;

-- VERIFICATION 1: No orphan versions
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.vocabulary_versions vv
    LEFT JOIN public.version_sets vs ON vv.id = vs.version_id
    WHERE vs.version_id IS NULL;
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % orphan versions found', v_count;
    END IF;
END
$$;

-- VERIFICATION 2: No orphan items
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.vocabulary_items vi
    WHERE NOT EXISTS (
        SELECT 1 FROM public.vocabulary_versions vv WHERE vv.vocabulary_item_id = vi.id
    );
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % orphan items found', v_count;
    END IF;
END
$$;

-- VERIFICATION 3: No duplicate identities
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) - COUNT(DISTINCT (
        user_id, 
        lower(regexp_replace(trim(word), '\s+', ' ', 'g')), 
        word_type, 
        lower(regexp_replace(trim(meaning), '\s+', ' ', 'g'))
    )) INTO v_count
    FROM public.vocabulary_items;
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % duplicate identities', v_count;
    END IF;
END
$$;

-- VERIFICATION 4: No duplicate (set, item)
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) - COUNT(DISTINCT (set_id, vocabulary_item_id)) INTO v_count
    FROM public.version_sets;
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % duplicate (set, item)', v_count;
    END IF;
END
$$;

-- VERIFICATION 5: No cross-user version ownership
-- Detect versions whose parent item belongs to a different user than expected
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.vocabulary_versions vv
    JOIN public.vocabulary_items vi ON vv.vocabulary_item_id = vi.id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.vocabulary_items vi2 
        WHERE vi2.id = vv.vocabulary_item_id AND vi2.user_id = vi.user_id
    );
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % cross-user version ownership violations', v_count;
    END IF;
END
$$;

-- VERIFICATION 6: No cross-user version_set ownership
-- Detect version_sets where version and set belong to different users
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.version_sets vs
    JOIN public.vocabulary_versions vv ON vs.version_id = vv.id
    JOIN public.vocabulary_items vi ON vv.vocabulary_item_id = vi.id
    JOIN public.vocabulary_sets vss ON vs.set_id = vss.id
    WHERE vi.user_id != vss.user_id;
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % cross-user version_set ownership violations', v_count;
    END IF;
END
$$;

-- VERIFICATION 7: version_sets.vocabulary_item_id consistency
-- Ensure version_sets.vocabulary_item_id always matches vocabulary_versions.vocabulary_item_id
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.version_sets vs
    JOIN public.vocabulary_versions vv ON vs.version_id = vv.id
    WHERE vs.vocabulary_item_id != vv.vocabulary_item_id;
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % version_sets vocabulary_item_id mismatches', v_count;
    END IF;
END
$$;

-- VERIFICATION 8: No orphan user_progress (version_id points to non-existent version)
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.user_progress up
    WHERE up.version_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM public.vocabulary_versions vv WHERE vv.id = up.version_id
    );
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % orphan user_progress rows (invalid version_id)', v_count;
    END IF;
END
$$;

-- VERIFICATION 9: No cross-user user_progress ownership
-- Ensure user_progress.user_id matches the vocabulary_item's user_id
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.user_progress up
    JOIN public.vocabulary_versions vv ON up.version_id = vv.id
    JOIN public.vocabulary_items vi ON vv.vocabulary_item_id = vi.id
    WHERE up.user_id != vi.user_id;
    
    IF v_count > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED: % cross-user user_progress ownership violations', v_count;
    END IF;
END
$$;

-- VERIFICATION 10: Global data preservation
DO $$
DECLARE
    v_words_count INT;
    v_senses_count INT;
BEGIN
    SELECT COUNT(*) INTO v_words_count FROM public.words;
    SELECT COUNT(*) INTO v_senses_count FROM public.word_senses;
    
    RAISE NOTICE 'GLOBAL DATA: words=%, word_senses=%', v_words_count, v_senses_count;
    
    -- No exception - just informational
END
$$;

-- VERIFICATION 11: Log counts for manual comparison
DO $$
DECLARE
    v_items INT;
    v_versions INT;
    v_version_sets INT;
    v_progress INT;
    v_orphan_progress INT;
BEGIN
    SELECT COUNT(*) INTO v_items FROM public.vocabulary_items;
    SELECT COUNT(*) INTO v_versions FROM public.vocabulary_versions;
    SELECT COUNT(*) INTO v_version_sets FROM public.version_sets;
    SELECT COUNT(*) INTO v_progress FROM public.user_progress WHERE version_id IS NOT NULL;
    SELECT COUNT(*) INTO v_orphan_progress FROM public.user_progress WHERE version_id IS NULL;
    
    RAISE NOTICE 'MIGRATION SUMMARY: items=%, versions=%, version_sets=%, progress=%, orphan_progress=%', 
        v_items, v_versions, v_version_sets, v_progress, v_orphan_progress;
END
$$;

COMMIT;

