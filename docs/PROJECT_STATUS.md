# ENGFORE PROJECT STATUS

## Kiến trúc hiện tại

**Frontend:** React 18 + Vite + Tailwind CSS v4 + React Router v6 + JavaScript

**Backend:** Supabase Cloud (project `yyfllitihktyrvjssyek`)

**Auth:** Supabase Auth (email/password, session persistence, onAuthStateChange)

## Cấu trúc thư mục

```
src/
├── components/
│   ├── ui/            # Button, Input, Textarea, Modal, Spinner, EmptyState, Alert
│   └── ProtectedRoute.jsx
├── layouts/
│   ├── PublicLayout.jsx    # Landing/Login/Register
│   └── AppLayout.jsx       # Sidebar + Main (responsive)
├── pages/
│   ├── Home/               # Landing page
│   ├── Login/
│   ├── Register/
│   ├── App/                # Dashboard tổng quan
│   ├── Vocabulary/         # Thư viện bộ từ
│   ├── VocabularyDetail/   # Chi tiết bộ từ + bảng từ
│   ├── Practice/           # Chọn bộ từ để luyện tập
│   ├── TypingPractice/     # Chế độ gõ từ
│   ├── FlashcardPractice/  # Chế độ thẻ ghi nhớ
│   └── Profile/            # Hồ sơ người dùng
├── services/
│   ├── supabase.js         # Client Supabase duy nhất
│   ├── auth.service.js
│   ├── vocabulary.service.js
│   └── learning.service.js
├── hooks/
│   ├── useAuth.jsx
│   ├── useVocabulary.js
│   └── useLearning.js
├── utils/
│   └── auth-errors.js      # Ánh xạ lỗi tiếng Việt
├── App.jsx                 # Router
└── main.jsx
```

## Routes

| Route | Mô tả | Bảo vệ |
|-------|-------|--------|
| `/` | Landing page | Công khai |
| `/login` | Đăng nhập | Công khai (chặn nếu đã đăng nhập) |
| `/register` | Đăng ký | Công khai (chặn nếu đã đăng nhập) |
| `/app` | Dashboard | Cần đăng nhập |
| `/vocabulary` | Thư viện bộ từ | Cần đăng nhập |
| `/vocabulary/:setId` | Chi tiết bộ từ | Cần đăng nhập |
| `/practice` | Chọn bộ từ luyện tập | Cần đăng nhập |
| `/practice/typing/:setId` | Gõ từ | Cần đăng nhập |
| `/practice/flashcard/:setId` | Thẻ ghi nhớ | Cần đăng nhập |
| `/profile` | Hồ sơ | Cần đăng nhập |

## Database

Reuse schema Supabase Cloud hiện tại (KHÔNG tạo migration, KHÔNG xóa dữ liệu):

- `vocabulary_sets` — bộ từ (user-owned, RLS)
- `set_words` — quan hệ set ↔ word_sense
- `word_senses` — nghĩa, ví dụ, loại từ
- `words` — từ gốc, IPA, CEFR
- `user_progress` — tiến trình học (mastery_level, review_due_at, last_reviewed_at)
- `users` — hồ sơ người dùng

RPC đã dùng: `advanced_search_sets`, `import_words_to_set`.

## Authentication Status

- ✅ Đăng ký (email/password, username)
- ✅ Đăng nhập
- ✅ Đăng xuất
- ✅ Session persistence (refresh trang)
- ✅ onAuthStateChange
- ✅ Protected routes
- ✅ Email confirmation handling
- ✅ Lỗi tiếng Việt

## Chức năng đã migrate

- ✅ Landing page
- ✅ Đăng ký / Đăng nhập / Đăng xuất
- ✅ App layout (sidebar responsive)
- ✅ Vocabulary Library (CRUD + search + word count + loading/empty/error)
- ✅ Vocabulary Detail (word table + add/edit/delete + search/filter/sort)
- ✅ Typing Practice (active recall)
- ✅ Flashcard Practice (active recall)
- ✅ Profile (cập nhật username)
- ✅ Learning progress (mastery update)

## Rủi ro migration

- Schema `database/schema.sql` (cũ) khác với schema production thực tế (dùng `db.service.js`). React migration dùng schema production đang hoạt động.
- Nếu production DB thiếu cột/bảng, cần tạo migration — hiện chưa cần vì legacy đang hoạt động.

## Bước tiếp theo

1. Legacy cleanup (xóa HTML/CSS/JS cũ sau khi React ổn định).
2. Thêm SRS Review.
3. Dashboard nâng cao.
4. Import từ bằng AI.
</content>
