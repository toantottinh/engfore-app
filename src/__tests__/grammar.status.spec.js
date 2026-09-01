import { describe, it, expect } from 'vitest';
import {
  grammarQueueBucket,
  deriveGrammarStatus,
  resolveGrammarExercisePlan,
  buildGrammarSessionQueue,
  partitionGrammarQueue,
  countGrammarStates,
  grammarSessionPath,
} from '../utils/grammar-status.js';
import {
  structureQueueBucket,
  deriveStructureStatus,
  resolveStructureExercisePlan,
} from '../utils/structure-status.js';

/**
 * GRAMMAR STATUS — pure helpers cho khu học ngắt quãng (/learn).
 *
 * MỘT SRS engine cho toàn EngFore: grammarQueueBucket / deriveGrammarStatus /
 * resolveGrammarExercisePlan là RE-EXPORT CÙNG HÀM với Structure (identity
 * check bên dưới) — không có scheduler riêng cho Grammar. Queue/session path
 * thuộc /grammar, KHÔNG tạo /learn/grammar riêng.
 */

describe('grammar-status: bucket/state/plan reuses the shared SRS engine', () => {
  it('grammarQueueBucket is the SAME function as structureQueueBucket (no duplicate logic)', () => {
    expect(grammarQueueBucket).toBe(structureQueueBucket);
  });

  it('deriveGrammarStatus is the SAME function as deriveStructureStatus (no duplicate logic)', () => {
    expect(deriveGrammarStatus).toBe(deriveStructureStatus);
  });

  it('resolveGrammarExercisePlan is the SAME function as resolveStructureExercisePlan (one exercise engine)', () => {
    expect(resolveGrammarExercisePlan).toBe(resolveStructureExercisePlan);
  });
});

describe('grammar-status: grammarSessionPath', () => {
  it('points to /grammar/session/:ruleId (single source — route in src/App.jsx)', () => {
    expect(grammarSessionPath('abc-123')).toBe('/grammar/session/abc-123');
  });
});

describe('grammar-status: buildGrammarSessionQueue', () => {
  const nowIso = new Date().toISOString();
  const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  const past = new Date(Date.now() - 1000 * 60).toISOString();

  const rules = [
    { id: 'r-due', title: 'Due rule', grammar_topics: { title: 'T', cefr: 'A1' } },
    { id: 'r-learning', title: 'Learning rule', grammar_topics: { title: 'T', cefr: 'A1' } },
    { id: 'r-new', title: 'New rule', grammar_topics: { title: 'T', cefr: 'A1' } },
    { id: 'r-future', title: 'Future review', grammar_topics: { title: 'T', cefr: 'A1' } },
  ];
  const progressMap = {
    'r-due': { state: 'review', review_due_at: past },
    'r-learning': { state: 'learning', review_due_at: nowIso },
    'r-future': { state: 'review', review_due_at: future },
  };

  it('orders DUE -> LEARNING -> NEW and excludes review-future', () => {
    const queue = buildGrammarSessionQueue(rules, progressMap);
    expect(queue.map((r) => r.id)).toEqual(['r-due', 'r-learning', 'r-new']);
  });

  it('attaches ruleId + user_grammar for runtime identity', () => {
    const queue = buildGrammarSessionQueue(rules, progressMap);
    const due = queue.find((r) => r.id === 'r-due');
    expect(due.ruleId).toBe('r-due');
    expect(due.user_grammar.state).toBe('review');
  });
});

describe('grammar-status: partitionGrammarQueue', () => {
  it('buckets items into due/learning/new arrays', () => {
    const nowIso = new Date().toISOString();
    const queue = [
      { id: 'a', ruleId: 'a', user_grammar: { state: 'review', review_due_at: nowIso } },
      { id: 'b', ruleId: 'b', user_grammar: { state: 'learning' } },
      { id: 'c', ruleId: 'c', user_grammar: null },
    ];
    const parts = partitionGrammarQueue(queue, nowIso);
    expect(parts.due.map((r) => r.id)).toEqual(['a']);
    expect(parts.learning.map((r) => r.id)).toEqual(['b']);
    expect(parts.new.map((r) => r.id)).toEqual(['c']);
  });
});

describe('grammar-status: countGrammarStates', () => {
  it('counts new/again/review without creating rows', () => {
    const rules = [
      { id: 'a', user_grammar: null },
      { id: 'b', user_grammar: { state: 'learning' } },
      { id: 'c', user_grammar: { state: 'relearning' } },
      { id: 'd', user_grammar: { state: 'review' } },
      { id: 'e', user_grammar: null },
    ];
    expect(countGrammarStates(rules)).toEqual({ new: 2, again: 2, review: 1 });
  });
});