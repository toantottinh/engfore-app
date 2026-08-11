import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useVocabulary } from '../../hooks/useVocabulary.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Textarea from '../../components/ui/Textarea.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';

export default function Vocabulary() {
  const { sets, loading, error, createSet, updateSet, removeSet, mutationLoading } =
    useVocabulary();

  const [searchTerm, setSearchTerm] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState('');

  // State cho các form
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [editingSet, setEditingSet] = useState(null);
  const [deletingSet, setDeletingSet] = useState(null);

  const filteredSets = useMemo(() => {
    if (!searchTerm.trim()) return sets;
    const lowercasedFilter = searchTerm.trim().toLowerCase();
    return sets.filter(
      (set) =>
        set.name.toLowerCase().includes(lowercasedFilter) ||
        (set.description || '').toLowerCase().includes(lowercasedFilter)
    );
  }, [sets, searchTerm]);

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
          <h3 className="flex-1 pr-2 font-semibold text-text-primary">{set.name}</h3>
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
            to={`/practice/flashcard/${set.id}`}
            className="flex-1 rounded-lg bg-brand-primary px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-brand-primary/80"
          >
            Bắt đầu học
          </Link>
        </div>
      </div>
    );
  };

  // Component con cho các trạng thái đặc biệt
  const EmptyState = ({ icon, title, description, action }) => (
    <div className="col-span-full flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-color bg-surface-sidebar/50 py-20 text-center">
      <span className="text-5xl" aria-hidden="true">{icon}</span>
      <h3 className="mt-4 text-lg font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-text-secondary">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Bộ từ</h1>
          <p className="mt-1 text-text-secondary">Quản lý các bộ từ vựng của bạn.</p>
        </div>
        <Button onClick={openCreate}>
          <i className="bx bx-plus text-lg"></i>
          <span>Tạo bộ từ</span>
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

      {error && <Alert type="error" message={error} className="mb-4" />}

      {loading ? (
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
    </div>
  );
}
