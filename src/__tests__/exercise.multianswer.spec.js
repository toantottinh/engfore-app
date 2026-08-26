import { describe, it, expect } from 'vitest';

// ------------------------------------------------------------------
// MULTI ACCEPTED ANSWERS ("||") — end-to-end qua parser + validator +
// payload + grading (checker). Một Answer có thể chứa nhiều cách trả lời
// tự nhiên; mỗi đáp án được normalize RIÊNG và khớp BẤT KỲ một đáp án là
// ĐÚNG. KHÔNG fuzzy matching, KHÔNG AI grading, KHÔNG tự sinh synonym.
// ------------------------------------------------------------------

import {
  parseExerciseText,
  isValidExerciseRow,
  validateExerciseRow,
  resolveExerciseStructures,
  dedupeExerciseRows,
  toExerciseImportPayload,
} from '../utils/exercise-importer.js';
import {
  getAcceptedAnswers,
  normalizeAnswer,
  checkExerciseAnswer,
} from '../utils/structure-exercise-checker.js';

// Dòng chuẩn từ spec — Answer chứa "||", Options chứa ";;":
const FILL_MULTI_LINE =
  'fill_blank | I am + adjective | I am ___ today. | tired || busy || happy | tired ;; busy ;; happy | Có thể dùng nhiều tính từ phù hợp ngữ cảnh.';

describe('Parser giữ nguyên "||" trong Answer (không vỡ column)', () => {
  it('1. Parser giữ nguyên "||": raw Answer không bị tách thành cột', () => {
    const { rows } = parseExerciseText(FILL_MULTI_LINE);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe('tired || busy || happy');
    expect(rows[0].answer.includes('||')).toBe(true);
  });

  it('11. Preview không làm vỡ column: đủ Type/Structure/Question/Answer/Options/Explanation', () => {
    const { rows } = parseExerciseText(FILL_MULTI_LINE);
    const row = rows[0];
    expect(row.type).toBe('fill_blank');
    expect(row.structure).toBe('I am + adjective');
    expect(row.question).toBe('I am ___ today.');
    expect(row.answer).toBe('tired || busy || happy');
    // Options phía sau vẫn tách chuẩn bằng ";;" — column sau Answer không hỏng.
    expect(row.options).toEqual(['tired', 'busy', 'happy']);
    expect(row.explanation).toBe('Có thể dùng nhiều tính từ phù hợp ngữ cảnh.');
    expect(isValidExerciseRow(row)).toBe(true);

    // Payload gửi RPC vẫn lưu RAW answer (chứa "||") — grading tách lúc chấm.
    const [payload] = toExerciseImportPayload(rows);
    expect(payload.answer).toBe('tired || busy || happy');
    expect(payload.options).toEqual(['tired', 'busy', 'happy']);
    expect(payload.explanation).toBe('Có thể dùng nhiều tính từ phù hợp ngữ cảnh.');
  });

  it('12. Answer chứa ";;" -> warning đúng dòng (không chặn import)', () => {
    const lines = [
      'translation | S | Câu hỏi ổn. | I am fine. | | E',
      'fill_blank | I am + adjective | I am ___ today. | tired ;; busy |  | Sai delimiter',
    ].join('\n');
    const { rows } = parseExerciseText(lines);
    expect(rows).toHaveLength(2);
    expect(isValidExerciseRow(rows[1])).toBe(true); // WARNING chứ không ERROR
    const joined = rows[1]._warnings.join(' ');
    expect(joined).toContain('Dòng 2:');
    expect(joined).toContain(';;');
    expect(joined).toMatch(/\|\|/); // gợi ý dùng "||" cho nhiều đáp án
  });
});

describe('Một dòng nhiều đáp án = MỘT exercise (không tách thành 3)', () => {
  it('2. "tired || busy || happy" parse thành ĐÚNG MỘT exercise hợp lệ', () => {
    const { rows, warnings } = parseExerciseText(FILL_MULTI_LINE);
    expect(rows).toHaveLength(1);
    expect(isValidExerciseRow(rows[0])).toBe(true);
    // Không phát sinh cảnh báo lạ — "||" là hợp lệ trong Answer.
    expect(warnings.join(' ')).not.toMatch(/\|\|/);

    // Dedupe theo invariant structure + type + question: vẫn 1 row, không duplicate.
    const { rows: deduped, duplicates } = dedupeExerciseRows(rows);
    expect(deduped).toHaveLength(1);
    expect(duplicates).toHaveLength(0);
  });

  it('Translation với 2 cách nói tự nhiên cũng là MỘT exercise', () => {
    const { rows } = parseExerciseText(
      'translation | I want to + V | Tôi muốn học tiếng Anh. | I want to learn English. || I want to study English. | | Nhiều cách nói tự nhiên.'
    );
    expect(rows).toHaveLength(1);
    expect(isValidExerciseRow(rows[0])).toBe(true);
    expect(getAcceptedAnswers(rows[0].answer)).toHaveLength(2);

    // Không dedupe các accepted answers với nhau.
    const [payload] = toExerciseImportPayload(rows);
    expect(payload.answer).toBe('I want to learn English. || I want to study English.');
  });

  it('Production vẫn cho phép Answer rỗng (semantics không đổi)', () => {
    const row = validateExerciseRow({
      structure: 'I want to + V',
      type: 'production',
      question: 'Viết một câu sử dụng I want to + V.',
      answer: '',
      options: [],
      explanation: '',
    });
    expect(isValidExerciseRow(row)).toBe(true);
    const r = checkExerciseAnswer({ type: 'production', answer: '' }, 'anything');
    expect(r.selfCheck).toBe(true);
    expect(r.correct).toBeNull(); // production KHÔNG tự chấm
  });

  it('Guard: deterministic type với Answer chỉ toàn "||" -> ERROR (không có gì để chấm)', () => {
    const row = validateExerciseRow({
      structure: 'S',
      type: 'fill_blank',
      question: 'I ___ today.',
      answer: '||',
      options: [],
      explanation: '',
    });
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/\|\|/);
  });
});

describe('Grading multi-answer (normalize TỪNG đáp án riêng, exact-match)', () => {
  const EXERCISE = {
    id: 'e1',
    type: 'fill_blank',
    question: 'I am ___ today.',
    answer: 'tired || busy || happy',
    options: [],
    explanation: 'Có thể dùng nhiều tính từ phù hợp ngữ cảnh.',
  };

  it('3. getAcceptedAnswers trả về ["tired", "busy", "happy"]', () => {
    expect(getAcceptedAnswers(EXERCISE.answer)).toEqual(['tired', 'busy', 'happy']);
  });

  it('4. "tired" -> CORRECT', () => {
    expect(checkExerciseAnswer(EXERCISE, 'tired').correct).toBe(true);
  });

  it('5. "busy" -> CORRECT', () => {
    expect(checkExerciseAnswer(EXERCISE, 'busy').correct).toBe(true);
  });

  it('6. "happy" -> CORRECT', () => {
    expect(checkExerciseAnswer(EXERCISE, 'happy').correct).toBe(true);
  });

  it('7. "hungry" -> INCORRECT + feedback hiển thị ĐỦ các đáp án đúng', () => {
    const r = checkExerciseAnswer(EXERCISE, 'hungry');
    expect(r.correct).toBe(false);
    // Feedback hiển thị ĐỦ các đáp án đúng (không chỉ đáp án đầu tiên).
    expect(r.correctAnswer).toBe('tired / busy / happy');
    expect(r.acceptedAnswers).toEqual(['tired', 'busy', 'happy']);
  });

  it('8. Whitespace khác nhau vẫn normalize đúng (trim + collapse từng đáp án)', () => {
    expect(checkExerciseAnswer(EXERCISE, '  busy  ').correct).toBe(true);
    expect(checkExerciseAnswer(EXERCISE, 'happy   ').correct).toBe(true);
    // Raw answer có khoảng trắng thừa quanh delimiter cũng OK.
    const messy = { ...EXERCISE, answer: 'tired ||   busy || happy' };
    expect(getAcceptedAnswers(messy.answer)).toEqual(['tired', 'busy', 'happy']);
    expect(checkExerciseAnswer(messy, 'busy').correct).toBe(true);
    // Nhiều space trong từ chỉ collapse về 1 space (behavior normalize hiện tại).
    expect(normalizeAnswer('ti   red')).toBe('ti red'); // KHÔNG biến thành "tired"
  });

  it('9. Case khác nhau vẫn normalize đúng', () => {
    expect(checkExerciseAnswer(EXERCISE, 'BUSY').correct).toBe(true);
    expect(checkExerciseAnswer(EXERCISE, 'TiReD').correct).toBe(true);
    expect(checkExerciseAnswer(EXERCISE, 'HAPPY').correct).toBe(true);
  });

  it('10. KHÔNG fuzzy: typo / khoảng trắng chèn giữa từ đều SAI', () => {
    expect(checkExerciseAnswer(EXERCISE, 'tir ed').correct).toBe(false);
    expect(checkExerciseAnswer(EXERCISE, 'tird').correct).toBe(false);
    expect(checkExerciseAnswer(EXERCISE, 'tires').correct).toBe(false);
    expect(checkExerciseAnswer(EXERCISE, 'hap py').correct).toBe(false);
    expect(checkExerciseAnswer(EXERCISE, 'bussy').correct).toBe(false);
  });

  it('Áp dụng cho mọi deterministic type (multiple_choice/translation/correction/rearrange)', () => {
    const types = ['multiple_choice', 'translation', 'correction', 'rearrange'];
    for (const type of types) {
      const ex = { type, question: 'Q', answer: 'want || study', options: [], explanation: null };
      expect(checkExerciseAnswer(ex, 'want').correct).toBe(true);
      expect(checkExerciseAnswer(ex, 'STUDY').correct).toBe(true);
      expect(checkExerciseAnswer(ex, 'learning').correct).toBe(false);
    }
  });
});

describe('Multi-answer + Options ";;" cùng tồn tại chính xác', () => {
  it('13a. fill_blank: Options chứa TẤT CẢ accepted answers -> HỢP LỆ', () => {
    const { rows } = parseExerciseText(FILL_MULTI_LINE);
    expect(isValidExerciseRow(rows[0])).toBe(true);
    expect(rows[0].options).toEqual(['tired', 'busy', 'happy']);
  });

  it('13b. multiple_choice: mọi accepted answers phải nằm trong Options', () => {
    const valid = validateExerciseRow({
      structure: 'I am + adjective',
      type: 'multiple_choice',
      question: 'Which word fits?',
      answer: 'tired || happy',
      options: ['tired', 'busy', 'happy'],
      explanation: '',
    });
    expect(isValidExerciseRow(valid)).toBe(true);

    const invalid = validateExerciseRow({
      structure: 'I am + adjective',
      type: 'multiple_choice',
      question: 'Which word fits?',
      answer: 'tired || sleepy',
      options: ['tired', 'busy', 'happy'],
      explanation: '',
    });
    expect(isValidExerciseRow(invalid)).toBe(false);
    expect(invalid._errors.join(' ')).toMatch(/sleepy/);
  });

  it('13c. fill_blank CÓ Options nhưng THIẾU một accepted answer -> ERROR rõ đáp án thiếu', () => {
    const row = validateExerciseRow({
      structure: 'I am + adjective',
      type: 'fill_blank',
      question: 'I am ___ today.',
      answer: 'tired || sleepy',
      options: ['tired', 'busy'],
      explanation: '',
    });
    expect(isValidExerciseRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/phải xuất hiện trong Options/);
    expect(row._errors.join(' ')).toMatch(/sleepy/);
  });

  it('13d. Grading MC với multi-answer: khớp BẤT KỲ option nào trong accepted', () => {
    const ex = {
      type: 'multiple_choice',
      question: 'Which word fits?',
      answer: 'busy || happy',
      options: ['tired', 'busy', 'happy'],
      explanation: null,
    };
    expect(checkExerciseAnswer(ex, 'busy').correct).toBe(true);
    expect(checkExerciseAnswer(ex, 'happy').correct).toBe(true);
    expect(checkExerciseAnswer(ex, 'tired').correct).toBe(false);
  });
});

describe('Multi-answer + MULTI-STRUCTURE import cùng hoạt động', () => {
  it('14. Batch nhiều structure, mỗi dòng có "||" -> resolve + payload đúng', () => {
    const batch = [
      FILL_MULTI_LINE,
      'translation | I want to + V | Tôi muốn học tiếng Anh. | I want to learn English. || I want to study English. | | Nhiều cách nói.',
    ].join('\n');

    const { rows } = parseExerciseText(batch);
    expect(rows).toHaveLength(2);

    resolveExerciseStructures(rows, [
      { id: 'struct-a', pattern: 'I am + adjective' },
      { id: 'struct-b', pattern: 'I want to + V' },
    ]);

    expect(rows[0]._structureId).toBe('struct-a');
    expect(rows[1]._structureId).toBe('struct-b');
    expect(rows.every(isValidExerciseRow)).toBe(true);

    const { duplicates } = dedupeExerciseRows(rows);
    expect(duplicates).toHaveLength(0);

    const payload = toExerciseImportPayload(rows);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      pattern: 'I am + adjective',
      type: 'fill_blank',
      answer: 'tired || busy || happy',
    });
    expect(payload[1]).toMatchObject({
      pattern: 'I want to + V',
      type: 'translation',
      answer: 'I want to learn English. || I want to study English.',
    });
  });
});

describe('Regression — single-answer vẫn PASS như cũ', () => {
  it('15. Single answer MC/fill_blank/translation vẫn hợp lệ và chấm đúng', () => {
    const mc = parseExerciseText(
      'I want to + V | multiple_choice | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want to learn English. | Sau want to dùng V nguyên mẫu.'
    );
    expect(isValidExerciseRow(mc.rows[0])).toBe(true);
    const [mcPayload] = toExerciseImportPayload(mc.rows);
    expect(mcPayload.answer).not.toContain('||');

    const fb = parseExerciseText(
      'fill_blank | I want to + V | I want to ___ English. | learn | learn ;; learning | E'
    );
    expect(isValidExerciseRow(fb.rows[0])).toBe(true);
    expect(
      checkExerciseAnswer({ type: 'fill_blank', answer: 'learn', explanation: null }, 'learn')
        .correct
    ).toBe(true);

    // Single answer vẫn hiển thị nguyên văn (không nối " / " thừa).
    const r = checkExerciseAnswer(
      { type: 'translation', answer: 'I want to learn English.' },
      'x'
    );
    expect(r.correctAnswer).toBe('I want to learn English.');
    expect(r.acceptedAnswers).toEqual(['I want to learn English.']);
  });
});