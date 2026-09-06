import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Guard the CANONICAL WORD IDENTITY fix for the import write-path.
//
// Background (data-cleanup audit, 2026-09):
//   Legacy imports EMBEDDED the word type into the word name, creating
//   shared `words` rows like `average(adj)` / `average(n)` next to the
//   canonical `average`. Root cause: every import RPC used the payload
//   word verbatim as canonical identity.
//
// import_words / admin_import_words / import_words_to_set are SECURITY
// DEFINER PL/pgSQL RPCs, so the meaningful JS-side regression guard is a
// STATIC check on the migration source:
//
//   * a shared helper public.strip_embedded_word_type(text) exists;
//   * EACH import function normalizes v_word BEFORE the words
//     lookup/insert (so `average(adj)` resolves to `average` and the
//     type stays in word_senses.word_type);
//   * the pre-existing behaviors are NOT broken (sense reuse by
//     (word_id, word_type, meaning) + content refresh in import_words).

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260908000000_import_words_canonical_word_identity.sql'
);

const readMigration = () => readFile(MIGRATION, 'utf8');

// Strip `--` comments + collapse whitespace for stable assertions.
const bodyOf = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ');

// Isolate a single CREATE ... FUNCTION body by name.
const functionBody = (sql, name) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) return '';
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end === -1 ? undefined : end + 3);
};

describe('import_words canonical word identity migration — regression guard', () => {
  let sql;

  beforeAll(async () => {
    sql = await readMigration();
  });

  it('exists and defines the shared strip_embedded_word_type helper', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.strip_embedded_word_type(');
    // Helper must strip a trailing parenthesized type marker.
    const helper = functionBody(sql, 'strip_embedded_word_type');
    expect(helper).toMatch(/\(adj\|n\|v\|verb\|noun\|adjective/);
    expect(helper).toMatch(/\\s\*\\\(/);
  });

  const IMPORT_FNS = [
    'import_words',
    'admin_import_words',
    'import_words_to_set',
  ];

  it.each(IMPORT_FNS)('%s normalizes v_word BEFORE the words lookup/insert', (fn) => {
    const body = bodyOf(functionBody(sql, fn));
    const normalizeAt = body.indexOf('v_word := public.strip_embedded_word_type(v_word)');
    expect(normalizeAt).toBeGreaterThan(-1);
    // The words lookup must come AFTER normalization inside this function.
    const lookupAt = body.indexOf('SELECT id INTO v_word_id FROM public.words');
    expect(lookupAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeGreaterThan(normalizeAt);
  });

  it('never writes the raw payload word into words (INSERT uses normalized v_word)', () => {
    for (const fn of IMPORT_FNS) {
      const body = bodyOf(functionBody(sql, fn));
      const insertAt = body.indexOf('INSERT INTO public.words');
      const normalizeAt = body.indexOf('v_word := public.strip_embedded_word_type(v_word)');
      expect(insertAt).toBeGreaterThan(normalizeAt);
      expect(body).toMatch(/VALUES \(v_word, v_ipa/);
    }
  });

  it('does NOT break word_senses reuse behavior (meaning column compare kept)', () => {
    const body = bodyOf(functionBody(sql, 'import_words'));
    expect(body).toMatch(
      /regexp_replace\(trim\(lower\(coalesce\(meaning,''\)\)\)/
    );
    expect(body).toMatch(/coalesce\(v_meaning,''\)/);
  });

  it('does NOT break the content-refresh fix (word_senses UPDATE kept)', () => {
    const body = bodyOf(functionBody(sql, 'import_words'));
    expect(body).toMatch(/UPDATE public\.word_senses/);
    expect(body).toMatch(/description = coalesce\(v_descr, description\)/);
  });

  it('keeps multiple senses per word possible (insert path intact, not replaced by update-only)', () => {
    const body = bodyOf(functionBody(sql, 'import_words'));
    expect(body).toMatch(/INSERT INTO public\.word_senses/);
    // The architecture intentionally allows multiple senses per word —
    // the fix must not collapse senses; it only dedupes word identity.
    expect(body).toMatch(/IF v_sense IS NULL THEN/);
  });
});
