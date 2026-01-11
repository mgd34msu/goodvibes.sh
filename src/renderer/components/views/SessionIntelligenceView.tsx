// ============================================================================
// SESSION INTELLIGENCE VIEW - Session summaries, comparison, and resumption
// ============================================================================

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

// Types matching the backend
interface SessionSummary {
  id: number;
  sessionId: string;
  projectPath: string;
  title: string;
  description: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  status: 'completed' | 'aborted' | 'error';
  toolCalls: number;
  filesModified: number;
  filesCreated: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  tokensUsed: number;
  costUsd: number;
  activeAgentIds: string;
  injectedSkillIds: string;
  keyTopics: string;
  fileChanges: string;
  lastPrompt: string | null;
  contextSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionComparison {
  session1: SessionSummary;
  session2: SessionSummary;
  commonFiles: string[];
  session1OnlyFiles: string[];
  session2OnlyFiles: string[];
  durationDiff: number;
  costDiff: number;
  toolCallsDiff: number;
}

interface ResumptionContext {
  previousSessionId: string;
  previousSummary: SessionSummary;
  contextToInject: string;
  lastPrompt: string | null;
  suggestedStartingPrompt: string;
}

type TabType = 'sessions' | 'compare' | 'search';

export default function SessionIntelligenceView() {
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionSummary | null>(null);
  const [compareSession1, setCompareSession1] = useState<string>('');
  const [compareSession2, setCompareSession2] = useState<string>('');
  const [comparison, setComparison] = useState<SessionComparison | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showResumptionModal, setShowResumptionModal] = useState(false);
  const [resumptionContext, setResumptionContext] = useState<ResumptionContext | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    setIsLoading(true);
    try {
      // Use getSessions which returns all sessions
      const result = await window.clausitron?.getSessions?.();
      // Transform to SessionSummary format
      const summaries: SessionSummary[] = (result || []).slice(0, 50).map((s: Record<string, unknown>) => ({
        id: typeof s.id === 'number' ? s.id : 0,
        sessionId: String(s.id ?? ''),
        projectPath: String(s.cwd ?? ''),
        title: String(s.name ?? 'Untitled Session'),
        description: String(s.summary ?? ''),
        startedAt: String(s.startedAt ?? new Date().toISOString()),
        endedAt: s.endedAt ? String(s.endedAt) : null,
        durationMs: typeof s.durationMs === 'number' ? s.durationMs : 0,
        status: (s.status as 'completed' | 'aborted' | 'error') ?? 'completed',
        toolCalls: typeof s.toolCalls === 'number' ? s.toolCalls : 0,
        filesModified: 0,
        filesCreated: 0,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        tokensUsed: typeof s.totalTokens === 'number' ? s.totalTokens : 0,
        costUsd: typeof s.estimatedCost === 'number' ? s.estimatedCost : 0,
        activeAgentIds: '',
        injectedSkillIds: '',
        keyTopics: '',
        fileChanges: '',
      }));
      setSessions(summaries);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCompare() {
    if (!compareSession1 || !compareSession2) return;
    // Compare sessions client-side since there's no backend endpoint
    const session1 = sessions.find(s => s.sessionId === compareSession1);
    const session2 = sessions.find(s => s.sessionId === compareSession2);
    if (session1 && session2) {
      setComparison({
        session1,
        session2,
        commonFiles: [],
        session1OnlyFiles: [],
        session2OnlyFiles: [],
        durationDiff: session1.durationMs - session2.durationMs,
        costDiff: session1.costUsd - session2.costUsd,
        toolCallsDiff: session1.toolCalls - session2.toolCalls,
      });
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const result = await window.clausitron?.searchSessions?.(searchQuery);
      setSearchResults(result || []);
    } catch (error) {
      console.error('Failed to search sessions:', error);
    }
  }

  async function handlePrepareResumption(sessionId: string) {
    // Find the session and prepare resumption context
    const session = sessions.find(s => s.sessionId === sessionId);
    if (session) {
      setResumptionContext({
        previousSessionId: session.sessionId,
        previousSummary: session,
        contextToInject: session.description,
        lastPrompt: session.lastPrompt,
        suggestedStartingPrompt: `Continue working on: ${session.title}`,
      });
      setShowResumptionModal(true);
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(0)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    return date.toLocaleDateString();
  }

  function parseTopics(topicsJson: string): string[] {
    try {
      return JSON.parse(topicsJson);
    } catch {
      return [];
    }
  }

  function parseFileChanges(changesJson: string): Array<{ filePath: string; action: string }> {
    try {
      return JSON.parse(changesJson);
    } catch {
      return [];
    }
  }

  function getStatusBadge(status: SessionSummary['status']): { bg: string; text: string } {
    switch (status) {
      case 'completed': return { bg: 'bg-green-500/20', text: 'text-green-400' };
      case 'aborted': return { bg: 'bg-yellow-500/20', text: 'text-yellow-400' };
      case 'error': return { bg: 'bg-red-500/20', text: 'text-red-400' };
      default: return { bg: 'bg-surface-700', text: 'text-surface-400' };
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-400">Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-surface-100">Session Intelligence</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-surface-700">
          {(['sessions', 'compare', 'search'] as TabType[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={clsx(
                'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab
                  ? 'text-primary-400 border-primary-400'
                  : 'text-surface-400 border-transparent hover:text-surface-200'
              )}
            >
              {tab === 'sessions' && `Sessions (${sessions.length})`}
              {tab === 'compare' && 'Compare'}
              {tab === 'search' && 'Search'}
            </button>
          ))}
        </div>

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Session List */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-surface-300">Recent Sessions</h3>
              {sessions.length === 0 ? (
                <div className="card p-8 text-center">
                  <div className="text-surface-400">No sessions recorded yet</div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-auto">
                  {sessions.map(session => {
                    const badge = getStatusBadge(session.status);
                    const topics = parseTopics(session.keyTopics);
                    return (
                      <div
                        key={session.sessionId}
                        className={clsx(
                          'card p-4 cursor-pointer transition-colors',
                          selectedSession?.sessionId === session.sessionId
                            ? 'ring-2 ring-primary-500'
                            : 'hover:bg-surface-800'
                        )}
                        onClick={() => setSelectedSession(session)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium text-surface-100 truncate flex-1">
                            {session.title}
                          </div>
                          <span className={clsx('px-2 py-0.5 rounded text-xs ml-2', badge.bg, badge.text)}>
                            {session.status}
                          </span>
                        </div>
                        <div className="text-sm text-surface-400 line-clamp-2 mb-2">
                          {session.description}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-surface-500">
                          <span>{formatDate(session.startedAt)}</span>
                          <span>{formatDuration(session.durationMs)}</span>
                          <span>{session.toolCalls} tools</span>
                        </div>
                        {topics.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {topics.slice(0, 3).map(topic => (
                              <span key={topic} className="px-1.5 py-0.5 bg-surface-700 rounded text-xs text-surface-300">
                                {topic}
                              </span>
                            ))}
                            {topics.length > 3 && (
                              <span className="px-1.5 py-0.5 text-xs text-surface-500">
                                +{topics.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Session Detail */}
            <div>
              <h3 className="text-sm font-medium text-surface-300 mb-3">Session Details</h3>
              {selectedSession ? (
                <SessionDetail
                  session={selectedSession}
                  onResume={() => handlePrepareResumption(selectedSession.sessionId)}
                  formatDuration={formatDuration}
                  formatDate={formatDate}
                  parseFileChanges={parseFileChanges}
                  parseTopics={parseTopics}
                />
              ) : (
                <div className="card p-12 text-center">
                  <div className="text-surface-400">Select a session to view details</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compare Tab */}
        {activeTab === 'compare' && (
          <div className="space-y-6">
            {/* Session Selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-surface-300 mb-1">Session 1</label>
                <select
                  value={compareSession1}
                  onChange={e => setCompareSession1(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select session...</option>
                  {sessions.map(s => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.title} - {formatDate(s.startedAt)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-surface-300 mb-1">Session 2</label>
                <select
                  value={compareSession2}
                  onChange={e => setCompareSession2(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select session...</option>
                  {sessions.map(s => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.title} - {formatDate(s.startedAt)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleCompare}
              disabled={!compareSession1 || !compareSession2}
              className="btn btn-primary"
            >
              Compare Sessions
            </button>

            {/* Comparison Results */}
            {comparison && (
              <ComparisonResults
                comparison={comparison}
                formatDuration={formatDuration}
              />
            )}
          </div>
        )}

        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="input flex-1"
                placeholder="Search sessions by topic, description, or prompt..."
              />
              <button onClick={handleSearch} className="btn btn-primary">
                Search
              </button>
            </div>

            {searchResults.length > 0 ? (
              <div className="space-y-2">
                {searchResults.map(session => {
                  const badge = getStatusBadge(session.status);
                  return (
                    <div key={session.sessionId} className="card p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-medium text-surface-100">{session.title}</div>
                        <span className={clsx('px-2 py-0.5 rounded text-xs', badge.bg, badge.text)}>
                          {session.status}
                        </span>
                      </div>
                      <div className="text-sm text-surface-400 mb-2">{session.description}</div>
                      <div className="flex items-center gap-4 text-xs text-surface-500">
                        <span>{formatDate(session.startedAt)}</span>
                        <span>{formatDuration(session.durationMs)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : searchQuery && (
              <div className="card p-8 text-center">
                <div className="text-surface-400">No sessions found matching "{searchQuery}"</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resumption Modal */}
      {showResumptionModal && resumptionContext && (
        <ResumptionModal
          context={resumptionContext}
          onClose={() => setShowResumptionModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// SESSION DETAIL COMPONENT
// ============================================================================

function SessionDetail({
  session,
  onResume,
  formatDuration,
  formatDate: _formatDate,
  parseFileChanges,
  parseTopics,
}: {
  session: SessionSummary;
  onResume: () => void;
  formatDuration: (ms: number) => string;
  formatDate: (dateStr: string) => string;
  parseFileChanges: (json: string) => Array<{ filePath: string; action: string }>;
  parseTopics: (json: string) => string[];
}) {
  void _formatDate; // Available for future use
  const fileChanges = parseFileChanges(session.fileChanges);
  const topics = parseTopics(session.keyTopics);

  return (
    <div className="card p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-surface-100">{session.title}</h2>
        <p className="text-sm text-surface-400 mt-1">{session.description}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatItem label="Duration" value={formatDuration(session.durationMs)} />
        <StatItem label="Tool Calls" value={session.toolCalls.toString()} />
        <StatItem label="Files Modified" value={session.filesModified.toString()} />
        <StatItem label="Files Created" value={session.filesCreated.toString()} />
        <StatItem label="Tokens" value={session.tokensUsed.toLocaleString()} />
        <StatItem label="Cost" value={`$${session.costUsd.toFixed(4)}`} />
      </div>

      {/* Test Results */}
      {session.testsRun > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-300 mb-2">Test Results</h4>
          <div className="flex items-center gap-4">
            <span className="text-green-400">{session.testsPassed} passed</span>
            <span className="text-red-400">{session.testsFailed} failed</span>
            <span className="text-surface-500">of {session.testsRun} total</span>
          </div>
        </div>
      )}

      {/* Topics */}
      {topics.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-300 mb-2">Key Topics</h4>
          <div className="flex flex-wrap gap-2">
            {topics.map(topic => (
              <span key={topic} className="px-2 py-1 bg-surface-700 rounded text-sm text-surface-200">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* File Changes */}
      {fileChanges.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-surface-300 mb-2">
            File Changes ({fileChanges.length})
          </h4>
          <div className="max-h-40 overflow-auto space-y-1">
            {fileChanges.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className={clsx(
                  'w-16 text-xs',
                  change.action === 'created' && 'text-green-400',
                  change.action === 'modified' && 'text-yellow-400',
                  change.action === 'deleted' && 'text-red-400'
                )}>
                  {change.action}
                </span>
                <span className="text-surface-300 truncate">{change.filePath}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last Prompt */}
      {session.lastPrompt && (
        <div>
          <h4 className="text-sm font-medium text-surface-300 mb-2">Last Prompt</h4>
          <div className="text-sm text-surface-400 bg-surface-800 p-3 rounded max-h-24 overflow-auto">
            {session.lastPrompt}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-surface-700">
        <button onClick={onResume} className="btn btn-primary flex-1">
          Resume Session
        </button>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-surface-500">{label}</div>
      <div className="text-lg font-semibold text-surface-100">{value}</div>
    </div>
  );
}

// ============================================================================
// COMPARISON RESULTS
// ============================================================================

function ComparisonResults({
  comparison,
  formatDuration,
}: {
  comparison: SessionComparison;
  formatDuration: (ms: number) => string;
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Summary */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-surface-100 mb-4">Comparison Summary</h3>

        <div className="space-y-4">
          <DiffItem
            label="Duration"
            value1={formatDuration(comparison.session1.durationMs)}
            value2={formatDuration(comparison.session2.durationMs)}
            diff={comparison.durationDiff}
            formatDiff={formatDuration}
          />
          <DiffItem
            label="Tool Calls"
            value1={comparison.session1.toolCalls.toString()}
            value2={comparison.session2.toolCalls.toString()}
            diff={comparison.toolCallsDiff}
            formatDiff={v => v.toString()}
          />
          <DiffItem
            label="Cost"
            value1={`$${comparison.session1.costUsd.toFixed(4)}`}
            value2={`$${comparison.session2.costUsd.toFixed(4)}`}
            diff={comparison.costDiff}
            formatDiff={v => `$${v.toFixed(4)}`}
          />
        </div>
      </div>

      {/* File Changes */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-surface-100 mb-4">File Changes</h3>

        <div className="space-y-4">
          <div>
            <div className="text-xs text-surface-500 mb-2">
              Common Files ({comparison.commonFiles.length})
            </div>
            <div className="max-h-24 overflow-auto text-sm text-surface-300">
              {comparison.commonFiles.map(f => (
                <div key={f} className="truncate">{f}</div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-green-400 mb-2">
                Session 1 Only ({comparison.session1OnlyFiles.length})
              </div>
              <div className="max-h-24 overflow-auto text-sm text-surface-300">
                {comparison.session1OnlyFiles.map(f => (
                  <div key={f} className="truncate">{f}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-blue-400 mb-2">
                Session 2 Only ({comparison.session2OnlyFiles.length})
              </div>
              <div className="max-h-24 overflow-auto text-sm text-surface-300">
                {comparison.session2OnlyFiles.map(f => (
                  <div key={f} className="truncate">{f}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffItem({
  label,
  value1,
  value2,
  diff,
  formatDiff,
}: {
  label: string;
  value1: string;
  value2: string;
  diff: number;
  formatDiff: (v: number) => string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-surface-400">{label}</span>
      <div className="flex items-center gap-4">
        <span className="text-surface-200">{value1}</span>
        <span className="text-surface-500">vs</span>
        <span className="text-surface-200">{value2}</span>
        <span className={clsx(
          'text-xs px-2 py-0.5 rounded',
          diff > 0 && 'bg-red-500/20 text-red-400',
          diff < 0 && 'bg-green-500/20 text-green-400',
          diff === 0 && 'bg-surface-700 text-surface-400'
        )}>
          {diff > 0 && '+'}{formatDiff(diff)}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// RESUMPTION MODAL
// ============================================================================

function ResumptionModal({
  context,
  onClose,
}: {
  context: ResumptionContext;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="card p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto">
        <h2 className="text-lg font-semibold text-surface-100 mb-4">Resume Session</h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-surface-300 mb-2">Previous Session</h3>
            <div className="text-surface-200">{context.previousSummary.title}</div>
            <div className="text-sm text-surface-400">{context.previousSummary.description}</div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-surface-300 mb-2">Context to Inject</h3>
            <div className="bg-surface-800 p-4 rounded max-h-48 overflow-auto">
              <pre className="text-sm text-surface-300 whitespace-pre-wrap font-mono">
                {context.contextToInject}
              </pre>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-surface-300 mb-2">Suggested Prompt</h3>
            <div className="bg-primary-500/10 border border-primary-500/30 p-4 rounded">
              <p className="text-sm text-surface-200">{context.suggestedStartingPrompt}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(context.suggestedStartingPrompt);
              onClose();
            }}
            className="btn btn-primary flex-1"
          >
            Copy Prompt & Close
          </button>
        </div>
      </div>
    </div>
  );
}
