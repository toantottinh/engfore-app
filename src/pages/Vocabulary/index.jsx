import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Alert from '../../components/ui/Alert.jsx';

export default function Vocabulary() {
  const { sets, loading, error, createSet, updateSet, removeSet, mutationLoading } =
    useVocabulary();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState('');

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editingSet, setEditingSet] = useState(null);
  const [deletingSet, setDeletingSet] = useState(null);

  const filteredSets = sets.filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase())
  );

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

  const formatDate = (iso) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Từ vựng</h1>
          <p className="mt-1 text-sm text-zinc-500">Quản lý các bộ từ vựng của bạn.</p>
        </div>
        <Button onClick={openCreate} size="md">
          <span aria-hidden="true">+</span> Tạo bộ từ
        </Button>
      </div>

      <div className="mb-6">
        <Input
          type="search"
          placeholder="Tìm kiếm bộ từ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm kiếm bộ từ"
        />
      </div>

      {error && <Alert type="error" message={error} className="mb-4" />}

      {loading ? (
        <Spinner />
      ) : filteredSets.length === 0 ? (
        search ? (
          <EmptyState
            title="Không tìm thấy bộ từ"
            description="Không có bộ từ nào khớp với từ khóa tìm kiếm của bạn."
          />
        ) : (
          <EmptyState
            title="Bạn chưa có bộ từ vựng nào"
            description="Hãy tạo bộ từ đầu tiên để bắt đầu học từ vựng."
            action={
              <Button onClick={openCreate}>
                <span aria-hidden="true">+</span> Tạo bộ từ đầu tiên
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSets.map((set) => (
            <div
              key={set.id}
              className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/vocabulary/${set.id}`}
                  className="min-w-0 flex-1 text-lg font-semibold text-zinc-900 hover:text-indigo-600"
                >
                  {set.name}
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEdit(set)}
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                    title="Chỉnh sửa"
                    aria-label={`Chỉnh sửa ${set.name}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => openDelete(set)}
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                    title="Xóa"
                    aria-label={`Xóa ${set.name}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                    </svg>
                  </button>
                </div>
              </div>

              {set.description && (
                <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{set.description}</p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                <span>{set.word_count || 0} từ</span>
                <span>Tạo: {formatDate(set.created_at)}</span>
              </div>

              <div className="mt-3 flex gap-2">
                <Link
                  to={`/vocabulary/${set.id}`}
                  className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Mở
                </Link>
                <Link
                  to={`/practice/typing/${set.id}`}
                  className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Học
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal tạo bộ từ */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tạo bộ từ mới"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
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
            label="Tên bộ từ *"
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
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
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
            label="Tên bộ từ *"
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
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={mutationLoading}>
              {mutationLoading ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-700">
          Bạn có chắc muốn xóa bộ từ{' '}
          <span className="font-semibold">"{deletingSet?.name}"</span>? Hành động này không thể
          hoàn tác.
        </p>
      </Modal>
    </div>
  );
}
