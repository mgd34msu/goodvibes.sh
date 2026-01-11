// ============================================================================
// LIVE MONITOR VIEW - Real-time file changes and test results
// ============================================================================
//
// This view displays:
// - Live file change stream with diff visualization
// - Git integration for rollback
// - Test output parsing and status badges
// - Coverage display when available
//
// ============================================================================

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import {
  FileCode,
  RotateCcw,
  CheckCircle,
  XCircle,
  AlertCircle,
  GitBranch,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FlaskConical,
} from 'lucide-react';
import { VirtualList } from '../common/VirtualList';
import { formatRelativeTime } from '../../../shared/utils';

// ============================================================================
// Types
// ============================================================================

interface FileChange {
  id: string;
  sessionId: string | null;
  projectPath: string | null;
  filePath: string;
  action: 'created' | 'modified' | 'deleted';
  toolName: 'Edit' | 'Write';
  timestamp: string;
  beforeContent: string | null;
  afterContent: string | null;
  diffLines: DiffLine[];
  isGitRepo: boolean;
  gitStatus: unknown;
  canRollback: boolean;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

interface TestResult {
  id: string;
  sessionId: string | null;
  projectPath: string | null;
  command: string;
  timestamp: string;
  durationMs: number;
  status: 'passed' | 'failed' | 'error' | 'unknown';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  pendingTests: number;
  failedTestDetails: FailedTest[];
  coverage: CoverageInfo | null;
  rawOutput: string;
  framework: string;
}

interface FailedTest {
  name: string;
  suite: string;
  error: string;
  stack: string | null;
  file: string | null;
  line: number | null;
}

interface CoverageInfo {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
  uncoveredFiles: string[];
}

interface FileChangeStats {
  totalChanges: number;
  byAction: Record<string, number>;
  byProject: Record<string, number>;
  recentFiles: string[];
}

interface TestStats {
  totalRuns: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  successRate: number;
  avgDuration: number;
  byFramework: Record<string, number>;
  recentResults: TestResult[];
}

interface RollbackResult {
  success: boolean;
  message: string;
  filePath: string;
  method: 'git' | 'content' | 'none';
}

// ============================================================================
// Component
// ============================================================================

export default function LiveMonitorView() {
  const [activeTab, setActiveTab] = useState<'files' | 'tests'>('files');
  const [expandedChangeId, setExpandedChangeId] = useState<string | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // File changes query
  const { data: fileChanges = [], isLoading: filesLoading } = useQuery<FileChange[]>({
    queryKey: ['live-monitor', 'file-changes'],
    queryFn: () => window.clausitron.liveMonitorGetRecentFileChanges({ limit: 50 }),
    refetchInterval: 3000,
  });

  // File stats query
  const { data: fileStats } = useQuery<FileChangeStats>({
    queryKey: ['live-monitor', 'file-stats'],
    queryFn: () => window.clausitron.liveMonitorGetStats(),
    refetchInterval: 5000,
  });

  // Test results query
  const { data: testResults = [], isLoading: testsLoading } = useQuery<TestResult[]>({
    queryKey: ['live-monitor', 'test-results'],
    queryFn: () => window.clausitron.testMonitorGetRecentResults({ limit: 20 }),
    refetchInterval: 3000,
  });

  // Test stats query
  const { data: testStats } = useQuery<TestStats>({
    queryKey: ['live-monitor', 'test-stats'],
    queryFn: () => window.clausitron.testMonitorGetStats(),
    refetchInterval: 5000,
  });

  // Monitor status
  const { data: monitorStatus } = useQuery({
    queryKey: ['live-monitor', 'status'],
    queryFn: async () => {
      const [fileStatus, testStatus] = await Promise.all([
        window.clausitron.liveMonitorStatus(),
        window.clausitron.testMonitorStatus(),
      ]);
      return { files: fileStatus, tests: testStatus };
    },
  });

  // Listen for real-time updates
  useEffect(() => {
    const cleanupFileChanged = window.clausitron.onFileChanged(() => {
      queryClient.invalidateQueries({ queryKey: ['live-monitor', 'file-changes'] });
      queryClient.invalidateQueries({ queryKey: ['live-monitor', 'file-stats'] });
    });

    const cleanupTestResult = window.clausitron.onTestResult(() => {
      queryClient.invalidateQueries({ queryKey: ['live-monitor', 'test-results'] });
      queryClient.invalidateQueries({ queryKey: ['live-monitor', 'test-stats'] });
    });

    return () => {
      cleanupFileChanged?.();
      cleanupTestResult?.();
    };
  }, [queryClient]);

  // Rollback handler
  const handleRollback = useCallback(async (changeId: string) => {
    try {
      const result: RollbackResult = await window.clausitron.liveMonitorRollbackFile(changeId);
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['live-monitor'] });
      } else {
        console.error('Rollback failed:', result.message);
      }
    } catch (error) {
      console.error('Rollback error:', error);
    }
  }, [queryClient]);

  // Clear handlers
  const handleClearFiles = useCallback(async () => {
    await window.clausitron.liveMonitorClear();
    queryClient.invalidateQueries({ queryKey: ['live-monitor'] });
  }, [queryClient]);

  const handleClearTests = useCallback(async () => {
    await window.clausitron.testMonitorClear();
    queryClient.invalidateQueries({ queryKey: ['live-monitor'] });
  }, [queryClient]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none px-6 py-4 border-b border-surface-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-surface-100">Live Monitor</h1>
            <p className="text-sm text-surface-500 mt-1">
              Real-time file changes and test results
            </p>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-4">
            {monitorStatus?.files?.listening && (
              <div className="flex items-center gap-2 text-xs text-success-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success-500" />
                </span>
                Monitoring files
              </div>
            )}
            {monitorStatus?.tests?.listening && (
              <div className="flex items-center gap-2 text-xs text-primary-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
                </span>
                Monitoring tests
              </div>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 mt-4">
          <TabButton
            active={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
            icon={<FileCode className="w-4 h-4" />}
            label="File Changes"
            count={fileChanges.length}
          />
          <TabButton
            active={activeTab === 'tests'}
            onClick={() => setActiveTab('tests')}
            icon={<FlaskConical className="w-4 h-4" />}
            label="Test Results"
            count={testResults.length}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'files' ? (
          <FileChangesPanel
            changes={fileChanges}
            stats={fileStats}
            loading={filesLoading}
            expandedId={expandedChangeId}
            onExpand={setExpandedChangeId}
            onRollback={handleRollback}
            onClear={handleClearFiles}
          />
        ) : (
          <TestResultsPanel
            results={testResults}
            stats={testStats}
            loading={testsLoading}
            expandedId={expandedTestId}
            onExpand={setExpandedTestId}
            onClear={handleClearTests}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Tab Button
// ============================================================================

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-primary-500/20 text-primary-400'
          : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
      )}
    >
      {icon}
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className={clsx(
          'px-1.5 py-0.5 rounded-full text-xs',
          active ? 'bg-primary-500/30' : 'bg-surface-700'
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================================
// File Changes Panel
// ============================================================================

function FileChangesPanel({
  changes,
  stats,
  loading,
  expandedId,
  onExpand,
  onRollback,
  onClear,
}: {
  changes: FileChange[];
  stats?: FileChangeStats;
  loading: boolean;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onRollback: (id: string) => void;
  onClear: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 text-surface-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      {stats && stats.totalChanges > 0 && (
        <div className="flex-none px-6 py-3 border-b border-surface-800 bg-surface-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="text-surface-400">
                <span className="font-medium text-surface-200">{stats.totalChanges}</span> total changes
              </div>
              {(stats.byAction.created ?? 0) > 0 && (
                <div className="text-success-400">
                  +{stats.byAction.created} created
                </div>
              )}
              {(stats.byAction.modified ?? 0) > 0 && (
                <div className="text-warning-400">
                  ~{stats.byAction.modified} modified
                </div>
              )}
              {(stats.byAction.deleted ?? 0) > 0 && (
                <div className="text-error-400">
                  -{stats.byAction.deleted} deleted
                </div>
              )}
            </div>
            <button
              onClick={onClear}
              className="btn btn-ghost btn-sm text-surface-500 hover:text-error-400"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Changes list */}
      {changes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileCode className="w-12 h-12 text-surface-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-300">No file changes yet</h3>
            <p className="text-surface-500 mt-1">
              File changes from Edit and Write tools will appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <VirtualList
            items={changes}
            itemHeight={expandedId ? 300 : 72}
            className="h-full"
            renderItem={(change) => (
              <FileChangeItem
                key={change.id}
                change={change}
                expanded={expandedId === change.id}
                onExpand={() => onExpand(expandedId === change.id ? null : change.id)}
                onRollback={() => onRollback(change.id)}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// File Change Item
// ============================================================================

function FileChangeItem({
  change,
  expanded,
  onExpand,
  onRollback,
}: {
  change: FileChange;
  expanded: boolean;
  onExpand: () => void;
  onRollback: () => void;
}) {
  const fileName = change.filePath.split(/[/\\]/).pop() || change.filePath;
  const dirPath = change.filePath.split(/[/\\]/).slice(0, -1).join('/');

  return (
    <div className={clsx(
      'border-b border-surface-800 transition-colors',
      expanded ? 'bg-surface-900/50' : 'hover:bg-surface-800/30'
    )}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-3 cursor-pointer"
        onClick={onExpand}
      >
        <button className="text-surface-500">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <div className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          change.action === 'created' && 'bg-success-500/10 text-success-400',
          change.action === 'modified' && 'bg-warning-500/10 text-warning-400',
          change.action === 'deleted' && 'bg-error-500/10 text-error-400'
        )}>
          <FileText className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-surface-200 truncate">{fileName}</span>
            <span className={clsx(
              'px-1.5 py-0.5 rounded text-xs font-medium',
              change.action === 'created' && 'bg-success-500/20 text-success-400',
              change.action === 'modified' && 'bg-warning-500/20 text-warning-400',
              change.action === 'deleted' && 'bg-error-500/20 text-error-400'
            )}>
              {change.action}
            </span>
            <span className="px-1.5 py-0.5 rounded text-xs bg-surface-700 text-surface-400">
              {change.toolName}
            </span>
            {change.isGitRepo && (
              <GitBranch className="w-3.5 h-3.5 text-primary-400" />
            )}
          </div>
          <div className="text-xs text-surface-500 truncate mt-0.5">
            {dirPath}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-surface-500">
            {formatRelativeTime(change.timestamp)}
          </span>
          {change.canRollback && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRollback();
              }}
              className="btn btn-ghost btn-sm text-surface-400 hover:text-warning-400"
              title="Rollback this change"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded diff view */}
      {expanded && change.diffLines.length > 0 && (
        <div className="px-6 pb-4">
          <div className="bg-surface-950 rounded-lg border border-surface-700 overflow-hidden">
            <div className="max-h-64 overflow-auto">
              <pre className="text-xs font-mono">
                {change.diffLines.map((line, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'px-3 py-0.5',
                      line.type === 'added' && 'bg-success-500/10 text-success-300',
                      line.type === 'removed' && 'bg-error-500/10 text-error-300',
                      line.type === 'unchanged' && 'text-surface-400',
                      line.type === 'header' && 'text-primary-400 bg-primary-500/5'
                    )}
                  >
                    <span className="select-none text-surface-600 w-8 inline-block text-right mr-4">
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </span>
                    {line.content}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Test Results Panel
// ============================================================================

function TestResultsPanel({
  results,
  stats,
  loading,
  expandedId,
  onExpand,
  onClear,
}: {
  results: TestResult[];
  stats?: TestStats;
  loading: boolean;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onClear: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 text-surface-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      {stats && stats.totalRuns > 0 && (
        <div className="flex-none px-6 py-3 border-b border-surface-800 bg-surface-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="text-surface-400">
                <span className="font-medium text-surface-200">{stats.totalRuns}</span> test runs
              </div>
              <div className="text-success-400">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                {stats.totalPassed} passed
              </div>
              {stats.totalFailed > 0 && (
                <div className="text-error-400">
                  <XCircle className="w-4 h-4 inline mr-1" />
                  {stats.totalFailed} failed
                </div>
              )}
              <div className={clsx(
                'font-medium',
                stats.successRate >= 80 ? 'text-success-400' :
                stats.successRate >= 50 ? 'text-warning-400' : 'text-error-400'
              )}>
                {stats.successRate.toFixed(1)}% success rate
              </div>
            </div>
            <button
              onClick={onClear}
              className="btn btn-ghost btn-sm text-surface-500 hover:text-error-400"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Results list */}
      {results.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FlaskConical className="w-12 h-12 text-surface-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-300">No test results yet</h3>
            <p className="text-surface-500 mt-1">
              Test results from npm test, jest, vitest will appear here
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <VirtualList
            items={results}
            itemHeight={expandedId ? 400 : 80}
            className="h-full"
            renderItem={(result) => (
              <TestResultItem
                key={result.id}
                result={result}
                expanded={expandedId === result.id}
                onExpand={() => onExpand(expandedId === result.id ? null : result.id)}
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Test Result Item
// ============================================================================

function TestResultItem({
  result,
  expanded,
  onExpand,
}: {
  result: TestResult;
  expanded: boolean;
  onExpand: () => void;
}) {
  const StatusIcon = result.status === 'passed' ? CheckCircle :
                     result.status === 'failed' ? XCircle : AlertCircle;

  const statusColor = result.status === 'passed' ? 'text-success-400' :
                      result.status === 'failed' ? 'text-error-400' : 'text-warning-400';

  return (
    <div className={clsx(
      'border-b border-surface-800 transition-colors',
      expanded ? 'bg-surface-900/50' : 'hover:bg-surface-800/30'
    )}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-3 cursor-pointer"
        onClick={onExpand}
      >
        <button className="text-surface-500">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>

        <div className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          result.status === 'passed' && 'bg-success-500/10',
          result.status === 'failed' && 'bg-error-500/10',
          result.status === 'unknown' && 'bg-warning-500/10'
        )}>
          <StatusIcon className={clsx('w-4 h-4', statusColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={clsx('font-medium', statusColor)}>
              {result.passedTests}/{result.totalTests} passed
            </span>
            {result.failedTests > 0 && (
              <span className="text-error-400">
                {result.failedTests} failed
              </span>
            )}
            {result.skippedTests > 0 && (
              <span className="text-surface-500">
                {result.skippedTests} skipped
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded text-xs bg-surface-700 text-surface-400 capitalize">
              {result.framework}
            </span>
          </div>
          <div className="text-xs text-surface-500 truncate mt-0.5 font-mono">
            {result.command}
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {result.coverage && (
            <CoverageBadge coverage={result.coverage} />
          )}
          <div className="flex items-center gap-1 text-surface-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{(result.durationMs / 1000).toFixed(2)}s</span>
          </div>
          <span className="text-xs text-surface-500">
            {formatRelativeTime(result.timestamp)}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-6 pb-4 space-y-4">
          {/* Failed tests */}
          {result.failedTestDetails.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-error-400 mb-2">
                Failed Tests ({result.failedTestDetails.length})
              </h4>
              <div className="space-y-2">
                {result.failedTestDetails.map((test, i) => (
                  <div
                    key={i}
                    className="bg-error-500/5 border border-error-500/20 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="w-4 h-4 text-error-400" />
                      <span className="font-medium text-surface-200">
                        {test.suite} &gt; {test.name}
                      </span>
                    </div>
                    {test.error && (
                      <pre className="text-xs text-error-300 mt-2 overflow-x-auto">
                        {test.error}
                      </pre>
                    )}
                    {test.file && (
                      <div className="text-xs text-surface-500 mt-1">
                        {test.file}{test.line ? `:${test.line}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coverage details */}
          {result.coverage && (
            <div>
              <h4 className="text-sm font-medium text-surface-300 mb-2">Coverage</h4>
              <div className="grid grid-cols-4 gap-4">
                <CoverageMetric label="Statements" value={result.coverage.statements} />
                <CoverageMetric label="Branches" value={result.coverage.branches} />
                <CoverageMetric label="Functions" value={result.coverage.functions} />
                <CoverageMetric label="Lines" value={result.coverage.lines} />
              </div>
            </div>
          )}

          {/* Raw output */}
          {result.rawOutput && (
            <div>
              <h4 className="text-sm font-medium text-surface-300 mb-2">Output</h4>
              <div className="bg-surface-950 rounded-lg border border-surface-700 overflow-hidden">
                <pre className="text-xs font-mono text-surface-400 p-3 max-h-48 overflow-auto">
                  {result.rawOutput.slice(0, 2000)}
                  {result.rawOutput.length > 2000 && '\n... (truncated)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Coverage Components
// ============================================================================

function CoverageBadge({ coverage }: { coverage: CoverageInfo }) {
  const avg = (coverage.statements + coverage.branches + coverage.functions + coverage.lines) / 4;
  const color = avg >= 80 ? 'bg-success-500/20 text-success-400' :
                avg >= 50 ? 'bg-warning-500/20 text-warning-400' :
                           'bg-error-500/20 text-error-400';

  return (
    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', color)}>
      {avg.toFixed(0)}% coverage
    </span>
  );
}

function CoverageMetric({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'text-success-400' :
                value >= 50 ? 'text-warning-400' : 'text-error-400';

  return (
    <div className="bg-surface-800/50 rounded-lg p-3">
      <div className={clsx('text-lg font-semibold', color)}>
        {value.toFixed(1)}%
      </div>
      <div className="text-xs text-surface-500">{label}</div>
      <div className="mt-2 h-1 bg-surface-700 rounded-full overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            value >= 80 ? 'bg-success-500' :
            value >= 50 ? 'bg-warning-500' : 'bg-error-500'
          )}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}
