import { supabase } from './supabase.js';

/**
 * Dịch vụ từ vựng — thao tác với schema Supabase hiện tại.
 * Bảng dùng chung: vocabulary_sets, set_words, word_senses, words, users.
 */

/** Lấy danh sách bộ từ của user kèm số lượng từ và độ thành thạo trung bình. */
export async function getVocabularySets(userId) {
  const { data, error } = await supabase
    .from('vocabulary_sets')
    .select(
      `*,
       set_words(count)
      `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return { data: null, error };

  const mapped = (data || []).map((set) => {
    const count = set.set_words?.[0]?.count ?? 0;
    const { set_words: _sw, ...rest } = set;
    return { ...rest, word_count: count };
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
 * Toàn bộ Vocabulary của user: các sense thuộc (user, sense) qua user_vocabulary,
 * kèm tiến trình học (user_progress) và các Word Set chứa sense (để hiển thị).
 * @param {string} userId
 * @returns {Promise<{ data: Array, error: any }>}
 */
export async function getUserVocabulary(userId) {
  if (!userId) return { data: null, error: null };

  const { data: memberships, error } = await supabase
    .from('user_vocabulary')
    .select(
      `word_sense_id,
       word_senses (
         id, word_type, meaning, description, example,
         words ( id, word, ipa, cefr_level )
       )`
    )
    .eq('user_id', userId);

  if (error) return { data: null, error };

  const senseIds = (memberships || []).map((m) => m.word_sense_id).filter(Boolean);

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

  const merged = (memberships || []).map((m) => {
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
export async function removeFromVocabulary(wordSenseId) {
  if (!wordSenseId) return { error: { message: 'Thiếu id của từ.' } };
  const { data, error } = await supabase.rpc('remove_from_vocabulary', {
    p_word_sense_id: wordSenseId,
  });
  return { data, error };
}

/** Lấy danh sách từ trong set kèm tiến trình học (mastery_level). */
export async function getWordsInSet(setId) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session?.session?.user?.id;

  const { data, error } = await supabase
    .from('set_words')
    .select(
      `set_id,
       word_senses (
         id,
         word_type,
         meaning,
         description,
         example,
         words (
           id,
           word,
           ipa,
           cefr_level
         )
       )`
    )
    .eq('set_id', setId);

  if (error) return { data: null, error };

  const senseIds = (data || []).map((item) => item.word_senses?.id).filter(Boolean);
  let progressMap = {};
    if (userId && senseIds.length > 0) {
    // Try full SRS columns first; if they don't exist, retry with base columns only
    const BASE_PRO = 'word_sense_id, mastery_level, review_due_at, last_reviewed_at';
    const SRS_PRO = 'word_sense_id, mastery_level, review_due_at, last_reviewed_at, repetitions, interval_hours, ease_factor, lapses, state, learning_step, flashcard_reviews';

    let { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select(SRS_PRO)
      .in('word_sense_id', senseIds)
      .eq('user_id', userId);

    if (progressError) {
      // Fallback: retry with only base columns that are guaranteed to exist
      const fallback = await supabase
        .from('user_progress')
        .select(BASE_PRO)
        .in('word_sense_id', senseIds)
        .eq('user_id', userId);
      if (fallback.error) {
        if (import.meta.env.DEV) console.error('[getWordsInSet] progress query error:', fallback.error.message);
      } else {
        progress = fallback.data;
        progressError = null;
      }
    }

    if (!progressError) {
      progressMap = progress.reduce((acc, p) => {
        acc[p.word_sense_id] = p;
        return acc;
      }, {});
    }
  }

  const merged = (data || []).map((item, idx) => {
    const sense = item.word_senses || {};
    const word = sense.words || {};
    const progress = progressMap[sense.id];
    return {
      id: sense.id,
      word_id: word.id,
      word: word.word || '',
      ipa: word.ipa || '',
      cefr_level: word.cefr_level || '',
      word_type: sense.word_type || '',
      meaning: sense.meaning || '',
      memory_clue: sense.description || '',
      example: sense.example || '',
      set_id: item.set_id,
      mastery_level: progress?.mastery_level ?? 0,
      review_due_at: progress?.review_due_at ?? null,
      last_reviewed_at: progress?.last_reviewed_at ?? null,
      repetitions: progress?.repetitions ?? 0,
      interval_hours: progress?.interval_hours ?? 0,
      ease_factor: progress?.ease_factor ?? 2.5,
      lapses: progress?.lapses ?? 0,
      state: progress?.state ?? 'new',
      learning_step: progress?.learning_step ?? 0,
      flashcard_reviews: progress?.flashcard_reviews ?? 0,
      _idx: idx,
    };
  });

  return { data: merged, error: null };
}

/** Cập nhật chi tiết một từ (word + word_sense). */
export async function updateWord(wordId, senseId, updates) {
  // Cập nhật word_senses trước (RLS cho phép UPDATE trong schema hiện tại)
  const senseResult = await supabase
    .from('word_senses')
    .update({
      word_type: updates.word_type,
      meaning: updates.meaning,
      description: updates.memory_clue || null,
      example: updates.example || null,
    })
    .eq('id', senseId);
  if (senseResult.error) return { error: senseResult.error };

  // Cập nhật words (best-effort — có thể bị giới hạn RLS)
  const { error: wordError } = await supabase
    .from('words')
    .update({
      word: updates.word,
      ipa: updates.ipa || null,
      cefr_level: updates.cefr_level || null,
    })
    .eq('id', wordId);

  return { error: wordError };
}

/** Xóa một từ khỏi set (gỡ quan hệ set_words). */
export async function deleteWordFromSet(setId, wordSenseId) {
  const { error } = await supabase
    .from('set_words')
    .delete()
    .eq('set_id', setId)
    .eq('word_sense_id', wordSenseId);
  return { error };
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
  // Chuẩn hóa dữ liệu để phù hợp với RPC import_words_to_set
  const payload = [{
    word: wordData.word || '',
    ipa: wordData.ipa || null,
    word_type: wordData.word_type || 'other',
    meaning: wordData.meaning || '',
    memory_clue: wordData.memory_clue || null,
    example: wordData.example || null,
    cefr: wordData.cefr_level || null,
  }];

  const { data, error, meta } = await importWordsToSet(setId, payload);

  // RPC trả về meta { imported, errored }. Nếu imported > 0, coi là thành công.
  if (error || (meta && meta.imported === 0)) {
    return { data: null, error: error || new Error('Không thể thêm từ. Có thể từ đã tồn tại hoặc thiếu thông tin.') };
  }
  return { data: data?.[0] || null, error: null }; // Trả về từ đầu tiên nếu có
}
