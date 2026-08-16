import React, { useState, useEffect, useCallback } from 'react';
import { getTopics, createTopic, updateTopic, deleteTopic } from '../../services/vocabulary.service';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import Modal from '../../components/ui/Modal'; 
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const AdminTopics = () => {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTopic, setCurrentTopic] = useState(null); // null for new, object for editing
  const [formState, setFormState] = useState({ name: '', cefr_level: '', description: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTopics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await getTopics();
      if (error) throw error;
      setTopics(data || []);
    } catch (err) {
      setError('Failed to fetch topics. ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const openModal = (topic = null) => {
    setCurrentTopic(topic);
    if (topic) {
      setFormState({
        name: topic.name,
        cefr_level: topic.cefr_level || '',
        description: topic.description || '',
      });
    } else {
      setFormState({ name: '', cefr_level: 'A1', description: '' });
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentTopic(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormState(prevState => ({ ...prevState, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formState.name) {
      setFormError('Topic name is required.');
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    
    try {
      if (currentTopic) {
        // Update
        const { error } = await updateTopic(currentTopic.id, formState);
        if (error) throw error;
      } else {
        // Create
        const { error } = await createTopic(formState);
        if (error) throw error;
      }
      closeModal();
      fetchTopics(); // Refresh list
    } catch (err) {
      setFormError('Failed to save topic. ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (topicId) => {
    if (!window.confirm('Are you sure you want to delete this topic? This cannot be undone.')) {
      return;
    }
    setError('');
    try {
      const { error } = await deleteTopic(topicId);
      if (error) throw error;
      fetchTopics(); // Refresh list
    } catch (err) {
      setError('Failed to delete topic. ' + err.message);
    }
  };
  
  // A simple modal component needs to be created or exist at ../../components/ui/Modal
  // Assuming a basic one exists for now.
  const renderModal = () => (
     <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <h3 className="text-lg font-medium mb-4">{currentTopic ? 'Edit Topic' : 'Create New Topic'}</h3>
          <form onSubmit={handleSubmit}>
            {formError && <Alert type="error" message={formError} className="mb-4" />}
            <div className="space-y-4">
              <Input
                label="Topic Name"
                name="name"
                value={formState.name}
                onChange={handleFormChange}
                required
              />
              <div>
                <label className="block text-sm font-medium text-zinc-700">CEFR Level</label>
                <select
                  name="cefr_level"
                  value={formState.cefr_level}
                  onChange={handleFormChange}
                  className="mt-1 block w-full rounded-md border-zinc-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  {CEFR_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>
              <Textarea
                label="Description"
                name="description"
                value={formState.description}
                onChange={handleFormChange}
                rows={3}
              />
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Topic'}
              </Button>
            </div>
          </form>
        </div>
      </div>
  );

  if (loading) {
    return <Spinner />;
  }
  
  if (error) {
    return <Alert type="error" message={error} />;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-zinc-800">Manage Topics</h2>
        <Button onClick={() => openModal()}>Create Topic</Button>
      </div>

      {isModalOpen && renderModal()}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">CEFR</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {topics.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-6 text-center text-zinc-500">No topics found.</td>
              </tr>
            ) : (
              topics.map(topic => (
                <tr key={topic.id}>
                  <td className="px-4 py-3 font-medium text-zinc-800">{topic.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{topic.cefr_level}</td>
                  <td className="px-4 py-3 text-zinc-600 truncate max-w-xs">{topic.description}</td>
                  <td className="px-4 py-3">
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openModal(topic)}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(topic.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminTopics;
