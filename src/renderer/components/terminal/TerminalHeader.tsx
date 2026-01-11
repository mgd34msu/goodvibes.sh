// ============================================================================
// TERMINAL HEADER - Tab bar and controls for terminal view
// ============================================================================

import { useMemo } from 'react';
import { clsx } from 'clsx';
import { useTerminalStore } from '../../stores/terminalStore';
import { useAppStore } from '../../stores/appStore';

// ============================================================================
// TYPES
// ============================================================================

interface TerminalHeaderProps {
  showGitPanel: boolean;
  onToggleGitPanel: () => void;
  hasActiveSession: boolean | undefined;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TerminalHeader({ showGitPanel, onToggleGitPanel, hasActiveSession }: TerminalHeaderProps) {
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const terminals = useMemo(() => Array.from(terminalsMap.values()), [terminalsMap]);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const closeTerminal = useTerminalStore((s) => s.closeTerminal);
  const openFolderPicker = useAppStore((s) => s.openFolderPicker);

  return (
    <div className="flex items-center gap-4 px-3 py-3 bg-surface-900 border-b border-surface-800">
      {/* Terminal Tabs */}
      <div
        className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hidden"
        role="tablist"
        aria-label="Terminal tabs"
      >
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            role="tab"
            tabIndex={0}
            aria-selected={terminal.id === activeTerminalId}
            onClick={() => setActiveTerminal(terminal.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTerminal(terminal.id);
              }
            }}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors group w-fit cursor-pointer',
              terminal.id === activeTerminalId
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
            )}
          >
            <span className={clsx(
                'w-2.5 h-2.5 rounded-full flex-shrink-0',
                terminal.isPreview ? 'bg-accent-500' : 'bg-success-500'
              )}
              aria-hidden="true"
            />
            <span className="truncate">{terminal.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(terminal.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-600 transition-opacity ml-1"
              aria-label={`Close terminal ${terminal.name}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Git Toggle Button - Only show when there's an active CLI session */}
      {hasActiveSession && (
        <button
          onClick={onToggleGitPanel}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            showGitPanel
              ? 'text-primary-400 bg-primary-500/20 hover:bg-primary-500/30'
              : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
          )}
          title={showGitPanel ? 'Hide Git Panel' : 'Show Git Panel'}
          aria-label={showGitPanel ? 'Hide Git Panel' : 'Show Git Panel'}
          aria-pressed={showGitPanel}
        >
          {/* Git Branch Icon */}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18V6M6 6a3 3 0 100-6 3 3 0 000 6zm12 12a3 3 0 100-6 3 3 0 000 6zm0 0V9a3 3 0 00-3-3H9" />
          </svg>
        </button>
      )}

      {/* New Tab Button */}
      <button
        onClick={openFolderPicker}
        className="p-2 mr-2 rounded-lg text-surface-200 bg-surface-800 hover:text-white hover:bg-surface-700 transition-colors border border-surface-700"
        title="New Terminal (Ctrl+N)"
        aria-label="New Terminal (Ctrl+N)"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}

export default TerminalHeader;
