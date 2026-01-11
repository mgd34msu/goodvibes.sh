// ============================================================================
// EMPTY STATE - Shown when no terminal sessions are open
// ============================================================================

import appIcon from '../../assets/icon.png';

// ============================================================================
// TYPES
// ============================================================================

interface EmptyStateProps {
  onNewSession: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function EmptyState({ onNewSession }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-surface-900">
      <div className="text-center max-w-md mx-auto px-6">
        <img
          src={appIcon}
          alt="Clausitron"
          className="w-24 h-24 mx-auto mb-8"
        />
        <h2 className="text-3xl font-bold text-surface-100 mb-4">
          Welcome to Clausitron
        </h2>
        <p className="text-surface-400 text-base mb-10 leading-relaxed">
          Start a new Claude CLI session to begin working on your project.
        </p>
        <button
          onClick={onNewSession}
          className="btn btn-primary btn-lg gap-3 px-8 py-4"
          aria-label="Start new session"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Session
        </button>
      </div>
    </div>
  );
}

export default EmptyState;
