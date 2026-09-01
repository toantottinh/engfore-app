import { describe, it, expect } from 'vitest';
import { buildGrammarSessionQueue, grammarQueueBucket } from '../utils/grammar-status.js';
import { structureQueueBucket } from '../utils/structure-status.js';
import { checkExerciseAnswer } from '../utils/structure-exercise-checker.js';

/**
 * GRAMMAR `/learn` INTEGRATION.
 *
 * Ràng buộc: Grammar chỉ cung cấp content (Topic/Rule/Exercise); `/learn` là NƠI
 * DUY NHẤT quản lý SRS/Queue/Session. Scheduling/queue/session phải tiếp tục nằm
 * ở /learn (single source of truth) — các test dưới đây chứng minh một SRS engine
 * duy nhất được tái sử dụng (không duplicate) và exercise checker hiện có hoạt
 * động trên grammar rows.
 *
 * Hard rule: KHÔNG tạo SRS engine riêng cho Grammar.
 */

describe('grammar.learn: ONE SRS engine reused, not duplicated', () => {
  it('grammarQueueBucket IS the same function as structureQueueBucket (same bucket logic)', () => {
    expect(grammarQueueBucket).toBe(structureQueueBucket);
  });
});

describe('grammar.learn: queue semantics match /learn system', () => {
  const nowIso = new Date().toISOString();
  const past = new Date(Date.now() - 1000 * 60).toISOString();
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

  it('buildGrammarSessionQueue produces DUE -> LEARNING -> NEW, excluding review-future', () => {
    const rules = [
      { id: 'due', title: 'Due', created_at: '2026-01-01T00:00:00Z' },
      { id: 'learning', title: 'Learning', created_at: '2026-01-02T00:00:00Z' },
      { id: 'new', title: 'New', created_at: '2026-01-03T00:00:00Z' },
      { id: 'future', title: 'Future', created_at: '2026-01-04T00:00:00Z' },
    ];
    const progress = {
      due: { state: 'review', review_due_at: past },
      learning: { state: 'learning', review_due_at: nowIso },
      future: { state: 'review', review_due_at: future },
    };
    const queue = buildGrammarSessionQueue(rules, progress);
    expect(queue.map((r) => r.id)).toEqual(['due', 'learning', 'new']);
    expect(queue.every((r) => r.ruleId)).toBe(true);
  });
});

describe('grammar.learn: grammar exercises use the SHARED exercise checker (no second engine)', () => {
  it('checkExerciseAnswer handles grammar exercise rows (same shape as structure)', () => {
    const mc = {
      type: 'multiple_choice',
      question: 'She is ______.',
      options: ['happy', 'happily', 'happiness'],
      answer: 'happy',
    };
    expect(checkExerciseAnswer(mc, 'happy').correct).toBe(true);
    expect(checkExerciseAnswer(mc, 'happily').correct).toBe(false);
  });

  it('handles correction exercises (grammar "She is happily" -> "She is happy.")', () => {
    const correction = {
      type: 'correction',
      question: 'She is happily.',
      answer: 'She is happy.',
    };
    expect(checkExerciseAnswer(correction, 'She is happy.').correct).toBe(true);
  });

  it('handles production exercises (self-check)', () => {
    const production = {
      type: 'production',
      question: 'Write a sentence using: Subject + be + adjective',
      answer: '',
    };
    const result = checkExerciseAnswer(production, 'I am tall.');
    expect(result.selfCheck).toBe(true);
  });
});