import React, { useState } from 'react';
import useUserPlan from '../hooks/useUserPlan.js';
import UpgradeModal from './UpgradeModal.jsx';

export default function AdBanner({ onUpgrade }) {
  const { isAdFree } = useUserPlan();
  const [open, setOpen] = useState(false);

  if (isAdFree) return null;

  return (
    <>
      <div className="mt-6 rounded-xl border border-border-color bg-surface-default p-4 text-sm text-text-secondary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Nâng cấp gói từ vựng hoặc tắt quảng cáo để trải nghiệm tốt hơn.
          </span>
          <button
            type="button"
            onClick={() => {
              onUpgrade?.();
              setOpen(true);
            }}
            className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            Nâng cấp
          </button>
        </div>
      </div>
      <UpgradeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
