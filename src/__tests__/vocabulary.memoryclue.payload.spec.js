import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Regression tests — USER-OWNED Example / Memory Clue (frontend half).
//
// Root cause: IMPORT_REUSES_SENSE_BUT_CONTENT_OWNERSHIP_IS_WRONG.
// Frontend payload bug: parser produced `row.description`, the preview
// table edited `row.memory_clue` (COLUMN_HEADERS key) and toImportPayload
// read `row.description` — so an edited Memory Clue was silently LOST
// before reaching the import_words RPC. The canonical frontend field is
// now `memory_clue` end-to-end (parser → preview edit → payload → RPC).
// ------------------------------------------------------------------

import {
  parseVocabularyText,
  toImportPayload,
} from '../utils/vocabulary-importer.js';

// supabase mock capturing rpc payloads
const rpcCalls = [];
vi.mock('../services/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => {
      throw new Error('unexpected table query in this spec');
    }),
    rpc: vi.fn(async (fn, args) => {
      rpcCalls.push([fn, args]);
      return { data: [{ created: 1, existing: 0, linked: 1, errored: 0, set_id: 'set-1' }], error: null };
    }),
  },
}));

import { importWords, addWordToSet } from '../services/vocabulary.service.js';

const PIPE_INPUT = [
  'Word | IPA | Type | Meaning | Example | Memory Clue | CEFR',
  'airport | /ˈeəpɔːt/ | noun | sân bay | I went to the airport. | plane + port | A2',
].join('\n');

describe('Memory Clue payload — parser → preview edit → RPC (one canonical field)', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
  });

  it('parses the "Memory Clue" column into row.memory_clue (không còn field description)', () => {
    const { rows } = parseVocabularyText(PIPE_INPUT);
    expect(rows).toHaveLength(1);
    expect(rows[0].memory_clue).toBe('plane + port');
    expect(rows[0]).not.toHaveProperty('description');
  });

  it('vẫn nhận header "Description"/"Mô tả" cũ và map thẳng vào memory_clue (backward compatible)', () => {
    const { rows } = parseVocabularyText(
      'Word | IPA | Type | Meaning | Example | Description | CEFR\napple | /æp/ | noun | quả táo | I eat an apple. | red fruit | A1'
    );
    expect(rows[0].memory_clue).toBe('red fruit');
    expect(rows[0]).not.toHaveProperty('description');
  });

  it('toImportPayload xuất memory_clue và KHÔNG emit description', () => {
    const { rows } = parseVocabularyText(PIPE_INPUT);
    const payload = toImportPayload(rows);
    expect(payload[0].memory_clue).toBe('plane + port');
    expect(payload[0]).not.toHaveProperty('description');
  });

  it('REGRESSION: Memory Clue sửa trực tiếp trong preview KHÔNG bị mất trước khi gọi RPC', () => {
    const { rows } = parseVocabularyText(PIPE_INPUT);
    // Mô phỏng updateCell(idx, 'memory_clue', value) trên preview table
    const edited = rows.map((r, i) => (i === 0 ? { ...r, memory_clue: 'EDITED-IN-PREVIEW' } : r));
    const payload = toImportPayload(edited);
    expect(payload[0].memory_clue).toBe('EDITED-IN-PREVIEW');
  });

  it('importWords gửi memory_clue nguyên vẹn qua p_words_data (không map về description)', async () => {
    const { error } = await importWords({
      words: [{ word: 'airport', meaning: 'sân bay', example: 'Ex A', memory_clue: 'Clue A' }],
      setId: 'set-1',
    });
    expect(error).toBeNull();
    expect(rpcCalls).toHaveLength(1);
    const [fn, args] = rpcCalls[0];
    expect(fn).toBe('import_words');
    expect(args.p_words_data[0].memory_clue).toBe('Clue A');
    expect(args.p_words_data[0]).not.toHaveProperty('description');
  });

  it('addWordToSet (form thêm từ ở Set detail) truyền memory_clue qua import_words', async () => {
    const { error } = await addWordToSet('set-1', {
      word: 'apple',
      meaning: 'quả táo',
      example: 'I eat an apple.',
      memory_clue: 'quả táo đỏ',
    });
    expect(error).toBeNull();
    const [fn, args] = rpcCalls[0];
    expect(fn).toBe('import_words');
    expect(args.p_words_data[0].memory_clue).toBe('quả táo đỏ');
  });
});
