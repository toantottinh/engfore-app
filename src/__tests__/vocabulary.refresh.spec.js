import { describe, it, expect } from 'vitest';
import { vocabularyStore, refreshVocabulary } from '../utils/vocabularyStore.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('vocabularyStore -> shared refresh signal', () => {
  it('subscribers are notified on refresh and version increments', () => {
    let calls = 0;
    const before = vocabularyStore.version;
    const unsub = vocabularyStore.subscribe(() => { calls += 1; });
    refreshVocabulary();
    expect(calls).toBe(1);
    expect(vocabularyStore.version).toBe(before + 1);
    unsub();
    refreshVocabulary();
    expect(calls).toBe(1);
  });

  it('supports multiple subscribers and is resilient to throwers', () => {
    const ok = [];
    const unsubA = vocabularyStore.subscribe(() => ok.push('a'));
    const unsubB = vocabularyStore.subscribe(() => { throw new Error('boom'); });
    const subC = vocabularyStore.subscribe(() => ok.push('b'));
    refreshVocabulary();
    expect(ok).toEqual(['a', 'b']);
    unsubA(); unsubB(); subC();
  });
});

describe('stale-view regression -> Import to Library wiring (static)', () => {
  const Import = readFileSync(resolve(process.cwd(), 'src/pages/Import/index.jsx'), 'utf8');
  const Library = readFileSync(resolve(process.cwd(), 'src/pages/Vocabulary/index.jsx'), 'utf8');
  const Service = readFileSync(resolve(process.cwd(), 'src/services/vocabulary.service.js'), 'utf8');

  it('Import page invokes refreshVocabulary() after a successful import', () => {
    expect(Import).toContain('refreshVocabulary()');
    expect(Import).toContain("from '../../utils/vocabularyStore.js'");
  });

  it('Library page subscribes to vocabularyStore on mount', () => {
    expect(Library).toContain('vocabularyStore.subscribe');
  });

  it('getUserVocabulary ownership read path is user_vocabulary-based (live 200 verified)', () => {
    // NEW contract: base table = user_vocabulary (ownership source of truth);
    // set_words/vocabulary_sets chỉ là membership metadata (set_names).
    expect(Service).toMatch(/\.from\(['"]user_vocabulary['"]\)/);
    expect(Service).toMatch(/word_senses \(/);
    expect(Library).toMatch(/getUserVocabulary/);
    // Không quay lại logic set_words ⋈ vocabulary_sets làm nguồn Kho từ.
    expect(Service).not.toMatch(/\.eq\(['"]vocabulary_sets\.user_id['"]/);
  });
});
