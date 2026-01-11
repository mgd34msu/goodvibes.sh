// ============================================================================
// LOADING OVERLAY COMPONENT
// ============================================================================

import { LoadingSpinner } from './LoadingSpinner';
import { useAppStore } from '../../stores/appStore';

interface LoadingOverlayProps {
  message?: string | null;
}

export function LoadingOverlay({ message }: LoadingOverlayProps) {
  const progress = useAppStore((s) => s.loadingProgress);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-950/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 bg-surface-900 rounded-2xl shadow-elevation-5 border border-surface-800">
        <LoadingSpinner size="lg" />

        <div className="text-center">
          <h2 className="text-lg font-semibold text-surface-100">Loading</h2>
          {message && (
            <p className="mt-1 text-sm text-surface-400">{message}</p>
          )}
        </div>

        {progress && (
          <div className="w-64">
            <div className="flex justify-between text-xs text-surface-500 mb-1">
              <span>Progress</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
