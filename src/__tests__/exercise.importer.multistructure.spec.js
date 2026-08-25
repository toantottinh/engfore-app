import { describe, it, expect, vi } from 'vitest';

// ------------------------------------------------------------------
// Tests BULK MULTI-STRUCTURE Exercise Import:
//   Format mới 6 cột: Type | Structure | Question | Answer | Options | Explanation
//   - resolve Structure text -> structure_id theo đúng user hiện tại
//   - row-level errors, no silent failure, import-only-valid-batch
// Mirror mock supabase của exercise.importer.spec.js.
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
  resolveExerciseStructures,
  exerciseDedupeKey,
  dedupeExerciseRows,
  toExerciseImportPayload,
  VALID_EXERCISE_TYPES,
} from '../utils/exercise-importer.js';
import { importStructureExercises } from '../services/structure.service.js';

// Structures của USER HIỆN TẠI (như getStructuresForUser(user.id) trả về).
const MY_STRUCTURES = [
  { id: 's1', pattern: 'I want to + V' },
  { id: 's2', pattern: 'I need to + V' },
  { id: 's3', pattern: 'I have to + V' },
  { id: 's4', pattern: 'I like + V-ing' },
];

// Structure của USER KHÁC — tuyệt đối không được dùng để resolve.
const OTHER_USER_STRUCTURES = [{ id: 'other-user-s9', pattern: 'I need to + V' }];

const mc6 = (structure, question = 'Which sentence is correct?') =>
  [
    'multiple_choice',
    structure,
    question,
    'I want to learn English.',
    'I want learn English. ;; I want learning English. ;; I want to learn English.',
    'Sau want to dùng V nguyên mẫu.',
  ].join(' | ');

function parseAndResolve(text, structures = MY_STRUCTURES) {
  const { rows, warnings, hadHeader } = parseExerciseText(text);
  resolveExerciseStructures(rows, structures);
  return { rows, warnings, hadHeader };
}

// ------------------------------------------------------------------
// A. Parse 6-column format
// ------------------------------------------------------------------
describe('A. Parse 6-column canonical (Type | Structure | Question | Answer | Options | Explanation)', () => {
  it('A1. Parse đúng 6 trường, structure lấy từ CỘT 2', () => {
    const { rows } = parseExerciseText(
      'multiple_choice | I want to + V | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want learning English. ;; I want to learn English. | Sau want to dùng V nguyên mẫu.'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('multiple_choice');
    expect(rows[0].structure).toBe('I want to + V');
    expect(rows[0].question).toBe('Which sentence is correct?');
    expect(rows[0].answer).toBe('I want to learn English.');
    expect(rows[0].options).toEqual([
      'I want learn English.',
      'I want learning English.',
      'I want to learn English.',
    ]);
    expect(rows[0].explanation).toBe('Sau want to dùng V nguyên mẫu.');
    expect(isValidExerciseRow(rows[0])).toBe(true);
  });

  it('A2. Header 6 cột kiểu mới được nhận diện và bỏ qua', () => {
    const text = [
      'Type | Structure | Question | Answer | Options | Explanation',
      mc6('I want to + V'),
    ].join('\n');
    const { rows, hadHeader } = parseExerciseText(text);
    expect(hadHeader).toBe(true);
    expect(rows).toHaveLength(1);
    expect(isValidExerciseRow(rows[0])).toBe(true);
  });

  it('A3. Legacy 6 cột (Structure đầu dòng) vẫn parse song song', () => {
    const { rows } = parseExerciseText(
      'I want to + V | fill_blank | I want to ___ English. | learn | learn ;; learning ;; learned | E'
    );
    expect(rows[0].structure).toBe('I want to + V');
    expect(rows[0].type).toBe('fill_blank');
    expect(isValidExerciseRow(rows[0])).toBe(true);
  });
});

// ------------------------------------------------------------------
// B/C/D/E. Resolve structure_id + nhiều structure/type trong batch
// ------------------------------------------------------------------
describe('B-E. Resolve Structure -> structure_id; multi-row/multi-structure/multi-type', () => {
  it('B1. Structure text resolve ra ĐÚNG structure_id (không lộ UUID cho user)', () => {
    const { rows } = parseAndResolve(mc6('I need to + V'));
    expect(rows[0]._structureId).toBe('s2');
    expect(rows[0]._structureResolved.pattern).toBe('I need to + V');
    // Payload gửi RPC vẫn là pattern — RPC phía server mới chốt structure_id.
    const [payload] = toExerciseImportPayload(rows);
    expect(payload.pattern).toBe('I need to + V');
    expect(payload).not.toHaveProperty('structure_id');
  });

  it('C1. Nhiều row CÙNG Structure đều resolve đúng 1 id', () => {
    const text = [mc6('I want to + V'), mc6('I want to + V')].join('\n');
    const { rows } = parseAndResolve(text);
    expect(rows.every((r) => r._structureId === 's1')).toBe(true);
  });

  it('D1. NHIỀU structure trong cùng 1 batch -> mỗi row id riêng', () => {
    const text = [
      mc6('I want to + V'),
      'fill_blank | I need to + V | I need to ___ English. | learn | learn ;; learning ;; learned | E',
      'translation | I have to + V | Tôi phải đi làm hôm nay. | I have to go to work today. | | Dùng have to.',
    ].join('\n');
    const { rows } = parseAndResolve(text);
    expect(rows.map((r) => r._structureId)).toEqual(['s1', 's2', 's3']);
    expect(rows.every(isValidExerciseRow)).toBe(true);
  });

  it('E1. Cùng Structure + cùng Type nhiều lần vẫn HỢP LỆ và KHÔNG bị dedupe', () => {
    const text = [
      mc6('I want to + V', 'Question one?'),
      mc6('I want to + V', 'Question two?'),
      mc6('I want to + V', 'Question three?'),
    ].join('\n');
    const { rows } = parseAndResolve(text);
    expect(rows.every((r) => r._structureId === 's1')).toBe(true);
    expect(rows.every(isValidExerciseRow)).toBe(true);
    const { rows: kept, duplicates } = dedupeExerciseRows(rows);
    expect(kept).toHaveLength(3); // KHÔNG dedupe chỉ vì cùng type
    expect(duplicates).toHaveLength(0);
    expect(toExerciseImportPayload(rows)).toHaveLength(3);
  });
});

// ------------------------------------------------------------------
// F/G/H/I. Row-level errors — chính xác từng dòng, không cascade
// ------------------------------------------------------------------
describe('F-I. Row-level validation', () => {
  it('F1. UNKNOWN Structure -> INVALID + báo đúng dòng, không vào payload', () => {
    const text = [mc6('I want to + V'), mc6('I want + V')].join('\n');
    const { rows } = parseAndResolve(text);
    expect(isValidExerciseRow(rows[1])).toBe(false);
    expect(rows[1]._errors.join(' ')).toContain('Dòng 2:');
    expect(rows[1]._errors.join(' ')).toContain('Không tìm thấy cấu trúc "I want + V"');
    expect(toExerciseImportPayload(rows)).toHaveLength(1);
  });

  it('G1. Structure bỏ trống -> "Structure không được để trống" kèm số dòng', () => {
    const text = ['multiple_choice |  | Which? | Ans | Opt1 ;; Opt2 ;; Ans | E'].join('\n');
    const { rows } = parseAndResolve(text);
    expect(isValidExerciseRow(rows[0])).toBe(false);
    expect(rows[0]._errors.join(' ')).toContain('Dòng 1: Structure không được để trống');
    // Thay thế message field-level chung — không hiển thị 2 lỗi cho cùng nguyên nhân:
    expect(rows[0]._errors.join(' ')).not.toContain('Thiếu cấu trúc');
    expect(toExerciseImportPayload(rows)).toHaveLength(0);
  });

  it('H1. Type không hợp lệ -> lỗi mang số dòng + giá trị type', () => {
    const text = ['I want to + V | matching | Which? | Ans | Opt1 ;; Opt2 ;; Ans | E'].join('\n');
    const { rows } = parseAndResolve(text);
    expect(isValidExerciseRow(rows[0])).toBe(false);
    expect(rows[0]._errors.join(' ')).toContain('Dòng 1: Type không hợp lệ: matching');
  });

  it('I1. Sai số cột -> CHỈ MỘT lỗi gốc, resolve KHÔNG cascade thêm', () => {
    const text = ['multiple_choice | I want to + V | Question | Answer'].join('\n');
    const { rows } = parseAndResolve(text);
    expect(rows[0]._errors).toHaveLength(1);
    expect(rows[0]._errors[0]).toMatch(/Dòng 1: sai số cột/);
    expect(rows[0]._errors.join(' ')).not.toContain('Structure');
    expect(toExerciseImportPayload(rows)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------
// J/K/L. Delimiter safety
// ------------------------------------------------------------------
describe('J-L. Delimiters', () => {
  it('J1. "||" trong Answer KHÔNG phá parser 6 cột', () => {
    const { rows } = parseAndResolve(
      'fill_blank | I need to + V | I need to ___ English every day. | study || learn |  | E'
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].structure).toBe('I need to + V');
    expect(rows[0].question).toBe('I need to ___ English every day.');
    expect(rows[0].answer).toBe('study || learn');
    expect(rows[0].options).toEqual([]);
    expect(isValidExerciseRow(rows[0])).toBe(true);
    const [payload] = toExerciseImportPayload(rows);
    expect(payload.answer).toContain('||');
  });

  it('K1. ";;" trong Options vẫn tách chuẩn ở format 6 cột', () => {
    const { rows } = parseAndResolve(mc6('I like + V-ing'));
    expect(rows[0].options).toHaveLength(3);
    expect(rows[0].options.every((o) => !o.includes(';;'))).toBe(true);
  });

  it('L1. Production được phép Answer rỗng (6 cột)', () => {
    const { rows } = parseAndResolve(
      'production | I want to + V | Viết một câu với I want to + V. |  |  | Tự tạo câu.'
    );
    expect(isValidExerciseRow(rows[0])).toBe(true);
    expect(rows[0].answer).toBe('');
    const [payload] = toExerciseImportPayload(rows);
    expect(payload.type).toBe('production');
    expect(payload.answer).toBe('');
  });
});

// ------------------------------------------------------------------
// M/N. Dedupe business rule: structure + type + question
// ------------------------------------------------------------------
describe('M-N. Dedupe', () => {
  it('M1. Trùng ĐÚNG structure + type + question -> giữ dòng đầu', () => {
    const text = [mc6('I want to + V', 'Same question?'), mc6('I want to + V', 'Same question?')].join('\n');
    const { rows } = parseAndResolve(text);
    const { rows: kept, duplicates } = dedupeExerciseRows(rows);
    expect(kept).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]._reason).toMatch(/Trùng structure \+ type \+ question/);
  });

  it('M2. Khác structure hoặc khác question -> KHÔNG trùng dù cùng type', () => {
    const text = [
      mc6('I want to + V', 'Same question?'),
      mc6('I need to + V', 'Same question?'),
      mc6('I want to + V', 'Other question?'),
    ].join('\n');
    const { rows } = parseAndResolve(text);
    const { rows: kept, duplicates } = dedupeExerciseRows(rows);
    expect(kept).toHaveLength(3);
    expect(duplicates).toHaveLength(0);
  });

  it('N1. Key dedupe gồm cả structure — 2 type giống nhau ở 2 structure là 2 key', () => {
    const a = exerciseDedupeKey({ structure: 'I want to + V', type: 'fill_blank', question: 'Q' });
    const b = exerciseDedupeKey({ structure: 'I need to + V', type: 'fill_blank', question: 'Q' });
    expect(a).not.toBe(b);
    expect(a.split('|')[0]).toBe('i want to + v');
  });
});

// ------------------------------------------------------------------
// O. USER SCOPING khi resolve Structure
// ------------------------------------------------------------------
describe('O. User scoping', () => {
  it('O1. Chỉ resolve trong danh sách structure của user HIỆN TẠI', () => {
    const text = [
      mc6('I want to + V'),
      'fill_blank | I need to + V | I need to ___ English. | learn | learn ;; learning ;; learned | E',
    ].join('\n');
    // Resolve bằng structures của user hiện tại:
    const { rows } = parseAndResolve(text, MY_STRUCTURES);
    expect(rows[0]._structureId).toBe('s1');
    expect(rows[1]._structureId).toBe('s2'); // KHÔNG phải 'other-user-s9'

    // User khác cũng có "I need to + V" nhưng id khác — resolve bằng danh sách
    // user HIỆN TẠI vẫn phải ra id của user hiện tại (không bao giờ leak chéo):
    expect(rows[1]._structureId).not.toBe(OTHER_USER_STRUCTURES[0].id);

    // Structure KHÔNG nằm trong danh sách user hiện tại -> unknown, không import:
    const other = parseExerciseText(text).rows;
    resolveExerciseStructures(other, OTHER_USER_STRUCTURES);
    expect(other[0]._structureId).toBeNull();
    expect(other[0]._errors.join(' ')).toContain('Không tìm thấy cấu trúc "I want to + V"');
    expect(toExerciseImportPayload(other)).toHaveLength(1); // chỉ row còn lại của other-user
  });
});

// ------------------------------------------------------------------
// P/Q/R/S. Whole-batch semantics (mirror logic của page)
// ------------------------------------------------------------------
function summarize(parsed) {
  const invalid = parsed.filter((r) => !isValidExerciseRow(r)).length;
  const { rows: deduped, duplicates } = dedupeExerciseRows(parsed);
  const valid = deduped.filter(isValidExerciseRow);
  return {
    total: parsed.length,
    invalid,
    dupBatch: duplicates.length,
    valid: valid.length,
    deduped,
  };
}

describe('P-S. Batch semantics', () => {
  it('P1. Mixed valid/invalid: đếm đúng, lỗi đúng dòng, payload chỉ chứa valid', () => {
    const text = [
      mc6('I want to + V'),                                                    // OK
      mc6('UNKNOWN STRUCT'),                                                   // F: unknown
      '',                                                                      // blank line (bỏ qua)
      'translation | I have to + V | Tôi phải đi học. | I have to go to school. | | E', // OK
      'multiple_choice |  | Q? | A | O1 ;; O2 ;; A | E',                       // G: missing structure
    ]
      .filter(Boolean)
      .join('\n');
    const { rows } = parseAndResolve(text);
    const s = summarize(rows);
    expect(s.total).toBe(4);
    expect(s.invalid).toBe(2);
    expect(s.valid).toBe(2);
    // Payload KHÔNG BAO GIỜ chứa row invalid:
    const payloads = toExerciseImportPayload(rows);
    expect(payloads).toHaveLength(2);
    expect(payloads.map((p) => p.pattern).sort()).toEqual(['I have to + V', 'I want to + V']);
  });

  it('Q1. Summary counts chính xác khi có duplicate trong batch', () => {
    const text = [
      mc6('I want to + V', 'Dup?'),
      mc6('I want to + V', 'Dup?'),          // trùng -> dupBatch
      mc6('I want to + V', 'Unique?'),       // OK
      mc6('Ghost'),                          // lỗi
    ].join('\n');
    const { rows } = parseAndResolve(text);
    const s = summarize(rows);
    expect(s.total).toBe(4);
    expect(s.dupBatch).toBe(1);
    expect(s.valid).toBe(2);
    expect(s.invalid).toBe(1); // Ghost chưa tồn tại
    expect(s.deduped.filter(isValidExerciseRow)).toHaveLength(2);
  });

  it('R1. Còn invalid rows -> KHÔNG có gì đủ điều kiện import nguyên batch', () => {
    const text = [mc6('I want to + V'), mc6('Nope Pattern')].join('\n');
    const { rows } = parseAndResolve(text);
    const s = summarize(rows);
    // Page chặn import khi invalidPreviewCount > 0 — mô phỏng đúng invariant:
    const canImport = s.deduped.filter(isValidExerciseRow).length > 0 && s.invalid === 0;
    expect(canImport).toBe(false);
    expect(toExerciseImportPayload(rows)).toHaveLength(1); // nhưng payload vẫn sạch nếu ép import
  });

  it('S1. Batch nhiều structure import thành công — RPC nhận đủ pattern', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ created: 5, errored: 0 }], error: null });
    const text = [
      mc6('I want to + V', 'Q1?'),
      mc6('I want to + V', 'Q2?'),
      'fill_blank | I need to + V | I need to ___ English. | learn | learn ;; learning ;; learned | E',
      'translation | I have to + V | Tôi phải đi làm. | I have to go to work. | | E',
      'multiple_choice | I like + V-ing | Which is correct? | I like playing football. | I like play football. ;; I like to playing football. ;; I like playing football. | Sau like dùng V-ing.',
    ].join('\n');
    const { rows } = parseAndResolve(text);
    const s = summarize(rows);
    expect(s.invalid).toBe(0);
    expect(s.valid).toBe(5);
    // Page guard: toàn bộ hợp lệ -> gửi toàn batch (append-only RPC).
    const payload = toExerciseImportPayload(s.deduped);
    expect(payload).toHaveLength(5);
    const { data, error } = await importStructureExercises({ exercises: payload });
    expect(error).toBeNull();
    expect(data[0].created).toBe(5);
    expect(rpcMock).toHaveBeenCalledWith('import_structure_exercises', {
      p_rows: expect.any(Array),
    });
    // Mỗi exercise trỏ đúng structure của nó (client-side resolved ids):
    const byPattern = Object.fromEntries(MY_STRUCTURES.map((x) => [x.pattern, x.id]));
    expect(rows.every((r) => r._structureId === byPattern[r.structure])).toBe(true);
  });

  it('T1. Type enum bất biến — vẫn đúng 6 loại (không tạo exercise-level SRS type)', () => {
    expect(VALID_EXERCISE_TYPES).toEqual([
      'multiple_choice',
      'fill_blank',
      'translation',
      'correction',
      'rearrange',
      'production',
    ]);
  });
});
