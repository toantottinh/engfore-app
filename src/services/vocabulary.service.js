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

/** Import danh sách từ vào set (dùng RPC import_words_to_set). */
export async function importWordsToSet(setId, words) {
  const { data, error } = await supabase.rpc('import_words_to_set', {
    p_set_id: setId,
    p_words_data: words,
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
    const { data: progress, error: progressError } = await supabase
      .from('user_progress')
      .select('word_sense_id, mastery_level, review_due_at, last_reviewed_at')
      .in('word_sense_id', senseIds)
      .eq('user_id', userId);
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
      description: sense.description || '',
      example: sense.example || '',
      set_id: item.set_id,
      mastery_level: progress?.mastery_level ?? 0,
      review_due_at: progress?.review_due_at ?? null,
      last_reviewed_at: progress?.last_reviewed_at ?? null,
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
      description: updates.description || null,
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

