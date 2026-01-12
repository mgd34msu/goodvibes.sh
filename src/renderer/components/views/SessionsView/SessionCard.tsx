// ============================================================================
// SESSION CARD COMPONENT
// ============================================================================

import React, { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import type { SessionCardProps } from './types';
import {
  formatCost,
  formatNumber,
  formatRelativeTime,
  decodeProjectName,
  decodeProjectPath,
} from '../../../../shared/utils';
import { useTerminalStore } from '../../../stores/terminalStore';
import { useAppStore } from '../../../stores/appStore';

export function SessionCard({ session, projectsRoot, isLive, onClick }: SessionCardProps) {
  const { createPreviewTerminal, createTerminal } = useTerminalStore();
  const { setCurrentView } = useAppStore();
  const queryClient = useQueryClient();

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await window.goodvibes.toggleFavorite(session.id);
      // Invalidate session queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    [session.id, queryClient]
  );

  const handleToggleArchive = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await window.goodvibes.toggleArchive(session.id);
      // Invalidate session queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    [session.id, queryClient]
  );

  const displayName = session.customTitle || decodeProjectName(session.projectName, projectsRoot);

  // Quick action: Open Preview
  const handleOpenPreview = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const cwd = decodeProjectPath(session.projectName) || undefined;
      createPreviewTerminal(session.id, displayName, cwd);
      setCurrentView('terminal');
    },
    [session.id, session.projectName, displayName, createPreviewTerminal, setCurrentView]
  );

  // Quick action: Open in CLI (Resume Session)
  const handleOpenCLI = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const cwd = decodeProjectPath(session.projectName) || undefined;
      await createTerminal(cwd, displayName, session.id);
      setCurrentView('terminal');
    },
    [session.id, session.projectName, displayName, createTerminal, setCurrentView]
  );

  return (
    <div className="card-hover cursor-pointer h-full overflow-hidden" onClick={onClick}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Live indicator */}
            {isLive && (
              <span className="relative flex h-2 w-2 flex-shrink-0" title="Session is live">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success-500"></span>
              </span>
            )}
            <h3 className="text-sm font-medium text-surface-100 truncate">{displayName}</h3>
            {session.favorite && (
              <span className="text-warning-400 flex-shrink-0">&#9733;</span>
            )}
            {/* Agent badge */}
            {session.id.startsWith('agent-') && (
              <span className="badge text-xs bg-accent-500/20 text-accent-400 flex-shrink-0">
                agent
              </span>
            )}
            {/* Outcome badge - inline for consistent height */}
            {session.outcome && (
              <span
                className={clsx(
                  'badge text-xs flex-shrink-0',
                  session.outcome === 'success' && 'badge-success',
                  session.outcome === 'partial' && 'badge-warning',
                  session.outcome === 'failed' && 'badge-error',
                  session.outcome === 'abandoned' && 'text-surface-500 bg-surface-700'
                )}
              >
                {session.outcome}
              </span>
            )}
            {session.rating && (
              <span className="badge badge-primary text-xs flex-shrink-0">
                {'*'.repeat(session.rating)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-surface-500">
            <span>{formatRelativeTime(session.endTime)}</span>
            <span>{session.messageCount} messages</span>
            <span>{formatNumber(session.tokenCount)} tokens</span>
            <span>{formatCost(session.cost)}</span>
            {session.summary && (
              <span className="truncate text-surface-400" title={session.summary}>
                {session.summary}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Quick action buttons */}
          <button
            onClick={handleOpenPreview}
            className="p-1.5 rounded-lg text-surface-500 hover:text-primary-400 hover:bg-surface-700 transition-colors"
            title="Open Preview"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
          <button
            onClick={handleOpenCLI}
            className="p-1.5 rounded-lg text-surface-500 hover:text-success-400 hover:bg-surface-700 transition-colors"
            title="Open in CLI"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </button>
          <button
            onClick={handleToggleFavorite}
            className="p-1.5 rounded-lg text-surface-500 hover:text-warning-400 hover:bg-surface-700 transition-colors"
            title={session.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg
              className="w-4 h-4"
              fill={session.favorite ? 'currentColor' : 'none'}
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>
          <button
            onClick={handleToggleArchive}
            className="p-1.5 rounded-lg text-surface-500 hover:text-surface-300 hover:bg-surface-700 transition-colors"
            title={session.archived ? 'Unarchive' : 'Archive'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
