import { describe, it, expect } from 'vitest';
import {
  deriveStructureStatus,
  countStructureStates,
  filterStructures,
  distinctStructureTopics,
} from '../utils/structure-status.js';

// Sample structures với progress mô phỏng (user_structures có thể null).
const STRUCTURES = [
  { id: 's1', pattern: 'I want to + V', meaning: 'Tôi muốn...', cefr: 'A1', topic: 'Daily Life', user_structures: null },
  { id: 's2', pattern: 'There is / There are', meaning: 'Có...', cefr: 'A1', topic: 'Home', user_structures: { state: 'learning', mastery_level: 2 } },
  { id: 's3', pattern: 'I used to + V', meaning: 'Tôi từng...', cefr: 'B1', topic: 'Daily Life', user_structures: { state: 'review', review_due_at: '2020-01-01', mastery_level: 4 } },
  { id: 's4', pattern: 'be going to + V', meaning: 'Sẽ...', cefr: 'A2', topic: 'Travel', user_structures: { state: 'new' } },
];

describe('deriveStructureStatus', () => {
  it('null (chưa có user_structures) -> new', () => {
    expect(deriveStructureStatus(null).key).toBe('new');
    expect(deriveStructureStatus(null).label).toBe('Mới');
  });
  it('state new -> new', () => {
    expect(deriveStructureStatus({ state: 'new' }).key).toBe('new');
  });
  it('state learning / relearning -> again', () => {
    expect(deriveStructureStatus({ state: 'learning' }).key).toBe('again');
    expect(deriveStructureStatus({ state: 'relearning' }).key).toBe('again');
  });
  it('state review -> review', () => {
    expect(deriveStructureStatus({ state: 'review' }).key).toBe('review');
  });
});

describe('countStructureStates — QUAN TRỌNG: NEW gồm cả chưa có user_structures', () => {
  it('không để New = 0 khi có structure chưa học', () => {
    const counts = countStructureStates(STRUCTURES);
    // s1 (chưa row) + s4 (state new) = 2 new; s2 = again; s3 = review
    expect(counts).toEqual({ new: 2, again: 1, review: 1 });
  });

  it('100 structures chưa có progress -> toàn bộ là New', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      pattern: `P${i}`,
      user_structures: null,
    }));
    expect(countStructureStates(many)).toEqual({ new: 100, again: 0, review: 0 });
  });
});

describe('filterStructures', () => {
  it('search theo pattern (case-insensitive)', () => {
    const res = filterStructures(STRUCTURES, { search: 'want' });
    expect(res.map((s) => s.id)).toEqual(['s1']);
  });

  it('search theo meaning (từ tiếng Việt)', () => {
    const res = filterStructures(STRUCTURES, { search: 'từng' });
    expect(res.map((s) => s.id)).toEqual(['s3']);
  });

  it('search theo topic', () => {
    const res = filterStructures(STRUCTURES, { search: 'Daily Life' });
    expect(res.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('filter CEFR', () => {
    const res = filterStructures(STRUCTURES, { cefr: 'A1' });
    expect(res.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('filter topic', () => {
    const res = filterStructures(STRUCTURES, { topic: 'Home' });
    expect(res.map((s) => s.id)).toEqual(['s2']);
  });

  it('filter status new (gồm cả chưa có row)', () => {
    const res = filterStructures(STRUCTURES, { status: 'new' });
    expect(res.map((s) => s.id)).toEqual(['s1', 's4']);
  });

  it('filter status learning (learning/relearning)', () => {
    const res = filterStructures(STRUCTURES, { status: 'learning' });
    expect(res.map((s) => s.id)).toEqual(['s2']);
  });

  it('filter status review', () => {
    const res = filterStructures(STRUCTURES, { status: 'review' });
    expect(res.map((s) => s.id)).toEqual(['s3']);
  });

  it('kết hợp nhiều filter + search', () => {
    // CEFR A1 + topic Daily Life + status new
    const res = filterStructures(STRUCTURES, {
      cefr: 'A1',
      topic: 'Daily Life',
      status: 'new',
    });
    expect(res.map((s) => s.id)).toEqual(['s1']);
  });

  it('status all -> giữ tất cả', () => {
    expect(filterStructures(STRUCTURES, { status: 'all' })).toHaveLength(4);
  });
});

describe('distinctStructureTopics', () => {
  it('distinct + sort', () => {
    expect(distinctStructureTopics(STRUCTURES)).toEqual(['Daily Life', 'Home', 'Travel']);
  });
});