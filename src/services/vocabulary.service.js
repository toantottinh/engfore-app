import { supabase } from './supabase.js';

/**
 * Dịch vụ từ vựng — thao tác với schema Supabase hiện tại.
 * Bảng dùng chung: vocabulary_sets, set_words, word_senses, words, users.
 */

/** Lấy danh sách bộ từ của user kèm số lượng từ và độ thành thạo trung bình.
 *
 * Sets are ordered by the user-specific `learn_priority` from
 * `user_set_learn_priority` (lower = earlier in NEW selection).  Sets
 * without a priority entry default to 999 so they sink to the end, with a
 * stable fallback to `created_at ASC` then `id ASC`.
 */
export async function getVocabularySets(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };

  const { data, error } = await supabase
    .from('vocabulary_sets')
    .select(
      `*,
       set_words(count)
      `
    )
    .eq('user_id', userId);

  if (error) return { data: null, error };

  // Fetch user-specific learn priorities (lower = earlier in NEW selection).
  // Non-fatal: if the RPC/table is unavailable, every set defaults to
  // priority 999 and falls back to created_at ordering below.
  const { data: priorities } = await getUserSetLearnPriorities(userId);
  const prioMap = new Map(
    (priorities || []).map((p) => [p.set_id, Number(p.learn_priority)])
  );

  const mapped = (data || []).map((set) => {
    const count = set.set_words?.[0]?.count ?? 0;
    const { set_words: _sw, ...rest } = set;
    return {
      ...rest,
      word_count: count,
      learn_priority: prioMap.get(set.id) ?? 999,
    };
  });

  // Sort by learn_priority (ascending, lower = learned first). Stable
  // tiebreak on created_at ASC then id ASC (documented deterministic order).
  mapped.sort((a, b) => {
    const diff = (a.learn_priority ?? 999) - (b.learn_priority ?? 999);
    if (diff !== 0) return diff;
    const ta = new Date(a.created_at || 0).getTime() || 0;
    const tb = new Date(b.created_at || 0).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });

  return { data: mapped, error: null };
}

/** [ADMIN] Lấy TOÀN BỘ danh sách bộ từ (public và của user) kèm thông tin owner. */
export async function getAdminAllSets() {
  const { data, error } = await supabase
    .from('vocabulary_sets')
    .select(
      `*,
       set_words(count),
       users ( username )
      `
    )
    .order('created_at', { ascending: false });

  if (error) return { data: null, error };

  const mapped = (data || []).map((set) => {
    const count = set.set_words?.[0]?.count ?? 0;
    const { set_words: _sw, ...rest } = set;
    return {
      ...rest,
      word_count: count,
      owner_username: set.users?.username || 'Public', // Public if user is null
    };
  });

  return { data: mapped, error: null };
}

/** Lấy thông tin chi tiết một bộ từ. */
export async function getVocabularySet(setId) {
  const { data, error } = await supabase
    .from('vocabulary_sets')
    .select('*')
    .eq('id', setId)
    .maybeSingle();
  return { data, error };
}

/** Tạo bộ từ mới. */
export async function createVocabularySet({ name, description, userId }) {
  if (!name || !userId) {
    return { data: null, error: new Error('Tên bộ từ và user_id là bắt buộc.') };
  }
  const { data, error } = await supabase
    .from('vocabulary_sets')
    .insert([{ name, description: description || null, user_id: userId }])
    .select()
    .maybeSingle();

  // Create a default learn_priority entry so the new set appears in the
  // user's set ordering (Part B: Word Set Learning Order).  Non-fatal — if
  // the user_set_learn_priority table is unavailable the set simply gets a
  // default priority of 999 in getVocabularySets.
  if (data?.id && !error) {
    await supabase
      .from('user_set_learn_priority')
      .upsert({ user_id: userId, set_id: data.id, learn_priority: 999 })
      .catch(() => {});
  }

  return { data, error };
}

/** Cập nhật thông tin bộ từ (tên, mô tả). */
export async function updateVocabularySet(setId, updates) {
  const { data, error } = await supabase
    .from('vocabulary_sets')
    .update(updates)
    .eq('id', setId)
    .select()
    .maybeSingle();
  return { data, error };
}

/** Xóa một bộ từ. */
export async function deleteVocabularySet(setId) {
  const { error } = await supabase.from('vocabulary_sets').delete().eq('id', setId);
  return { error };
}

/**
 * Import danh sách từ vào Vocabulary (RPC import_words).
 * Destination Word Set là TÙY CHỌN; có thể tạo set mới (newSetName).
 * Không duplicate: sense tái sử dụng theo canonical (word, type, meaning);
 * chỉ thêm ownership + (tùy chọn) liên kết set.
 * @param {{ words: Array, setId?: string|null, newSetName?: string|null }} params
 * @returns {Promise<{ data: any, error: any, meta: object|null }>}
 */
export async function importWords({ words, setId = null, newSetName = null }) {
  // Storage/RPC retains the established `description` column; the application
  // domain exposes it consistently as `memory_clue`.
  const storageWords = (words || []).map(({ memory_clue, ...word }) => ({
    ...word,
    description: memory_clue ?? word.description ?? null,
  }));

  const { data, error } = await supabase.rpc('import_words', {
    p_set_id: setId,
    p_new_set_name: newSetName,
    p_words_data: storageWords,
  });

  // Log đầy đủ lỗi thật (message, code, details, hint) dưới dạng CHUỖI — chỉ khi DEV.
  if (error) {
    if (import.meta.env.DEV) {
      const errInfo = {
        status: error?.status ?? null,
        code: error?.code ?? null,
        message: error?.message ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
        error_code: error?.error_code ?? null,
        setId,
        newSetName,
        wordsCount: storageWords.length,
        firstWord: storageWords[0]?.word ?? null,
      };
      console.error('[importWords] RPC error:', JSON.stringify(errInfo, null, 2));
    }
    return { data: null, error, meta: null };
  }

  const meta = Array.isArray(data) && data[0] ? data[0] : null;
  return { data, error: null, meta };
}

/**
 * Giữ tương thích với lời gọi cũ (import vào một set cố định).
 * @deprecated Hãy dùng importWords({ words, setId })
 */
export async function importWordsToSet(setId, words) {
  return importWords({ words, setId });
}

/**
 * [ADMIN] Import words, allowing creation of a new public set or adding to an existing public set.
 * Requires admin privileges, enforced by the RPC.
 * @param {{ words: Array, setId?: string|null, newSetName?: string|null, newSetTopicId?: string|null, newSetStatus?: 'draft'|'published' }} params
 */
export async function adminImportWords({ words, setId = null, newSetName = null, newSetTopicId = null, newSetStatus = 'draft' }) {
  const storageWords = (words || []).map(({ memory_clue, ...word }) => ({
    ...word,
    description: memory_clue ?? word.description ?? null,
  }));

  const { data, error } = await supabase.rpc('admin_import_words', {
    p_set_id: setId,
    p_new_set_name: newSetName,
    p_words_data: storageWords,
    p_new_set_topic_id: newSetTopicId,
    p_new_set_status: newSetStatus,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[adminImportWords] RPC error:', JSON.stringify(error, null, 2));
    }
    return { data: null, error, meta: null };
  }

  const meta = Array.isArray(data) && data[0] ? data[0] : null;
  return { data, error: null, meta };
}

/**
 * [ADMIN] Update a vocabulary set, including admin-only fields like status and topic.
 */
export async function adminUpdateVocabularySet(setId, updates) {
  // `updates` can include { name, description, topic_id, status }
  const { data, error } = await supabase
    .from('vocabulary_sets')
    .update(updates)
    .eq('id', setId)
    .select()
    .maybeSingle();
  return { data, error };
}

/**
 * [ADMIN] Update a canonical word and its sense. Uses RPC to ensure it runs with correct permissions.
 */
export async function adminUpdateWord(wordId, senseId, updates) {
  const { error } = await supabase.rpc('admin_update_word', {
    p_word_id: wordId,
    p_sense_id: senseId,
    p_word_data: updates,
  });
  return { error };
}

/**
 * [ADMIN] Permanently delete a word and its senses from the global tables.
 * This is a destructive action and should be used with care.
 */
export async function adminDeleteWord(wordId) {
  // The delete will cascade to word_senses, set_words, user_progress, etc.
  // RLS policies ensure only admins can do this.
  const { error } = await supabase.from('words').delete().eq('id', wordId);
  return { error };
}

/** Lấy danh sách tất cả các topics. */
export async function getTopics() {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .order('name', { ascending: true });
  return { data, error };
}

/** [ADMIN] Create a new topic. */
export async function createTopic(topicData) {
  const { data, error } = await supabase
    .from('topics')
    .insert([topicData])
    .select()
    .single();
  return { data, error };
}

/** [ADMIN] Update an existing topic. */
export async function updateTopic(topicId, updates) {
  const { data, error } = await supabase
    .from('topics')
    .update(updates)
    .eq('id', topicId)
    .select()
    .single();
  return { data, error };
}

/** [ADMIN] Delete a topic. */
export async function deleteTopic(topicId) {
  const { error } = await supabase.from('topics').delete().eq('id', topicId);
  return { error };
}

/**
 * Cập nhật nội dung của một từ nằm trong vocabulary của user.
 *
 * Chạy qua RPC `update_user_word` (SECURITY DEFINER): hàm tự kiểm tra quyền sở
 * hữu — user phải có dòng `user_vocabulary` trỏ tới sense đó — rồi mới UPDATE
 * `word_senses` / `words`. Nhờ đó KHÔNG bypass RLS và không cho sửa từ của
 * người khác (RLS hiện tại chặn mọi UPDATE trực tiếp lên word_senses/words
 * của user thường, vì vậy cần RPC này để "sửa & lưu từ" hoạt động cho đúng).
 *
 * @param {string} senseId - word_sense_id của từ cần sửa (id của từ trong library).
 * @param {string|null} wordId - words.id tương ứng (nullable).
 * @param {object} updates - { word, ipa, word_type, meaning, example, memory_clue, cefr_level }
 * @returns {Promise<{ error: any }>}
 */
export async function updateUserWord(senseId, wordId, updates = {}) {
  if (!senseId) {
    return { error: new Error('Thiếu ID từ cần sửa.') };
  }
  try {
    const { error } = await supabase.rpc('update_user_word', {
      p_sense_id: senseId,
      p_word_id: wordId || null,
      p_word_data: {
        word: updates.word ?? null,
        ipa: updates.ipa ?? null,
        word_type: updates.word_type ?? null,
        meaning: updates.meaning ?? null,
        example: updates.example ?? null,
        memory_clue: updates.memory_clue ?? null,
        cefr_level: updates.cefr_level ?? null,
      },
    });
    return { error: error ?? null };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Toàn bộ Vocabulary của user: các sense user đang sở hữu qua `set_words` +
 * `vocabulary_sets` (SOURCE OF TRUTH cho membership), kèm tiến trình học
 * (user_progress) và tên các Word Set chứa sense (để hiển thị).
 *
 * Membership được suy từ set_words (không phải user_vocabulary) để trang
 * Vocabulary luôn đồng bộ với SRS Learning Queue: một từ chỉ còn thuộc ít
 * nhất một Set của user thì mới hiển thị; từ đã bị xóa khỏi mọi Set cũng
 * biến mất khỏi đây (memory_clue của từ KHÔNG phải điều kiện membership —
 * từ không có Memory Clue vẫn hiển thị bình thường).
 * @param {string} userId
 * @returns {Promise<{ data: Array, error: any }>}
 */
export async function getUserVocabulary(userId) {
  if (!userId) return { data: null, error: null };

  // !inner + eq trên cột embed => chỉ lấy set_words thuộc set của user.
  // Một sense nằm trong nhiều set sẽ trả nhiều dòng -> dedup bằng seen set
  // (TEST 7: không bao giờ duplicate item trong Vocabulary).
  const { data: memberships, error } = await supabase
    .from('set_words')
    .select(
      `word_sense_id,
       vocabulary_sets!inner ( id, user_id ),
       word_senses (
         id, word_type, meaning, description, example,
         words ( id, word, ipa, cefr_level )
       )`
    )
    .eq('vocabulary_sets.user_id', userId);

  if (error) return { data: null, error };

  const seenSenseIds = new Set();
  const ownedRows = [];
  for (const m of memberships || []) {
    const senseId = m.word_sense_id;
    if (!senseId || seenSenseIds.has(senseId)) continue;
    seenSenseIds.add(senseId);
    ownedRows.push(m);
  }

  const senseIds = ownedRows.map((m) => m.word_sense_id).filter(Boolean);

  // Progress (graceful fallback khi thiếu cột SRS ở môi trường cũ).
  let progressMap = {};
  if (senseIds.length > 0) {
    const BASE_PRO = 'word_sense_id, mastery_level, review_due_at, last_reviewed_at';
    const SRS_PRO = `${BASE_PRO}, repetitions, interval_hours, ease_factor, lapses, state, learning_step, flashcard_reviews`;
    let { data: prog, error: progError } = await supabase
      .from('user_progress')
      .select(SRS_PRO)
      .in('word_sense_id', senseIds)
      .eq('user_id', userId);
    if (progError) {
      const fallback = await supabase
        .from('user_progress')
        .select(BASE_PRO)
        .in('word_sense_id', senseIds)
        .eq('user_id', userId);
      if (!fallback.error) {
        prog = fallback.data;
        progError = null;
      }
    }
    if (!progError) {
      progressMap = (prog || []).reduce((acc, p) => {
        acc[p.word_sense_id] = p;
        return acc;
      }, {});
    }
  }

  // Map sense -> tên các Word Set của user chứa sense đó.
  const setNamesMap = {};
  const { data: mySets } = await supabase
    .from('vocabulary_sets')
    .select('id, name')
    .eq('user_id', userId);
  const setIdName = (mySets || []).reduce((acc, s) => {
    acc[s.id] = s.name;
    return acc;
  }, {});
  const mySetIds = Object.keys(setIdName);
  if (mySetIds.length > 0) {
    const { data: links } = await supabase
      .from('set_words')
      .select('set_id, word_sense_id')
      .in('set_id', mySetIds);
    (links || []).forEach((l) => {
      if (setIdName[l.set_id]) {
        (setNamesMap[l.word_sense_id] = setNamesMap[l.word_sense_id] || []).push(setIdName[l.set_id]);
      }
    });
  }

  const merged = ownedRows.map((m) => {
    const sense = m.word_senses || {};
    const w = sense.words || {};
    const prog = progressMap[m.word_sense_id];
    return {
      id: sense.id,
      word_id: w.id,
      word: w.word || '',
      ipa: w.ipa || '',
      cefr_level: w.cefr_level || '',
      word_type: sense.word_type || '',
      meaning: sense.meaning || '',
      memory_clue: sense.description || '',
      example: sense.example || '',
      mastery_level: prog?.mastery_level ?? 0,
      review_due_at: prog?.review_due_at ?? null,
      last_reviewed_at: prog?.last_reviewed_at ?? null,
      repetitions: prog?.repetitions ?? 0,
      interval_hours: prog?.interval_hours ?? 0,
      ease_factor: prog?.ease_factor ?? 2.5,
      lapses: prog?.lapses ?? 0,
      state: prog?.state ?? 'new',
      learning_step: prog?.learning_step ?? 0,
      flashcard_reviews: prog?.flashcard_reviews ?? 0,
      set_names: setNamesMap[sense.id] || [],
    };
  });

  return { data: merged, error: null };
}

/**
 * Thêm nhiều sense (đã thuộc Vocabulary của user) vào một Word Set — idempotent.
 * @param {string} setId
 * @param {Array<string>} wordSenseIds
 * @returns {Promise<{ error: any }>}
 */
export async function addWordsToSet(setId, wordSenseIds) {
  if (!setId || !wordSenseIds || wordSenseIds.length === 0) {
    return { error: { message: 'Cần chọn Word Set và ít nhất một từ.' } };
  }
  const rows = wordSenseIds.map((id) => ({ set_id: setId, word_sense_id: id }));
  const { error } = await supabase
    .from('set_words')
    .upsert(rows, { onConflict: 'set_id,word_sense_id' });
  return { error };
}

/**
 * Xóa một từ khỏi Vocabulary của user (RPC remove_from_vocabulary).
 * Trong 1 transaction: bỏ ownership, xóa progress của user, gỡ khỏi mọi set của user.
 * KHÔNG ảnh hưởng user khác / sense toàn cục.
 * @param {string} wordSenseId
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function removeFromVocabulary(wordSenseId) { // This function was already correct, but I'm confirming it.
  if (!wordSenseId) return { error: { message: 'Thiếu id của từ.' } };
  const { data, error } = await supabase.rpc('remove_from_vocabulary', {
    p_word_sense_id: wordSenseId,
  });

  return { data, error };
}

/** Lấy danh sách từ trong set kèm tiến trình học (mastery_level). */
export async function getWordsInSet(setId, userId) {
  // Lỗi HTTP 400 xảy ra khi danh sách senseIds quá lớn, làm URL request vượt giới hạn.
  // Giải pháp: Dùng RPC để join và lấy dữ liệu trên server, chỉ cần truyền setId và userId.
  // RPC `get_words_in_set_with_progress` cần được tạo trong database.
  // Nếu hàm RPC chưa tồn tại, Supabase sẽ trả lỗi "function does not exist".
  if (!userId) return { data: [], error: { message: 'User ID is required.' } };

  const { data, error } = await supabase.rpc('get_words_in_set_with_progress', {
    p_set_id: setId,
    p_user_id: userId,
  });

  if (error) {
    // Log chi tiết response thật từ Supabase (code/message/details/hint) để xác
    // định chính xác lỗi HTTP 400 do URL/`.in()` quá lớn, RPC thiếu, RLS, v.v.
    if (import.meta.env.DEV) {
      console.error(
        '[getWordsInSet] RPC Error:',
        JSON.stringify(
          {
            message: error?.message ?? null,
            code: error?.code ?? null,
            status: error?.status ?? null,
            details: error?.details ?? null,
            hint: error?.hint ?? null,
            cause: error?.cause ?? null,
          },
          null,
          2
        )
      );
    }
    return { data: null, error };
  }
  return { data, error };
}

/**
 * Xóa một từ khỏi một Word Set (set-scoped removal) và giữ SRS đồng bộ với
 * membership (Bug 1 fix):
 *   - Gỡ link set_words của (set, sense) — set phải thuộc user.
 *   - NẾU sense KHÔNG còn thuộc bất kỳ Set nào khác của user:
 *       dọn user_progress (SRS) + user_vocabulary (library) của user cho
 *       sense đó → từ biến mất khỏi Học ngắt quãng và trang Vocabulary.
 *   - NẾU sense vẫn còn trong một Set khác của user:
 *       giữ nguyên user_progress + user_vocabulary (TEST 6).
 * Không bao giờ xóa dữ liệu toàn cục (words / word_senses).
 * @param {string} setId
 * @param {string} wordSenseId
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function deleteWordFromSet(setId, wordSenseId) {
  if (!setId || !wordSenseId) {
    return { error: { message: 'Thiếu id của bộ từ hoặc của từ.' } };
  }
  const { data, error } = await supabase.rpc('remove_word_from_set', {
    p_set_id: setId,
    p_word_sense_id: wordSenseId,
  });
  if (!error) return { data, error };

  // Graceful fallback while production is one migration behind: if the RPC
  // does not exist yet (42883 = undefined_function), fall back to removing
  // only the set_words link (the legacy behaviour). The orphaned
  // user_progress row is then cleaned up by the migration's one-time
  // cleanup, and every SRS read already filters by current membership.
  if (error?.code === '42883' || String(error?.message || '').includes('remove_word_from_set')) {
    const { error: deleteError } = await supabase
      .from('set_words')
      .delete()
      .eq('set_id', setId)
      .eq('word_sense_id', wordSenseId);
    return { data: null, error: deleteError };
  }
  return { data, error };
}

/**
 * Lấy thống kê số từ theo cấp độ CEFR cho toàn bộ từ của user.
 * Duyệt tất cả word_senses trong các set của user, lấy cefr_level từ bảng words,
 * đếm theo từng cấp A1–C2 và "Chưa xác định".
 * @param {string} userId
 * @returns {Promise<{ data: { [level:string]: number, total:number }, error }>}
 */
export async function getCefrStats(userId) {
  if (!userId) return { data: null, error: null };

  const { data, error } = await supabase
    .from('set_words')
    .select(
      `set_id,
       word_senses (
         words (
           cefr_level
         )
       )`
    )
    .in(
      'set_id',
      (
        await supabase
          .from('vocabulary_sets')
          .select('id')
          .eq('user_id', userId)
      ).data?.map((r) => r.id) || []
    );

  if (error) return { data: null, error };

  const counts = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, UNKNOWN: 0, total: 0 };
  (data || []).forEach((item) => {
    const level = item.word_senses?.words?.cefr_level;
    counts.total += 1;
    const key = String(level || '').trim().toUpperCase();
    if (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(key)) {
      counts[key] += 1;
    } else {
      counts.UNKNOWN += 1;
    }
  });

  return { data: counts, error: null };
}

/** Tìm kiếm nâng cao bộ từ (dùng RPC advanced_search_sets). */
export async function searchVocabularySets(userId, filters = {}) {
  const { data, error } = await supabase.rpc('advanced_search_sets', {
    p_user_id: userId,
    p_name_query: filters.nameQuery || null,
    p_contains_word: filters.containsWord || null,
    p_created_after: filters.createdAfter || null,
    p_created_before: filters.createdBefore || null,
    p_sort_by: filters.sortBy || 'created_at',
    p_sort_order_asc: filters.sortOrderAsc || false,
  });
  return { data, error };
}

/**
 * Thêm một từ mới vào bộ từ.
 * Tái sử dụng RPC `import_words_to_set` với một từ duy nhất.
 * @param {string} setId - ID của bộ từ.
 * @param {object} wordData - Dữ liệu của từ cần thêm.
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function addWordToSet(setId, wordData) {
  const words = [{
    ...wordData,
    cefr_level: wordData.cefr_level || wordData.cefr || null, // Ensure compatibility
  }];

  const { data, error, meta } = await importWords({ words, setId });

  if (error || (meta && meta.created === 0 && meta.existing === 0)) {
    return { data: null, error: error || new Error('Không thể thêm từ. Có thể từ đã tồn tại hoặc thiếu thông tin.') };
  }
  
  // The RPC doesn't return the full word, so we can't return data here.
  // The caller should reload the set to see the new word.
    return { data: null, error: null };
}

/**
 * Lấy thứ tự học (learn priority) của tất cả bộ từ của user.
 * Priority thấp = được học trước trong chế độ NEW.
 * @param {string} userId
 * @returns {Promise<{ data: Array<{ set_id: string, learn_priority: number }>, error: any }>}
 */
export async function getUserSetLearnPriorities(userId) {
  if (!userId) return { data: [], error: { message: 'Thiếu userId.' } };
  try {
    const { data, error } = await supabase.rpc('get_user_set_learn_priorities', {
      p_user_id: userId,
    });
    if (error) return { data: [], error };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: [], error: e };
  }
}

/**
 * Cập nhật learn_priority cho một bộ từ của user.
 * @param {string} userId
 * @param {string} setId
 * @param {number} priority
 * @returns {Promise<{ error: any }>}
 */
export async function updateSetLearnPriority(userId, setId, priority) {
  if (!userId || !setId) {
    return { error: { message: 'Thiếu userId hoặc setId.' } };
  }
  try {
    const { error } = await supabase
      .from('user_set_learn_priority')
      .upsert({ user_id: userId, set_id: setId, learn_priority: Number(priority) });
    if (error) return { error };
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Cập nhật thứ tự học của nhiều bộ từ cùng lúc (dùng cho drag-and-drop).
 * @param {string} userId
 * @param {Array<{ set_id: string, learn_priority: number }>} updates
 * @returns {Promise<{ error: any }>}
 */
export async function batchUpdateSetLearnPriority(userId, updates) {
  if (!userId) return { error: { message: 'Thiếu userId.' } };
  try {
    const { error } = await supabase
      .from('user_set_learn_priority')
      .upsert(
        (updates || []).map((u) => ({
          user_id: userId,
          set_id: u.set_id,
          learn_priority: Number(u.learn_priority),
        }))
      );
    if (error) return { error };
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Reorder the user's vocabulary sets by a desired priority order (Part B:
 * Word Set Learning Order).
 *
 * `orderedSetIds` is the desired order, first element = learned first.
 * Priorities are normalized to a contiguous 1..N (no duplicates) and written
 * in ONE atomic upsert statement so concurrent reorders cannot interleave
 * half-applied states.
 *
 * OWNERSHIP VALIDATION (required):
 *   Every id in `orderedSetIds` must be one of the user's own sets.  If any
 *   id belongs to another user (or does not exist), the whole reorder is
 *   rejected WITHOUT writing anything — a user can never reorder someone
 *   else's set or silently create a priority row for a foreign set.
 *
 * @param {string} userId
 * @param {string[]} orderedSetIds - desired order (first = highest priority)
 * @returns {Promise<{ error: any }>}
 */
export async function reorderVocabularySets(userId, orderedSetIds) {
  if (!userId) return { error: { message: 'Thiếu userId.' } };
  if (!Array.isArray(orderedSetIds) || orderedSetIds.length === 0) {
    return { error: { message: 'Danh sách bộ từ không hợp lệ.' } };
  }
  // A set id must never appear twice (that would corrupt the 1..N ordering).
  if (new Set(orderedSetIds).size !== orderedSetIds.length) {
    return { error: { message: 'Danh sách bộ từ bị trùng lặp.' } };
  }

  try {
    // 1) Validate ownership: only the user's own sets may be reordered.
    const { data: ownedSets, error: setsError } = await supabase
      .from('vocabulary_sets')
      .select('id')
      .eq('user_id', userId);
    if (setsError) return { error: setsError };

    const ownedIds = new Set((ownedSets || []).map((s) => s.id));
    const foreign = orderedSetIds.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) {
      return { error: { message: 'Không thể thay đổi thứ tự bộ từ không thuộc về bạn.' } };
    }

    // 2) Normalize to contiguous 1..N priorities (lower = learned first).
    const updates = orderedSetIds.map((setId, index) => ({
      user_id: userId,
      set_id: setId,
      learn_priority: index + 1,
    }));

    // 3) Single atomic upsert: all rows are committed or none are.
    const { error } = await supabase
      .from('user_set_learn_priority')
      .upsert(updates, { onConflict: 'user_id,set_id' });
    if (error) return { error };
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}
