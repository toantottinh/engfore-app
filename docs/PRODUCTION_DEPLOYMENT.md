# EngFore — Production Deployment Guide (Vercel + Supabase + Google OAuth)

Hướng dẫn deploy EngFore (React + Vite) lên Vercel, kết nối Supabase Cloud và cấu hình
Google OAuth cho production. Không chứa secret thật — chỉ placeholder.

> **Quan trọng:** Không bao giờ commit `.env`, `service_role` key, `Google Client Secret`
> vào Git. Tất cả biến môi trường phải nhập trực tiếp trên Vercel.

---

## A. Vercel

### 1. Kết nối GitHub repo
1. Push code EngFore lên một GitHub repository.
2. Vào [Vercel Dashboard](https://vercel.com) → **Add New** → **Project**.
3. Chọn repo EngFore → **Import**.

### 2. Build configuration
| Cấu hình | Giá trị |
|----------|---------|
| Framework Preset | **Vite** (tự nhận diện từ `vite.config.js`) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` (mặc định) |

`vercel.json` đã có sẵn ở project root để SPA rewrite (mọi route trả về `index.html`),
đảm bảo refresh/URL con hoạt động. Không cần chỉnh thêm.

### 3. Environment variables (nhập trong Vercel → Settings → Environment Variables)
| Variable | Giá trị |
|----------|---------|
| `VITE_SUPABASE_URL` | `https://yyfllitihktyrvjssyek.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | *(anon key của bạn — KHÔNG phải service_role)* |

> Các biến `VITE_*` khác (nếu dùng): `VITE_APP_URL`, `VITE_AUTH_REDIRECT_URL` — xem mục B.

---

## B. Environment variables

Đọc từ `import.meta.env.VITE_*` trong code. Các biến hiện tại:

- `VITE_SUPABASE_URL` — URL project Supabase (bắt buộc).
- `VITE_SUPABASE_ANON_KEY` — anon/public key (bắt buộc, an toàn để lộ phía client).
- `VITE_APP_URL` — (tùy chọn) URL cố định của app. Nếu bỏ trống, app tự lấy `window.location.origin`.
- `VITE_AUTH_REDIRECT_URL` — (tùy chọn) Ghi đè URL redirect cho email/OAuth. Nếu bỏ trống,
  dùng `VITE_APP_URL`, rồi đến `window.location.origin`.

**Không bao giờ đặt các biến sau vào frontend hoặc Vercel:**
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `GOOGLE_CLIENT_SECRET`.

---

## C. Supabase URL Configuration

Cấu hình thủ công trên **Supabase Dashboard** (không sửa database).

### 1. Site URL
Vào **Authentication → URL Configuration**:

```
Site URL: https://YOUR-DOMAIN.vercel.app
```

Thay `YOUR-DOMAIN` bằng domain thật của bạn (Vercel cấp dạng `<project>.vercel.app` hoặc domain riêng).

### 2. Redirect URLs (thêm tối thiểu các dòng sau)
```
https://YOUR-DOMAIN.vercel.app/auth/callback
https://YOUR-DOMAIN.vercel.app/**
```

Giải thích:
- `https://YOUR-DOMAIN.vercel.app/auth/callback` — bắt buộc cho email confirmation + Google OAuth.
- `https://YOUR-DOMAIN.vercel.app/**` — wildcard cho toàn bộ app (nếu cần preview/domain khác,
  thêm từng URL preview cụ thể).

### 3. Giữ localhost cho development
Đừng xóa các dòng localhost sau (vẫn cần khi chạy dev):

```
http://localhost:5173/auth/callback
http://localhost:5173/**
```

---

## D. Google OAuth

EngFore dùng **Supabase Google OAuth** (qua `supabase.auth.signInWithOAuth`). Bạn không cần
tự tạo Client ID/Secret mới nếu đã cấu hình qua Supabase. Chỉ cần thêm production redirect.

### 1. Supabase — bật Google provider
1. **Authentication → Providers → Google** → bật **Enable Sign in with Google**.
2. Nhập **Client ID** và **Client Secret** từ Google Cloud (nếu chưa có).
3. Lưu.

### 2. Google Cloud Console — thêm production redirect
1. Mở [Google Cloud Console](https://console.cloud.google.com) → project tương ứng.
2. **APIs & Services → Credentials** → chọn OAuth 2.0 Client ID đang dùng.
3. Trong **Authorized redirect URIs**, thêm:

```
https://YOUR-DOMAIN.vercel.app/auth/callback
```

4. Đảm bảo **Authorized JavaScript origins** có:
```
https://YOUR-DOMAIN.vercel.app
```

5. Giữ nguyên redirect localhost cho dev:
```
http://localhost:5173/auth/callback
```

> **Lưu ý:** URI redirect phải khớp chính xác giữa Google Cloud Console và Supabase
> (đều trỏ về `/auth/callback`). Nếu không khớp sẽ báo lỗi `redirect_uri_mismatch`.

---

## E. Test production (checklist)

Sau khi deploy và mở production URL, kiểm tra tuần tự:

1. **Register** — tạo tài khoản mới bằng email.
2. **Email confirmation** — nhận email, bấm link → về `/auth/callback` → vào `/app`.
3. **Login** — đăng nhập lại bằng email/password.
4. **Google login** — bấm "Tiếp tục với Google" → chọn tài khoản → vào `/app`.
5. **Logout** — đăng xuất, kiểm tra quay về `/login`.
6. **Import** — vào `/import`, nhập từ mới, xem preview, Import.
7. **Flashcard** — vào một bộ từ → flashcard → đánh giá mức nhớ.
8. **Typing** — vào gõ từ → trả lời → progress lưu.
9. **Review** — vào `/review`, xem số từ đến hạn, ôn tập, hoàn thành.
10. **Refresh** — refresh trang con (vd `/vocabulary/<setId>`) → không 404, URL giữ nguyên.
11. **Progress persistence** — sau đăng nhập lại, mastery/review_due_at vẫn giữ (lưu Supabase).

---

## Ghi chú
- **ESLint** sẽ được triển khai ở phase code quality sau.
- Không deploy thành công hẳn nếu chưa thực hiện các bước manual ở mục A–D.
- Domain placeholder `https://YOUR-DOMAIN.vercel.app` phải được thay bằng domain thật của bạn.
