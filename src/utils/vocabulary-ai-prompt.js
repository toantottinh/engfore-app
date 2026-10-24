/**
 * "Lệnh vocabulary" — prompt CHUẨN nhúng sẵn trong app để người dùng copy đưa cho AI
 * (ChatGPT / Gemini / Claude...) sinh / xử lý dữ liệu Vocabulary đúng format import
 * của EngFore:
 *
 *   Word | IPA | Type | Meaning | Example | Memory Clue | CEFR
 *
 * Nguyên tắc:
 *  - Prompt là HẰNG SỐ duy nhất (version hóa tại đây). Sửa nội dung prompt =
 *    thay đổi kỳ vọng đầu-ra của AI → PHẢI đi kèm cập nhật tests
 *    (src/__tests__/vocabulary.ai-prompt.spec.jsx).
 *  - Thuần TEXT + clipboard: KHÔNG gọi API/Supabase khi chỉ mở hay copy prompt.
 *  - Delimiter quy ước khớp utils/vocabulary-importer.js: "|" giữa các cột.
 *  - Không tạo duplicate prompt ở nơi khác: mọi UI chỉ được import hằng số này.
 */

export const VOCABULARY_AI_PROMPT = `định dạng theo mẫu art | /ɑːt/ | noun | nghệ thuật | She loves modern art. | Hoạt động tạo ra tác phẩm để thể hiện ý tưởng hoặc cảm xúc | A1`;

export async function copyTextToClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API bị chặn/từ chối -> rơi xuống fallback bên dưới.
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = String(text ?? '');
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } finally {
      document.body.removeChild(ta);
    }
    return ok;
  } catch {
    return false;
  }
}