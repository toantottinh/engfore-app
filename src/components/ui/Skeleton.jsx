import React from 'react';

export default function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse rounded bg-border-color/60 ${className}`} />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border-color bg-surface-sidebar p-5 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}