import React from 'react';

const variants = {
  primary:
    'bg-brand-primary text-white hover:bg-brand-primary-hover focus-visible:ring-brand-primary disabled:bg-brand-primary-soft',
  secondary:
    'bg-surface-sidebar text-text-primary border border-border-color hover:bg-surface-hover focus-visible:ring-border-color disabled:text-text-secondary/60',
  danger:
    'bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger disabled:bg-danger/50',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary focus-visible:ring-border-color disabled:text-text-secondary/50',
  success:
    'bg-success text-white hover:bg-success/90 focus-visible:ring-success disabled:bg-success/50',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

