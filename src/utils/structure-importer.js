/**
 * Structure Importer / Parser (KHÔNG tích hợp AI API).
 *
 * Format import chính thức (mỗi dòng một cấu trúc, 6 cột phân cách bằng "|"):
 *
 *   Structure | Meaning | Explanation | Examples | CEFR | Topic
 *   I want to + V | Tôi muốn... | Dùng để nói về mong muốn | I want to learn English. ;; I want to go home. | A1 | Daily Life
 *
 * - Nhiều examples phân cách bằng ";;".
 * - Trim toàn bộ ô; pattern được thu gọn khoảng trắng trong (\s+ -> ' ') vì nó
 *   là định danh (DB unique theo lower(trim(pattern))).
 * - CEFR chuẩn hóa qua utils/cefr.js (chỉ A1–C2; sai/không có -> null + cảnh báo).
 * - Explanation / Topic là TÙY CHỌN; Structure / Meaning là BẮT BUỘC.
 * - KHÔNG import SRS state — SRS thuộc user_structures và do learning flow quản lý.
 *
 * Conventions mirror src/utils/vocabulary-importer.js:
 *   { rows, warnings, hadHeader, format } + per-row `_warnings`;
 *   thêm `_errors` (row lỗi nghiêm trọng) vì structures có trường bắt buộc.
 */

import { normalizeCefr as normalizeCefrLevel } from './cefr.js';

const PIPE_DELIMITER = '|';
export const EXAMPLES_DELIMITER = ';;';

// Số cột bắt buộc của format import.
export const STRUCTURE_COLUMNS = ['pattern', 'meaning', 'explanation', 'examples', 'cefr', 'topic'];

// Header mặc định của format pipe (không phân biệt hoa/thường, bỏ khoảng trắng).
const HEADER_ALIASES = {
  structure: 'pattern',
  pattern: 'pattern',
  'cấu trúc': 'pattern',
  'cau truc': 'pattern',
  'cấu trúc câu': 'pattern',
  'cau truc cau': 'pattern',
  meaning: 'meaning',
  'nghĩa': 'meaning',
  nghia: 'meaning',
  explanation: 'explanation',
  'giải thích': 'explanation',
  'giai thich': 'explanation',
  description: 'explanation',
  examples: 'examples',
  example: 'examples',
  'ví dụ': 'examples',
  'vi du': 'examples',
  cefr: 'cefr',
  level: 'cefr',
  'cấp độ': 'cefr',
  'cap do': 'cefr',
  topic: 'topic',
  'chủ đề': 'topic',
  'chu de': 'topic',
};

function normalizeHeaderCell(cell) {
  return String(cell || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ')
    .trim();
}

/**
 * Xác định xem dòng có phải header không.
 * Điều kiện: >= 2 cột, CỘT ĐẦU TIÊN phải khớp alias của trường định danh
 * (structure/pattern/cấu trúc...) — chống ăn nhầm dòng dữ liệu thật — và tổng
 * số cột khớp alias >= 4 với tỉ lệ >= 0.5 (cùng luật vocabulary importer).
 */
function isHeaderRow(cells) {
  if (cells.length < 2) return false;
  let matched = 0;
  for (const cell of cells) {
    const key = normalizeHeaderCell(cell);
    if (HEADER_ALIASES[key] === 'pattern') {
      if (matched > 0) continue; // chỉ đếm cột đầu cho alias pattern
      matched = 1;
      continue;
    }
    if (HEADER_ALIASES[key]) matched += 1;
  }
  const firstIsPattern =
    HEADER_ALIASES[normalizeHeaderCell(cells[0])] === 'pattern';
  return firstIsPattern && matched >= 4 && matched / cells.length >= 0.5;
}

/**
 * Chia một dòng thành các cột theo delimiter pipe, trim từng ô.
 */
function splitPipeLine(line) {
  return line.split(PIPE_DELIMITER).map((cell) => cell.trim());
}

/**
 * Chuẩn hóa pattern (trường định danh): trim + thu gọn khoảng trắng trong.
 * Được export để exercise-importer tái sử dụng đúng một logic chuẩn hóa.
 * @param {string} value
 * @returns {string}
 */
export function normalizePattern(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/**
 * Chuẩn hóa CEFR về A1–C2 hoặc null (qua util chung của project).
 */
function normalizeCefr(value) {
  return normalizeCefrLevel(value);
}

function createEmptyRow() {
  return {
    pattern: '',
    meaning: '',
    explanation: '',
    examples: [],
    cefr: '',
    topic: '',
    _warnings: [],
    _errors: [],
  };
}

/**
 * Parse văn bản nhập vào thành các row cấu trúc đã chuẩn hóa.
 *
 * @param {string} text - Văn bản người dùng dán.
 * @returns {{
 *   rows: Array<{ pattern, meaning, explanation, examples: string[], cefr, topic,
 *                 _warnings: string[], _errors: string[] }>,
 *   warnings: string[],
 *   hadHeader: boolean,
 *   format: 'pipe'
 * }}
 */
export function parseStructureText(text) {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const warnings = [];
  const rows = [];
  let hadHeader = false;
  const format = 'pipe';

  if (rawLines.length === 0) {
    return { rows, warnings, hadHeader, format };
  }

  const lines = [...rawLines];

  // Nhận diện và bỏ header nếu có (chỉ xét dòng đầu tiên).
  if (lines[0].includes(PIPE_DELIMITER)) {
    const firstCells = splitPipeLine(lines[0]);
    if (isHeaderRow(firstCells)) {
      hadHeader = true;
      lines.shift();
    }
  }

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;

    // Dòng không có delimiter nào -> row lỗi rõ ràng (không im lặng bỏ qua).
    if (!line.includes(PIPE_DELIMITER)) {
      const row = createEmptyRow();
      row._errors.push(
        `Dòng ${lineNumber}: không có dấu "${PIPE_DELIMITER}" phân cách cột.`
      );
      rows.push(row);
      warnings.push(`Dòng ${lineNumber}: bị bỏ qua vì thiếu dấu "|".`);
      return;
    }

    const cells = splitPipeLine(line);

    if (cells.length !== STRUCTURE_COLUMNS.length) {
      const row = createEmptyRow();
      row._errors.push(
        `Dòng ${lineNumber}: sai số cột (cần ${STRUCTURE_COLUMNS.length}, thấy ${cells.length}).`
      );
      rows.push(row);
      warnings.push(
        `Dòng ${lineNumber}: sai số cột (${cells.length}/${STRUCTURE_COLUMNS.length}), đã bỏ qua.`
      );
      return;
    }

    const row = createEmptyRow();
    row.pattern = normalizePattern(cells[0]);
    row.meaning = cells[1];
    row.explanation = cells[2];
    row.cefr = cells[4];
    row.topic = cells[5];

    // Examples: tách theo ";;", trim từng câu, bỏ câu rỗng.
    row.examples = String(cells[3] || '')
      .split(EXAMPLES_DELIMITER)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // ---- Validate per-row ----
    if (!row.pattern) {
      row._errors.push('Thiếu cấu trúc (cột 1).');
    }
    if (!row.meaning) {
      row._errors.push('Thiếu nghĩa (cột 2).');
    }
    if (row.examples.length === 0) {
      row._warnings.push('Không có ví dụ nào.');
    }

    // CEFR: chuẩn hóa ngay tại parse (như vocabulary importer). Sai/không có -> ''
    // kèm cảnh báo để admin xem lại; không làm hỏng import.
    const rawCefr = cells[4];
    row.cefr = normalizeCefr(rawCefr) || '';
    if (rawCefr && !row.cefr) {
      warnings.push(
        `Dòng "${row.pattern || lineNumber}": CEFR "${rawCefr}" không hợp lệ, sẽ bỏ trống.`
      );
      row._warnings.push(`CEFR "${rawCefr}" không hợp lệ, sẽ bỏ trống.`);
    }

    rows.push(row);
  });

  return { rows, warnings, hadHeader, format };
}

/**
 * Một row được coi là HỢP LỆ khi không có _errors (pattern + meaning đã được
 * validator ở trên đảm bảo không rỗng).
 */
export function isValidStructureRow(row) {
  return Boolean(row) && Array.isArray(row._errors) && row._errors.length === 0;
}

/** Key định danh dùng cho dedupe (khớp logic unique index của DB). */
export function structureKey(pattern) {
  return normalizePattern(pattern).toLowerCase();
}

/**
 * Dedupe TRONG cùng batch: nếu cùng pattern xuất hiện nhiều lần, giữ dòng đầu
 * và loại các dòng sau (kèm lý do) — giống hành vi dedupeRows của vocabulary.
 *
 * Khác với vocabulary: pattern ĐÃ TỒN TẠI trong DB KHÔNG bị loại — import sẽ
 * CẬP NHẬT knowledge fields (semantics của RPC import_structures), nên ta chỉ
 * gắn cảnh báo để admin biết.
 *
 * @param {Array} rows
 * @param {Array<string>} [existingPatterns] - pattern đã có trong DB.
 * @returns {{ rows: Array, duplicates: Array }}
 */
export function dedupeStructureRows(rows, existingPatterns = []) {
  const existing = new Set((existingPatterns || []).map((p) => structureKey(p)));
  const seen = new Set();
  const duplicates = [];
  const kept = [];

  (rows || []).forEach((row) => {
    const key = structureKey(row.pattern);
    if (!key) {
      duplicates.push({ ...row, _reason: 'Thiếu cấu trúc' });
      return;
    }
    if (seen.has(key)) {
      duplicates.push({ ...row, _reason: 'Trùng trong nội dung nhập (chỉ giữ dòng đầu)' });
      return;
    }
    seen.add(key);
    if (existing.has(key)) {
      row._warnings.push('Cấu trúc đã tồn tại — import sẽ CẬP NHẬT nội dung này.');
    }
    kept.push(row);
  });

  return { rows: kept, duplicates };
}

/**
 * Chuẩn bị payload cho RPC import_structures từ các row preview (đã chỉnh sửa).
 * Re-trim + re-normalize để an toàn ngay cả khi admin sửa ô tay.
 * @param {Array} rows
 * @returns {Array<{ pattern, meaning, explanation, cefr, topic, examples: Array<{sentence: string}> }>}
 */
export function toStructureImportPayload(rows) {
  return (rows || []).filter(isValidStructureRow).map((r) => ({
    pattern: normalizePattern(r.pattern),
    meaning: String(r.meaning || '').trim(),
    explanation: String(r.explanation || '').trim() || null,
    cefr: normalizeCefr(r.cefr),
    topic: String(r.topic || '').trim() || null,
    examples: (r.examples || [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .map((sentence) => ({ sentence })),
  }));
}