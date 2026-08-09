# Thiết lập Authentication Flow — EngFore (React)

Tài liệu này mô tả cách dòng xác thực hoạt động và những gì cần cấu hình
trên Supabase Dashboard để email confirmation hoạt động đúng.

## Dòng xác thực mong muốn

```
Đăng ký
  ↓  supabase.auth.signUp({ email, password, options.data.username, options.emailRedirectTo })
Supabase gửi email "Confirm your email address"
  ↓
User bấm "Confirm email address"
  ↓
Supabase redirect về:  {origin}/auth/callback  (origin = window.location.origin)
  ↓
AuthCallback xử lý session (exchangeCodeForSession / detectSessionInUrl)
  ↓
Thành công: "Xác thực email thành công!" → chuyển tới /app
Lỗi:        hiển thị thông báo tiếng Việt → nút về /login
```

## Quan trọng: cấu hình Redirect URLs trong Supabase Dashboard

`emailRedirectTo` được tính động bằng `window.location.origin` (hoặc `VITE_APP_URL` nếu có).
Do đó **port dev server phải nằm trong danh sách Allow List** của Supabase,
nếu không Supabase sẽ fallback về URL mặc định (thường là `http://127.0.0.1:3000`
hoặc giá trị cũ `localhost:8080`) → gây ra `ERR_CONNECTION_REFUSED`.

### Các bước

1. Mở [Supabase Dashboard](https://app.supabase.com/) → project `yyfllitihktyrvjssyek`.
2. Vào **Authentication → URL Configuration**.
3. Trong **Redirect URLs**, thêm (mỗi dòng một URL):
   - `http://localhost:5173/**`
   - `http://localhost:5174/**`
   - `http://127.0.0.1:5173/**`
   - `http://127.0.0.1:5174/**`
   - `http://localhost:8080/**` (nếu bạn vẫn dùng server cũ)
   - URL production (nếu có): `https://your-domain.com/**`
4. Kiểm tra **Site URL** được đặt hợp lý (ví dụ `http://localhost:5173`).
5. Lưu lại.

> Dấu `/**` cho phép mọi đường dẫn con (bao gồm cả `/auth/callback`).

## Vì sao đã đúng code mà vẫn thấy `otp_expired`?

- Link cũ đã hết hạn trong email trước đó. **Không phải lỗi code.** Hãy tạo tài khoản
  mới hoặc gửi lại email xác thực để có link mới.
- Nếu bấm link mà URL trỏ sai port/domain → Supabase không cho phép → trả `access_denied`
  hoặc `otp_expired`. Kiểm tra Redirect URLs ở trên.

## Xử lý callback trong code

- File: `src/pages/AuthCallback/index.jsx`
- Route: `/auth/callback`
- Supabase client có `detectSessionInUrl: true` → tự xử lý token nằm trong `#hash`.
- Nếu Supabase trả `code` (PKCE) → `supabase.auth.exchangeCodeForSession(code)`.
- Nếu có `error`/`error_code` → hiển thị thông báo tiếng Việt phù hợp:
  - `otp_expired` → "Liên kết xác thực đã hết hạn. Vui lòng yêu cầu gửi lại email xác thực."
  - `access_denied` → "Liên kết xác thực không hợp lệ. Vui lòng yêu cầu gửi lại email xác thực."

## Biến môi trường

- `.env` phải có `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.
- (Tùy chọn) `VITE_AUTH_REDIRECT_URL` hoặc `VITE_APP_URL` để cố định redirect URL,
  phải khớp với Redirect URLs trong Supabase Dashboard.
- KHÔNG đưa `SUPABASE_SERVICE_ROLE_KEY` hoặc database password vào frontend.

## Email Template (RẤT QUAN TRỌNG — nguyên nhân email trống)

Nếu email xác thực nhận được gần như **trống** (chỉ có "Supabase Auth <noreply@mail.app.supabase.io>",
không có nút "Confirm your email address"), thì **Email Template** trên Supabase Dashboard
đang bị trống hoặc thiếu `{{ .ConfirmationURL }}`.

> Code frontend KHÔNG thể sửa Email Template — đây là cấu hình tựa trên Dashboard.
> Tôi đã chuẩn bị sẵn mẫu tiếng Việt: `docs/email-template-confirm-signup.html`.

### Các bước sửa Email Template

1. Mở [Supabase Dashboard](https://app.supabase.com/) → project `yyfllitihktyrvjssyek`.
2. Vào **Authentication → Email Templates**.
3. Chọn tab **"Confirm signup"**.
4. Ở tab **Subject**, nhập: `Xác nhận email - EngFore`
5. Ở tab **HTML content**, dán toàn bộ nội dung trong file
   `docs/email-template-confirm-signup.html`.
6. **BẮT BUỘC** giữ nguyên `{{ .ConfirmationURL }}` ở trong HTML — đây chính là nơi
   Supabase chèn link xác thực. Nếu thiếu, email sẽ không có nút/link nào.
7. Nhấn **Save**.
8. Tạo tài khoản mới để nhận email mới (link cũ có thể đã hết hạn).

### Cấu hình khuyến nghị (Authentication → URL Configuration)

- **Site URL**: `http://localhost:5173` (hoặc port Vite đang chạy).
- **Redirect URLs** (thêm từng URL, mỗi URL một dòng):
  - `http://localhost:5173/**`
  - `http://localhost:5174/**`
  - `http://127.0.0.1:5173/**`
  - `http://127.0.0.1:5174/**`
  - `https://your-production-domain.com/**` (nếu có)

> Lưu ý: `emailRedirectTo` trong code ưu tiên `VITE_AUTH_REDIRECT_URL`, rồi
> `VITE_APP_URL`, rồi `window.location.origin`. Vì vậy khi Vite chạy ở port 5173,
> link sẽ là `http://localhost:5173/auth/callback` — phải nằm trong Redirect URLs.

## Test manual

1. `npm run dev` → mở URL hiển thị (thường `http://localhost:5173`).
2. Đăng ký tài khoản mới → nhận email.
3. Bấm "Confirm email address".
4. Trình duyệt quay về `http://localhost:<port>/auth/callback` → "Xác thực email thành công!".
5. Đăng nhập → vào Dashboard.
6. Refresh trang → session vẫn còn.
7. Đăng xuất → về `/login`.
8. Truy cập `/app` khi chưa đăng nhập → bị chuyển về `/login`.
</content>
