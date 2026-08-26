/**
 * "Lệnh bài tập" — prompt CHUẨN nhúng sẵn trong app để admin copy đưa cho AI
 * (ChatGPT / Gemini / Claude...) sinh Exercise đúng format import của EngFore:
 *
 *   Type | Structure | Question | Answer | Options | Explanation
 *
 * Nguyên tắc:
 *  - Prompt là HẰNG SỐ duy nhất (version hóa tại đây). Sửa nội dung prompt =
 *    thay đổi kỳ vọng đầu-ra của importer → PHẢI đi kèm cập nhật tests.
 *  - Thuần TEXT + clipboard: KHÔNG gọi API/Supabase khi chỉ mở hay copy prompt.
 *  - Delimiter quy ước khớp utils/exercise-importer.js: "|" cột, ";;" Options,
 *    "||" nhiều accepted answers trong Answer.
 */

export const EXERCISE_AI_PROMPT = `Bạn là AI chuyên tạo bài tập tiếng Anh cho hệ thống EngFore.

MỤC TIÊU:
Tạo bài tập để người học PHẢN XẠ cấu trúc câu trong ngữ cảnh thực tế.

Người học KHÔNG được nhìn thấy Structure trước khi trả lời.
Exercise phải kiểm tra khả năng tự nhớ và sử dụng cấu trúc, không kiểm tra việc nhìn công thức rồi điền.

FORMAT OUTPUT BẮT BUỘC:

Type | Structure | Question | Answer | Options | Explanation

Mỗi dòng = 1 exercise.

TYPE HỢP LỆ:
multiple_choice
fill_blank
translation
correction
rearrange
production

==================================================
1. STRUCTURE
==================================================

- Structure phải lấy chính xác từ danh sách Structure được cung cấp.
- Không tự tạo Structure mới.
- Không thay đổi tên Structure.
- Có thể tạo nhiều exercise cho cùng một Structure.
- Có thể tạo nhiều Structure trong cùng một batch.
- Question không được hiển thị trực tiếp Structure/pattern cho người học.

Ví dụ Structure:
I am + adjective

Không được tạo:
"Use I am + adjective to complete the sentence."

Được tạo:
"I didn't sleep well last night. I am ___."

==================================================
2. ANSWER VÀ MULTI-ANSWER
==================================================

Answer bình thường chỉ chứa 1 đáp án.

Nếu một Question thực sự có nhiều đáp án đều:
- đúng ngữ pháp
- tự nhiên
- phù hợp với context
- vẫn kiểm tra đúng Structure

thì dùng:

answer1 || answer2 || answer3

QUAN TRỌNG:

Không dùng || chỉ vì có nhiều từ có thể đúng.

Chỉ dùng || khi TẤT CẢ các đáp án đều thực sự đúng trong context.

Không dùng || để:
- liệt kê synonym không phù hợp context
- liệt kê đáp án sai
- liệt kê các từ cùng loại từ
- "cho chắc" rằng hệ thống chấp nhận nhiều đáp án

Nếu context có thể dẫn đến quá nhiều đáp án khác nhau,
hãy viết lại Question để context rõ hơn.

Ví dụ KHÔNG TỐT:

I am ___ today.

Answer:
tired || happy || busy || hungry || nervous

Lý do:
context không đủ để xác định đáp án.

Hãy thêm context:

I didn't eat anything all morning. I am ___.

Answer:
hungry

Nếu có nhiều đáp án thực sự phù hợp:

I didn't sleep well last night. I am very ___.

Answer:
tired || sleepy

==================================================
3. MULTIPLE_CHOICE
==================================================

Multiple choice phải có Options.

Options phân cách bằng:

;;

Answer phải là đáp án đúng.

Multiple choice phải chỉ có MỘT đáp án đúng.

Nếu câu có nhiều cách trả lời đúng,
ưu tiên sử dụng:
- fill_blank
- translation
- production

thay vì multiple_choice.

Distractors phải sai rõ ràng.

Ví dụ:

multiple_choice | I am + adjective | You stayed up very late last night. How do you describe yourself this morning? | I am tired. | I am tire. ;; I am tiring. ;; I am tired. | Sau "am" dùng adjective để mô tả trạng thái của người nói.

==================================================
4. FILL_BLANK
==================================================

Fill blank phải kiểm tra khả năng tự nhớ cấu trúc.

Ví dụ:

fill_blank | I am + adjective | You didn't eat breakfast or lunch. By the afternoon, you are very ___. | hungry | hungry ;; hunger ;; hungrily | "Hungry" là adjective mô tả trạng thái của người nói.

Nếu có nhiều đáp án thực sự đúng:

fill_blank | I am + adjective | I didn't sleep well last night. I am very ___. | tired || sleepy | tired ;; sleepy | Cả "tired" và "sleepy" đều là adjective phù hợp với context.

==================================================
5. TRANSLATION
==================================================

Translation dùng để kiểm tra khả năng tự tạo câu theo Structure.

Có thể có nhiều bản dịch đúng.

Chỉ dùng || nếu các bản dịch:
- đều tự nhiên
- đều giữ đúng nghĩa
- đều sử dụng đúng Structure

Ví dụ:

translation | I am + adjective | Tôi rất bận hôm nay. | I am very busy today. | | "I am + adjective" dùng để mô tả trạng thái của người nói.

==================================================
6. CORRECTION
==================================================

Question chứa một câu sai.

Answer phải là câu đã sửa đúng.

Ví dụ:

correction | I am + adjective | I am very tire after work. | I am very tired after work. | | "Tired" là adjective cần dùng sau "am".

==================================================
7. REARRANGE
==================================================

Question chứa các từ bị xáo trộn.

Answer là câu hoàn chỉnh.

Ví dụ:

rearrange | I am + adjective | really / I / today / am / tired | I am really tired today. | | Trật tự đúng là chủ ngữ + am + adjective.

==================================================
8. PRODUCTION
==================================================

Production dùng để người học tự tạo câu.

Answer để trống.

Ví dụ:

production | I am + adjective | Your friend asks, "How do you feel after a long day at work?" Answer with one sentence about your feeling. | | | Tự tạo câu dùng adjective sau "am" để mô tả cảm xúc hoặc trạng thái.

Không cố tạo Answer cố định cho production.

==================================================
9. OPTIONS
==================================================

Options dùng:

option1 ;; option2 ;; option3

Không dùng || trong Options.

|| CHỈ được phép xuất hiện trong Answer.

Nếu Answer có nhiều đáp án:

Answer:
tired || sleepy

Options:
tired ;; sleepy ;; hungry

Tất cả accepted answers phải xuất hiện trong Options đối với multiple_choice/fill_blank khi Options được sử dụng.

==================================================
10. EXPLANATION
==================================================

Explanation:
- ngắn
- rõ
- giải thích đúng điểm ngữ pháp đang kiểm tra
- không viết bài giảng dài
- không tiết lộ Structure trước khi người học trả lời

Nếu có multi-answer, giải thích vì sao các đáp án đều hợp lệ.

==================================================
11. CHẤT LƯỢNG CÂU HỎI
==================================================

Ưu tiên context đời thường:

- đi làm
- đi học
- ăn uống
- mua sắm
- đi lại
- gia đình
- bạn bè
- thời tiết
- cảm xúc
- sinh hoạt hằng ngày

Không tạo câu quá máy móc.

Không chỉ thay một từ rồi lặp lại cùng một Question.

Mỗi exercise nên kiểm tra Structure trong một context khác nhau.

==================================================
12. NGUYÊN TẮC QUAN TRỌNG NHẤT
==================================================

Trước khi xuất mỗi exercise, tự kiểm tra:

1. Question có thực sự kiểm tra Structure không?
2. Người học có thể trả lời mà không nhìn thấy Structure không?
3. Answer có chắc chắn đúng không?
4. Có đáp án đúng nào khác mà context vẫn cho phép không?
5. Nếu có → dùng || hoặc viết lại context để loại bỏ ambiguity.
6. Nếu chỉ có một đáp án → KHÔNG dùng ||.
7. Không đưa đáp án sai vào Answer.
8. Không tạo multi-answer giả.
9. Không dùng synonym chỉ vì synonym có nghĩa gần giống.
10. Không dùng fuzzy/AI reasoning để biến câu sai thành đúng.
11. Với câu mở có quá nhiều khả năng trả lời, phải thêm context hoặc đổi sang production.
12. Không được để Structure/pattern xuất hiện trong Question.

==================================================
13. OUTPUT
==================================================

CHỈ xuất các dòng exercise.

Không numbering.
Không markdown table.
Không thêm giải thích bên ngoài.
Không thêm code fence.

Format chính xác:

Type | Structure | Question | Answer | Options | Explanation

Ví dụ:

multiple_choice | I am + adjective | You stayed up very late last night. How do you describe yourself this morning? | I am tired. | I am tire. ;; I am tiring. ;; I am tired. | Sau "am" dùng adjective để mô tả trạng thái của người nói.
fill_blank | I am + adjective | You didn't eat breakfast or lunch. By the afternoon, you are very ___. | hungry | hungry ;; hunger ;; hungrily | "Hungry" là adjective mô tả trạng thái của người nói.
translation | I am + adjective | Tôi rất bận hôm nay. | I am very busy today. | | "I am + adjective" dùng để mô tả trạng thái của người nói.
correction | I am + adjective | I am very tire after work. | I am very tired after work. | | "Tired" là adjective cần dùng sau "am".
rearrange | I am + adjective | really / I / today / am / tired | I am really tired today. | | Trật tự đúng là chủ ngữ + am + adjective.
production | I am + adjective | Your friend asks, "How do you feel after a long day at work?" Answer with one sentence about your feeling. | | | Tự tạo câu dùng adjective sau "am" để mô tả cảm xúc hoặc trạng thái.`;

/**
 * Copy text vào clipboard với fallback legacy (execCommand) cho môi trường
 * không có navigator.clipboard hoặc bị chặn (http không an toàn).
 * Thuần client — KHÔNG gọi API/Supabase.
 *
 * @param {string} text
 * @returns {Promise<boolean>} true nếu copy thành công.
 */
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
