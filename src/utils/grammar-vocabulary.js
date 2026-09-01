import { VALID_WORD_TYPES } from './vocabulary-importer.js';

/**
 * Vocabulary Type integration cho Grammar (task §9-11).
 *
 * NGUYÊN TẮC:
 *  - Grammar TẬN DỤNG word_type ĐÃ LƯU trong Vocabulary DB (bảng word_senses).
 *  - KHÔNG gọi AI, KHÔNG tự suy luận Type trong runtime — mọi helper dưới đây
 *    là pure, chỉ đọc/phân nhóm dữ liệu đã có.
 *  - Multi-sense được GIỮ NGUYÊN: một word có nhiều sense rows (word_type khác
 *    nhau) sẽ xuất hiện ở TẤT CẢ các type tương ứng — không gộp, không giả định
 *    một word chỉ có một type (vd "work" -> noun + verb).
 *  - "wake up" -> 'phrasal_verb', "wake up early" -> 'other' là giá trị ĐÃ LƯU
 *    trong DB — đọc nguyên trạng (không suy luận lại bằng heuristic).
 */

/**
 * Danh sách word_type hợp lệ — tái sử dụng nguyên văn từ vocabulary importer
 * (cùng enum với production DB; migration 20260810200000_add_word_types).
 */
export const GRAMMAR_WORD_TYPES = VALID_WORD_TYPES;

/**
 * Map deterministic từ title của Grammar Rule sang word_type của Vocabulary.
 * Dùng cho trang Rule detail để hiển thị "Từ vựng liên quan" (ví dụ các từ
 * thuộc loại từ mà rule dạy). Đây là MAP TĨNH của admin content — KHÔNG phải
 * AI/heuristic suy luận.
 */
const RULE_TITLE_TO_WORD_TYPE = {
  // English titles
  noun: 'noun',
  verb: 'verb',
  adjective: 'adjective',
  adverb: 'adverb',
  pronoun: 'pronoun',
  preposition: 'preposition',
  conjunction: 'conjunction',
  determiner: 'determiner',
  interjection: 'interjection',
  'phrasal verb': 'phrasal_verb',
  // Vietnamese titles (đồng bộ với label trong Vocabulary import UI)
  'danh từ': 'noun',
  'động từ': 'verb',
  'tính từ': 'adjective',
  'trạng từ': 'adverb',
  'đại từ': 'pronoun',
  'giới từ': 'preposition',
  'liên từ': 'conjunction',
  'định từ': 'determiner',
  'thán từ': 'interjection',
  'cụm động từ': 'phrasal_verb',
};

/**
 * Resolve word_type từ title của một grammar rule (deterministic, no AI).
 * @param {string} title - rule title (vd 'Adjective' / 'Tính từ')
 * @returns {string|null} word_type hợp lệ trong GRAMMAR_WORD_TYPES, hoặc null
 *   khi rule không ánh xạ được (vd 'Present Simple') — caller ẩn section.
 */
export function ruleTitleToWordType(title) {
  const key = String(title || '').trim().toLowerCase();
  if (!key) return null;
  const type = RULE_TITLE_TO_WORD_TYPE[key];
  return type && GRAMMAR_WORD_TYPES.has(type) ? type : null;
}

/**
 * Nhóm word senses theo word_type đã lưu trong DB.
 * Multi-sense an toàn: một word xuất hiện ở mọi type nó đang có.
 *
 * @param {Array<{ id, word_type, meaning, example?, word?: object }>} senses
 * @returns {Record<string, Array>} map word_type -> senses (type không hợp lệ
 *   bị bỏ qua nhưng KHÔNG bị đổi giá trị — dữ liệu DB là nguồn sự thật).
 */
export function groupSensesByType(senses) {
  const grouped = {};
  (senses || []).forEach((s) => {
    const type = String(s?.word_type || '').trim();
    if (!type || !GRAMMAR_WORD_TYPES.has(type)) return;
    (grouped[type] = grouped[type] || []).push(s);
  });
  return grouped;
}

/**
 * Danh sách các word_type ĐÃ LƯU của một word (multi-sense: có thể > 1).
 * @param {Array<{ word_type }>} senses
 * @returns {string[]} distinct types, giữ thứ tự xuất hiện.
 */
export function resolveWordTypes(senses) {
  const types = [];
  (senses || []).forEach((s) => {
    const type = String(s?.word_type || '').trim();
    if (type && !types.includes(type)) types.push(type);
  });
  return types;
}

/**
 * Chọn sense phù hợp với một word_type (vd exercise về "adjective after be"
 * cần sense 'adjective' của word). KHÔNG bao giờ tạo sense mới hay đổi type:
 * nếu không có sense khớp -> trả null để caller xử lý (multi-sense an toàn).
 *
 * @param {Array<{ word_type }>} senses
 * @param {string} type
 * @returns {object|null}
 */
export function pickSenseByType(senses, type) {
  const wanted = String(type || '').trim();
  if (!wanted) return null;
  return (senses || []).find((s) => String(s?.word_type || '').trim() === wanted) || null;
}