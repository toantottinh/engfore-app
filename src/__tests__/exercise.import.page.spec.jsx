import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ExerciseImport from '../pages/ExerciseImport/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// UX Import Exercises: CHỌN Structure/Knowledge trước -> paste -> preview
// -> import vào đúng structure_id đã chọn.
// Mock toàn bộ service layer (auth + structures).
// ------------------------------------------------------------------

const getStructuresForUserMock = vi.fn();
const getStructurePatternsMock = vi.fn(async () => ({ data: [], error: null }));
const importStructureExercisesMock = vi.fn();

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: { id: 'user-1', role: 'admin' }, error: null }),
  },
}));

vi.mock('../services/structure.service.js', () => ({
  getStructuresForUser: (...a) => getStructuresForUserMock(...a),
  getStructurePatterns: (...a) => getStructurePatternsMock(...a),
  importStructureExercises: (...a) => importStructureExercisesMock(...a),
}));

const USER = { id: 'user-1', email: 'admin@example.com' };

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
    pattern: 'There is / There are',
    meaning: 'Có...',
    cefr: 'A1',
    topic: 'Home',
    example_count: 1,
    exercise_count: 0,
    user_structures: null,
  },
];

const FIVE_COL = [
  'multiple_choice | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want to learn English. ;; I want learning English. | E1',
  'fill_blank | I want to ___ English. | learn | learn ;; learning ;; learned | E2',
].join('\n');

// Format 6 cột canonical: Type | Structure | Question | Answer | Options | Explanation
const MULTI_COL = [
  // -> s1 (I want to + V)
  'multiple_choice | I want to + V | Which sentence is correct? | I want to learn English. | I want learn English. ;; I want learning English. ;; I want to learn English. | Sau want to dùng V.',
  // -> s2 (There is / There are)
  'fill_blank | There is / There are | There ___ a book. | is | is ;; are | Diễn tả sự tồn tại.',
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

describe('ExerciseImport — chọn Structure/Knowledge trước khi nhập', () => {
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
  afterEach(() => cleanup());

  it('load danh sách structures cho dropdown (kèm metadata)', async () => {
    mount();
    const select = await screen.findByRole('combobox', { name: /Cấu trúc kiến thức/ });
    await waitFor(() => {
      const texts = Array.from(select.options).map((o) => o.textContent);
      expect(texts.some((t) => t.includes('I want to + V'))).toBe(true);
      expect(texts.some((t) => t.includes('Tôi muốn...'))).toBe(true);
      expect(texts.some((t) => t.includes('There is / There are'))).toBe(true);
    });
  }, 15000);

  it('5 cột KHÔNG chọn dropdown -> rows lỗi rõ ràng, Import bị chặn (không gọi RPC)', async () => {
    const user = userEvent.setup();
    const view = mount();
    await screen.findByRole('combobox', { name: /Cấu trúc kiến thức/ });

    const area = view.container.querySelector('textarea');
    expect(area).toBeTruthy();
    await user.type(area, FIVE_COL);
    // Dropdown không còn là dependency bắt buộc -> nút parse BẬT.
    const parseBtn = screen.getByRole('button', { name: /Kiểm tra & xem trước/ });
    expect(parseBtn.disabled).toBe(false);
    await user.click(parseBtn);

    // Mỗi dòng 5 cột thiếu Structure -> lỗi rõ ràng cho từng dòng (no silent failure).
    const noSelErrs = await screen.findAllByText(/chưa chọn "Cấu trúc kiến thức"/);
    expect(noSelErrs.length).toBeGreaterThan(0);
    expect(noSelErrs[0].textContent).toContain('Dòng 1:');
    // Import bị chặn hoàn toàn khi còn lỗi:
    expect(screen.queryByRole('button', { name: /Nhập \d+ bài tập/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: /Sửa lỗi trước khi import/ }).disabled
    ).toBe(true);
    expect(importStructureExercisesMock).not.toHaveBeenCalled();
  }, 15000);

  it('chọn structure -> parse -> IMPORT gọi RPC với MỖI row mang ĐÚNG structure đã chọn', async () => {
    const user = userEvent.setup();
    const view = mount();
    const select = await screen.findByRole('combobox', { name: /Cấu trúc kiến thức/ });
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));

    // Chọn s1 = "I want to + V"
    await user.selectOptions(select, 's1');
    const area = view.container.querySelector('textarea');
    expect(area).toBeTruthy();
    await user.type(area, FIVE_COL);
    await user.click(screen.getByRole('button', { name: /Kiểm tra & xem trước/ }));

    // Preview hiển thị Structure đích + các exercise (question là input value)
    expect(await screen.findByText(/Cấu trúc:/)).toBeTruthy();
    expect(screen.getByDisplayValue('Which sentence is correct?')).toBeTruthy();
    expect(screen.getByDisplayValue('I want to ___ English.')).toBeTruthy();

    // Import
    const importBtn = screen.getByRole('button', { name: /Nhập 2 bài tập/ });
    expect(importBtn.disabled).toBe(false);
    await user.click(importBtn);

    expect(importStructureExercisesMock).toHaveBeenCalledTimes(1);
    const callArg = importStructureExercisesMock.mock.calls[0][0];
    expect(callArg.exercises).toHaveLength(2);

    // INVARIANT: toàn batch trỏ đúng MỘT knowledge đã chọn.
    // (RPC resolve pattern này -> structures.id rồi lưu vào
    //  structure_exercises.structure_id; FK NOT NULL đảm bảo không lưu text.)
    const patterns = new Set(callArg.exercises.map((e) => e.pattern));
    expect(patterns.size).toBe(1);
    expect(patterns.has('I want to + V')).toBe(true);
    expect(callArg.exercises.every((e) => e.pattern === 'I want to + V')).toBe(true);
    // Exercise KHÔNG phải SRS item — payload không chứa exercise_id:
    expect(callArg.exercises.every((e) => !('exercise_id' in e))).toBe(true);

    // Success feedback
    expect(await screen.findByText(/Created: 2 · Errored: 0/)).toBeTruthy();
  }, 15000);

  it('RPC failure được hiển thị cho người dùng (không nuốt lỗi)', async () => {
    const user = userEvent.setup();
    const view = mount();
    importStructureExercisesMock.mockRejectedValue({
      message: 'Only admins can import structure exercises.',
    });
    const select = await screen.findByRole('combobox', { name: /Cấu trúc kiến thức/ });
    await waitFor(() => expect(select.options.length).toBeGreaterThan(1));
    await user.selectOptions(select, 's1');
    const area = view.container.querySelector('textarea');
    expect(area).toBeTruthy();
    await user.type(area, FIVE_COL);
    await user.click(screen.getByRole('button', { name: /Kiểm tra & xem trước/ }));
    await screen.findByDisplayValue('Which sentence is correct?');
    await user.click(screen.getByRole('button', { name: /Nhập 2 bài tập/ }));

    expect(await screen.findByText(/Không thể nhập bài tập/)).toBeTruthy();
  }, 15000);

  it('BULK multi-structure: 1 paste nhieu Structure, khong can chon dropdown -> import tat ca', async () => {
    const user = userEvent.setup();
    const view = mount();
    // Dropdown van hien nhung KHONG bat buoc chon:
    await screen.findByRole('combobox', { name: /Cấu trúc kiến thức/ });

    const area = view.container.querySelector('textarea');
    expect(area).toBeTruthy();
    await user.type(area, MULTI_COL);
    await user.click(screen.getByRole('button', { name: /Kiểm tra & xem trước/ }));

    // Ca 2 dong hop le -> co nut Import:
    const importBtn = await screen.findByRole('button', { name: /Nhập 2 bài tập/ });
    expect(importBtn.disabled).toBe(false);

    await user.click(importBtn);

    expect(importStructureExercisesMock).toHaveBeenCalledTimes(1);
    const callArg = importStructureExercisesMock.mock.calls[0][0];
    expect(callArg.exercises).toHaveLength(2);
    // Moi row tro dung structure cua NO (multi-structure trong 1 paste):
    expect(new Set(callArg.exercises.map((e) => e.pattern))).toEqual(
      new Set(['I want to + V', 'There is / There are'])
    );
    // Exercise khong phai SRS item — payload khong co exercise_id:
    expect(callArg.exercises.every((e) => !('exercise_id' in e))).toBe(true);

    expect(await screen.findByText(/Created: 2 · Errored: 0/)).toBeTruthy();
  }, 15000);

  it('Mixed batch co dong UNKNOWN structure -> chan import + bao loi dung dong', async () => {
    const user = userEvent.setup();
    const view = mount();
    await screen.findByRole('combobox', { name: /Cấu trúc kiến thức/ });

    const text = [
      // Hop le -> s1:
      'multiple_choice | I want to + V | Q1 hop le? | I want to learn English. | X ;; Y ;; I want to learn English. | E1',
      // UNKNOWN structure -> INVALID:
      'fill_blank | Ghost Pattern | I ___ to learn English every day. | want | want ;; study | E2',
    ].join('\n');

    const area = view.container.querySelector('textarea');
    await user.type(area, text);
    await user.click(screen.getByRole('button', { name: /Kiểm tra & xem trước/ }));

    // Bao loi CHINH XAC theo dong (no silent failure):
    const errTexts = await screen.findAllByText(/Không tìm thấy cấu trúc "Ghost Pattern"/);
    expect(errTexts.length).toBeGreaterThan(0);
    // Loi mang so dong chinh xac:
    expect(errTexts[0].textContent).toContain('Dòng 2:');
    // Import bi CHAN khi con dong loi:
    expect(screen.queryByRole('button', { name: /Nhập \d+ bài tập/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: /Sửa lỗi trước khi import/ }).disabled
    ).toBe(true);
    expect(importStructureExercisesMock).not.toHaveBeenCalled();
  }, 15000);
});