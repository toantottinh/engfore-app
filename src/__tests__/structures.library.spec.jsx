import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Structures from '../pages/Structures/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// Tests cho Structure Library (CHECKPOINT 4).
// Mock service layer; useStructures đọc getStructuresForUser.
// ------------------------------------------------------------------

const getStructuresForUserMock = vi.fn();
// Điều khiển được per-test: { data: { role: 'user'|'admin' } | null }
const ensureProfileMock = vi.fn(async () => ({ data: null, error: null }));
// Delete structure (mặc định thành công; các test xóa chi tiết nằm ở structures.delete.spec.jsx)
const deleteStructureMock = vi.fn(async () => ({ data: [{ id: 's1' }], error: null }));

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

const USER = { id: 'user-1', email: 'test@example.com' };

const STRUCTURES = [
  {
    id: 's1',
    pattern: 'I want to + V',
    meaning: 'Tôi muốn...',
    explanation: 'Dùng để nói về mong muốn',
    cefr: 'A1',
    topic: 'Daily Life',
    example_count: 3,
    user_structures: null,
  },
  {
    id: 's2',
    pattern: 'There is / There are',
    meaning: 'Có...',
    cefr: 'B1',
    topic: 'Home',
    example_count: 2,
    user_structures: { state: 'review', mastery_level: 4 },
  },
  {
    id: 's3',
    pattern: 'I used to + V',
    meaning: 'Tôi từng...',
    cefr: 'B1',
    topic: 'Daily Life',
    example_count: 1,
    user_structures: { state: 'learning', mastery_level: 2 },
  },
];

function mountLibrary() {
  return render(
    <MemoryRouter initialEntries={['/structures']}>
      <AuthProvider initialUser={USER}>
        <Routes>
          <Route path="/structures" element={<Structures />} />
          <Route path="/structures/:structureId" element={<div>DETAIL PAGE</div>} />
          <Route path="/structures/import" element={<div>KNOWLEDGE IMPORT PAGE</div>} />
          <Route path="/structures/exercises/import" element={<div>EXERCISES IMPORT PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Structures Library', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('render loading spinner trước khi data về', () => {
    getStructuresForUserMock.mockImplementation(() => new Promise(() => {})); // never resolves
    mountLibrary();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('render danh sách structure: pattern + meaning', async () => {
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    expect(await screen.findByText('I want to + V')).toBeTruthy();
    expect(screen.getByText('Tôi muốn...')).toBeTruthy();
    expect(screen.getByText('There is / There are')).toBeTruthy();
  });

  it('render CEFR và Topic', async () => {
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    expect(screen.getAllByText('A1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Daily Life').length).toBeGreaterThan(0);
  });

  it('render số ví dụ', async () => {
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    expect(screen.getByText('3 ví dụ')).toBeTruthy();
  });

  it('search theo pattern lọc danh sách', async () => {
    const user = userEvent.setup();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    await user.type(screen.getByPlaceholderText(/pattern, nghĩa hoặc chủ đề/), 'want');
    expect(screen.getByText('I want to + V')).toBeTruthy();
    expect(screen.queryByText('There is / There are')).toBeNull();
  });

  it('search theo meaning (tiếng Việt)', async () => {
    const user = userEvent.setup();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    await user.type(screen.getByPlaceholderText(/pattern, nghĩa hoặc chủ đề/), 'Tôi từng');
    expect(screen.getByText('I used to + V')).toBeTruthy();
    expect(screen.queryByText('I want to + V')).toBeNull();
  });

  it('filter CEFR hiển thị đúng', async () => {
    const user = userEvent.setup();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    const cefrSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(cefrSelect, 'B1');
    expect(screen.getByText('There is / There are')).toBeTruthy();
    expect(screen.getByText('I used to + V')).toBeTruthy();
    expect(screen.queryByText('I want to + V')).toBeNull();
  });

  it('filter status "new" gồm structure chưa có user_structures', async () => {
    const user = userEvent.setup();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    const statusSelect = screen.getAllByRole('combobox')[2];
    await user.selectOptions(statusSelect, 'new');
    expect(screen.getByText('I want to + V')).toBeTruthy();
    expect(screen.queryByText('There is / There are')).toBeNull();
    expect(screen.queryByText('I used to + V')).toBeNull();
  });

  it('kết hợp filter CEFR + status', async () => {
    const user = userEvent.setup();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'B1'); // CEFR
    await user.selectOptions(screen.getAllByRole('combobox')[2], 'review'); // status
    expect(screen.getByText('There is / There are')).toBeTruthy();
    expect(screen.queryByText('I used to + V')).toBeNull();
    expect(screen.queryByText('I want to + V')).toBeNull();
  });

  it('counters StatusCounts hiển thị (New / Again / Ôn)', async () => {
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    // STRUCTURES: s1 new(chưa row), s2 review, s3 learning -> New 1 / Again 1 / Ôn 1
    expect(screen.getByText('Mới')).toBeTruthy();
    expect(screen.getByText('Again')).toBeTruthy();
    expect(screen.getByText('Ôn')).toBeTruthy();
  });

  it('empty state khi không có structure (không phải error)', async () => {
    getStructuresForUserMock.mockResolvedValue({ data: [], error: null });
    mountLibrary();
    expect(await screen.findByText('Chưa có cấu trúc câu.')).toBeTruthy();
  });

  it('no search result -> empty state riêng biệt (không phải error)', async () => {
    const user = userEvent.setup();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    await screen.findByText('I want to + V');
    const input = screen.getByPlaceholderText(/pattern, nghĩa hoặc chủ đề/);
    await user.type(input, 'xyzkhongco');
    expect(screen.getByText('Không tìm thấy cấu trúc phù hợp.')).toBeTruthy();
    expect(screen.queryByText(/Vui lòng thử lại/)).toBeNull();
  });

  it('error state hiển thị thông báo lỗi', async () => {
    getStructuresForUserMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    mountLibrary();
    expect(await screen.findByText(/Không thể tải cấu trúc câu/)).toBeTruthy();
  });

  it('navigate to detail khi bấm vào card', async () => {
    const user = userEvent.setup();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    mountLibrary();
    const card = await screen.findByText('I want to + V');
    await user.click(card);
    expect(await screen.findByText('DETAIL PAGE')).toBeTruthy();
  });
});

// ------------------------------------------------------------------
// Admin Import entry (STEP 2/6/8): chỉ admin thấy hành động nhập trên
// /structures; click điều hướng tới trang import HIỆN CÓ (không /admin).
// Backend RPC guards vẫn là lớp bảo mật chính — test này chỉ verify UI gate.
// ------------------------------------------------------------------
describe('Structures Library — Admin Import entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role: 'user' }, error: null });
  });
  afterEach(() => cleanup());

  it('non-admin KHÔNG thấy "Nhập kiến thức"/"Nhập bài tập"', async () => {
    mountLibrary();
    await screen.findByText('I want to + V'); // list đã load, profile=user
    expect(screen.queryByRole('link', { name: /Nhập kiến thức/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Nhập bài tập/ })).toBeNull();
  });

  it('admin THẤY cả hai hành động nhập', async () => {
    ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role: 'admin' }, error: null });
    mountLibrary();
    expect(await screen.findByRole('link', { name: /Nhập kiến thức/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Nhập bài tập/ })).toBeTruthy();
  });

  it('admin click "Nhập kiến thức" -> mở trang import hiện có (không /admin)', async () => {
    const user = userEvent.setup();
    ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role: 'admin' }, error: null });
    mountLibrary();
    const link = await screen.findByRole('link', { name: /Nhập kiến thức/ });
    await user.click(link);
    expect(await screen.findByText('KNOWLEDGE IMPORT PAGE')).toBeTruthy();
  });

  it('admin click "Nhập bài tập" -> mở trang import exercises hiện có', async () => {
    const user = userEvent.setup();
    ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role: 'admin' }, error: null });
    mountLibrary();
    const link = await screen.findByRole('link', { name: /Nhập bài tập/ });
    await user.click(link);
    expect(await screen.findByText('EXERCISES IMPORT PAGE')).toBeTruthy();
  });

  it('hành động nhập hiển thị cả khi library RỖNG (admin cần import đầu tiên)', async () => {
    ensureProfileMock.mockResolvedValue({ data: { id: USER.id, role: 'admin' }, error: null });
    getStructuresForUserMock.mockResolvedValue({ data: [], error: null });
    mountLibrary();
    expect(await screen.findByText('Chưa có cấu trúc câu.')).toBeTruthy();
    expect(await screen.findByRole('link', { name: /Nhập kiến thức/ })).toBeTruthy();
  });
});