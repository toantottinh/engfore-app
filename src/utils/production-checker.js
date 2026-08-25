/**
 * Production checker V1 (KHÔNG tích hợp AI / grammar engine / dictionary).
 *
 * Mục tiêu: KHÔNG tuyên bố câu đúng 100% khi hệ thống không đủ dữ liệu.
 * Production luôn rơi về SELF-CHECK: user tự viết, đối chiếu câu mẫu, và tự
 * đánh giá qua rating.
 *
 * Những gì hàm này làm (chỉ mang tính GỢI Ý, không chấm điểm):
 *   - trích fixed tokens từ pattern (bỏ các placeholder như "+ V", "___")
 *   - kiểm tra sơ bộ xem câu user có chứa các tokens đó không (thông tin tham khảo)
 *   - nếu có user vocabulary: nhận diện xem có từ thuộc từ vựng user (kèm type)
 *     xuất hiện — chỉ để hiển thị, KHÔNG kết luận "đúng".
 * KHÔNG trả về correct/incorrect bao giờ — luôn self-check.
 */

// Các placeholder trong pattern cần bỏ khi trích fixed tokens.
const PLACEHOLDER_RE = /(\+\s*V|\+?\s*V\b|___|\.\.\.|…)/gi;

/**
 * Trích các fixed token (từ cố định) từ một pattern.
 * @param {string} pattern
 * @returns {string[]}
 */
export function extractFixedTokens(pattern) {
  return String(pattern || '')
    .replace(PLACEHOLDER_RE, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[+\-/.,!?;:'"]|[+\-/.,!?;:'"]$/g, ''))
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && t !== '+' && t !== 'v');
}

/**
 * Gợi ý an toàn cho production. LUÔN trả selfCheck=true, không có pass/fail.
 *
 * @param {{ pattern?: string, answer?: string, sentence?: string, userVocabulary?: Array<{word:string, word_type?:string}> }} params
 * @returns {{
 *   selfCheck: true,
 *   recognizedTokens: string[],
 *   missingTokens: string[],        // fixed tokens chưa thấy (chỉ gợi ý)
 *   vocabHits: Array<{word:string, word_type:string|null}>,
 *   sample: string
 * }}
 */
export function getProductionHint({ pattern = '', answer = '', sentence = '', userVocabulary = [] }) {
  const fixedTokens = extractFixedTokens(pattern);
  const normalizedSentence = ` ${String(sentence || '').toLowerCase()} `;

  const recognizedTokens = fixedTokens.filter((t) => normalizedSentence.includes(` ${t} `));
  const missingTokens = fixedTokens.filter((t) => !normalizedSentence.includes(` ${t} `));

  // Từ thuộc vocabulary của user xuất hiện trong câu (chỉ để hiển thị).
  const vocabMap = new Map(
    (userVocabulary || []).map((w) => [String(w.word || '').toLowerCase(), w.word_type || null])
  );
  const vocabHits = [];
  for (const word of String(sentence || '').toLowerCase().split(/\s+/)) {
    if (vocabMap.has(word)) {
      vocabHits.push({ word, word_type: vocabMap.get(word) });
    }
  }

  return {
    selfCheck: true,
    recognizedTokens,
    missingTokens,
    vocabHits,
    sample: String(answer || ''),
  };
}