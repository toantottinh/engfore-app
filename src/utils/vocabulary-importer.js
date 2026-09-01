/**
 * Vocabulary Importer / Parser (KHÔNG tích hợp AI API).
 * Chấp nhận:
 *  1) Danh sách từ đơn (mỗi dòng 1 từ):
 *       apple
 *       lion
 *       fan
 *  2) Format pipe 7 cột (có hoặc không header):
 *       Word | IPA | Type | Meaning | Example | Memory Clue | CEFR
 *       apple | /ˈæp.əl/ | noun | quả táo | She ate an apple. | A round fruit. | A1
 *
 * Xử lý khoảng trắng thừa, bỏ dòng trống, tự nhận diện header,
 * chuẩn hóa word_type & cefr. KHÔNG sửa nội dung người dùng nhập.
 */

import { normalizeCefr as normalizeCefrLevel } from './cefr.js';

const PIPE_DELIMITER = '|';

// Header mặc định của format pipe (không phân biệt hoa/thường, bỏ khoảng trắng).
const HEADER_ALIASES = {
  word: 'word',
  'từ': 'word',
  tu: 'word',
  ipa: 'ipa',
  type: 'word_type',
  'loại': 'word_type',
  loai: 'word_type',
  'loại từ': 'word_type',
  'loai tu': 'word_type',
  meaning: 'meaning',
  'nghĩa': 'meaning',
  nghia: 'meaning',
  example: 'example',
  'ví dụ': 'example',
  'vi du': 'example',
  description: 'memory_clue',
  'memory clue': 'memory_clue',
  'memory_clue': 'memory_clue',
  'mô tả': 'memory_clue',
  'mo ta': 'memory_clue',
  'ghi chú': 'memory_clue',
  'ghi chu': 'memory_clue',
  cefr: 'cefr',
  'cấp độ': 'cefr',
  'cap do': 'cefr',
  'cấp độ cefr': 'cefr',
  'cap do cefr': 'cefr',
  level: 'cefr',
};

// Enum word_type chính thức của production DB — ĐÚNG 11 giá trị:
//   noun, verb, adjective, adverb, pronoun, preposition, conjunction,
//   determiner, interjection, phrasal_verb, other
// `verb_phrase` KHÔNG còn là Type hợp lệ — mọi phrase (verb phrase, noun
// phrase, adjective phrase, adverb phrase, prepositional phrase, expression,
// collocation, ...) đều dùng `other`.
// Dùng đúng set này để tránh lỗi PostgreSQL 22P02 khi gọi import_words_to_set.
export const VALID_WORD_TYPES = new Set([
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'determiner',
  'interjection',
  'phrasal_verb',
  'other',
]);

// Bảng chuẩn hóa các biến thể do người dùng nhập về giá trị enum word_type hợp lệ.
// - Phrasal verb -> phrasal_verb.
// - MỌI phrase/expression/collocation (kể cả verb phrase, noun phrase, ...)
//   -> other (KHÔNG tạo verb_phrase).
// - Nếu không khớp bất kỳ alias nào, fallback về 'other' (không làm hỏng INSERT)
//   và báo warning để người dùng tự xem lại.
const WORD_TYPE_ALIASES = {
  // Phrasal verb
  'phrasal verb': 'phrasal_verb',
  'phrasal_verb': 'phrasal_verb',
  'phrasal-verb': 'phrasal_verb',
  'phrasalverb': 'phrasal_verb',
  'phrasal verbs': 'phrasal_verb',

  // Other / phrases
  other: 'other',
  phrase: 'other',
  phrases: 'other',
  expression: 'other',
  expressions: 'other',
  collocation: 'other',
  collocations: 'other',

  // Verb phrase -> other (KHÔNG còn verb_phrase)
  'verb phrase': 'other',
  'verb_phrase': 'other',
  'verb-phrase': 'other',
  'verbphrase': 'other',
  'verb phrases': 'other',

  // Noun phrase -> other (KHÔNG còn map về noun)
  'noun phrase': 'other',
  'noun_phrase': 'other',
  'noun-phrase': 'other',
  'nounphrase': 'other',
  'noun phrases': 'other',

  // Adjective phrase -> other
  'adjective phrase': 'other',
  'adjective_phrase': 'other',
  'adjective-phrase': 'other',
  'adjectivephrase': 'other',
  'adjective phrases': 'other',

  // Adverb phrase -> other
  'adverb phrase': 'other',
  'adverb_phrase': 'other',
  'adverb-phrase': 'other',
  'adverbphrase': 'other',
  'adverb phrases': 'other',

  // Prepositional phrase -> other
  'prepositional phrase': 'other',
  'prepositional_phrase': 'other',
  'prepositional-phrase': 'other',
  'prepositionalphrase': 'other',
  'prepositional phrases': 'other',

  // Determiner
  determiner: 'determiner',
  'xác định từ': 'determiner',

  // Interjection
  interjection: 'interjection',
  interj: 'interjection',
  'interj.': 'interjection',
  'thán từ': 'interjection',

  // Các viết tắt / biến thể thông dụng
  'v.': 'verb',
  'n.': 'noun',
  'adj.': 'adjective',
  'adv.': 'adverb',
  'prep.': 'preposition',
  'conj.': 'conjunction',
  'pron.': 'pronoun',
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
 * Một dòng là header khi >= 2 cột và (gần như) mọi cột đều khớp alias header.
 */
function isHeaderRow(cells) {
  if (cells.length < 2) return false;
  let matched = 0;
  for (const cell of cells) {
    const key = normalizeHeaderCell(cell);
    if (HEADER_ALIASES[key]) matched += 1;
  }
  // Header hợp lệ khi >= 4/7 cột khớp alias (đủ đặc trưng).
  return matched >= 4 && matched / cells.length >= 0.5;
}

/**
 * Chia một dòng thành các cột theo delimiter pipe.
 * Giữ nguyên nguồn dữ liệu, chỉ trim từng ô.
 */
function splitPipeLine(line) {
  return line.split(PIPE_DELIMITER).map((cell) => cell.trim());
}

/**
 * Chuẩn hóa trường word_type về enum hợp lệ (production DB dùng PostgreSQL ENUM).
 * - Nếu là giá trị hợp lệ: giữ nguyên.
 * - Nếu khớp alias (vd "phrasal verb" → "phrasal_verb", "verb phrase" → "other"):
 *   quy về giá trị enum hợp lệ (identifier để người dùng tự xem lại; KHÔNG làm
 *   hỏng INSERT).
 * - Không khớp gì: fallback về 'other' và đánh dấu cảnh báo.
 * @returns {{ value: string, changed: boolean }}
 */
export function normalizeWordType(value) {
  const raw = String(value || '').trim();
  const v = raw.toLowerCase();
  if (VALID_WORD_TYPES.has(v)) return { value: v, changed: false };
  if (WORD_TYPE_ALIASES[v]) return { value: WORD_TYPE_ALIASES[v], changed: true };
  if (v) return { value: 'other', changed: true };
  return { value: '', changed: false };
}

/**
 * Chuẩn hóa cefr về chữ hoa và chỉ chấp nhận A1–C2.
 * Nếu không hợp lệ hoặc bỏ trống => trả về null (UNKNOWN).
 * KHÔNG tự đoán level. KHÔNG ghi đè giá trị người dùng đã nhập hợp lệ.
 */
function normalizeCefr(value) {
  return normalizeCefrLevel(value); // trả về string A1–C2 hoặc null
}

/**
 * Parse văn bản nhập vào thành mảng từ đã chuẩn hóa.
 *
 * @param {string} text - Văn bản người dùng dán.
 * @returns {{ rows: Array<{ word, ipa, word_type, meaning, example, memory_clue, cefr, _warnings: string[] }>,
 *            warnings: string[], hadHeader: boolean, format: 'single'|'pipe' }}
 */
export function parseVocabularyText(text) {
  const rawLines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const warnings = [];
  const rows = [];
  let hadHeader = false;
  let format = 'single';

  if (rawLines.length === 0) {
    return { rows, warnings, hadHeader, format };
  }

  // Xác định xem toàn bộ input có phải format pipe (dòng nào cũng có '|') hay không.
  const nonPipeCount = rawLines.filter((l) => !l.includes(PIPE_DELIMITER)).length;
  const isPipeInput = nonPipeCount === 0;

  if (isPipeInput) {
    format = 'pipe';

    const lines = [...rawLines];

    // Nhận diện và bỏ header nếu có.
    const firstCells = splitPipeLine(lines[0]);
    if (isHeaderRow(firstCells)) {
      hadHeader = true;
      lines.shift();
    }

    lines.forEach((line, idx) => {
      const cells = splitPipeLine(line);
      if (cells.length === 0) return;

      if (cells.length < 2) {
        // Dòng lẻ có 1 cột trong input pipe -> cảnh báo, bỏ qua để không hỏng dữ liệu.
        warnings.push(`Dòng ${idx + 1} chỉ có 1 cột, đã bỏ qua.`);
        return;
      }

const wt = normalizeWordType(cells[2]);
      const row = {
        word: cells[0] || '',
        ipa: cells[1] || '',
        word_type: wt.value,
        meaning: cells[3] || '',
        example: cells[4] || '',
        memory_clue: cells[5] || '',
        cefr: normalizeCefr(cells[6]),
        _warnings: [],
      };
      if (wt.changed) {
        row._warnings.push(
          `Loại từ "${cells[2]}" không hợp lệ, đã chuyển thành "${wt.value}".`
        );
        warnings.push(`Dòng "${cells[0] || '?'}": loại từ "${cells[2]}" → "${wt.value}".`);
      }
      rows.push(row);
    });
  } else {
    // Format danh sách từ đơn: mỗi dòng là 1 từ.
    format = 'single';
    rawLines.forEach((line) => {
      rows.push({
        word: line,
        ipa: '',
        word_type: '',
        meaning: '',
        example: '',
        memory_clue: '',
        cefr: '',
        _warnings: [],
      });
    });
  }

  // Gắn cảnh báo cho từng dòng thiếu trường bắt buộc.
  rows.forEach((row) => {
    if (!row.word.trim()) {
      row._warnings.push('Thiếu từ');
    }
    if (format === 'pipe' && !row.meaning.trim()) {
      row._warnings.push('Thiếu nghĩa');
    }
  });

  return { rows, warnings, hadHeader, format };
}

/**
 * Chuẩn bị dữ liệu để gửi lên importWordsToSet.
 * Loại bỏ trường nội bộ `_warnings`, chỉ giữ 7 trường của schema.
 * @param {Array} rows - Các dòng đã parse/chỉnh sửa.
 */
export function toImportPayload(rows) {
  return (rows || []).map((r) => {
    // Đảm bảo word_type luôn là giá trị enum hợp lệ (ngay cả khi người dùng
    // chỉnh sửa ô preview thành giá trị không hợp lệ) — tránh lỗi 22P02 enum.
    const wt = normalizeWordType(r.word_type);
    return {
      word: (r.word || '').trim(),
      ipa: (r.ipa || '').trim(),
      word_type: wt.value,
      meaning: (r.meaning || '').trim(),
      example: (r.example || '').trim(),
      memory_clue: (r.memory_clue || '').trim(),
      // Chuẩn hóa CEFR nghiêm ngặt: chỉ A1–C2 được giữ, còn lại null (Chưa xác định).
      cefr: normalizeCefr(r.cefr),
    };
  });
}

/**
 * Lọc các dòng bị trùng với từ đã có trong set (không phân biệt hoa/thường).
 * @param {Array} rows - Các dòng cần import.
 * @param {Array<string>} existingWords - Danh sách từ đã có trong set.
 * @returns {{ rows: Array, duplicates: Array }}
 */
export function dedupeRows(rows, existingWords) {
  const existing = new Set((existingWords || []).map((w) => String(w || '').toLowerCase()));
  const seen = new Set();
  const duplicates = [];
  const kept = [];

  (rows || []).forEach((row) => {
    const key = String(row.word || '').trim().toLowerCase();
    if (!key) {
      duplicates.push({ ...row, _reason: 'Thiếu từ' });
      return;
    }
    if (existing.has(key) || seen.has(key)) {
      duplicates.push({ ...row, _reason: 'Đã tồn tại trong bộ từ' });
      return;
    }
    seen.add(key);
    kept.push(row);
  });

  return { rows: kept, duplicates };
}
