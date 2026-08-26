import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Structures from '../pages/Structures/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// Tests cho chức năng XÓA CẤU TRÚC trong trang /structures:
//   - Chỉ admin thấy nút Xóa (UI gate; backend RLS là lớp bảo mật chính).
//   - Bấm Xóa KHÔNG xóa ngay -> confirmation modal hiển thị đúng structure.
//   - Hủy -> không gọi service. Xác nhận -> gọi service ĐÚNG 1 lần với id.
//   - Success -> message + danh sách được tải lại. Failure -> báo lỗi rõ ràng.
//   - Double click / double submit chỉ tạo MỘT request.
// ------------------------------------------------------------------

const getStructuresForUserMock = vi.fn();
const deleteStructureMock = vi.fn();
const ensureProfileMock = vi.fn(async () => ({ data: null, error: null }));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: (...args) => ensureProfileMock(...args),
  },
}));

vi.mock('../services/structure.service.js', () => ({
  getStructuresForUser: (...args) => getStructuresForUserMock(...args),
  deleteStructure: (...args) => deleteStructureMock(...args),
}));

const USER = { id: 'user-1', email: 'admin@example.com' };

const STRUCTURES = [
  {
    id: 's1',
    pattern: 'I want to + V',
    meaning: 'Tôi muốn...',
    cefr: 'A1',
    topic: 'Daily Life',
    example_count: 3,
    exercise_count: 5,
    user_structures: { state: 'learning', mastery_level: 2 },
  },
  {
    id: 's2',
    pattern: 'There is / There are',
    meaning: 'Có...',
    cefr: 'B1',
    topic: 'Home',
    example_count: 2,
    exercise_count: 0,
    user_structures: null,
  },
];

function mountPage() {
  return render(
    <MemoryRouter initialEntries={['/structures']}>
      <AuthProvider initialUser={USER}>
        <Routes>
          <Route path="/structures" element={<Structures />} />
          <Route path="/structures/:structureId" element={<div>DETAIL PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function mountAsAdmin() {
  ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role: 'admin' }, error: null });
  getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
  mountPage();
  await screen.findByText('I want to + V');
}

describe('Structures — nút Xóa & authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('non-admin KHÔNG thấy nút Xóa (chỉ admin quản lý content)', async () => {
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountPage();
    await screen.findByText('I want to + V');
    expect(screen.queryByRole('button', { name: /Xóa cấu trúc/ })).toBeNull();
  });

  it('admin THẤY nút Xóa trên từng structure card', async () => {
    await mountAsAdmin();
    expect(screen.getByRole('button', { name: 'Xóa cấu trúc I want to + V' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Xóa cấu trúc There is / There are' })).toBeTruthy();
  });
});

describe('Structures — confirmation modal & delete flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role: 'admin' }, error: null });
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    deleteStructureMock.mockResolvedValue({ data: [{ id: 's1' }], error: null });
  });
  afterEach(() => cleanup());

  it('bấm Xóa -> mở modal xác nhận, CHƯA gọi service', async () => {
    const user = userEvent.setup();
    await mountAsAdmin();

    await user.click(screen.getByRole('button', { name: 'Xóa cấu trúc I want to + V' }));

    // Modal hiển thị đúng structure đang xóa
    expect(await screen.findByText('Bạn có chắc muốn xóa cấu trúc này?')).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('I want to + V')).toBeTruthy();
    expect(
      screen.getByText(/theo quy tắc an toàn của hệ thống/)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeTruthy();
    // Service KHÔNG được gọi khi mới bấm nút (KHÔNG xóa ngay).
    expect(deleteStructureMock).not.toHaveBeenCalled();
  });

  it('modal cảnh báo khi structure ĐANG được sử dụng (có exercise + tiến độ học)', async () => {
    const user = userEvent.setup();
    await mountAsAdmin();
    await user.click(screen.getByRole('button', { name: 'Xóa cấu trúc I want to + V' }));
    expect(await screen.findByText(/đang có dữ liệu sử dụng/)).toBeTruthy();
    expect(screen.getByText(/\(5 bài tập\)/)).toBeTruthy();
    expect(screen.getByText(/và tiến độ học của bạn/)).toBeTruthy();
  });

  it('Hủy -> đóng modal, không xóa', async () => {
    const user = userEvent.setup();
    await mountAsAdmin();
    await user.click(screen.getByRole('button', { name: 'Xóa cấu trúc I want to + V' }));
    await screen.findByText('Bạn có chắc muốn xóa cấu trúc này?');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(deleteStructureMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Bạn có chắc muốn xóa cấu trúc này?')).toBeNull();
  });

  it('Xác nhận -> gọi deleteStructure đúng id, success message + reload danh sách', async () => {
    const user = userEvent.setup();
    await mountAsAdmin();

    await user.click(screen.getByRole('button', { name: 'Xóa cấu trúc I want to + V' }));
    await screen.findByText('Bạn có chắc muốn xóa cấu trúc này?');

    await user.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText(/Đã xóa cấu trúc "I want to \+ V"\./)).toBeTruthy();
    expect(deleteStructureMock).toHaveBeenCalledTimes(1);
    expect(deleteStructureMock).toHaveBeenCalledWith('s1');
    // Danh sách được tải lại ngay sau khi xóa thành công.
    expect(getStructuresForUserMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Modal đã đóng.
    expect(screen.queryByText('Bạn có chắc muốn xóa cấu trúc này?')).toBeNull();
  });

  it('Thất bại -> báo lỗi rõ ràng trong modal (không silent failure)', async () => {
    const user = userEvent.setup();
    deleteStructureMock.mockRejectedValue(new Error('network down'));
    await mountAsAdmin();

    await user.click(screen.getByRole('button', { name: 'Xóa cấu trúc There is / There are' }));
    await screen.findByText('Bạn có chắc muốn xóa cấu trúc này?');
    await user.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText(/Không thể xóa cấu trúc/)).toBeTruthy();
    expect(screen.getByText(/network down/)).toBeTruthy();
    expect(screen.queryByText(/Đã xóa cấu trúc/)).toBeNull();
  });

  it('Backend trả nguyên nhân cụ thể (0 dòng = không đủ quyền/không tồn tại) -> hiển thị nguyên nhân', async () => {
    const user = userEvent.setup();
    deleteStructureMock.mockResolvedValue({
      data: null,
      error: { message: 'Không tìm thấy cấu trúc hoặc bạn không có quyền xóa cấu trúc này.' },
    });
    await mountAsAdmin();

    await user.click(screen.getByRole('button', { name: 'Xóa cấu trúc There is / There are' }));
    await screen.findByText('Bạn có chắc muốn xóa cấu trúc này?');
    await user.click(screen.getByRole('button', { name: 'Xóa' }));

    expect(
      await screen.findByText(/Không tìm thấy cấu trúc hoặc bạn không có quyền xóa/)
    ).toBeTruthy();
  });

  it('Double click nút Xóa xác nhận -> CHỈ MỘT request được gửi', async () => {
    const user = userEvent.setup();
    // Request đầu tiên "treo" — mô phỏng network chậm để giữ trạng thái deleting.
    let resolveFirst;
    deleteStructureMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; })
    );
    await mountAsAdmin();

    await user.click(screen.getByRole('button', { name: 'Xóa cấu trúc There is / There are' }));
    await screen.findByText('Bạn có chắc muốn xóa cấu trúc này?');

    const confirmBtn = screen.getByRole('button', { name: 'Xóa' });
    await user.click(confirmBtn);
    await user.click(confirmBtn); // click lần 2 khi request chưa xong

    expect(deleteStructureMock).toHaveBeenCalledTimes(1);
    // Nút đang ở trạng thái loading/disabled.
    expect(confirmBtn.disabled).toBe(true);

    resolveFirst?.({ data: [{ id: 's2' }], error: null });
    expect(await screen.findByText(/Đã xóa cấu trúc/)).toBeTruthy();
  });

  it('Không thêm nút Xóa vào khu vực khác ngoài card library (review/session không bị đụng đến)', async () => {
    await mountAsAdmin();
    // Chỉ đúng 2 nút xóa tương ứng 2 structure card.
    expect(screen.getAllByRole('button', { name: /Xóa cấu trúc/ }).length).toBe(2);
  });
});
