import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StructureReview from '../pages/StructureReview/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// ENCOUNTER MODES trên Structure Review Session (/learn/structures/session)
//
// Một Structure = MỘT knowledge item SRS; exercise là công cụ kiểm tra:
//
//   NEW    -> sequence ≤6 bài theo thứ tự ổn định; KHÔNG rating giữa chừng;
//             progress "Bài x/n"; rating chỉ sau bài cuối; sai vẫn chạy tiếp.
//   AGAIN  -> giống NEW (sequence đủ rồi mới chấm lại).
//   HARD   (review + last_rating=2/null) -> RANDOM 1 bài + reveal giữ nguyên.
//   GOOD/EASY (last_rating=3/4)          -> RANDOM 1 bài PURE TEST: pattern /
//             meaning / explanation không bao giờ render trong cả phiên.
//   ISOLATION: exercise của structure A không lọt vào lượt của B và ngược lại.
//
// Mock toàn bộ service layer (cùng pattern với CK10 spec).
// ------------------------------------------------------------------

const getStructureSessionQueueMock = vi.fn();
const getStructureExercisesMock = vi.fn();
const recordStructureResultMock = vi.fn(async () => ({
  progress: {
    state: 'learning',
    learning_step: 0,
    last_rating: 3,
    review_due_at: new Date(Date.now() + 3600e3).toISOString(),
  },
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
  getUserDailyNewStructureLimit: vi.fn(async () => ({ value: 5, error: null })),
  getDailyNewStructureProgress: vi.fn(async () => ({ data: [], error: null })),
  markNewStructureIntroduced: vi.fn(async () => ({ error: null })),
}));

vi.mock('../services/structure.service.js', () => ({
  getStructureById: vi.fn(),
  getStructureExercises: (...a) => getStructureExercisesMock(...a),
}));

const USER = { id: 'user-1', email: 'test@example.com' };
const YESTERDAY = new Date(Date.now() - 86400e3).toISOString();

function fb(id, question) {
  return {
    id,
    type: 'fill_blank',
    question,
    answer: `ans-${id}`,
    options: [],
    explanation: `expl-${id}`,
    created_at: id,
  };
}

function mountWith(queue, banks) {
  getStructureSessionQueueMock.mockResolvedValue({ data: queue, error: null });
  getStructureExercisesMock.mockImplementation(async (sid) => ({
    data: banks[sid] || [],
    error: null,
  }));
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

const RATE_PROMPT = /Bạn nhớ cấu trúc này thế nào\?/;
const PROGRESS_TESTID = 'structure-sequence-progress';

describe('Encounter mode NEW — sequence 6 bài theo thứ tự', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('NEW-1..5: 7-bank lấy 6 đầu, đúng thứ tự, rating chỉ sau 6/6, SRS đúng 1 lần', async () => {
    const user = userEvent.setup();
    const SN_BANK = Array.from({ length: 7 }, (_, i) => fb(`sne${i}`, `NEWQ-${i}?`));
    mountWith(
      [
        {
          id: 'sn-1',
          structureId: 'sn-1',
          pattern: 'I need to + V',
          meaning: 'Tôi cần...',
          user_structures: null,
        },
      ],
      { 'sn-1': SN_BANK }
    );

    // Bài đầu xuất hiện ngay, progress 1/6 — không hiện rating:
    await screen.findByText('NEWQ-0?');
    expect(screen.getByTestId(PROGRESS_TESTID)).toHaveTextContent('Bài 1/6');
    expect(screen.queryByText(RATE_PROMPT)).toBeNull();
    expect(recordStructureResultMock).not.toHaveBeenCalled();

    // Làm NEWQ-0 → NEWQ-4 (không random): sau mỗi bài vẫn KHÔNG rating.
    for (let i = 0; i <= 4; i += 1) {
      await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'whatever');
      await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
      await screen.findByRole('button', { name: /Tiếp tục/ }); // feedback đã hiện
      // Trả lời SAI (đáp án tùy ý) cũng KHÔNG bị chấm Structure giữa chừng:
      expect(screen.queryByText(RATE_PROMPT)).toBeNull();
      expect(recordStructureResultMock).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
      if (i < 4) {
        await screen.findByText(`NEWQ-${i + 1}?`);
        expect(screen.getByTestId(PROGRESS_TESTID)).toHaveTextContent(`Bài ${i + 2}/6`);
        expect(screen.queryByText(`NEWQ-${i}`)).toBeNull();
        // Bài thứ 7 của bank KHÔNG được nhét vào sequence:
        expect(screen.queryByText('NEWQ-6?')).toBeNull();
      }
    }

    // Sau bài 6/6 mới hiện rating:
    expect(screen.getByTestId(PROGRESS_TESTID)).toHaveTextContent('Bài 6/6');
    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'x');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByRole('button', { name: /Tiếp tục/ });
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(await screen.findByText(RATE_PROMPT)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Hard/ }));
    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1); // MỘT thẻ SRS/structure
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 'sn-1',
      rating: 2,
    });
  }, 20000);
});

describe('Encounter mode AGAIN — sequence luyện lại rồi mới chấm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('AGAIN: 2 bài đúng thứ tự A→B, rating chỉ sau bài cuối, SRS 1 lần', async () => {
    const user = userEvent.setup();
    mountWith(
      [
        {
          id: 'lg-1',
          structureId: 'lg-1',
          pattern: 'There is / There are',
          meaning: 'Có...',
          user_structures: { state: 'relearning', learning_step: 0, review_due_at: YESTERDAY },
        },
      ],
      { 'lg-1': [fb('lge0', 'AGAINQ-A?'), fb('lge1', 'AGAINQ-B?')] }
    );

    await screen.findByText('AGAINQ-A?');
    expect(screen.getByTestId(PROGRESS_TESTID)).toHaveTextContent('Bài 1/2');
    expect(screen.queryByText(RATE_PROMPT)).toBeNull();

    // E1 -> E2:
    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'zzz');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByRole('button', { name: /Tiếp tục/ });
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));

    await screen.findByText('AGAINQ-B?');
    expect(screen.getByTestId(PROGRESS_TESTID)).toHaveTextContent('Bài 2/2');
    expect(screen.queryByText(RATE_PROMPT)).toBeNull(); // KHÔNG chấm giữa chừng
    expect(recordStructureResultMock).not.toHaveBeenCalled();

    // E2 xong -> rating:
    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'zzz');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByRole('button', { name: /Tiếp tục/ });
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(await screen.findByText(RATE_PROMPT)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Good/ }));
    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1);
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 'lg-1',
      rating: 3,
    });
  }, 15000);
});

describe('Encounter modes review-state — HARD guided vs GOOD/EASY pure test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  function dueStructure(id, lastRating) {
    const prog = { state: 'review', review_due_at: YESTERDAY };
    if (lastRating !== undefined) prog.last_rating = lastRating;
    return {
      id,
      structureId: id,
      pattern: `${id.toUpperCase()}-PATTERN`,
      meaning: `${id.toUpperCase()}-MEANING`,
      explanation: `${id.toUpperCase()}-EXPLANATION`,
      user_structures: prog,
    };
  }

  async function answerAndContinue(user) {
    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'zzz');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByRole('button', { name: /Tiếp tục/ });
  }

  it('HARD (last_rating=2): random 1 bài + reveal giữ nguyên sau submit', async () => {
    const user = userEvent.setup();
    mountWith([dueStructure('hrd-1', 2)], { 'hrd-1': [fb('he0', 'HARDQ-0?'), fb('he1', 'HARDQ-1?')] });

    await screen.findByText(/HARDQ-\d\?/); // ĐÚNG MỘT exercise random
    // Không có progress sequence (không ép 6 bài):
    expect(screen.queryByTestId(PROGRESS_TESTID)).toBeNull();

    await answerAndContinue(user);
    // Behavior hiện tại được giữ nguyên: reveal Structure sau khi trả lời.
    expect(await screen.findByText('HRD-1-PATTERN')).toBeTruthy();
    expect(screen.getByText('HRD-1-MEANING')).toBeTruthy();
    expect(screen.getByText('Cấu trúc')).toBeTruthy(); // panel reveal hiện diện

    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(await screen.findByText(RATE_PROMPT)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Good/ }));
    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();
  }, 15000);

  it.each([
    ['GOOD', 3],
    ['EASY', 4],
  ])('%s (last_rating=%i): PURE TEST — không hint/pattern/scaffold trong cả phiên', async (_, rating) => {
    const user = userEvent.setup();
    mountWith(
      [dueStructure(`gz-${rating}`, rating)],
      {
        [`gz-${rating}`]: [
          fb('gze0', 'GZQ-A?'),
          fb('gze1', 'GZQ-B?'),
          fb('gze2', 'GZQ-C?'),
        ],
      }
    );

    // Trước khi trả lời: chỉ có context/question — KHÔNG lộ công thức.
    const q = await screen.findByText(/GZQ-[ABC]\?/);
    expect(q.textContent).toMatch(/^GZQ-[ABC]\?$/);
    expect(screen.queryByText('GZ-3-PATTERN')).toBeNull();
    expect(screen.queryByText('GZ-4-PATTERN')).toBeNull();
    expect(screen.queryByTestId(PROGRESS_TESTID)).toBeNull(); // random, không sequence

    await answerAndContinue(user);

    // Sau submit cũng KHÔNG render hint (khác behavior guided):
    await screen.findByRole('button', { name: /Tiếp tục/ });
    for (const hidden of ['GZ-3-PATTERN', 'GZ-4-PATTERN', 'GZ-3-MEANING', 'GZ-4-MEANING']) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
    expect(screen.queryByText('Cấu trúc')).toBeNull(); // panel reveal bị tắt

    // Đáp án của bài VỪA trả lời vẫn hiển thị (error-driven, không phải hint mới):
    expect(screen.getByText(/Câu trả lời của bạn:/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(await screen.findByText(RATE_PROMPT)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Good/ }));
    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();
    expect(getStructureExercisesMock).toHaveBeenCalledTimes(1); // đúng 1 exercise/lượt
  }, 15000);
});

describe('ISOLATION giữa các structure trong cùng phiên', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('A-NEW sequence không lộ bài của B; SRS của A không đụng B; lượt B chỉ dùng bank của B', async () => {
    const user = userEvent.setup();
    mountWith(
      [
        {
          id: 'iso-a',
          structureId: 'iso-a',
          pattern: 'PATTERN-A',
          meaning: 'MEANING-A',
          user_structures: null, // NEW -> sequence
        },
        {
          id: 'iso-b',
          structureId: 'iso-b',
          pattern: 'PATTERN-B',
          meaning: 'MEANING-B',
          user_structures: { state: 'review', review_due_at: YESTERDAY, last_rating: 2 }, // guided random
        },
      ],
      {
        'iso-a': [fb('ae0', 'ISOAQ-A0?'), fb('ae1', 'ISOAQ-A1?')],
        'iso-b': [fb('be0', 'ISOBQ-B0?'), fb('be1', 'ISOBQ-B1?')],
      }
    );

    // Lượt của A: không bao giờ thấy bài của B.
    await screen.findByText('ISOAQ-A0?');
    expect(screen.queryByText(/ISOBQ-/)).toBeNull();
    expect(screen.getByTestId(PROGRESS_TESTID)).toHaveTextContent('Bài 1/2');

    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'zzz');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByRole('button', { name: /Tiếp tục/ });
    expect(screen.queryByText(/ISOBQ-/)).toBeNull(); // cả khi đang feedback
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await screen.findByText('ISOAQ-A1?');
    expect(screen.queryByText(/ISOBQ-/)).toBeNull();

    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'zzz');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByRole('button', { name: /Tiếp tục/ });
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(await screen.findByText(RATE_PROMPT)).toBeTruthy();

    // Chấm A — đúng structureId của A, KHÔNG đụng B:
    await user.click(screen.getByRole('button', { name: /^Hard/ }));

    // Tự động sang lượt của B — chỉ có bài của B:
    expect(await screen.findByText(/ISOBQ-B\d\?/)).toBeTruthy();
    expect(screen.queryByText(/ISOAQ-/)).toBeNull();
    expect(screen.queryByTestId(PROGRESS_TESTID)).toBeNull(); // B là random

    getStructureExercisesMock.mock.calls.forEach(([sid], idx) => {
      expect(sid).toBe(idx === 0 ? 'iso-a' : 'iso-b'); // fetch scope theo UUID
    });

    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), 'zzz');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await screen.findByRole('button', { name: /Tiếp tục/ });
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(await screen.findByText(RATE_PROMPT)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Good/ }));
    expect(await screen.findByText(/Hoàn thành!/)).toBeTruthy();

    // Mỗi structure đúng MỘT lần SRS update, thứ tự theo queue:
    expect(recordStructureResultMock).toHaveBeenCalledTimes(2);
    expect(recordStructureResultMock.mock.calls.map((c) => c[0].structureId)).toEqual([
      'iso-a',
      'iso-b',
    ]);
  }, 20000);
});
