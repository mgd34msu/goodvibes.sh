// ============================================================================
// MONITOR VIEW COMPONENT
// ============================================================================

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import type { Session, ActivityLogEntry } from '../../../shared/types';
import { useTerminalStore } from '../../stores/terminalStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { formatDuration, formatRelativeTime, decodeProjectName } from '../../../shared/utils';

export default function MonitorView() {
  const terminalCount = useTerminalStore((s) => s.terminals.size);
  const { settings } = useSettingsStore();
  const [appUptime, setAppUptime] = useState(0);

  const { data: liveSessions = [] } = useQuery<Session[]>({
    queryKey: ['live-sessions'],
    queryFn: () => window.clausitron.getLiveSessions(),
    refetchInterval: 5000,
  });

  const { data: activity = [] } = useQuery<ActivityLogEntry[]>({
    queryKey: ['activity'],
    queryFn: () => window.clausitron.getRecentActivity(20),
    refetchInterval: 10000,
  });

  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => window.clausitron.getAnalytics(),
    refetchInterval: 30000,
  });

  // Get today's message count from analytics
  const todayMessageCount = analytics?.messagesToday ?? 0;

  // Track app uptime
  useEffect(() => {
    const interval = setInterval(() => {
      setAppUptime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="text-xl font-semibold text-surface-100">Live Monitor</h1>
            <p className="text-sm text-surface-500 mt-1">Real-time activity and metrics</p>
          </div>
          <div className="flex items-center gap-3">
            {terminalCount > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success-500/10 border border-success-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success-500"></span>
                </span>
                <span className="text-sm font-medium text-success-400">{terminalCount} active</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-800 border border-surface-700">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-surface-500"></span>
                </span>
                <span className="text-sm text-surface-400">No active terminals</span>
              </div>
            )}
          </div>
        </div>

        {/* Metrics Panel */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon="🖥️"
            value={terminalCount.toString()}
            label="Active Terminals"
            accentColor="primary"
          />
          <MetricCard
            icon="📊"
            value={liveSessions.length.toString()}
            label="Recent Sessions"
            accentColor="accent"
          />
          <MetricCard
            icon="📨"
            value={todayMessageCount.toString()}
            label="Messages Today"
            accentColor="success"
          />
          <MetricCard
            icon="⏱️"
            value={formatDuration(appUptime)}
            label="App Uptime"
            accentColor="warning"
          />
        </div>

        {/* Live Sessions Grid */}
        {liveSessions.length > 0 && (
          <div>
            <div className="section-header-pro">
              <h2>Live Sessions</h2>
              <span className="section-count">{liveSessions.length}</span>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveSessions.map((session) => (
                <LiveSessionCard key={session.id} session={session} projectsRoot={settings.projectsRoot} />
              ))}
            </div>
          </div>
        )}

        {/* Activity Feed */}
        <div>
          <div className="section-header-pro">
            <h2>Activity Feed</h2>
            {activity.length > 0 && <span className="section-count">{activity.length}</span>}
          </div>
          <div className="card-elevated rounded-xl overflow-hidden">
            {activity.length === 0 ? (
              <div className="empty-state-pro">
                <div className="empty-icon-wrap">
                  <span className="emoji-icon">📋</span>
                </div>
                <h3>No recent activity</h3>
                <p>Activity from your terminals and sessions will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-surface-800/50">
                {activity.map((entry) => (
                  <ActivityItem key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// METRIC CARD
// ============================================================================

type AccentColor = 'primary' | 'accent' | 'success' | 'warning' | 'error';

const accentColorClasses: Record<AccentColor, string> = {
  primary: 'bg-primary-500/10 ring-primary-500/20',
  accent: 'bg-accent-500/10 ring-accent-500/20',
  success: 'bg-success-500/10 ring-success-500/20',
  warning: 'bg-warning-500/10 ring-warning-500/20',
  error: 'bg-error-500/10 ring-error-500/20',
};

function MetricCard({ icon, value, label, accentColor = 'primary' }: { icon: string; value: string; label: string; accentColor?: AccentColor }) {
  return (
    <div className="metric-card-pro group">
      <div className={clsx(
        'metric-icon-wrap ring-1 transition-all duration-200 group-hover:scale-105',
        accentColorClasses[accentColor]
      )}>
        <span className="text-xl">{icon}</span>
      </div>
      <div className="metric-content">
        <div className="metric-value">{value}</div>
        <div className="metric-label">{label}</div>
      </div>
    </div>
  );
}

// ============================================================================
// LIVE SESSION CARD
// ============================================================================

function LiveSessionCard({ session, projectsRoot }: { session: Session; projectsRoot: string | null }) {
  return (
    <div className="card-interactive group">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success-500"></span>
        </span>
        <span className="text-sm font-semibold text-surface-100 truncate flex-1 group-hover:text-primary-400 transition-colors">
          {decodeProjectName(session.projectName, projectsRoot)}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-surface-500">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>{session.messageCount} messages</span>
        </div>
        <span className="text-surface-600">{formatRelativeTime(session.endTime)}</span>
      </div>
    </div>
  );
}

// ============================================================================
// ACTIVITY ITEM
// ============================================================================

function ActivityItem({ entry }: { entry: ActivityLogEntry }) {
  // Parse metadata to extract project name if available
  let projectName: string | null = null;
  if (entry.metadata) {
    try {
      const metadata = typeof entry.metadata === 'string'
        ? JSON.parse(entry.metadata)
        : entry.metadata;
      if (metadata?.projectName) {
        // Decode the mangled path to get just the folder name
        projectName = decodeProjectName(metadata.projectName);
      }
    } catch {
      // Ignore parse errors
    }
  }

  const { icon, bgColor, textColor } = getActivityIconConfig(entry.type);

  return (
    <div className="flex items-start gap-3.5 px-4 py-3.5 hover:bg-surface-800/30 transition-colors">
      <div className={clsx(
        'w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0',
        bgColor
      )}>
        <span>{icon}</span>
      </div>
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-sm text-surface-200 leading-snug">{entry.description}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-surface-500">{formatRelativeTime(entry.timestamp)}</span>
          {projectName && (
            <>
              <span className="text-surface-600">&#8226;</span>
              <span className={clsx('text-xs font-medium', textColor)}>
                {projectName}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function getActivityIconConfig(type: string): { icon: string; bgColor: string; textColor: string } {
  switch (type) {
    case 'terminal_start':
      return { icon: '▶️', bgColor: 'bg-success-500/10', textColor: 'text-success-400' };
    case 'terminal_end':
      return { icon: '⏹️', bgColor: 'bg-surface-700', textColor: 'text-surface-400' };
    case 'session_start':
      return { icon: '▶️', bgColor: 'bg-primary-500/10', textColor: 'text-primary-400' };
    case 'session_end':
      return { icon: '⏹️', bgColor: 'bg-surface-700', textColor: 'text-surface-400' };
    case 'session_detected':
      return { icon: '🔍', bgColor: 'bg-accent-500/10', textColor: 'text-accent-400' };
    case 'message':
      return { icon: '💬', bgColor: 'bg-primary-500/10', textColor: 'text-primary-400' };
    case 'tool_use':
      return { icon: '🔧', bgColor: 'bg-warning-500/10', textColor: 'text-warning-400' };
    case 'error':
      return { icon: '❌', bgColor: 'bg-error-500/10', textColor: 'text-error-400' };
    default:
      return { icon: '📌', bgColor: 'bg-surface-700', textColor: 'text-surface-400' };
  }
}
