import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Structures from '../pages/Structures/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// Admin feature đã bị loại bỏ hoàn toàn:
//   - KHÔNG user nào (không còn khái niệm admin) thấy công cụ xóa cấu trúc
//     (checkbox / toolbar "Xóa cấu trúc" / confirmation modal).
//   - deleteStructures (service) không còn tồn tại -> không thể được gọi.
//   - Hành động user-facing "Nhập bài tập" VẪN hiển thị cho mọi user.
// Global structures là reference data — chỉ đọc từ app. Backend RLS
// (auth.uid() = user_id trên user_structures) vẫn là lớp bảo mật dữ liệu user.
// ------------------------------------------------------------------

const getStructuresForUserMock = vi.fn();
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
}));

const USER = { id: 'user-1', email: 'user@example.com' };

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
];

async function mountPage() {
  getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
  render(
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
  await screen.findByText('I want to + V');
}

describe('Structures Library — không còn công cụ xóa (Admin removed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('không có checkbox chọn cấu trúc cho bất kỳ ai', async () => {
    await mountPage();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('không có toolbar "Xóa cấu trúc" và không có confirmation modal xóa', async () => {
    await mountPage();
    expect(screen.queryByRole('button', { name: /Xóa/ })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('không còn entry "Nhập kiến thức" (admin-only) — chỉ còn "Nhập bài tập"', async () => {
    await mountPage();
    expect(screen.queryByRole('link', { name: /Nhập kiến thức/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Nhập bài tập/ })).toBeTruthy();
  });

  it('click card vẫn điều hướng sang detail (read path không bị ảnh hưởng)', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    await mountPage();
    await user.click(screen.getByText('I want to + V'));
    expect(await screen.findByText('DETAIL PAGE')).toBeTruthy();
  });
});
