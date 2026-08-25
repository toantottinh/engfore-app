import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Tests cho Exercise Import (CHECKPOINT 3):
//   - utils/exercise-importer.js (parser, validate theo type, dedupe,
//     mark-missing-structure, payload)
//   - services/structure.service.js#importStructureExercises (RPC wrapper)
//
// Mock supabase client theo pattern của CP2 — không cần DB thật.
// ------------------------------------------------------------------

const rpcMock = vi.fn(async () => ({ data: null, error: null }));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: () => ({
      select: async () => ({ data: [], error: null }),
    }),
  },
}));

import {
  parseExerciseText,
  isValidExerciseRow,
  validateExerciseRow,
  exerciseDedupeKey,
  dedupeExerciseRows,
  markMissingStructures,
  toExerciseImportPayload,
  VALID_EXERCISE_TYPES,
} from '../utils/exercise-importer.js';
import { importStructureExercises } from '../services/structure.service.js';

const MC_LINE =
  'I want to + V | multiple_choice | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want learning English. ;; I want to learn English. | Sau want to dùng động từ nguyên mẫu.';
const FILL_LINE =
  'I want to + V | fill_blank | I want to ___ English. | learn | learn ;; learning ;; learned | Sau want to dùng động từ nguyên mẫu.';
const TRANSLATION_LINE =
  'I want to + V | translation | Tôi muốn học tiếng Anh. | I want to learn English. |  | Dùng want to + V.';
const CORRECTION_LINE =
  'I want to + V | correction | I want learning English. | I want to learn English. |  | Sau want to dùng to + V.';
const REARRANGE_LINE =
  'I want to + V | rearrange | want ;; I ;; English ;; to ;; learn | I want to learn English. |  | Subject + want to + V.';
const PRODUCTION_LINE =
  'I want to + V | production | Viết một câu sử dụng I want to + V. |  |  | Tự tạo câu sử dụng cấu trúc.';

function firstRow(text) {
  const { rows } = parseExerciseText(text);
  return rows[0];
}

describe('parseExerciseText — general', () => {
  it('parse đúng một dòng hợp lệ đủ 6 trường', () => {
    const row = firstRow(MC_LINE);
    expect(row.structure).toBe('I want to + V');
    expect(row.type).toBe('multiple_choice');
    expect(row.question).toBe('Which sentence is correct?');
    expect(row.answer).toBe('I want to learn English.');
    expect(row.options).toEqual([
      'I want learn English.',
      'I want learning English.',
      'I want to learn English.',
    ]);
    expect(row.explanation).toBe('Sau want to dùng động từ nguyên mẫu.');
    expect(isValidExerciseRow(row)).toBe(true);
  });

  it('trim toàn bộ các ô và thu gọn khoảng trắng trong structure key', () => {
    const row = firstRow(
      '   There is / There are   |  fill_blank  |  There ___ a book.  |  is  |  is ;; are  |  Tồn tại  '
    );
    expect(row.structure).toBe('There is / There are');
    expect(row.type).toBe('fill_blank');
    expect(row.answer).toBe('is');
    expect(row.options).toEqual(['is', 'are']);
    expect(isValidExerciseRow(row)).toBe(true);
  });

  it('sai số cột (4 hoặc 7 cột) -> row lỗi', () => {
    const four = firstRow('P | translation | Q | A');
    const seven = firstRow('P | translation | Q | A | O | E | Thừa');
    expect(isValidExerciseRow(four)).toBe(false);
    expect(four._errors.join(' ')).toMatch(/sai số cột/);
    expect(isValidExerciseRow(seven)).toBe(false);
    expect(seven._errors.join(' ')).toMatch(/sai số cột/);
  });

  it('5 cột khi CHƯA chọn structure -> lỗi yêu cầu chọn (format mới cần selection)', () => {
    const row = firstRow('P | translation | Q | A | B');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/chưa chọn "Cấu trúc kiến thức"/i);
  });

  it('thiếu Structure (cột 1 rỗng) -> row lỗi', () => {
    const row = firstRow(' | translation | Q | A |  | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/Thiếu cấu trúc/);
  });

  it('thiếu Type (cột 2 rỗng) -> row lỗi liệt kê 6 type hợp lệ', () => {
    const row = firstRow('P |  | Q | A |  | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/Type không hợp lệ/);
    expect(row._errors.join(' ')).toContain('production');
  });

  it('Type không nằm trong 6 giá trị -> row lỗi', () => {
    const row = firstRow('P | dictation | Q | A |  | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/dictation/);
  });

  it('thiếu Question (cột 3 rỗng) -> row lỗi', () => {
    const row = firstRow('P | translation |  | A |  | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/Thiếu câu hỏi/);
  });

  it('nhận diện và bỏ qua dòng header', () => {
    const result = parseExerciseText(
      'Structure | Type | Question | Answer | Options | Explanation\n' + MC_LINE
    );
    expect(result.hadHeader).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].type).toBe('multiple_choice');
  });

  it('dòng không có dấu "|" -> row lỗi rõ ràng', () => {
    const row = firstRow('một dòng lạc quỷ');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/không có dấu "\|"/);
  });

  it('text rỗng trả về danh sách rỗng', () => {
    const result = parseExerciseText(' \n \n');
    expect(result.rows).toEqual([]);
    expect(result.hadHeader).toBe(false);
    expect(result.format).toBe('pipe');
  });
});

describe('validation theo exercise type', () => {
  it('multiple_choice hợp lệ', () => {
    const row = firstRow(MC_LINE);
    expect(isValidExerciseRow(row)).toBe(true);
  });

  it('multiple_choice thiếu đáp án -> lỗi', () => {
    const row = firstRow('P | multiple_choice | Which is correct? |  | X. ;; Y. ;; Z. | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/thiếu đáp án/);
  });

  it('multiple_choice chỉ có 1 option -> lỗi', () => {
    const row = firstRow('P | multiple_choice | Which is correct? | B. | A. | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/ít nhất 2 options/);
  });

  it('multiple_choice đáp án KHÔNG nằm trong options -> lỗi', () => {
    const row = firstRow(
      'P | multiple_choice | Which is correct? | I want to learn English. | A. ;; B. | E'
    );
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/phải xuất hiện trong Options/);
  });

  it('multiple_choice options trùng nhau -> lỗi (so sánh case-insensitive)', () => {
    const row = firstRow(
      'P | multiple_choice | Which is correct? | B. | A. ;; B. ;; b. | E'
    );
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/Options bị trùng/);
  });

  it('fill_blank hợp lệ (options chứa đáp án)', () => {
    const row = firstRow(FILL_LINE);
    expect(isValidExerciseRow(row)).toBe(true);
  });

  it('fill_blank thiếu đáp án -> lỗi', () => {
    const row = firstRow('P | fill_blank | I want to ___ English. |  | learn ;; learning | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/thiếu đáp án/);
  });

  it('fill_blank question thiếu blank "___" -> lỗi', () => {
    const row = firstRow('P | fill_blank | I want to __ English. | learn |  | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/blank "___"/);
  });

  it('fill_blank CÓ Options nhưng đáp án không nằm trong -> ERROR', () => {
    const row = firstRow('P | fill_blank | I want to ___ English. | learn | learning ;; learned | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/phải xuất hiện trong Options/);
  });

  it('translation hợp lệ (Options rỗng)', () => {
    const row = firstRow(TRANSLATION_LINE);
    expect(isValidExerciseRow(row)).toBe(true);
    expect(row.options).toEqual([]);
  });

  it('correction hợp lệ', () => {
    const row = firstRow(CORRECTION_LINE);
    expect(isValidExerciseRow(row)).toBe(true);
  });

  it('rearrange hợp lệ (tokens phân cách ";;")', () => {
    const row = firstRow(REARRANGE_LINE);
    expect(isValidExerciseRow(row)).toBe(true);
  });

  it('rearrange ít hơn 2 tokens -> lỗi', () => {
    const row = firstRow('P | rearrange | learn | I want to learn. |  | E');
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/ít nhất 2 tokens/);
  });

  it('production hợp lệ KHÔNG cần Answer (non-deterministic)', () => {
    const row = firstRow(PRODUCTION_LINE);
    expect(isValidExerciseRow(row)).toBe(true);
    expect(row.answer).toBe('');
    expect(row.options).toEqual([]);
  });

  it('production CÓ Answer -> vẫn hợp lệ + warning "chỉ là example/target"', () => {
    const row = firstRow(
      'P | production | Viết một câu sử dụng I want to + V. | I want to go home. |  | E'
    );
    expect(isValidExerciseRow(row)).toBe(true);
    expect(row._warnings.join(' ')).toMatch(/không dùng để chấm tự động/);
  });
});

describe('validateExerciseRow — revalidate sau khi sửa tay', () => {
  it('sửa type về hợp lệ sẽ XÓA _errors cũ và tính lại đúng rule', () => {
    const bad = { structure: 'P', type: '', question: '', answer: '', options: [], explanation: '' };
    validateExerciseRow(bad);
    expect(bad._errors.length).toBeGreaterThan(0);

    // Admin sửa qua UI -> gọi lại validateExerciseRow trên row đã đổi.
    bad.type = 'fill_blank';
    bad.question = 'I ___ English.';
    bad.answer = 'study';
    validateExerciseRow(bad);
    expect(bad._errors).toEqual([]);
    expect(isValidExerciseRow(bad)).toBe(true);
  });
});

describe('dedupeExerciseRows — trùng trong cùng batch', () => {
  it('trùng structure+type+question: giữ dòng đầu, dòng sau vào duplicates kèm _reason', () => {
    const { rows } = parseExerciseText(FILL_LINE + '\n' + FILL_LINE);
    const { rows: kept, duplicates } = dedupeExerciseRows(rows);
    expect(kept).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]._reason).toMatch(/Trùng structure \+ type \+ question/);
  });

  it('dedupe key case-insensitive + whitespace-normalized', () => {
    const { rows } = parseExerciseText(
      'P | translation | I   want to learn English. | X |  | E\np | TRANSLATION | i want TO learn english. | Y |  | E'
    );
    const { rows: kept, duplicates } = dedupeExerciseRows(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0].answer).toBe('X'); // dòng đầu thắng
    expect(duplicates).toHaveLength(1);
  });

  it('cùng question nhưng KHÁC type -> không trùng', () => {
    const { rows } = parseExerciseText(
      'P | translation | Same question? | A |  | E\nP | correction | Same question? | B |  | E'
    );
    const { rows: kept, duplicates } = dedupeExerciseRows(rows);
    expect(kept).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });

  it('exerciseDedupeKey trả null khi thiếu thành phần định danh', () => {
    expect(exerciseDedupeKey({ structure: '', type: 'translation', question: 'Q' })).toBeNull();
    expect(exerciseDedupeKey({ structure: 'P', type: '', question: 'Q' })).toBeNull();
    expect(exerciseDedupeKey({ structure: 'P', type: 'translation', question: '  ' })).toBeNull();
  });
});

describe('markMissingStructures — Structure phải tồn tại trước', () => {
  it('pattern chưa tồn tại -> gắn ERROR "hãy Import Knowledge trước"', () => {
    const { rows } = parseExerciseText('There is / There are | fill_blank | There ___ a book. | is |  | E');
    markMissingStructures(rows, ['I want to + V']);
    expect(isValidExerciseRow(rows[0])).toBe(false);
    expect(rows[0]._errors.join(' ')).toMatch(/Import Knowledge trước/);
  });

  it('pattern đã tồn tại (case-insensitive) -> không thêm lỗi', () => {
    const row = firstRow(FILL_LINE);
    markMissingStructures([row], ['I WANT TO + V']);
    expect(isValidExerciseRow(row)).toBe(true);
  });
});

describe('toExerciseImportPayload — payload cho RPC import_structure_exercises', () => {
  it('đúng shape RPC: pattern/type/question/answer/options/explanation', () => {
    const { rows } = parseExerciseText(MC_LINE);
    const [payload] = toExerciseImportPayload(rows);
    expect(payload).toEqual({
      pattern: 'I want to + V',
      type: 'multiple_choice',
      question: 'Which sentence is correct?',
      answer: 'I want to learn English.',
      options: ['I want learn English.', 'I want learning English.', 'I want to learn English.'],
      explanation: 'Sau want to dùng động từ nguyên mẫu.',
    });
  });

  it('LOẠI các row không hợp lệ khỏi payload', () => {
    const { rows } = parseExerciseText(
      MC_LINE + '\n' + 'P | dictation | Q | A |  | E'
    );
    const payloads = toExerciseImportPayload(rows);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].type).toBe('multiple_choice');
  });

  it('options là mảng; explanation rỗng -> null', () => {
    const { rows } = parseExerciseText(TRANSLATION_LINE.replace('| Dùng want to + V.', '|'));
    const [payload] = toExerciseImportPayload(rows);
    expect(Array.isArray(payload.options)).toBe(true);
    expect(payload.options).toEqual([]);
    expect(payload.explanation).toBeNull();
  });

  it('production giữ answer rỗng — hợp lệ để gửi RPC', () => {
    const { rows } = parseExerciseText(PRODUCTION_LINE);
    const [payload] = toExerciseImportPayload(rows);
    expect(payload.type).toBe('production');
    expect(payload.answer).toBe('');
  });

  it('row bị markMissingStructures đánh dấu -> bị loại khỏi payload', () => {
    const { rows } = parseExerciseText(FILL_LINE);
    markMissingStructures(rows, []); // DB chưa có structure nào
    expect(toExerciseImportPayload(rows)).toHaveLength(0);
  });
});

describe('importStructureExercises — service wrapper (RPC import_structure_exercises)', () => {
  beforeEach(() => {
    rpcMock.mockClear();
    rpcMock.mockImplementation(async () => ({ data: null, error: null }));
  });

  it('gọi đúng RPC name với p_rows payload', async () => {
    const exercises = [{ pattern: 'P', type: 'translation', question: 'Q', answer: 'A', options: [], explanation: null }];
    await importStructureExercises({ exercises });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('import_structure_exercises', { p_rows: exercises });
  });

  it('trả meta (created/errored) từ dòng đầu của kết quả RPC', async () => {
    rpcMock.mockImplementation(async () => ({ data: [{ created: 3, errored: 1 }], error: null }));
    const { error, meta } = await importStructureExercises({ exercises: [] });
    expect(error).toBeNull();
    expect(meta).toEqual({ created: 3, errored: 1 });
  });

  it('RPC lỗi -> trả { data: null, error, meta: null } theo convention service', async () => {
    const rpcError = { message: 'Only admins can import structure exercises.', code: 'P0001' };
    rpcMock.mockImplementation(async () => ({ data: null, error: rpcError }));
    const { data, error, meta } = await importStructureExercises({ exercises: [{ pattern: 'P' }] });
    expect(data).toBeNull();
    expect(error).toBe(rpcError);
    expect(meta).toBeNull();
  });

  it('payload không phải mảng -> vẫn gọi RPC với mảng rỗng (an toàn)', async () => {
    await importStructureExercises({ exercises: undefined });
    expect(rpcMock).toHaveBeenCalledWith('import_structure_exercises', { p_rows: [] });
  });
});

// ------------------------------------------------------------------
// UX: chọn Structure/Knowledge trước khi nhập (format 5 cột).
// Flow bắt buộc: selectedStructure -> parse -> payload -> RPC
//   -> structure_exercises.structure_id = structure đã chọn.
// ------------------------------------------------------------------

const FIVE_COL = [
  'multiple_choice | Which sentence is correct? | I want to learn English. | A ;; I want to learn English. ;; B | E',
  'fill_blank | I want to ___ English. | learn | learn ;; learning ;; learned | E',
].join('\n');

describe('parseExerciseText — đã chọn Structure (format 5 cột)', () => {
  it('gắn structure ĐÃ CHỌN vào MỌI row; cả batch cùng một knowledge', () => {
    const { rows } = parseExerciseText(FIVE_COL, { selectedPattern: 'I want to + V' });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.structure === 'I want to + V')).toBe(true);
    expect(new Set(rows.map((r) => r.structure)).size).toBe(1); // ONE STRUCTURE
    expect(rows.every(isValidExerciseRow)).toBe(true);
  });

  it('CHƯA chọn structure -> mỗi dòng báo lỗi, không có row hợp lệ', () => {
    const { rows } = parseExerciseText(FIVE_COL);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => !isValidExerciseRow(r))).toBe(true);
    expect(rows[0]._errors.join(' ')).toMatch(/chưa chọn "Cấu trúc kiến thức"/i);
    // Không có gì để gửi RPC:
    expect(toExerciseImportPayload(rows)).toHaveLength(0);
  });

  it('legacy 6 cột KHÔNG chọn structure vẫn hoạt động (backward compatible)', () => {
    const { rows } = parseExerciseText(MC_LINE);
    expect(rows[0].structure).toBe('I want to + V');
    expect(isValidExerciseRow(rows[0])).toBe(true);
  });

  it('legacy row TRỎ SANG structure khác khi đã chọn -> bị CHẶN, không vào payload', () => {
    const { rows } = parseExerciseText(
      'There is / There are | fill_blank | There ___ a book. | is | is ;; are | E',
      { selectedPattern: 'I want to + V' }
    );
    expect(isValidExerciseRow(rows[0])).toBe(false);
    expect(rows[0]._errors.join(' ')).toMatch(/không khớp cấu trúc đã chọn/);
    expect(toExerciseImportPayload(rows)).toHaveLength(0);
  });

  it('legacy row CÙNG structure (case-insensitive) -> chấp nhận', () => {
    const { rows } = parseExerciseText(
      'i WANT TO + v | translation | Q | A |  | E',
      { selectedPattern: 'I want to + V' }
    );
    expect(isValidExerciseRow(rows[0])).toBe(true);
  });

  it('header 5 cột được nhận diện và bỏ qua', () => {
    const result = parseExerciseText(
      'Type | Question | Answer | Options | Explanation\n' + FIVE_COL,
      { selectedPattern: 'I want to + V' }
    );
    expect(result.hadHeader).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  it('payload cho RPC: MỖI row mang pattern của structure đã chọn (single target)', () => {
    const { rows } = parseExerciseText(FIVE_COL, { selectedPattern: 'I want to + V' });
    const payloads = toExerciseImportPayload(rows);
    expect(payloads).toHaveLength(2);
    // Pre-resolution guarantee: toàn batch trỏ đúng MỘT knowledge.
    // (RPC resolve pattern -> structures.id rồi lưu structure_id — FK NOT NULL.)
    expect(new Set(payloads.map((p) => p.pattern))).toEqual(new Set(['I want to + V']));
    expect(payloads.every((p) => p.type && p.question)).toBe(true);
  });
});

// ------------------------------------------------------------------
// CK8 REGRESSION — nhiều exercise cùng type + đủ 6 type + thứ tự lỗi gốc (#16)
// ------------------------------------------------------------------

describe('parseExerciseText — CK8: NHIỀU row cùng type là HỢP LỆ', () => {
  it('I. multiple_choice ×3 (câu hỏi khác nhau) -> 3 row hợp lệ, dedupe giữ cả 3', () => {
    const lines = [
      'I want to + V | multiple_choice | Câu 1? | A | A ;; I want to learn English. ;; B | E1',
      'I want to + V | multiple_choice | Câu 2? | A | A ;; I want to learn English. ;; B | E2',
      'I want to + V | multiple_choice | Câu 3? | A | A ;; I want to learn English. ;; B | E3',
    ].join('\n');
    const { rows } = parseExerciseText(lines);
    expect(rows).toHaveLength(3);
    expect(rows.every(isValidExerciseRow)).toBe(true);

    // Dedupe chỉ loại TRÙNG structure+type+question — KHÔNG giới hạn số lượng
    // theo type ("1 type = 1 exercise" bị cấm):
    const { rows: kept, duplicates } = dedupeExerciseRows(rows);
    expect(kept).toHaveLength(3);
    expect(duplicates).toHaveLength(0);

    // Toàn bộ vào payload gửi RPC:
    expect(toExerciseImportPayload(rows)).toHaveLength(3);
  });

  it('J. CẢ SÁU type đều parse hợp lệ trong cùng một batch', () => {
    const batch = [
      MC_LINE,
      FILL_LINE,
      TRANSLATION_LINE,
      CORRECTION_LINE,
      REARRANGE_LINE,
      PRODUCTION_LINE,
    ].join('\n');
    const { rows } = parseExerciseText(batch);
    expect(rows).toHaveLength(6);
    expect(rows.every(isValidExerciseRow)).toBe(true);
    expect([...new Set(rows.map((r) => r.type))].sort()).toEqual(
      [...VALID_EXERCISE_TYPES].sort()
    );
    // rearrange giữ tokens ở Question; production cho phép Answer rỗng:
    expect(rows.find((r) => r.type === 'rearrange').question).toContain(';;');
    expect(rows.find((r) => r.type === 'production').answer).toBe('');
  });

  it('#16. Row sai FORMAT cột -> CHỈ lỗi gốc, không kèm nhiễu type/structure/mismatch', () => {
    // Dòng 7 cột (thừa), structure "Ghost Pattern" chưa tồn tại trong DB,
    // đã selectedPattern trên UI -> nếu cascade sẽ sinh 3 lỗi gây nhiễu.
    const { rows } = parseExerciseText(
      'Ghost Pattern | translation | Q | A | O | E | Thừa',
      { selectedPattern: 'I want to + V' }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]._errors).toHaveLength(1);
    expect(rows[0]._errors[0]).toMatch(/sai số cột/);

    // markMissingStructures không gắn thêm "Structure chưa tồn tại" vào row
    // đã parse-sai format (lỗi gốc ưu tiên hiển thị trước):
    markMissingStructures(rows, []);
    expect(rows[0]._errors).toHaveLength(1);
  });
});

// ------------------------------------------------------------------
// EXERCISE V2 — Answer nhiều accepted answers bằng "||", Options vẫn ";;"
// ------------------------------------------------------------------

describe('parseExerciseText — V2: "||" cho accepted answers, ";;" cho Options', () => {
  it('5-cột: Answer chứa "||" được giữ nguyên qua parse + payload; Options trống', () => {
    const { rows } = parseExerciseText(
      'translation | Tôi muốn học tiếng Anh mỗi ngày. | I want to learn English every day. || I want to study English every day. | | Dùng want to + V.',
      { selectedPattern: 'I want to + V' }
    );
    expect(rows).toHaveLength(1);
    expect(isValidExerciseRow(rows[0])).toBe(true);
    expect(rows[0].answer).toBe(
      'I want to learn English every day. || I want to study English every day.'
    );
    expect(rows[0].options).toEqual([]); // cột Options rỗng

    const [payload] = toExerciseImportPayload(rows);
    expect(payload.answer).toContain('||'); // DB lưu raw, grading tách lúc chấm
  });

  it('Options vẫn dùng ";;" — hai delimiter KHÔNG bị nhầm', () => {
    const { rows } = parseExerciseText(FILL_LINE);
    expect(isValidExerciseRow(rows[0])).toBe(true);
    expect(rows[0].options.length).toBeGreaterThan(1); // tách bởi ;;
    expect(rows[0].options.join('|')).not.toContain('||');
    expect(rows[0].answer).not.toContain(';;');
  });

  it('fill_blank với nhiều accepted answers vẫn hợp lệ (answer bắt buộc có)', () => {
    const { rows } = parseExerciseText(
      'fill_blank | I ___ to learn English every day. | want || study | | Dùng want to + V.',
      { selectedPattern: 'I want to + V' }
    );
    expect(isValidExerciseRow(rows[0])).toBe(true);
    expect(rows[0].answer).toBe('want || study');
  });

  it('Answer chứa ";;" -> CẢNH BÁO nhầm delimiter (row vẫn hợp lệ nếu đủ field)', () => {
    const row = validateExerciseRow({
      structure: 'I want to + V',
      type: 'translation',
      question: 'Q',
      answer: 'learn ;; study',
      options: [],
      explanation: '',
    });
    expect(isValidExerciseRow(row)).toBe(true); // warning, không error
    expect(row._warnings.join(' ')).toMatch(/\|\|/);
  });

  it('legacy 6 cột vẫn hoạt động song song (backward compatible)', () => {
    const { rows } = parseExerciseText(`${MC_LINE}\n${TRANSLATION_LINE}`);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.structure === 'I want to + V')).toBe(true);
    expect(rows.every(isValidExerciseRow)).toBe(true);
  });
});

// ------------------------------------------------------------------
// CK10 PHẦN B — lỗi gắn nhãn ROW cụ thể (B5) + bảo vệ delimiter "|"/"||"
// ------------------------------------------------------------------

describe('parseExerciseText — B5/B6: báo đúng row gặp lỗi', () => {
  it('8. Type không hợp lệ -> lỗi mang số dòng', () => {
    const { rows } = parseExerciseText('P | abc | Q | A | | E');
    expect(isValidExerciseRow(rows[0])).toBe(false);
    expect(rows[0]._errors.some((m) => m.includes('Dòng 1:') && m.includes('Type không hợp lệ'))).toBe(
      true
    );
  });

  it('9. Question rỗng -> lỗi mang số dòng của row ĐÓ', () => {
    const lines = [
      'P | translation | OK | A | | E',
      'P | translation | | A | | E',
    ].join('\n');
    const { rows } = parseExerciseText(lines);
    expect(rows[1]._errors.some((m) => m.includes('Dòng 2:') && m.includes('Thiếu câu hỏi'))).toBe(
      true
    );
  });

  it('7. Sai số cột -> ĐÚNG MỘT lỗi gốc có số dòng', () => {
    const { rows } = parseExerciseText('multiple_choice | Question | Answer');
    expect(rows[0]._errors).toHaveLength(1);
    expect(rows[0]._errors[0]).toMatch(/Dòng 1: sai số cột/);
  });

  it('6b. "||" KHÔNG bị tách thành columns — cell giữ nguyên 5 trường', () => {
    const { rows } = parseExerciseText(
      'fill_blank | I ___ English every day. | study || learn | | E',
      { selectedPattern: 'P' }
    );
    expect(rows).toHaveLength(1);
    expect(isValidExerciseRow(rows[0])).toBe(true);
    expect(rows[0].question).toBe('I ___ English every day.');
    expect(rows[0].answer).toBe('study || learn');
    expect(rows[0].options).toEqual([]);
    expect(rows[0].explanation).toBe('E');
  });

  it('13b. Answer chứa ";;" -> warning có số dòng', () => {
    const { rows } = parseExerciseText('P | translation | Q | learn ;; study | | E');
    expect(isValidExerciseRow(rows[0])).toBe(true); // warning, không error
    expect(rows[0]._warnings.join(' ')).toMatch(/Dòng 1:/);
    expect(rows[0]._warnings.join(' ')).toMatch(/\|\|/);
  });
});
