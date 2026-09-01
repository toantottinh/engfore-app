import { supabase } from './supabase.js';

/**
 * Dịch vụ Grammar (Ngữ pháp) — thao tác với schema Supabase hiện tại.
 * Bảng dùng chung: grammar_topics, grammar_rules, grammar_exercises,
 * user_grammar (per-user SRS state).
 *
 * Content model (mirror Sentence Structures):
 *   Knowledge : grammar_topics -> grammar_rules  (global, admin-managed)
 *   Exercises : grammar_rules -> grammar_exercises (shared practice bank,
 *               KHÔNG phải SRS item — dùng chung exercise engine hiện có)
 *   SRS       : user_grammar được ghi QUA grammar-learning.service.js bằng
 *               scheduler computeSrsPayload (một SRS engine cho toàn app).
 *
 * File này CHỈ đọc/ghi content + gọi import RPC (admin). Không có logic SRS.
 */

/**
 * [ADMIN] Import Grammar topics qua RPC import_grammar_topics (SECURITY
 * DEFINER, admin-only bên trong hàm). Upsert-by-title:
 *   - title mới    -> INSERT.
 *   - title có sẵn -> refresh description/cefr/category (never null out).
 * KHÔNG đụng SRS state của user.
 *
 * @param {{ topics: Array<{ title, description?, cefr?, category? }> }} params
 * @returns {Promise<{ data: any, error: any, meta: { created, updated, errored } | null }>}
 */
export async function importGrammarTopics({ topics }) {
  const payload = Array.isArray(topics) ? topics : [];
  const { data, error } = await supabase.rpc('import_grammar_topics', { p_rows: payload });
  if (error) {
    if (import.meta.env.DEV) {
      console.error('[importGrammarTopics] RPC error:', JSON.stringify(error, null, 2));
    }
    return { data: null, error, meta: null };
  }
  const meta = Array.isArray(data) && data[0] ? data[0] : null;
  return { data, error: null, meta };
}

/**
 * [ADMIN] Import Grammar rules qua RPC import_grammar_rules. Topic được resolve
 * phía RPC theo title (phải tồn tại trước — import topics trước rules).
 * Upsert-by-(topic, title). KHÔNG đụng SRS state của user.
 *
 * @param {{ rules: Array<{ topic, title, rule, explanation? }> }} params
 */
export async function importGrammarRules({ rules }) {
  const payload = Array.isArray(rules) ? rules : [];
  const { data, error } = await supabase.rpc('import_grammar_rules', { p_rows: payload });
  if (error) {
    if (import.meta.env.DEV) {
      console.error('[importGrammarRules] RPC error:', JSON.stringify(error, null, 2));
    }
    return { data: null, error, meta: null };
  }
  const meta = Array.isArray(data) && data[0] ? data[0] : null;
  return { data, error: null, meta };
}

/**
 * [ADMIN] Import Grammar exercises qua RPC import_grammar_exercises.
 * Rule được resolve phía RPC theo (topic?, rule title). APPEND-ONLY.
 *
 * @param {{ exercises: Array<{ topic?, rule, type, question, answer?, options?, explanation? }> }} params
 */
export async function importGrammarExercises({ exercises }) {
  const payload = Array.isArray(exercises) ? exercises : [];
  const { data, error } = await supabase.rpc('import_grammar_exercises', { p_rows: payload });
  if (error) {
    if (import.meta.env.DEV) {
      console.error('[importGrammarExercises] RPC error:', JSON.stringify(error, null, 2));
    }
    return { data: null, error, meta: null };
  }
  const meta = Array.isArray(data) && data[0] ? data[0] : null;
  return { data, error: null, meta };
}

const GRAMMAR_TOPIC_SELECT = `
  id, title, description, cefr, category, created_at,
  grammar_rules(
    id, topic_id, title, rule, explanation, created_at,
    grammar_exercises(id),
    user_grammar(state, review_due_at, learning_step, mastery_level, repetitions, interval_hours, last_rating)
  )
`;

const GRAMMAR_RULE_DETAIL_SELECT = `
  id, topic_id, title, rule, explanation, created_at,
  grammar_topics(id, title, description, cefr, category),
  grammar_exercises(id, rule_id, type, question, answer, options, explanation, created_at),
  user_grammar(state, review_due_at, learning_step, mastery_level, repetitions, interval_hours, last_rating)
`;

/**
 * [LIBRARY] Danh sách Grammar Topics kèm số rule (cho trang /grammar nhóm theo
 * CEFR). Read-only — KHÔNG tạo/touch user_grammar chỉ vì mở thư viện.
 *
 * @returns {Promise<{ data: Array|null, error: any }>}
 */
export async function getGrammarTopics() {
  try {
    const [topicsRes, rulesRes] = await Promise.all([
      supabase
        .from('grammar_topics')
        .select('id, title, description, cefr, category, created_at')
        .order('cefr', { ascending: true })
        .order('title', { ascending: true }),
      supabase.from('grammar_rules').select('id, topic_id'),
    ]);
    if (topicsRes.error) return { data: null, error: topicsRes.error };
    if (rulesRes.error) return { data: null, error: rulesRes.error };

    const ruleCountByTopic = {};
    (rulesRes.data || []).forEach((r) => {
      if (r.topic_id) ruleCountByTopic[r.topic_id] = (ruleCountByTopic[r.topic_id] || 0) + 1;
    });

    const mapped = (topicsRes.data || []).map((t) => ({
      ...t,
      rule_count: ruleCountByTopic[t.id] || 0,
    }));
    return { data: mapped, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * [TOPIC DETAIL] Một topic kèm danh sách rules — mỗi rule có số exercise và
 * trạng thái học của user (user_grammar embed; RLS giới hạn đúng user đang
 * xem). KHÔNG thực hiện bất kỳ ghi SRS nào ở đây (read-only).
 *
 * @param {string} topicId
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export async function getGrammarTopicById(topicId) {
  if (!topicId) return { data: null, error: { message: 'Thiếu topicId.' } };
  try {
    const { data, error } = await supabase
      .from('grammar_topics')
      .select(GRAMMAR_TOPIC_SELECT)
      .eq('id', topicId)
      .maybeSingle();

    if (error) return { data: null, error };
    if (!data) return { data: null, error: { message: 'Không tìm thấy topic ngữ pháp.' } };

    const rules = (data.grammar_rules || [])
      .slice()
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .map((r) => ({
        ...r,
        exercise_count: (r.grammar_exercises || []).length,
        user_grammar: r.user_grammar?.[0] || null,
      }));

    return { data: { ...data, rules }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * [RULE DETAIL] Một grammar rule kèm topic, toàn bộ exercises (full rows để
 * render phiên học + trang chi tiết) và trạng thái học của user.
 * KHÔNG thực hiện bất kỳ ghi SRS nào ở đây (read-only).
 *
 * @param {string} ruleId
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export async function getGrammarRuleById(ruleId) {
  if (!ruleId) return { data: null, error: { message: 'Thiếu ruleId.' } };
  try {
    const { data, error } = await supabase
      .from('grammar_rules')
      .select(GRAMMAR_RULE_DETAIL_SELECT)
      .eq('id', ruleId)
      .maybeSingle();

    if (error) return { data: null, error };
    if (!data) return { data: null, error: { message: 'Không tìm thấy rule ngữ pháp.' } };

    const exercises = (data.grammar_exercises || [])
      .slice()
      .sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) ||
        String(a.id).localeCompare(String(b.id))
      )
      .map((e) => ({ ...e, options: Array.isArray(e.options) ? e.options : [] }));

    return {
      data: {
        ...data,
        topic: data.grammar_topics || null,
        exercises,
        exercise_count: exercises.length,
        exercise_types: [...new Set(exercises.map((e) => e.type))].sort(),
        user_grammar: data.user_grammar?.[0] || null,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * [SESSION] Lấy toàn bộ exercises của một grammar rule (full rows để render
 * phiên học). Content dùng chung — KHÔNG có SRS theo exercise.
 *
 * @param {string} ruleId
 * @returns {Promise<{ data: Array|null, error: any }>}
 */
export async function getGrammarExercisesByRule(ruleId) {
  if (!ruleId) return { data: null, error: { message: 'Thiếu ruleId.' } };
  try {
    const { data, error } = await supabase
      .from('grammar_exercises')
      .select('id, rule_id, type, question, answer, options, explanation')
      .eq('rule_id', ruleId)
      .order('created_at', { ascending: true });

    if (error) return { data: null, error };
    const mapped = (data || []).map((e) => ({
      ...e,
      options: Array.isArray(e.options) ? e.options : [],
    }));
    return { data: mapped, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * [VOCABULARY INTEGRATION] Lấy word_senses theo word_type TỪ DATABASE HIỆN CÓ
 * của Vocabulary (bảng word_senses đã có sẵn cột word_type).
 *
 * NGUYÊN TẮC (task §9-11):
 *  - KHÔNG gọi AI để xác định Type trong runtime — Type là dữ liệu đã lưu.
 *  - Multi-sense được GIỮ NGUYÊN: một word có thể có nhiều sense rows với
 *    word_type khác nhau (vd "work" -> noun + verb) — mỗi sense là một row
 *    riêng trong word_senses nên query theo word_type tự nhiên trả về đúng
 *    sense của loại đó, KHÔNG gộp/không suy luận.
 *  - "wake up" -> word_type 'phrasal_verb', "wake up early" -> 'other' là giá
 *    trị ĐÃ LƯU trong DB — đọc nguyên trạng, không tự suy luận lại.
 *
 * @param {string} type - word_type đã lưu trong word_senses (vd 'adjective')
 * @param {number} [limit=8]
 * @returns {Promise<{ data: Array<{ id, word_type, meaning, example, word: {word, ipa, cefr_level} }>|null, error: any }>}
 */
export async function getVocabularySensesByType(type, limit = 8) {
  if (!type) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from('word_senses')
      .select('id, word_type, meaning, example, words(id, word, ipa, cefr_level)')
      .eq('word_type', type)
      .limit(Math.max(1, Math.min(50, Number(limit) || 8)));

    if (error) return { data: null, error };
    const mapped = (data || []).map((s) => ({
      ...s,
      word: s.words || null,
    }));
    return { data: mapped, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}