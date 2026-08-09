# TODO: Sửa lỗi Supabase Auth rate limit

## Mục tiêu
Chống spam request, xử lý đúng HTTP 429 / "email rate limit exceeded", phân biệt lỗi login 400.

## Các bước
- [ ] 1. Sửa `src/utils/auth-errors.js`: đúng text rate-limit 429 + phân biệt email chưa xác thực khi login 400.
- [ ] 2. Sửa `src/pages/Register/index.jsx`: cooldown 60s resend, disable nút, không retry/không gọi resend sau fail.
- [ ] 3. Sửa `src/pages/Login/index.jsx`: cooldown 60s resend, phân biệt lỗi login 400.
- [ ] 4. Chạy `npm run build` để xác nhận build pass.
- [ ] 5. Báo cáo kết quả.

## Tuân thủ
- KHÔNG đổi database, credentials, emailRedirectTo.
- KHÔNG tự retry signUp/resend.
- KHÔNG tạo tài khoản test liên tục.
