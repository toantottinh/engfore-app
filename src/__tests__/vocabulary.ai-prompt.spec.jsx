import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Import from '../pages/Import/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';
import { VOCABULARY_AI_PROMPT } from '../utils/vocabulary-ai-prompt.js';

// ------------------------------------------------------------------
// Tests cho nút "Lệnh vocabulary" trên trang Nhập từ vựng:
//   - Đúng MỘT nút duy nhất.
//   - Click -> modal hiển thị TOÀN BỘ prompt chuẩn cho AI xử lý Vocabulary.
//   - "Sao chép" -> copy FULL prompt vào clipboard + báo thành công rõ ràng
//     (có fallback execCommand khi Clipboard API không khả dụng).
//   - Thuần UI/clipboard: mở/copy KHÔNG gọi API Supabase nào,
//     KHÔNG thay đổi dữ liệu vocabulary.
// ------------------------------------------------------------------

const getVocabularySetsMock = vi.fn(async () => ({ data: [], error: null }));
const getUserVocabularyMock = vi.fn(async () => ({ data: [], error: null }));
const importWordsMock = vi.fn(async () => ({ data: [], error: null, meta: { created: 0, existing: 0 } }));
const adminImportWordsMock = vi.fn(async () => ({ data: [], error: null, meta: { created: 0, existing: 0 } }));
const getAdminAllSetsMock = vi.fn(async () => ({ data: [], error: null }));
const getTopicsMock = vi.fn(async () => ({ data: [], error: null }));

vi.mock('../services/vocabulary.service.js', () => ({
  getVocabularySets: (...a) => getVocabularySetsMock(...a),
  getUserVocabulary: (...a) => getUserVocabularyMock(...a),
  importWords: (...a) => importWordsMock(...a),
  adminImportWords: (...a) => adminImportWordsMock(...a),
  getAdminAllSets: (...a) => getAdminAllSetsMock(...a),
  getTopics: (...a) => getTopicsMock(...a),
}));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: { id: 'user-1', role: 'admin' }, error: null }),
  },
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
    <MemoryRouter initialEntries={['/import']}>
      <AuthProvider initialUser={USER}>
        <Import />
      </AuthProvider>
    </MemoryRouter>
  );
}

async function openPromptModal(user) {
  const btn = await screen.findByRole('button', { name: 'Lệnh vocabulary' });
  await user.click(btn);
  return screen.getByRole('dialog', { name: 'Lệnh vocabulary' });
}

describe('Nút "Lệnh vocabulary" — hiển thị & nội dung prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVocabularySetsMock.mockResolvedValue({ data: [], error: null });
    getUserVocabularyMock.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    cleanup();
  });

  it('hiển thị đúng MỘT nút duy nhất tên "Lệnh vocabulary"', async () => {
    mount();
    const buttons = await screen.findAllByRole('button', { name: 'Lệnh vocabulary' });
    expect(buttons).toHaveLength(1);
  });

  it('click -> modal hiển thị TOÀN BỘ prompt chuẩn cho AI xử lý Vocabulary', async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await openPromptModal(user);

    // Đầu prompt phải xuất hiện trọn vẹn trong modal.
    expect(within(dialog).getByText(/Bạn là AI chuyên xử lý dữ liệu từ vựng tiếng Anh cho hệ thống EngFore\./)).toBeTruthy();
    // Người dùng phải thấy đủ header 7 cột trong prompt.
    expect(within(dialog).getByText(/Word \| IPA \| Type \| Meaning \| Example \| Memory Clue \| CEFR/)).toBeTruthy();
    // Có nút Sao chép.
    expect(within(dialog).getByRole('button', { name: 'Sao chép' })).toBeTruthy();
  });
});

describe('Hằng số VOCABULARY_AI_PROMPT — đúng chuẩn spec', () => {
  it('bắt đầu bằng lời chào AI xử lý Vocabulary của EngFore', () => {
    expect(
      VOCABULARY_AI_PROMPT.startsWith('Bạn là AI chuyên xử lý dữ liệu từ vựng tiếng Anh cho hệ thống EngFore.')
    ).toBe(true);
  });

  it('khai báo đúng format output 7 trường', () => {
    expect(VOCABULARY_AI_PROMPT).toContain('Word | IPA | Type | Meaning | Example | Memory Clue | CEFR');
    expect(VOCABULARY_AI_PROMPT).toContain('KHÔNG đánh số đầu dòng.');
    expect(VOCABULARY_AI_PROMPT).toContain('KHÔNG dùng bullet.');
    expect(VOCABULARY_AI_PROMPT).toContain('KHÔNG thêm markdown.');
    // Prompt cấm markdown fence -> chính prompt không được chứa code fence.
    expect(VOCABULARY_AI_PROMPT.includes('```')).toBe(false);
  });

  it('liệt kê đầy đủ các Type cho phép', () => {
    const allowed = [
      'noun',
      'verb',
      'adjective',
      'adverb',
      'pronoun',
      'preposition',
      'conjunction',
      'determiner',
      'interjection',
      'phrasal_verb',
      'other',
    ];
    allowed.forEach((t) => expect(VOCABULARY_AI_PROMPT).toContain(t));
    // Không được phép dùng verb_phrase theo spec mới.
    expect(VOCABULARY_AI_PROMPT).not.toContain('verb_phrase');
  });

  it('liệt kê đầy đủ các CEFR cho phép', () => {
    ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].forEach((c) =>
      expect(VOCABULARY_AI_PROMPT).toContain(c)
    );
  });

  it('phân biệt phrasal_verb với phrase (quy tắc đặc biệt)', () => {
    // toàn bộ Word là phrasal verb -> phrasal_verb
    expect(VOCABULARY_AI_PROMPT).toContain('wake up → phrasal_verb');
    expect(VOCABULARY_AI_PROMPT).toContain('wake up early → other');
    // Các phrase mẫu đều phải dùng other.
    expect(VOCABULARY_AI_PROMPT).toContain('go to work → other');
    expect(VOCABULARY_AI_PROMPT).toContain('in the morning → other');
    expect(VOCABULARY_AI_PROMPT).toContain('at home → other');
    expect(VOCABULARY_AI_PROMPT).toContain('take a break → other');
    // Không gán phrasal_verb cho cụm chỉ vì chứa phrasal verb.
    expect(VOCABULARY_AI_PROMPT).toContain('gán phrasal_verb cho một phrase');
  });

  it('gom đủ các quy tắc INPUT/OUTPUT/MEANING/EXAMPLE/MEMORY CLUE/IPA/DUPLICATE', () => {
    expect(VOCABULARY_AI_PROMPT).toContain('1. INPUT');
    expect(VOCABULARY_AI_PROMPT).toContain('2. OUTPUT');
    expect(VOCABULARY_AI_PROMPT).toContain('3. TYPE');
    expect(VOCABULARY_AI_PROMPT).toContain('4. WORD');
    expect(VOCABULARY_AI_PROMPT).toContain('5. MEANING');
    expect(VOCABULARY_AI_PROMPT).toContain('6. EXAMPLE');
    expect(VOCABULARY_AI_PROMPT).toContain('7. MEMORY CLUE');
    expect(VOCABULARY_AI_PROMPT).toContain('8. CEFR');
    expect(VOCABULARY_AI_PROMPT).toContain('9. IPA');
    expect(VOCABULARY_AI_PROMPT).toContain('10. DUPLICATE');
    expect(VOCABULARY_AI_PROMPT).toContain('11. QUY TẮC QUAN TRỌNG');
    // Nếu người dùng nhập sẵn pipe format -> giữ thông tin đúng, chỉ sửa thông tin sai.
    expect(VOCABULARY_AI_PROMPT).toContain('GIỮ LẠI');
    // Duplicate: không tạo duplicate.
    expect(VOCABULARY_AI_PROMPT).toContain('KHÔNG tạo duplicate');
  });
});
describe('"Sao chép" — clipboard & feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVocabularySetsMock.mockResolvedValue({ data: [], error: null });
    getUserVocabularyMock.mockResolvedValue({ data: [], error: null });
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
    expect(writeTextMock.mock.calls[0][0]).toBe(VOCABULARY_AI_PROMPT);
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

    // Thuần UI/clipboard: không RPC import, không đụng data vocabulary.
    expect(importWordsMock).not.toHaveBeenCalled();
    expect(adminImportWordsMock).not.toHaveBeenCalled();
  });
});

describe('Behavior import từ vựng — không bị ảnh hưởng bởi nút prompt', () => {
  it('vẫn parse danh sách từ đơn + preview bình thường khi bấm "Xem trước"', async () => {
    const user = userEvent.setup();
    getUserVocabularyMock.mockResolvedValue({ data: [], error: null });
    mount();

    await user.type(screen.getByLabelText('Dán nội dung từ vựng'), 'apple\nlion\nfan');
    await user.click(screen.getByRole('button', { name: 'Xem trước' }));

    expect(await screen.findByText(/Đã nhận diện 3 từ/)).toBeTruthy();
    // Chỉ gọi đọc kho từ, KHÔNG gọi import (nút Import không bị auto-click).
    expect(getUserVocabularyMock).toHaveBeenCalledTimes(1);
    expect(importWordsMock).not.toHaveBeenCalled();
    expect(adminImportWordsMock).not.toHaveBeenCalled();
  });
});