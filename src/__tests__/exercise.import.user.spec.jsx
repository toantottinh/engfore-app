import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ExerciseImport from '../pages/ExerciseImport/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// Tests A/B/C — Exercise Import + "Lệnh bài tập" PHẢI dùng được bởi
// USER THƯỜNG (không bị khóa vì isAdmin):
//   A. user thấy giao diện importer đầy đủ (không bị chặn "chỉ dành cho admin").
//   C. user thấy nút "Lệnh bài tập" và mở được modal prompt.
//   B. user parse + import thành công -> RPC import_structure_exercises
//      được gọi với payload đúng.
// Backend guard tương ứng đã mở cho authenticated (migration 20260831000000).
// ------------------------------------------------------------------

const getStructuresForUserMock = vi.fn();
const getStructurePatternsMock = vi.fn(async () => ({ data: [], error: null }));
const importStructureExercisesMock = vi.fn();

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: { id: 'user-2', role: 'user' }, error: null }),
  },
}));

vi.mock('../services/structure.service.js', () => ({
  getStructuresForUser: (...a) => getStructuresForUserMock(...a),
  getStructurePatterns: (...a) => getStructurePatternsMock(...a),
  importStructureExercises: (...a) => importStructureExercisesMock(...a),
}));

// USER THƯỜNG — KHÔNG phải admin.
const USER = { id: 'user-2', email: 'learner@example.com' };

const STRUCTURES = [
  {
    id: 's1',
    pattern: 'I want to + V',
    meaning: 'Tôi muốn...',
    cefr: 'A1',
    topic: 'Daily Life',
    example_count: 2,
    exercise_count: 0,
    user_structures: null,
  },
  {
    id: 's2',
    pattern: 'I am + adjective',
    meaning: 'Tôi...',
    cefr: 'A1',
    topic: 'Feelings',
    example_count: 1,
    exercise_count: 0,
    user_structures: null,
  },
];

// Format 6 cột canonical — multi-structure trong một batch.
const MULTI_COL = [
  'multiple_choice | I want to + V | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want learning English. ;; I want to learn English. | Sau want to dùng V.',
  "fill_blank | I am + adjective | You didn't sleep well last night. You feel ___. | tired | tired ;; tiring ;; tire | Sau am dùng adjective.",
].join('\n');

function mount() {
  return render(
    <MemoryRouter initialEntries={['/structures/exercises/import']}>
      <AuthProvider initialUser={USER}>
        <ExerciseImport />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Exercise Import — USER THƯỜNG sử dụng được', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStructuresForUserMock.mockResolvedValue({ data: STRUCTURES, error: null });
    getStructurePatternsMock.mockResolvedValue({
      data: STRUCTURES.map((s) => s.pattern),
      error: null,
    });
    importStructureExercisesMock.mockResolvedValue({
      data: [{ created: 2, errored: 0 }],
      error: null,
      meta: { created: 2, errored: 0 },
    });
  });
  afterEach(cleanup);

  it('A. user thường thấy giao diện importer đầy đủ (không bị chặn admin)', async () => {
    mount();
    // Heading + textarea + nút parse xuất hiện => trang KHÔNG early-return
    // "chỉ dành cho admin" nữa.
    expect(
      await screen.findByRole('heading', { name: /Nhập bài tập \(Exercises\)/ })
    ).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Cấu trúc kiến thức/ }).options.length).toBeGreaterThan(1)
    );
    expect(screen.getByRole('button', { name: /Kiểm tra & xem trước/ })).toBeTruthy();
    expect(screen.queryByText(/Trang này chỉ dành cho admin/)).toBeNull();
  });

  it('C. user thường thấy nút "Lệnh bài tập" và mở được modal prompt', async () => {
    const user = userEvent.setup();
    mount();

    const btn = await screen.findByRole('button', { name: 'Lệnh bài tập' });
    await user.click(btn);

    const dialog = screen.getByRole('dialog', { name: 'Lệnh bài tập' });
    expect(within(dialog).getByText(/Bạn là AI chuyên tạo bài tập tiếng Anh cho hệ thống EngFore\./)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Sao chép' })).toBeTruthy();
  });

  it('B. user thường paste -> preview -> IMPORT gọi RPC với payload đúng', async () => {
    const user = userEvent.setup();
    const view = mount();

    // Dropdown load được danh sách structure (read-only, mọi user đều xem được).
    const select = await screen.findByRole('combobox', { name: /Cấu trúc kiến thức/ });
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

    const area = view.container.querySelector('textarea');
    expect(area).toBeTruthy();
    await user.type(area, MULTI_COL);
    await user.click(screen.getByRole('button', { name: /Kiểm tra & xem trước/ }));

    // Preview hiển thị cả 2 dòng hợp lệ.
    expect(await screen.findByDisplayValue('Which sentence is correct?')).toBeTruthy();
    expect(screen.getByDisplayValue("You didn't sleep well last night. You feel ___.")).toBeTruthy();

    const importBtn = screen.getByRole('button', { name: /Nhập 2 bài tập/ });
    expect(importBtn.disabled).toBe(false);
    await user.click(importBtn);

    // RPC được gọi đúng 1 lần với payload multi-structure chuẩn.
    expect(importStructureExercisesMock).toHaveBeenCalledTimes(1);
    const callArg = importStructureExercisesMock.mock.calls[0][0];
    expect(callArg.exercises).toHaveLength(2);
    expect(callArg.exercises[0]).toMatchObject({
      pattern: 'I want to + V',
      type: 'multiple_choice',
    });
    expect(callArg.exercises[1]).toMatchObject({
      pattern: 'I am + adjective',
      type: 'fill_blank',
      answer: 'tired',
    });

    expect(await screen.findByText(/Created: 2 · Errored: 0/)).toBeTruthy();
  }, 15000);
});
