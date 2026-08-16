import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Select from '../../components/ui/Select.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import { useVocabularyDetail } from '../../hooks/useVocabularyDetail.js';
import { VALID_WORD_TYPES } from '../../utils/vocabulary-importer.js';
import { cefrBadgeClass, cefrLabel } from '../../utils/cefr.js';
import { CEFR_LEVELS } from '../../utils/cefr.js';
import { ttsService } from '../../../tts.service.js';

const WORD_TYPE_OPTIONS = [
  { value: '', label: 'Chọn loại từ' },
  ...Array.from(VALID_WORD_TYPES).map((type) => ({ value: type, label: type.replace(/_/g, ' ') })),
];

const CEFR_OPTIONS = [
  { value: '', label: 'Chọn cấp độ CEFR' },
  ...CEFR_LEVELS.map((level) => ({ value: level, label: level })),
];

const SORT_OPTIONS = [
  { value: 'default', label: 'Sắp xếp mặc định' },
  { value: 'az', label: 'A-Z' },
  { value: 'za', label: 'Z-A' },
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
];

export default function VocabularyDetail() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const { removeSet } = useVocabulary();

  const {
    set,
    words,
    loading,
    error,
    mutationLoading,
    loadSetAndWords,
    addWord,
    editWord,
    removeWord,
    updateSetDetails,
  } = useVocabularyDetail(setId);

  const [searchTerm, setSearchTerm] = useState('');
  const [addEditModalOpen, setAddEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteSetModalOpen, setDeleteSetModalOpen] = useState(false);
  const [deleteSetLoading, setDeleteSetLoading] = useState(false);
  const [deleteSetError, setDeleteSetError] = useState(null);
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState('vocabulary');

  // State cho modal sửa bộ từ
  const [editSetModalOpen, setEditSetModalOpen] = useState(false);
  const [editSetName, setEditSetName] = useState('');
  const [editSetError, setEditSetError] = useState('');

  const [cefrFilter, setCefrFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('default');

  // State cho form thêm/sửa từ
  const [isEditing, setIsEditing] = useState(false);
  const [currentWord, setCurrentWord] = useState(null);
  const [formWord, setFormWord] = useState('');
  const [formIPA, setFormIPA] = useState('');
  const [formWordType, setFormWordType] = useState('');
  const [formMeaning, setFormMeaning] = useState('');
  const [formExample, setFormExample] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCEFR, setFormCEFR] = useState('');

  // State cho xóa từ
  const [deletingWord, setDeletingWord] = useState(null);

  const displayedWords = useMemo(() => {
    let filtered = [...words];

    // Filter
    if (searchTerm.trim()) {
      const lowercasedFilter = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(
        (word) =>
          word.word.toLowerCase().includes(lowercasedFilter) ||
          word.meaning.toLowerCase().includes(lowercasedFilter)
      );
    }
    if (typeFilter !== 'all') {
      filtered = filtered.filter((word) => word.word_type === typeFilter);
    }
    if (cefrFilter !== 'all') {
      filtered = filtered.filter((word) => word.cefr_level === cefrFilter);
    }

    // Sort
    switch (sortOrder) {
      case 'az':
        filtered.sort((a, b) => a.word.localeCompare(b.word));
        break;
      case 'za':
        filtered.sort((a, b) => b.word.localeCompare(a.word));
        break;
      case 'newest':
        filtered.sort((a, b) => b.id - a.id);
        break;
      case 'oldest':
        filtered.sort((a, b) => a.id - b.id);
        break;
      default:
        // default order from db
        break;
    }

    return filtered;
  }, [words, searchTerm, typeFilter, cefrFilter, sortOrder]);

  const resetForm = () => {
    setFormWord('');
    setFormIPA('');
    setFormWordType('');
    setFormMeaning('');
    setFormExample('');
    setFormDescription('');
    setFormCEFR('');
    setFormError('');
    setCurrentWord(null);
    setIsEditing(false);
  };

  const openAddModal = () => {
    resetForm();
    setAddEditModalOpen(true);
  };

  const openEditModal = (word) => {
    resetForm();
    setIsEditing(true);
    setCurrentWord(word);
    setFormWord(word.word);
    setFormIPA(word.ipa || '');
    setFormWordType(word.word_type || '');
    setFormMeaning(word.meaning);
    setFormExample(word.example || '');
    setFormDescription(word.memory_clue || '');
    setFormCEFR(word.cefr_level || '');
    setAddEditModalOpen(true);
  };

  const openDeleteModal = (word) => {
    setDeletingWord(word);
    setDeleteModalOpen(true);
  };
  
  const openEditSetModal = () => {
    setEditSetName(set.name);
    setEditSetError('');
    setEditSetModalOpen(true);
  };

  const handleAddEditWord = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formWord.trim() || !formMeaning.trim()) {
      setFormError('Từ tiếng Anh và Nghĩa tiếng Việt là bắt buộc.');
      return;
    }

    const wordData = {
      word: formWord.trim(),
      ipa: formIPA.trim() || null,
      word_type: formWordType || 'other',
      meaning: formMeaning.trim(),
      example: formExample.trim() || null,
      memory_clue: formDescription.trim() || null,
      cefr_level: formCEFR || null,
    };

    let result;
    if (isEditing && currentWord) {
      result = await editWord(currentWord.word_id, currentWord.id, wordData);
    } else {
      result = await addWord(wordData);
    }

    if (result.error) {
      setFormError(result.error);
      return;
    }

    setAddEditModalOpen(false);
    resetForm();
  };

  const handleDeleteWord = async () => {
    if (!deletingWord) return;
    const result = await removeWord(deletingWord.id);
    if (result.error) {
      setFormError(result.error);
      setDeleteModalOpen(false);
      return;
    }
    setDeleteModalOpen(false);
    setDeletingWord(null);
  };

  const handleDeleteSet = async () => {
    setDeleteSetError(null);
    setDeleteSetLoading(true);
    const { error } = await removeSet(setId);
    setDeleteSetLoading(false);

    if (error) {
      setDeleteSetError(`Lỗi khi xóa bộ từ: ${error.message}`);
      return;
    }

    setDeleteSetModalOpen(false);
    navigate('/vocabulary');
  };

  const handleUpdateSet = async (e) => {
    e.preventDefault();
    setEditSetError('');

    if (!editSetName.trim()) {
      setEditSetError('Tên bộ từ không được để trống.');
      return;
    }
    if (editSetName.trim() === set.name) {
      setEditSetModalOpen(false);
      return;
    }

    const result = await updateSetDetails({ name: editSetName.trim() });

    if (result.error) {
      setEditSetError(result.error);
      return;
    }
    setEditSetModalOpen(false);
  };

  if (loading) {
    return <Spinner />;
  }

  if (error || !set) {
    return (
      <div className="py-10">
        <Alert type="error" message={error || 'Không tìm thấy bộ từ.'} />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/vocabulary')}>
            Quay lại bộ từ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/vocabulary"
            className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            <i className="bx bx-arrow-back text-lg"></i>
            <span>Quay lại danh sách bộ từ</span>
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">{set.name}</h1>
          <p className="mt-1 text-text-secondary">
            {words.length || 0} từ · Cập nhật{' '}
            {new Date(set.updated_at || set.created_at).toLocaleDateString('vi-VN')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openEditSetModal}>Chỉnh sửa</Button>
          <Button variant="secondary" size="sm">Nhập từ</Button>
          <Button variant="secondary" size="sm">Chia sẻ</Button>
          <Button variant="danger" size="sm" onClick={() => setDeleteSetModalOpen(true)}>Xóa bộ từ</Button>
        </div>
      </div>

      {deleteSetError && (
        <Alert
          type="error"
          message={deleteSetError}
          onClose={() => setDeleteSetError(null)}
          className="my-4"
        />
      )}

      {/* Tabs */}
      <div className="border-b border-border-color">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {['Từ vựng', 'Thống kê', 'Cài đặt'].map((tabName) => (
            <button
              key={tabName}
              onClick={() => setActiveTab(tabName.toLowerCase())}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === tabName.toLowerCase()
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-text-secondary hover:border-gray-300 hover:text-text-primary'
              }`}
            >
              {tabName}
            </button>
          ))}
        </nav>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-lg text-text-secondary"></i>
            <Input
              type="search"
              placeholder="Tìm kiếm trong bộ từ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Tìm kiếm từ"
              className="!pl-10"
            />
          </div>
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[{ value: 'all', label: 'Tất cả loại từ' }, ...WORD_TYPE_OPTIONS.slice(1)]}
            className="min-w-[160px]"
          />
          <Select
            value={cefrFilter}
            onChange={(e) => setCefrFilter(e.target.value)}
            options={[{ value: 'all', label: 'Tất cả CEFR' }, ...CEFR_OPTIONS.slice(1)]}
            className="min-w-[160px]"
          />
          <Select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            options={SORT_OPTIONS}
            className="min-w-[180px]"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate(`/learn/session/${setId}`)}>
            <i className="bx bx-brain text-lg"></i>
            <span>Học ngắt quãng</span>
          </Button>
          <Button
            onClick={() => navigate(`/practice/session?setIds=${setId}`)}
            className="inline-flex items-center gap-1.5"
          >
            <span>🎯 Học ngay</span>
            <span className="hidden sm:inline">(nhanh)</span>
          </Button>
        </div>
      </div>

      {/* Word Table */}
      <div className="overflow-x-auto rounded-lg border border-border-color bg-surface-default">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b border-border-color bg-surface-sidebar text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Từ vựng</th>
              <th className="px-4 py-3 font-medium">Nghĩa</th>
              <th className="px-4 py-3 font-medium">Loại từ</th>
              <th className="px-4 py-3 font-medium">CEFR</th>
              <th className="px-4 py-3 font-medium">Ví dụ</th>
              <th className="px-4 py-3 font-medium">Memory Clue</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-color">
            {displayedWords.length > 0 ? (
              displayedWords.map((word) => (
                <tr key={word.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => { try { ttsService.speak(word.word); } catch (e) {} }}
                        className="text-text-secondary hover:text-brand-primary"
                        aria-label="Phát âm từ"
                      >
                        <i className="bx bxs-volume-full text-lg"></i>
                      </button>
                      <div>
                        <div className="font-semibold text-text-primary">{word.word}</div>
                        {word.ipa && (
                          <div className="font-mono text-xs text-text-secondary">/{word.ipa}/</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="max-w-xs px-4 py-3 align-top text-text-primary">{word.meaning}</td>
                  <td className="px-4 py-3 align-top">
                    {word.word_type && (
                      <span className="whitespace-nowrap rounded bg-surface-hover px-2 py-1 text-xs font-medium uppercase text-text-secondary">
                        {word.word_type.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${cefrBadgeClass(word.cefr_level)}`}>
                      {cefrLabel(word.cefr_level)}
                    </span>
                  </td>
                  <td className="max-w-sm px-4 py-3 align-top text-text-secondary">
                    <p className="line-clamp-2">{word.example}</p>
                  </td>
                  <td className="max-w-sm px-4 py-3 align-top text-text-secondary">
                    {word.memory_clue ? (
                      <p className="line-clamp-2">{word.memory_clue}</p>
                    ) : (
                      <span className="text-text-secondary/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="relative inline-block">
                      <button
                        onClick={() => openEditModal(word)}
                        className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                        aria-label="Chỉnh sửa"
                      >
                        <i className="bx bx-edit-alt text-base"></i>
                      </button>
                      <button
                        onClick={() => openDeleteModal(word)}
                        className="rounded-md p-1.5 text-text-secondary hover:bg-surface-hover hover:text-red-400"
                        aria-label="Xóa"
                      >
                        <i className="bx bx-trash text-base"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7">
                  {searchTerm || typeFilter !== 'all' || cefrFilter !== 'all' ? (
                    <EmptyState
                      icon="🔍"
                      title="Không tìm thấy từ"
                      description="Không có từ nào khớp với tiêu chí tìm kiếm/lọc của bạn."
                    />
                  ) : (
                    <EmptyState
                      icon="📝"
                      title="Bộ từ này chưa có từ nào"
                      description="Hãy thêm từ đầu tiên để bắt đầu học."
                      action={
                        <Button onClick={openAddModal}>
                          <i className="bx bx-plus text-lg"></i>
                          <span>Thêm từ</span>
                        </Button>
                      }
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal thêm/sửa từ */}
      <Modal
        open={addEditModalOpen}
        onClose={() => setAddEditModalOpen(false)}
        title={isEditing ? 'Chỉnh sửa từ' : 'Thêm từ mới'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddEditModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="word-form" loading={mutationLoading}>
              {mutationLoading ? 'Đang lưu...' : (isEditing ? 'Lưu thay đổi' : 'Thêm từ')}
            </Button>
          </>
        }
      >
        <form id="word-form" onSubmit={handleAddEditWord} className="space-y-4">
          {formError && <Alert type="error" message={formError} />}
          <Input
            label="Từ tiếng Anh"
            name="word"
            value={formWord}
            onChange={(e) => setFormWord(e.target.value)}
            placeholder="Ví dụ: apple"
            autoFocus
          />
          <Input
            label="Phiên âm IPA"
            name="ipa"
            value={formIPA}
            onChange={(e) => setFormIPA(e.target.value)}
            placeholder="Ví dụ: /ˈæpəl/"
          />
          <Select
            label="Loại từ"
            name="word_type"
            value={formWordType}
            onChange={(e) => setFormWordType(e.target.value)}
            options={WORD_TYPE_OPTIONS}
          />
          <Textarea
            label="Nghĩa tiếng Việt"
            name="meaning"
            value={formMeaning}
            onChange={(e) => setFormMeaning(e.target.value)}
            placeholder="Ví dụ: quả táo"
            rows={2}
          />
          <Textarea
            label="Ví dụ"
            name="example"
            value={formExample}
            onChange={(e) => setFormExample(e.target.value)}
            placeholder="Ví dụ: She ate an apple."
            rows={2}
          />
          <Textarea
            label="Memory Clue"
            name="memory_clue"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Ví dụ: A common fruit that is typically red or green."
            rows={3}
          />
          <Select
            label="Cấp độ CEFR"
            name="cefr_level"
            value={formCEFR}
            onChange={(e) => setFormCEFR(e.target.value)}
            options={CEFR_OPTIONS}
          />
        </form>
      </Modal>

      {/* Modal xác nhận xóa từ */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Xóa từ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDeleteWord} loading={mutationLoading}>
              {mutationLoading ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Bạn có chắc muốn xóa từ{' '}
          <span className="font-semibold">"{deletingWord?.word}"</span> khỏi bộ từ này? Hành động
          này không thể hoàn tác.
        </p>
      </Modal>

      {/* Modal xác nhận xóa BỘ TỪ */}
      <Modal
        open={deleteSetModalOpen}
        onClose={() => setDeleteSetModalOpen(false)}
        title="Xóa bộ từ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteSetModalOpen(false)} disabled={deleteSetLoading}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDeleteSet} loading={deleteSetLoading}>
              {deleteSetLoading ? 'Đang xóa...' : 'Xác nhận xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Bạn có chắc chắn muốn xóa vĩnh viễn bộ từ{' '}
          <span className="font-semibold text-text-primary">"{set?.name}"</span>? Toàn bộ{' '}
          <span className="font-semibold text-text-primary">{words.length}</span> từ trong bộ này và
          tiến trình học của bạn sẽ bị mất.
          <br />
          <strong className="mt-2 block">Hành động này không thể hoàn tác.</strong>
        </p>
      </Modal>
      
      {/* Modal sửa bộ từ */}
      <Modal
        open={editSetModalOpen}
        onClose={() => setEditSetModalOpen(false)}
        title="Chỉnh sửa bộ từ"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditSetModalOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" form="edit-set-form" loading={mutationLoading}>
              {mutationLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </>
        }
      >
        <form id="edit-set-form" onSubmit={handleUpdateSet} className="space-y-4">
          {editSetError && <Alert type="error" message={editSetError} />}
          <Input
            label="Tên bộ từ"
            name="name"
            value={editSetName}
            onChange={(e) => setEditSetName(e.target.value)}
            placeholder="Ví dụ: English 101"
            autoFocus
          />
        </form>
      </Modal>
    </div>
  );
}
