import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StructureReview from '../pages/StructureReview/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// CK10 — STRUCTURE REVIEW SESSION (auto-select, giống Vocabulary Review).
//
//   15/16. system tự chọn Structure — user không chọn thủ công
//   17.    thứ tự queue DUE → LEARNING → NEW giữ nguyên
//   18.    exercises load đúng theo structure_id của item được chọn
//   19/20. mỗi review render ĐÚNG 1 exercise thuộc structure đó
//   21/22. neutral recall — không lộ pattern trước submit
//   23-25. feedback: user answer + correct answer + reveal Structure
//   26/27. sai vẫn được phép Hard (correctness không override rating)
//   28/29. submit không gọi SRS; rating gọi đúng 1 lần/lượt
//   30/31. sau rating TỰ ĐỘNG sang structure kế tiếp + random exercise mới
//   32.    empty bank -> skip an toàn
//   33.    tất cả đều rỗng -> thông báo riêng, không SRS
//   34.    completion state + Học tiếp (reload queue)
//   35.    production self-check trong luồng review
// ------------------------------------------------------------------

const getStructureSessionQueueMock = vi.fn();
const getStructureExercisesMock = vi.fn();
const recordStructureResultMock = vi.fn(async () => ({
  progress: { state: 'learning', review_due_at: new Date(Date.now() + 3600e3).toISOString() },
  error: null,
}));

vi.mock('../services/auth.service.js', () => ({
  authService: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    ensureProfile: async () => ({ data: null, error: null }),
  },
}));

vi.mock('../services/structure-learning.service.js', () => ({
  getStructureSessionQueue: (...a) => getStructureSessionQueueMock(...a),
  recordStructureResult: (...a) => recordStructureResultMock(...a),
}));

vi.mock('../services/structure.service.js', () => ({
  getStructureById: vi.fn(),
  getStructureExercises: (...a) => getStructureExercisesMock(...a),
}));

const USER = { id: 'user-1', email: 'test@example.com' };
const YESTERDAY = new Date(Date.now() - 86400e3).toISOString();
const TOMORROW = new Date(Date.now() + 86400e3).toISOString();

// Queue ĐÃ được service xếp sẵn DUE → LEARNING → NEW (contract CK7).
const QUEUE = [
  {
    id: 'due-1',
    structureId: 'due-1',
    pattern: 'I want to + V',
    meaning: 'Tôi muốn...',
    user_structures: { state: 'review', review_due_at: YESTERDAY },
  },
  {
    id: 'learn-1',
    structureId: 'learn-1',
    pattern: 'There is / There are',
    meaning: 'Có...',
    user_structures: { state: 'learning', learning_step: 0, review_due_at: TOMORROW },
  },
  {
    id: 'new-1',
    structureId: 'new-1',
    pattern: 'be going to + V',
    meaning: 'Sẽ...',
    user_structures: null,
  },
];

// Ngân hàng bài tập THEO structure_id — câu hỏi khác nhau để định vị luồng.
const DEFAULT_BANKS = {
  'due-1': [
    {
      id: 'd-e1',
      type: 'multiple_choice',
      question: 'MC-DUE?',
      answer: 'Đáp án đúng DUE',
      options: ['Sai 1', 'Đáp án đúng DUE', 'Sai 2'],
      explanation: 'Giải thích DUE.',
    },
  ],
  'learn-1': [
    { id: 'l-e1', type: 'fill_blank', question: 'FB-LEARN?', answer: 'is', options: [], explanation: 'Giải thích LEARN.' },
    { id: 'l-e2', type: 'translation', question: 'TR-LEARN?', answer: 'there is', options: [], explanation: 'Giải thích LEARN 2.' },
  ],
  'new-1': [
    { id: 'n-e1', type: 'correction', question: 'CO-NEXT?', answer: 'going to learn', options: [], explanation: 'Giải thích NEW.' },
  ],
};

function setupBanks(banks) {
  getStructureExercisesMock.mockImplementation(async (sid) => ({
    data: banks[sid] || [],
    error: null,
  }));
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/learn/structures/session']}>
      <AuthProvider initialUser={USER}>
        <Routes>
          <Route path="/learn/structures/session" element={<StructureReview />} />
          <Route path="/learn/structures" element={<div>STRUCTURE QUEUE PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function answerCurrentAndContinue(user, userAnswer, checkFn) {
  if (checkFn) await checkFn();
  await user.click(screen.getByRole('button', { name: /Kiểm tra|Tôi đã viết xong/ }));
}

describe('Structure Review Session (CK10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStructureSessionQueueMock.mockResolvedValue({ data: QUEUE, error: null });
    setupBanks(DEFAULT_BANKS);
  });
  afterEach(() => cleanup());

  it('15-20. tự chọn structure ĐẦU TIÊN (DUE), load đúng bank, render đúng 1 exercise', async () => {
    mount();

    // System tự chọn — không có UI chọn structure:
    const q = await screen.findByText('MC-DUE?');
    expect(q).toBeTruthy();
    expect(getStructureSessionQueueMock).toHaveBeenCalledWith(USER.id);
    // Scope đúng structure_id của item đầu tiên trong queue (DUE):
    expect(getStructureExercisesMock).toHaveBeenNthCalledWith(1, 'due-1');

    // Render ĐÚNG MỘT exercise — các câu hỏi khác của các bank KHÁC không xuất hiện:
    expect(screen.queryByText('FB-LEARN?')).toBeNull();
    expect(screen.queryByText('TR-LEARN?')).toBeNull();
    expect(screen.queryByText('CO-NEXT?')).toBeNull();
    expect(screen.getAllByText(/MC-DUE\?|FB-LEARN\?|TR-LEARN\?|CO-NEXT\?/)).toHaveLength(1);

    // 17. Thứ tự DUE → LEARNING → NEW: item hiện tại là due-1 (queue[0]).
    expect(screen.getByText('Cấu trúc 1/3')).toBeTruthy();
  });

  it('21-22. NEUTRAL RECALL: không lộ pattern/meaning của BẤT KỲ cấu trúc nào trước submit', async () => {
    mount();
    await screen.findByText('MC-DUE?');
    for (const pattern of ['I want to + V', 'There is / There are', 'be going to + V']) {
      expect(screen.queryByText(pattern)).toBeNull();
    }
    expect(screen.queryByText('Tôi muốn...')).toBeNull();
    expect(screen.queryByText('Có...')).toBeNull();
  });

  it('23-29. sai -> feedback đầy đủ; submit chưa gọi SRS; Hard sau khi sai -> rating=2 ×1; tự sang structure kế', async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText('MC-DUE?');

    // Trả lời SAI (chọn option sai):
    await user.click(screen.getByRole('radio', { name: 'Sai 1' }));
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));

    // Feedback: verdict + user answer + correct answer + reveal Structure:
    expect(await screen.findByText(/❌ Chưa đúng/)).toBeTruthy();
    expect(screen.getByText(/Câu trả lời của bạn:/)).toBeTruthy();
    expect(screen.getByText('Sai 1')).toBeTruthy();
    expect(screen.getByText('Đáp án:')).toBeTruthy();
    expect(screen.getByText('Đáp án đúng DUE')).toBeTruthy();
    expect(screen.getByText('I want to + V')).toBeTruthy(); // reveal SAU submit
    expect(screen.getByText('Tôi muốn...')).toBeTruthy();

    // 28. Submit/feedback KHÔNG update SRS:
    expect(recordStructureResultMock).not.toHaveBeenCalled();

    // 26/27. User TỰ chọn HARD dù trả lời sai (không bị ép AGAIN):
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/);
    await user.click(screen.getByRole('button', { name: /^Hard/ }));

    // 29. ĐÚNG MỘT lần, payload sạch (không exercise_id):
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1);
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 'due-1',
      rating: 2,
    });

    // 30/31. TỰ ĐỘNG chuyển sang structure kế tiếp (LEARNING) + exercise của nó.
    // learn-1 có 2 bài (FB-LEARN?/TR-LEARN?) — chờ câu hỏi mới bất kỳ xuất hiện:
    await screen.findByText('Cấu trúc 2/3');
    const nextQ = await screen.findAllByText(/FB-LEARN\?|TR-LEARN\?/);
    expect(nextQ.length).toBeGreaterThan(0);
    expect(getStructureExercisesMock).toHaveBeenNthCalledWith(2, 'learn-1');
    expect(screen.queryByText('MC-DUE?')).toBeNull();
  });

  it('30-34. full phiên: LEARNING -> NEW -> completion 🎉 + Học tiếp reload queue', async () => {
    // 3 chu kỳ answer+rating tuần tự với real timers — ca. 2.5-3s khi đơn lẻ,
    // dễ chạm timeout 5s mặc định khi full suite chạy song song. Nới timeout
    // CHO RIÊNG test này (không đổi global config/behavior).
    const user = userEvent.setup();
    mount();
    await screen.findByText('MC-DUE?');

    const rate = async (label) => {
      await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
      await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/);
      await user.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
    };

    // 1) DUE — Good
    await user.click(screen.getByRole('radio', { name: 'Đáp án đúng DUE' }));
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByText(/✅ Chính xác/);
    await rate('Good');

    // 2) LEARNING (2 bài có thể được random chọn — chờ "Cấu trúc 2/3" rồi xử lý cả hai)
    await screen.findByText('Cấu trúc 2/3');
    const learnQ = (await screen.findAllByText(/FB-LEARN\?|TR-LEARN\?/))[0];
    if (learnQ.textContent === 'TR-LEARN?') {
      await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'there is');
    } else {
      await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'is');
    }
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByText(/✅ Chính xác/);
    await rate('Good');

    // 3) NEW (có đúng 1 bài) -> Easy -> hết queue -> COMPLETION
    await screen.findByText('Cấu trúc 3/3');
    expect(screen.getByText('CO-NEXT?')).toBeTruthy();
    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'going to learn');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByText(/✅ Chính xác/);
    await rate('Easy');

    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();
    // Ba lượt rating, mỗi lượt đúng một structure theo queue:
    expect(recordStructureResultMock).toHaveBeenCalledTimes(3);
    expect(recordStructureResultMock.mock.calls.map((c) => c[0].structureId)).toEqual([
      'due-1',
      'learn-1',
      'new-1',
    ]);

    // 34. Học tiếp -> reload queue (không quay về màn hình chọn structure):
    await user.click(screen.getByRole('button', { name: /Học tiếp/ }));
    await waitForQueueReload();
    expect(await screen.findByText('MC-DUE?')).toBeTruthy();
  }, 15000);

  // 32. EMPTY BANK: structure không có bài tập bị SKIP an toàn.
  it('32. empty bank -> skip, KHÔNG rating/KHÔNG SRS cho structure rỗng', async () => {
    const user = userEvent.setup();
    setupBanks({
      'a-empty': [],
      'b-has': [
        { id: 'b1', type: 'fill_blank', question: 'Q-B-HAS?', answer: 'x', options: [], explanation: null },
      ],
    });
    getStructureSessionQueueMock.mockResolvedValue({
      data: [
        { id: 'a-empty', pattern: 'Empty A', user_structures: null },
        { id: 'b-has', pattern: 'Has B', user_structures: null },
      ],
      error: null,
    });

    mount();

    // Cả hai id đều được load (theo thứ tự), nhưng chỉ b-has được chơi:
    await screen.findByText('Q-B-HAS?');
    expect(getStructureExercisesMock).toHaveBeenNthCalledWith(1, 'a-empty');
    expect(getStructureExercisesMock).toHaveBeenNthCalledWith(2, 'b-has');
    expect(screen.queryByText('Empty A')).toBeNull(); // đã bị bỏ qua

    // Hoàn thành lượt của b-has -> completion nhắc số cấu trúc bị bỏ qua:
    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'x');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByText(/✅ Chính xác/);
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/);
    await user.click(screen.getByRole('button', { name: /^Good/ }));

    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();
    expect(screen.getByText(/Đã bỏ qua 1 cấu trúc chưa có bài tập/)).toBeTruthy();
    // SRS chỉ ghi đúng một lần cho structure CÓ bài tập:
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1);
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 'b-has',
      rating: 3,
    });
  });

  it('33. TẤT CẢ structures đều rỗng bài tập -> thông báo riêng, 0 SRS update', async () => {
    setupBanks({});
    getStructureSessionQueueMock.mockResolvedValue({
      data: [
        { id: 'e1', pattern: 'E1', user_structures: null },
        { id: 'e2', pattern: 'E2', user_structures: null },
      ],
      error: null,
    });

    mount();

    expect(await screen.findByText(/Không có bài tập cấu trúc để học lúc này\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Again/ })).toBeNull();
    expect(getStructureExercisesMock).toHaveBeenCalledTimes(2); // e1 rồi e2
    expect(recordStructureResultMock).not.toHaveBeenCalled();
  });

  it('34b. Queue rỗng -> completion "Chưa có cấu trúc nào để học lúc này."', async () => {
    getStructureSessionQueueMock.mockResolvedValue({ data: [], error: null });
    mount();
    expect(await screen.findByText(/Chưa có cấu trúc nào để học lúc này\./)).toBeTruthy();
  });

  it('35. PRODUCTION trong review: self-check + reference + rating vẫn 1 lần', async () => {
    const user = userEvent.setup();
    setupBanks({
      'due-1': [
        {
          id: 'p1',
          type: 'production',
          question: 'Nói một câu diễn tả mong muốn.',
          answer: 'I want to sleep.',
          options: [],
          explanation: 'Dùng want to + V.',
        },
      ],
    });

    mount();
    await screen.findByPlaceholderText('Viết câu của bạn...');
    await user.type(screen.getByPlaceholderText('Viết câu của bạn...'), 'I want to play games.');
    await user.click(screen.getByRole('button', { name: /Tôi đã viết xong/ }));

    // Self-check: KHÔNG tự chấm đúng/sai, có câu mẫu tham khảo:
    expect(await screen.findByText(/tự đánh giá|không chấm tự động/i)).toBeTruthy();
    expect(screen.queryByText(/✅ Chính xác/)).toBeNull();
    expect(screen.getByText('I want to sleep.')).toBeTruthy();
    expect(screen.getByText('I want to + V')).toBeTruthy(); // reveal

    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/);
    await user.click(screen.getByRole('button', { name: /^Good/ }));
    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1);
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 'due-1',
      rating: 3,
    });
  });

  it('36b. Queue service lỗi -> Alert lỗi rõ ràng, không crash', async () => {
    getStructureSessionQueueMock.mockRejectedValue(new Error('boom'));
    mount();
    expect(await screen.findByText(/Không thể tải phiên ôn cấu trúc/)).toBeTruthy();
  });

  it('36b. Queue service lỗi -> Alert lỗi rõ ràng, không crash', async () => {
    getStructureSessionQueueMock.mockRejectedValue(new Error('boom'));
    mount();
    expect(await screen.findByText(/Không thể tải phiên ôn cấu trúc/)).toBeTruthy();
  });
});

// Helper cho test 34: chờ "Học tiếp" trigger reload queue (lần gọi thứ 2).
async function waitForQueueReload() {
  await waitFor(() => expect(getStructureSessionQueueMock).toHaveBeenCalledTimes(2));
}



