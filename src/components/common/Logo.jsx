import React, { useId } from 'react';

const sizeConfig = {
  sm: { icon: 'h-6 w-6', text: 'text-base' },
  md: { icon: 'h-8 w-8', text: 'text-xl' },
  lg: { icon: 'h-12 w-12', text: 'text-3xl' },
};

export default function Logo({ size = 'md', showText = true, className = '' }) {
  const gradId = useId();
  const cfg = sizeConfig[size] || sizeConfig.md;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        className={cfg.icon}
        viewBox="0 0 64 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        {/* Vòng lặp vô cực (Loop / Infinity) */}
        <path
          d="M16 20 C16 10, 28 10, 32 20 C36 30, 48 30, 48 20 C48 10, 36 10, 32 20 C28 30, 16 30, 16 20 Z"
          stroke={`url(#${gradId})`}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Chữ V cách điệu (Vocabulary) */}
        <path
          d="M24 13 L32 29 L40 13"
          stroke="#1e293b"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showText && (
        <span className={`font-semibold tracking-tight ${cfg.text}`}>
          <span className="font-light text-indigo-400">e</span>
          <span className="font-bold text-slate-800">Voca</span>
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text font-semibold text-transparent">
            Loop
          </span>
        </span>
      )}
    </span>
  );
}

export function LogoIcon({ size = 'md', className = '' }) {
  return <Logo size={size} showText={false} className={className} />;
}
