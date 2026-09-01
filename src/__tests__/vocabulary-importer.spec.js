/**
 * Vocabulary Importer / Parser tests.
 *
 * Schema Type chính thức CHỈ có 11 giá trị (VALID_WORD_TYPES), trong đó:
 *   - verb_phrase KHÔNG còn là Type hợp lệ.
 *   - Mọi phrase/expression/collocation (verb phrase, noun phrase, ...) -> other.
 *   - wake up -> phrasal_verb, wake up early -> other.
 */
import { describe, it, expect } from 'vitest';
import {
  parseVocabularyText,
  toImportPayload,
  dedupeRows,
  normalizeWordType,
  VALID_WORD_TYPES,
} from '../utils/vocabulary-importer.js';

describe('vocabulary-importer: VALID_WORD_TYPES (source of truth)', () => {
  it('contains exactly the 11 official types and excludes verb_phrase', () => {
    const arr = Array.from(VALID_WORD_TYPES);
    expect(arr).toHaveLength(11);
    expect(arr).toContain('phrasal_verb');
    expect(arr).toContain('other');
    expect(arr).not.toContain('verb_phrase');
    expect(arr).toEqual([
      'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition',
      'conjunction', 'determiner', 'interjection', 'phrasal_verb', 'other',
    ]);
  });
});

describe('vocabulary-importer: normalizeWordType', () => {
  it('keeps valid types unchanged', () => {
    for (const t of ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'phrasal_verb', 'other']) {
      const r = normalizeWordType(t);
      expect(r.value).toBe(t);
      expect(r.changed).toBe(false);
    }
  });

  it('maps phrasal verb variants to phrasal_verb', () => {
    expect(normalizeWordType('phrasal verb').value).toBe('phrasal_verb');
    expect(normalizeWordType('phrasal-verb').value).toBe('phrasal_verb');
    expect(normalizeWordType('phrasalverb').value).toBe('phrasal_verb');
    expect(normalizeWordType('phrasal verbs').value).toBe('phrasal_verb');
  });

  it('maps verb phrase variants to other (NOT verb_phrase)', () => {
    expect(normalizeWordType('verb phrase').value).toBe('other');
    expect(normalizeWordType('verb_phrase').value).toBe('other');
    expect(normalizeWordType('verb-phrase').value).toBe('other');
    expect(normalizeWordType('verbphrase').value).toBe('other');
    expect(normalizeWordType('verb phrases').value).toBe('other');
    expect(normalizeWordType('verb phrase').value).not.toBe('verb_phrase');
  });

  it('maps noun phrase to other (NOT noun)', () => {
    expect(normalizeWordType('noun phrase').value).toBe('other');
    expect(normalizeWordType('noun_phrase').value).toBe('other');
  });

  it('maps phrase/expression/collocation to other', () => {
    expect(normalizeWordType('phrase').value).toBe('other');
    expect(normalizeWordType('expression').value).toBe('other');
    expect(normalizeWordType('collocation').value).toBe('other');
  });

  it('maps abbreviations correctly', () => {
    expect(normalizeWordType('v.').value).toBe('verb');
    expect(normalizeWordType('n.').value).toBe('noun');
    expect(normalizeWordType('adj.').value).toBe('adjective');
    expect(normalizeWordType('adv.').value).toBe('adverb');
    expect(normalizeWordType('prep.').value).toBe('preposition');
    expect(normalizeWordType('conj.').value).toBe('conjunction');
    expect(normalizeWordType('pron.').value).toBe('pronoun');
    expect(normalizeWordType('interj.').value).toBe('interjection');
  });

  it('falls back to other for unknown types', () => {
    const r = normalizeWordType('unknown_type');
    expect(r.value).toBe('other');
    expect(r.changed).toBe(true);
  });

  it('rejects verb_phrase as a valid type (falls back to other)', () => {
    const r = normalizeWordType('verb_phrase');
    expect(r.value).toBe('other');
    expect(VALID_WORD_TYPES.has('verb_phrase')).toBe(false);
  });
});

describe('vocabulary-importer: parseVocabularyText', () => {
  it('parses single-word list format', () => {
    const result = parseVocabularyText('apple\nlion\nfan');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].word).toBe('apple');
    expect(result.format).toBe('single');
    expect(result.hadHeader).toBe(false);
  });

  it('parses pipe format with normalization', () => {
    const input = [
      'Word | IPA | Type | Meaning | Example | Memory Clue | CEFR',
      'apple | /ˈæpəl/ | noun | quả táo | She ate an apple. | áp-pồ | A1',
    ].join('\n');
    const result = parseVocabularyText(input);
    expect(result.format).toBe('pipe');
    expect(result.hadHeader).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].word).toBe('apple');
    expect(result.rows[0].word_type).toBe('noun');
    expect(result.rows[0].cefr).toBe('A1');
  });

  it('normalizes verb phrase to other in pipe input', () => {
    const result = parseVocabularyText(
      'run | /rʌn/ | verb phrase | to run | He runs. | run | A1'
    );
    expect(result.rows[0].word_type).toBe('other');
    expect(result.rows[0].word_type).not.toBe('verb_phrase');
  });

  it('normalizes phrasal verb correctly in pipe input', () => {
    const result = parseVocabularyText(
      'wake up | /weɪk ʌp/ | phrasal_verb | thức dậy | I wake up. | thức lên | A1'
    );
    expect(result.rows[0].word_type).toBe('phrasal_verb');
  });
});

describe('vocabulary-importer: toImportPayload', () => {
  it('ensures word_type is always a valid enum value', () => {
    const rows = [
      { word: 'run', word_type: 'verb phrase', meaning: 'chạy', example: '', memory_clue: '', cefr: 'A1', ipa: '/rʌn/' },
      { word: 'wake up', word_type: 'phrasal verb', meaning: 'thức dậy', example: '', memory_clue: '', cefr: 'A1', ipa: '/weɪk ʌp/' },
    ];
    const payload = toImportPayload(rows);
    expect(payload[0].word_type).toBe('other');
    expect(payload[1].word_type).toBe('phrasal_verb');
    payload.forEach((r) => {
      expect(VALID_WORD_TYPES.has(r.word_type)).toBe(true);
    });
  });

  it('strips internal _warnings field from payload', () => {
    const rows = [
      { word: 'bad', word_type: 'unknown', _warnings: ['something'], meaning: 'xấu', example: '', memory_clue: '', cefr: null, ipa: '' },
    ];
    const payload = toImportPayload(rows);
    expect(payload[0]).not.toHaveProperty('_warnings');
    expect(payload[0].word_type).toBe('other');
  });
});

describe('vocabulary-importer: dedupeRows', () => {
  it('removes duplicates within input', () => {
    const rows = [
      { word: 'apple', word_type: 'noun' },
      { word: 'Apple', word_type: 'noun' },
    ];
    const { rows: kept, duplicates } = dedupeRows(rows, []);
    expect(kept).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });
});

/*
 * Integration: the expected behaviors from the task spec.
 */
describe('vocabulary-importer: spec compliance', () => {
  const cases = [
    { word: 'apple', type: 'noun', expected: 'noun' },
    { word: 'run', type: 'verb', expected: 'verb' },
    { word: 'beautiful', type: 'adjective', expected: 'adjective' },
    { word: 'quickly', type: 'adverb', expected: 'adverb' },
    { word: 'he', type: 'pronoun', expected: 'pronoun' },
    { word: 'in', type: 'preposition', expected: 'preposition' },
    { word: 'and', type: 'conjunction', expected: 'conjunction' },
    { word: 'the', type: 'determiner', expected: 'determiner' },
    { word: 'hello', type: 'interjection', expected: 'interjection' },
    { word: 'wake up', type: 'phrasal_verb', expected: 'phrasal_verb' },
    { word: 'make the bed', type: 'other', expected: 'other' },
    { word: 'wake up early', type: 'other', expected: 'other' },
    { word: 'go to work', type: 'other', expected: 'other' },
    { word: 'in the morning', type: 'other', expected: 'other' },
    { word: 'a cup of coffee', type: 'other', expected: 'other' },
  ];

  cases.forEach(({ word, type, expected }) => {
    it(`${word} (${type}) -> ${expected}`, () => {
      const r = normalizeWordType(type);
      expect(r.value).toBe(expected);
      expect(VALID_WORD_TYPES.has(r.value)).toBe(true);
    });
  });

  it('rejects invalid types that should not be aliases', () => {
    ['verb_phrase', 'phrase_type', 'unknown', 'word', 'phrasal'].forEach((invalid) => {
      const r = normalizeWordType(invalid);
      expect(r.value).toBe('other');
      expect(r.changed).toBe(true);
      expect(VALID_WORD_TYPES.has(invalid)).toBe(false);
    });
  });
});
