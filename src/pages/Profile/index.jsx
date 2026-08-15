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

export default function Profile() {
  const { user, profile } = useAuth();
  const [username, setUsername] = useState(profile?.username || '');
  const [dailyNewLimit, setDailyNewLimit] = useState(DEFAULT_DAILY_NEW_LIMIT);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const displayName = profile?.username || user?.email?.split('@')[0] || 'Người dùng';

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
