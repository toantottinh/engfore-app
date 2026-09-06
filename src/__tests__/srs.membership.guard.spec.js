import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// ROOT-CAUSE REGRESSION GUARD — "deleted vocabulary still shows in Learn".
//
// The Learn/SRS queue reads user_progress and is supposed to be scoped to the
// user's CURRENT vocabulary membership (set_words + vocabulary_sets). The
// membership guard was written as a PostgREST embedded filter:
//
//   .filter('word_senses.set_words.vocabulary_sets.user_id', 'eq', userId)
//
// PostgREST semantics (verified live on this project's Supabase):
//   * WITHOUT `!inner` on the embed, that filter only prunes the embedded JSON
//     — the PARENT rows are returned unfiltered (1000-row cap observed). So the
//     guard was a NO-OP and orphaned user_progress rows (word removed from
//     Vocabulary) kept surfacing in DUE/LEARNING with full content.
//   * WITH `!inner`, the embed becomes an inner join: parent rows are filtered
//     (orphans excluded), to-many children are aggregated so a word in several
//     Sets is returned ONCE, and count=exact stays correct.
//
// These tests pin BOTH layers:
//   1) the select strings must declare the membership chain with `!inner`;
//   2) the service contract must exclude membership-less progress rows.
// ---------------------------------------------------------------------------

const SERVICE = resolve(process.cwd(), 'src/services/learning.service.js');

const readService = () => readFile(SERVICE, 'utf8');

describe('SRS membership guard — PostgREST !inner requirement', () => {
  it('declares word_senses!inner in every SRS select string', async () => {
    const src = await readService();
    // The two row selects and both count/next-due selects.
    const innerCount = (src.match(/word_senses!inner/g) || []).length;
    expect(innerCount).toBeGreaterThanOrEqual(4);
  });

  it('declares set_words!inner + vocabulary_sets!inner on the membership path', async () => {
    const src = await readService();
    expect((src.match(/set_words!inner/g) || []).length).toBeGreaterThanOrEqual(4);
    expect((src.match(/vocabulary_sets!inner/g) || []).length).toBeGreaterThanOrEqual(4);
    // And the legacy (no-op) embed form must be gone from the selects.
    expect(src).not.toMatch(/word_senses \(\s*$/m);
  });

  it('keeps the membership filter column aligned with the embedded path', async () => {
    const src = await readService();
    expect(src).toContain("column: 'word_senses.set_words.vocabulary_sets.user_id'");
  });
});