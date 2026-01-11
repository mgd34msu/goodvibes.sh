// ============================================================================
// SKELETON LOADING COMPONENT
// ============================================================================

import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  lines = 1,
}: SkeletonProps) {
  const baseClasses = 'shimmer';

  const variantClasses = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  if (lines > 1 && variant === 'text') {
    return (
      <div className={clsx('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={clsx(baseClasses, variantClasses.text)}
            style={{
              ...style,
              width: i === lines - 1 ? '70%' : style.width,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={clsx(baseClasses, variantClasses[variant], className)}
      style={style}
    />
  );
}

// Pre-built skeleton patterns
export function SessionCardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton width="60%" height={20} />
        <Skeleton variant="circular" width={24} height={24} />
      </div>
      <Skeleton lines={2} />
      <div className="flex gap-2">
        <Skeleton width={60} height={24} variant="rectangular" />
        <Skeleton width={80} height={24} variant="rectangular" />
      </div>
    </div>
  );
}

export function AnalyticsCardSkeleton() {
  return (
    <div className="card p-4 space-y-2">
      <Skeleton width="50%" height={16} />
      <Skeleton width="80%" height={32} />
    </div>
  );
}

export function TerminalTabSkeleton() {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Skeleton variant="circular" width={16} height={16} />
      <Skeleton width={80} height={16} />
    </div>
  );
}
