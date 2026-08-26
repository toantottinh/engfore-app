import { supabase } from './supabase.js';

/**
 * Dịch vụ Sentence Structures — thao tác với schema Supabase hiện tại.
 * Bảng dùng chung: structures, structure_examples, structure_exercises,
 * user_structures.
 *
 * Scope CHECKPOINT 2 (Import Knowledge): chỉ import + đọc danh sách pattern
 * để preview cảnh báo trùng. Learning session / SRS sẽ vào các checkpoint sau.
 */

/**
 * [ADMIN] Import knowledge qua RPC import_structures (SECURITY DEFINER,
 * admin-only bên trong hàm). Upsert-by-pattern:
 *   - pattern mới  -> INSERT (+ examples).
 *   - pattern có sẵn -> UPDATE knowledge fields; thay examples khi row mang
 *     key `examples` (full-sync deterministic).
 * KHÔNG đụng SRS state của user.
 *
 * @param {{ structures: Array<{ pattern, meaning, explanation, cefr, topic, examples: Array<{sentence}> }> }} params
 * @returns {Promise<{ data: any, error: any, meta: { created: number, updated: number, errored: number } | null }>}
 */
export async function importStructures({ structures }) {
  const payload = Array.isArray(structures) ? structures : [];

  const { data, error } = await supabase.rpc('import_structures', {
    p_rows: payload,
  });

  // Log đầy đủ lỗi thật (message, code, details, hint) dưới dạng CHUỖI — chỉ khi DEV
  // (cùng convention với importWords trong vocabulary.service.js).
  if (error) {
    if (import.meta.env.DEV) {
      const errInfo = {
        status: error?.status ?? null,
        code: error?.code ?? null,
        message: error?.message ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
        rowsCount: payload.length,
      };
      console.error('[importStructures] RPC error:', JSON.stringify(errInfo, null, 2));
    }
    return { data: null, error, meta: null };
  }

  const meta = Array.isArray(data) && data[0] ? data[0] : null;
  return { data, error: null, meta };
}

/**
 * Danh sách pattern hiện có (chỉ cột `pattern`) — dùng cho preview import để
 * cảnh báo "cấu trúc đã tồn tại, import sẽ cập nhật".
 * Đọc trực tiếp bảng (RLS cho authenticated SELECT).
 *
 * @returns {Promise<{ data: string[] | null, error: any }>}
 */
export async function getStructurePatterns() {
  try {
    const { data, error } = await supabase.from('structures').select('pattern');
    if (error) return { data: null, error };
    return { data: (data || []).map((r) => r.pattern).filter(Boolean), error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * [ADMIN] Import exercises qua RPC import_structure_exercises (SECURITY DEFINER,
 * admin-only bên trong hàm). APPEND-ONLY: mỗi row hợp lệ được INSERT mới;
 * structure được resolve phía RPC theo pattern (không gửi structure_id).
 * Validation phía RPC mirror validator của exercise-importer.
 *
 * @param {{ exercises: Array<{ pattern, type, question, answer, options, explanation }> }} params
 * @returns {Promise<{ data: any, error: any, meta: { created: number, errored: number } | null }>}
 */
export async function importStructureExercises({ exercises }) {
  const payload = Array.isArray(exercises) ? exercises : [];

  const { data, error } = await supabase.rpc('import_structure_exercises', {
    p_rows: payload,
  });

  // Log đầy đủ lỗi thật — chỉ khi DEV (cùng convention với importStructures).
  if (error) {
    if (import.meta.env.DEV) {
      const errInfo = {
        status: error?.status ?? null,
        code: error?.code ?? null,
        message: error?.message ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
        rowsCount: payload.length,
      };
      console.error('[importStructureExercises] RPC error:', JSON.stringify(errInfo, null, 2));
    }
    return { data: null, error, meta: null };
  }

  const meta = Array.isArray(data) && data[0] ? data[0] : null;
  return { data, error: null, meta };
}
// Các cột structure + nested (examples/exercises counts, user progress).
// RLS là security boundary: nested `user_structures` chỉ trả rows của auth.uid()
// (policy owner-only), nên kết quả KHÔNG lộ progress của user khác.
const STRUCTURE_LIST_SELECT = `
  id, pattern, meaning, explanation, cefr, topic, created_at,
  structure_examples(count),
  structure_exercises(count),
  user_structures(state, review_due_at, learning_step, mastery_level,
                  repetitions, interval_hours)
`;

/**
 * Lấy danh sách structure kèm trạng thái học của user (nếu có) + số examples/
 * exercises. Thứ tự deterministic: CEFR rồi created_at.
 * Không tạo user_structures tại đây — user_structures vốn không có rows cho
 * tới khi thực sự bắt đầu học (xem utils/structure-status.js cho counters NEW).
 *
 * @param {string} userId
 * @returns {Promise<{ data: Array|null, error: any }>}
 */
export async function getStructuresForUser(userId) {
  if (!userId) return { data: null, error: { message: 'Thiếu userId.' } };
  try {
    const { data, error } = await supabase
      .from('structures')
      .select(STRUCTURE_LIST_SELECT)
      .order('cefr', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) return { data: null, error };

    const mapped = (data || []).map((s) => ({
      ...s,
      // user_structures là relationship has-many (tối đa 1 row/user do PK);
      // RLS đảm bảo chỉ mình auth user.
      user_structures: s.user_structures?.[0] || null,
      example_count: s.structure_examples?.[0]?.count ?? 0,
      exercise_count: s.structure_exercises?.[0]?.count ?? 0,
    }));
    return { data: mapped, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * [ADMIN] Xóa NHIỀU Structure theo danh sách id — MỘT request duy nhất (.in).
 *
 * An toàn phụ thuộc schema HIỆN TẮI (không cần RPC/migration thêm):
 *   - RLS "Admins can manage all structures." FOR ALL -> chỉ admin DELETE được;
 *     non-admin sẽ nhận kết quả 0 dòng (bị lọc bởi RLS) => báo lỗi rõ ràng.
 *   - structure_examples / structure_exercises / user_structures đều
 *     REFERENCES public.structures(id) ON DELETE CASCADE -> xóa structure là
 *     DB tự dọn dependency ATOMIC (không orphan exercises/SRS), và KHÔNG đụng
 *     dữ liệu vocabulary (words/user_vocabulary...).
 *
 * `.select('id')` để phát hiện "0 dòng bị xóa" (id không tồn tại HOẶC không đủ
 * quyền) — không silent failure.
 *
 * @param {string[]} structureIds
 * @returns {Promise<{ data: Array<{id:string}>|null, error: any }>}
 */
export async function deleteStructures(structureIds) {
  const ids = Array.isArray(structureIds) ? structureIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return { data: null, error: { message: 'Thiếu danh sách cấu trúc cần xóa.' } };
  }
  try {
    const { data, error } = await supabase
      .from('structures')
      .delete()
      .in('id', ids)
      .select('id');

    if (error) {
      if (import.meta.env.DEV) {
        console.error(
          '[deleteStructures] error:',
          JSON.stringify(
            {
              status: error?.status ?? null,
              code: error?.code ?? null,
              message: error?.message ?? null,
              details: error?.details ?? null,
              hint: error?.hint ?? null,
            },
            null,
            2
          )
        );
      }
      return { data: null, error };
    }

    const deletedCount = Array.isArray(data) ? data.length : 0;
    if (deletedCount === 0) {
      return {
        data: null,
        error: {
          message:
            'Không tìm thấy cấu trúc hoặc bạn không có quyền xóa các cấu trúc này.',
        },
      };
    }

    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

const STRUCTURE_DETAIL_SELECT = `
  id, pattern, meaning, explanation, cefr, topic, created_at,
  structure_examples(id, sentence, translation, created_at),
  structure_exercises(id, type),
  user_structures(state, review_due_at, learning_step, mastery_level, repetitions, interval_hours)
`;

/**
 * [LIBRARY/DETAIL] Lấy một structure theo id kèm examples (đã sort theo
 * created_at), danh sách exercise types + số exercises, và trạng thái học
 * của user (RLS giới hạn đúng user đang xem).
 * KHÔNG thực hiện bất kỳ ghi SRS nào ở đây (read-only).
 *
 * @param {string} structureId
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export async function getStructureById(structureId) {
  if (!structureId) return { data: null, error: { message: 'Thiếu structureId.' } };
  try {
    const { data, error } = await supabase
      .from('structures')
      .select(STRUCTURE_DETAIL_SELECT)
      .eq('id', structureId)
      .maybeSingle();

    if (error) return { data: null, error };
    if (!data) return { data: null, error: { message: 'Không tìm thấy cấu trúc.' } };

    const examples = (data.structure_examples || [])
      .slice()
      .sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at))
      );
    const exercises = data.structure_exercises || [];
    const exerciseTypes = [...new Set(exercises.map((e) => e.type))].sort();

    return {
      data: {
        ...data,
        examples,
        exercise_count: exercises.length,
        exercise_types: exerciseTypes,
        user_structures: data.user_structures?.[0] || null,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * [SESSION] Lấy toàn bộ exercises của một structure (full rows để render
 * phiên học). Content dùng chung — KHÔNG có SRS theo exercise.
 * RLS cho authenticated SELECT (content public).
 *
 * @param {string} structureId
 * @returns {Promise<{ data: Array|null, error: any }>}
 */
export async function getStructureExercises(structureId) {
  if (!structureId) return { data: null, error: { message: 'Thiếu structureId.' } };
  try {
    const { data, error } = await supabase
      .from('structure_exercises')
      .select('id, structure_id, type, question, answer, options, explanation')
      .eq('structure_id', structureId)
      .order('created_at', { ascending: true });

    if (error) return { data: null, error };
    // options là JSONB -> đảm bảo là mảng (an toàn khi null/không phải mảng).
    const mapped = (data || []).map((e) => ({
      ...e,
      options: Array.isArray(e.options) ? e.options : [],
    }));
    return { data: mapped, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}