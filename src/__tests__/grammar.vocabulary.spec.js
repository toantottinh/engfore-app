import { describe, it, expect } from 'vitest';
import {
  GRAMMAR_WORD_TYPES,
  ruleTitleToWordType,
  groupSensesByType,
  resolveWordTypes,
  pickSenseByType,
} from '../utils/grammar-vocabulary.js';
import { VALID_WORD_TYPES } from '../utils/vocabulary-importer.js';

/**
 * GRAMMAR × VOCABULARY INTEGRATION (task section 9-11).
 *
 * NGUYÊN TẮC:
 *  - Type ĐỌC từ word_senses ĐÃ LƯU trong DB — không AI, không suy luận.
 *  - Multi-sense GIỮ NGUYÊN: một word có nhiều sense rows (word_type khác) sẽ
 *    xuất hiện ở MỌI type tương ứng (vd "work" -> noun + verb).
 *  - Grammar không có enum riêng: GRAMMAR_WORD_TYPES === VALID_WORD_TYPES.
 */

describe('grammar-vocabulary: type reuse (no new enum)', () => {
  it('GRAMMAR_WORD_TYPES is the SAME set as VALID_WORD_TYPES from vocabulary importer', () => {
    expect(GRAMMAR_WORD_TYPES).toBe(VALID_WORD_TYPES);
  });

  it('contains phrasal_verb and other (for phrase vs phrasal verb distinction)', () => {
    expect(GRAMMAR_WORD_TYPES).toContain('phrasal_verb');
    expect(GRAMMAR_WORD_TYPES).toContain('other');
  });
});

describe('grammar-vocabulary: ruleTitleToWordType (deterministic, no AI)', () => {
  it('maps English word-type rule titles', () => {
    expect(ruleTitleToWordType('Adjective')).toBe('adjective');
    expect(ruleTitleToWordType('Verb')).toBe('verb');
    expect(ruleTitleToWordType('Noun')).toBe('noun');
    expect(ruleTitleToWordType('Adverb')).toBe('adverb');
  });

  it('maps Vietnamese word-type rule titles', () => {
    expect(ruleTitleToWordType('tính từ')).toBe('adjective');
    expect(ruleTitleToWordType('động từ')).toBe('verb');
    expect(ruleTitleToWordType('danh từ')).toBe('noun');
    expect(ruleTitleToWordType('trạng từ')).toBe('adverb');
  });

  it('maps phrasal verb (phrasal_verb), not other', () => {
    expect(ruleTitleToWordType('phrasal verb')).toBe('phrasal_verb');
    expect(ruleTitleToWordType('cụm động từ')).toBe('phrasal_verb');
  });

  it('returns null for non-word-type rules (vd Present Simple)', () => {
    expect(ruleTitleToWordType('Present Simple')).toBeNull();
    expect(ruleTitleToWordType('')).toBeNull();
  });
});

describe('grammar-vocabulary: multi-sense word preserved', () => {
  const senses = [
    { id: 's1', word_type: 'noun', meaning: 'công việc', word: { word: 'work' } },
    { id: 's2', word_type: 'verb', meaning: 'làm việc', word: { word: 'work' } },
    { id: 's3', word_type: 'adjective', meaning: 'vui vẻ', word: { word: 'happy' } },
  ];

  it('groupSensesByType keeps one word in EVERY type it has (work -> noun + verb)', () => {
    const grouped = groupSensesByType(senses);
    expect(grouped.noun.map((s) => s.word.word)).toEqual(['work']);
    expect(grouped.verb.map((s) => s.word.word)).toEqual(['work']);
    expect(grouped.adjective.map((s) => s.word.word)).toEqual(['happy']);
  });

  it('resolveWordTypes returns distinct types preserving order (multi-sense)', () => {
    expect(resolveWordTypes(senses)).toEqual(['noun', 'verb', 'adjective']);
  });

  it('pickSenseByType picks the matching sense only; null when absent', () => {
    expect(pickSenseByType(senses, 'verb').id).toBe('s2');
    expect(pickSenseByType(senses, 'adverb')).toBeNull();
    expect(pickSenseByType([], 'noun')).toBeNull();
  });

  it('does not merge or infer — a word stays in both types until DB says otherwise', () => {
    expect(groupSensesByType(senses).noun).toHaveLength(1);
    expect(groupSensesByType(senses).verb).toHaveLength(1);
    expect(resolveWordTypes(senses)).toHaveLength(3);
  });
});

describe('grammar-vocabulary: phrase vs phrasal verb types come from DB, not heuristic', () => {
  it('keeps stored phrasal_verb vs other untouched', () => {
    const senses = [
      { id: 'p1', word_type: 'phrasal_verb', word: { word: 'wake up' } },
      { id: 'p2', word_type: 'other', word: { word: 'wake up early' } },
    ];
    expect(groupSensesByType(senses).phrasal_verb.map((s) => s.word.word)).toEqual(['wake up']);
    expect(groupSensesByType(senses).other.map((s) => s.word.word)).toEqual(['wake up early']);
  });
});