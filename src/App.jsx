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
import Review from './pages/Review/index.jsx';
import TypingPractice from './pages/TypingPractice/index.jsx';
import FlashcardPractice from './pages/FlashcardPractice/index.jsx';
import Profile from './pages/Profile/index.jsx';

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
          <Route path="/vocabulary/:setId" element={<VocabularyDetail />} /> {/* Chi tiết bộ từ vẫn giữ nguyên */}
          <Route path="/practice/typing/:setId" element={<TypingPractice />} />
          <Route path="/practice/flashcard/:setId" element={<FlashcardPractice />} />

          {/* Khu vực "Học" với sub-navigation */}
          <Route path="/learn" element={<LearnLayout />}>
            <Route index element={<Review />} />
          </Route>
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>

      {/* Route mặc định */}
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
