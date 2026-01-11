// ============================================================================
// AGENTS VIEW - Sub-Agent Management Dashboard
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Square,
  RefreshCw,
  Eye,
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  FolderOpen,
} from 'lucide-react';
import { ConfirmModal } from '../overlays/ConfirmModal';

// ============================================================================
// TYPES
// ============================================================================

interface Agent {
  id: string;
  name: string;
  pid: number | null;
  cwd: string;
  parentId: string | null;
  templateId: string | null;
  status: AgentStatus;
  sessionPath: string | null;
  initialPrompt: string | null;
  spawnedAt: string;
  lastActivity: string;
  completedAt: string | null;
  exitCode: number | null;
  errorMessage: string | null;
}

type AgentStatus =
  | 'spawning'
  | 'ready'
  | 'active'
  | 'idle'
  | 'completed'
  | 'error'
  | 'terminated';

interface AgentTreeNode {
  agent: Agent;
  children: AgentTreeNode[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  spawning: {
    label: 'Spawning',
    color: 'text-yellow-400',
    icon: <Circle className="w-3 h-3 animate-pulse" />,
  },
  ready: {
    label: 'Ready',
    color: 'text-blue-400',
    icon: <Circle className="w-3 h-3" />,
  },
  active: {
    label: 'Active',
    color: 'text-green-400',
    icon: <Zap className="w-3 h-3" />,
  },
  idle: {
    label: 'Idle',
    color: 'text-surface-400',
    icon: <Clock className="w-3 h-3" />,
  },
  completed: {
    label: 'Completed',
    color: 'text-green-500',
    icon: <CheckCircle className="w-3 h-3" />,
  },
  error: {
    label: 'Error',
    color: 'text-red-400',
    icon: <XCircle className="w-3 h-3" />,
  },
  terminated: {
    label: 'Terminated',
    color: 'text-surface-500',
    icon: <Square className="w-3 h-3" />,
  },
};

// ============================================================================
// AGENT TREE NODE COMPONENT
// ============================================================================

interface AgentTreeNodeProps {
  node: AgentTreeNode;
  level: number;
  selectedId: string | null;
  onSelect: (agent: Agent) => void;
  expandedNodes: Set<string>;
  onToggleExpand: (id: string) => void;
}

function AgentTreeNodeComponent({
  node,
  level,
  selectedId,
  onSelect,
  expandedNodes,
  onToggleExpand,
}: AgentTreeNodeProps) {
  const { agent, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(agent.id);
  const isSelected = selectedId === agent.id;
  const statusConfig = STATUS_CONFIG[agent.status];

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
          isSelected
            ? 'bg-accent-purple/20 border border-accent-purple/30'
            : 'hover:bg-surface-800'
        }`}
        style={{ paddingLeft: `${level * 24 + 12}px` }}
        onClick={() => onSelect(agent)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(agent.id);
            }}
            className="text-surface-400 hover:text-surface-200"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}

        {!hasChildren && <div className="w-4" />}

        <div className={`flex items-center gap-1.5 ${statusConfig.color}`}>
          {statusConfig.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-surface-100 truncate">{agent.name}</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${statusConfig.color} bg-surface-700`}
            >
              {statusConfig.label}
            </span>
          </div>
          <div className="text-xs text-surface-500 truncate">{agent.cwd}</div>
        </div>

        <div className="text-xs text-surface-500 flex-shrink-0">
          {formatRelativeTime(agent.lastActivity)}
        </div>
      </div>

      {isExpanded &&
        children.map((child) => (
          <AgentTreeNodeComponent
            key={child.agent.id}
            node={child}
            level={level + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedNodes={expandedNodes}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </div>
  );
}

// ============================================================================
// AGENT DETAIL PANEL
// ============================================================================

interface AgentDetailProps {
  agent: Agent;
  onViewSession: () => void;
  onTerminate: () => void;
  onOpenFolder: () => void;
}

function AgentDetailPanel({ agent, onViewSession, onTerminate, onOpenFolder }: AgentDetailProps) {
  const statusConfig = STATUS_CONFIG[agent.status];
  const isActive = ['spawning', 'ready', 'active', 'idle'].includes(agent.status);

  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-surface-100">{agent.name}</h3>
            <span
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${statusConfig.color} bg-surface-800`}
            >
              {statusConfig.icon}
              {statusConfig.label}
            </span>
          </div>
          <p className="text-sm text-surface-500 mt-1">{agent.id}</p>
        </div>

        <div className="flex items-center gap-2">
          {agent.sessionPath && (
            <button
              onClick={onViewSession}
              className="p-2 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
              title="View Session"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onOpenFolder}
            className="p-2 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
            title="Open Folder"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          {isActive && (
            <button
              onClick={onTerminate}
              className="p-2 text-red-400 hover:bg-red-400/10 rounded transition-colors"
              title="Terminate"
            >
              <Square className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-surface-500">PID</span>
          <p className="text-surface-200 font-mono">{agent.pid || 'N/A'}</p>
        </div>
        <div>
          <span className="text-surface-500">Working Directory</span>
          <p className="text-surface-200 truncate">{agent.cwd}</p>
        </div>
        <div>
          <span className="text-surface-500">Spawned At</span>
          <p className="text-surface-200">{new Date(agent.spawnedAt).toLocaleString()}</p>
        </div>
        <div>
          <span className="text-surface-500">Last Activity</span>
          <p className="text-surface-200">{formatRelativeTime(agent.lastActivity)}</p>
        </div>
        {agent.templateId && (
          <div className="col-span-2">
            <span className="text-surface-500">Template</span>
            <p className="text-surface-200">{agent.templateId}</p>
          </div>
        )}
        {agent.parentId && (
          <div className="col-span-2">
            <span className="text-surface-500">Parent Agent</span>
            <p className="text-surface-200 font-mono">{agent.parentId}</p>
          </div>
        )}
        {agent.exitCode !== null && (
          <div>
            <span className="text-surface-500">Exit Code</span>
            <p className={`font-mono ${agent.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
              {agent.exitCode}
            </p>
          </div>
        )}
        {agent.completedAt && (
          <div>
            <span className="text-surface-500">Completed At</span>
            <p className="text-surface-200">{new Date(agent.completedAt).toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Initial Prompt */}
      {agent.initialPrompt && (
        <div className="mt-4 pt-4 border-t border-surface-700">
          <span className="text-sm text-surface-500">Initial Prompt</span>
          <p className="text-sm text-surface-300 mt-1 bg-surface-800 p-2 rounded font-mono">
            {agent.initialPrompt}
          </p>
        </div>
      )}

      {/* Error Message */}
      {agent.errorMessage && (
        <div className="mt-4 pt-4 border-t border-surface-700">
          <span className="text-sm text-red-400">Error</span>
          <p className="text-sm text-red-300 mt-1 bg-red-400/10 p-2 rounded">
            {agent.errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function buildAgentTree(agents: Agent[]): AgentTreeNode[] {
  const childMap = new Map<string | null, Agent[]>();

  // Group agents by parent
  for (const agent of agents) {
    const parentId = agent.parentId;
    if (!childMap.has(parentId)) {
      childMap.set(parentId, []);
    }
    childMap.get(parentId)!.push(agent);
  }

  // Build tree recursively
  function buildNode(agent: Agent): AgentTreeNode {
    const children = childMap.get(agent.id) || [];
    return {
      agent,
      children: children.map(buildNode),
    };
  }

  // Get root agents (no parent)
  const rootAgents = childMap.get(null) || [];
  return rootAgents.map(buildNode);
}

// ============================================================================
// MAIN AGENTS VIEW
// ============================================================================

export default function AgentsView() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [agentToTerminate, setAgentToTerminate] = useState<Agent | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[DEBUG] AgentsView: Calling getAgentRegistryEntries...');
      const result = await window.clausitron.getAgentRegistryEntries();
      console.log('[DEBUG] AgentsView: Received result:', result);
      console.log('[DEBUG] AgentsView: Result type:', typeof result, Array.isArray(result) ? `array length ${result.length}` : 'not array');

      // Map the registry entries to our Agent interface
      const mappedAgents: Agent[] = (result || []).map((entry: Record<string, unknown>) => ({
        id: entry.id as string,
        name: entry.name as string || 'Unnamed Agent',
        pid: entry.pid as number | null,
        cwd: entry.cwd as string || '',
        parentId: entry.parentId as string | null,
        templateId: entry.templateId as string | null,
        status: entry.status as AgentStatus || 'idle',
        sessionPath: entry.sessionPath as string | null,
        initialPrompt: entry.initialPrompt as string | null,
        spawnedAt: entry.spawnedAt as string || new Date().toISOString(),
        lastActivity: entry.lastActivity as string || new Date().toISOString(),
        completedAt: entry.completedAt as string | null,
        exitCode: entry.exitCode as number | null,
        errorMessage: entry.errorMessage as string | null,
      }));

      // Debug: Log hierarchy information
      console.log('[DEBUG] AgentsView: Mapped agents with hierarchy:', mappedAgents.map(a => ({
        id: a.id,
        name: a.name,
        parentId: a.parentId,
        hasParent: a.parentId !== null,
      })));

      const rootAgents = mappedAgents.filter(a => a.parentId === null);
      const childAgents = mappedAgents.filter(a => a.parentId !== null);
      console.log('[DEBUG] AgentsView: Root agents:', rootAgents.length, 'Child agents:', childAgents.length);
      setAgents(mappedAgents);
    } catch (error) {
      console.error('Failed to load agents:', error);
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadAgents, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadAgents]);

  // Listen for newly detected agents from terminal output
  useEffect(() => {
    const cleanup = window.clausitron.onAgentDetected?.((data: { id: string; name: string; description?: string; terminalId: number }) => {
      console.log('Agent detected:', data);
      // Immediately refresh the agent list
      loadAgents();
    });
    return () => cleanup?.();
  }, [loadAgents]);

  const filteredAgents = useMemo(() => {
    if (showInactive) return agents;
    return agents.filter((a) =>
      ['spawning', 'ready', 'active', 'idle'].includes(a.status)
    );
  }, [agents, showInactive]);

  const agentTree = useMemo(() => buildAgentTree(filteredAgents), [filteredAgents]);

  const handleToggleExpand = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleTerminateClick = useCallback(() => {
    if (selectedAgent) {
      setAgentToTerminate(selectedAgent);
      setConfirmModalOpen(true);
    }
  }, [selectedAgent]);

  const handleTerminateConfirm = useCallback(async () => {
    if (agentToTerminate) {
      try {
        // Mark as terminated (not idle) - this sets completedAt timestamp as well
        await window.clausitron.updateAgentRegistryEntry(agentToTerminate.id, { status: 'terminated' });
        loadAgents();
      } catch (error) {
        console.error('Failed to terminate agent:', error);
      }
    }
    setConfirmModalOpen(false);
    setAgentToTerminate(null);
  }, [agentToTerminate, loadAgents]);

  const handleTerminateCancel = useCallback(() => {
    setConfirmModalOpen(false);
    setAgentToTerminate(null);
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (selectedAgent?.cwd) {
      try {
        await window.clausitron.openInExplorer(selectedAgent.cwd);
      } catch (error) {
        console.error('Failed to open folder:', error);
      }
    }
  }, [selectedAgent]);

  const stats = useMemo(() => {
    // Calculate stats from filtered agents (what's actually being shown)
    const total = filteredAgents.length;
    const active = filteredAgents.filter((a) => a.status === 'active').length;
    const idle = filteredAgents.filter((a) => a.status === 'idle').length;
    const completed = filteredAgents.filter((a) => a.status === 'completed').length;
    const error = filteredAgents.filter((a) => a.status === 'error').length;
    // Also track total unfiltered for display when filtering is active
    const totalUnfiltered = agents.length;
    return { total, active, idle, completed, error, totalUnfiltered };
  }, [filteredAgents, agents]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-surface-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-accent-purple" />
            <div>
              <h1 className="text-xl font-semibold text-surface-100">Agents</h1>
              <p className="text-sm text-surface-400">Sub-agent lifecycle management</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded-lg transition-colors ${
                autoRefresh
                  ? 'text-green-400 bg-green-400/10'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700'
              }`}
              title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                showInactive
                  ? 'bg-surface-700 text-surface-200'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'
              }`}
            >
              {showInactive ? 'Showing All' : 'Active Only'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-surface-500">
              {!showInactive && stats.totalUnfiltered !== stats.total ? 'Shown:' : 'Total:'}
            </span>
            <span className="text-surface-200 font-medium">
              {stats.total}
              {!showInactive && stats.totalUnfiltered !== stats.total && (
                <span className="text-surface-500 font-normal"> of {stats.totalUnfiltered}</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-400">Active:</span>
            <span className="text-surface-200 font-medium">{stats.active}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-surface-400">Idle:</span>
            <span className="text-surface-200 font-medium">{stats.idle}</span>
          </div>
          {showInactive && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-green-500">Completed:</span>
                <span className="text-surface-200 font-medium">{stats.completed}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">Errors:</span>
                <span className="text-surface-200 font-medium">{stats.error}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Agent Tree */}
        <div className="w-1/2 border-r border-surface-800 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-purple" />
            </div>
          ) : agentTree.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-surface-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-surface-300">No active agents</h3>
              <p className="text-surface-500 mt-2">
                Agents will appear here when Claude spawns sub-agents
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {agentTree.map((node) => (
                <AgentTreeNodeComponent
                  key={node.agent.id}
                  node={node}
                  level={0}
                  selectedId={selectedAgent?.id || null}
                  onSelect={setSelectedAgent}
                  expandedNodes={expandedNodes}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
          )}
        </div>

        {/* Agent Detail */}
        <div className="w-1/2 overflow-y-auto p-4">
          {selectedAgent ? (
            <AgentDetailPanel
              agent={selectedAgent}
              onViewSession={() => {
                console.log('View session:', selectedAgent.sessionPath);
              }}
              onTerminate={handleTerminateClick}
              onOpenFolder={handleOpenFolder}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-surface-500">
              <p>Select an agent to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Terminate Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalOpen}
        title="Terminate Agent"
        message={`Are you sure you want to terminate agent "${agentToTerminate?.name}"? This action cannot be undone.`}
        confirmText="Terminate"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleTerminateConfirm}
        onCancel={handleTerminateCancel}
      />
    </div>
  );
}
