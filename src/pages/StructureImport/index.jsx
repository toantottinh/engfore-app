import React, { useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { importStructures, getStructurePatterns } from '../../services/structure.service.js';
import {
  parseStructureText,
  isValidStructureRow,
  dedupeStructureRows,
  toStructureImportPayload,
  EXAMPLES_DELIMITER,
} from '../../utils/structure-importer.js';
import { CEFR_LEVELS } from '../../utils/cefr.js';
import Button from '../../components/ui/Button.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Alert from '../../components/ui/Alert.jsx';

const SAMPLE_LINE =
  'I want to + V | Tôi muốn... | Dùng để nói về mong muốn | I want to learn English. ;; I want to go home. ;; I want to play football. | A1 | Daily Life';

const COLUMN_HEADERS = [
  { key: 'pattern', label: 'Cấu trúc', required: true },
  { key: 'meaning', label: 'Nghĩa', required: true },
  { key: 'explanation', label: 'Giải thích', required: false },
  { key: 'examples', label: `Ví dụ (phân cách "${EXAMPLES_DELIMITER}")`, required: false },
  { key: 'cefr', label: 'CEFR', required: false },
  { key: 'topic', label: 'Chủ đề', required: false },
];

/**
 * [ADMIN] Import Knowledge cho Sentence Structures.
 * Paste content (AI-generated bên ngoài) -> Parse -> Preview -> Import qua
 * RPC import_structures. Mirror flow của pages/Import (vocabulary).
 */
export default function StructureImport() {
  const { user, isAdmin } = useAuth();

  const [text, setText] = useState('');
  const [previewed, setPreviewed] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [parseInfo, setParseInfo] = useState(null); // { hadHeader, warnings }
  // Phân loại khi preview: tổng / lỗi / trùng trong batch / sẽ cập nhật (đã có trong DB).
  const [summary, setSummary] = useState(null);

  const [patternsLoading, setPatternsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  const handleParse = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!user || !isAdmin) {
      setError('Chỉ admin mới được import cấu trúc câu.');
      return;
    }

    const result = parseStructureText(text);
    const parsed = result.rows || [];
    const invalidCount = parsed.filter((r) => !isValidStructureRow(r)).length;

    setPatternsLoading(true);
    let existingPatterns = [];
    try {
      const { data, error: patternsError } = await getStructurePatterns();
      if (patternsError) throw patternsError;
      existingPatterns = data || [];
    } catch (e) {
      // Không chặn preview nếu không đọc được danh sách pattern — chỉ mất cảnh báo cập nhật.
      if (import.meta.env.DEV) {
        console.error('[StructureImport] load patterns error:', e);
      }
    } finally {
      setPatternsLoading(false);
    }

    // Dedupe trong batch + gắn cảnh báo "sẽ cập nhật" với pattern đã tồn tại.
    const { rows: deduped, duplicates } = dedupeStructureRows(parsed, existingPatterns);
    const valid = deduped.filter(isValidStructureRow);
    const willUpdate = valid.filter((r) =>
      r._warnings.some((w) => w.includes('CẬP NHẬT'))
    ).length;

    setParseInfo({ hadHeader: result.hadHeader, warnings: result.warnings });
    setPreviewRows(valid);
    setSummary({
      found: parsed.length,
      invalid: invalidCount,
      dupBatch: duplicates.length,
      willUpdate,
      valid: valid.length,
    });
    setPreviewed(true);
  }, [text, user, isAdmin]);

  const updateCell = (index, key, value) => {
    setPreviewRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  // Ô examples hiển thị dạng text nối bằng ";;"; khi sửa thì tách ngược thành mảng.
  const updateExamplesCell = (index, value) => {
    const examples = String(value || '')
      .split(EXAMPLES_DELIMITER)
      .map((s) => s.trim())
      .filter(Boolean);
    setPreviewRows((rows) => rows.map((r, i) => (i === index ? { ...r, examples } : r)));
  };

  const removeRow = (index) => {
    setPreviewRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setError('');
    setSuccess('');
    const validRows = previewRows.filter(isValidStructureRow);
    if (!user || !isAdmin) {
      setError('Chỉ admin mới được import cấu trúc câu.');
      return;
    }
    if (validRows.length === 0) {
      setError('Không có cấu trúc hợp lệ nào để nhập.');
      return;
    }

    setImporting(true);
    try {
      const payload = toStructureImportPayload(validRows);
      const { error: rpcError, meta } = await importStructures({ structures: payload });
      if (rpcError) throw rpcError;

      const created = meta?.created ?? 0;
      const updated = meta?.updated ?? 0;
      const errored = meta?.errored ?? 0;
      setSuccess(
        `Nhập thành công: ${created} cấu trúc mới, ${updated} cập nhật` +
          (errored > 0 ? `, ${errored} dòng lỗi bị bỏ qua.` : '.')
      );
      setPreviewRows([]);
      setSummary(null);
      setPreviewed(false);
      setText('');
    } catch (e) {
      setError('Không thể nhập cấu trúc. Vui lòng thử lại.');
      if (import.meta.env.DEV) {
        console.error('[StructureImport] import error:', e);
      }
    } finally {
      setImporting(false);
    }
  };

  const validCount = previewRows.filter(isValidStructureRow).length;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert type="error" message="Trang này chỉ dành cho admin." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-text-primary">Nhập cấu trúc câu (Knowledge)</h1>
      <p className="mb-4 text-sm text-text-secondary">
        Dán nội dung theo format <strong>Structure | Meaning | Explanation | Examples | CEFR | Topic</strong>
        {' '}(mỗi dòng một cấu trúc, nhiều ví dụ phân cách bằng <code>{EXAMPLES_DELIMITER}</code>). Ví dụ:
      </p>
      <pre className="mb-4 overflow-x-auto rounded-lg bg-surface-sidebar p-3 text-xs text-text-secondary">{SAMPLE_LINE}</pre>

      {error && <Alert type="error" message={error} className="mb-4" />}
      {success && <Alert type="success" message={success} className="mb-4" />}

      {/* Bước 1: paste + parse */}
      <div className="rounded-xl border border-border-color bg-surface p-5 shadow-sm">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={`${SAMPLE_LINE}\nThere is / There are | Có... | Dùng để nói về sự tồn tại | There is a book on the table. ;; There are two chairs. | A1 | Home`}
          className="w-full font-mono text-sm"
        />
        <div className="mt-3">
          <Button onClick={handleParse} loading={patternsLoading} disabled={!text.trim()}>
            Kiểm tra &amp; xem trước
          </Button>
        </div>
      </div>

      {/* Bước 2: preview */}
      {previewed && (
        <div className="mt-6 rounded-xl border border-border-color bg-surface p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">
            Xem trước ({summary?.valid ?? 0} dòng hợp lệ)
          </h2>

          {parseInfo?.hadHeader && (
            <Alert type="info" message="Đã nhận diện và bỏ qua dòng header." className="mb-3" />
          )}
          {(parseInfo?.warnings || []).length > 0 && (
            <Alert
              type="warning"
              message={`Cảnh báo phân tích:\n- ${parseInfo.warnings.join('\n- ')}`}
              className="mb-3 whitespace-pre-line text-left"
            />
          )}

          {summary && (
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <span className="status-pill status-pill--review"><strong>{summary.found}</strong> tổng</span>
              <span className="status-pill status-pill--new"><strong>{summary.valid}</strong> hợp lệ</span>
              {summary.invalid > 0 && (
                <span className="status-pill status-pill--again"><strong>{summary.invalid}</strong> lỗi</span>
              )}
              {summary.dupBatch > 0 && (
                <span className="status-pill status-pill--review"><strong>{summary.dupBatch}</strong> trùng trong nội dung (bỏ)</span>
              )}
              {summary.willUpdate > 0 && (
                <span className="status-pill status-pill--review"><strong>{summary.willUpdate}</strong> sẽ cập nhật</span>
              )}
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-color text-left text-xs uppercase tracking-wide text-text-secondary">
                    <th className="px-2 py-2">#</th>
                    {COLUMN_HEADERS.map((c) => (
                      <th key={c.key} className="px-2 py-2">
                        {c.label}
                        {c.required && '*'}
                      </th>
                    ))}
                    <th className="px-2 py-2">Ghi chú</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>

                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border-color/60 align-top">
                      <td className="px-2 py-2 text-text-secondary">{idx + 1}</td>
                      {COLUMN_HEADERS.map((c) => (
                        <td key={c.key} className="px-2 py-2">
                          {c.key === 'examples' ? (
                            <input
                              value={(row.examples || []).join(` ${EXAMPLES_DELIMITER} `)}
                              onChange={(e) => updateExamplesCell(idx, e.target.value)}
                              className="w-full min-w-[220px] rounded border border-zinc-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
                              placeholder={`Câu 1 ${EXAMPLES_DELIMITER} Câu 2`}
                            />
                          ) : c.key === 'cefr' ? (
                            <input
                              list="structure-cefr-options"
                              value={row.cefr || ''}
                              onChange={(e) => updateCell(idx, 'cefr', e.target.value.toUpperCase())}
                              className="w-full rounded border border-zinc-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
                              placeholder="A1"
                            />
                          ) : (
                            <input
                              value={row[c.key] || ''}
                              onChange={(e) => updateCell(idx, c.key, e.target.value)}
                              className={`w-full rounded border px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none ${
                                c.required && !(row[c.key] || '').trim()
                                  ? 'border-red-300 bg-red-50'
                                  : 'border-zinc-200'
                              }`}
                              placeholder={c.key === 'pattern' ? 'I want to + V' : ''}
                            />
                          )}
                        </td>
                      ))}
                      <td className="max-w-[220px] px-2 py-2 text-xs">
                        {(row._errors || []).length > 0 ? (
                          <span className="text-red-600">❌ {row._errors.join(' ')}</span>
                        ) : (row._warnings || []).length > 0 ? (
                          <span className="text-amber-600">⚠️ {row._warnings.join(' ')}</span>
                        ) : (
                          <span className="text-green-600">✔ Hợp lệ</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeRow(idx)}
                          className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          title="Xóa dòng"
                          aria-label={`Xóa dòng ${idx + 1}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          )}

          <datalist id="structure-cefr-options">
            {CEFR_LEVELS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {previewRows.length > 0 && (
            <div className="mt-4">
              <Button onClick={handleImport} loading={importing} disabled={importing || validCount === 0}>
                {importing ? 'Đang nhập...' : `Nhập ${validCount} cấu trúc`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}