import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { authService } from '../../services/auth.service.js';
import { getAuthErrorMessage } from '../../utils/auth-errors.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Alert from '../../components/ui/Alert.jsx';
import {
  getUserDailyNewLimit,
  updateDailyNewLimit,
  DEFAULT_DAILY_NEW_LIMIT,
  DAILY_NEW_LIMIT_OPTIONS,
} from '../../services/learning.service.js';
import {
  getUserDailyNewStructureLimit,
  updateDailyNewStructureLimit,
  DEFAULT_DAILY_NEW_STRUCTURE_LIMIT,
  DAILY_NEW_STRUCTURE_LIMIT_OPTIONS,
} from '../../services/structure-learning.service.js';

export default function Profile() {
  const { user, profile } = useAuth();
  const [username, setUsername] = useState(profile?.username || '');
  const [dailyNewLimit, setDailyNewLimit] = useState(DEFAULT_DAILY_NEW_LIMIT);
  const [dailyNewStructureLimit, setDailyNewStructureLimit] = useState(
    DEFAULT_DAILY_NEW_STRUCTURE_LIMIT
  );
  const [dailyGoal, setDailyGoal] = useState(20); // users.daily_goal (mục tiêu hôm nay)
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const displayName = profile?.username || user?.email?.split('@')[0] || 'Người dùng';

  // Load đầy đủ hồ sơ (gồm daily_goal) từ bảng users + hạn mức daily hiện có.
  useEffect(() => {
    let mounted = true;
    if (user?.id) {
      authService.getProfile(user.id).then(({ data, error }) => {
        if (!mounted || error || !data) return;
        setUsername((prev) => prev || data.username || '');
        setDailyGoal(Number(data.daily_goal) || 20);
      });
      getUserDailyNewStructureLimit(user.id).then(({ value }) => {
        if (!mounted) return;
        if (Number.isFinite(value)) setDailyNewStructureLimit(value);
      });
    }
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!user) return;
    if (!username.trim()) {
      setError('Vui lòng nhập tên người dùng.');
      return;
    }
    setSaving(true);
    const { error, value } = await updateDailyNewLimit(user.id, dailyNewLimit);
    if (!error) {
      // Persist hạn mức cấu trúc mới mỗi ngày (user_settings mirror vocabulary).
      await updateDailyNewStructureLimit(user.id, dailyNewStructureLimit);
    }
    if (!error && Number.isFinite(dailyGoal) && dailyGoal > 0) {
      // Lưu mục tiêu hôm nay (users.daily_goal) — RLS cho phép user tự cập nhật.
      const profRes = await authService.updateProfile(user.id, {
        daily_goal: Math.max(1, Math.min(100, Math.round(dailyGoal))),
      });
      if (profRes?.error) {
        setSaving(false);
        setError(getAuthErrorMessage(profRes.error));
        return;
      }
    }
    setSaving(false);
    if (error) {
      setError(getAuthErrorMessage(error));
    } else {
      setMessage('Đã cập nhật hồ sơ thành công.');
      setUsername(username.trim());
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Hồ sơ</h1>
        <p className="mt-1 text-sm text-zinc-500">Quản lý thông tin tài khoản của bạn.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-700">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-zinc-900">{displayName}</p>
            <p className="text-sm text-zinc-500">{user?.email}</p>
          </div>
        </div>

        {error && <Alert type="error" message={error} className="mb-4" />}
        {message && <Alert type="success" message={message} className="mb-4" />}

        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Tên người dùng"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Tên hiển thị"
          />
          <label className="block text-sm font-medium text-zinc-700 mb-1">Từ mới mỗi ngày</label>
          <select
            className="w-full rounded-xl py-2.5 px-3 border border-zinc-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
            value={dailyNewLimit}
            onChange={(e) => setDailyNewLimit(Number(e.target.value))}
          >
            {DAILY_NEW_LIMIT_OPTIONS.map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </select>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Cấu trúc mới mỗi ngày
          </label>
          <select
            aria-label="Cấu trúc mới mỗi ngày"
            className="w-full rounded-xl py-2.5 px-3 border border-zinc-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
            value={dailyNewStructureLimit}
            onChange={(e) => setDailyNewStructureLimit(Number(e.target.value))}
          >
            {DAILY_NEW_STRUCTURE_LIMIT_OPTIONS.map((limit) => (
              <option key={limit} value={limit}>
                {limit}
              </option>
            ))}
          </select>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Mục tiêu hôm nay (daily goal)
          </label>
          <input
            type="number"
            min="1"
            max="100"
            className="w-full rounded-xl py-2.5 px-3 border border-zinc-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
            value={dailyGoal}
            onChange={(e) => setDailyGoal(Number(e.target.value))}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" loading={saving}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
