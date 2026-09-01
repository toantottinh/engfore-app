import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Select from '../../components/ui/Select.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useVocabularyDetail } from '../../hooks/useVocabularyDetail.js';
import { adminUpdateWord } from '../../services/vocabulary.service.js';
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
];

export default function VocabularyDetail() {
  const { setId } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();

  const {
    set,
    words,
    loading,
    error,
    mutationLoading,
    addWord,
    removeWordFromSet,
    deleteSystemWord,
    updateSetDetails,
  } = useVocabularyDetail(setId);

  const [searchTerm, setSearchTerm] = useState('');
  const [addEditModalOpen, setAddEditModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, word: null, type: 'remove' });
  const [deleteSetModalOpen, setDeleteSetModalOpen] = useState(false);
  const [deleteSetLoading, setDeleteSetLoading] = useState(false);
  const [deleteSetError, setDeleteSetError] = useState(null);
  const [formError, setFormError] = useState('');
  
  const [editSetModalOpen, setEditSetModalOpen] = useState(false);
  const [editSetName, setEditSetName] = useState('');
  const [editSetError, setEditSetError] = useState('');

  const [cefrFilter, setCefrFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('default');

  const [isEditing, setIsEditing] = useState(false);
  const [currentWord, setCurrentWord] = useState(null);
  const [formState, setFormState] = useState({
    word: '', ipa: '', word_type: '', meaning: '', example: '', memory_clue: '', cefr_level: ''
  });

  const isPublicSet = set && !set.user_id;

  const displayedWords = useMemo(() => {
    let filtered = [...words];
    if (searchTerm.trim()) {
      const lower = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(w => w.word.toLowerCase().includes(lower) || w.meaning.toLowerCase().includes(lower));
    }
    if (typeFilter !== 'all') filtered = filtered.filter(w => w.word_type === typeFilter);
    if (cefrFilter !== 'all') filtered = filtered.filter(w => w.cefr_level === cefrFilter);
    if (sortOrder === 'az') filtered.sort((a, b) => a.word.localeCompare(b.word));
    if (sortOrder === 'za') filtered.sort((a, b) => b.word.localeCompare(a.word));
    return filtered;
  }, [words, searchTerm, typeFilter, cefrFilter, sortOrder]);

  const resetForm = () => {
    setFormState({ word: '', ipa: '', word_type: '', meaning: '', example: '', memory_clue: '', cefr_level: '' });
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
    setFormState({
      word: word.word,
      ipa: word.ipa || '',
      word_type: word.word_type || '',
      meaning: word.meaning,
      example: word.example || '',
      memory_clue: word.memory_clue || '',
      cefr_level: word.cefr_level || '',
    });
    setAddEditModalOpen(true);
  };
  
  const openDeleteModal = (word) => {
    if (isAdmin && isPublicSet) {
      setDeleteModal({ isOpen: true, word, type: 'remove' }); // Default to remove, let admin choose
    } else {
      setDeleteModal({ isOpen: true, word, type: 'remove' });
    }
  };

  const closeDeleteModal = () => setDeleteModal({ isOpen: false, word: null, type: 'remove' });

  const handleAddEditWord = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!formState.word.trim() || !formState.meaning.trim()) {
      setFormError('Word and Meaning are required.');
      return;
    }

    if (isEditing && currentWord) {
      if (!isAdmin) {
        setFormError("You don't have permission to edit this word.");
        return;
      }
      const { error } = await adminUpdateWord(currentWord.word_id, currentWord.id, formState);
      if (error) { setFormError(getAuthErrorMessage(error)); return; }
    } else {
      const { error } = await addWord(formState);
      if (error) { setFormError(error); return; }
    }

    setAddEditModalOpen(false);
    resetForm();
  };

  const handleDeleteWord = async () => {
    const { word, type } = deleteModal;
    if (!word) return;

    let result;
    if (type === 'system') {
      result = await deleteSystemWord(word.word_id);
    } else {
      result = await removeWordFromSet(word.id);
    }

    if (result.error) {
      setFormError(result.error);
    }
    closeDeleteModal();
  };

  const handleDeleteSet = async () => {
    setDeleteSetError(null);
    setDeleteSetLoading(true);
    // This should probably be in the hook, but for now we call service directly
    const { error } = await deleteVocabularySet(setId);
    setDeleteSetLoading(false);
    if (error) { setDeleteSetError(`Error deleting set: ${error.message}`); return; }
    setDeleteSetModalOpen(false);
    navigate('/vocabulary');
  };

  const handleUpdateSet = async (e) => {
    e.preventDefault();
    setEditSetError('');
    if (!editSetName.trim()) {
      setEditSetError('Set name cannot be empty.');
      return;
    }
    if (editSetName.trim() === set.name) {
      setEditSetModalOpen(false);
      return;
    }
    const result = await updateSetDetails({ name: editSetName.trim() });
    if (result.error) { setEditSetError(result.error); return; }
    setEditSetModalOpen(false);
  };
  
  if (loading) return <Spinner />;
  if (error || !set) {
    return (
      <div className="py-10">
        <Alert type="error" message={error || 'Set not found.'} />
        <div className="mt-4"><Button variant="secondary" onClick={() => navigate('/vocabulary')}>Back to sets</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/vocabulary" className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary">
            <i className="bx bx-arrow-back text-lg"></i><span>Back to sets</span>
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">{set.name}</h1>
          <p className="mt-1 text-text-secondary">{words.length || 0} words</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && <Button variant="secondary" size="sm" onClick={() => navigate('/admin/sets')}>Manage Sets</Button>}
          <Button variant="danger" size="sm" onClick={() => setDeleteSetModalOpen(true)}>Delete Set</Button>
        </div>
      </div>
      
      {/* Toolbar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
         <div className="relative flex-1">
            <i className="bx bx-search absolute left-3 top-1/2 -translate-y-1/2 text-lg text-text-secondary"></i>
            <Input type="search" placeholder="Search in set..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="!pl-10" />
          </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => navigate(`/practice/session?setIds=${setId}`)}>Practice</Button>
          <Button onClick={openAddModal}>Add Word</Button>
        </div>
      </div>

      {/* Word Table */}
      <div className="overflow-x-auto rounded-lg border border-border-color bg-surface-default">
        <table className="w-full min-w-[800px] text-left text-sm">
          {/* ... table head ... */}
          <thead className="border-b border-border-color bg-surface-sidebar text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 font-medium">Vocabulary</th>
              <th className="px-4 py-3 font-medium">Meaning</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">CEFR</th>
              <th className="px-4 py-3 font-medium">Example</th>
              <th className="px-4 py-3 font-medium">Memory Clue</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-color">
            {displayedWords.map((word) => (
              <tr key={word.id} className="hover:bg-surface-hover">
                <td className="px-4 py-3 align-top">
                  <div className="font-semibold text-text-primary">{word.word}</div>
                  {word.ipa && <div className="font-mono text-xs text-text-secondary">/{word.ipa}/</div>}
                </td>
                <td className="max-w-xs px-4 py-3 align-top text-text-primary">{word.meaning}</td>
                <td className="px-4 py-3 align-top"><span className="whitespace-nowrap rounded bg-surface-hover px-2 py-1 text-xs font-medium uppercase text-text-secondary">{word.word_type.replace(/_/g, ' ')}</span></td>
                <td className="px-4 py-3 align-top"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${cefrBadgeClass(word.cefr_level)}`}>{cefrLabel(word.cefr_level)}</span></td>
                <td className="max-w-xs px-4 py-3 align-top text-text-secondary">{word.example || '—'}</td>
                <td className="max-w-xs px-4 py-3 align-top text-text-secondary">{word.memory_clue || '—'}</td>
                <td className="px-4 py-3 align-top text-right">
                  <div className="relative inline-block">
                    {isAdmin && <button onClick={() => openEditModal(word)} className="rounded-md p-1.5 text-text-secondary hover:text-text-primary"><i className="bx bx-edit-alt text-base"></i></button>}
                    <button onClick={() => openDeleteModal(word)} className="rounded-md p-1.5 text-text-secondary hover:text-red-400"><i className="bx bx-trash text-base"></i></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {addEditModalOpen && <Modal open={addEditModalOpen} onClose={() => setAddEditModalOpen(false)} title={isEditing ? 'Edit Word' : 'Add New Word'} footer={<><Button variant="ghost" onClick={() => setAddEditModalOpen(false)}>Cancel</Button><Button type="submit" form="word-form" loading={mutationLoading}>Save</Button></>}>
        <form id="word-form" onSubmit={handleAddEditWord} className="space-y-4">
          {formError && <Alert type="error" message={formError} />}
          <Input label="Word" name="word" value={formState.word} onChange={(e) => setFormState({...formState, word: e.target.value})} required />
          <Input label="IPA" name="ipa" value={formState.ipa} onChange={(e) => setFormState({...formState, ipa: e.target.value})} />
          <Select label="Type" name="word_type" value={formState.word_type} onChange={(e) => setFormState({...formState, word_type: e.target.value})} options={WORD_TYPE_OPTIONS} />
          <Textarea label="Meaning" name="meaning" value={formState.meaning} onChange={(e) => setFormState({...formState, meaning: e.target.value})} required />
          <Textarea label="Example" name="example" value={formState.example} onChange={(e) => setFormState({...formState, example: e.target.value})} />
          <Textarea label="Memory Clue" name="memory_clue" value={formState.memory_clue} onChange={(e) => setFormState({...formState, memory_clue: e.target.value})} />
          <Select label="CEFR" name="cefr_level" value={formState.cefr_level} onChange={(e) => setFormState({...formState, cefr_level: e.target.value})} options={CEFR_OPTIONS} />
        </form>
      </Modal>}

      {/* Delete Modal */}
      {deleteModal.isOpen && <Modal open={deleteModal.isOpen} onClose={closeDeleteModal} title="Delete Word" footer={<><Button variant="ghost" onClick={closeDeleteModal}>Cancel</Button><Button variant="danger" onClick={handleDeleteWord} loading={mutationLoading}>Confirm</Button></>}>
        <p>Are you sure you want to delete "{deleteModal.word?.word}"?</p>
        {isAdmin && isPublicSet && (
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2"><input type="radio" name="deleteType" value="remove" checked={deleteModal.type === 'remove'} onChange={() => setDeleteModal(d => ({...d, type: 'remove'}))} /> Remove from this set only</label>
            <label className="flex items-center gap-2"><input type="radio" name="deleteType" value="system" checked={deleteModal.type === 'system'} onChange={() => setDeleteModal(d => ({...d, type: 'system'}))} /> <span className="font-bold text-red-600">Delete from system (permanent)</span></label>
          </div>
        )}
      </Modal>}
      
    </div>
  );
}
