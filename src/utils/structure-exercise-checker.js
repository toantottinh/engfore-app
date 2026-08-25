/**
 * Answer checker cho Structure Exercises (CHECKPOINT 5+6).
 *
 * Chỉ kiểm tra deterministic content/integrity — KHÔNG NLP, KHÔNG grammar AI,
 * KHÔNG synonym/stemming. Production KHÔNG dùng automatic pass/fail:
 *   -> self-check flow (xem production-checker.js).
 *
 * Normalization tối thiểu cho mọi kiểu: trim + collapse whitespace +
 * case-insensitive. coursework exact-match.
 */

/**
 * Chuẩn hóa một câu trả lời để so sánh deterministic.
 * Bước chuẩn hóa: lowercase + bỏ dấu câu đơn giản (. , ! ? ; : ' " ()) +
 * collapse whitespace + trim. Điều này tránh false-negative khi đáp án tham
 * khảo có dấu chấm cuối câu nhưng user xếp token không thể tạo dấu câu
 * (vd rearrange), và khớp mức "punctuation normalization đơn giản" được phép.
 * KHÔNG stemming / synonym / NLP.
 * @param {string} value
 * @returns {string}
 */
export function normalizeAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[.,!?;:'"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ------------------------------------------------------------------
// MULTIPLE ACCEPTED ANSWERS (EXERCISE V2)
// Một Answer có thể chứa NHIỀU đáp án được chấp nhận, phân cách bằng "||":
//   "want || study"
// MỖI đáp án được normalize RIÊNG rồi so exact-match. Delimiter này KHÁC với
// ";;" (dành cho Options ở cột Options lúc import) — hai delimiter không trộn.
// KHÔNG fuzzy matching, KHÔNG Levenshtein, KHÔNG AI semantic grading.
// ------------------------------------------------------------------

/** Delimiter giữa các accepted answers trong trường Answer. */
export const ACCEPTED_ANSWERS_DELIMITER = '||';

/**
 * Tách trường Answer thành danh sách accepted answers (trim + bỏ rỗng).
 * @param {string} answer - raw answer từ DB (có thể chứa "||")
 * @returns {string[]} danh sách đáp án gốc (chưa normalize)
 */
export function getAcceptedAnswers(answer) {
  return String(answer || '')
    .split(ACCEPTED_ANSWERS_DELIMITER)
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * Đánh giá một câu trả lời của user so với exercise (deterministic types).
 *
 * V2: Answer có thể chứa NHIỀU accepted answers phân cách bằng "||"
 * (vd "want || study") — mỗi đáp án được normalize RIÊNG, khớp BẤT KỲ một
 * đáp án là đúng. Exact-match sau normalization; KHÔNG fuzzy/AI grading.
 *
 * @param {object} exercise - { id, type, question, answer, options, explanation }
 * @param {string} userAnswer
 * @returns {{
 *   selfCheck: boolean,
 *   correct: boolean | null,      // null với production (không tự chấm)
 *   correctAnswer: string,        // đáp án tham khảo để hiển thị (multi -> "a / b")
 *   acceptedAnswers: string[],    // danh sách accepted answers gốc (đã trim)
 *   explanation: string | null,
 *   reason: string | null         // ghi chú feedback (vd rearrange, production)
 * }}
 */
export function checkExerciseAnswer(exercise = {}, userAnswer = '') {
  const type = exercise.type;
  const explanation = exercise.explanation || null;
  const normalizedUser = normalizeAnswer(userAnswer);

  // Tách accepted answers ("||"), mỗi đáp án normalize RIÊNG.
  const acceptedAnswers = getAcceptedAnswers(exercise.answer);
  const acceptedNormalized = acceptedAnswers.map(normalizeAnswer);
  const answer = String(exercise.answer || '');
  const displayAnswer = acceptedAnswers.join(' / ');

  switch (type) {
    case 'multiple_choice':
    case 'fill_blank':
    case 'translation':
    case 'correction':
      return {
        selfCheck: false,
        correct: acceptedNormalized.includes(normalizedUser),
        correctAnswer: displayAnswer,
        acceptedAnswers,
        explanation,
        reason: null,
      };

    case 'rearrange': {
      // User nhập/xếp câu ghép; so với MỖI accepted answer đã normalize.
      return {
        selfCheck: false,
        correct: acceptedNormalized.includes(normalizedUser),
        correctAnswer: displayAnswer,
        acceptedAnswers,
        explanation,
        reason: acceptedNormalized.includes(normalizedUser)
          ? null
          : 'Hãy ghép đúng thứ tự các từ để tạo thành câu hoàn chỉnh.',
      };
    }

    case 'production':
      // KHÔNG tự chấm "đúng/sai". Self-check — user tự đánh giá ở rating.
      // Answer (nếu có) chỉ là example/target để đối chiếu.
      return {
        selfCheck: true,
        correct: null,
        correctAnswer: answer, // chỉ để hiển thị target/example, không dùng chấm
        acceptedAnswers,
        explanation,
        reason: 'Không tự chấm câu của bạn — đối chiếu với câu mẫu và tự nhận xét.',
      };

    default:
      return {
        selfCheck: true,
        correct: null,
        correctAnswer: '',
        acceptedAnswers: [],
        explanation,
        reason: 'Không xác định được kiểu bài tập.',
      };
  }
}