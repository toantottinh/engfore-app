import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStructures } from '../../hooks/useStructures.js';
import { useAuth } from '../../hooks/useAuth.jsx';
import { deleteStructure } from '../../services/structure.service.js';
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

function StructureCard({ s, onDelete }) {
  const { key, label } = deriveStructureStatus(s.user_structures || null);
  const hasProgress = Boolean(s.user_structures);
  const mastery = s.user_structures?.mastery_level;

  return (
    <div className="flex flex-col rounded-xl border border-border-color bg-surface-sidebar p-5 transition-shadow hover:shadow-lg">
      {/* Toàn bộ nội dung chính vẫn điều hướng tới trang detail */}
      <Link to={`/structures/${s.id}`} className="block">
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

      {/* Hành động quản trị (chỉ admin — backend RLS vẫn là lớp bảo mật chính) */}
      {onDelete && (
        <div className="mt-3 flex justify-end border-t border-border-color/60 pt-2">
          <button
            type="button"
            onClick={() => onDelete(s)}
            className="rounded-md px-2 py-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title={`Xóa cấu trúc ${s.pattern}`}
            aria-label={`Xóa cấu trúc ${s.pattern}`}
          >
            Xóa
          </button>
        </div>
      )}
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

  // ---- Xóa cấu trúc ----
  // deleteTarget: structure đang chờ xác nhận (KHÔNG xóa ngay khi bấm nút).
  // deleting: cờ double-submit guard — chặn double click tạo 2 request.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const openDeleteModal = (s) => {
    setSuccessMsg('');
    setDeleteError('');
    setDeleteTarget(s);
  };

  const closeDeleteModal = () => {
    if (deleting) return; // đang xử lý -> không cho đóng giữa chừng
    setDeleteTarget(null);
    setDeleteError('');
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return; // chặn double click / double submit
    setDeleting(true);
    setDeleteError('');

    const { id, pattern } = deleteTarget;
    let result;
    try {
      result = await deleteStructure(id);
    } catch (e) {
      // Phòng thủ: service về nguyên tắc không throw, nhưng không được âm thầm
      // bỏ qua lỗi nếu có exception thoát ra.
      result = { data: null, error: e };
    }
    const deleteErr = result?.error;

    if (deleteErr) {
      // KHÔNG silent failure — hiển thị nguyên nhân cụ thể nếu backend trả về.
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

    setDeleting(false);
    setDeleteTarget(null);
    setSuccessMsg(`Đã xóa cấu trúc "${pattern}".`);
    await load(); // cập nhật danh sách ngay sau khi xóa thành công
  };

  const topics = useMemo(() => distinctStructureTopics(structures), [structures]);
  // Counters tính trên TOÀN BỘ danh sách (KHÔNG bị filter làm sai)
  // — mục 7/16: filter không được làm sai counters.
  const counts = useMemo(() => countStructureStates(structures), [structures]);

  const filtered = useMemo(
    () => filterStructures(structures, { search, cefr, topic, status }),
    [structures, search, cefr, topic, status]
  );

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

        {/* Admin-only entry points — điều hướng tới trang import hiện có
            (cùng pattern với Vocabulary: /vocabulary -> /vocabulary/import).
            Backend RPC guards vẫn là lớp bảo mật cuối cùng. */}
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link to="/structures/import">
              <Button variant="secondary">Nhập kiến thức</Button>
            </Link>
            <Link to="/structures/exercises/import">
              <Button variant="secondary">Nhập bài tập</Button>
            </Link>
          </div>
        )}
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
              // Chỉ admin thấy nút Xóa (backend RLS vẫn là lớp bảo mật chính).
              onDelete={isAdmin ? openDeleteModal : undefined}
            />
          ))}
        </div>
      )}

      {/* Confirmation modal — KHÔNG xóa ngay khi bấm nút Xóa trên card */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={closeDeleteModal}
        title="Xóa cấu trúc"
        footer={
          <>
            <Button variant="secondary" onClick={closeDeleteModal} disabled={deleting}>
              Hủy
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete} loading={deleting}>
              Xóa
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="space-y-3">
            <p className="text-sm text-text-primary">Bạn có chắc muốn xóa cấu trúc này?</p>
            <p className="rounded-lg bg-surface-hover px-3 py-2 text-base font-bold text-text-primary">
              {deleteTarget.pattern}
            </p>
            {(deleteTarget.exercise_count > 0 || deleteTarget.user_structures) && (
              <p className="text-xs text-text-secondary">
                Cấu trúc này đang có dữ liệu sử dụng
                {deleteTarget.exercise_count > 0
                  ? ` (${deleteTarget.exercise_count} bài tập)`
                  : ''}
                {deleteTarget.user_structures ? ' và tiến độ học của bạn' : ''}.
              </p>
            )}
            <p className="text-sm text-text-secondary">
              Nếu cấu trúc có bài tập hoặc dữ liệu học tập, các dữ liệu liên quan sẽ được xử lý
              theo quy tắc an toàn của hệ thống.
            </p>
            {deleteError && <Alert type="error" message={deleteError} />}
          </div>
        )}
      </Modal>
    </div>
  );
}