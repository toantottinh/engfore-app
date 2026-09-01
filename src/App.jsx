import React from 'react';
import { Routes, Route } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout.jsx';
import VocabularyLayout from './VocabularyLayout.jsx';
import LearnLayout from './LearnLayout.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import ProtectedRoute, { PublicOnlyRoute } from './components/ProtectedRoute.jsx';

import Home from './pages/Home/index.jsx';
import AuthCallback from './pages/AuthCallback/index.jsx';
import Login from './pages/Login/index.jsx';
import Register from './pages/Register/index.jsx';
import App from './pages/App/index.jsx';
import Vocabulary from './pages/Vocabulary/index.jsx';
import VocabularyDetail from './pages/VocabularyDetail/index.jsx';
import Import from './pages/Import/index.jsx';
import Practice from './pages/Practice/index.jsx';
import PracticeSession from './pages/PracticeSession/index.jsx';
import TypingPractice from './pages/TypingPractice/index.jsx';
import FlashcardPractice from './pages/FlashcardPractice/index.jsx';
import LearningSession from './pages/LearningSession/index.jsx';
import LearnStructures from './pages/LearnStructures/index.jsx';
import StructureReview from './pages/StructureReview/index.jsx';
import StructureImport from './pages/StructureImport/index.jsx';
import ExerciseImport from './pages/ExerciseImport/index.jsx';
import Structures from './pages/Structures/index.jsx';
import StructureDetail from './pages/Structures/StructureDetail.jsx';
import StructureSession from './pages/StructureSession/index.jsx';
import Grammar from './pages/Grammar/index.jsx';
import GrammarTopicDetail from './pages/Grammar/GrammarTopicDetail.jsx';
import GrammarRuleDetail from './pages/Grammar/GrammarRuleDetail.jsx';
import GrammarSession from './pages/GrammarSession/index.jsx';
import Profile from './pages/Profile/index.jsx';

import AdminRoute from './components/AdminRoute.jsx';
import AdminLayout from './layouts/AdminLayout.jsx';
import AdminDashboard from './pages/Admin/index.jsx';
import AdminTopics from './pages/Admin/AdminTopics.jsx';
import AdminSets from './pages/Admin/AdminSets.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Layout công khai */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
      </Route>

      {/* Layout ứng dụng (yêu cầu đăng nhập) */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<App />} />

          {/* Khu vực "Từ vựng" với sub-navigation */}
          <Route path="/vocabulary" element={<VocabularyLayout />}>
            <Route index element={<Vocabulary />} />
            <Route path="import" element={<Import />} />
            <Route path="practice" element={<Practice />} />
          </Route>
          <Route path="/vocabulary/:setId" element={<VocabularyDetail />} />
          <Route path="/learn/session/:setId" element={<LearningSession />} />
          <Route path="/practice/session" element={<PracticeSession />} />
          <Route path="/practice/typing/:setId" element={<TypingPractice />} />
          <Route path="/practice/flashcard/:setId" element={<FlashcardPractice />} />

          {/* Khu vực "Học" với sub-navigation */}
          <Route path="/learn" element={<LearnLayout />}>
            <Route index element={<LearningSession />} />
            {/* CK7 — Structure SRS Queue (user_structures) trong khu học ngắt quãng */}
            <Route path="structures" element={<LearnStructures />} />
            {/* CK10 — Structure Review Session: system tự chọn structure theo queue */}
            <Route path="structures/session" element={<StructureReview />} />
          </Route>

          {/* Sentence Structures:
              - /structures/import (knowledge) là global content -> admin-only.
              - /structures/exercises/import mở cho MỌI user đăng nhập: user tự
                soạn/nhập bài tập vào shared practice bank (RLS INSERT policy +
                RPC guard cho phép authenticated — migration 20260831000000). */}
          <Route path="/structures/exercises/import" element={<ExerciseImport />} />
          <Route element={<AdminRoute />}>
            <Route path="/structures/import" element={<StructureImport />} />
          </Route>

          {/* Structure Library (cho mọi user đăng nhập) */}
          <Route path="/structures" element={<Structures />} />
          <Route path="/structures/:structureId" element={<StructureDetail />} />
          <Route path="/structures/session/:structureId" element={<StructureSession />} />

          {/* Grammar Library (/grammar) — thư viện kiến thức ngữ pháp (content
              library giống Vocabulary/Structures):
              - /grammar                       : danh sách topics nhóm theo CEFR
              - /grammar/:topicId              : danh sách rules của topic
              - /grammar/rule/:ruleId          : Rule + Explanation + Exercises liên quan
              - /grammar/session/:ruleId       : phiên học MỘT rule (SRS của /learn)
              SRS/queue thuộc /learn — KHÔNG tạo /learn/grammar riêng. */}
          <Route path="/grammar" element={<Grammar />} />
          <Route path="/grammar/:topicId" element={<GrammarTopicDetail />} />
          <Route path="/grammar/rule/:ruleId" element={<GrammarRuleDetail />} />
          <Route path="/grammar/session/:ruleId" element={<GrammarSession />} />

          <Route path="/profile" element={<Profile />} />
        </Route>
        
        {/* Admin Section */}
        <Route element={<AdminRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="topics" element={<AdminTopics />} />
            <Route path="sets" element={<AdminSets />} />
          </Route>
        </Route>
      </Route>

      {/* Route mặc định */}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
