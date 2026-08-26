import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStructures } from '../../hooks/useStructures.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { deleteStructures } from '../../services/structure.service.js';
import { CEFR_LEVELS } from '../../utils/cefr.js';
import {
  deriveStructureStatus,
  countStructureStates,
  filterStructures,
  distinctStructureTopics,
} from '../../utils/structure-status.js';
import Spinner from '../../components/ui/Spinner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import StatusCounts from '../../components/ui/StatusCounts.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';

// Emoji trạng thái theo spec (🟢/🔴/🟡).
const STATUS_EMOJI = { new: '🟢', again: '🔴', review: '🟡' };

function StructureCard({ s, selectable, checked, onToggle }) {
  const { key, label } = deriveStructureStatus(s.user_structures || null);
  const hasProgress = Boolean(s.user_structures);
  const mastery = s.user_structures?.mastery_level;

  return (
    <div className="flex gap-3 rounded-xl border border-border-color bg-surface-sidebar p-5 transition-shadow hover:shadow-lg">
      {/* Checkbox chọn để xóa hàng loạt (chỉ render khi selectable=admin).
          Đặt NGOÀI Link + stopPropagation: tick checkbox KHÔNG mở detail. */}
      {selectable && (
        <label
          className="flex shrink-0 cursor-pointer items-start pt-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(s.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            aria-label={`Chọn cấu trúc ${s.pattern}`}
          />
        </label>
      )}

      {/* Nội dung chính điều hướng tới trang detail */}
      <Link to={`/structures/${s.id}`} className="block min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-text-primary">{s.pattern}</h3>
            <p className="mt-1 text-sm text-text-secondary">{s.meaning}</p>
          </div>
          <span className="whitespace-nowrap text-sm text-text-secondary">
            {STATUS_EMOJI[key]} {label}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary">
            {s.cefr || '—'}
          </span>
          {s.topic && (
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-text-secondary">
              {s.topic}
            </span>
          )}
          <span className="text-text-secondary/70">{s.example_count} ví dụ</span>
          {hasProgress && mastery > 0 && (
            <span className="text-text-secondary/70">Phản xạ {mastery}/5</span>
          )}
        </div>
      </Link>
    </div>
  );
}

export default function Structures() {
  const { structures, loading, error, load } = useStructures();
  // Admin-only entry points (backend RPC guards remain authoritative).
  const { isAdmin } = useAuth();

  const [search, setSearch] = useState('');
  const [cefr, setCefr] = useState('');
  const [topic, setTopic] = useState('');
  const [status, setStatus] = useState('all');

  // ---- Chọn & xóa NHIỀU cấu trúc ----
  // selectedIds : các id đang được tick checkbox.
  // confirmOpen : confirmation modal đang mở? (KHÔNG xóa ngay khi tick/bấm)
  // deleting    : double-submit guard — chặn double click tạo 2 request.
  const [selectedIds, setSelectedIds] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const toggleSelect = (id) => {
    setSuccessMsg('');
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const openBulkDeleteModal = () => {
    if (selectedIds.length === 0 || deleting) return;
    setSuccessMsg('');
    setDeleteError('');
    setConfirmOpen(true);
  };

  const closeBulkDeleteModal = () => {
    if (deleting) return; // đang xử lý -> không cho đóng giữa chừng
    setConfirmOpen(false);
    setDeleteError('');
    // GIỮ selection khi đóng modal (kể cả sau lỗi) để user thử lại.
  };

  const handleConfirmDelete = async () => {
    if (selectedIds.length === 0 || deleting) return; // chặn double submit
    setDeleting(true);
    setDeleteError('');

    let result;
    try {
      // MỘT request duy nhất cho toàn bộ selection (bulk .in(...)).
      result = await deleteStructures(selectedIds);
    } catch (e) {
      // Phòng thủ: service về nguyên tắc không throw, nhưng không được âm thầm
      // bỏ qua lỗi nếu có exception thoát ra.
      result = { data: null, error: e };
    }
    const deleteErr = result?.error;

    if (deleteErr) {
      // KHÔNG silent failure — hiển thị nguyên nhân cụ thể nếu backend trả về,
      // GIỮ nguyên selection để user sửa/trả lời rồi thử lại.
      if (import.meta.env.DEV) {
        console.error('[Structures] Xóa cấu trúc thất bại:', deleteErr);
      }
      setDeleting(false);
      setDeleteError(
        deleteErr?.message
          ? `Không thể xóa cấu trúc. ${deleteErr.message}`
          : 'Không thể xóa cấu trúc. Vui lòng thử lại.'
      );
      return;
    }

    const deletedCount = selectedIds.length;
    setDeleting(false);
    setConfirmOpen(false);
    setSelectedIds([]); // clear selection sau khi xóa thành công
    setSuccessMsg(`Đã xóa ${deletedCount} cấu trúc.`);
    await load(); // reload danh sách ngay sau khi xóa thành công
  };

  const topics = useMemo(() => distinctStructureTopics(structures), [structures]);
  // Counters tính trên TOÀN BỘ danh sách (KHÔNG bị filter làm sai)
  // — mục 7/16: filter không được làm sai counters.
  const counts = useMemo(() => countStructureStates(structures), [structures]);

  const filtered = useMemo(
    () => filterStructures(structures, { search, cefr, topic, status }),
    [structures, search, cefr, topic, status]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    setSuccessMsg('');
    if (allFilteredSelected) {
      // Bỏ chọn các item đang hiển thị (giữ selection ngoài filter nếu có).
      setSelectedIds((prev) =>
        prev.filter((id) => !filtered.some((s) => s.id === id))
      );
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...filtered.map((s) => s.id)])]);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6">
        <Alert type="error" message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text-primary">Cấu trúc câu</h1>

        {/* Entry points:
            - "Nhập bài tập": MỌI user đăng nhập — authoring nội dung học tập
              trên shared bank (backend RPC/RLS guard: authenticated).
            - "Nhập kiến thức": tạo global structure mới -> admin-only. */}
        <div className="flex items-center gap-2">
          <Link to="/structures/exercises/import">
            <Button variant="secondary">Nhập bài tập</Button>
          </Link>
          {isAdmin && (
            <Link to="/structures/import">
              <Button variant="secondary">Nhập kiến thức</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Thông báo thành công sau khi xóa cấu trúc */}
      {successMsg && <Alert type="success" message={successMsg} />}

      {/* Counters */}
      {structures.length > 0 && <StatusCounts counts={counts} />}

      {/* Search + Filters */}
      <div className="rounded-xl border border-border-color bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs text-text-secondary">Tìm kiếm</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="pattern, nghĩa hoặc chủ đề..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">CEFR</label>
            <select
              value={cefr}
              onChange={(e) => setCefr(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Tất cả CEFR</option>
              {CEFR_LEVELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Chủ đề</label>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Tất cả chủ đề</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-secondary">Trạng thái</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="new">🟢 Mới</option>
              <option value="learning">🔴 Đang học</option>
              <option value="review">🟡 Ôn</option>
            </select>
          </div>
        </div>
      </div>

      {/* Toolbar chọn/xóa hàng loạt — chỉ admin (global content management;
          backend RLS vẫn là lớp bảo mật chính). Nút xóa disabled khi chưa chọn. */}
      {isAdmin && structures.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-color bg-surface p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={toggleSelectAll}>
              {allFilteredSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
            </Button>
            <span className="text-xs text-text-secondary">
              Đã chọn {selectedIds.length}/{structures.length}
            </span>
          </div>
          <Button
            variant="danger"
            size="sm"
            disabled={selectedIds.length === 0}
            onClick={openBulkDeleteModal}
            title={
              selectedIds.length === 0 ? 'Hãy chọn ít nhất một cấu trúc.' : undefined
            }
          >
            {selectedIds.length > 0
              ? `Xóa ${selectedIds.length} cấu trúc`
              : 'Xóa cấu trúc đã chọn'}
          </Button>
        </div>
      )}

      {/* Danh sách */}
      {structures.length === 0 ? (
        <EmptyState
          icon="🧩"
          title="Chưa có cấu trúc câu."
          description="Quản trị viên sẽ thêm các cấu trúc câu để bạn bắt đầu học."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Không tìm thấy cấu trúc phù hợp."
          description="Thử đổi từ khóa hoặc bộ lọc."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => (
            <StructureCard
              key={s.id}
              s={s}
              selectable={isAdmin}
              checked={selectedIds.includes(s.id)}
              onToggle={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Confirmation modal — KHÔNG xóa ngay khi bấm nút trên toolbar */}
      <Modal
        open={confirmOpen}
        onClose={closeBulkDeleteModal}
        title="Xóa cấu trúc"
        footer={
          <>
            <Button variant="secondary" onClick={closeBulkDeleteModal} disabled={deleting}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} loading={deleting}>
              Xóa
            </Button>
          </>
        }
      >
        {selectedIds.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-text-primary">
              Bạn có chắc muốn xóa các cấu trúc đã chọn?
            </p>
            <p className="text-sm font-medium text-text-primary">
              Bạn đang chọn {selectedIds.length} cấu trúc:
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-surface-hover px-3 py-2 text-sm text-text-primary">
              {structures
                .filter((s) => selectedIds.includes(s.id))
                .map((s) => (
                  <li key={s.id} className="font-medium">
                    • {s.pattern}
                  </li>
                ))}
            </ul>
            <p className="text-sm text-text-secondary">
              Thao tác này sẽ xóa các cấu trúc đã chọn cùng các dữ liệu phụ thuộc của chúng theo
              quy tắc an toàn của hệ thống.
            </p>
            {deleteError && <Alert type="error" message={deleteError} />}
          </div>
        )}
      </Modal>
    </div>
  );
}