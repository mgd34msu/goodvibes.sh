// ============================================================================
// AGENT TREE VIEW - Agent hierarchy visualization
// ============================================================================

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

// Types matching the backend
interface AgentTreeNode {
  id: number;
  sessionId: string;
  agentName: string;
  parentId: number | null;
  parentSessionId: string | null;
  rootSessionId: string;
  depth: number;
  status: 'running' | 'completed' | 'failed' | 'terminated';
  startedAt: string;
  completedAt: string | null;
  allocatedBudgetUsd: number;
  spentBudgetUsd: number;
  toolCalls: number;
  tokensUsed: number;
  metadata: string | null;
}

interface TreeVisualizationNode {
  id: number;
  sessionId: string;
  agentName: string;
  depth: number;
  status: 'running' | 'completed' | 'failed' | 'terminated';
  duration: number;
  budgetAllocated: number;
  budgetSpent: number;
  budgetRemaining: number;
  toolCalls: number;
  children: TreeVisualizationNode[];
}

interface AgentMetrics {
  agentName: string;
  totalSessions: number;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  avgToolCalls: number;
  avgTokensUsed: number;
  avgCostUsd: number;
  successRate: number;
}

interface AgentHierarchySummary {
  rootSessionId: string;
  totalAgents: number;
  maxDepth: number;
  totalBudgetAllocated: number;
  totalBudgetSpent: number;
  runningAgents: number;
  completedAgents: number;
  failedAgents: number;
}

type TabType = 'tree' | 'metrics';

export default function AgentTreeView() {
  const [activeTab, setActiveTab] = useState<TabType>('tree');
  const [runningAgents, setRunningAgents] = useState<AgentTreeNode[]>([]);
  const [selectedRootSession, setSelectedRootSession] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<TreeVisualizationNode | null>(null);
  const [summary, setSummary] = useState<AgentHierarchySummary | null>(null);
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();

    // Subscribe to agent updates
    const unsubscribe = window.clausitron?.onAgentUpdate?.(() => {
      // Reload data when agents update
      loadData();
    });

    return () => {
      unsubscribe?.();
    };
  }, [selectedRootSession]);

  async function loadData() {
    setIsLoading(true);
    try {
      // Get active agents and their children to build the tree
      const activeAgents = await window.clausitron?.getActiveAgents?.();

      // Transform active agents to our tree node structure
      // NOTE: parentId in the database is a STRING (agent ID), not a number!
      const agents: AgentTreeNode[] = (activeAgents || []).map((a: Record<string, unknown>) => ({
        id: typeof a.id === 'string' ? parseInt(a.id, 10) || 0 : (typeof a.id === 'number' ? a.id : 0),
        sessionId: String(a.sessionPath ?? a.id ?? ''),
        agentName: String(a.name ?? 'Unknown'),
        // parentId can be a string (agent ID) - keep as-is for tree building
        parentId: a.parentId != null ? (typeof a.parentId === 'number' ? a.parentId : null) : null,
        // parentSessionId is the actual parent's ID (string) - use this for hierarchy!
        parentSessionId: a.parentId != null ? String(a.parentId) : null,
        rootSessionId: String(a.sessionPath ?? a.id ?? ''),
        depth: 0,
        status: (a.status as AgentTreeNode['status']) ?? 'running',
        startedAt: String(a.createdAt ?? a.spawnedAt ?? new Date().toISOString()),
        completedAt: null,
        allocatedBudgetUsd: 0,
        spentBudgetUsd: 0,
        toolCalls: 0,
        tokensUsed: 0,
        metadata: null,
      }));

      console.log('[DEBUG] AgentTreeView: Transformed agents:', agents.map(a => ({
        id: a.id,
        sessionId: a.sessionId,
        agentName: a.agentName,
        parentId: a.parentId,
        parentSessionId: a.parentSessionId,
      })));

      setRunningAgents(agents);
      setMetrics([]);

      // Find root agents (those with no parent)
      const rootAgents = agents.filter(a => a.parentSessionId === null);
      console.log('[DEBUG] AgentTreeView: Root agents (no parent):', rootAgents.map(a => ({
        id: a.id,
        sessionId: a.sessionId,
        agentName: a.agentName,
      })));

      // Auto-select first root session if none selected
      if (!selectedRootSession && rootAgents.length > 0 && rootAgents[0]) {
        setSelectedRootSession(rootAgents[0].sessionId);
      }

      // Build tree structure recursively
      if (selectedRootSession || rootAgents.length > 0) {
        const firstRoot = rootAgents[0];
        const rootSessionToUse = selectedRootSession || (rootAgents.length > 0 && firstRoot ? firstRoot.sessionId : null);

        if (rootSessionToUse) {
          // Find the root agent
          const root = agents.find(a => a.sessionId === rootSessionToUse);

          if (root) {
            // Recursive function to build tree
            function buildChildTree(parentSessionId: string, depth: number): TreeVisualizationNode[] {
              const children = agents.filter(a => a.parentSessionId === parentSessionId);
              return children.map(child => ({
                id: child.id,
                sessionId: child.sessionId,
                agentName: child.agentName,
                status: child.status,
                depth: depth,
                duration: 0,
                budgetAllocated: child.allocatedBudgetUsd,
                budgetSpent: child.spentBudgetUsd,
                budgetRemaining: child.allocatedBudgetUsd - child.spentBudgetUsd,
                toolCalls: child.toolCalls,
                children: buildChildTree(child.sessionId, depth + 1),
              }));
            }

            const treeChildren = buildChildTree(root.sessionId, 1);

            // Calculate max depth
            function getMaxDepth(nodes: TreeVisualizationNode[], currentMax: number): number {
              if (nodes.length === 0) return currentMax;
              return nodes.reduce((max, node) => {
                return Math.max(max, getMaxDepth(node.children, node.depth));
              }, currentMax);
            }
            const maxDepth = getMaxDepth(treeChildren, 0);

            setTreeData({
              id: root.id,
              sessionId: root.sessionId,
              agentName: root.agentName,
              status: root.status,
              depth: 0,
              duration: 0,
              budgetAllocated: root.allocatedBudgetUsd,
              budgetSpent: root.spentBudgetUsd,
              budgetRemaining: root.allocatedBudgetUsd - root.spentBudgetUsd,
              toolCalls: root.toolCalls,
              children: treeChildren,
            });

            // Count all agents in tree
            function countTreeAgents(nodes: TreeVisualizationNode[]): number {
              return nodes.reduce((sum, node) => sum + 1 + countTreeAgents(node.children), 0);
            }

            setSummary({
              rootSessionId: root.sessionId,
              totalAgents: 1 + countTreeAgents(treeChildren),
              maxDepth: maxDepth,
              totalBudgetAllocated: agents.reduce((sum, a) => sum + a.allocatedBudgetUsd, 0),
              totalBudgetSpent: agents.reduce((sum, a) => sum + a.spentBudgetUsd, 0),
              runningAgents: agents.filter(a => a.status === 'running').length,
              completedAgents: agents.filter(a => a.status === 'completed').length,
              failedAgents: agents.filter(a => a.status === 'failed').length,
            });

            console.log('[DEBUG] AgentTreeView: Built tree with', treeChildren.length, 'direct children, max depth', maxDepth);
          } else {
            console.log('[DEBUG] AgentTreeView: Root not found for session', rootSessionToUse);
            setTreeData(null);
            setSummary(null);
          }
        } else {
          setTreeData(null);
          setSummary(null);
        }
      } else {
        setTreeData(null);
        setSummary(null);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  function formatCurrency(value: number): string {
    return `$${value.toFixed(4)}`;
  }

  function _getStatusColor(status: AgentTreeNode['status']): string {
    switch (status) {
      case 'running': return 'text-blue-400';
      case 'completed': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'terminated': return 'text-yellow-400';
      default: return 'text-surface-400';
    }
  }
  void _getStatusColor; // Available for future use

  function getStatusBadge(status: AgentTreeNode['status']): { bg: string; text: string; label: string } {
    switch (status) {
      case 'running': return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Running' };
      case 'completed': return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Done' };
      case 'failed': return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' };
      case 'terminated': return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Terminated' };
      default: return { bg: 'bg-surface-700', text: 'text-surface-400', label: status };
    }
  }

  function toggleNode(sessionId: string) {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  // Get actual root agents (those with no parent)
  const rootSessions = runningAgents.filter(a => a.parentSessionId === null).map(a => a.sessionId);

  if (isLoading && !treeData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-400">Loading agent tree...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-surface-100">Agent Orchestration</h1>
          {runningAgents.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-400">Active root sessions:</span>
              <select
                value={selectedRootSession || ''}
                onChange={e => setSelectedRootSession(e.target.value || null)}
                className="input"
              >
                {rootSessions.map(sessionId => (
                  <option key={sessionId} value={sessionId}>
                    {sessionId.slice(0, 12)}...
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-surface-700">
          {(['tree', 'metrics'] as TabType[]).map(tab => (
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
              {tab === 'tree' && 'Agent Tree'}
              {tab === 'metrics' && 'Performance Metrics'}
            </button>
          ))}
        </div>

        {/* Tree Tab */}
        {activeTab === 'tree' && (
          <div className="space-y-4">
            {/* Summary Stats */}
            {summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="text-xs text-surface-500">Total Agents</div>
                  <div className="text-2xl font-bold text-surface-100">{summary.totalAgents}</div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-surface-500">Max Depth</div>
                  <div className="text-2xl font-bold text-surface-100">{summary.maxDepth}</div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-surface-500">Budget Used</div>
                  <div className="text-2xl font-bold text-surface-100">
                    {formatCurrency(summary.totalBudgetSpent)}
                  </div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-surface-500">Status</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-blue-400">{summary.runningAgents}R</span>
                    <span className="text-green-400">{summary.completedAgents}C</span>
                    <span className="text-red-400">{summary.failedAgents}F</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tree Visualization */}
            {!treeData && runningAgents.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-4xl mb-4">--&gt;</div>
                <div className="text-surface-400 mb-2">No active agent trees</div>
                <p className="text-sm text-surface-500">
                  Agent hierarchies will appear here when Claude spawns sub-agents.
                </p>
              </div>
            ) : treeData && (
              <div className="card p-4">
                <TreeNodeComponent
                  node={treeData}
                  expandedNodes={expandedNodes}
                  onToggle={toggleNode}
                  getStatusBadge={getStatusBadge}
                  formatDuration={formatDuration}
                  formatCurrency={formatCurrency}
                />
              </div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="space-y-4">
            {metrics.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-surface-400">No metrics data yet</div>
              </div>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-surface-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-surface-400 uppercase">Agent</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-surface-400 uppercase">Sessions</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-surface-400 uppercase">Success Rate</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-surface-400 uppercase">Avg Duration</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-surface-400 uppercase">Avg Tools</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-surface-400 uppercase">Avg Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-700">
                    {metrics.map(metric => (
                      <tr key={metric.agentName} className="hover:bg-surface-800/50">
                        <td className="px-4 py-3 font-medium text-surface-100">{metric.agentName}</td>
                        <td className="px-4 py-3 text-surface-300">{metric.totalSessions}</td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            'px-2 py-0.5 rounded text-xs',
                            metric.successRate >= 0.8 ? 'bg-green-500/20 text-green-400' :
                            metric.successRate >= 0.5 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          )}>
                            {(metric.successRate * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-surface-300">{formatDuration(metric.avgDurationMs)}</td>
                        <td className="px-4 py-3 text-surface-300">{metric.avgToolCalls.toFixed(1)}</td>
                        <td className="px-4 py-3 text-surface-300">{formatCurrency(metric.avgCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TREE NODE COMPONENT
// ============================================================================

function TreeNodeComponent({
  node,
  expandedNodes,
  onToggle,
  getStatusBadge,
  formatDuration,
  formatCurrency,
  depth = 0,
}: {
  node: TreeVisualizationNode;
  expandedNodes: Set<string>;
  onToggle: (sessionId: string) => void;
  getStatusBadge: (status: AgentTreeNode['status']) => { bg: string; text: string; label: string };
  formatDuration: (ms: number) => string;
  formatCurrency: (value: number) => string;
  depth?: number;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.sessionId) || depth === 0;
  const badge = getStatusBadge(node.status);

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-3 p-3 rounded-lg hover:bg-surface-800 cursor-pointer',
          depth > 0 && 'ml-6 border-l-2 border-surface-700'
        )}
        onClick={() => hasChildren && onToggle(node.sessionId)}
      >
        {/* Expand/Collapse */}
        <div className="w-6 flex items-center justify-center">
          {hasChildren && (
            <span className={clsx(
              'transform transition-transform',
              isExpanded && 'rotate-90'
            )}>
              &gt;
            </span>
          )}
        </div>

        {/* Agent Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-surface-100">{node.agentName}</span>
            <span className={clsx('px-2 py-0.5 rounded text-xs', badge.bg, badge.text)}>
              {badge.label}
            </span>
            {node.status === 'running' && (
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </div>
          <div className="text-xs text-surface-500 mt-1">
            Session: {node.sessionId.slice(0, 12)}...
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-surface-400">
          <div>
            <span className="text-surface-500">Duration:</span>{' '}
            <span className="text-surface-200">{formatDuration(node.duration)}</span>
          </div>
          <div>
            <span className="text-surface-500">Tools:</span>{' '}
            <span className="text-surface-200">{node.toolCalls}</span>
          </div>
          <div>
            <span className="text-surface-500">Cost:</span>{' '}
            <span className="text-surface-200">{formatCurrency(node.budgetSpent)}</span>
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {node.children.map(child => (
            <TreeNodeComponent
              key={child.sessionId}
              node={child}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              getStatusBadge={getStatusBadge}
              formatDuration={formatDuration}
              formatCurrency={formatCurrency}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
