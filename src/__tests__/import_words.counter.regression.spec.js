import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Guard the COUNTER FIX for import_words: created/existing must reflect the
// CURRENT USER's Vocabulary (user_vocabulary), NOT whether the canonical
// global word_sense already exists.
//
// Background:
//   import_words is a SECURITY DEFINER PL/pgSQL RPC, so it is not executed
//   by the JS unit-suite (supabase is mocked). The meaningful regression
//   guard is a STATIC check on the migration source so the counter bug cannot
//   silently re-enter:
//
//   BUG: counter was tied to the global word_sense lookup:
//     IF v_sense IS NULL  -> v_created  := v_created  + 1   (global NEW)
//     ELSE                -> v_existing := v_existing + 1   (global EXISTING)
//
//   Correct: counter is decided by whether the CURRENT USER already owns a
//   user_vocabulary row for the sense (v_user_owns), independent of the
//   global word_sense existence.

const MIGRATION = resolve(
  process.cwd(),
  'supabase/migrations/20260909000000_fix_import_words_counter.sql'
);

const readMigration = () => readFile(MIGRATION, 'utf8');

const bodyOf = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ');

describe('import_words counter fix -- created/existing reflects user_vocabulary', () => {
  let sql;

  beforeAll(async () => {
    sql = await readMigration();
  });

  it('exists and defines the canonical import_words overload', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.import_words(');
    expect(sql).toContain('p_words_data jsonb');
  });

  it('counter is decided by user_vocabulary ownership (v_user_owns)', () => {
    const body = bodyOf(sql);
    expect(body).toMatch(/SELECT[\s]+EXISTS[\s]*\([\s]*SELECT[\s]+1/);
    expect(body).toMatch(/FROM[\s]+public\.user_vocabulary/);
    expect(body).toMatch(/user_id[\s]*=[\s]*v_user/);
    expect(body).toMatch(/word_sense_id[\s]*=[\s]*v_sense/);
    expect(body).toMatch(/INTO[\s]+v_user_owns/);
    expect(body).toMatch(/IF[\s]+v_user_owns[\s]+THEN/);
  });

  it('NEW = no ownership row yet (v_created += 1 in NOT branch)', () => {
    const body = bodyOf(sql);
    // After INTO v_user_owns: TRUE -> v_existing, ELSE -> v_created.
    expect(body).toMatch(/v_user_owns[\s\S]*v_existing[\s]*:=[\s]*v_existing[\s]*\+[\s]*1/);
    expect(body).toMatch(/v_user_owns[\s\S]*ELSE[\s\S]*v_created[\s]*:=[\s]*v_created[\s]*\+[\s]*1/);
  });

  it('does NOT tie the counter to the global word_sense IS NULL branch', () => {
    const body = bodyOf(sql);
    const senseNullIdx = body.indexOf('IF v_sense IS NULL THEN');
    expect(senseNullIdx).toBeGreaterThan(-1);
    const firstEndIf = body.indexOf('END IF', senseNullIdx);
    expect(firstEndIf).toBeGreaterThan(senseNullIdx);
    const senseBlock = body.slice(senseNullIdx, firstEndIf);
    // Neither counter increment may appear inside the v_sense existence block.
    expect(senseBlock).not.toContain('v_created := v_created + 1');
    expect(senseBlock).not.toContain('v_existing := v_existing + 1');
    // The counter increments must appear AFTER the v_sense block closes.
    const afterSenseBlock = body.slice(firstEndIf);
    expect(afterSenseBlock).toContain('v_created := v_created + 1');
    expect(afterSenseBlock).toContain('v_existing := v_existing + 1');
  });

  it('upserts user_vocabulary with example + memory_clue (NULL-safe)', () => {
    const body = bodyOf(sql);
    expect(body).toMatch(
      /INSERT[\s]+INTO[\s]+public\.user_vocabulary[\s]*\([\s]*user_id[\s]*,[\s]*word_sense_id[\s]*,[\s]*example[\s]*,[\s]*memory_clue[\s]*\)/
    );
    expect(body).toMatch(
      /ON[\s]+CONFLICT[\s]*\([\s]*user_id[\s]*,[\s]*word_sense_id[\s]*\)[\s]*DO[\s]+UPDATE/
    );
    expect(body).toMatch(
      /example[\s]*=[\s]*coalesce[\s]*\([\s]*EXCLUDED\.example[\s]*,[\s]*public\.user_vocabulary\.example[\s]*\)/
    );
    expect(body).toMatch(
      /memory_clue[\s]*=[\s]*coalesce[\s]*\([\s]*EXCLUDED\.memory_clue[\s]*,[\s]*public\.user_vocabulary\.memory_clue[\s]*\)/
    );
  });

  it('NEVER touches user_progress (SRS out of scope)', () => {
    const body = bodyOf(sql);
    expect(body).not.toMatch(/user_progress/);
    expect(body).not.toMatch(/mastery_level/);
    expect(body).not.toMatch(/review_due_at/);
    expect(body).not.toMatch(/ease_factor/);
  });

  it('keeps the original RPC signature and return shape', () => {
    expect(sql).toContain('p_words_data jsonb');
    expect(sql).toContain('p_set_id uuid DEFAULT NULL');
    expect(sql).toContain('p_new_set_name text DEFAULT NULL');
    expect(sql).toContain('RETURNS TABLE(created int, existing int, linked int, errored int, set_id uuid)');
  });

  it('keeps set_words linking behavior unchanged', () => {
    const body = bodyOf(sql);
    expect(body).toMatch(/INSERT[\s]+INTO[\s]+public\.set_words[\s]*\([\s]*set_id[\s]*,[\s]*word_sense_id[\s]*\)/);
    expect(body).toMatch(/ON[\s]+CONFLICT[\s]+DO[\s]+NOTHING/);
  });
});
