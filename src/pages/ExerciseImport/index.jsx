import React, { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useStructures } from '../../hooks/useStructures.js';
import {
  importStructureExercises,
  getStructurePatterns,
} from '../../services/structure.service.js';
import {
  parseExerciseText,
  isValidExerciseRow,
  validateExerciseRow,
  dedupeExerciseRows,
  markMissingStructures,
  toExerciseImportPayload,
  VALID_EXERCISE_TYPES,
} from '../../utils/exercise-importer.js';
import { EXAMPLES_DELIMITER } from '../../utils/structure-importer.js';
import Button from '../../components/ui/Button.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Alert from '../../components/ui/Alert.jsx';

const SAMPLE_LINES = [
  'multiple_choice | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want learning English. ;; I want to learn English. | Sau want to dùng động từ nguyên mẫu.',
  'fill_blank | I want to ___ English. | learn | learn ;; learning ;; learned | Sau want to dùng động từ nguyên mẫu.',
].join('\n');

// Preview KHÔNG có cột structure — structure là selection ở dropdown phía trên,
// mọi row được gắn vào ĐÚNG knowledge đã chọn (structure_exercises.structure_id).
const COLUMN_HEADERS = [
  { key: 'type', label: 'Type', required: true },
  { key: 'question', label: 'Câu hỏi', required: true },
  { key: 'answer', label: 'Đáp án', required: false },
  { key: 'options', label: `Options ("${EXAMPLES_DELIMITER}")`, required: false },
  { key: 'explanation', label: 'Giải thích', required: false },
];

/**
 * [ADMIN] Import Exercises cho Sentence Structures.
 * Paste content -> Parse -> Validate theo type -> Preview -> Import qua
 * RPC import_structure_exercises (append-only). Mirror flow StructureImport.
 */
export default function ExerciseImport() {
  const { user, isAdmin } = useAuth();
  // Danh sách Structure/Knowledge cho dropdown (tái sử dụng hook Library).
  const { structures, load: reloadStructures } = useStructures();

  const [selectedId, setSelectedId] = useState('');
  const selectedStructure = useMemo(
    () => structures.find((s) => s.id === selectedId) || null,
    [structures, selectedId]
  );

  const [text, setText] = useState('');
  const [previewed, setPreviewed] = useState(false);
  const [previewRows, setPreviewRows] = useState([]);
  const [parseInfo, setParseInfo] = useState(null); // { hadHeader, warnings }
  // { found, invalid, dupBatch, missingStructure, valid } + typeCounts
  const [summary, setSummary] = useState(null);

  const [patternsLoading, setPatternsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  const handleParse = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!user || !isAdmin) {
      setError('Chỉ admin mới được import bài tập.');
      return;
    }
    if (!selectedStructure) {
      setError('Hãy chọn một "Cấu trúc kiến thức" ở dropdown trước khi nhập bài tập.');
      return;
    }

    const result = parseExerciseText(text, {
      selectedPattern: selectedStructure.pattern,
    });
    const parsed = result.rows || [];

    // Structure existence: exercise phải tham chiếu structure ĐÃ import.
    // Không tự tạo structure tại đây (Knowledge phải đi trước).
    setPatternsLoading(true);
    let existingPatterns = [];
    try {
      const { data, error: patternsError } = await getStructurePatterns();
      if (patternsError) throw patternsError;
      existingPatterns = data || [];
    } catch (e) {
      // Không chặn preview nếu không đọc được patterns; thiếu check này chỉ mất
      // cảnh báo sớm — RPC vẫn chốt chặn ở bước import.
      if (import.meta.env.DEV) {
        console.error('[ExerciseImport] load patterns error:', e);
      }
    } finally {
      setPatternsLoading(false);
    }

    markMissingStructures(parsed, existingPatterns);
    const invalidCount = parsed.filter((r) => !isValidExerciseRow(r)).length;
    const missingCount = parsed.filter((r) =>
      (r._errors || []).some((m) => m.includes('chưa tồn tại'))
    ).length;
    // Row legacy trỏ sang structure KHÁC selection -> bị chặn.
    const mismatchCount = parsed.filter((r) =>
      (r._errors || []).some((m) => m.includes('không khớp cấu trúc đã chọn'))
    ).length;

    // Dedupe trong batch: structure + type + question (giữ dòng đầu).
    const { rows: deduped, duplicates } = dedupeExerciseRows(parsed);
    const valid = deduped.filter(isValidExerciseRow);

    const typeCounts = {};
    for (const r of valid) {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    }

    setParseInfo({ hadHeader: result.hadHeader, warnings: result.warnings });
    setPreviewRows(deduped); // giữ cả row lỗi để admin thấy và sửa/xóa
    setSummary({
      found: parsed.length,
      invalid: invalidCount,
      dupBatch: duplicates.length,
      missingStructure: missingCount,
      mismatch: mismatchCount,
      valid: valid.length,
      typeCounts,
    });
    setPreviewed(true);
  }, [text, user, isAdmin, selectedStructure]);

  // Mọi edit đều REVALIDATE row ngay lập tức (yêu cầu CP3).
  const updateCell = (index, key, value) => {
    setPreviewRows((rows) =>
      rows.map((r, i) => (i === index ? validateExerciseRow({ ...r, [key]: value }) : r))
    );
  };

  // Ô options hiển thị dạng text nối bằng ";;"; khi sửa thì tách ngược + revalidate.
  const updateOptionsCell = (index, value) => {
    const options = String(value || '')
      .split(EXAMPLES_DELIMITER)
      .map((s) => s.trim())
      .filter(Boolean);
    setPreviewRows((rows) =>
      rows.map((r, i) => (i === index ? validateExerciseRow({ ...r, options }) : r))
    );
  };

  const removeRow = (index) => {
    setPreviewRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setError('');
    setSuccess('');
    const validRows = previewRows.filter(isValidExerciseRow);
    if (!user || !isAdmin) {
      setError('Chỉ admin mới được import bài tập.');
      return;
    }
    if (!selectedStructure) {
      setError('Hãy chọn một "Cấu trúc kiến thức" trước khi nhập.');
      return;
    }
    if (validRows.length === 0) {
      setError('Không có bài tập hợp lệ nào để nhập.');
      return;
    }

    setImporting(true);
    try {
      // Invalid rows KHÔNG được gửi RPC — payload chỉ chứa row hợp lệ.
      // Mọi row đều mang pattern của structure ĐÃ CHỌN -> RPC resolve về
      // đúng MỘT structure_id (không bao giờ gán sai knowledge).
      const payload = toExerciseImportPayload(validRows);
      const { error: rpcError, meta } = await importStructureExercises({ exercises: payload });
      if (rpcError) throw rpcError;

      setSuccess(`Nhập thành công — Created: ${meta?.created ?? 0} · Errored: ${meta?.errored ?? 0}`);
      setPreviewRows([]);
      setSummary(null);
      setPreviewed(false);
      setText('');
      // Làm mới dữ liệu structures (exercise_count trên Library/Detail sẽ cập nhật).
      reloadStructures();
    } catch (e) {
      setError('Không thể nhập bài tập. Vui lòng thử lại.');
      if (import.meta.env.DEV) {
        console.error('[ExerciseImport] import error:', e);
      }
    } finally {
      setImporting(false);
    }
  };

  const validCount = previewRows.filter(isValidExerciseRow).length;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert type="error" message="Trang này chỉ dành cho admin." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-text-primary">Nhập bài tập (Exercises)</h1>
      <p className="mb-4 text-sm text-text-secondary">
        Chọn <strong>Cấu trúc kiến thức</strong> ở dưới rồi dán bài tập theo format{' '}
        <strong>Type | Question | Answer | Options | Explanation</strong> — Options phân cách bằng{' '}
        <code>{EXAMPLES_DELIMITER}</code>. Type hợp lệ: {VALID_EXERCISE_TYPES.join(', ')}. Ví dụ:
      </p>
      <pre className="mb-4 overflow-x-auto rounded-lg bg-surface-sidebar p-3 text-xs text-text-secondary">{SAMPLE_LINES}</pre>

      {error && <Alert type="error" message={error} className="mb-4" />}
      {success && <Alert type="success" message={success} className="mb-4" />}

      {/* Bước 0: chọn Structure/Knowledge đích — mọi exercise bên dưới sẽ
          được gắn vào ĐÚNG structure này (structure_exercises.structure_id). */}
      <div className="mb-4 rounded-xl border border-border-color bg-surface p-4 shadow-sm">
        <label
          htmlFor="exercise-selected-structure"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary"
        >
          Cấu trúc kiến thức
        </label>
        <select
          id="exercise-selected-structure"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Cấu trúc kiến thức"
          className="w-full max-w-xl rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— Chọn cấu trúc —</option>
          {structures.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.pattern} — ${s.meaning}${s.cefr ? ` (${s.cefr})` : ''}`}
            </option>
          ))}
        </select>

        {!selectedStructure ? (
          <p className="mt-2 text-xs text-text-secondary">
            Hãy chọn một cấu trúc: mọi bài tập bên dưới sẽ được gắn vào đúng knowledge này.
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-text-secondary">Đích:</span>
            <span className="rounded-full bg-surface-hover px-2 py-0.5 font-medium text-text-primary">
              {selectedStructure.pattern}
            </span>
            <span className="text-text-secondary">{selectedStructure.meaning}</span>
            {selectedStructure.cefr && (
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary">
                {selectedStructure.cefr}
              </span>
            )}
            {selectedStructure.topic && (
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary">
                {selectedStructure.topic}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bước 1: paste + parse */}
      <div className="rounded-xl border border-border-color bg-surface p-5 shadow-sm">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={SAMPLE_LINES}
          className="w-full font-mono text-sm"
        />
        <div className="mt-3">
          <Button
            onClick={handleParse}
            loading={patternsLoading}
            disabled={!text.trim() || !selectedStructure}
            title={!selectedStructure ? 'Hãy chọn Cấu trúc kiến thức trước.' : undefined}
          >
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

          {selectedStructure && (
            <div className="mb-3 rounded-lg bg-surface-sidebar px-3 py-2 text-sm">
              Cấu trúc:{' '}
              <span className="font-semibold text-text-primary">{selectedStructure.pattern}</span>
              {selectedStructure.meaning ? (
                <span className="text-text-secondary"> — {selectedStructure.meaning}</span>
              ) : null}
            </div>
          )}

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
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="status-pill status-pill--review"><strong>{summary.found}</strong> tổng</span>
              <span className="status-pill status-pill--new"><strong>{summary.valid}</strong> hợp lệ</span>
              {summary.invalid > 0 && (
                <span className="status-pill status-pill--again"><strong>{summary.invalid}</strong> lỗi</span>
              )}
              {summary.dupBatch > 0 && (
                <span className="status-pill status-pill--review"><strong>{summary.dupBatch}</strong> trùng trong nội dung (bỏ)</span>
              )}
              {summary.missingStructure > 0 && (
                <span className="status-pill status-pill--again"><strong>{summary.missingStructure}</strong> thiếu Structure</span>
              )}
              {summary.mismatch > 0 && (
                <span className="status-pill status-pill--again"><strong>{summary.mismatch}</strong> khác cấu trúc đã chọn</span>
              )}
              {Object.keys(summary.typeCounts || {}).length > 0 && (
                <span className="text-xs text-text-secondary">
                  {Object.entries(summary.typeCounts)
                    .map(([t, n]) => `${t}: ${n}`)
                    .join(' · ')}
                </span>
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
                          {c.key === 'type' ? (
                            <select
                              value={VALID_EXERCISE_TYPES.includes(row.type) ? row.type : ''}
                              onChange={(e) => updateCell(idx, 'type', e.target.value)}
                              className={`w-full rounded border px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none ${
                                VALID_EXERCISE_TYPES.includes(row.type)
                                  ? 'border-zinc-200'
                                  : 'border-red-300 bg-red-50'
                              }`}
                            >
                              <option value="">— chọn type —</option>
                              {VALID_EXERCISE_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          ) : c.key === 'options' ? (
                            <input
                              value={(row.options || []).join(` ${EXAMPLES_DELIMITER} `)}
                              onChange={(e) => updateOptionsCell(idx, e.target.value)}
                              className="w-full min-w-[200px] rounded border border-zinc-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
                              placeholder={`Lựa chọn 1 ${EXAMPLES_DELIMITER} Lựa chọn 2`}
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
                              placeholder={c.key === 'structure' ? 'I want to + V' : ''}
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

          {previewRows.length > 0 && (
            <div className="mt-4">
              <Button
                onClick={handleImport}
                loading={importing}
                disabled={importing || !selectedStructure || validCount === 0}
                title={!selectedStructure ? 'Hãy chọn Cấu trúc kiến thức trước.' : undefined}
              >
                {importing ? 'Đang nhập...' : `Nhập ${validCount} bài tập`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}