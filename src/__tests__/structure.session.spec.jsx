import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StructureSession from '../pages/StructureSession/index.jsx';
import { AuthProvider } from '../hooks/useAuth.jsx';

// ------------------------------------------------------------------
// CHECKPOINT 8 — Structure Session: RANDOM ĐÚNG 1 EXERCISE mỗi phiên.
//
//   C. Exactly ONE exercise (bank 20 bài -> render đúng 1)
//   D. NO sequential progression (không "Bài 2", không exercise kế tiếp)
//   E. Answer flow: answer -> feedback -> rating UI
//   F. SRS timing: recordStructureResult KHÔNG gọi khi answer,
//      gọi ĐÚNG 1 LẦN sau rating
//   G. Stable identity: payload { userId, structureId, rating } — không exercise_id
//   K. No exercises: thông báo, không random, không SRS update
//
// Mock toàn bộ service layer; AuthProvider dùng seam initialUser.
// ------------------------------------------------------------------

const getStructureByIdMock = vi.fn();
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

vi.mock('../services/structure.service.js', () => ({
  getStructureById: (...a) => getStructureByIdMock(...a),
  getStructureExercises: (...a) => getStructureExercisesMock(...a),
}));

vi.mock('../services/structure-learning.service.js', () => ({
  getStructureSessionQueue: vi.fn(async () => ({ data: [], error: null })),
  recordStructureResult: (...a) => recordStructureResultMock(...a),
}));

const USER = { id: 'user-1', email: 'test@example.com' };

const STRUCTURE = {
  id: 's1',
  pattern: 'I want to + V',
  meaning: 'Tôi muốn...',
  explanation: 'Dùng để nói về mong muốn.',
  cefr: 'A1',
  topic: 'Daily Life',
  examples: [{ id: 'e1', sentence: 'I want to learn English.', translation: '' }],
  user_structures: null,
};

const CORRECT_OPTION = 'I want to learn English.';
const WRONG_OPTION = 'I want learn English.';

// Ngân hàng N exercises CÙNG structure — câu hỏi khác nhau để phân biệt được
// bài nào đang render. Nhiều bài cùng type là HOÀN TOÀN HỢP LỆ (CK8 #14).
function makeBank(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `x${i}`,
    type: 'multiple_choice',
    question: `Câu hỏi số ${i}?`,
    answer: CORRECT_OPTION,
    options: [WRONG_OPTION, CORRECT_OPTION, 'I want learning English.'],
    explanation: `Giải thích ${i}.`,
  }));
}

function mount() {
  return render(
    <MemoryRouter initialEntries={['/structures/session/s1']}>
      <AuthProvider initialUser={USER}>
        <Routes>
          <Route path="/structures/session/:structureId" element={<StructureSession />} />
          <Route path="/structures" element={<div>LIBRARY PAGE</div>} />
          {/* Đích "Về hàng đợi học cấu trúc" sau khi rating */}
          <Route path="/learn/structures" element={<div>STRUCTURE QUEUE PAGE</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

async function startExerciseSession(user) {
  // Intro KHÔNG còn hiển thị pattern (V2) — đợi nút Bắt đầu thay thế.
  await screen.findByRole('button', { name: /Bắt đầu/ });
  await user.click(screen.getByRole('button', { name: /Bắt đầu/ }));
  await screen.findByText(/Một bài tập ngẫu nhiên/);
}

describe('Structure Session (CK8 — random single exercise)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStructureByIdMock.mockResolvedValue({ data: STRUCTURE, error: null });
    getStructureExercisesMock.mockResolvedValue({ data: makeBank(20), error: null });
  });
  afterEach(() => cleanup());

  it('C. Bank 20 exercises -> render ĐÚNG 1 exercise, không phải tất cả', async () => {
    const user = userEvent.setup();
    mount();
    await startExerciseSession(user);

    // Đúng MỘT câu hỏi trong 20 câu được hiển thị:
    const visibleQuestions = Array.from({ length: 20 }, (_, i) => i).filter((i) =>
      screen.queryByText(`Câu hỏi số ${i}?`)
    );
    expect(visibleQuestions).toHaveLength(1);

    // Đúng một nút Kiểm tra (một exercise, không phải danh sách):
    expect(screen.getAllByRole('button', { name: 'Kiểm tra' })).toHaveLength(1);
    // KHÔNG còn nhãn progression "Exercise X/N" của CK5:
    expect(screen.queryByText(/Exercise \d+\//)).toBeNull();
  });

  it('D. KHÔNG sequential progression: sau feedback -> RATING (không exercise kế tiếp)', async () => {
    const user = userEvent.setup();
    mount();
    await startExerciseSession(user);

    const visibleBefore = Array.from({ length: 20 }, (_, i) => `Câu hỏi số ${i}?`).find(
      (q) => screen.queryByText(q)
    );
    expect(visibleBefore).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: new RegExp(CORRECT_OPTION) }));
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await user.click(await screen.findByRole('button', { name: /Tiếp tục/ }));

    // Chuyển thẳng sang rating — KHÔNG render thêm exercise nào khác:
    expect(await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/)).toBeTruthy();
    expect(screen.queryByText(/Câu hỏi số \d+\?/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kiểm tra' })).toBeNull();
  });

  it('E+F. Answer -> feedback -> rating UI; recordStructureResult CHỈ gọi sau rating', async () => {
    const user = userEvent.setup();
    mount();
    await startExerciseSession(user);

    // Trả lời ĐÚNG:
    await user.click(screen.getByRole('radio', { name: new RegExp(CORRECT_OPTION) }));
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));

    // Feedback hiển thị — nhưng SRS CHƯA được ghi khi mới answer:
    expect(await screen.findByText(/✅ Chính xác/)).toBeTruthy();
    expect(recordStructureResultMock).not.toHaveBeenCalled();

    // Sang rating UI:
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/)).toBeTruthy();
    for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
    // Vẫn chưa gọi SRS cho tới khi user chọn rating:
    expect(recordStructureResultMock).not.toHaveBeenCalled();

    // Rating GOOD -> recordStructureResult gọi ĐÚNG 1 LẦN với payload đúng:
    await user.click(screen.getByRole('button', { name: /^Good/ }));
    expect(await screen.findByText(/Đã lưu tiến trình!/)).toBeTruthy();
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1);
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 's1',
      rating: 3,
    });
  });

  it('G. Trả lời SAI vẫn do USER rating (correctness không tự thành AGAIN)', async () => {
    const user = userEvent.setup();
    mount();
    await startExerciseSession(user);

    await user.click(screen.getByRole('radio', { name: new RegExp(WRONG_OPTION) }));
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    expect(await screen.findByText(/❌ Chưa đúng/)).toBeTruthy();
    expect(screen.getByText('Đáp án:')).toBeTruthy();

    // User xem đáp án rồi TỰ chọn Hard (không bị ép Again):
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/);
    await user.click(screen.getByRole('button', { name: /^Hard/ }));
    expect(await screen.findByText(/Đã lưu tiến trình!/)).toBeTruthy();
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1);
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 's1',
      rating: 2,
    });
  });

  it('K. Bank RỖNG -> "Chưa có bài tập", KHÔNG rating, KHÔNG ghi SRS', async () => {
    const user = userEvent.setup();
    getStructureExercisesMock.mockResolvedValue({ data: [], error: null });
    mount();
    await screen.findByRole('button', { name: /Bắt đầu/ });
    await user.click(screen.getByRole('button', { name: /Bắt đầu/ }));

    expect(await screen.findByText(/Chưa có bài tập cho cấu trúc này\./)).toBeTruthy();
    // Không có UI rating và không có SRS update nào được gọi:
    expect(screen.queryByRole('button', { name: /^Again/ })).toBeNull();
    expect(recordStructureResultMock).not.toHaveBeenCalled();
  });

  it('Complete: về hàng đợi học cấu trúc (queue reload khi quay lại)', async () => {
    const user = userEvent.setup();
    mount();
    await startExerciseSession(user);
    await user.click(screen.getByRole('radio', { name: new RegExp(CORRECT_OPTION) }));
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    await user.click(await screen.findByRole('button', { name: /Tiếp tục/ }));
    await user.click(await screen.findByRole('button', { name: /^Good/ }));
    await screen.findByText(/Đã lưu tiến trình!/);

    // KHÔNG còn nút "Cấu trúc tiếp theo" trong cùng session (CK8 #10):
    expect(screen.queryByRole('button', { name: /Cấu trúc tiếp theo/ })).toBeNull();

    await user.click(screen.getByText('Về hàng đợi học cấu trúc'));
    expect(await screen.findByText('STRUCTURE QUEUE PAGE')).toBeTruthy();
  });

  it('PRODUCTION: self-check giữ nguyên — không tự chấm, không false confidence', async () => {
    const user = userEvent.setup();
    getStructureExercisesMock.mockResolvedValue({
      data: [
        {
          id: 'p1',
          type: 'production',
          question: 'Viết một câu sử dụng I want to + V.',
          answer: 'I want to go home.',
          options: [],
          explanation: 'E',
        },
      ],
      error: null,
    });
    mount();
    await startExerciseSession(user);

    const input = await screen.findByPlaceholderText('Viết câu của bạn...');
    await user.type(input, 'I want to play football.');
    await user.click(screen.getByRole('button', { name: /Tôi đã viết xong/ }));

    expect(await screen.findByText(/tự đánh giá|không chấm tự động/i)).toBeTruthy();
    expect(screen.queryByText(/✅ Chính xác/)).toBeNull();
    expect(screen.queryByText(/❌ Chưa đúng/)).toBeNull();
    expect(screen.getByText('I want to go home.')).toBeTruthy(); // câu mẫu tham khảo
  });

  it('getStructureExercises nhận structureId (scoping theo UUID, không pattern)', async () => {
    mount();
    await screen.findByRole('button', { name: /Bắt đầu/ });
    await waitFor(() =>
      expect(getStructureExercisesMock).toHaveBeenCalledWith('s1')
    );
  });

  // ---- V2: DAILY RECALL — KHÔNG lộ Structure trước khi trả lời ----
  it('V2: intro + exercise phase KHÔNG hiển thị pattern/meaning/explanation', async () => {
    const user = userEvent.setup();
    mount();

    // Intro trung tính:
    const startBtn = await screen.findByRole('button', { name: /Bắt đầu/ });
    expect(screen.queryByText('I want to + V')).toBeNull();
    expect(screen.queryByText('Tôi muốn...')).toBeNull();
    expect(screen.queryByText('Dùng để nói về mong muốn.')).toBeNull();
    expect(screen.queryByText('I want to learn English.')).toBeNull(); // ví dụ

    // Exercise phase (chưa submit):
    await user.click(startBtn);
    await screen.findByText(/Một bài tập ngẫu nhiên/);
    await screen.findByText(/Câu hỏi số \d+\?/);
    expect(screen.queryByText('I want to + V')).toBeNull();
    expect(screen.queryByText('Tôi muốn...')).toBeNull();
    expect(screen.queryByText('Dùng để nói về mong muốn.')).toBeNull();
  });

  it('V2: SAU KHI trả lời -> reveal Structure + đáp án + câu trả lời của user', async () => {
    const user = userEvent.setup();
    mount();
    await startExerciseSession(user);

    // Random có thể chọn BẤT KỲ bài nào trong 20 bài -> quét toàn bộ để tìm.
    const visibleQuestion = Array.from({ length: 20 }, (_, i) => `Câu hỏi số ${i}?`).find(
      (q) => screen.queryByText(q)
    );
    const visibleIndex = visibleQuestion.match(/\d+/)[0];
    await user.click(screen.getByRole('radio', { name: new RegExp(WRONG_OPTION) }));
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));

    // Feedback reveal đầy đủ theo thiết kế §7:
    expect(await screen.findByText('I want to + V')).toBeTruthy(); // pattern
    expect(screen.getByText('Tôi muốn...')).toBeTruthy(); // meaning
    expect(
      screen.getByText(`Giải thích ${visibleIndex}.`) || screen.getByText('Dùng để nói về mong muốn.')
    ).toBeTruthy(); // explanation
    expect(screen.getByText('Đáp án:')).toBeTruthy();
    expect(screen.getByText(CORRECT_OPTION)).toBeTruthy();
    expect(screen.getByText(/Câu trả lời của bạn:/)).toBeTruthy();
    expect(screen.getByText(WRONG_OPTION)).toBeTruthy();
  });

  it("V2-grading: nhiều accepted answers bằng '||' (fill_blank) + rating vẫn 1 lần", async () => {
    const user = userEvent.setup();
    getStructureExercisesMock.mockResolvedValue({
      data: [
        {
          id: 'fb-multi',
          type: 'fill_blank',
          question: 'I ___ to learn English every day.',
          answer: 'want || study',
          options: [],
          explanation: 'Dùng want to + V.',
        },
      ],
      error: null,
    });
    mount();
    await startExerciseSession(user);

    // Accepted thứ hai, viết HOA + thừa khoảng trắng -> vẫn đúng:
    await user.type(screen.getByPlaceholderText('Nhập câu trả lời...'), '  STUDY ');
    await user.click(screen.getByRole('button', { name: /Kiểm tra/ }));
    expect(await screen.findByText(/✅ Chính xác/)).toBeTruthy();
    expect(screen.getByText('Đáp án:')).toBeTruthy();
    expect(screen.getByText('want / study')).toBeTruthy();

    // Rating flow bình thường — recordStructureResult đúng 1 lần:
    await user.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    await screen.findByText(/Bạn nhớ cấu trúc này thế nào\?/);
    await user.click(screen.getByRole('button', { name: /^Easy/ }));
    expect(await screen.findByText(/Đã lưu tiến trình!/)).toBeTruthy();
    expect(recordStructureResultMock).toHaveBeenCalledTimes(1);
    expect(recordStructureResultMock).toHaveBeenCalledWith({
      userId: USER.id,
      structureId: 's1',
      rating: 4,
    });
  });
});


