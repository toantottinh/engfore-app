import React, { useState, useEffect, useCallback } from 'react';
import { getAdminAllSets, adminUpdateVocabularySet, deleteVocabularySet, getTopics } from '../../services/vocabulary.service';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';

const AdminSets = () => {
  const [sets, setSets] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentSet, setCurrentSet] = useState(null);
  const [formState, setFormState] = useState({ name: '', description: '', topic_id: '', status: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: setsData, error: setsError }, { data: topicsData, error: topicsError }] = await Promise.all([
        getAdminAllSets(),
        getTopics()
      ]);
      if (setsError) throw setsError;
      if (topicsError) throw topicsError;
      setSets(setsData || []);
      setTopics(topicsData || []);
    } catch (err) {
      setError('Failed to fetch data. ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openModal = (set) => {
    setCurrentSet(set);
    setFormState({
      name: set.name,
      description: set.description || '',
      topic_id: set.topic_id || '',
      status: set.status,
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentSet(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormState(prevState => ({ ...prevState, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formState.name) {
      setFormError('Set name is required.');
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    
    try {
      const { error } = await adminUpdateVocabularySet(currentSet.id, formState);
      if (error) throw error;
      closeModal();
      fetchData(); // Refresh list
    } catch (err) {
      setFormError('Failed to update set. ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (setId) => {
    if (!window.confirm('Are you sure you want to delete this set? This will also remove all words from it and cannot be undone.')) {
      return;
    }
    setError('');
    try {
      const { error } = await deleteVocabularySet(setId);
      if (error) throw error;
      fetchData(); // Refresh list
    } catch (err) {
      setError('Failed to delete set. ' + err.message);
    }
  };

  const renderModal = () => (
     <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 className="text-lg font-medium mb-4">Edit Vocabulary Set</h3>
          <form onSubmit={handleSubmit}>
            {formError && <Alert type="error" message={formError} className="mb-4" />}
            <div className="space-y-4">
               <div>
                  <label className="block text-sm font-medium text-zinc-700">Set Name</label>
                  <input type="text" name="name" value={formState.name} onChange={handleFormChange} required className="mt-1 block w-full rounded-md border-zinc-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
               </div>
               <div>
                  <label className="block text-sm font-medium text-zinc-700">Description</label>
                  <textarea name="description" value={formState.description} onChange={handleFormChange} rows={3} className="mt-1 block w-full rounded-md border-zinc-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"/>
               </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Topic</label>
                <select name="topic_id" value={formState.topic_id} onChange={handleFormChange} className="mt-1 block w-full rounded-md border-zinc-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  <option value="">-- No Topic --</option>
                  {topics.map(topic => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Status</label>
                <select name="status" value={formState.status} onChange={handleFormChange} className="mt-1 block w-full rounded-md border-zinc-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Set'}
              </Button>
            </div>
          </form>
        </div>
      </div>
  );

  if (loading) return <Spinner />;
  if (error) return <Alert type="error" message={error} />;

  return (
    <div>
      <h2 className="text-xl font-semibold text-zinc-800 mb-4">Manage Sets</h2>
      {isModalOpen && renderModal()}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Words</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {sets.map(set => (
              <tr key={set.id}>
                <td className="px-4 py-3 font-medium text-zinc-800">{set.name}</td>
                <td className="px-4 py-3 text-zinc-600">{set.owner_username}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${set.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {set.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-600">{set.word_count}</td>
                <td className="px-4 py-3">
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openModal(set)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(set.id)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminSets;
