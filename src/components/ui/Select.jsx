import React from 'react';

export default function Select({
  label,
  error,
  hint,
  className = '',
  id,
  options = [],
  ...props
}) {
  const selectId = id || props.name;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-text-secondary"
        >
          {label}
        </label>
      )}

      <select
        id={selectId}
        className={`w-full rounded-lg border bg-surface-default px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary ${
          error ? 'border-red-500' : 'border-border-color'
        } ${className}`}
        {...props}
      >
        {(options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-text-secondary">{hint}</p>
      ) : null}
    </div>
  );
}
