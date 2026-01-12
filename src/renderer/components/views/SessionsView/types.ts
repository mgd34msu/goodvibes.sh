// ============================================================================
// SESSIONS VIEW - TYPE DEFINITIONS
// ============================================================================

import type { Session, ActivityLogEntry } from '../../../../shared/types';

export type { Session, ActivityLogEntry };

export type SessionFilter = 'all' | 'favorites' | 'archived';

export type AccentColor = 'primary' | 'accent' | 'success' | 'warning' | 'error';

export interface SessionCardProps {
  session: Session;
  projectsRoot: string | null;
  isLive: boolean;
  onClick: () => void;
}

export interface VirtualSessionListProps {
  sessions: Session[];
  projectsRoot: string | null;
  liveSessionIds: Set<string>;
  onSessionClick: (session: Session) => void;
}

export interface MonitorPanelProps {
  projectsRoot: string | null;
}

export interface SessionFiltersProps {
  filter: SessionFilter;
  onFilterChange: (filter: SessionFilter) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export interface CompactMetricCardProps {
  icon: string;
  value: string;
  label: string;
  accentColor?: AccentColor;
}

export interface CompactLiveSessionCardProps {
  session: Session;
  projectsRoot: string | null;
}

export interface CompactActivityItemProps {
  entry: ActivityLogEntry;
}
