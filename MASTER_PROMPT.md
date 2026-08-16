# ============================================================
# ENGFORE — MASTER PROJECT SPECIFICATION
# ============================================================

PROJECT NAME:
EngFore

PRODUCT TYPE:
English Vocabulary Learning Platform

PRIMARY MARKET:
Vietnam

PRIMARY USERS:
Vietnamese people learning English.

CURRENT PRODUCT GOAL:
Build a focused, modern, simple and effective English vocabulary
learning platform.

IMPORTANT:
EngFore is NOT currently a general English learning platform.

The first version focuses specifically on vocabulary learning.

The core learning loop is:

Discover vocabulary
        ↓
Create / collect vocabulary
        ↓
Organize vocabulary into sets
        ↓
Practice vocabulary
        ↓
Typing practice
        ↓
Flashcard practice
        ↓
Track learning progress
        ↓
Review vocabulary again


# ============================================================
# 01. PRODUCT VISION
# ============================================================

EngFore helps Vietnamese learners remember English vocabulary
through active recall and repeated practice.

The product should prioritize:

1. Simplicity
2. Speed
3. Clarity
4. Active recall
5. Repetition
6. Low cognitive load
7. Clean UI
8. Mobile responsiveness
9. Good developer experience
10. Maintainable architecture

The application should feel like a modern learning product,
not like a school management system.

The interface must be simple enough for an A1 learner.

Avoid unnecessary complexity.


# ============================================================
# 02. LANGUAGE
# ============================================================

TARGET UI LANGUAGE:

Vietnamese.

All user-facing UI must be Vietnamese.

This includes:

- Navigation
- Buttons
- Forms
- Labels
- Placeholders
- Empty states
- Loading states
- Error messages
- Success messages
- Confirmation dialogs
- Authentication messages
- Validation messages
- Tooltips
- Settings
- Learning instructions

Examples:

"Login"
→ "Đăng nhập"

"Register"
→ "Đăng ký"

"Vocabulary"
→ "Từ vựng"

"Practice"
→ "Luyện tập"

"Flashcards"
→ "Thẻ ghi nhớ"

"Typing"
→ "Gõ từ"

"Delete"
→ "Xóa"

"Save"
→ "Lưu"

"Cancel"
→ "Hủy"

"Search"
→ "Tìm kiếm"

"Loading..."
→ "Đang tải..."

"Something went wrong"
→ "Đã xảy ra lỗi. Vui lòng thử lại."

Do NOT translate the English vocabulary being learned.

Example:

English word:
apple

IPA:
/ˈæp.əl/

Vietnamese meaning:
quả táo

The learning content remains English/Vietnamese.


# ============================================================
# 03. MVP SCOPE
# ============================================================

The first MVP contains only:

1. Landing / Home
2. Authentication
3. Vocabulary Library
4. Vocabulary Set Detail
5. Typing Practice
6. Flashcard Practice
7. Basic Learning Progress

Do NOT build yet:

- Speaking
- Listening
- Reading
- Social network
- Chat
- Conversation partner
- AI tutor
- Advanced gamification
- Leaderboards
- Marketplace
- Payments
- Notifications
- Complex SRS
- Advanced analytics

Those features may be added later.

Do not build future features prematurely.


# ============================================================
# 04. TECHNOLOGY STACK
# ============================================================

FRONTEND:

React

Build tool:

Vite

Language:

JavaScript

Styling:

Tailwind CSS

Routing:

React Router

BACKEND:

Supabase

DATABASE:

PostgreSQL

AUTH:

Supabase Auth

STORAGE:

Supabase Storage when needed in the future.

VERSION CONTROL:

Git + GitHub

DEPLOYMENT:

Vercel

IMPORTANT:

Do NOT introduce another frontend framework.

Do NOT use:

- Next.js
- Vue
- Angular
- Svelte

unless explicitly requested later.


# ============================================================
# 05. FRONTEND ARCHITECTURE
# ============================================================

Recommended structure:

src/
│
├── assets/
│
├── components/
│   ├── ui/
│   ├── navigation/
│   ├── vocabulary/
│   ├── learning/
│   └── feedback/
│
├── layouts/
│   ├── PublicLayout.jsx
│   └── AppLayout.jsx
│
├── pages/
│   ├── Home/
│   ├── Login/
│   ├── Register/
│   ├── Vocabulary/
│   ├── VocabularyDetail/
│   ├── TypingPractice/
│   ├── FlashcardPractice/
│   └── Profile/
│
├── services/
│   ├── supabase.js
│   ├── auth.service.js
│   ├── vocabulary.service.js
│   └── learning.service.js
│
├── hooks/
│   ├── useAuth.js
│   ├── useVocabulary.js
│   └── useLearning.js
│
├── utils/
│
├── constants/
│
├── routes/
│
├── App.jsx
│
└── main.jsx


# ============================================================
# 06. ARCHITECTURE RULES
# ============================================================

The application must use a component-based architecture.

Do NOT put the entire application in App.jsx.

Do NOT create giant JavaScript files.

Pages contain page-level composition.

Components contain reusable UI.

Services contain Supabase/database logic.

Hooks contain reusable React state logic.

Utils contain generic helper functions.

Constants contain static configuration.

Keep responsibilities separated.


# ============================================================
# 07. ROUTING
# ============================================================

Required routes:

/

Landing page

/login

Login page

/register

Register page

/app

Main application/dashboard

/vocabulary

Vocabulary library

/vocabulary/:setId

Vocabulary set detail

/practice/typing/:setId

Typing practice

/practice/flashcard/:setId

Flashcard practice

/profile

Profile/settings

Protected routes:

- /app
- /vocabulary
- /vocabulary/:setId
- /practice/*
- /profile

Unauthenticated users attempting to access protected pages
must be redirected to:

/login


# ============================================================
# 08. AUTHENTICATION
# ============================================================

Use Supabase Auth.

Required:

- Register
- Login
- Logout
- Session persistence
- Auth state listener
- Protected routes
- Email confirmation support

Do NOT implement custom authentication.

Do NOT store passwords manually.

Do NOT create a custom password database.

Do NOT use service_role key in frontend.

Frontend may use:

- Supabase URL
- anon/publishable key

Service role keys are NEVER allowed in frontend code.

Session must survive page refresh.

Use Supabase's official auth mechanisms.


# ============================================================
# 09. AUTH ERROR MESSAGES
# ============================================================

All authentication errors shown to users must be Vietnamese.

Examples:

Invalid login credentials:

"Email hoặc mật khẩu không chính xác."

Email not confirmed:

"Email chưa được xác nhận. Vui lòng kiểm tra hộp thư."

User already registered:

"Email này đã được đăng ký."

Weak password:

"Mật khẩu phải có ít nhất 6 ký tự."

Invalid email:

"Email không hợp lệ."

Network error:

"Không thể kết nối đến máy chủ. Vui lòng thử lại."

Unknown error:

"Đã xảy ra lỗi. Vui lòng thử lại."


# ============================================================
# 10. SUPABASE
# ============================================================

Current Supabase project:

Project reference:

yyfllitihktyrvjssyek

Project URL:

https://yyfllitihktyrvjssyek.supabase.co

Use Supabase Cloud.

Do NOT create Supabase local unless explicitly requested.

Do NOT expose secrets.

Do NOT commit secrets.

Use environment variables where appropriate.

Example:

VITE_SUPABASE_URL

VITE_SUPABASE_ANON_KEY


# ============================================================
# 11. DATABASE
# ============================================================

The vocabulary system should be based around these entities:

profiles

vocabulary_sets

words

set_words

user_word_progress


# ============================================================
# 12. PROFILES
# ============================================================

profiles:

id
username
display_name
avatar_url
created_at
updated_at

The profile ID should correspond to the authenticated user.

Do not duplicate authentication credentials.

Supabase auth.users remains responsible for authentication.


# ============================================================
# 13. VOCABULARY SETS
# ============================================================

vocabulary_sets:

id
user_id
name
description
created_at
updated_at

Each vocabulary set belongs to a user.

Users must only be able to access their own private sets.

Use Row Level Security.


# ============================================================
# 14. WORDS
# ============================================================

words:

id
word
ipa
part_of_speech
meaning_vi
example
note
created_at
updated_at

Vocabulary data should support:

English word

IPA

Part of speech

Vietnamese meaning

Example sentence

Optional note


# ============================================================
# 15. SET WORDS
# ============================================================

set_words:

id
set_id
word_id
created_at

This allows words to belong to vocabulary sets.

Avoid duplicating the entire word record for every set.


# ============================================================
# 16. USER WORD PROGRESS
# ============================================================

user_word_progress:

id
user_id
word_id
mastery
correct_count
incorrect_count
last_reviewed_at
next_review_at
created_at
updated_at

This table tracks the learner's progress.

Do not build advanced SRS yet.

For MVP, basic progress tracking is enough.


# ============================================================
# 17. ROW LEVEL SECURITY
# ============================================================

Supabase RLS is mandatory.

Users must not be able to access another user's private data.

Policies must protect:

profiles

vocabulary_sets

set_words

user_word_progress

words must be designed according to the chosen ownership model.

Never disable RLS simply to make the application work.

If a database migration is required:

Create a migration.

Do not manually modify production schema without migration.


# ============================================================
# 18. HOME PAGE
# ============================================================

The home page is public.

Purpose:

Explain EngFore quickly.

Sections:

1. Hero
2. Product value
3. How it works
4. Learning methods
5. Call to action
6. Footer

Main CTA:

"Bắt đầu học từ vựng"

Secondary CTA:

"Đăng nhập"

The landing page should not feel like an enterprise website.

Keep it simple.


# ============================================================
# 19. APP LAYOUT
# ============================================================

Authenticated application uses AppLayout.

Desktop:

Sidebar + Main Content.

Mobile:

Responsive navigation.

Main navigation:

- Tổng quan
- Từ vựng
- Luyện tập
- Hồ sơ

Do not create unnecessary navigation items.


# ============================================================
# 20. VOCABULARY LIBRARY
# ============================================================

Route:

/vocabulary

Purpose:

Allow users to manage vocabulary sets.

Display:

- Set name
- Description
- Word count
- Created date
- Last updated
- Actions

Actions:

- Mở
- Học
- Chỉnh sửa
- Xóa

Main button:

"+ Tạo bộ từ"


# ============================================================
# 21. CREATE VOCABULARY SET
# ============================================================

Form:

Tên bộ từ *

Mô tả

Validation:

Name required.

Show Vietnamese validation messages.

Example:

"Vui lòng nhập tên bộ từ."


# ============================================================
# 22. VOCABULARY DETAIL
# ============================================================

Route:

/vocabulary/:setId

Purpose:

Show all words inside a vocabulary set.

Header:

Set name

Description

Word count

Actions:

- Học
- Flashcard
- Gõ từ
- Chỉnh sửa
- Xóa


# ============================================================
# 23. WORD TABLE
# ============================================================

Columns:

STT

Từ

IPA

Loại từ

Nghĩa

Ví dụ

Trạng thái

Thao tác


# ============================================================
# 24. ADD WORD
# ============================================================

Form:

Từ tiếng Anh *

IPA

Loại từ

Nghĩa tiếng Việt *

Ví dụ

Ghi chú

Buttons:

"Lưu"

"Hủy"


# ============================================================
# 25. EDIT WORD
# ============================================================

Users can edit:

word

IPA

part_of_speech

meaning_vi

example

note

After successful update:

"Đã cập nhật từ vựng."


# ============================================================
# 26. DELETE WORD
# ============================================================

Before deletion show confirmation.

Example:

"Bạn có chắc muốn xóa từ này không?"

Buttons:

"Hủy"

"Xóa"


# ============================================================
# 27. SEARCH
# ============================================================

Vocabulary library and vocabulary detail must support search.

Search vocabulary sets by:

name

Search words by:

English word

Vietnamese meaning

IPA


# ============================================================
# 28. FILTER
# ============================================================

Vocabulary detail filters:

Tất cả

Chưa học

Đang học

Đã thuộc


# ============================================================
# 29. SORT
# ============================================================

Supported sorting:

A → Z

Z → A

Mới nhất

Cũ nhất

Độ thành thạo


# ============================================================
# 30. TYPING PRACTICE
# ============================================================

Typing practice is an active recall learning mode.

Flow:

Show Vietnamese meaning.

User sees input.

User types English word.

User submits.

System compares answer.

Correct:

"Chính xác!"

Incorrect:

"Chưa chính xác."

Show correct answer after incorrect attempt.

Example:

Meaning:

"quả táo"

User types:

apple

Result:

"Chính xác!"


# ============================================================
# 31. TYPING RULES
# ============================================================

Input comparison should be user-friendly.

At minimum:

- trim whitespace
- case insensitive

Example:

APPLE

Apple

apple

should be treated as the same answer.

Do NOT aggressively normalize spelling unless explicitly designed.

Do not automatically reveal the answer before the user attempts.


# ============================================================
# 32. FLASHCARD PRACTICE
# ============================================================

Flashcard practice should support active recall.

Front:

English word

Example:

apple

User can reveal:

IPA

Vietnamese meaning

Example sentence

After revealing, user chooses:

"Chưa nhớ"

"Khó"

"Nhớ"

"Rất dễ"

For MVP these buttons primarily update basic progress.

Do not implement complex SRS yet.


# ============================================================
# 33. LEARNING PROGRESS
# ============================================================

Track:

correct_count

incorrect_count

mastery

last_reviewed_at

next_review_at

Basic mastery can be:

0 = chưa học

1 = đang học

2 = đã thuộc

Keep MVP simple.


# ============================================================
# 34. UI DESIGN
# ============================================================

Design direction:

Modern

Minimal

Clean

Focused

Friendly

Educational

Avoid:

- excessive gradients
- excessive shadows
- excessive animations
- crowded dashboards
- unnecessary cards
- huge text everywhere

The interface should prioritize content.


# ============================================================
# 35. COLOR SYSTEM
# ============================================================

Use centralized design tokens.

Do not scatter arbitrary colors across components.

Primary color:

Indigo / Blue-purple family.

Background:

Very light neutral.

Text:

Dark neutral.

Success:

Green.

Warning:

Amber.

Error:

Red.

All colors must be centralized through Tailwind configuration
or CSS variables.


# ============================================================
# 36. TYPOGRAPHY
# ============================================================

Use a modern sans-serif.

Preferred:

Inter

or

Geist

Typography should prioritize readability.

Vietnamese characters must render correctly.


# ============================================================
# 37. RESPONSIVE DESIGN
# ============================================================

The application must work on:

Mobile

Tablet

Desktop

Do not create a separate mobile application.

Use responsive layouts.


# ============================================================
# 38. ACCESSIBILITY
# ============================================================

Use:

semantic HTML

proper labels

keyboard navigation

focus states

accessible buttons

accessible forms

Do not rely only on color.


# ============================================================
# 39. LOADING STATES
# ============================================================

Every asynchronous operation should have a loading state.

Examples:

"Đang tải..."

"Đang lưu..."

"Đang xóa..."

Disable relevant buttons during submission.


# ============================================================
# 40. EMPTY STATES
# ============================================================

If user has no vocabulary sets:

"Bạn chưa có bộ từ vựng nào."

CTA:

"Tạo bộ từ đầu tiên"


If vocabulary set has no words:

"Bộ từ này chưa có từ nào."

CTA:

"Thêm từ"


# ============================================================
# 41. ERROR STATES
# ============================================================

Never silently fail.

Show:

Vietnamese message

Retry action when appropriate.

Log technical details to console during development.

Do not expose sensitive backend information to users.


# ============================================================
# 42. COMPONENT RULES
# ============================================================

Reusable components should be created for repeated UI.

Examples:

Button

Input

Modal

Card

Toast

LoadingSpinner

EmptyState

ConfirmDialog

VocabularySetCard

WordRow

ProgressBadge

Flashcard

TypingInput


# ============================================================
# 43. SERVICE RULES
# ============================================================

Database operations belong in services.

Example:

vocabulary.service.js

Functions:

getVocabularySets()

getVocabularySet()

createVocabularySet()

updateVocabularySet()

deleteVocabularySet()

getWords()

createWord()

updateWord()

deleteWord()


Do NOT put raw Supabase queries throughout UI components.


# ============================================================
# 44. REACT STATE
# ============================================================

Use React state and hooks.

Do not introduce Redux unless application complexity genuinely requires it.

Prefer:

useState

useEffect

useMemo

useCallback

custom hooks


# ============================================================
# 45. DATA FETCHING
# ============================================================

For MVP:

Use Supabase client directly through service modules.

Keep fetching logic out of reusable UI components.


# ============================================================
# 46. SECURITY
# ============================================================

NEVER put:

service_role key

database password

private VAPID keys

other secrets

inside frontend source code.

Never commit:

.env

secret files

private keys


Use:

.env.local

and appropriate environment configuration.

Provide:

.env.example

without real secrets.


# ============================================================
# 47. GIT
# ============================================================

Use Git from the beginning.

Commit messages use Conventional Commits.

Examples:

feat: add vocabulary library

feat: add typing practice

feat: add flashcard practice

fix: resolve authentication session issue

refactor: simplify vocabulary service

style: improve vocabulary detail layout

docs: update project specification


# ============================================================
# 48. DEVELOPMENT WORKFLOW
# ============================================================

Before coding:

1. Read MASTER_PROMPT.md
2. Read project documentation.
3. Inspect current code.
4. Understand architecture.
5. Check existing functionality.
6. Identify affected files.

Then:

7. Make a plan.
8. Implement.
9. Run/test.
10. Fix errors.
11. Report changes.


# ============================================================
# 49. DO NOT BREAK EXISTING FEATURES
# ============================================================

Before changing code:

Understand what already works.

Do not rewrite unrelated features.

Do not rename files unnecessarily.

Do not move files unnecessarily.

Do not replace working architecture without reason.

Do not delete working code.

If refactoring is required:

Explain why.

Keep behavior unchanged.


# ============================================================
# 50. NO DUPLICATE ARCHITECTURES
# ============================================================

This rule is extremely important.

Do NOT create:

two routers

two authentication systems

two Supabase clients

two vocabulary services

two registration flows

two login flows

duplicate page implementations

duplicate components

If a legacy implementation exists:

Identify it.

Determine whether it is used.

Do not create another implementation without deciding what happens
to the legacy implementation.


# ============================================================
# 51. LEGACY CODE
# ============================================================

If old HTML/CSS/JS code exists:

Do not automatically delete it.

Determine:

- Is it used?
- Is it imported?
- Is it part of the current application?
- Can it be safely removed?

If migrating from legacy architecture to React:

Do the migration intentionally.

Do not mix two competing frontend architectures indefinitely.


# ============================================================
# 52. MIGRATION
# ============================================================

If the current project is HTML/CSS/JS and the new architecture is
React/Vite:

Create the React application cleanly.

Preserve:

- Supabase project
- database
- migrations
- useful design decisions
- useful data

Do not blindly copy broken legacy code into React.

Only migrate working functionality.


# ============================================================
# 53. DATABASE MIGRATION RULE
# ============================================================

Never modify database schema casually.

If schema changes are required:

Create a Supabase migration.

Migration must be:

versioned

repeatable

reviewable

safe.

Do not drop production tables unless explicitly instructed.


# ============================================================
# 54. TESTING
# ============================================================

After each feature:

Check:

- page loads
- no console errors
- no network errors
- Supabase requests work
- CRUD works
- authentication works
- responsive layout works

Do not claim a feature is complete without testing.


# ============================================================
# 55. BROWSER TESTING
# ============================================================

Check at minimum:

Desktop Chrome

Mobile viewport

Test:

navigation

forms

buttons

modals

loading

errors

empty states


# ============================================================
# 56. PERFORMANCE
# ============================================================

Avoid unnecessary:

re-renders

large libraries

network requests

duplicate queries

huge assets

Do not optimize prematurely.

Prioritize correctness first.


# ============================================================
# 57. CURRENT DEVELOPMENT PRIORITY
# ============================================================

Priority order:

PHASE 0

Project foundation

PHASE 1

Authentication

PHASE 2

Vocabulary Library

PHASE 3

Vocabulary Detail

PHASE 4

Typing Practice

PHASE 5

Flashcard Practice

PHASE 6

Learning Progress

PHASE 7

Review system

PHASE 8

Dashboard improvements

PHASE 9

AI vocabulary import

Future phases may include:

Listening

Speaking

Reading

Social learning

AI tutor

Gamification


# ============================================================
# 58. PHASE 0 — FOUNDATION
# ============================================================

Tasks:

Initialize React + Vite.

Configure Tailwind.

Configure React Router.

Create Supabase client.

Create environment configuration.

Create AppLayout.

Create PublicLayout.

Create basic routing.

Create design tokens.

Create reusable UI primitives.

Create .env.example.

Create README.

Ensure application starts successfully.


# ============================================================
# 59. PHASE 1 — AUTH
# ============================================================

Tasks:

Register

Login

Logout

Session

Protected routes

Email confirmation

Profile creation

Vietnamese error handling

Test complete auth lifecycle.


# ============================================================
# 60. PHASE 2 — VOCABULARY LIBRARY
# ============================================================

Tasks:

List vocabulary sets.

Create vocabulary set.

Edit vocabulary set.

Delete vocabulary set.

Search vocabulary sets.

Show word count.

Empty state.

Loading state.

Error state.


# ============================================================
# 61. PHASE 3 — VOCABULARY DETAIL
# ============================================================

Tasks:

Open set.

List words.

Add word.

Edit word.

Delete word.

Search words.

Filter words.

Sort words.

Show learning status.


# ============================================================
# 62. PHASE 4 — TYPING
# ============================================================

Tasks:

Select vocabulary set.

Show Vietnamese meaning.

Input English answer.

Check answer.

Show feedback.

Update progress.

Next word.


# ============================================================
# 63. PHASE 5 — FLASHCARD
# ============================================================

Tasks:

Show word.

Reveal answer.

Show meaning.

Show IPA.

Show example.

Rate recall.

Update progress.

Next card.


# ============================================================
# 64. PHASE 6 — PROGRESS
# ============================================================

Tasks:

Track mastery.

Track correct answers.

Track incorrect answers.

Track last review.

Track next review.

Display basic progress.


# ============================================================
# 65. PHASE 7 — REVIEW
# ============================================================

Future.

Do not implement until explicitly requested.


# ============================================================
# 66. PHASE 8 — DASHBOARD
# ============================================================

Future.

Do not overbuild.

Dashboard should eventually show:

Words learned

Words to review

Current streak

Recent activity

Learning progress


# ============================================================
# 67. PHASE 9 — AI IMPORT
# ============================================================

Future.

Potential workflow:

User enters:

apple | quả táo
lion | sư tử
...

AI converts input into structured vocabulary.

AI import must be designed securely.

Never expose AI API secret keys in frontend.


# ============================================================
# 68. DESIGN PRINCIPLE
# ============================================================

Every screen must answer:

"What should the learner do next?"

Avoid screens that only display information.

Example:

Vocabulary library:

User sees sets.

Next action:

"Mở bộ từ"

Vocabulary detail:

User sees words.

Next action:

"Học ngay"

Typing:

User answers.

Next action:

"Tiếp theo"


# ============================================================
# 69. LEARNING PRINCIPLE
# ============================================================

EngFore prioritizes active recall.

Typing practice:

HIGH ACTIVE RECALL

Flashcards:

MEDIUM/HIGH ACTIVE RECALL

Passive word lists:

LOW ACTIVE RECALL

The product should encourage practice instead of passive browsing.


# ============================================================
# 70. UX PRINCIPLE
# ============================================================

Do not overwhelm users.

One primary action per screen.

Use clear hierarchy.

Avoid unnecessary dialogs.

Keep learning sessions focused.


# ============================================================
# 71. AI CODING BEHAVIOR
# ============================================================

When working on this project, AI acts as:

Senior Software Engineer

AND

Product-aware developer.

AI must understand existing architecture before changing it.


# ============================================================
# 72. AI MUST READ BEFORE CODING
# ============================================================

Before modifying code:

Read:

MASTER_PROMPT.md

README.md

docs/

Relevant source files.

Relevant database migrations.

Do not start coding immediately without inspecting the project.


# ============================================================
# 73. AI MUST PLAN
# ============================================================

For non-trivial tasks:

First provide:

- current situation
- root cause
- affected files
- implementation plan

Then implement.

Do not ask for confirmation for normal implementation tasks.

Proceed automatically unless a destructive or ambiguous action
is required.


# ============================================================
# 74. AI MUST NOT OVERENGINEER
# ============================================================

Do not add libraries simply because they are popular.

Do not create abstractions that are not needed.

Do not create 10 components for a simple page.

Use the simplest maintainable solution.


# ============================================================
# 75. AI MUST NOT HIDE ERRORS
# ============================================================

Never:

catch errors and ignore them

return fake success

use mock data to hide backend problems

disable RLS to make queries work

hard-code database results

If something fails:

Find the cause.

Fix the cause.


# ============================================================
# 76. AI MUST VERIFY
# ============================================================

After implementation:

Run the application.

Check console.

Check network requests.

Check relevant user flow.

Only then report completion.


# ============================================================
# 77. AI REPORT FORMAT
# ============================================================

At the end of every task:

FILES CREATED:

...

FILES MODIFIED:

...

FEATURES IMPLEMENTED:

...

BUGS FIXED:

...

TESTS:

...

REMAINING ISSUES:

...


# ============================================================
# 78. CURRENT PROJECT STATE
# ============================================================

IMPORTANT:

The project may contain legacy HTML/CSS/JavaScript code.

Do not assume all existing files belong to the new architecture.

Inspect before using.

The goal is to establish a clean React architecture.

Existing Supabase Cloud project may already contain:

database

migrations

authentication configuration

existing data

Preserve useful backend infrastructure.


# ============================================================
# 79. FIRST TASK
# ============================================================

When this MASTER PROMPT is first provided to the AI:

DO NOT immediately implement all features.

First:

1. Inspect the repository.
2. Inspect package.json.
3. Inspect current source structure.
4. Inspect Supabase configuration.
5. Inspect migrations.
6. Inspect existing database schema.
7. Inspect existing authentication implementation.
8. Identify reusable assets.
9. Identify legacy code.
10. Determine migration strategy.

Then create:

docs/
PROJECT_STATUS.md

This file must document:

Current architecture

Current working features

Current broken features

Database state

Authentication state

Migration risks

Recommended next steps.


# ============================================================
# 80. FIRST IMPLEMENTATION TASK
# ============================================================

After analysis:

Create the React + Vite foundation.

Do not implement all vocabulary features immediately.

First ensure:

npm install

npm run dev

works.

Then ensure:

Landing page

Routing

Supabase connection

App layout

Login route

Register route

Protected route

all load without console errors.


# ============================================================
# 81. DEFINITION OF DONE
# ============================================================

A feature is NOT complete simply because code exists.

Feature is complete when:

UI works

logic works

database works

authentication works where required

loading works

errors work

empty state works

responsive layout works

console is clean

network requests succeed

no unrelated feature is broken.


# ============================================================
# 82. IMPORTANT FINAL RULE
# ============================================================

DO NOT try to finish the entire product in one response.

Build incrementally.

One phase at a time.

One feature at a time.

Keep the project working after every phase.

Never sacrifice architecture quality for speed.

The goal is not:

"generate as much code as possible."

The goal is:

"build a working, maintainable vocabulary learning product."


# ============================================================
# END OF MASTER PROJECT SPECIFICATION
# ============================================================  