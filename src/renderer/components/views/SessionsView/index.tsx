// ============================================================================
// SESSIONS VIEW COMPONENT - Unified Sessions + Monitor View
// ============================================================================

import { useState } from 'react';
import type { Session, SessionFilter } from './types';
import { useSessions, useLiveSessions, useSessionFilters } from './hooks';
import { useSettingsStore } from '../../../stores/settingsStore';
import { SessionFilters } from './SessionFilters';
import { VirtualSessionList } from './VirtualSessionList';
import { MonitorPanel } from './MonitorPanel';
import { LoadingSkeleton, EmptyState, ErrorState } from './SessionStates';
import { SessionDetailModal } from '../../overlays/SessionDetailModal';

export default function SessionsView() {
  const { settings } = useSettingsStore();
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const { sessions, isLoading, error } = useSessions(filter);
  const { liveSessionIds } = useLiveSessions();
  const { filteredSessions } = useSessionFilters(sessions, search);

  return (
    <div className="flex h-full">
      {/* Left Panel - Sessions List (60%) */}
      <div className="flex flex-col w-[60%] min-w-0 border-r border-surface-700/50">
        {/* Sessions Header with Filters */}
        <SessionFilters
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
        />

        {/* Sessions Content */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState error={error} />
        ) : filteredSessions.length === 0 ? (
          <EmptyState filter={filter} search={search} />
        ) : (
          <VirtualSessionList
            sessions={filteredSessions}
            projectsRoot={settings.projectsRoot}
            liveSessionIds={liveSessionIds}
            onSessionClick={setSelectedSession}
          />
        )}
      </div>

      {/* Right Panel - Monitor (40%) */}
      <div className="w-[40%] min-w-0 bg-surface-950/50">
        <MonitorPanel projectsRoot={settings.projectsRoot} />
      </div>

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionDetailModal session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}
    </div>
  );
}

// Re-export types for convenience
export type { Session, SessionFilter, ActivityLogEntry } from './types';
