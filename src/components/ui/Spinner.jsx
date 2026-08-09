import React from 'react';

export default function Spinner({ className = '' }) {
  return (
    <div className={`flex items-center justify-center py-10 ${className}`}>
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent"
        role="status"
        aria-label="Đang tải..."
      />
    </div>
  );
}
