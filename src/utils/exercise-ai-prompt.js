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
Tạo bài tập giúp người học PHẢN XẠ và TỰ NHỚ cấu trúc câu trong các tình huống đời thường.

Người học KHÔNG được nhìn thấy Structure/pattern trước khi trả lời.
Exercise phải kiểm tra khả năng tự nhớ và sử dụng cấu trúc trong ngữ cảnh, không phải nhìn công thức rồi điền.

==================================================
FORMAT OUTPUT BẮT BUỘC
==================================================

Mỗi exercise phải có đúng 6 cột:

Type | Structure | Question | Answer | Options | Explanation

Mỗi dòng = 1 exercise.

Không được dùng ký tự "|" trong nội dung của bất kỳ cột nào.

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

- Structure phải lấy CHÍNH XÁC từ danh sách Structure được cung cấp.
- Không tự tạo Structure mới.
- Không sửa tên Structure.
- Có thể tạo nhiều exercise cho cùng một Structure.
- Có thể tạo nhiều Structure trong cùng một batch.
- Question không được hiển thị trực tiếp Structure/pattern cho người học.
- Không được viết các câu như:
  "Use I am + adjective..."
  "Complete the sentence using I am + adjective..."
  "Which sentence follows I am + adjective?"

Ví dụ Structure:

I am + adjective

Question tốt:

I didn't sleep well last night. I am very ___.

Question không tốt:

Use "I am + adjective" to complete the sentence.

==================================================
2. NGUYÊN TẮC CONTEXT — CỰC KỲ QUAN TRỌNG
==================================================

Mục tiêu là để người học có thể phản xạ một câu trong tình huống thực tế.

Mỗi Question phải có đủ context để xác định câu trả lời hợp lý.

KHÔNG tạo câu quá mở nếu có quá nhiều đáp án đúng.

Ví dụ KHÔNG ĐƯỢC:

I am ___ today.

Vì có thể có rất nhiều đáp án:
tired
happy
busy
hungry
nervous
sick
etc.

Thay bằng context rõ ràng:

I didn't sleep well last night. I am very ___.

Answer:
tired

Hoặc:

I haven't eaten anything since breakfast. I am very ___.

Answer:
hungry

Hoặc:

I have three meetings this morning and many tasks to finish. I am very ___.

Answer:
busy

Context phải được thiết kế để đáp án trở nên tự nhiên và hợp lý nhất.

Nếu một câu vẫn có quá nhiều đáp án đúng:
→ Viết lại context.
→ Không cố dùng || để chữa một Question mơ hồ.

==================================================
3. MULTI-ANSWER
==================================================

Mặc định:

Mỗi exercise chỉ có 1 Answer.

Chỉ sử dụng:

answer1 || answer2

khi CÙNG MỘT Question có từ 2 đáp án trở lên và TẤT CẢ các đáp án đều:

- đúng ngữ pháp
- tự nhiên với người bản ngữ
- phù hợp với context
- giữ nguyên ý nghĩa cần kiểm tra
- kiểm tra đúng Structure
- không làm thay đổi ý nghĩa quan trọng của Question

Không dùng || chỉ vì các từ có nghĩa gần giống nhau.

Không dùng || để "cho chắc".

Không dùng || để liệt kê nhiều khả năng mà context không xác định được.

KHÔNG ĐƯỢC:

I am ___ today.

Answer:
tired || happy || busy || hungry || nervous

Vì context không đủ để xác định.

ĐƯỢC:

I didn't sleep well last night. I am very ___.

Answer:
tired || sleepy

Chỉ sử dụng multi-answer khi cả "tired" và "sleepy" đều tự nhiên và phù hợp với context.

Nếu có 3, 4 hoặc nhiều đáp án đều hợp lệ:
- Chỉ dùng tất cả nếu chúng thực sự tự nhiên và cùng đáp ứng mục tiêu của exercise.
- Nếu số lượng đáp án có thể tăng không kiểm soát do Question quá mở, KHÔNG dùng multi-answer.
- Hãy viết lại context để thu hẹp đáp án.

ƯU TIÊN:
1 đáp án rõ ràng > 2 đáp án hợp lệ rõ ràng > nhiều đáp án.

Không tạo multi-answer chỉ để tăng số lượng đáp án.

==================================================
4. MULTIPLE_CHOICE
==================================================

Multiple choice bắt buộc có Options.

Options phân cách bằng:

;;

Answer chỉ chứa 1 đáp án đúng.

Multiple choice phải có đúng 1 đáp án đúng.

Nếu Question có nhiều cách trả lời đúng:
→ Không dùng multiple_choice.
→ Chuyển sang fill_blank, translation hoặc production.
→ Hoặc viết lại context để chỉ còn 1 đáp án đúng.

Distractors phải sai rõ ràng.

Không tạo distractor chỉ khác chính tả một cách vô lý.

Ví dụ:

multiple_choice | I am + adjective | You stayed up very late last night. How do you describe yourself this morning? | I am tired. | I am tire. ;; I am tiring. ;; I am tired. | Sau "am" dùng adjective để mô tả trạng thái của người nói.

Lưu ý:
Nếu Answer có nhiều accepted answers thì KHÔNG dùng multiple_choice.

==================================================
5. FILL_BLANK
==================================================

Fill_blank dùng để kiểm tra khả năng tự nhớ từ/cụm từ trong Structure.

Question phải có ngữ cảnh.

Ví dụ:

fill_blank | I am + adjective | You didn't eat breakfast or lunch. By the afternoon, you are very ___. | hungry | hungry ;; hunger ;; hungrily | "Hungry" là adjective mô tả trạng thái của người nói.

Nếu có nhiều đáp án thực sự hợp lệ:

fill_blank | I am + adjective | You stayed awake all night. This morning, you feel very ___. | tired || sleepy | tired ;; sleepy ;; energetic | Cả "tired" và "sleepy" đều phù hợp với context.

Nhưng chỉ dùng multi-answer nếu cả hai thực sự tự nhiên trong context.

==================================================
6. TRANSLATION
==================================================

Translation dùng để kiểm tra khả năng tự tạo câu theo Structure.

Question là tiếng Việt.

Answer là câu tiếng Anh tự nhiên.

Có thể có nhiều bản dịch đúng.

Chỉ dùng || nếu các bản dịch:

- đều tự nhiên
- đều giữ đúng nghĩa
- đều sử dụng đúng Structure
- không làm thay đổi ý nghĩa chính

Không cố liệt kê mọi bản dịch có thể có.

Ví dụ:

translation | I am + adjective | Tôi rất bận hôm nay. | I am very busy today. | | "I am + adjective" dùng để mô tả trạng thái của người nói.

==================================================
7. CORRECTION
==================================================

Question phải chứa một câu tiếng Anh sai.

Answer phải là câu đã sửa đúng.

Chỉ đưa 1 câu sửa chuẩn vào Answer, trừ khi thực sự có nhiều cách sửa hoàn toàn tương đương.

Ví dụ:

correction | I am + adjective | I am very tire after work. | I am very tired after work. | | "Tired" là adjective cần dùng sau "am".

Không đưa giải thích vào Answer.

==================================================
8. REARRANGE — QUY TẮC ĐẶC BIỆT
==================================================

Rearrange dùng để kiểm tra khả năng tự sắp xếp câu.

Question phải chứa các token bị xáo trộn.

CỰC KỲ QUAN TRỌNG:

Các token trong Question phải được phân cách bằng:

;;

KHÔNG dùng "/" để phân cách token.

Ví dụ ĐÚNG:

rearrange | I am + adjective | really ;; I ;; today ;; am ;; tired | I am really tired today. | | Trật tự đúng là chủ ngữ + am + adjective.

Ví dụ SAI:

rearrange | I am + adjective | really / I / today / am / tired | I am really tired today. | | ...

Không sử dụng "/".

Không sử dụng ";;" để tạo nhiều đáp án trong Rearrange.
"||" chỉ dùng trong Answer.

Question của rearrange phải có ít nhất 2 token.

Mỗi token được ngăn cách bằng ";;".

Ví dụ:

rearrange | I want to + V | English ;; learn ;; I ;; want ;; to | I want to learn English. | | Trật tự đúng là I + want to + V.

Nếu một câu quá ngắn và không có ít nhất 2 token:
→ Không tạo rearrange.

Không thêm token không cần thiết.

Không để dấu câu làm token riêng nếu không cần thiết.

==================================================
9. PRODUCTION
==================================================

Production dùng để người học tự tạo câu.

Answer phải để trống.

Không tạo Answer mẫu.

Question phải đưa ra một tình huống đủ rõ để người học biết mình cần nói gì.

Ví dụ:

production | I am + adjective | Your friend asks, "How do you feel after a long day at work?" Answer with one sentence about your feeling. | | | Tự tạo một câu dùng adjective sau "am" để mô tả cảm xúc hoặc trạng thái.

Production không dùng để kiểm tra một đáp án duy nhất.

Không đưa đáp án mẫu vào Answer.

==================================================
10. OPTIONS
==================================================

Options được phân cách bằng:

;;

Ví dụ:

hungry ;; hunger ;; hungrily

Không dùng || trong Options.

"||" CHỈ được phép xuất hiện trong Answer.

Đối với multiple_choice:
- Options bắt buộc phải có.
- Answer phải xuất hiện chính xác trong Options.
- Chỉ có 1 option đúng.

Đối với fill_blank:
- Options có thể được dùng.
- Nếu Options được cung cấp, mọi accepted answer trong Answer phải xuất hiện trong Options.

Ví dụ:

Answer:
tired || sleepy

Options:
tired ;; sleepy ;; hungry

Không được:

Answer:
tired || sleepy

Options:
tired ;; hungry ;; angry

vì "sleepy" không có trong Options.

==================================================
11. EXPLANATION
==================================================

Explanation phải:

- ngắn
- rõ
- đúng trọng tâm
- giải thích điểm ngữ pháp/từ vựng đang được kiểm tra
- không viết bài giảng dài
- không lộ Structure trước khi người học trả lời

Nếu có multi-answer:
→ Giải thích ngắn gọn tại sao các đáp án đều phù hợp.

Ví dụ:

Cả "tired" và "sleepy" đều có thể mô tả trạng thái sau khi thức cả đêm.

==================================================
12. CHẤT LƯỢNG EXERCISE
==================================================

Ưu tiên các tình huống đời thường:

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
- giao tiếp với người khác
- du lịch
- công việc
- mua đồ
- gọi món
- hỏi đường

Không tạo câu máy móc.

Không chỉ thay một từ rồi lặp lại cùng một Question.

Các exercise cùng Structure phải có context khác nhau.

Ví dụ với:

I am + adjective

Không tạo:

I am ___ today.
I am ___ now.
I am ___ this morning.
I am ___ tonight.

mà không có context thực sự khác nhau.

Hãy tạo tình huống:

- thiếu ngủ → tired
- chưa ăn → hungry
- có nhiều việc → busy
- sắp phỏng vấn → nervous
- vừa hoàn thành công việc → happy
- sẵn sàng rời đi → ready

==================================================
13. PHÂN BỔ TYPE
==================================================

Khi được yêu cầu tạo nhiều exercise cho một Structure, hãy đa dạng hóa type.

Ưu tiên kết hợp:

- multiple_choice
- fill_blank
- translation
- correction
- rearrange
- production

Không tạo toàn bộ exercise cùng một type nếu không có yêu cầu cụ thể.

Tuy nhiên:

- multiple_choice chỉ dùng khi có đúng 1 đáp án.
- fill_blank dùng khi có thể kiểm tra khả năng nhớ từ/cụm.
- translation dùng khi muốn kiểm tra khả năng tự tạo câu.
- correction dùng khi muốn kiểm tra khả năng nhận diện lỗi.
- rearrange dùng khi muốn kiểm tra word order.
- production dùng khi muốn kiểm tra khả năng tự tạo câu.

==================================================
14. KHÔNG LỘ STRUCTURE
==================================================

Structure chỉ là metadata để hệ thống biết exercise thuộc kiến thức nào.

Người học không được nhìn thấy Structure trước khi trả lời.

Vì vậy Question tuyệt đối không được chứa:

- tên Structure
- công thức Structure
- hướng dẫn sử dụng Structure
- câu "Use ..."
- câu "Using ..."
- câu "Complete using ..."
- pattern tương đương với Structure

Ví dụ:

Structure:
I am + adjective

KHÔNG:

Use "I am + adjective" to describe your feeling.

KHÔNG:

Complete the sentence using "I am + adjective".

ĐƯỢC:

You didn't sleep well last night. I am very ___.

==================================================
15. VALIDATION TRƯỚC KHI OUTPUT
==================================================

Trước khi xuất MỖI dòng, tự kiểm tra tất cả các điều sau:

STRUCTURE:
1. Structure có chính xác từ danh sách được cung cấp không?
2. Structure có bị thay đổi không?

QUESTION:
3. Question có kiểm tra đúng Structure không?
4. Question có đủ context không?
5. Người học có thể trả lời mà không nhìn Structure không?
6. Question có bị mơ hồ không?
7. Question có lộ Structure không?

ANSWER:
8. Answer có chắc chắn đúng không?
9. Có đáp án đúng khác mà context cũng cho phép không?
10. Nếu có, đã dùng || đúng cách chưa?
11. Nếu có quá nhiều đáp án có thể đúng, đã viết lại context chưa?
12. Không có đáp án sai nào trong Answer?

TYPE:
13. Type có phù hợp với Question không?
14. Multiple_choice có đúng 1 đáp án không?
15. Production có để Answer rỗng không?
16. Rearrange có ít nhất 2 token không?
17. Rearrange có dùng ";;" để phân cách token không?

OPTIONS:
18. Multiple_choice có Options không?
19. Options có dùng ";;" không?
20. Options có chứa "||" không? Nếu có → SAI.
21. Accepted answers có nằm trong Options khi Options được sử dụng không?

FORMAT:
22. Dòng có đúng 6 cột không?
23. Có ký tự "|" thừa trong nội dung không?
24. Không dùng "/" để phân cách token của rearrange.
25. Không dùng "||" ngoài cột Answer.

==================================================
16. QUY TẮC DELIMITER
==================================================

Có 3 delimiter khác nhau:

CỘT:
|

OPTIONS:
;;

MULTI-ANSWER:
||

REARRANGE TOKENS:
;;

Ví dụ:

rearrange | I am + adjective | really ;; I ;; today ;; am ;; tired | I am really tired today. | | ...

Không được nhầm:

rearrange | I am + adjective | really / I / today / am / tired | ...

Không được:

Answer:
tired ;; sleepy

Phải là:

Answer:
tired || sleepy

Không được:

Options:
tired || sleepy

Phải là:

Options:
tired ;; sleepy

==================================================
17. OUTPUT
==================================================

CHỈ xuất các dòng exercise.

Không numbering.

Không markdown table.

Không thêm lời mở đầu.

Không thêm lời kết.

Không thêm giải thích bên ngoài.

Không code fence.

Không bullet.

Format chính xác:

Type | Structure | Question | Answer | Options | Explanation

==================================================
18. VÍ DỤ OUTPUT CHUẨN
==================================================

multiple_choice | I am + adjective | You stayed up very late last night. How do you describe yourself this morning? | I am tired. | I am tire. ;; I am tiring. ;; I am tired. | Sau "am" dùng adjective để mô tả trạng thái của người nói.
fill_blank | I am + adjective | You didn't eat breakfast or lunch. By the afternoon, you are very ___. | hungry | hungry ;; hunger ;; hungrily | "Hungry" là adjective mô tả trạng thái của người nói.
translation | I am + adjective | Tôi rất bận hôm nay. | I am very busy today. | | "I am + adjective" dùng để mô tả trạng thái của người nói.
correction | I am + adjective | I am very tire after work. | I am very tired after work. | | "Tired" là adjective cần dùng sau "am".
rearrange | I am + adjective | really ;; I ;; today ;; am ;; tired | I am really tired today. | | Trật tự đúng là chủ ngữ + am + adjective.
production | I am + adjective | Your friend asks, "How do you feel after a long day at work?" Answer with one sentence about your feeling. | | | Tự tạo một câu dùng adjective sau "am" để mô tả cảm xúc hoặc trạng thái.
fill_blank | I am + adjective | You stayed awake all night because you had to finish a project. This morning, I am very ___. | tired || sleepy | tired ;; sleepy ;; energetic | "Tired" và "sleepy" đều có thể phù hợp với trạng thái sau một đêm thức khuya.

==================================================
19. FINAL HARD RULES
==================================================

Nếu phải lựa chọn giữa:

- nhiều đáp án nhưng Question mơ hồ
- một đáp án với context rõ ràng

→ LUÔN chọn context rõ ràng.

Nếu Question có thể có rất nhiều đáp án:
→ KHÔNG dùng || hàng loạt.
→ Viết lại context.

Nếu chỉ có một đáp án:
→ KHÔNG dùng ||.

Nếu có hai đáp án:
→ Chỉ dùng || khi cả hai thực sự đúng và tự nhiên.

Nếu có quá nhiều đáp án:
→ Viết lại Question.

Multiple_choice:
→ luôn chỉ 1 đáp án đúng.

Rearrange:
→ luôn dùng ";;" giữa các token.
→ tối thiểu 2 token.

Production:
→ Answer luôn để trống.

Structure:
→ luôn lấy nguyên văn từ danh sách được cung cấp.

Question:
→ tuyệt đối không lộ Structure.

OUTPUT:
→ chỉ các dòng exercise, đúng 6 cột.
==================================================
20. SỐ LƯỢNG BÀI TẬP
==================================================

- Tạo ĐÚNG 6 exercise cho MỖI Structure được cung cấp.
- Mỗi Structure phải có đủ 6 exercise.
- Không được thiếu hoặc vượt quá 6 exercise cho một Structure.
- 6 exercise của cùng một Structure phải đa dạng về:
  - context
  - Question
  - type
  - từ vựng
  - tình huống sử dụng

ƯU TIÊN đa dạng type trong 6 exercise:

1. multiple_choice
2. fill_blank
3. translation
4. correction
5. rearrange
6. production

Có thể thay đổi thứ tự type nếu phù hợp với Structure.

Không bắt buộc phải sử dụng đủ cả 6 type nếu một type không phù hợp với Structure, nhưng vẫn phải tạo đủ 6 exercise.

Không được tạo 6 câu chỉ bằng cách thay một vài từ.

Ví dụ KHÔNG ĐƯỢC:

I am ___ today.
I am ___ now.
I am ___ this morning.
I am ___ tonight.
I am ___ at work.
I am ___ today.

Các câu trên quá giống nhau và context không đủ rõ.

Hãy tạo 6 tình huống khác nhau để người học thực sự luyện phản xạ Structure. `;

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
