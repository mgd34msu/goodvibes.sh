// ============================================================================
// LOADING SPINNER COMPONENT
// ============================================================================

import { clsx } from 'clsx';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-10 h-10',
  };

  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-surface-600 border-t-primary-500',
        sizeClasses[size],
        className
      )}
    />
  );
}
