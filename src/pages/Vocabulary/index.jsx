import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getUserVocabulary, addWordsToSet, removeFromVocabulary } from '../../services/vocabulary.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Select from '../../components/ui/Select.jsx';


export default function Vocabulary() {
  const { sets, loading: setsLoading, error: setsError, createSet, updateSet, removeSet, mutationLoading } =
    useVocabulary();
  const { user } = useAuth();
  const navigate = useNavigate();

  // --- Vocabulary Library State ---
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedWordIds, setSelectedWordIds] = useState([]);
  const [viewMode, setViewMode] = useState('library');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState('');

  // --- Add to set modal state ---
  const [addToSetModalOpen, setAddToSetModalOpen] = useState(false);
  const [addToSetTargetId, setAddToSetTargetId] = useState('');
  const [addToSetLoading, setAddToSetLoading] = useState(false);
  const [addToSetError, setAddToSetError] = useState('');


  // Bộ từ được chọn cho "Học ngay" (multi-set practice, không dùng SRS).
  const [selectedSetIds, setSelectedSetIds] = useState([]);

  // Delete word confirmation modal state
  const [deleteWordOpen, setDeleteWordOpen] = useState(false);
  const [deletingWord, setDeletingWord] = useState(null);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);
  const [deleteWordError, setDeleteWordError] = useState('');

  // Bulk delete confirmation modal state
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteResults, setBulkDeleteResults] = useState(null);

  // Delete set confirmation modal state
  const [deleteSetLoading, setDeleteSetLoading] = useState(false);
  const [deleteSetError, setDeleteSetError] = useState('');

  // State cho cac form
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editingSet, setEditingSet] = useState(null);
  const [deletingSet, setDeletingSet] = useState(null);

  // Load user vocabulary on mount
  useEffect(() => {
    const loadVocabulary = async () => {
      if (!user) {
        setWords([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const { data, error } = await getUserVocabulary(user.id);
        if (error) throw error;
        setWords(data || []);
      } catch (e) {
        setError('Không thể tải từ vựng. Vui lòng thử lại.');
        setWords([]);
      } finally {
        setLoading(false);
      }
    };
    loadVocabulary();
  }, [user]);

  const filteredSets = useMemo(() => {
    if (!searchTerm.trim()) return sets;
    const lowercasedFilter = searchTerm.trim().toLowerCase();
    return sets.filter(
      (set) =>
        set.name.toLowerCase().includes(lowercasedFilter) ||
        (set.description || '').toLowerCase().includes(lowercasedFilter)
    );
  }, [sets, searchTerm]);

  const toggleSetSelection = (id) => {
    setSelectedSetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    setSelectedSetIds(filteredSets.map((set) => set.id));
  };

  const clearSelection = () => {
    setSelectedSetIds([]);
  };

  const startPractice = () => {
    if (selectedSetIds.length === 0) return;
    navigate(`/practice/session?setIds=${selectedSetIds.join(',')}`);
  };

  const openCreate = () => {
    setFormError('');
    setFormName('');
    setFormDesc('');
    setCreateOpen(true);
  };

  const openEdit = (set) => {
    setFormError('');
    setEditingSet(set);
    setFormName(set.name);
    setFormDesc(set.description || '');
    setEditOpen(true);
  };

  const openDelete = (set) => {
    setDeletingSet(set);
    setDeleteOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formName.trim()) {
      setFormError('Vui lòng nhập tên bộ từ.');
      return;
    }
    const { error: err } = await createSet({ name: formName.trim(), description: formDesc.trim() });
    if (err) {
      setFormError(err);
      return;
    }
    setCreateOpen(false);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formName.trim()) {
      setFormError('Vui lòng nhập tên bộ từ.');
      return;
    }
    const { error: err } = await updateSet(editingSet.id, {
      name: formName.trim(),
      description: formDesc.trim(),
    });
    if (err) {
      setFormError(err);
      return;
    }
    setEditOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingSet) return;
    const { error: err } = await removeSet(deletingSet.id);
    if (err) {
      setFormError(err);
      setDeleteOpen(false);
      return;
    }
    setDeleteOpen(false);
  };

  // Component con cho card bộ từ
  const SetCard = ({ set }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setMenuOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

    return (
      <div className="flex flex-col rounded-xl border border-border-color bg-surface-sidebar p-5 transition-shadow hover:shadow-lg">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={selectedSetIds.includes(set.id)}
              onChange={() => toggleSetSelection(set.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Chọn bộ ${set.name}`}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 text-brand-primary focus:ring-brand-primary"
            />
            <h3 className="font-semibold text-text-primary">{set.name}</h3>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Tùy chọn"
              className="rounded-full p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <i className="bx bx-dots-vertical-rounded text-lg"></i>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-40 origin-top-right rounded-md border border-border-color bg-surface-default py-1 shadow-lg">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openEdit(set);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  Chỉnh sửa
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openDelete(set);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-surface-hover hover:text-red-300"
                >
                  Xóa
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex-grow">
          <p className="text-sm text-text-secondary">{set.word_count || 0} từ</p>
          <p className="mt-1 text-xs text-text-secondary/70">
            Cập nhật {new Date(set.updated_at || set.created_at).toLocaleDateString('vi-VN')}
          </p>
        </div>

        <div className="mt-5 flex gap-3">
          <Link
            to={`/vocabulary/${set.id}`}
            className="flex-1 rounded-lg border border-border-color bg-surface-default px-3 py-2 text-center text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Xem bộ từ
          </Link>
          <Link
            to={`/learn/session/${set.id}`}
            className="flex-1 rounded-lg bg-brand-primary px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            Bắt đầu học
          </Link>
        </div>
      </div>
    );
  };

  // --- Vocabulary Library derived data & helpers ---
  const filteredWords = useMemo(() => {
    if (!words.length) return [];
    const now = new Date();
    return words.filter((word) => {
      const state = word.state ?? 'new';
      const mastery = word.mastery_level ?? 0;
      const dueDate = word.review_due_at;
      if (filter === 'all') return true;
      if (filter === 'new') return state === 'new';
      if (filter === 'learning') return state === 'learning' || state === 'relearning';
      if (filter === 'due') {
        if (state === 'new' || state === 'mastered') return false;
        if (!dueDate) return false;
        return new Date(dueDate) <= now;
      }
      if (filter === 'mastered') return mastery >= 4;
      return true;
    });
  }, [words, filter]);

  const searchAndFilter = useMemo(() => {
    let result = filteredWords;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (w) =>
          (w.word || '').toLowerCase().includes(term) ||
          (w.meaning || '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [filteredWords, searchTerm]);

  const toggleSelect = (id) => {
    setSelectedWordIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearWordSelection = () => setSelectedWordIds([]);

    const handleRemoveFromVocabulary = async (id) => {
    const { error: err } = await removeFromVocabulary(id);
    if (err) {
      return { error: getAuthErrorMessage(err) };
    }
    setWords((prev) => prev.filter((w) => (w.id ?? w.word_sense_id) !== id));
    return { error: null };
  };

  // Single word delete: open confirmation modal
  const openDeleteWordModal = (word) => {
    setDeletingWord(word);
    setDeleteWordError('');
    setDeleteWordOpen(true);
  };

  // Confirm single word delete
  const handleConfirmDeleteWord = async () => {
    if (!deletingWord) return;
    const wordId = deletingWord.id ?? deletingWord.word_sense_id;
    if (!wordId) {
      setDeleteWordError('Không thể xác định từ cần xóa.');
      return;
    }
    setDeleteWordLoading(true);
    setDeleteWordError('');

    const { error: err } = await handleRemoveFromVocabulary(wordId);
    if (err) {
      setDeleteWordError(err);
      // Keep modal open on error so user can retry or cancel
    } else {
      // Remove from selection if selected
      setSelectedWordIds((prev) =>
        prev.filter((id) => id !== wordId)
      );
      setDeleteWordOpen(false);
      setDeletingWord(null);
    }
    setDeleteWordLoading(false);
  };

  // Bulk delete: open confirmation modal
  const openBulkDeleteModal = () => {
    if (selectedWordIds.length === 0) return;
    setBulkDeleteResults(null);
    setBulkDeleteOpen(true);
  };

  // Confirm bulk delete — sequential with summary
  const handleConfirmBulkDelete = async () => {
    if (selectedWordIds.length === 0) return;
    setBulkDeleteLoading(true);
    setBulkDeleteResults(null);

    let successCount = 0;
    let failCount = 0;
    const failedWords = [];

    for (const id of selectedWordIds) {
      const { error: err } = await handleRemoveFromVocabulary(id);
      if (err) {
        failCount++;
        const word = words.find((w) => (w.id ?? w.word_sense_id) === id);
        failedWords.push({ id, word: word?.word || id, error: err });
      } else {
        successCount++;
      }
    }

    setBulkDeleteResults({ successCount, failCount, failedWords });
    setBulkDeleteLoading(false);

    if (failCount === 0) {
      // All succeeded: clear selection and close
      setSelectedWordIds([]);
      setBulkDeleteOpen(false);
      setBulkDeleteResults(null);
    }
        // Partial failures: keep modal open to show summary
  };

  const openAddToSetModal = () => {
    if (selectedWordIds.length === 0) return;
    setAddToSetError('');
    setAddToSetTargetId(sets.length > 0 ? sets[0].id : '');
    setAddToSetModalOpen(true);
  };

  const handleAddToSet = async (e) => {
    e.preventDefault();
    if (!addToSetTargetId) {
      setAddToSetError('Vui lòng chọn một bộ từ.');
      return;
    }
    setAddToSetLoading(true);
    setAddToSetError('');
    const { error } = await addWordsToSet(addToSetTargetId, selectedWordIds);
    setAddToSetLoading(false);
    if (error) {
      setAddToSetError(getAuthErrorMessage(error));
    } else {
      setAddToSetModalOpen(false);
      clearWordSelection();
      // Maybe show a success toast later
    }
  };


  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const tabs = [
    { id: 'library', name: 'Từ vựng' },
    { id: 'sets', name: 'Bộ từ' },
  ];

  const EmptyState = ({ icon, title, description, action }) => (
    <div className="col-span-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-color bg-surface-sidebar/50 py-20 text-center">
      <span className="text-5xl" aria-hidden="true">{icon}</span>
      <h3 className="mt-4 text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );

  const renderLibrary = () => {
    const displayWords = searchTerm ? searchAndFilter : filteredWords;
    const hasWords = words.length > 0;

    return (
      <div>
        {hasWords ? (
          <div className="space-y-4">
            {displayWords.length === 0 ? (
              <Alert type="info" message="Không có từ nào khớp với bộ lọc/tìm kiếm của bạn." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayWords.map((word) => {
                  const ipa = word.ipa ? ` /${word.ipa}/` : '';
                  const type = word.word_type ? ` · ${word.word_type}` : '';
                  const mastery = word.mastery_level ?? 0;
                  const isMastered = mastery >= 4;
                  const wordId = word.id ?? word.word_sense_id ?? '';

                  return (
                    <div
                      key={wordId}
                      className="p-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors cursor-pointer"
                      onClick={() => navigate('/learn/session')}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex-1 truncate font-medium text-zinc-800">
                          {word.word || ''}
                        </span>
                        <span className="text-indigo-600 text-sm">{ipa}</span>
                        <span className="text-zinc-500 text-xs">{type}</span>
                      </div>
                      <p className="mt-1 text-zinc-600 text-truncate line-clamp-1 max-w-xs">
                        {word.meaning || ''}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-${isMastered ? 'green-500' : 'zinc-400'} text-xs font-medium ${isMastered ? 'opacity-80' : ''}`}>
                          {mastery}/5 {isMastered && '🟢'}
                        </span>
                        <input
                          type="checkbox"
                          checked={selectedWordIds.includes(wordId)}
                          onChange={() => toggleSelect(wordId)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-zinc-400 cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <Alert type="info" message="Thư viện của bạn đang trống. Hãy nhập từ mới hoặc import từ vựng." />
        )}
        {selectedWordIds.length > 0 && (
          <div className="mt-4 p-3 rounded-xl border border-brand-primary/30 bg-brand-primary/5">
            <span className="text-zinc-800">{selectedWordIds.length} từ đã được chọn</span>
            <Button variant="ghost" size="sm" onClick={clearWordSelection} className="ml-2">Bỏ chọn</Button>
            <Button variant="danger" size="sm" onClick={openBulkDeleteModal}>Xóa khỏi thư viện</Button>
            <Button variant="secondary" size="sm" onClick={openAddToSetModal}>Thêm vào bộ từ</Button>
          </div>
        )}
        {!hasWords && (
          <div className="mt-6 text-center">
            <Button variant="ghost" onClick={() => navigate('/vocabulary/import')}>+ Nhập từ vựng</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Từ vựng</h1>
          <p className="mt-1 text-text-secondary">Quản lý từ vựng và bộ từ của bạn.</p>
        </div>
        {viewMode === 'sets' && (
          <Button onClick={openCreate}>
            <i className="bx bx-plus text-lg"></i>
            <span>Tạo bộ từ</span>
          </Button>
        )}
      </div>

      {/* Tabs: Library vs Word Sets */}
      <div className="border-b border-border-color">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setViewMode(tab.id)}
              className={`
                whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
                ${
                  viewMode === tab.id
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-transparent text-text-secondary hover:border-gray-300 hover:text-text-primary'
                }
              `}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {viewMode === 'sets' && (
        <>
          {/* Thanh cong cu chon bo de "Hoc ngay" (khong dung SRS) */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-color bg-surface-sidebar px-4 py-3">
            <label className="flex items-center gap-2 text-sm font-medium text-text-secondary">
              <input
                type="checkbox"
                checked={
                  filteredSets.length > 0 &&
                  filteredSets.every((s) => selectedSetIds.includes(s.id))
                }
                onChange={(e) =>
                  e.target.checked ? selectAllFiltered() : clearSelection()
                }
                className="h-4 w-4 cursor-pointer rounded border-zinc-300 text-brand-primary focus:ring-brand-primary"
              />
              Chọn tất cả
            </label>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedSetIds.length === 0}
              className="text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              Bỏ chọn
            </button>
            <div className="ml-auto text-sm text-text-secondary">
              Đã chọn <span className="font-semibold text-text-primary">{selectedSetIds.length}</span> bộ
            </div>
            <Button
              onClick={startPractice}
              disabled={selectedSetIds.length === 0}
              className="inline-flex items-center gap-1.5"
            >
              <span>🎯 Học ngay</span>
              <span className="hidden sm:inline">(Không lưu SRS)</span>
            </Button>
          </div>

          <div className="relative">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-lg text-text-secondary"></i>
            <Input
              type="search"
              placeholder="Tìm kiếm bộ từ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Tìm kiếm bộ từ"
              className="!pl-10"
            />
          </div>

          {setsError && <Alert type="error" message={setsError} className="mb-4" />}

          {setsLoading ? (
            <Spinner />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSets.length > 0 ? (
                filteredSets.map((set) => <SetCard key={set.id} set={set} />)
              ) : searchTerm ? (
                <EmptyState
                  icon="🔍"
                  title="Không tìm thấy bộ từ"
                  description="Không có bộ từ nào khớp với từ khóa tìm kiếm của bạn."
                />
              ) : (
                <EmptyState
                  icon="📚"
                  title="Chưa có bộ từ nào"
                  description="Tạo bộ từ đầu tiên để bắt đầu học."
                  action={
                    <Button onClick={openCreate}>
                      <i className="bx bx-plus text-lg"></i>
                      <span>Tạo bộ từ</span>
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </>
      )}

      {viewMode === 'library' && (
        <>
          {/* Library search & filter */}
          <div className="mb-4 rounded-xl border border-zinc-200 p-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-lg text-text-secondary"></i>
                <Input
                  type="search"
                  placeholder="Tìm từ vựng..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  aria-label="Tìm từ vựng"
                  className="!pl-10"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'new', label: 'Mới' },
                { id: 'learning', label: 'Đang học' },
                { id: 'due', label: 'Đến hạn' },
                { id: 'mastered', label: 'Thành thạo' },
              ].map((f) => (
                <Button
                  key={f.id}
                  variant={filter === f.id ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(f.id)}
                  className="h-6"
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {error && <Alert type="error" message={error} className="mb-4" />}

          {loading ? (
            <Spinner />
          ) : (
            <div>{renderLibrary()}</div>
          )}
        </>
      )}

      {/* Modal tạo bộ từ */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo bộ từ mới"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="set-form" loading={mutationLoading}>
              {mutationLoading ? 'Đang tạo...' : 'Tạo bộ từ'}
            </Button>
          </>
        }
      >
        <form id="set-form" onSubmit={handleCreate} className="space-y-4">
          {formError && <Alert type="error" message={formError} />}
          <Input
            label="Tên bộ từ"
            name="name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ví dụ: Từ vựng IELTS"
            autoFocus
          />
          <Textarea
            label="Mô tả"
            name="description"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="Mô tả ngắn về bộ từ này..."
            rows={3}
          />
        </form>
      </Modal>

      {/* Modal sửa bộ từ */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Chỉnh sửa bộ từ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="edit-set-form" loading={mutationLoading}>
              {mutationLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </>
        }
      >
        <form id="edit-set-form" onSubmit={handleEdit} className="space-y-4">
          {formError && <Alert type="error" message={formError} />}
          <Input
            label="Tên bộ từ"
            name="name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ví dụ: Từ vựng IELTS"
            autoFocus
          />
          <Textarea
            label="Mô tả"
            name="description"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="Mô tả ngắn về bộ từ này..."
            rows={3}
          />
        </form>
      </Modal>

      {/* Modal xác nhận xóa */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Xóa bộ từ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={mutationLoading}>
              {mutationLoading ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Bạn có chắc muốn xóa bộ từ{' '}
          <span className="font-semibold">"{deletingSet?.name}"</span>? Hành động này không thể
          hoàn tác.
        </p>
      </Modal>

      {/* Modal thêm từ vào bộ từ */}
      <Modal
        open={addToSetModalOpen}
        onClose={() => setAddToSetModalOpen(false)}
        title={`Thêm ${selectedWordIds.length} từ vào bộ`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddToSetModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="add-to-set-form" loading={addToSetLoading}>
              {addToSetLoading ? 'Đang thêm...' : 'Thêm'}
            </Button>
          </>
        }
      >
        <form id="add-to-set-form" onSubmit={handleAddToSet} className="space-y-4">
          {addToSetError && <Alert type="error" message={addToSetError} />}
          {sets.length > 0 ? (
            <Select
              label="Chọn bộ từ"
              value={addToSetTargetId}
              onChange={(e) => setAddToSetTargetId(e.target.value)}
              options={sets.map(s => ({ value: s.id, label: s.name }))}
            />
          ) : (
            <p className="text-sm text-text-secondary">
              Bạn chưa có bộ từ nào. Hãy{' '}
              <button type="button" onClick={() => { setAddToSetModalOpen(false); openCreate(); }} className="text-brand-primary font-medium hover:underline">
                tạo một bộ từ mới
              </button>
              {' '}trước.
            </p>
          )}
        </form>
      </Modal>

    </div>
  );
}
