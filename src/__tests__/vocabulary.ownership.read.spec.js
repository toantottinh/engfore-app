import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Regression tests — READ PATH phải ưu tiên USER-OWNED content.
//
// Root cause: IMPORT_REUSES_SENSE_BUT_CONTENT_OWNERSHIP_IS_WRONG.
// getUserVocabulary() và learning read paths (getDueReviewWords /
// getDueReviewWordsInSet / getLearningWords) trước đây đọc
// word_senses.description / word_senses.example (GLOBAL) — nghĩa là sau
// khi user A sửa/xoá rồi import lại, mọi user vẫn thấy nội dung cũ.
// Bây giờ: user_vocabulary.example / user_vocabulary.memory_clue WIN,
// global fields chỉ còn là fallback cho dữ liệu cũ (legacy).
// ------------------------------------------------------------------

const tableRows = {
  user_vocabulary: [],
  user_progress: [],
  vocabulary_sets: [],
  set_words: [],
};

const chainableFrom = (tableName) => {
  const filters = [];
  const chain = {
    select() { return chain; },
    eq(col, val) { filters.push(['eq', col, val]); return chain; },
    in(col, vals) { filters.push(['in', col, vals]); return chain; },
    lte() { return chain; },
    gt() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    then(onFulfilled) {
      let data = [...(tableRows[tableName] || [])];
      for (const [op, col, val] of filters) {
        data = data.filter((row) => {
          // Support nested column access (e.g., 'word_senses.set_words.vocabulary_sets.user_id')
          // Arrays in the path are traversed to check if any element matches.
          const colParts = col.split('.');
          let rowVals = [row];
          for (const part of colParts) {
            const nextVals = [];
            for (const rv of rowVals) {
              if (rv === undefined || rv === null) continue;
              const child = rv[part];
              if (Array.isArray(child)) {
                nextVals.push(...child);
              } else if (child !== undefined && child !== null) {
                nextVals.push(child);
              }
            }
            rowVals = nextVals;
            if (rowVals.length === 0) return false;
          }
          // Check if any final value matches the filter
          if (op === 'eq') return rowVals.some((v) => v === val);
          if (op === 'in') return rowVals.some((v) => (val || []).includes(v));
          return rowVals.length > 0;
        });
      }
      return Promise.resolve({ data, error: null }).then(onFulfilled);
    },
  };
  return chain;
};

vi.mock('../services/supabase.js', () => ({
  supabase: { from: (t) => chainableFrom(t), rpc: vi.fn(async () => ({ data: null, error: null })) },
}));

import { getUserVocabulary } from '../services/vocabulary.service.js';
import { getDueReviewWords } from '../services/learning.service.js';

// Sense "airport" — canonical GLOBAL content (legacy) là "OLD EXAMPLE/CLUE".
// word_senses phải có nested structure để query filter hoạt động:
// - set_words.vocabulary_sets.user_id (membership filter)
// - user_vocabulary (user-owned content overlay)
const SENSE_ROW = {
  id: 'sense-airport',
  word_type: 'noun',
  meaning: 'sân bay',
  description: 'OLD GLOBAL CLUE',
  example: 'OLD GLOBAL EXAMPLE',
  words: { id: 'word-airport', word: 'airport', ipa: '/ˈeəpɔːt/', cefr_level: 'A2' },
  set_words: [{ vocabulary_sets: { id: 'set-a', user_id: 'user-1' } }],
  user_vocabulary: null,
};

describe('getUserVocabulary — USER-OWNED content đọc đúng nguồn', () => {
  beforeEach(() => {
    tableRows.user_vocabulary = [];
    tableRows.user_progress = [];
    tableRows.vocabulary_sets = [];
    tableRows.set_words = [];
  });

    it('user có user-owned content → hiển thị content của user, KHÔNG phải global', async () => {
    // Ownership read path: base table = user_vocabulary (source of truth).
    // User-owned example/memory_clue WIN; global word_senses chỉ fallback.
    tableRows.user_vocabulary = [
      {
        user_id: 'user-1',
        word_sense_id: 'sense-airport',
        example: 'MY NEW EXAMPLE B',
        memory_clue: 'MY NEW CLUE B',
        created_at: '2026-09-01T00:00:00.000Z',
        word_senses: SENSE_ROW,
      },
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].example).toBe('MY NEW EXAMPLE B');
    expect(data[0].memory_clue).toBe('MY NEW CLUE B');
  });

  it('REGRESSION Test 6 — vocabulary cũ (chưa có user-specific content) vẫn đọc được qua fallback global, không crash', async () => {
    tableRows.user_vocabulary = [
      {
        user_id: 'user-1',
        word_sense_id: 'sense-airport',
        example: null,
        memory_clue: null,
        created_at: '2026-09-01T00:00:00.000Z',
        word_senses: SENSE_ROW,
      },
    ];

    const { data, error } = await getUserVocabulary('user-1');
    expect(error).toBeNull();
    expect(data[0].example).toBe('OLD GLOBAL EXAMPLE');
    expect(data[0].memory_clue).toBe('OLD GLOBAL CLUE');
  });
});

describe('learning read paths (review/learn/flashcard/typing) — USER-OWNED overlay', () => {
  beforeEach(() => {
    tableRows.user_vocabulary = [];
    tableRows.user_progress = [];
    tableRows.vocabulary_sets = [];
    tableRows.set_words = [];
  });

  const PROGRESS_ROW = {
    user_id: 'user-1',
    word_sense_id: 'sense-airport',
    mastery_level: 2,
    review_count: 1,
    flashcard_reviews: 0,
    review_due_at: new Date(Date.now() - 1000).toISOString(),
    last_reviewed_at: null,
    repetitions: 1,
    interval_hours: 4,
    ease_factor: 2.5,
    lapses: 0,
    state: 'review',
    learning_step: 0,
    word_senses: SENSE_ROW,
  };

    it('user có user-owned content → review queue hiển thị content của user', async () => {
    const PROGRESS_WITH_SENSE = {
      user_id: 'user-1',
      word_sense_id: 'sense-airport',
      mastery_level: 2,
      review_count: 1,
      flashcard_reviews: 0,
      review_due_at: new Date(Date.now() - 1000).toISOString(),
      last_reviewed_at: null,
      repetitions: 1,
      interval_hours: 4,
      ease_factor: 2.5,
      lapses: 0,
      state: 'review',
      learning_step: 0,
      word_senses: {
        ...SENSE_ROW,
        user_vocabulary: { example: 'USER EXAMPLE C', memory_clue: 'USER CLUE C' },
      },
    };
    tableRows.user_progress = [PROGRESS_WITH_SENSE];

    // user-owned content overlay
    tableRows.set_words = [
      {
        word_sense_id: 'sense-airport',
        vocabulary_sets: { id: 'set-a', user_id: 'user-1' },
        user_vocabulary: { example: 'USER EXAMPLE C', memory_clue: 'USER CLUE C' },
        word_senses: SENSE_ROW,
      },
    ];

    const { data, error } = await getDueReviewWords('user-1');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].example).toBe('USER EXAMPLE C');
    expect(data[0].memory_clue).toBe('USER CLUE C');
    // SRS fields không bị ảnh hưởng
    expect(data[0].state).toBe('review');
    expect(data[0].mastery_level).toBe(2);
  });

  it('REGRESSION Test 6 — progress cũ không có user-owned content → fallback global, không crash', async () => {
    const PROGRESS_WITH_SENSE = {
      user_id: 'user-1',
      word_sense_id: 'sense-airport',
      mastery_level: 2,
      review_count: 1,
      flashcard_reviews: 0,
      review_due_at: new Date(Date.now() - 1000).toISOString(),
      last_reviewed_at: null,
      repetitions: 1,
      interval_hours: 4,
      ease_factor: 2.5,
      lapses: 0,
      state: 'review',
      learning_step: 0,
      word_senses: {
        ...SENSE_ROW,
        user_vocabulary: { example: null, memory_clue: null },
      },
    };
    tableRows.user_progress = [PROGRESS_WITH_SENSE];

    // user_vocabulary example/memory_clue null -> fallback global word_senses
    tableRows.user_vocabulary = [
      { user_id: 'user-1', word_sense_id: 'sense-airport', example: null, memory_clue: null },
    ];

    const { data, error } = await getDueReviewWords('user-1');
    expect(error).toBeNull();
    expect(data[0].example).toBe('OLD GLOBAL EXAMPLE');
    expect(data[0].memory_clue).toBe('OLD GLOBAL CLUE');
  });

  it('user_vocabulary row KHÔNG tồn tại (legacy) → fallback global, không crash', async () => {
    const PROGRESS_WITH_SENSE = {
      user_id: 'user-1',
      word_sense_id: 'sense-airport',
      mastery_level: 2,
      review_count: 1,
      flashcard_reviews: 0,
      review_due_at: new Date(Date.now() - 1000).toISOString(),
      last_reviewed_at: null,
      repetitions: 1,
      interval_hours: 4,
      ease_factor: 2.5,
      lapses: 0,
      state: 'review',
      learning_step: 0,
      word_senses: {
        ...SENSE_ROW,
        user_vocabulary: null,
      },
    };
    tableRows.user_progress = [PROGRESS_WITH_SENSE];
    tableRows.user_vocabulary = [];

    const { data, error } = await getDueReviewWords('user-1');
    expect(error).toBeNull();
    expect(data[0].example).toBe('OLD GLOBAL EXAMPLE');
    expect(data[0].memory_clue).toBe('OLD GLOBAL CLUE');
  });
});
