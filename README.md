# EngFore — Học từ vựng tiếng Anh

EngFore là nền tảng học từ vựng tiếng Anh dành cho người Việt, tập trung vào **luyện tập chủ động** (active recall) qua chế độ **gõ từ** và **thẻ ghi nhớ**.

## ✨ Tính năng

- **Xác thực**: Đăng ký, đăng nhập, đăng xuất, giữ phiên đăng nhập, bảo vệ route, xác nhận email.
- **Quản lý bộ từ vựng**: Tạo, sửa, xóa, tìm kiếm bộ từ.
- **Chi tiết bộ từ**: Thêm, sửa, xóa từ; tìm kiếm, lọc, sắp xếp từ.
- **Luyện tập**:
  - Gõ từ (nhập từ tiếng Anh theo nghĩa tiếng Việt).
  - Thẻ ghi nhớ (lật thẻ, đánh giá mức nhớ).
- **Hồ sơ**: Cập nhật tên người dùng.

## 🛠️ Công nghệ

- **Frontend**: React 18, Vite, Tailwind CSS v4, React Router v6, JavaScript.
- **Backend**: Supabase Cloud (PostgreSQL, Auth).

## 🚀 Chạy dự án

### 1. Cài đặt

```bash
npm install
```

### 2. Cấu hình môi trường

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`.

> ⚠️ **KHÔNG BAO GIỜ** đưa `SUPABASE_SERVICE_ROLE_KEY` hoặc database password vào frontend.

### 3. Chạy dev server

```bash
npm run dev
```

Mở `http://localhost:5173`.

### Build production

```bash
npm run build
npm run preview
```

## 📁 Cấu trúc

```
src/
├── components/   # UI primitives + ProtectedRoute
├── layouts/      # PublicLayout, AppLayout
├── pages/        # Home, Login, Register, App, Vocabulary, VocabularyDetail, Practice, TypingPractice, FlashcardPractice, Profile
├── services/     # supabase, auth, vocabulary, learning
├── hooks/        # useAuth, useVocabulary, useLearning
├── utils/        # auth-errors (tiếng Việt)
├── App.jsx       # Router
└── main.jsx
```

## 🔐 Bảo mật

- Chỉ dùng anon key trong frontend.
- Row Level Security (RLS) trên Supabase.
- Không lưu secret trong code.

## 📄 Giấy phép

MIT
</content>
