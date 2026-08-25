/**
 * Exercise Importer / Parser (KHÔNG tích hợp AI API).
 *
 * Format import chính thức (mỗi dòng một exercise, 6 cột phân cách bằng "|"):
 *
 *   Structure | Type | Question | Answer | Options | Explanation
 *   I want to + V | multiple_choice | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want learning English. ;; I want to learn English. | Sau want to dùng động từ nguyên mẫu.
 *
 * - `;;` là delimiter cho Options (và tokens của rearrange ở cột Question).
 * - Chỉ hỗ trợ đúng 6 type: multiple_choice, fill_blank, translation,
 *   correction, rearrange, production.
 * - Production KHÔNG phải deterministic exercise: Answer tùy chọn, nếu có chỉ
 *   là example/target — không dùng exact-match khi chấm (runtime sau này).
 * - KHÔNG grammar/NLP/dictionary checking — chỉ format/integrity.
 *
 * Conventions mirror src/utils/structure-importer.js (CP2):
 *   { rows, warnings, hadHeader, format:'pipe' } + `_warnings[]` / `_errors[]`.
 *   Chuẩn hóa Structure key tái sử dụng normalizePattern/structureKey của CP2.
 */

import {
  EXAMPLES_DELIMITER,
  structureKey,
  normalizePattern,
} from './structure-importer.js';

const PIPE_DELIMITER = '|';

// Số cột bắt buộc của format import.
export const EXERCISE_COLUMNS = ['structure', 'type', 'question', 'answer', 'options', 'explanation'];

// Chính xác 6 type V1 — khớp CHECK constraint của bảng structure_exercises.
export const VALID_EXERCISE_TYPES = [
  'multiple_choice',
  'fill_blank',
  'translation',
  'correction',
  'rearrange',
  'production',
];

const TYPE_SET = new Set(VALID_EXERCISE_TYPES);

// Alias chuẩn hóa biến thể nhập liệu -> giá trị enum hợp lệ (như WORD_TYPE_ALIASES).
const EXERCISE_TYPE_ALIASES = {
  'multiple choice': 'multiple_choice',
  'multiple-choice': 'multiple_choice',
  mc: 'multiple_choice',
  'fill blank': 'fill_blank',
  'fill-blank': 'fill_blank',
  'fill in the blank': 'fill_blank',
  'dịch': 'translation',
  'dich': 'translation',
  'sửa câu': 'correction',
  'sua cau': 'correction',
  'xếp câu': 'rearrange',
  'xep cau': 'rearrange',
  'sắp xếp': 'rearrange',
  'sap xep': 'rearrange',
  'viết câu': 'production',
  'viet cau': 'production',
};

// Header mặc định (không phân biệt hoa/thường, bỏ khoảng trắng).
const HEADER_ALIASES = {
  structure: 'structure',
  pattern: 'structure',
  'cấu trúc': 'structure',
  'cau truc': 'structure',
  'cấu trúc câu': 'structure',
  'cau truc cau': 'structure',
  type: 'type',
  'loại': 'type',
  loai: 'type',
  question: 'question',
  'câu hỏi': 'question',
  'cau hoi': 'question',
  answer: 'answer',
  'đáp án': 'answer',
  'dap an': 'answer',
  options: 'options',
  option: 'options',
  'lựa chọn': 'options',
  'lua chon': 'options',
  explanation: 'explanation',
  'giải thích': 'explanation',
  'giai thich': 'explanation',
};

/** Marker blank hợp lệ trong câu hỏi fill_blank: tối thiểu 3 gạch dưới liền. */
const BLANK_MARKER_RE = /_{3,}/;

function normalizeHeaderCell(cell) {
  return String(cell || '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ')
    .trim();
}

/**
 * Nhận diện header — hỗ trợ cả 2 layout:
 *   6 cột (legacy): cột đầu PHẢI khớp alias structure/pattern.
 *   5 cột (đã chọn structure trên UI): cột đầu khớp alias 'type'.
 * Tổng khớp >= 4 (6-cột) hoặc tỉ lệ >= 0.8 (5-cột).
 */
function isHeaderRow(cells) {
  if (cells.length < 2) return false;
  let matched = 0;
  for (const cell of cells) {
    if (HEADER_ALIASES[normalizeHeaderCell(cell)]) matched += 1;
  }
  const firstKey = HEADER_ALIASES[normalizeHeaderCell(cells[0])];
  const firstIsStructure =
    firstKey === 'structure' && matched >= 4 && matched / cells.length >= 0.5;
  const firstIsType =
    firstKey === 'type' &&
    cells.length === EXERCISE_COLUMNS.length - 1 &&
    matched / cells.length >= 0.8;
  return firstIsStructure || firstIsType;
}

function splitPipeLine(line) {
  // Bảo vệ "||" (delimiter của NHIỀU accepted answers trong Answer) khỏi việc
  // bị tách thành cột: cột phân cách bằng "|" đơn, nên tạm thay "||" bằng
  // placeholder trước khi split rồi khôi phục lại trong từng ô.
  const PROTECT = '\u0000';
  const protectedLine = String(line).split('||').join(PROTECT);
  return protectedLine
    .split(PIPE_DELIMITER)
    .map((cell) => cell.split(PROTECT).join('||').trim());
}

/**
 * Key so sánh không phân biệt hoa/thường + khoảng trắng (dùng cho
 * answer-in-options, duplicate options, dedupe key).
 */
function compareKey(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Chuẩn hóa type nhập liệu về 1 trong 6 giá trị hợp lệ.
 * Không khớp gì -> trả về nguyên bản (validator sẽ báo lỗi).
 * @returns {{ value: string, changed: boolean }}
 */
export function normalizeExerciseType(value) {
  const raw = String(value || '').trim();
  const lowered = raw.toLowerCase().replace(/[\s\-]+/g, '_').replace(/_+/g, '_');
  if (TYPE_SET.has(lowered)) {
    return { value: lowered, changed: lowered !== raw };
  }
  const aliased = EXERCISE_TYPE_ALIASES[raw.toLowerCase()];
  if (aliased) return { value: aliased, changed: true };
  return { value: raw, changed: false };
}

function createEmptyExerciseRow() {
  return {
    structure: '',
    type: '',
    question: '',
    answer: '',
    options: [],
    explanation: '',
    _warnings: [],
    _errors: [],
  };
}

/**
 * Validate MỘT row exercise theo type. Reset rồi điền lại `_errors`/`_warnings`
 * nên an toàn để gọi lại sau khi admin sửa ô (revalidate).
 * @param {object} row - row dạng { structure, type, question, answer, options, explanation, ... }
 * @returns {object} chính row đã được validate.
 */
export function validateExerciseRow(row, lineNumber = null) {
  row._errors = [];
  row._warnings = [];

  // ---- Checks dùng chung ----
  const normalizedStructure = normalizePattern(row.structure);
  row.structure = normalizedStructure;
  if (!normalizedStructure) {
    row._errors.push('Thiếu cấu trúc (cột 1).');
  }

  if (!TYPE_SET.has(row.type)) {
    row._errors.push(
      `Type không hợp lệ "${row.type || '(rỗng)'}" — phải là một trong: ${VALID_EXERCISE_TYPES.join(', ')}.`
    );
  }

  if (!String(row.question || '').trim()) {
    row._errors.push('Thiếu câu hỏi (cột 3).');
  }

  // Delimiter hygiene: Answer dùng "||" cho nhiều accepted answers; ";;" là
  // delimiter của Options. Nhầm hai delimiter gần như chắc chắn là lỗi tác giả.
  if (String(row.answer || '').includes(EXAMPLES_DELIMITER)) {
    row._warnings.push(
      `Answer chứa "${EXAMPLES_DELIMITER}" (delimiter của Options). Nếu ý bạn là NHIỀU đáp án hợp lệ hãy dùng "||".`
    );
  }

  // Duplicate options (so sánh không phân biệt hoa/thường + khoảng trắng).
  const optionKeys = (row.options || []).map(compareKey).filter(Boolean);
  const hasDuplicateOptions = new Set(optionKeys).size !== optionKeys.length;

  const answerTrimmed = String(row.answer || '').trim();
  row.answer = answerTrimmed;

  switch (row.type) {
    case 'multiple_choice': {
      if (!answerTrimmed) row._errors.push('multiple_choice thiếu đáp án (cột 4).');
      if ((row.options || []).length < 2) {
        row._errors.push('multiple_choice cần ít nhất 2 options.');
      }
      if (
        answerTrimmed &&
        (row.options || []).length > 0 &&
        !optionKeys.includes(compareKey(answerTrimmed))
      ) {
        row._errors.push('Đáp án phải xuất hiện trong Options.');
      }
      if (hasDuplicateOptions) row._errors.push('Options bị trùng nhau.');
      break;
    }

    case 'fill_blank': {
      if (!answerTrimmed) row._errors.push('fill_blank thiếu đáp án (cột 4).');
      if (!BLANK_MARKER_RE.test(String(row.question || ''))) {
        row._errors.push('Câu hỏi fill_blank phải chứa dấu blank "___".');
      }
      // Options tùy chọn; NẾU có cung cấp thì answer phải nằm trong options (ERROR).
      if ((row.options || []).length > 0) {
        if (!optionKeys.includes(compareKey(answerTrimmed))) {
          row._errors.push('Đáp án phải xuất hiện trong Options (khi Options được cung cấp).');
        }
        if (hasDuplicateOptions) row._errors.push('Options bị trùng nhau.');
      }
      break;
    }

    case 'translation':
    case 'correction': {
      if (!answerTrimmed) row._errors.push(`${row.type} thiếu đáp án (cột 4).`);
      break;
    }

    case 'rearrange': {
      // Question chứa tokens phân cách ";;".
      const rawTokens = String(row.question || '').split(EXAMPLES_DELIMITER);
      const tokens = rawTokens.map((t) => t.trim()).filter(Boolean);
      if (tokens.length < 2) {
        row._errors.push('rearrange cần ít nhất 2 tokens phân cách bằng ";;" trong Question.');
      } else if (tokens.length !== rawTokens.length) {
        row._errors.push('rearrange có token rỗng trong Question.');
      }
      if (!answerTrimmed) row._errors.push('rearrange thiếu đáp án (câu ghép đúng).');
      break;
    }

    case 'production': {
      // Chỉ cần Structure + Type + Question. Answer TÙY CHỘN — nếu có chỉ là
      // example/target, KHÔNG dùng exact-match khi chấm.
      if (answerTrimmed) {
        row._warnings.push('Answer của production chỉ là câu mục tiêu/example, không dùng để chấm tự động.');
      }
      break;
    }

    default:
      // type không hợp lệ đã báo lỗi ở check chung phía trên.
      break;
  }

  // B5 — khi parse từ văn bản import, gắn nhãn ROW cụ thể vào từng lỗi/cảnh
  // báo để preview chỉ rõ "Dòng N: ...". Khi gọi trực tiếp (revalidate từng ô
  // trong bảng preview) không truyền lineNumber — bảng đã có cột số thứ tự.
  if (lineNumber != null) {
    const tag = `Dòng ${lineNumber}: `;
    row._errors = row._errors.map((m) => (m.startsWith('Dòng ') ? m : `${tag}${m}`));
    row._warnings = row._warnings.map((w) => (w.startsWith('Dòng ') ? w : `${tag}${w}`));
  }

  return row;
}

/**
 * Một row hợp lệ khi không còn `_errors`.
 */
export function isValidExerciseRow(row) {
  return Boolean(row) && Array.isArray(row._errors) && row._errors.length === 0;
}

/**
 * Parse văn bản nhập vào thành các row exercise đã chuẩn hóa + validate.
 *
 * Hỗ trợ 2 format (tự nhận theo số cột của từng dòng):
 *   1) Legacy 6 cột: Structure | Type | Question | Answer | Options | Explanation
 *      -> khi `opts.selectedPattern` được cung cấp, dòng nào trỏ structure KHÁC
 *         sẽ bị đánh dấu lỗi (không cho row lệch khỏi knowledge đã chọn).
 *   2) Mới 5 cột (UI đã chọn structure): Type | Question | Answer | Options | Explanation
 *      -> structure = opts.selectedPattern; chưa chọn -> mỗi dòng báo lỗi.
 *
 * @param {string} text
 * @param {{ selectedPattern?: string }} [opts] - pattern của structure đã chọn trên UI.
 * @returns {{
 *   rows: Array<{ structure, type, question, answer, options: string[], explanation,
 *                 _warnings: string[], _errors: string[] }>,
 *   warnings: string[],
 *   hadHeader: boolean,
 *   format: 'pipe'
 * }}
 */
export function parseExerciseText(text, opts = {}) {
  const selectedPattern = normalizePattern(opts.selectedPattern || '');
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
    if (isHeaderRow(splitPipeLine(lines[0]))) {
      hadHeader = true;
      lines.shift();
    }
  }

  lines.forEach((line, idx) => {
    const lineNumber = idx + 1;

    if (!line.includes(PIPE_DELIMITER)) {
      const row = createEmptyExerciseRow();
      row._errors.push(`Dòng ${lineNumber}: không có dấu "${PIPE_DELIMITER}" phân cách cột.`);
      rows.push(row);
      warnings.push(`Dòng ${lineNumber}: bị bỏ qua vì thiếu dấu "|".`);
      return;
    }

    const cells = splitPipeLine(line);

    let structureCell;
    let fieldCells;

    if (cells.length === EXERCISE_COLUMNS.length) {
      // Legacy format: Structure | Type | Question | Answer | Options | Explanation
      structureCell = cells[0];
      fieldCells = cells.slice(1);
    } else if (cells.length === EXERCISE_COLUMNS.length - 1) {
      // Format mới khi ĐÃ chọn Structure trên UI.
      if (!selectedPattern) {
        const row = createEmptyExerciseRow();
        row._errors.push(
          `Dòng ${lineNumber}: chưa chọn "Cấu trúc kiến thức" — hãy chọn ở dropdown phía trên.`
        );
        rows.push(row);
        warnings.push(`Dòng ${lineNumber}: bị bỏ qua vì chưa chọn cấu trúc.`);
        return;
      }
      structureCell = selectedPattern;
      fieldCells = cells;
    } else {
      const row = createEmptyExerciseRow();
      row._errors.push(
        `Dòng ${lineNumber}: sai số cột (cần ${EXERCISE_COLUMNS.length - 1} hoặc ${EXERCISE_COLUMNS.length}, thấy ${cells.length}).`
      );
      rows.push(row);
      warnings.push(
        `Dòng ${lineNumber}: sai số cột (${cells.length}), đã bỏ qua.`
      );
      return;
    }

    const row = createEmptyExerciseRow();
    row.structure = normalizePattern(structureCell);

    const normalizedType = normalizeExerciseType(fieldCells[0]);
    row.type = normalizedType.value;
    if (normalizedType.changed && TYPE_SET.has(normalizedType.value)) {
      row._warnings.push(`Type "${fieldCells[0]}" đã được chuẩn hóa thành "${normalizedType.value}".`);
      warnings.push(`Dòng ${lineNumber}: type "${fieldCells[0]}" -> "${normalizedType.value}".`);
    }
    row.question = fieldCells[1];
    row.answer = fieldCells[2];
    row.options = String(fieldCells[3] || '')
      .split(EXAMPLES_DELIMITER)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    row.explanation = fieldCells[4];

    // Validate type-specific TRƯỚC, rồi mới gắn lỗi mismatch (validate reset
    // _errors nên thứ tự này đảm bảo cả hai loại lỗi cùng hiển thị đúng).
    validateExerciseRow(row, lineNumber);

    // Đã chọn Structure trên UI: mọi dòng (legacy lẫn 5-cột) PHẢI khớp selection
    // — không cho row trỏ sang knowledge khác (invariant EVERY EXERCISE → ONE STRUCTURE).
    if (
      selectedPattern &&
      compareKey(row.structure) !== compareKey(selectedPattern)
    ) {
      row._errors.push('Dòng không khớp cấu trúc đã chọn ở dropdown.');
      warnings.push(`Dòng ${lineNumber}: không khớp cấu trúc đã chọn, sẽ bị loại khỏi import.`);
    }

    rows.push(row);
  });

  return { rows, warnings, hadHeader, format };
}

/**
 * Dedupe key cho exercise trong cùng batch:
 *   structure + type + question (case-insensitive + whitespace-normalized).
 * Trả về null khi row thiếu thành phần định danh — row đó đã có `_errors` riêng
 * và sẽ bị loại khỏi payload ở bước sau.
 */
export function exerciseDedupeKey(row) {
  const s = structureKey(row.structure);
  const q = compareKey(row.question);
  if (!s || !row.type || !q) return null;
  return `${s}|${row.type}|${q}`;
}

/**
 * Dedupe TRONG cùng batch theo exerciseDedupeKey: giữ dòng đầu, các dòng sau
 * bị loại kèm `_reason` (giống hành vi dedupe của CP2).
 *
 * KHÔNG dedupe với database — RPC import_structure_exercises là APPEND-ONLY
 * (semantics đã khóa ở CP1); trùng với DB là trách nhiệm của content author.
 *
 * Row thiếu key định danh được giữ nguyên: `_errors` của nó sẽ loại khỏi payload.
 */
export function dedupeExerciseRows(rows) {
  const seen = new Set();
  const duplicates = [];
  const kept = [];

  (rows || []).forEach((row) => {
    const key = exerciseDedupeKey(row);
    if (key === null) {
      kept.push(row);
      return;
    }
    if (seen.has(key)) {
      duplicates.push({
        ...row,
        _reason: 'Trùng structure + type + question trong nội dung nhập (chỉ giữ dòng đầu)',
      });
      return;
    }
    seen.add(key);
    kept.push(row);
  });

  return { rows: kept, duplicates };
}

/**
 * Đánh dấu các row tham chiếu Structure CHƯA tồn tại trong DB.
 * Exercise import KHÔNG tự tạo Structure — Knowledge phải được import trước
 * (flow chính thức: Knowledge Import -> Structure exists -> Exercise Import).
 * Row lỗi sẽ nhận thêm `_errors` -> không vào payload.
 */
export function markMissingStructures(rows, existingPatterns = []) {
  const existing = new Set((existingPatterns || []).map((p) => structureKey(p)));
  (rows || []).forEach((row) => {
    const key = structureKey(row.structure);
    if (key && !existing.has(key)) {
      row._errors.push('Structure chưa tồn tại — hãy Import Knowledge trước.');
    }
  });
  return rows;
}

/**
 * Chuẩn bị payload cho RPC import_structure_exercises.
 * - Chỉ gồm các row HỢP LỆ (isValidExerciseRow) — invalid rows KHÔNG gửi RPC.
 * - production giữ answer rỗng nếu không nhập (RPC/table CHECK cho phép).
 * - explanation rỗng -> null.
 */
export function toExerciseImportPayload(rows) {
  return (rows || [])
    .filter(isValidExerciseRow)
    .map((r) => ({
      pattern: normalizePattern(r.structure),
      type: r.type,
      question: String(r.question || '').trim(),
      answer: String(r.answer || '').trim(),
      options: (r.options || []).map((s) => String(s || '').trim()).filter(Boolean),
      explanation: String(r.explanation || '').trim() || null,
    }));
}