import { describe, it, expect } from 'vitest';
import {
  normalizeAnswer,
  checkExerciseAnswer,
  getAcceptedAnswers,
} from '../utils/structure-exercise-checker.js';
import {
  extractFixedTokens,
  getProductionHint,
} from '../utils/production-checker.js';

// ------------------------------------------------------------------
// CHECKPOINT 5 — Answer checking deterministic theo type.
// ------------------------------------------------------------------

const MC = {
  id: 'e1',
  type: 'multiple_choice',
  question: 'Which sentence is correct?',
  answer: 'I want to learn English.',
  options: ['I want learn English.', 'I want to learn English.', 'I want learning English.'],
  explanation: 'Sau want to dùng động từ nguyên mẫu.',
};

describe('multiple_choice', () => {
  it('đáp án đúng (option khớp answer) -> correct', () => {
    const r = checkExerciseAnswer(MC, 'I want to learn English.');
    expect(r.selfCheck).toBe(false);
    expect(r.correct).toBe(true);
  });

  it('đáp án sai -> correct=false + correctAnswer + explanation', () => {
    const r = checkExerciseAnswer(MC, 'I want learn English.');
    expect(r.correct).toBe(false);
    expect(r.correctAnswer).toBe('I want to learn English.');
    expect(r.explanation).toMatch(/nguyên mẫu/);
  });

  it('case-insensitive normalization', () => {
    const r = checkExerciseAnswer(MC, 'i WANT TO LEARN english.');
    expect(r.correct).toBe(true);
  });
});

describe('fill_blank', () => {
  const FB = { type: 'fill_blank', question: 'I want to ___ English.', answer: 'learn', explanation: null };
  it('correct', () => {
    expect(checkExerciseAnswer(FB, 'learn').correct).toBe(true);
  });
  it('wrong', () => {
    expect(checkExerciseAnswer(FB, 'learning').correct).toBe(false);
  });
  it('whitespace/case normalized', () => {
    expect(checkExerciseAnswer(FB, '  LEARN  ').correct).toBe(true);
  });
});

describe('translation', () => {
  const T = { type: 'translation', question: 'Tôi muốn học tiếng Anh.', answer: 'I want to learn English.' };
  it('correct', () => {
    expect(checkExerciseAnswer(T, 'I want to learn English.').correct).toBe(true);
  });
  it('wrong', () => {
    expect(checkExerciseAnswer(T, 'I want learn English.').correct).toBe(false);
  });
});

describe('correction', () => {
  const C = { type: 'correction', question: 'I want learning English.', answer: 'I want to learn English.' };
  it('correct', () => {
    expect(checkExerciseAnswer(C, 'I want to learn English.').correct).toBe(true);
  });
  it('wrong -> hiển thị câu sửa đúng', () => {
    const r = checkExerciseAnswer(C, 'I want learned English.');
    expect(r.correct).toBe(false);
    expect(r.correctAnswer).toBe('I want to learn English.');
  });
});

describe('rearrange', () => {
  const R = { type: 'rearrange', question: 'want ;; I ;; English ;; to ;; learn', answer: 'I want to learn English.' };
  it('ghép đúng thứ tự -> correct', () => {
    expect(checkExerciseAnswer(R, 'I want to learn English.').correct).toBe(true);
  });
  it('sai thứ tự -> incorrect kèm reason', () => {
    const r = checkExerciseAnswer(R, 'Want I to learn English');
    expect(r.correct).toBe(false);
    expect(r.reason).toBeTruthy();
  });
  it('normalize khoảng trắng giữa tokens', () => {
    expect(checkExerciseAnswer(R, 'I  want   to learn English').correct).toBe(true);
  });
});

describe('production — self-check, KHÔNG tự chấm', () => {
  const P = { type: 'production', question: 'Viết một câu...', answer: 'I want to go home.', explanation: 'E' };
  it('luôn selfCheck=true, correct=null (không tuyên bố đúng)', () => {
    const r = checkExerciseAnswer(P, 'I want to play football.');
    expect(r.selfCheck).toBe(true);
    expect(r.correct).toBeNull();
  });

  it('câu KHÁC câu mẫu vẫn không bị đánh sai (không exact-match)', () => {
    const r = checkExerciseAnswer(P, 'She wants to sleep.');
    expect(r.correct).toBeNull();
    expect(r.selfCheck).toBe(true);
  });

  it('hiển thị câu mẫu tham khảo', () => {
    const r = checkExerciseAnswer(P, '');
    expect(r.correctAnswer).toBe('I want to go home.');
  });

  it('type lạ -> self-check an toàn', () => {
    const r = checkExerciseAnswer({ type: 'dictation' }, 'x');
    expect(r.selfCheck).toBe(true);
    expect(r.correct).toBeNull();
  });
});

describe('normalizeAnswer', () => {
  it('trim + collapse + lowercase', () => {
    expect(normalizeAnswer('  I   Want TO Learn ')).toBe('i want to learn');
  });
  it('bỏ dấu câu đơn giản (đáp án có dấu chấm vẫn khớp khi user không gõ)', () => {
    expect(normalizeAnswer('I want to learn English.')).toBe('i want to learn english');
  });
});

// ------------------------------------------------------------------
// Production checker V1 — hints only, luôn self-check.
// ------------------------------------------------------------------

describe('production-checker', () => {
  it('extractFixedTokens bỏ placeholder (+ V) khỏi pattern', () => {
    expect(extractFixedTokens('I want to + V')).toEqual(['i', 'want', 'to']);
    expect(extractFixedTokens('There is / There are')).toEqual(['there', 'is', 'there', 'are']);
  });

  it('getProductionHint nhận diện fixed tokens có/mất trong câu', () => {
    const hint = getProductionHint({
      pattern: 'I want to + V',
      answer: 'I want to go home.',
      sentence: 'I want to play football.',
      userVocabulary: [{ word: 'play', word_type: 'verb' }],
    });
    expect(hint.selfCheck).toBe(true); // LUÔN self-check
    expect(hint.recognizedTokens).toEqual(['i', 'want', 'to']);
    expect(hint.missingTokens).toEqual([]);
    expect(hint.vocabHits).toEqual([{ word: 'play', word_type: 'verb' }]);
    expect(hint.sample).toBe('I want to go home.');
  });

  it('KHÔNG bao giờ trả về verdict correct/incorrect', () => {
    const hint = getProductionHint({ pattern: 'I want to + V', sentence: 'blah blah' });
    expect(hint).not.toHaveProperty('correct');
    expect(hint.selfCheck).toBe(true);
    expect(Array.isArray(hint.missingTokens)).toBe(true);
  });
});

// ------------------------------------------------------------------
// EXERCISE V2 — Multiple accepted answers bằng "||"
// ------------------------------------------------------------------

describe('multiple accepted answers ("||")', () => {
  const FB_MULTI = {
    type: 'fill_blank',
    question: 'I ___ to learn English every day.',
    answer: 'want || study',
  };
  const TRANS_MULTI = {
    type: 'translation',
    question: 'Tôi muốn học tiếng Anh mỗi ngày.',
    answer: 'I want to learn English every day. || I want to study English every day.',
  };

  it('getAcceptedAnswers tách đúng, trim từng đáp án, bỏ rỗng', () => {
    expect(getAcceptedAnswers(' a || b ||  ')).toEqual(['a', 'b']);
    expect(getAcceptedAnswers('single')).toEqual(['single']);
    expect(getAcceptedAnswers('')).toEqual([]);
    expect(getAcceptedAnswers(null)).toEqual([]);
  });

  it('11-13. normalize riêng từng accepted: case-insensitive + trim + collapse ws', () => {
    expect(checkExerciseAnswer(FB_MULTI, 'WANT').correct).toBe(true);
    expect(checkExerciseAnswer(FB_MULTI, '  study  ').correct).toBe(true);
    expect(checkExerciseAnswer(FB_MULTI, 'Study').correct).toBe(true);
  });

  it('14. translation khớp một trong các accepted answers', () => {
    expect(
      checkExerciseAnswer(TRANS_MULTI, 'i want to study english every day').correct
    ).toBe(true);
    expect(
      checkExerciseAnswer(TRANS_MULTI, 'I want to learn English every day.').correct
    ).toBe(true);
  });

  it('15. đáp án ngoài danh sách -> KHÔNG pass', () => {
    expect(checkExerciseAnswer(FB_MULTI, 'learning').correct).toBe(false);
    expect(checkExerciseAnswer(FB_MULTI, 'wanted').correct).toBe(false);
  });

  it('16. KHÔNG fuzzy matching (typo nhẹ cũng sai)', () => {
    expect(checkExerciseAnswer(FB_MULTI, 'wnt').correct).toBe(false);
    expect(checkExerciseAnswer(FB_MULTI, 'wants').correct).toBe(false);
    expect(
      checkExerciseAnswer({ ...TRANS_MULTI }, 'I wan to learn English every day').correct
    ).toBe(false);
  });

  it('correctAnswer hiển thị: single giữ nguyên văn, multi nối bằng " / "', () => {
    const single = checkExerciseAnswer(MC, 'x');
    expect(single.correctAnswer).toBe('I want to learn English.');
    expect(single.acceptedAnswers).toEqual(['I want to learn English.']);

    const multi = checkExerciseAnswer(FB_MULTI, 'x');
    expect(multi.correctAnswer).toBe('want / study');
    expect(multi.acceptedAnswers).toEqual(['want', 'study']);
  });

  it('multi answers hoạt động cho mọi deterministic type (correction sample)', () => {
    const C = { type: 'correction', question: 'Q', answer: 'I want to learn English. || I would like to learn English.' };
    expect(checkExerciseAnswer(C, 'i WOULD LIKE TO learn english').correct).toBe(true);
    expect(checkExerciseAnswer(C, 'I want learning English.').correct).toBe(false);
  });
});