import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Structures from '../pages/Structures/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// Tests cho CHỌN + XÓA NHIỀU cấu trúc trên /structures:
//   D/E. tick checkbox chọn 1 / nhiều structure.
//   F.   nút xóa disabled khi chưa chọn gì.
//   G/H. enabled kèm đúng số lượng ("Xóa N cấu trúc", "Đã chọn N/M").
//   I.   Chọn tất cả / Bỏ chọn.
//   J.   Hủy -> không gọi service, giữ selection.
//   K.   Xác nhận -> MỘT request bulk với đúng ids; clear selection; reload.
//   L.   Double-click -> chỉ 1 request.
//   N.   Lỗi -> báo rõ nguyên nhân trong modal + GIỮ selection.
//   O.   Non-admin KHÔNG có công cụ xóa (RLS backend vẫn chặn tuyệt đối).
// Checkbox đặt ngoài Link: tick KHÔNG điều hướng sang trang detail.
// ------------------------------------------------------------------

const getStructuresForUserMock = vi.fn();
const deleteStructuresMock = vi.fn();
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
  deleteStructures: (...args) => deleteStructuresMock(...args),
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
    user_structures: null,
  },
  {
    id: 's2',
    pattern: 'There is / There are',
    meaning: 'Có...',
    cefr: 'B1',
    topic: 'Home',
    example_count: 2,
    exercise_count: 0,
    user_structures: { state: 'review', mastery_level: 4 },
  },
  {
    id: 's3',
    pattern: 'I used to + V',
    meaning: 'Tôi từng...',
    cefr: 'B1',
    topic: 'Daily Life',
    example_count: 1,
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
          <Route path="/structures/exercises/import" element={<div>EXERCISES IMPORT PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function mountAs(role) {
  ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role }, error: null });
  getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
  deleteStructuresMock.mockResolvedValue({
    data: STRUCTURES.map((s) => ({ id: s.id })),
    error: null,
  });
  mountPage();
  await screen.findByText('I want to + V');
}

const checkboxOf = (pattern) =>
  screen.getByRole('checkbox', { name: `Chọn cấu trúc ${pattern}` });

const deleteBtn = () => screen.getByRole('button', { name: /^Xóa( \d+ cấu trúc| cấu trúc đã chọn)?$/ });

describe('Bulk delete — quyền & hiển thị', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('O. non-admin KHÔNG có checkbox/toolbar xóa; vẫn thấy link "Nhập bài tập"', async () => {
    await mountAs('user');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Xóa/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Nhập bài tập/ })).toBeTruthy();
  });

  it('D. admin thấy checkbox trên từng structure card', async () => {
    await mountAs('admin');
    for (const s of STRUCTURES) {
      expect(checkboxOf(s.pattern).checked).toBe(false);
    }
  });
});

describe('Bulk delete — chọn & trạng thái nút', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('F. chưa chọn gì -> nút xóa disabled, nhãn "Xóa cấu trúc đã chọn"', async () => {
    await mountAs('admin');
    const btn = deleteBtn();
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Xóa cấu trúc đã chọn');
  });

  it('G. chọn 1 -> enabled + "Xóa 1 cấu trúc"; tick KHÔNG điều hướng detail', async () => {
    const user = userEvent.setup();
    await mountAs('admin');

    await user.click(checkboxOf('I want to + V'));
    // Checkbox nằm NGOÀI Link: click không được mở trang detail.
    expect(screen.queryByText('DETAIL PAGE')).toBeNull();

    const btn = deleteBtn();
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain('Xóa 1 cấu trúc');
    expect(screen.getByText('Đã chọn 1/3')).toBeTruthy();
  });

  it('H. chọn nhiều -> hiển thị đúng số lượng', async () => {
    const user = userEvent.setup();
    await mountAs('admin');
    await user.click(checkboxOf('I want to + V'));
    await user.click(checkboxOf('There is / There are'));
    expect(deleteBtn().textContent).toContain('Xóa 2 cấu trúc');
    expect(screen.getByText('Đã chọn 2/3')).toBeTruthy();
  });

  it('I. Chọn tất cả -> tất cả checked; Bỏ chọn -> clear về disabled', async () => {
    const user = userEvent.setup();
    await mountAs('admin');

    await user.click(screen.getByRole('button', { name: 'Chọn tất cả' }));
    for (const s of STRUCTURES) {
      expect(checkboxOf(s.pattern).checked).toBe(true);
    }
    expect(deleteBtn().textContent).toContain('Xóa 3 cấu trúc');

    await user.click(screen.getByRole('button', { name: 'Bỏ chọn' }));
    for (const s of STRUCTURES) {
      expect(checkboxOf(s.pattern).checked).toBe(false);
    }
    expect(deleteBtn().disabled).toBe(true);
  });

  it('E. tick rồi bỏ tick từng item -> selection cập nhật chính xác', async () => {
    const user = userEvent.setup();
    await mountAs('admin');
    await user.click(checkboxOf('I used to + V'));
    expect(deleteBtn().textContent).toContain('Xóa 1 cấu trúc');
    await user.click(checkboxOf('I used to + V'));
    expect(deleteBtn().disabled).toBe(true);
  });
});

describe('Bulk delete — confirmation modal & flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('J. mở modal đúng nội dung; Hủy -> không gọi service + GIỮ selection', async () => {
    const user = userEvent.setup();
    await mountAs('admin');

    await user.click(checkboxOf('I want to + V'));
    await user.click(checkboxOf('I used to + V'));
    await user.click(deleteBtn());

    const dialog = screen.getByRole('dialog', { name: 'Xóa cấu trúc' });
    expect(within(dialog).getByText(/Bạn có chắc muốn xóa các cấu trúc đã chọn\?/)).toBeTruthy();
    expect(within(dialog).getByText(/Bạn đang chọn 2 cấu trúc:/)).toBeTruthy();
    expect(within(dialog).getByText('• I want to + V')).toBeTruthy();
    expect(within(dialog).getByText('• I used to + V')).toBeTruthy();
    expect(
      within(dialog).getByText(/Thao tác này sẽ xóa các cấu trúc đã chọn cùng các dữ liệu phụ thuộc/)
    ).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(deleteStructuresMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Selection GIỮ nguyên sau khi hủy.
    expect(checkboxOf('I want to + V').checked).toBe(true);
    expect(checkboxOf('I used to + V').checked).toBe(true);
  });

  it('K. Xác nhận -> MỘT request bulk với đúng ids; clear selection; reload; success', async () => {
    const user = userEvent.setup();
    await mountAs('admin');

    await user.click(checkboxOf('I want to + V'));
    await user.click(checkboxOf('I used to + V'));
    await user.click(deleteBtn());
    const dialog = screen.getByRole('dialog', { name: 'Xóa cấu trúc' });
    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText('Đã xóa 2 cấu trúc.')).toBeTruthy();
    expect(deleteStructuresMock).toHaveBeenCalledTimes(1);
    // Đúng MỘT request bulk, đúng ids theo thứ tự chọn.
    expect(deleteStructuresMock.mock.calls[0][0]).toEqual(['s1', 's3']);
    // Modal đóng + selection cleared.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(checkboxOf('I want to + V').checked).toBe(false);
    expect(checkboxOf('I used to + V').checked).toBe(false);
    // Danh sách được reload.
    expect(getStructuresForUserMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  }, 15000);

  it('L. double-click Xác nhận khi request đang treo -> CHỈ 1 request', async () => {
    const user = userEvent.setup();
    let resolveFirst;
    deleteStructuresMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; })
    );
    await mountAs('admin');

    await user.click(checkboxOf('There is / There are'));
    await user.click(deleteBtn());
    const confirm = within(screen.getByRole('dialog', { name: 'Xóa cấu trúc' })).getByRole('button', { name: 'Xóa' });
    await user.click(confirm);
    await user.click(confirm); // click lần 2 khi request chưa xong

    expect(deleteStructuresMock).toHaveBeenCalledTimes(1);
    expect(confirm.disabled).toBe(true);

    resolveFirst?.({ data: [{ id: 's2' }], error: null });
    expect(await screen.findByText('Đã xóa 1 cấu trúc.')).toBeTruthy();
  }, 15000);

  it('N. thất bại -> lỗi rõ ràng trong modal + GIỮ selection (không silent failure)', async () => {
    const user = userEvent.setup();
    await mountAs('admin');
    // GHI ĐÈ sau mountAs (mountAs mặc định set mock thành công).
    deleteStructuresMock.mockResolvedValue({
      data: null,
      error: { message: 'Không tìm thấy cấu trúc hoặc bạn không có quyền xóa các cấu trúc này.' },
    });

    await user.click(checkboxOf('I want to + V'));
    await user.click(checkboxOf('There is / There are'));
    await user.click(deleteBtn());
    const dialog = screen.getByRole('dialog', { name: 'Xóa cấu trúc' });
    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText(/Không thể xóa cấu trúc\./)).toBeTruthy();
    expect(screen.getByText(/Không tìm thấy cấu trúc hoặc bạn không có quyền xóa/)).toBeTruthy();
    // Không success, modal còn mở, selection giữ nguyên để thử lại.
    expect(screen.queryByText(/Đã xóa \d+ cấu trúc/)).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeNull();
    expect(checkboxOf('I want to + V').checked).toBe(true);
    expect(checkboxOf('There is / There are').checked).toBe(true);
    expect(deleteStructuresMock).toHaveBeenCalledTimes(1);
  }, 15000);

  it('exception từ service cũng bị bắt và hiển thị (không crash)', async () => {
    const user = userEvent.setup();
    await mountAs('admin');
    // GHI ĐÈ sau mountAs.
    deleteStructuresMock.mockRejectedValue(new Error('network down'));

    await user.click(checkboxOf('I used to + V'));
    await user.click(deleteBtn());
    const dialog = screen.getByRole('dialog', { name: 'Xóa cấu trúc' });
    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }));

    expect(await screen.findByText(/network down/)).toBeTruthy();
    // Selection giữ nguyên.
    expect(checkboxOf('I used to + V').checked).toBe(true);
  }, 15000);
});
