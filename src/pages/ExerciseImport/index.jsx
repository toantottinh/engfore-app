import React, { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useStructures } from '../../hooks/useStructures.js';
import { importStructureExercises } from '../../services/structure.service.js';
import {
  parseExerciseText,
  isValidExerciseRow,
  validateExerciseRow,
  resolveExerciseStructures,
  dedupeExerciseRows,
  toExerciseImportPayload,
  VALID_EXERCISE_TYPES,
} from '../../utils/exercise-importer.js';
import { EXAMPLES_DELIMITER } from '../../utils/structure-importer.js';
import { getAcceptedAnswers } from '../../utils/structure-exercise-checker.js';
import Button from '../../components/ui/Button.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { EXERCISE_AI_PROMPT, copyTextToClipboard } from '../../utils/exercise-ai-prompt.js';

// Format 6 cột canonical (MỚI): Type | Structure | Question | Answer | Options | Explanation.
// Mỗi dòng tự khai báo Structure của nó -> BULK nhập nhiều Structure trong 1 paste.
const SAMPLE_LINES = [
  'multiple_choice | I want to + V | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want learning English. ;; I want to learn English. | Sau want to dùng V nguyên mẫu.',
  'fill_blank | I need to + V | I need to ___ English. | learn | learn ;; learning ;; learned | Sau need to dùng to + V.',
  'translation | I have to + V | Tôi phải đi làm hôm nay. | I have to go to work today. | | Dùng have to để nói nghĩa vụ.',
  'multiple_choice | I like + V-ing | Which sentence is correct? | I like playing football. | I like play football. ;; I like to playing football. ;; I like playing football. | Sau like có thể dùng V-ing.',
].join('\n');

// Preview hiển thị rõ từng cột: Type | Structure | Question | Answer | Status.
// (KHÔNG hiển thị UUID cho admin.)
const COLUMN_HEADERS = [
  { key: 'type', label: 'Type', required: true },
  { key: 'structure', label: 'Structure', required: true },
  { key: 'question', label: 'Câu hỏi', required: true },
  { key: 'answer', label: 'Đáp án', required: false },
  { key: 'options', label: `Options ("${EXAMPLES_DELIMITER}")`, required: false },
  { key: 'explanation', label: 'Giải thích', required: false },
];

// Ô Đáp án: giữ nguyên raw value (có thể chứa "||" cho NHIỀU accepted answers)
// và khi có >1 đáp án thì hiển thị hint rõ ràng bên dưới input — không cắt bớt,
// không làm vỡ các column phía sau.
function AnswerCell({ value, onChange }) {
  const accepted = getAcceptedAnswers(value);
  return (
    <div className="flex flex-col gap-1">
      <input
        value={value || ''}
        onChange={onChange}
        className="w-full min-w-[160px] rounded border border-zinc-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
        placeholder="Đáp án (nhiều đáp án phân cách bằng ||)"
      />
      {accepted.length > 1 && (
        <span className="text-[10px] font-medium text-indigo-600">
          ↳ {accepted.length} đáp án được chấp nhận: {accepted.join(' / ')}
        </span>
      )}
    </div>
  );
}

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

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  // ---- "Lệnh bài tập" ----
  // Modal hiển thị prompt chuẩn cho AI sinh Exercise. Thuần UI/clipboard:
  // KHÔNG gọi API/Supabase khi chỉ mở hoặc copy; KHÔNG đổi dữ liệu exercise.
  const [promptOpen, setPromptOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const openPromptModal = () => {
    setCopied(false);
    setCopyError('');
    setPromptOpen(true);
  };

  const handleCopyPrompt = async () => {
    setCopied(false);
    setCopyError('');
    const ok = await copyTextToClipboard(EXERCISE_AI_PROMPT);
    if (ok) {
      // Báo thành công rõ ràng sau khi copy.
      setCopied(true);
    } else {
      setCopyError(
        'Không thể sao chép tự động. Hãy bôi đen văn bản trong khung prompt và copy thủ công.'
      );
    }
  };

  const handleParse = useCallback(async () => {
    setError('');
    setSuccess('');

    if (!user || !isAdmin) {
      setError('Chỉ admin mới được import bài tập.');
      return;
    }
    if (!text.trim()) {
      setError('Hãy dán nội dung bài tập trước.');
      return;
    }

    const result = parseExerciseText(text, {
      // Tuỳ chọn: chỉ cần cho format 5 cột (legacy). Format 6 cột (canonical)
      // tự khai báo Structure ngay trên dòng nên KHÔNG bắt buộc phải chọn dropdown.
      selectedPattern: selectedStructure ? selectedStructure.pattern : '',
    });
    const parsed = result.rows || [];

    // Resolve Structure (pattern text) -> structure_id theo đúng USER HIỆN TẠI.
    // `structures` từ useStructures() đã được getStructuresForUser(user.id) scope
    // lại đúng user (RLS owner-only) — không bao giờ resolve chéo user khác.
    resolveExerciseStructures(parsed, structures);

    const invalidCount = parsed.filter((r) => !isValidExerciseRow(r)).length;

    // Dedupe TRONG batch theo business rule: structure + type + question (giữ dòng đầu).
    // KHÔNG dedupe theo type đơn lẻ — nhiều exercise cùng structure & type hợp lệ.
    const { rows: deduped, duplicates } = dedupeExerciseRows(parsed);
    const valid = deduped.filter(isValidExerciseRow);

    const typeCounts = {};
    for (const r of valid) {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    }

    setParseInfo({ hadHeader: result.hadHeader, warnings: result.warnings });
    setPreviewRows(deduped); // giữ cả row lỗi để admin thấy và sửa/xóa
    setSummary({
      total: parsed.length,
      invalid: invalidCount,
      dupBatch: duplicates.length,
      valid: valid.length,
      typeCounts,
    });
    setPreviewed(true);
  }, [text, user, isAdmin, selectedStructure, structures]);

  // Mọi edit đều REVALIDATE row ngay lập tức (yêu cầu CP3) + RE-RESOLVE
  // Structure (admin có thể sửa tay ô "structure"). resolveExerciseStructures
  // idempotent nên gọi lại nhiều lần không tích luỹ lỗi cũ.
  const updateCell = (index, key, value) => {
    setPreviewRows((rows) => {
      const next = rows.map((r, i) =>
        i === index ? validateExerciseRow({ ...r, [key]: value }) : r
      );
      return resolveExerciseStructures(next, structures);
    });
  };

  // Ô options hiển thị dạng text nối bằng ";;"; khi sửa thì tách ngược + revalidate.
  const updateOptionsCell = (index, value) => {
    const options = String(value || '')
      .split(EXAMPLES_DELIMITER)
      .map((s) => s.trim())
      .filter(Boolean);
    setPreviewRows((rows) => {
      const next = rows.map((r, i) =>
        i === index ? validateExerciseRow({ ...r, options }) : r
      );
      return resolveExerciseStructures(next, structures);
    });
  };

  const removeRow = (index) => {
    setPreviewRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setError('');
    setSuccess('');
    if (!user || !isAdmin) {
      setError('Chỉ admin mới được import bài tập.');
      return;
    }
    if (previewRows.length === 0) {
      setError('Không có bài tập nào để nhập.');
      return;
    }

    const invalid = previewRows.filter((r) => !isValidExerciseRow(r));
    if (invalid.length > 0) {
      // KHÔNG SILENT FAILURE: chặn import ngay, liệt kê đúng dòng + nguyên nhân.
      const lines = invalid.map((r) => {
        const num = r._line ?? previewRows.indexOf(r) + 1;
        const msgs = (r._errors || []).map((m) =>
          m.startsWith(`Dòng ${num}:`) ? m : `Dòng ${num}: ${m}`
        );
        return `- ${msgs.join('; ')}`;
      });
      setError(
        `Không thể nhập: còn ${invalid.length} dòng lỗi. Hãy sửa hoặc xóa các dòng này trước khi import.\n${lines.join('\n')}`
      );
      return;
    }

    setImporting(true);
    try {
      // Tất cả rows đều hợp lệ -> gửi TẤT CẢ tới RPC. Mỗi row mang pattern của
      // structure mà NÓ khai báo; RPC resolve pattern -> structure_id (admin-only).
      const payload = toExerciseImportPayload(previewRows);
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
  // Số dòng đang lỗi trong preview — khác 0 thì CHẶN Import (no silent failure).
  const invalidPreviewCount = previewRows.length - validCount;
  const errorRows = previewRows.filter((r) => !isValidExerciseRow(r));
  const errorLines = errorRows.map((r) => {
    const num = r._line ?? previewRows.indexOf(r) + 1;
    const msgs = (r._errors || []).map((m) =>
      m.startsWith(`Dòng ${num}:`) ? m : `Dòng ${num}: ${m}`
    );
    return `- ${msgs.join('; ')}`;
  });

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert type="error" message="Trang này chỉ dành cho admin." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text-primary">Nhập bài tập (Exercises)</h1>
        {/* DUY NHẤT MỘT nút prompt — mở modal hiển thị + copy "Lệnh bài tập". */}
        <Button variant="secondary" onClick={openPromptModal}>
          Lệnh bài tập
        </Button>
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        Dán một lần theo format{' '}
        <strong>Type | Structure | Question | Answer | Options | Explanation</strong> — mỗi dòng tự
        khai báo <strong>Structure</strong> của nó nên có thể nhập <strong>nhiều cấu trúc trong
        cùng một batch</strong>. Options phân cách bằng <code>{EXAMPLES_DELIMITER}</code>, nhiều đáp án
        trong Answer phân cách bằng <code>||</code>. Type hợp lệ: {VALID_EXERCISE_TYPES.join(', ')}. Ví dụ:
      </p>
      <pre className="mb-4 overflow-x-auto rounded-lg bg-surface-sidebar p-3 text-xs text-text-secondary">{SAMPLE_LINES}</pre>

      {error && <Alert type="error" message={error} className="mb-4" />}
      {success && <Alert type="success" message={success} className="mb-4" />}

      {/* Bước 0 (TÙY CHỌN): chọn Structure đích — CHỈ cần cho format 5 cột legacy
          (Type | Question | ...). Format 6 cột canonical tự khai báo Structure nên
          KHÔNG bắt buộc dropdown cho diagram bulk. Không chọn thì 5 cột sẽ báo lỗi rõ. */}
      <div className="mb-4 rounded-xl border border-border-color bg-surface p-4 shadow-sm">
        <label
          htmlFor="exercise-selected-structure"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-text-secondary"
        >
          Cấu trúc kiến thức{' '}
          <span className="normal-case text-text-secondary">(tuỳ chọn — chỉ dùng cho format 5 cột cũ)</span>
        </label>
        <select
          id="exercise-selected-structure"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          aria-label="Cấu trúc kiến thức"
          className="w-full max-w-xl rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— Không chọn (mỗi dòng tự khai báo Structure) —</option>
          {structures.map((s) => (
            <option key={s.id} value={s.id}>
              {`${s.pattern} — ${s.meaning}${s.cefr ? ` (${s.cefr})` : ''}`}
            </option>
          ))}
        </select>

        {!selectedStructure ? (
          <p className="mt-2 text-xs text-text-secondary">
            Đang ở chế độ <strong>multi-structure</strong>: mỗi dòng phải có cột Structure (format 6 cột).
            Nếu muốn dùng format 5 cột cũ, hãy chọn một Cấu trúc ở trên.
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
          <Button onClick={handleParse} disabled={!text.trim()}>
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
              <span className="status-pill status-pill--review"><strong>{summary.total}</strong> Tổng</span>
              <span className="status-pill status-pill--new"><strong>{summary.valid}</strong> Hợp lệ</span>
              <span className="status-pill status-pill--again"><strong>{summary.invalid}</strong> Lỗi</span>
              {summary.dupBatch > 0 && (
                <span className="status-pill status-pill--review"><strong>{summary.dupBatch}</strong> Trùng (bỏ)</span>
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

          {invalidPreviewCount > 0 && errorLines.length > 0 && (
            <Alert
              type="error"
              message={`Không thể import khi còn ${invalidPreviewCount} dòng lỗi. Chi tiết theo dòng:\n${errorLines.join('\n')}`}
              className="mb-4 whitespace-pre-line text-left"
            />
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
                    <th className="px-2 py-2">Status</th>
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
                          ) : c.key === 'structure' ? (
                            <div className="flex flex-col gap-1">
                              <input
                                value={row[c.key] || ''}
                                onChange={(e) => updateCell(idx, c.key, e.target.value)}
                                className={`w-full min-w-[180px] rounded border px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none ${
                                  row.structure && !row._structureId
                                    ? 'border-red-300 bg-red-50'
                                    : 'border-zinc-200'
                                }`}
                                placeholder="I want to + V"
                              />
                              {row.structure && !row._structureId ? (
                                <span className="text-[10px] font-semibold text-red-600">UNKNOWN</span>
                              ) : row._structureId ? (
                                <span className="text-[10px] font-semibold text-green-600">
                                  {row._structureResolved?.pattern || row.structure}
                                </span>
                              ) : null}
                            </div>
                          ) : c.key === 'answer' ? (
                            <AnswerCell
                              value={row.answer}
                              onChange={(e) => updateCell(idx, 'answer', e.target.value)}
                            />
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
                            />
                          )}
                        </td>
                      ))}
                      <td className="max-w-[260px] px-2 py-2 text-xs">
                        {isValidExerciseRow(row) ? (
                          <span className="text-green-600">✅</span>
                        ) : (
                          <span className="text-red-600">❌ {row._errors.join(' ')}</span>
                        )}
                        {(row._warnings || []).length > 0 && (
                          <span className="mt-0.5 block text-amber-600">⚠️ {row._warnings.join(' ')}</span>
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
                disabled={importing || validCount === 0 || invalidPreviewCount > 0}
                title={
                  invalidPreviewCount > 0
                    ? `Còn ${invalidPreviewCount} dòng lỗi — import chỉ khả dụng khi toàn bộ batch hợp lệ.`
                    : undefined
                }
              >
                {importing
                  ? 'Đang nhập...'
                  : invalidPreviewCount > 0
                  ? 'Sửa lỗi trước khi import'
                  : `Nhập ${validCount} bài tập`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* "Lệnh bài tập": hiển thị prompt chuẩn cho AI sinh Exercise.
          Read-only + clipboard — KHÔNG đụng dữ liệu exercise, KHÔNG gọi API. */}
      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Lệnh bài tập"
        size="lg"
        footer={
          <>
            {copied && (
              <span className="mr-auto text-xs font-medium text-green-600" role="status">
                ✓ Đã sao chép prompt vào clipboard.
              </span>
            )}
            {copyError && (
              <span className="mr-auto text-xs font-medium text-red-600" role="alert">
                {copyError}
              </span>
            )}
            <Button variant="secondary" onClick={() => setPromptOpen(false)}>
              Đóng
            </Button>
            <Button onClick={handleCopyPrompt}>Sao chép</Button>
          </>
        }
      >
        <p className="mb-3 text-xs text-text-secondary">
          Copy toàn bộ nội dung bên dưới và dán cho AI (ChatGPT, Gemini, Claude...) để sinh bài
          tập đúng chuẩn import của EngFore. Kết quả do AI trả về dán trực tiếp vào ô nhập phía
          trên rồi bấm &quot;Xem trước&quot;.
        </p>
        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-sidebar p-3 text-left text-xs leading-relaxed text-text-primary">
          {EXERCISE_AI_PROMPT}
        </pre>
      </Modal>
    </div>
  );
}