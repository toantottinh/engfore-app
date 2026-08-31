import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import {
  getVocabularySets,
  getUserVocabulary,
  importWords,
  adminImportWords,
  getAdminAllSets,
  getTopics,
} from '../../services/vocabulary.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import {
  parseVocabularyText,
  toImportPayload,
  dedupeRows,
} from '../../utils/vocabulary-importer.js';
import { VOCABULARY_AI_PROMPT, copyTextToClipboard } from '../../utils/vocabulary-ai-prompt.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Modal from '../../components/ui/Modal.jsx';

const COLUMN_HEADERS = [
  { key: 'word', label: 'Từ', required: true },
  { key: 'ipa', label: 'IPA', required: false },
  { key: 'word_type', label: 'Loại từ', required: false },
  { key: 'meaning', label: 'Nghĩa', required: false },
  { key: 'example', label: 'Ví dụ', required: false },
  { key: 'memory_clue', label: 'Memory Clue', required: false },
  { key: 'cefr', label: 'CEFR', required: false },
];

// Phải khớp chính xác set enum word_type của production DB để tránh lỗi 22P02.
// (Đã mở rộng thêm determiner, interjection, phrasal_verb, verb_phrase.)
const WORD_TYPE_OPTIONS = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'preposition',
  'conjunction',
  'pronoun',
  'determiner',
  'interjection',
  'phrasal_verb',
  'verb_phrase',
  'other',
];

const CEFR_OPTIONS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function wordTypeLabel(t) {
  const map = {
    noun: 'Danh từ',
    verb: 'Động từ',
    adjective: 'Tính từ',
    adverb: 'Trạng từ',
    preposition: 'Giới từ',
    conjunction: 'Liên từ',
    pronoun: 'Đại từ',
    determiner: 'Định từ',
    interjection: 'Thán từ',
    phrasal_verb: 'Cụm động từ',
    verb_phrase: 'Cụm động từ ngữ/Verb phrase',
    other: 'Khác',
  };
  return map[t] || t || '—';
}

export default function Import() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [text, setText] = useState('');
  const [sets, setSets] = useState([]);
  const [allSets, setAllSets] = useState([]); // For admin view
  const [topics, setTopics] = useState([]);
  const [setId, setSetId] = useState('');
  const [setsLoading, setSetsLoading] = useState(true);

  const [previewRows, setPreviewRows] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [parseInfo, setParseInfo] = useState(null);
  const [previewed, setPreviewed] = useState(false);

  const [loadSetsError, setLoadSetsError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  // ---- "Lệnh vocabulary" ----
  // Modal hiển thị prompt chuẩn cho AI xử lý từ vựng. Thuần UI/clipboard:
  // KHÔNG gọi API/Supabase khi chỉ mở hoặc copy; KHÔNG đổi dữ liệu vocabulary.
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
    const ok = await copyTextToClipboard(VOCABULARY_AI_PROMPT);
    if (ok) {
      // Báo thành công rõ ràng sau khi copy.
      setCopied(true);
    } else {
      setCopyError(
        'Không thể sao chép tự động. Hãy bôi đen văn bản trong khung prompt và copy thủ công.'
      );
    }
  };

  // Destination Word Set — TÙY CHỌN, không bắt buộc.
  const [destMode, setDestMode] = useState('vocab'); // 'vocab' | 'newSet' | 'existingSet'
  const [destSetId, setDestSetId] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [lastSetId, setLastSetId] = useState('');
  
  // Admin-specific state for creating public sets
  const [isPublicSet, setIsPublicSet] = useState(false);
  const [newSetTopicId, setNewSetTopicId] = useState('');
  const [newSetStatus, setNewSetStatus] = useState('draft');

  // Phân loại khi preview: từ trùng trong file / đã có trong Vocabulary / dòng lỗi.
  const [summary, setSummary] = useState(null); // { found, invalid, dupFile, inVocab }

  // Tải danh sách bộ từ của user và (nếu là admin) các bộ từ public + topics.
  useEffect(() => {
    let active = true;
    if (!user) {
      setSetsLoading(false);
      return;
    }

    setSetsLoading(true);
    setLoadSetsError('');

    const loadData = async () => {
      try {
        const { data: userSets, error: userSetsError } = await getVocabularySets(user.id);
        if (!active) return;
        if (userSetsError) throw userSetsError;
        
        setSets(userSets || []);

        if (isAdmin) {
          const [{ data: allSetsData, error: allSetsError }, { data: topicsData, error: topicsError }] = await Promise.all([
            getAdminAllSets(),
            getTopics(),
          ]);

          if (!active) return;
          if (allSetsError) throw allSetsError;
          if (topicsError) throw topicsError;
          
          setAllSets(allSetsData || []);
          setTopics(topicsData || []);
        }
      } catch (err) {
        if (active) {
          setLoadSetsError(getAuthErrorMessage(err));
        }
      } finally {
        if (active) {
          setSetsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [user, isAdmin]);

  const handleParse = useCallback(async () => {
    setError('');
    setSuccess('');
    setDuplicates([]);
    setSummary(null);

    const result = parseVocabularyText(text);
    const format = result.format;
    const parsed = result.rows || [];

    // Toàn bộ từ đã có trong Vocabulary của user (phân loại "đã có trong kho").
    let existing = new Set();
    if (user) {
      const voc = await getUserVocabulary(user.id);
      existing = new Set((voc.data || []).map((w) => (w.word || '').toLowerCase()));
    }

    // Phân loại: dòng lỗi / trùng trong file / đã có trong Vocabulary / hợp lệ (giữ).
    const seen = new Set();
    let invalid = 0;
    let dupFile = 0;
    let inVocab = 0;
    const valid = [];
    parsed.forEach((row) => {
      const w = (row.word || '').trim();
      if (!w || (format === 'pipe' && !(row.meaning || '').trim())) {
        invalid += 1;
        return;
      }
      const key = w.toLowerCase();
      if (seen.has(key)) {
        dupFile += 1;
        return;
      }
      seen.add(key);
      if (existing.has(key)) inVocab += 1;
      valid.push(row);
    });

    setParseInfo({ format, hadHeader: result.hadHeader, warnings: result.warnings });
    setPreviewRows(valid);
    setDuplicates([]);
    setSummary({ found: parsed.length, invalid, dupFile, inVocab, valid: valid.length });
    setPreviewed(true);
  }, [text, user]);

  const updateCell = (index, key, value) => {
    setPreviewRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  const removeRow = (index) => {
    setPreviewRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setError('');
    setSuccess('');
    const validRows = previewRows.filter((r) => (r.word || '').trim());
    if (validRows.length === 0) {
      setError('Không có từ hợp lệ nào để nhập.');
      return;
    }

    let setIdPayload = null;
    let newSetNamePayload = null;
    if (destMode === 'existingSet') {
      setIdPayload = destSetId;
    } else if (destMode === 'newSet') {
      newSetNamePayload = newSetName.trim();
    }
    
    if ((destMode === 'newSet' || destMode === 'existingSet') && !setIdPayload && !newSetNamePayload) {
      setError('Vui lòng chọn Word Set hoặc nhập tên Word Set mới.');
      return;
    }
    if (importing) return;

    setImporting(true);
    const payload = toImportPayload(validRows);

    const useAdminFlow = isAdmin && (destMode === 'newSet' || (destMode === 'existingSet' && allSets.find(s => s.id === destSetId && !s.user_id)));

    const { meta, error: err } = useAdminFlow
      ? await adminImportWords({
          words: payload,
          setId: setIdPayload,
          newSetName: newSetNamePayload,
          newSetTopicId: newSetNamePayload ? newSetTopicId : null,
          newSetStatus: newSetNamePayload ? newSetStatus : 'draft',
        })
      : await importWords({
          words: payload,
          setId: setIdPayload,
          newSetName: newSetNamePayload,
        });

    setImporting(false);

    if (err) {
      if (import.meta.env.DEV) {
        const errInfo = {
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code,
        };
        console.error('[Import] Error:', JSON.stringify(errInfo, null, 2));
      }
      setError(getAuthErrorMessage(err));
      return;
    }

    const created = meta?.created ?? 0;
    const existing = meta?.existing ?? 0;
    setSuccess(
      `Đã nhập thành công: ${created} từ mới, ${existing} từ đã có (gộp vào kho).${
        destMode !== 'vocab' ? ' Đã thêm vào Word Set.' : ' Đã thêm vào Vocabulary.'
      }`
    );
    setLastSetId(meta?.set_id ?? (destMode === 'existingSet' ? destSetId : ''));
    setPreviewRows([]);
    setPreviewed(false);
    setDuplicates([]);
    setParseInfo(null);
    setSummary(null);
    setText('');
  };

  const goToSet = () => {
    if (lastSetId) navigate(`/vocabulary/${lastSetId}`);
    else navigate('/vocabulary');
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <Link
          to="/vocabulary"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Từ vựng
        </Link>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-zinc-900">Nhập từ vựng</h1>
          {/* DUY NHẤT MỘT nút prompt — mở modal hiển thị + copy "Lệnh vocabulary". */}
          <Button variant="secondary" onClick={openPromptModal}>
            Lệnh vocabulary
          </Button>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Dán danh sách từ (mỗi dòng một từ) hoặc format pipe 7 cột vào ô bên dưới, xem trước, chỉnh
          sửa nếu cần rồi nhập vào bộ từ.
        </p>
      </div>

      {loadSetsError && <Alert type="error" message={loadSetsError} className="mb-4" />}
      {error && <Alert type="error" message={error} className="mb-4" />}
      {success && <Alert type="success" message={success} className="mb-4" />}

      {/* Bước 1: Đích nhập (Word Set — TÙY CHỌN, không bắt buộc) */}
      <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="text-sm font-medium text-zinc-700">Thêm vào đâu?</div>
        <p className="mt-1 mb-3 text-xs text-zinc-500">
          Bạn có thể chỉ thêm vào Vocabulary (toàn bộ kho từ), chọn sẵn Word Set, hoặc tạo Word Set
          mới — việc chọn Word Set là tùy chọn.
        </p>
        <div className="space-y-2">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="dest"
              checked={destMode === 'vocab'}
              onChange={() => setDestMode('vocab')}
              className="mt-1"
            />
            <span className="text-sm text-zinc-700">Chỉ thêm vào Vocabulary</span>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="dest"
              checked={destMode === 'newSet'}
              onChange={() => setDestMode('newSet')}
              className="mt-1"
            />
            <span className="text-sm text-zinc-700">Tạo Word Set mới</span>
          </label>
          {destMode === 'newSet' && (
            <div className="ml-6 mt-1 space-y-3">
              <Input
                value={newSetName}
                onChange={(e) => setNewSetName(e.target.value)}
                placeholder="Tên Word Set mới, ví dụ: Travel"
                className="w-full sm:w-80"
              />
              {isAdmin && (
                <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-3">
                  <div className="text-sm font-medium text-sky-800">Admin: Public Set Options</div>
                   <label className="flex items-center gap-2">
                      <span className="w-20 text-xs text-zinc-600">Topic:</span>
                      <select
                        value={newSetTopicId}
                        onChange={(e) => setNewSetTopicId(e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-64"
                      >
                        <option value="">-- No topic --</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.cefr_level})
                          </option>
                        ))}
                      </select>
                   </label>
                   <label className="flex items-center gap-2">
                      <span className="w-20 text-xs text-zinc-600">Status:</span>
                       <div className="flex gap-4">
                         <label className="flex items-center gap-1">
                           <input type="radio" name="status" value="draft" checked={newSetStatus === 'draft'} onChange={(e) => setNewSetStatus(e.target.value)} />
                           <span className="text-sm">Draft</span>
                         </label>
                         <label className="flex items-center gap-1">
                           <input type="radio" name="status" value="published" checked={newSetStatus === 'published'} onChange={(e) => setNewSetStatus(e.target.value)} />
                           <span className="text-sm">Published</span>
                         </label>
                       </div>
                   </label>
                </div>
              )}
            </div>
          )}

          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="dest"
              checked={destMode === 'existingSet'}
              onChange={() => setDestMode('existingSet')}
              className="mt-1"
            />
            <span className="text-sm text-zinc-700">Thêm vào Word Set có sẵn</span>
          </label>
          {destMode === 'existingSet' &&
            (setsLoading ? (
              <div className="ml-6 mt-1">
                <Spinner />
              </div>
            ) : sets.length === 0 ? (
              <Alert
                type="info"
                className="ml-6 mt-1"
                message="Bạn chưa có Word Set nào. Chọn 'Tạo Word Set mới' hoặc 'Chỉ thêm vào Vocabulary'."
              />
            ) : (
              <select
                value={destSetId}
                onChange={(e) => setDestSetId(e.target.value)}
                className="ml-6 mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:w-80"
              >
                <option value="">-- Chọn Word Set --</option>
                {isAdmin ? (
                  <>
                    <optgroup label="Public Sets">
                      {allSets.filter(s => !s.user_id).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.word_count ?? 0} từ)
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="My Sets">
                      {allSets.filter(s => s.user_id === user.id).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.word_count ?? 0} từ)
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  sets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.word_count ?? 0} từ)
                    </option>
                  ))
                )}
              </select>
            ))}
        </div>
      </div>

      {/* Bước 2: Dán nội dung */}
      <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-5">
        <label htmlFor="import-text" className="text-sm font-medium text-zinc-700">
          Dán nội dung từ vựng
        </label>
        <p className="mt-1 mb-2 text-xs text-zinc-500">
          Hỗ trợ: danh sách từ đơn (apple, lion, fan...) hoặc format pipe:{' '}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">
            Word | IPA | Type | Meaning | Example | Memory Clue | CEFR
          </code>
        </p>
        <Textarea
          id="import-text"
          name="import-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Paste nội dung vào đây...\n\nVí dụ danh sách từ:\napple\nlion\nfan\n\nHoặc format pipe:\napple | /ˈæp.əl/ | noun | quả táo | She ate an apple. | A round fruit. | A1'}
          rows={8}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={handleParse} disabled={!text.trim()}>
            Xem trước
          </Button>
          {previewed && previewRows.length > 0 && (
            <span className="text-sm text-zinc-500">
              Đã nhận diện {previewRows.length} từ
              {parseInfo?.hadHeader ? ' (có header)' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Bước 3: Preview + chỉnh sửa */}
      {previewed && (
        <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-800">Xem trước & chỉnh sửa</h2>
            <span className="text-sm text-zinc-500">{previewRows.length} từ</span>
          </div>

          {parseInfo?.warnings && parseInfo.warnings.length > 0 && (
            <div className="mb-3 space-y-1">
              {parseInfo.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">
                  ⚠️ {w}
                </p>
              ))}
            </div>
          )}

          {summary && (
            <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              <div className="font-medium">Kết quả kiểm tra:</div>
              <ul className="mt-1 space-y-1 text-zinc-600">
                <li>
                  Tìm thấy: <strong className="text-zinc-800">{summary.found}</strong> dòng
                </li>
                <li>
                  Hợp lệ (sẽ nhập):{' '}
                  <strong className="text-green-600">{summary.valid}</strong>
                </li>
                <li>
                  Đã có trong Vocabulary (gộp):{' '}
                  <strong className="text-amber-600">{summary.inVocab}</strong>
                </li>
                <li>
                  Trùng trong chính nội dung (bỏ, giữ 1):{' '}
                  <strong className="text-amber-600">{summary.dupFile}</strong>
                </li>
                <li>
                  Dòng lỗi (bỏ qua): <strong className="text-red-500">{summary.invalid}</strong>
                </li>
              </ul>
            </div>
          )}

          {previewRows.length === 0 ? (
            <EmptyState
              title="Không có từ hợp lệ"
              description="Không tìm thấy từ nào để nhập. Vui lòng kiểm tra lại nội dung."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">STT</th>
                    {COLUMN_HEADERS.map((c) => (
                      <th key={c.key} className="px-3 py-2 font-medium">
                        {c.label} {c.required && <span className="text-red-500">*</span>}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="px-3 py-2 text-zinc-500">{idx + 1}</td>
                      {COLUMN_HEADERS.map((c) => (
                        <td key={c.key} className="px-1 py-1">
                          {c.key === 'word_type' ? (
                            <input
                              list="word-type-options"
                              value={row.word_type || ''}
                              onChange={(e) => updateCell(idx, c.key, e.target.value.toLowerCase())}
                              className="w-full rounded border border-zinc-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
                              placeholder="noun"
                            />
                          ) : c.key === 'cefr' ? (
                            <input
                              list="cefr-options"
                              value={row.cefr || ''}
                              onChange={(e) => updateCell(idx, c.key, e.target.value.toUpperCase())}
                              className="w-full rounded border border-zinc-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
                              placeholder="A1"
                            />
                          ) : (
                            <input
                              value={row[c.key] || ''}
                              onChange={(e) => updateCell(idx, c.key, e.target.value)}
                              className="w-full rounded border border-zinc-200 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
                              placeholder={c.key === 'word' ? 'apple' : ''}
                            />
                          )}
                        </td>
                      ))}
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

          {/* Datalist cho loại từ và CEFR */}
          <datalist id="word-type-options">
            {WORD_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {wordTypeLabel(t)}
              </option>
            ))}
          </datalist>
          <datalist id="cefr-options">
            {CEFR_OPTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {previewRows.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={handleImport} loading={importing} disabled={importing}>
                {importing ? 'Đang nhập...' : 'Nhập từ'}
              </Button>
              {success && lastSetId && (
                <Button variant="secondary" onClick={goToSet}>
                  Xem bộ từ
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* "Lệnh vocabulary": hiển thị prompt chuẩn cho AI xử lý từ vựng.
          Read-only + clipboard — KHÔNG đụng dữ liệu vocabulary, KHÔNG gọi API. */}
      <Modal
        open={promptOpen}
        onClose={() => setPromptOpen(false)}
        title="Lệnh vocabulary"
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
          Copy toàn bộ nội dung bên dưới và dán cho AI (ChatGPT, Gemini, Claude...) để tạo / chuẩn
          hóa danh sách từ vựng đúng chuẩn import của EngFore. Kết quả do AI trả về dán trực tiếp
          vào ô nhập phía trên rồi bấm &quot;Xem trước&quot;.
        </p>
        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-sidebar p-3 text-left text-xs leading-relaxed text-text-primary">
          {VOCABULARY_AI_PROMPT}
        </pre>
      </Modal>
    </div>
  );
}
