-- =====================================================================
-- User-owned Example / Memory Clue content ownership fix.
--
-- ROOT CAUSE (audited):
--   IMPORT_REUSES_SENSE_BUT_CONTENT_OWNERSHIP_IS_WRONG
--   * import_words reused the canonical global word_sense but stored the
--     user's example/memory_clue on word_senses (description/example).
--     Deleting a word removed user_vocabulary/user_progress/set_words but
--     left the GLOBAL sense content behind, so re-importing the same
--     canonical sense resurrected the OLD example/memory_clue.
--
-- Model change:
--   old: content on word_senses (GLOBAL, shared by every user)
--        user_vocabulary(user_id, word_sense_id, created_at)
--   new: word_senses.example / word_senses.description remain CANONICAL /
--        ADMIN default content (backward compatible fallback);
--        user_vocabulary gains USER-OWNED content columns:
--          user_vocabulary.example
--          user_vocabulary.memory_clue
--   Canonical sense identity is UNCHANGED:
--     (word_id, word_type, normalized meaning)
--   -> different examples/memory clues must NEVER create duplicate senses.
--
-- Backfill policy (deliberate):
--   The legacy global content CANNOT be attributed to a specific user
--   (multiple users may own the same sense; the content may equally have
--   been seeded by admin_import_words). Per the ownership rules we DO NOT
--   fabricate per-user rows. Instead the global fields remain as the
--   read-path fallback:
--     COALESCE(user_vocabulary.memory_clue, word_senses.description)
--     COALESCE(user_vocabulary.example,     word_senses.example)
--   so existing data stays readable (no data loss) while every NEW
--   import/update writes user-owned fields only.
--
-- Out of scope (unchanged):
--   * words / word_senses identity, set_words, user_progress, SRS/FSRS.
--   * admin_import_words / admin_update_word: still write CANONICAL
--     word_senses content (admin semantics).
--   * remove_from_vocabulary: deleting the user_vocabulary row now also
--     removes the user-owned content automatically (columns live on the
--     row); global sense/word data survive for other users.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) User-owned content columns on the ownership table.
--    RLS on user_vocabulary ("Users can manage their own vocabulary
--    ownership.") already restricts the whole row — including these
--    columns — to its owner.
-- ---------------------------------------------------------------------
ALTER TABLE public.user_vocabulary
  ADD COLUMN IF NOT EXISTS example text;
ALTER TABLE public.user_vocabulary
  ADD COLUMN IF NOT EXISTS memory_clue text;

-- ---------------------------------------------------------------------
-- 2) import_words — user content belongs to the CALLER, never to the
--    global sense.
--      Case A (sense does not exist):  create word + sense (meaning only,
--        NO global example/description) + user_vocabulary row carrying
--        the imported example/memory_clue.
--      Case B (sense exists, first ownership): reuse the canonical sense
--        UNCHANGED and store the imported content on the new
--        user_vocabulary row. Global fields are NEVER updated here.
--      Case C (user already owns the sense): no duplicate row — the
--        user-owned example/memory_clue are refreshed with the values
--        the import brings; fields the import leaves empty keep their
--        current user-owned value (mirrors the legacy behavior where
--        re-import without content did not wipe anything).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.import_words(
  p_words_data jsonb,
  p_set_id uuid DEFAULT NULL,
  p_new_set_name text DEFAULT NULL
)
RETURNS TABLE(created int, existing int, linked int, errored int, set_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_set    uuid := p_set_id;
  v_item   jsonb;
  v_word   text;
  v_ipa    text;
  v_cefr   text;
  v_type   text;
  v_meaning text;
  v_example text;
  v_descr  text;
  v_word_id uuid;
  v_sense  uuid;
  v_created  int := 0;
  v_existing int := 0;
  v_linked   int := 0;
  v_errored  int := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập.';
  END IF;

  -- Optional: create a new Word Set owned by the caller.
  IF v_set IS NULL AND p_new_set_name IS NOT NULL AND trim(p_new_set_name) <> '' THEN
    INSERT INTO public.vocabulary_sets (user_id, name)
    VALUES (v_user, trim(p_new_set_name))
    RETURNING id INTO v_set;
  END IF;

  -- Ownership check: only import into a Set the caller owns.
  IF v_set IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.vocabulary_sets WHERE id = v_set AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Bạn không có quyền nhập vào bộ từ này.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_words_data) LOOP
    -- Normalize
    v_word := trim(coalesce(v_item->>'word', ''));
    IF v_word = '' THEN v_errored := v_errored + 1; CONTINUE; END IF;

    v_ipa    := nullif(trim(coalesce(v_item->>'ipa','')),'');
    v_cefr   := nullif(upper(trim(coalesce(v_item->>'cefr',''))),'');
    v_type   := lower(coalesce(nullif(trim(coalesce(v_item->>'word_type','')),''),'other'));
    v_meaning := trim(coalesce(v_item->>'meaning',''));
    v_example := nullif(trim(coalesce(v_item->>'example','')),'');
    v_descr   := nullif(trim(coalesce(v_item->>'memory_clue', v_item->>'description','')),'');

    -- Normalize word_type to a valid enum value.
    v_type := CASE v_type
      WHEN 'phrasal verb'  THEN 'phrasal_verb'
      WHEN 'phrasal-verb'  THEN 'phrasal_verb'
      WHEN 'phrasalverb'   THEN 'phrasal_verb'
      WHEN 'phrasal verbs' THEN 'phrasal_verb'
      WHEN 'verb phrase'   THEN 'verb_phrase'
      WHEN 'verb-phrase'   THEN 'verb_phrase'
      WHEN 'verbphrase'    THEN 'verb_phrase'
      WHEN 'verb phrases'  THEN 'verb_phrase'
      WHEN 'v.' THEN 'verb'
      WHEN 'n.' THEN 'noun'
      WHEN 'adj.' THEN 'adjective'
      WHEN 'adv.' THEN 'adverb'
      WHEN 'prep.' THEN 'preposition'
      WHEN 'conj.' THEN 'conjunction'
      WHEN 'pron.' THEN 'pronoun'
      ELSE v_type
    END;

    -- Validate word_type / cefr before enum casts.
    IF v_type NOT IN ('noun','verb','adjective','adverb','preposition','conjunction',
                      'pronoun','other','determiner','interjection','phrasal_verb','verb_phrase') THEN
      v_errored := v_errored + 1; CONTINUE;
    END IF;
    IF v_cefr IS NOT NULL AND v_cefr NOT IN ('A1','A2','B1','B2','C1','C2') THEN
      v_errored := v_errored + 1; CONTINUE;
    END IF;

    -- 1) create/reuse global word (case-insensitive)
    SELECT id INTO v_word_id FROM public.words WHERE lower(word) = lower(v_word);
    IF v_word_id IS NULL THEN
      IF v_cefr IS NOT NULL THEN
        INSERT INTO public.words (word, ipa, cefr_level)
        VALUES (v_word, v_ipa, v_cefr::public.cefr_level)
        ON CONFLICT (lower(word)) DO NOTHING
        RETURNING id INTO v_word_id;
      ELSE
        INSERT INTO public.words (word, ipa)
        VALUES (v_word, v_ipa)
        ON CONFLICT (lower(word)) DO NOTHING
        RETURNING id INTO v_word_id;
      END IF;
      IF v_word_id IS NULL THEN
        SELECT id INTO v_word_id FROM public.words WHERE lower(word) = lower(v_word);
      END IF;
    END IF;

    -- 2) create/reuse global word_sense by canonical identity
    --    (word_id, word_type, normalize(meaning)) — UNCHANGED.
    SELECT id INTO v_sense
    FROM public.word_senses
    WHERE word_id = v_word_id
      AND word_type = v_type::public.word_type
      AND regexp_replace(trim(lower(coalesce(meaning,''))),'\s+',' ','g') =
          regexp_replace(trim(lower(coalesce(v_meaning,''))),'\s+',' ','g');

    IF v_sense IS NULL THEN
      -- Case A: brand-new canonical sense. The example/memory_clue of a
      -- USER import are user-owned and must NOT be seeded globally — they
      -- are written to user_vocabulary below. (Canonical defaults are
      -- seeded exclusively by admin_import_words.)
      INSERT INTO public.word_senses (word_id, word_type, meaning)
      VALUES (v_word_id, v_type::public.word_type, v_meaning)
      RETURNING id INTO v_sense;
      v_created := v_created + 1;
    ELSE
      v_existing := v_existing + 1;
    END IF;

    -- 3) ownership + USER-OWNED content (idempotent, no duplicates).
    --    SECURITY DEFINER -> the conflict target below is the only
    --    authorized write: it can never touch another user's row because
    --    it is keyed (user_id, word_sense_id) with user_id = auth.uid().
    INSERT INTO public.user_vocabulary (user_id, word_sense_id, example, memory_clue)
    VALUES (v_user, v_sense, v_example, v_descr)
    ON CONFLICT (user_id, word_sense_id) DO UPDATE
    SET example     = coalesce(EXCLUDED.example,     public.user_vocabulary.example),
        memory_clue = coalesce(EXCLUDED.memory_clue, public.user_vocabulary.memory_clue);

    -- 4) optional Set link (idempotent)
    IF v_set IS NOT NULL THEN
      INSERT INTO public.set_words (set_id, word_sense_id)
      VALUES (v_set, v_sense)
      ON CONFLICT DO NOTHING;
      v_linked := v_linked + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_created, v_existing, v_linked, v_errored, v_set;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_words(jsonb, uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) update_user_word — editing "my vocabulary" updates ONLY the
--    caller's user_vocabulary content. The global word_senses
--    example/description are NO LONGER touched by user edits (they stay
--    canonical/admin data). Sense identity fields (word_type/meaning)
--    and words.* keep their previous semantics unchanged (out of scope).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_word(
  p_sense_id uuid,
  p_word_id uuid DEFAULT NULL,
  p_word_data jsonb DEFAULT '{}'::jsonb
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

  -- 3) USER-OWNED content: update ONLY the caller's own row. Clearing
  --    semantics preserved from the legacy RPC (empty/absent value -> NULL,
  --    which falls back to the canonical default on read).
  UPDATE public.user_vocabulary
  SET
    example     = nullif((p_word_data->>'example')::text, ''),
    memory_clue = nullif((p_word_data->>'memory_clue')::text, '')
  WHERE user_id = auth.uid()
    AND word_sense_id = p_sense_id;

  -- 4) Canonical sense identity fields (previous semantics unchanged).
  --    NOTE: description/example intentionally REMOVED from this UPDATE.
  UPDATE public.word_senses
  SET
    word_type   = CASE
                    WHEN nullif(coalesce((p_word_data->>'word_type')::text, ''), '') IS NULL
                      THEN word_type
                    ELSE (p_word_data->>'word_type')::word_type
                  END,
    meaning     = coalesce(nullif((p_word_data->>'meaning')::text, ''), meaning)
  WHERE id = p_sense_id;

  -- 5) Update WORDS linked to the owned sense (never a client-chosen word)
  --    — previous semantics unchanged.
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

-- ---------------------------------------------------------------------
-- 4) get_words_in_set_with_progress — read path prefers USER-OWNED
--    content and falls back to the canonical default for legacy rows:
--      memory_clue := coalesce(user_vocabulary.memory_clue, word_senses.description)
--      example     := coalesce(user_vocabulary.example,     word_senses.example)
--    Everything else (authorization, SRS coalesce defaults) unchanged.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_words_in_set_with_progress(
    p_set_id uuid,
    p_user_id uuid
)
RETURNS TABLE(
    id uuid,
    word_id uuid,
    word text,
    ipa text,
    cefr_level public.cefr_level,
    word_type public.word_type,
    meaning text,
    memory_clue text,
    example text,
    mastery_level int,
    review_due_at timestamptz,
    last_reviewed_at timestamptz,
    repetitions int,
    interval_hours int,
    ease_factor numeric,
    lapses int,
    state text,
    learning_step int,
    flashcard_reviews int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid      uuid    := auth.uid();
    v_allowed  boolean := false;
BEGIN
    IF auth.role() = 'service_role' THEN
        v_allowed := true;
    ELSIF v_uid IS NOT NULL THEN
        v_allowed :=
            coalesce(
                (SELECT (users.role = 'admin'::public.user_role)
                   FROM public.users
                  WHERE users.id = v_uid),
                false
            )
            OR EXISTS (
                SELECT 1
                FROM public.vocabulary_sets
                WHERE vocabulary_sets.id = p_set_id
                  AND vocabulary_sets.user_id = v_uid
            );
    END IF;

    IF NOT v_allowed THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        ws.id,
        w.id AS word_id,
        w.word,
        w.ipa,
        w.cefr_level,
        ws.word_type,
        ws.meaning,
        coalesce(uv.memory_clue, ws.description) AS memory_clue,
        coalesce(uv.example, ws.example)         AS example,
        coalesce(up.mastery_level, 0)::int AS mastery_level,
        up.review_due_at,
        up.last_reviewed_at,
        coalesce(up.repetitions, 0)::int AS repetitions,
        coalesce(up.interval_hours, 0)::int AS interval_hours,
        coalesce(up.ease_factor, 2.5)::numeric AS ease_factor,
        coalesce(up.lapses, 0)::int AS lapses,
        coalesce(up.state, 'new')::text AS state,
        coalesce(up.learning_step, 0)::int AS learning_step,
        coalesce(up.flashcard_reviews, 0)::int AS flashcard_reviews
    FROM public.set_words sw
    JOIN public.word_senses ws  ON sw.word_sense_id = ws.id
    JOIN public.words w         ON ws.word_id = w.id
    LEFT JOIN public.user_vocabulary uv
           ON uv.word_sense_id = ws.id
          AND uv.user_id = p_user_id
    LEFT JOIN public.user_progress up
           ON up.word_sense_id = ws.id
          AND up.user_id = p_user_id
    WHERE sw.set_id = p_set_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_words_in_set_with_progress(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) get_new_words_for_session — same read-path rule for NEW words in the
--    Learn session (dedup + effective-priority logic unchanged from
--    migration 20260827000000).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_new_words_for_session(
    p_user_id uuid,
    p_set_ids_prioritized uuid[],
    p_limit integer,
    p_excluded_sense_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS TABLE (
    id uuid,
    word text,
    ipa text,
    cefr_level text,
    word_type text,
    meaning text,
    memory_clue text,
    example text,
    mastery_level integer,
    review_count integer,
    flashcard_reviews integer,
    review_due_at timestamptz,
    last_reviewed_at timestamptz,
    repetitions integer,
    interval_hours double precision,
    ease_factor double precision,
    lapses integer,
    state text,
    learning_step integer,
    set_id uuid
)
LANGUAGE sql
STABLE
AS $$
WITH set_priority AS (
  -- The array is already ordered: index 0 = highest priority.
  SELECT
    val AS set_id,
    idx AS priority
  FROM unnest(p_set_ids_prioritized) WITH ORDINALITY AS t(val, idx)
),
ranked AS (
  SELECT
    DISTINCT ON (sw.word_sense_id)
    sw.word_sense_id,
    sw.set_id,
    sp.priority
  FROM
    public.set_words sw
  JOIN
    set_priority sp ON sw.set_id = sp.set_id
  LEFT JOIN
    public.user_progress up ON up.word_sense_id = sw.word_sense_id AND up.user_id = p_user_id
  WHERE
    -- Must be a NEW word for this user
    up.word_sense_id IS NULL
    -- Exclude any senses already picked in this session (due/learning queues)
    AND sw.word_sense_id <> ALL(p_excluded_sense_ids)
  ORDER BY
    sw.word_sense_id,
    sp.priority ASC -- DISTINCT ON keeps the row with the MINIMUM set priority
)
SELECT
    ws.id,
    w.word,
    w.ipa,
    w.cefr_level,
    ws.word_type,
    ws.meaning,
    coalesce(uv.memory_clue, ws.description) AS memory_clue,
    coalesce(uv.example, ws.example)         AS example,
    -- Default values for a NEW word
    0 AS mastery_level,
    0 AS review_count,
    0 AS flashcard_reviews,
    NULL::timestamptz AS review_due_at,
    NULL::timestamptz AS last_reviewed_at,
    0 AS repetitions,
    0.0 AS interval_hours,
    2.5 AS ease_factor,
    0 AS lapses,
    'new'::text AS state,
    0 AS learning_step,
    r.set_id
FROM
    ranked r
JOIN
    public.word_senses ws ON ws.id = r.word_sense_id
JOIN
    public.words w ON ws.word_id = w.id
LEFT JOIN
    public.user_vocabulary uv ON uv.word_sense_id = ws.id AND uv.user_id = p_user_id
ORDER BY
    r.priority ASC,   -- effective (min) set priority, lower = learned first
    ws.id ASC         -- deterministic order within the same priority
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_new_words_for_session(uuid, uuid[], integer, uuid[])
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_new_words_for_session(uuid, uuid[], integer, uuid[]) IS
$$
Fetches NEW words for a user's learning session.  A word_sense that belongs to
several prioritized sets is returned exactly ONCE, using the MINIMUM set priority
(Rule 4: dedup + effective priority), then ordered by effective priority.
Example / memory_clue are USER-OWNED (user_vocabulary) with the canonical
word_senses content as legacy fallback.
$$;

COMMIT;
