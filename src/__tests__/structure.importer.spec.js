import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------------------------------------------------------------------
// Tests cho Structure Import Knowledge:
//   - utils/structure-importer.js (parser, validator, dedupe, payload)
//   - services/structure.service.js#importStructures (RPC wrapper)
//
// Mock supabase client theo pattern của learning.queue.spec.js — không cần
// env/DB thật. Các hàm parser là pure nên được test trực tiếp.
// ------------------------------------------------------------------

const rpcMock = vi.fn(async () => ({ data: null, error: null }));

vi.mock('../services/supabase.js', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: () => ({
      select: async () => ({ data: [], error: null }),
    }),
  },
}));

import {
  parseStructureText,
  isValidStructureRow,
  dedupeStructureRows,
  toStructureImportPayload,
  structureKey,
} from '../utils/structure-importer.js';
import { importStructures } from '../services/structure.service.js';

const VALID_LINE =
  'I want to + V | Tôi muốn... | Dùng để nói về mong muốn | I want to learn English. ;; I want to go home. ;; I want to play football. | A1 | Daily Life';

function firstRow(text) {
  const { rows } = parseStructureText(text);
  return rows[0];
}

describe('parseStructureText — parser & validation', () => {
  it('parse đúng một dòng hợp lệ đủ 6 trường', () => {
    const row = firstRow(VALID_LINE);
    expect(row.pattern).toBe('I want to + V');
    expect(row.meaning).toBe('Tôi muốn...');
    expect(row.explanation).toBe('Dùng để nói về mong muốn');
    expect(row.examples).toEqual([
      'I want to learn English.',
      'I want to go home.',
      'I want to play football.',
    ]);
    expect(row.cefr).toBe('A1');
    expect(row.topic).toBe('Daily Life');
    expect(isValidStructureRow(row)).toBe(true);
  });

  it('trim whitespace quanh các ô và thu gọn khoảng trắng trong pattern', () => {
    const row = firstRow('   There is / There are   |  Có...  |  Tồn tại  |  There is a book.  |  a1  |  Home  ');
    expect(row.pattern).toBe('There is / There are');
    expect(row.meaning).toBe('Có...');
    expect(row.explanation).toBe('Tồn tại');
    expect(row.examples).toEqual(['There is a book.']);
    expect(row.cefr).toBe('A1'); // chuẩn hóa chữ thường -> A1
    expect(row.topic).toBe('Home');
  });

  it('tách nhiều examples bằng ";;" và bỏ câu rỗng/thừa delimiter', () => {
    const row = firstRow('P | M | E | A ;; B ;;;;;; C ;; | B1 | T');
    expect(row.examples).toEqual(['A', 'B', 'C']);
  });

  it('thiếu pattern (cột 1 rỗng) -> row lỗi', () => {
    const row = firstRow(' | nghĩa | giải thích | ví dụ | A1 | Topic');
    expect(isValidStructureRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/Thiếu cấu trúc/);
  });

  it('thiếu meaning (cột 2 rỗng) -> row lỗi', () => {
    const row = firstRow('I want to + V |  | giải thích | ví dụ | A1 | Topic');
    expect(isValidStructureRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/Thiếu nghĩa/);
  });

  it('explanation rỗng là HỢP LỆ (trường tùy chọn)', () => {
    const row = firstRow('I want to + V | Tôi muốn |  | I want to go. | A2 | ');
    expect(isValidStructureRow(row)).toBe(true);
    expect(row.explanation).toBe('');
    expect(row.topic).toBe('');
  });

  it('examples rỗng -> cảnh báo nhưng vẫn hợp lệ', () => {
    const row = firstRow('I want to + V | Tôi muốn | Giải thích |  | A1 | Daily Life');
    expect(isValidStructureRow(row)).toBe(true);
    expect(row.examples).toEqual([]);
    expect(row._warnings.join(' ')).toMatch(/Không có ví dụ/);
  });

  it('CEFR hợp lệ giữ nguyên, CEFR sai -> rỗng + cảnh báo', () => {
    const ok = firstRow('P | M | E | X. | C2 | T');
    expect(ok.cefr).toBe('C2');

    const bad = firstRow('P | M | E | X. | Z9 | T');
    expect(isValidStructureRow(bad)).toBe(true); // chỉ là warning, không chặn
    expect(bad.cefr).toBe('');
    expect(bad._warnings.join(' ')).toMatch(/CEFR .* không hợp lệ/);
  });

  it('dòng không có dấu "|" -> row lỗi rõ ràng', () => {
    const row = firstRow('một dòng lạc quỷ');
    expect(isValidStructureRow(row)).toBe(false);
    expect(row._errors.join(' ')).toMatch(/không có dấu "\|"/);
  });

  it('sai số cột (5 hoặc 7 cột) -> row lỗi', () => {
    const five = firstRow('P | M | E | X. | A1');
    const seven = firstRow('P | M | E | X. | A1 | T | Thừa');
    expect(isValidStructureRow(five)).toBe(false);
    expect(five._errors.join(' ')).toMatch(/sai số cột \(cần 6, thấy 5\)/);
    expect(isValidStructureRow(seven)).toBe(false);
    expect(seven._errors.join(' ')).toMatch(/sai số cột \(cần 6, thấy 7\)/);
  });

  it('nhận diện và bỏ qua dòng header', () => {
    const result = parseStructureText(
      'Structure | Meaning | Explanation | Examples | CEFR | Topic\n' + VALID_LINE
    );
    expect(result.hadHeader).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].pattern).toBe('I want to + V');
  });

  it('text rỗng trả về danh sách rỗng', () => {
    const result = parseStructureText('   \n  \n');
    expect(result.rows).toEqual([]);
    expect(result.hadHeader).toBe(false);
    expect(result.format).toBe('pipe');
  });

  it('parse độc lập nhiều dòng', () => {
    const result = parseStructureText(
      VALID_LINE + '\n' + 'There is / There are | Có... | Tồn tại | There is a book. ;; There are two chairs. | A1 | Home'
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(isValidStructureRow)).toBe(true);
    expect(result.rows[1].pattern).toBe('There is / There are');
    expect(result.rows[1].examples).toHaveLength(2);
  });
});

describe('dedupeStructureRows — trùng lặp trong batch & đã tồn tại', () => {
  it('trùng pattern TRONG cùng batch: giữ dòng đầu, loại dòng sau kèm lý do', () => {
    const { rows } = parseStructureText(VALID_LINE + '\n' + VALID_LINE);
    const { rows: kept, duplicates } = dedupeStructureRows(rows);
    expect(kept).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]._reason).toMatch(/Trùng trong nội dung nhập/);
  });

  it('dedupe KHÔNG phân biệt hoa/thường', () => {
    const { rows } = parseStructureText(
      'I want to + V | A | E | X. | A1 | T\ni WANT TO + v | B | E | Y. | B1 | U'
    );
    const { rows: kept, duplicates } = dedupeStructureRows(rows);
    expect(kept).toHaveLength(1);
    expect(kept[0].meaning).toBe('A'); // dòng đầu thắng
    expect(duplicates).toHaveLength(1);
  });

  it('pattern ĐÃ TỒN TẠI trong DB: KHÔNG bị loại, chỉ gắn cảnh báo "sẽ cập nhật"', () => {
    const { rows } = parseStructureText(VALID_LINE);
    const { rows: kept, duplicates } = dedupeStructureRows(rows, ['i want to + v']);
    expect(duplicates).toHaveLength(0);
    expect(kept).toHaveLength(1);
    expect(kept[0]._warnings.join(' ')).toMatch(/CẬP NHẬT/);
  });

  it('structureKey khớp logic unique index của DB (lower + trim)', () => {
    expect(structureKey('  I Want To + V ')).toBe('i want to + v');
  });
});

describe('toStructureImportPayload — payload cho RPC import_structures', () => {
  it('tạo đúng shape RPC: examples là mảng object {sentence}', () => {
    const { rows } = parseStructureText(VALID_LINE);
    const [payload] = toStructureImportPayload(rows);
    expect(payload).toEqual({
      pattern: 'I want to + V',
      meaning: 'Tôi muốn...',
      explanation: 'Dùng để nói về mong muốn',
      cefr: 'A1',
      topic: 'Daily Life',
      examples: [
        { sentence: 'I want to learn English.' },
        { sentence: 'I want to go home.' },
        { sentence: 'I want to play football.' },
      ],
    });
  });

  it('explanation/topic rỗng -> null; CEFR rỗng/sai -> null (không string rỗng)', () => {
    const { rows } = parseStructureText('P | M |  | X. |  |  ');
    const [payload] = toStructureImportPayload(rows);
    expect(payload.explanation).toBeNull();
    expect(payload.cefr).toBeNull();
    expect(payload.topic).toBeNull();
    expect(payload.examples).toEqual([{ sentence: 'X.' }]);
  });

  it('LOẠI các row không hợp lệ khỏi payload', () => {
    const { rows } = parseStructureText(
      VALID_LINE + '\n' + ' | thiếu pattern | E | X. | A1 | T'
    );
    const payloads = toStructureImportPayload(rows);
    expect(payloads).toHaveLength(1);
    expect(payloads[0].pattern).toBe('I want to + V');
  });

  it('re-normalize an toàn khi admin sửa ô tay (pattern thừa khoảng trắng, CEFR thường)', () => {
    const { rows } = parseStructureText(VALID_LINE);
    rows[0].pattern = '   I   want   to + V ';
    rows[0].cefr = 'b1';
    const [payload] = toStructureImportPayload(rows);
    expect(payload.pattern).toBe('I want to + V');
    expect(payload.cefr).toBe('B1');
  });
});

describe('importStructures — service wrapper (RPC import_structures)', () => {
  beforeEach(() => {
    rpcMock.mockClear();
    rpcMock.mockImplementation(async () => ({ data: null, error: null }));
  });

  it('gọi đúng RPC với p_rows payload', async () => {
    const structures = [{ pattern: 'P', meaning: 'M', explanation: null, cefr: 'A1', topic: null, examples: [] }];
    await importStructures({ structures });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('import_structures', { p_rows: structures });
  });

  it('trả meta (created/updated/errored) từ dòng đầu của kết quả RPC', async () => {
    rpcMock.mockImplementation(async () => ({
      data: [{ created: 2, updated: 1, errored: 0 }],
      error: null,
    }));
    const { data, error, meta } = await importStructures({ structures: [] });
    expect(error).toBeNull();
    expect(data).toEqual([{ created: 2, updated: 1, errored: 0 }]);
    expect(meta).toEqual({ created: 2, updated: 1, errored: 0 });
  });

  it('RPC lỗi -> trả { data: null, error, meta: null } theo convention service', async () => {
    const rpcError = { message: 'Only admins can import structures.', code: 'P0001' };
    rpcMock.mockImplementation(async () => ({ data: null, error: rpcError }));
    const { data, error, meta } = await importStructures({ structures: [{ pattern: 'P' }] });
    expect(data).toBeNull();
    expect(error).toBe(rpcError);
    expect(meta).toBeNull();
  });

  it('payload không phải mảng -> vẫn gọi RPC với mảng rỗng (an toàn)', async () => {
    await importStructures({ structures: null });
    expect(rpcMock).toHaveBeenCalledWith('import_structures', { p_rows: [] });
  });
});