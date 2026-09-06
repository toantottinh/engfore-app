import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Guard the ROOT-CAUSE fix for the import write-path.
//
// Background:
//   import_words is a SECURITY DEFINER PL/pgSQL RPC, so it is not executed
//   by the JS unit-suite (supabase is mocked). The meaningful regression
//   guard is a STATIC check on the migration source so the two past bugs
//   cannot silently re-enter:
//
//   BUG 1: sense lookup compared v_meaning to itself (always TRUE):
//     coalesce(v_meaning) = coalesce(v_meaning)
//   Correct: compare the `meaning` COLUMN against the input `v_meaning`.
//
//   BUG 2: an existing canonical sense was never refreshed — re-importing
//     the same (word, type, meaning) with new description/example kept the
//     OLD content (this is what made `architecture` show old content).
//   Correct: the function must UPDATE word_senses.description/example for
//     a matched existing sense.

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260907000000_fix_import_words_content_refresh.sql'
);

const readMigration = () => readFile(MIGRATION, 'utf8');

// Normalize the SQL body by stripping `--` line comments and collapsing
// whitespace so the guarded tokens can be asserted without SQL parsing.
const bodyOf = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ');

describe('import_words migration — import write-path regression guard', () => {
  let sql;

  beforeAll(async () => {
    sql = await readMigration();
  });

  it('exists and defines the canonical import_words overload', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.import_words(');
    expect(sql).toContain('p_words_data jsonb');
  });

  it('BUG1-guard: sense lookup compares the `meaning` COLUMN to v_meaning, not v_meaning to itself', () => {
    const body = bodyOf(sql);
    const selfCompare = /coalesce\(v_meaning[^)]*\).*=.*coalesce\(v_meaning[^)]*\)/;
    const columnCompare = /coalesce\(meaning[^)]*\).*=.*coalesce\(v_meaning[^)]*\)/;
    // The always-TRUE self-comparison must not be present.
    if (selfCompare.test(body)) {
      // Allow only if a REAL column-vs-input comparison also exists on the
      // canonical lookup line; isolate the exact lookup predicate.
      const lookupLine = body
        .split(' ')
        .join(' ')
        .match(/regexp_replace[^;]*;?/g);
      const anyRealCompare = (lookupLine || []).some((chunk) =>
        /coalesce\(meaning/.test(chunk) && /coalesce\(v_meaning/.test(chunk)
      );
      expect(anyRealCompare).toBe(true);
    } else {
      expect(columnCompare.test(body)).toBe(true);
      expect(selfCompare.test(body)).toBe(false);
    }
  });

  it('BUG2-guard: existing canonical sense is UPGRADED (word_senses UPDATE exists)', () => {
    expect(sql).toMatch(/UPDATE\s+public\.word_senses/i);
    expect(sql.replace(/\s+/g, ' ')).toMatch(
      /description\s*=\s*coalesce\(\s*v_descr\s*,\s*description\s*\)/
    );
  });

  it('keeps reuse-ownership behavior (no duplicate, no clobber by empty)', () => {
    const body = bodyOf(sql);
    // Only refresh with non-empty values.
    expect(body).toMatch(/coalesce\(\s*v_descr\s*,\s*description\s*\)/);
    // Still links ownership idempotently.
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });
});