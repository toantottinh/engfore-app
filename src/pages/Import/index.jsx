import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getVocabularySets, getWordsInSet, importWordsToSet } from '../../services/vocabulary.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import {
  parseVocabularyText,
  toImportPayload,
  dedupeRows,
} from '../../utils/vocabulary-importer.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';

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
  const { user } = useAuth();
  const navigate = useNavigate();

  const [text, setText] = useState('');
  const [sets, setSets] = useState([]);
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

  // Tải danh sách bộ từ của user.
  useEffect(() => {
    let active = true;
    setSetsLoading(true);
    setLoadSetsError('');
    if (!user) {
      setSetsLoading(false);
      return;
    }
    getVocabularySets(user.id).then(({ data, error: err }) => {
      if (!active) return;
      setSetsLoading(false);
      if (err) {
        setLoadSetsError(getAuthErrorMessage(err));
        return;
      }
      setSets(data || []);
      if (data && data.length > 0) {
        setSetId((prev) => prev || data[0].id);
      }
    });
    return () => {
      active = false;
    };
  }, [user]);

  const handleParse = useCallback(() => {
    setError('');
    setSuccess('');
    setDuplicates([]);
    setPreviewed(true);

    if (!setId) {
      setError('Vui lòng chọn một bộ từ vựng trước khi xem trước.');
      setPreviewRows([]);
      setParseInfo(null);
      return;
    }

    const result = parseVocabularyText(text);
    setParseInfo({ format: result.format, hadHeader: result.hadHeader, warnings: result.warnings });
    setPreviewRows(result.rows);
  }, [text, setId]);

  // Khi thay đổi set, tự động kiểm tra duplicate (nếu đã preview).
  useEffect(() => {
    let active = true;
    if (!previewed || previewRows.length === 0 || !setId) {
      setDuplicates([]);
      return;
    }
    setLoadSetsError('');
    getWordsInSet(setId)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          setDuplicates([]);
          return;
        }
        const existing = (data || []).map((w) => w.word);
        const { rows, duplicates: dup } = dedupeRows(previewRows, existing);
        setPreviewRows(rows);
        setDuplicates(dup || []);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, previewed]);

  const updateCell = (index, key, value) => {
    setPreviewRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  const removeRow = (index) => {
    setPreviewRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setError('');
    setSuccess('');
    if (!setId) {
      setError('Vui lòng chọn một bộ từ vựng.');
      return;
    }
    const validRows = previewRows.filter((r) => (r.word || '').trim());
    if (validRows.length === 0) {
      setError('Không có từ hợp lệ nào để nhập.');
      return;
    }
    if (importing) return;

    setImporting(true);
    const payload = toImportPayload(validRows);
    const { data, error: err } = await importWordsToSet(setId, payload);
    setImporting(false);

if (err) {
      // Log đầy đủ lỗi thật dạng CHUỖI để console không gập thành "Object"
      // — chỉ log khi DEV, tránh lộ thông tin chi tiết trong production.
      if (import.meta.env.DEV) {
        const errInfo = {
          status: err?.status ?? null,
          code: err?.code ?? null,
          message: err?.message ?? null,
          details: err?.details ?? null,
          hint: err?.hint ?? null,
          error_code: err?.error_code ?? null,
          setId,
          payloadCount: payload.length,
          firstWord: payload?.[0]?.word ?? null,
          payloadSample: payload,
        };
        console.error('[Import] importWordsToSet error:', JSON.stringify(errInfo, null, 2));
      }
      setError(getAuthErrorMessage(err));
      return;
    }

    const importedCount = data?.length ?? validRows.length;
    setSuccess(
      `Đã nhập thành công ${importedCount} từ vào bộ từ. Bạn có thể xem trong phần Từ vựng.`
    );
    setPreviewRows([]);
    setPreviewed(false);
    setDuplicates([]);
    setParseInfo(null);
    setText('');
  };

  const goToSet = () => {
    if (setId) navigate(`/vocabulary/${setId}`);
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
        <h1 className="text-2xl font-bold text-zinc-900">Nhập từ vựng</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Dán danh sách từ (mỗi dòng một từ) hoặc format pipe 7 cột vào ô bên dưới, xem trước, chỉnh
          sửa nếu cần rồi nhập vào bộ từ.
        </p>
      </div>

      {loadSetsError && <Alert type="error" message={loadSetsError} className="mb-4" />}
      {error && <Alert type="error" message={error} className="mb-4" />}
      {success && <Alert type="success" message={success} className="mb-4" />}

      {/* Bước 1: Chọn bộ từ */}
      <div className="mb-5 rounded-xl border border-zinc-200 bg-white p-5">
        <label htmlFor="set-select" className="text-sm font-medium text-zinc-700">
          Chọn bộ từ vựng để nhập vào *
        </label>
        {setsLoading ? (
          <div className="mt-2">
            <Spinner />
          </div>
        ) : sets.length === 0 ? (
          <div className="mt-3">
            <Alert
              type="info"
              message="Bạn chưa có bộ từ nào. Vui lòng tạo bộ từ trước khi nhập từ vựng."
            />
            <Link
              to="/vocabulary"
              className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Tạo bộ từ
            </Link>
          </div>
        ) : (
          <select
            id="set-select"
            value={setId}
            onChange={(e) => setSetId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.word_count ?? 0} từ)
              </option>
            ))}
          </select>
        )}
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

          {duplicates.length > 0 && (
            <Alert
              type="info"
              className="mb-3"
              message={`Đã loại ${duplicates.length} từ trùng đã tồn tại trong bộ từ (${
                duplicates.length > 0 ? duplicates.map((d) => d.word).join(', ') : ''
              }).`}
            />
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
              {success && setId && (
                <Button variant="secondary" onClick={goToSet}>
                  Xem bộ từ
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
