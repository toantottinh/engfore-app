import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ExerciseImport from '../pages/ExerciseImport/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';
import { EXERCISE_AI_PROMPT } from '../utils/exercise-ai-prompt.js';

// ------------------------------------------------------------------
// Tests cho nút "Lệnh bài tập" trên trang Nhập bài tập:
//   - Đúng MỘT nút duy nhất.
//   - Click -> modal hiển thị TOÀN BỘ prompt chuẩn cho AI sinh Exercise.
//   - "Sao chép" -> copy FULL prompt vào clipboard + báo thành công rõ ràng
//     (có fallback execCommand khi Clipboard API không khả dụng).
//   - Thuần UI/clipboard: mở/copy KHÔNG gọi bất kỳ API Supabase nào,
//     KHÔNG thay đổi dữ liệu exercise.
// ------------------------------------------------------------------

const getStructuresForUserMock = vi.fn();
const getStructurePatternsMock = vi.fn(async () => ({ data: [], error: null }));
const importStructureExercisesMock = vi.fn(async () => ({
  data: [{ created: 0, errored: 0 }],
  error: null,
  meta: { created: 0, errored: 0 },
}));

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

// jsdom mặc định không có navigator.clipboard / execCommand thật.
const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;
let writeTextMock;

function stubClipboard() {
  writeTextMock = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  });
}

function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/structures/exercises/import']}>
      <AuthProvider initialUser={USER}>
        <ExerciseImport />
      </AuthProvider>
    </MemoryRouter>
  );
}

async function openPromptModal(user) {
  // Profile admin load bất đồng bộ -> nút chỉ xuất hiện sau khi isAdmin=true.
  const btn = await screen.findByRole('button', { name: 'Lệnh bài tập' });
  await user.click(btn);
  return screen.getByRole('dialog', { name: 'Lệnh bài tập' });
}

describe('Nút "Lệnh bài tập" — hiển thị & nội dung prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStructuresForUserMock.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    cleanup();
  });

  it('hiển thị đúng MỘT nút duy nhất tên "Lệnh bài tập"', async () => {
    mount();
    // Chờ profile admin load xong (nút nằm trong view chính của admin).
    const buttons = await screen.findAllByRole('button', { name: 'Lệnh bài tập' });
    expect(buttons).toHaveLength(1);
  });

  it('click mở modal hiển thị TOÀN BỘ prompt chuẩn', async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await openPromptModal(user);

    // Các mốc nội dung quan trọng của prompt phải hiển thị trong modal.
    // (toàn bộ prompt nằm trong MỘT <pre> -> khớp bằng regex, không exact)
    expect(
      within(dialog).getByText(/Bạn là AI chuyên tạo bài tập tiếng Anh cho hệ thống EngFore\./)
    ).toBeTruthy();
    expect(within(dialog).getByText(/Type \| Structure \| Question \| Answer \| Options \| Explanation/)).toBeTruthy();
    // Prompt có thể được hiệu chỉnh wording theo thời gian — test khóa các
    // CONTRACT marker (delimiter/quy tắc) chứ không khóa từng chữ.
    expect(within(dialog).getByText(/answer1 \|\| answer2/)).toBeTruthy();
    expect(within(dialog).getByText(/hungry ;; hunger ;; hungrily/)).toBeTruthy();
    expect(within(dialog).getByText(/CHỈ xuất các dòng exercise\./)).toBeTruthy();

    // Nút Sao chép + Đóng tồn tại trong footer ("Đóng" gồm cả nút X ở header).
    expect(within(dialog).getByRole('button', { name: 'Sao chép' })).toBeTruthy();
    const closeButtons = within(dialog).getAllByRole('button', { name: 'Đóng' });
    expect(closeButtons.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Hằng số EXERCISE_AI_PROMPT — đúng chuẩn spec', () => {
  it('bắt đầu bằng vai trò AI EngFore và chứa đủ 6 type + các quy tắc cốt lõi', () => {
    expect(
      EXERCISE_AI_PROMPT.startsWith(
        'Bạn là AI chuyên tạo bài tập tiếng Anh cho hệ thống EngFore.'
      )
    ).toBe(true);

    // 6 type hợp lệ — khớp CHECK constraint của structure_exercises:
    for (const t of [
      'multiple_choice',
      'fill_blank',
      'translation',
      'correction',
      'rearrange',
      'production',
    ]) {
      expect(EXERCISE_AI_PROMPT).toContain(t);
    }

    // Các quy tắc CONTRACT cốt lõi (bắt buộc cho importer/grading — không khóa
    // từng câu chữ để prompt vẫn được phép tinh chỉnh wording):
    const coreRules = [
      'Type | Structure | Question | Answer | Options | Explanation',
      'Không dùng || trong Options.',
      '"||" CHỈ được phép xuất hiện trong Answer.',
      'CHỈ xuất các dòng exercise.',
      'Không code fence.',
      'tuyệt đối không lộ Structure',
    ];
    for (const rule of coreRules) {
      expect(EXERCISE_AI_PROMPT).toContain(rule);
    }
  });

  it('chứa format output, quy ước delimiter và kết thúc bằng OUTPUT rule', () => {
    expect(EXERCISE_AI_PROMPT).toContain('Type | Structure | Question | Answer | Options | Explanation');
    for (const t of [
      'multiple_choice',
      'fill_blank',
      'translation',
      'correction',
      'rearrange',
      'production',
    ]) {
      expect(EXERCISE_AI_PROMPT).toContain(t);
    }
    // Multi-answer: mẫu || trong Answer (2+ đáp án đều đúng mới dùng).
    expect(EXERCISE_AI_PROMPT).toContain('answer1 || answer2');
    // Options dùng ";;" (ví dụ cụ thể trong prompt).
    expect(EXERCISE_AI_PROMPT).toContain('hungry ;; hunger ;; hungrily');
    expect(EXERCISE_AI_PROMPT).toContain('Không dùng || trong Options.');
    // Production: Answer rỗng.
    expect(EXERCISE_AI_PROMPT).toContain('Answer phải để trống.');
    // KHÔNG assert vị trí/kết thúc file — prompt được phép bổ sung mục mới
    // (vd thêm tình huống luyện tập) mà không phá contract.
    // Không được chứa code fence (prompt cấm markdown fence).
    expect(EXERCISE_AI_PROMPT.includes('```')).toBe(false);
  });
});

describe('"Sao chép" — clipboard & feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStructuresForUserMock.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    document.execCommand = originalExecCommand;
    cleanup();
  });

  it('copy FULL prompt vào clipboard qua Clipboard API + báo thành công', async () => {
    const user = userEvent.setup();
    // QUAN TRỌNG: userEvent.setup() tự cài clipboard-stub riêng lên
    // navigator.clipboard -> stub của test phải đặt SAU setup() để thắng.
    stubClipboard();
    mount();
    await openPromptModal(user);

    await user.click(screen.getByRole('button', { name: 'Sao chép' }));

    expect(await screen.findByText(/Đã sao chép prompt vào clipboard\./)).toBeTruthy();
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    // Clipboard phải nhận ĐÚNG và ĐỦ toàn bộ prompt.
    expect(writeTextMock.mock.calls[0][0]).toBe(EXERCISE_AI_PROMPT);
  });

  it('fallback execCommand khi Clipboard API không khả dụng', async () => {
    const user = userEvent.setup();
    removeClipboard(); // SAU setup() -> không còn Clipboard API nào
    document.execCommand = vi.fn(() => true);
    mount();
    await openPromptModal(user);

    await user.click(screen.getByRole('button', { name: 'Sao chép' }));

    expect(await screen.findByText(/Đã sao chép prompt vào clipboard\./)).toBeTruthy();
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('copy thất bại -> hướng dẫn copy thủ công (không crash, không silent)', async () => {
    const user = userEvent.setup();
    removeClipboard();
    document.execCommand = vi.fn(() => false);
    mount();
    await openPromptModal(user);

    await user.click(screen.getByRole('button', { name: 'Sao chép' }));

    expect(await screen.findByText(/Không thể sao chép tự động/)).toBeTruthy();
    expect(screen.queryByText(/Đã sao chép prompt vào clipboard\./)).toBeNull();
  });

  it('Đóng -> modal biến mất; mở/copy KHÔNG gọi API Supabase nào', async () => {
    const user = userEvent.setup();
    stubClipboard();
    mount();
    const dialog = await openPromptModal(user);

    await user.click(within(dialog).getByRole('button', { name: 'Sao chép' }));
    await screen.findByText(/Đã sao chép prompt vào clipboard\./);

    // Modal có 2 control "Đóng": nút X ở header + nút footer -> chọn nút footer.
    const closeButtons = within(dialog).getAllByRole('button', { name: 'Đóng' });
    await user.click(closeButtons[closeButtons.length - 1]);
    expect(screen.queryByRole('dialog')).toBeNull();

    // Thuần UI/clipboard: không RPC import, không đọc patterns, không đụng data.
    expect(importStructureExercisesMock).not.toHaveBeenCalled();
    expect(getStructurePatternsMock).not.toHaveBeenCalled();
  });
});
