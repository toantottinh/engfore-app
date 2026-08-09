import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getVocabularySet,
  getWordsInSet,
  importWordsToSet,
  updateWord,
  deleteWordFromSet,
} from '../../services/vocabulary.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import { normalizeCefr, cefrLabel, cefrBadgeClass } from '../../utils/cefr.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Alert from '../../components/ui/Alert.jsx';

const WORD_TYPES = {
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
  verb_phrase: 'Verb phrase (Cụm động từ ngữ)',
  other: 'Khác',
};

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']; // null = Chưa xác định

function masteryStatus(level) {
  const l = level ?? 0;
  if (l === 0) return { label: 'Chưa học', cls: 'bg-zinc-100 text-zinc-600' };
  if (l >= 5) return { label: 'Đã thuộc', cls: 'bg-green-100 text-green-700' };
  return { label: 'Đang học', cls: 'bg-amber-100 text-amber-700' };
}

const wordTypeOptions = Object.entries(WORD_TYPES);

export default function VocabularyDetail() {
  const { setId } = useParams();
  const navigate = useNavigate();

const [set, setSet] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setLoadingState, setSetLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [cefrFilter, setCefrFilter] = useState('all');
  const [sort, setSort] = useState('abc-asc');

  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [deleteWordOpen, setDeleteWordOpen] = useState(false);
  const [deleteSetOpen, setDeleteSetOpen] = useState(false);
  const [editingWord, setEditingWord] = useState(null);
  const [deletingWord, setDeletingWord] = useState(null);
  const [formError, setFormError] = useState('');
const [wordForm, setWordForm] = useState({
    word: '',
    ipa: '',
    word_type: 'noun',
    meaning: '',
    example: '',
    description: '',
    cefr_level: '',
  });

const loadSet = useCallback(async () => {
    setSetLoading(true);
    setError('');
    const { data, error: err } = await getVocabularySet(setId);
    setSetLoading(false);
    if (err || !data) {
      if (import.meta.env.DEV) {
        console.error('[VocabularyDetail] load set error:', err);
      }
      setError('Không tìm thấy bộ từ vựng hoặc đã xảy ra lỗi. Vui lòng thử lại.');
      return;
    }
    setSet(data);
  }, [setId]);

  const loadWords = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await getWordsInSet(setId);
    setLoading(false);
    if (err) {
      if (import.meta.env.DEV) {
        console.error('[VocabularyDetail] load words error:', err);
      }
      setError('Không thể tải danh sách từ. Vui lòng thử lại.');
      return;
    }
    setWords(data || []);
  }, [setId]);

  useEffect(() => {
    loadSet();
    loadWords();
  }, [loadSet, loadWords]);

  const filteredWords = words
    .filter((w) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        w.word.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q) ||
        w.ipa.toLowerCase().includes(q);
const matchFilter =
        filter === 'all' ||
        (filter === 'unseen' && (w.mastery_level ?? 0) === 0) ||
        (filter === 'learning' && (w.mastery_level ?? 0) >= 1 && (w.mastery_level ?? 0) < 5) ||
        (filter === 'mastered' && (w.mastery_level ?? 0) === 5);
      // Lọc theo CEFR: 'all' = hiện hết; 'unknown' = chưa xác định; còn lại là level cụ thể.
      const wordCefr = normalizeCefr(w.cefr_level);
      const matchCefr =
        cefrFilter === 'all' ||
        (cefrFilter === 'unknown' && !wordCefr) ||
        (cefrFilter !== 'unknown' && wordCefr === cefrFilter);
      return matchSearch && matchFilter && matchCefr;
    })
    .sort((a, b) => {
      const [key, dir] = sort.split('-');
      const asc = dir === 'asc';
      if (key === 'abc') {
        const cmp = a.word.toLowerCase().localeCompare(b.word.toLowerCase());
        return asc ? cmp : -cmp;
      }
      if (key === 'created') {
        return asc ? a._idx - b._idx : b._idx - a._idx;
      }
      if (key === 'mastery') {
        return (b.mastery_level ?? 0) - (a.mastery_level ?? 0);
      }
      return 0;
    });

  const openAddWord = () => {
    setFormError('');
    setEditingWord(null);
    setWordForm({
      word: '',
      ipa: '',
      word_type: 'noun',
      meaning: '',
example: '',
      description: '',
      cefr_level: '',
    });
    setWordModalOpen(true);
  };

  const openEditWord = (w) => {
    setFormError('');
    setEditingWord(w);
    setWordForm({
      word: w.word || '',
      ipa: w.ipa || '',
      word_type: w.word_type || 'noun',
      meaning: w.meaning || '',
      example: w.example || '',
description: w.description || '',
      cefr_level: w.cefr_level || '',
    });
    setWordModalOpen(true);
  };

  const openDeleteWord = (w) => {
    setFormError('');
    setDeletingWord(w);
    setDeleteWordOpen(true);
  };

  const handleWordSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!wordForm.word.trim()) {
      setFormError('Vui lòng nhập từ tiếng Anh.');
      return;
    }
    if (!wordForm.meaning.trim()) {
      setFormError('Vui lòng nhập nghĩa tiếng Việt.');
      return;
    }
setActionLoading(true);
    if (editingWord) {
      const { error: err } = await updateWord(editingWord.word_id, editingWord.id, wordForm);
      setActionLoading(false);
      if (err) {
        setFormError(getAuthErrorMessage(err));
        return;
      }
    } else {
      // RPC import_words_to_set đọc field `cefr` (kiểu enum A1–C2), không phải `cefr_level`.
      // Chuẩn hóa qua normalizeCefr: trống/không hợp lệ -> null để tránh lỗi 22P02 enum.
      const payload = [
        {
          word: wordForm.word,
          ipa: wordForm.ipa,
          word_type: wordForm.word_type,
          meaning: wordForm.meaning,
          example: wordForm.example,
          description: wordForm.description,
          cefr: normalizeCefr(wordForm.cefr_level),
        },
      ];
      const { error: err } = await importWordsToSet(setId, payload);
      setActionLoading(false);
      if (err) {
        setFormError(getAuthErrorMessage(err));
        return;
      }
    }
    setWordModalOpen(false);
    loadWords();
  };

  const handleDeleteWord = async () => {
    if (!deletingWord) return;
    setActionLoading(true);
    const { error: err } = await deleteWordFromSet(setId, deletingWord.id);
    setActionLoading(false);
    if (err) {
      setFormError(getAuthErrorMessage(err));
      setDeleteWordOpen(false);
      return;
    }
    setDeleteWordOpen(false);
    loadWords();
  };

const handleDeleteSet = async () => {
    setActionLoading(true);
    // deleteVocabularySet đã được static import ở đầu file — dùng trực tiếp
    // (loại dynamic import dư, tránh warning chunk khi build).
    const { error: err } = await deleteVocabularySet(setId);
    setActionLoading(false);
    if (err) {
      setFormError(getAuthErrorMessage(err));
      setDeleteSetOpen(false);
      return;
    }
    navigate('/vocabulary');
  };

if (setLoadingState && !set) {
    return <Spinner />;
  }

  if (setError && !set) {
    return (
      <div className="py-10">
        <Alert type="error" message={setError} />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/vocabulary')}>
            Quay lại danh sách bộ từ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/vocabulary"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Từ vựng
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-zinc-900">{set?.name}</h1>
            {set?.description && (
              <p className="mt-1 text-sm text-zinc-500">{set.description}</p>
            )}
            <p className="mt-2 text-sm text-zinc-500">{words.length} từ</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/practice/flashcard/${setId}`}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Flashcard
            </Link>
            <Link
              to={`/practice/typing/${setId}`}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Gõ từ
            </Link>
            <Button variant="ghost" onClick={() => setDeleteSetOpen(true)}>
              <span className="text-red-600">Xóa</span>
            </Button>
          </div>
        </div>
      </div>

      {error && <Alert type="error" message={error} className="mb-4" />}

      {/* Tìm kiếm / lọc / sắp xếp */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            type="search"
            placeholder="Tìm từ, nghĩa, IPA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm kiếm từ"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Lọc theo trạng thái"
          >
<option value="all">Tất cả</option>
            <option value="unseen">Chưa học</option>
            <option value="learning">Đang học</option>
            <option value="mastered">Đã thuộc</option>
          </select>
          <select
            value={cefrFilter}
            onChange={(e) => setCefrFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Lọc theo cấp độ CEFR"
          >
            <option value="all">Cấp độ: Tất cả</option>
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
            <option value="C2">C2</option>
            <option value="unknown">Chưa xác định</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Sắp xếp"
          >
            <option value="abc-asc">A → Z</option>
            <option value="abc-desc">Z → A</option>
            <option value="created-desc">Mới nhất</option>
            <option value="created-asc">Cũ nhất</option>
            <option value="mastery-desc">Độ thành thạo</option>
          </select>
        </div>
      </div>

      <div className="mb-5">
        <Button onClick={openAddWord}>
          <span aria-hidden="true">+</span> Thêm từ
        </Button>
      </div>

      {/* Bảng từ */}
      {loading ? (
        <Spinner />
      ) : filteredWords.length === 0 ? (
        search || filter !== 'all' ? (
          <EmptyState
            title="Không tìm thấy từ nào"
            description="Không có từ nào khớp với tiêu chí tìm kiếm/lọc của bạn."
          />
        ) : (
          <EmptyState
            title="Bộ từ này chưa có từ nào"
            description="Hãy thêm từ đầu tiên để bắt đầu học."
            action={
              <Button onClick={openAddWord}>
                <span aria-hidden="true">+</span> Thêm từ
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">STT</th>
                <th className="px-4 py-3 font-medium">Từ</th>
                <th className="px-4 py-3 font-medium">IPA</th>
<th className="px-4 py-3 font-medium">Loại từ</th>
                <th className="px-4 py-3 font-medium">Cấp độ</th>
                <th className="px-4 py-3 font-medium">Nghĩa</th>
                <th className="px-4 py-3 font-medium">Ví dụ</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredWords.map((w, i) => {
                const status = masteryStatus(w.mastery_level);
                return (
                  <tr key={w.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-500">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{w.word}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {w.ipa ? `/${w.ipa}/` : '—'}
                    </td>
<td className="px-4 py-3 text-zinc-600">
                      {WORD_TYPES[w.word_type] || w.word_type || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cefrBadgeClass(w.cefr_level)}`}>
                        {cefrLabel(w.cefr_level)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{w.meaning}</td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-zinc-600">
                      {w.example ? `"${w.example}"` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEditWord(w)}
                          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                          title="Chỉnh sửa"
                          aria-label={`Chỉnh sửa ${w.word}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openDeleteWord(w)}
                          className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          title="Xóa"
                          aria-label={`Xóa ${w.word}`}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal thêm/sửa từ */}
      <Modal
        open={wordModalOpen}
        onClose={() => setWordModalOpen(false)}
        title={editingWord ? 'Chỉnh sửa từ' : 'Thêm từ mới'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setWordModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="word-form" loading={actionLoading}>
              {actionLoading ? 'Đang lưu...' : editingWord ? 'Cập nhật' : 'Lưu'}
            </Button>
          </>
        }
      >
        <form id="word-form" onSubmit={handleWordSubmit} className="space-y-4">
          {formError && <Alert type="error" message={formError} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Từ tiếng Anh *"
              name="word"
              value={wordForm.word}
              onChange={(e) => setWordForm({ ...wordForm, word: e.target.value })}
              placeholder="apple"
              autoFocus
            />
            <Input
              label="IPA"
              name="ipa"
              value={wordForm.ipa}
              onChange={(e) => setWordForm({ ...wordForm, ipa: e.target.value })}
              placeholder="/ˈæp.əl/"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700" htmlFor="word_type">
                Loại từ
              </label>
              <select
                id="word_type"
                name="word_type"
                value={wordForm.word_type}
                onChange={(e) => setWordForm({ ...wordForm, word_type: e.target.value })}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {wordTypeOptions.map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Nghĩa tiếng Việt *"
              name="meaning"
              value={wordForm.meaning}
              onChange={(e) => setWordForm({ ...wordForm, meaning: e.target.value })}
              placeholder="quả táo"
            />
          </div>
          <Input
            label="Ví dụ"
            name="example"
            value={wordForm.example}
            onChange={(e) => setWordForm({ ...wordForm, example: e.target.value })}
            placeholder="She ate an apple every morning."
          />
          <Textarea
            label="Ghi chú"
            name="description"
            value={wordForm.description}
            onChange={(e) => setWordForm({ ...wordForm, description: e.target.value })}
            placeholder="Ghi chú thêm về từ này (tùy chọn)..."
            rows={2}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700" htmlFor="cefr_level">
              Cấp độ CEFR
            </label>
            <select
              id="cefr_level"
              name="cefr_level"
              value={wordForm.cefr_level}
              onChange={(e) => setWordForm({ ...wordForm, cefr_level: e.target.value })}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
<option value="">Chưa xác định</option>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* Modal xóa từ */}
      <Modal
        open={deleteWordOpen}
        onClose={() => setDeleteWordOpen(false)}
        title="Xóa từ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteWordOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDeleteWord} loading={actionLoading}>
              {actionLoading ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-700">
          Bạn có chắc muốn xóa từ{' '}
          <span className="font-semibold">"{deletingWord?.word}"</span> khỏi bộ từ này không?
        </p>
      </Modal>

      {/* Modal xóa bộ từ */}
      <Modal
        open={deleteSetOpen}
        onClose={() => setDeleteSetOpen(false)}
        title="Xóa bộ từ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteSetOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDeleteSet} loading={actionLoading}>
              {actionLoading ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-700">
          Bạn có chắc muốn xóa bộ từ <span className="font-semibold">"{set?.name}"</span>? Tất cả
          dữ liệu của bộ từ sẽ bị xóa và không thể hoàn tác.
        </p>
      </Modal>
    </div>
  );
}
