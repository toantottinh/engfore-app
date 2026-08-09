/**
 * Tiện ích chung cho CEFR Level.
 * Các level hợp lệ: A1, A2, B1, B2, C1, C2. Thiếu/không hợp lệ => UNKNOWN ("Chưa xác định").
 */

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const VALID_CEFR = new Set(CEFR_LEVELS);

/**
 * Chuẩn hóa giá trị CEFR: chữ hoa, chỉ chấp nhận A1–C2.
 * Nếu không hợp lệ hoặc rỗng -> trả về null (UNKNOWN).
 * KHÔNG tự đoán level.
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeCefr(value) {
  const v = String(value || '').trim().toUpperCase();
  return VALID_CEFR.has(v) ? v : null;
}

/**
 * Nhãn hiển thị tiếng Việt cho level CEFR.
 * @param {string|null} level
 * @returns {string}
 */
export function cefrLabel(level) {
  const n = normalizeCefr(level);
  return n ? n : 'Chưa xác định';
}

/**
 * Class badge (Tailwind) cho level CEFR.
 * @param {string|null} level
 * @returns {string}
 */
export function cefrBadgeClass(level) {
  const n = normalizeCefr(level);
  const map = {
    A1: 'bg-green-100 text-green-700',
    A2: 'bg-emerald-100 text-emerald-700',
    B1: 'bg-sky-100 text-sky-700',
    B2: 'bg-indigo-100 text-indigo-700',
    C1: 'bg-purple-100 text-purple-700',
    C2: 'bg-fuchsia-100 text-fuchsia-700',
  };
  return n ? map[n] : 'bg-zinc-100 text-zinc-600';
}

/**
 * Kiểm tra giá trị CEFR có hợp lệ không.
 * @param {*} value
 * @returns {boolean}
 */
export function isValidCefr(value) {
  return VALID_CEFR.has(String(value || '').trim().toUpperCase());
}
