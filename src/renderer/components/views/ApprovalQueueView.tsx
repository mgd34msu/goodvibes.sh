// ============================================================================
// APPROVAL QUEUE VIEW - Permission request management
// ============================================================================

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

// Types matching the backend
interface ApprovalQueueItem {
  id: number;
  sessionId: string;
  requestType: string;
  requestDetails: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  policyId: number | null;
  decidedAt: string | null;
  decidedBy: 'user' | 'policy' | null;
  createdAt: string;
}

interface ApprovalPolicy {
  id: number;
  name: string;
  matcher: string;
  action: 'auto-approve' | 'auto-deny' | 'queue';
  priority: number;
  conditions: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

type TabType = 'queue' | 'policies' | 'history';

export default function ApprovalQueueView() {
  const [activeTab, setActiveTab] = useState<TabType>('queue');
  const [pendingItems, setPendingItems] = useState<ApprovalQueueItem[]>([]);
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  useEffect(() => {
    loadData();

    // Subscribe to approval requests
    const unsubscribe = window.clausitron?.onApprovalRequired?.((data) => {
      // Add the new approval request to pending items
      const newItem: ApprovalQueueItem = {
        id: data.id,
        sessionId: data.sessionId,
        requestType: data.requestType,
        requestDetails: data.requestDetails,
        status: 'pending',
        policyId: null,
        decidedAt: null,
        decidedBy: null,
        createdAt: new Date().toISOString(),
      };
      setPendingItems(prev => [newItem, ...prev]);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [queueResult, policiesResult] = await Promise.all([
        window.clausitron?.getPendingApprovals?.(),
        window.clausitron?.getApprovalPolicies?.(),
      ]);
      setPendingItems(queueResult || []);
      setPolicies(policiesResult || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(id: number) {
    try {
      await window.clausitron?.updateApprovalStatus?.(id, 'approved', 'user');
      setPendingItems(prev => prev.filter(item => item.id !== id));
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error('Failed to approve item:', error);
    }
  }

  async function handleDeny(id: number) {
    try {
      await window.clausitron?.updateApprovalStatus?.(id, 'denied', 'user');
      setPendingItems(prev => prev.filter(item => item.id !== id));
      setSelectedItems(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error('Failed to deny item:', error);
    }
  }

  async function handleBatchApprove() {
    const ids = Array.from(selectedItems);
    try {
      // Approve each item individually since there's no batch API
      await Promise.all(ids.map(id => window.clausitron?.updateApprovalStatus?.(id, 'approved', 'user')));
      setPendingItems(prev => prev.filter(item => !selectedItems.has(item.id)));
      setSelectedItems(new Set());
    } catch (error) {
      console.error('Failed to batch approve:', error);
    }
  }

  async function handleBatchDeny() {
    const ids = Array.from(selectedItems);
    try {
      // Deny each item individually since there's no batch API
      await Promise.all(ids.map(id => window.clausitron?.updateApprovalStatus?.(id, 'denied', 'user')));
      setPendingItems(prev => prev.filter(item => !selectedItems.has(item.id)));
      setSelectedItems(new Set());
    } catch (error) {
      console.error('Failed to batch deny:', error);
    }
  }

  function toggleSelection(id: number) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    if (selectedItems.size === pendingItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(pendingItems.map(item => item.id)));
    }
  }

  function parseRequestDetails(details: string): Record<string, any> {
    try {
      return JSON.parse(details);
    } catch {
      return { raw: details };
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-surface-100">Approval Queue</h1>
          {activeTab === 'policies' && (
            <button
              onClick={() => setShowPolicyModal(true)}
              className="btn btn-primary"
            >
              Create Policy
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-surface-700">
          {(['queue', 'policies', 'history'] as TabType[]).map(tab => (
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
              {tab === 'queue' && `Pending (${pendingItems.length})`}
              {tab === 'policies' && `Policies (${policies.length})`}
              {tab === 'history' && 'History'}
            </button>
          ))}
        </div>

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            {/* Batch Actions */}
            {selectedItems.size > 0 && (
              <div className="flex items-center gap-4 p-4 bg-surface-800 rounded-lg">
                <span className="text-sm text-surface-300">
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2 ml-auto">
                  <button onClick={handleBatchApprove} className="btn btn-primary btn-sm">
                    Approve All
                  </button>
                  <button onClick={handleBatchDeny} className="btn btn-danger btn-sm">
                    Deny All
                  </button>
                </div>
              </div>
            )}

            {/* Queue Items */}
            {pendingItems.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-4xl mb-4">---</div>
                <div className="text-surface-400 mb-2">No pending approvals</div>
                <p className="text-sm text-surface-500">
                  Permission requests that require manual approval will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Select All Header */}
                <div className="flex items-center gap-3 px-4 py-2 text-xs text-surface-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === pendingItems.length}
                    onChange={selectAll}
                    className="checkbox"
                  />
                  <span className="flex-1">Request</span>
                  <span className="w-32">Session</span>
                  <span className="w-32">Time</span>
                  <span className="w-40">Actions</span>
                </div>

                {pendingItems.map(item => {
                  const details = parseRequestDetails(item.requestDetails);
                  return (
                    <div
                      key={item.id}
                      className={clsx(
                        'card p-4 flex items-center gap-3',
                        selectedItems.has(item.id) && 'ring-2 ring-primary-500'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedItems.has(item.id)}
                        onChange={() => toggleSelection(item.id)}
                        className="checkbox"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-surface-700 rounded text-xs font-mono">
                            {item.requestType}
                          </span>
                          {details.toolName && (
                            <span className="text-sm text-surface-200">{details.toolName}</span>
                          )}
                        </div>
                        <div className="text-xs text-surface-400 mt-1 truncate">
                          {details.filePath && `File: ${details.filePath}`}
                          {details.command && `Command: ${details.command}`}
                          {!details.filePath && !details.command && JSON.stringify(details)}
                        </div>
                      </div>
                      <div className="w-32 text-xs text-surface-400 font-mono truncate">
                        {item.sessionId.slice(0, 12)}...
                      </div>
                      <div className="w-32 text-xs text-surface-400">
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </div>
                      <div className="w-40 flex gap-2">
                        <button
                          onClick={() => handleApprove(item.id)}
                          className="btn btn-primary btn-sm flex-1"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleDeny(item.id)}
                          className="btn btn-danger btn-sm flex-1"
                        >
                          Deny
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Policies Tab */}
        {activeTab === 'policies' && (
          <div className="space-y-4">
            {policies.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="text-4xl mb-4">***</div>
                <div className="text-surface-400 mb-2">No policies configured</div>
                <p className="text-sm text-surface-500 mb-4">
                  Policies automatically handle permission requests based on rules you define.
                </p>
                <button
                  onClick={() => setShowPolicyModal(true)}
                  className="btn btn-primary"
                >
                  Create Your First Policy
                </button>
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">
                {policies.map(policy => (
                  <PolicyCard
                    key={policy.id}
                    policy={policy}
                    onUpdate={loadData}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="card p-12 text-center">
            <div className="text-surface-400">
              Approval history coming soon...
            </div>
          </div>
        )}
      </div>

      {/* Create Policy Modal */}
      {showPolicyModal && (
        <CreatePolicyModal
          onClose={() => setShowPolicyModal(false)}
          onCreate={loadData}
        />
      )}
    </div>
  );
}

// ============================================================================
// POLICY CARD
// ============================================================================

function PolicyCard({ policy, onUpdate }: { policy: ApprovalPolicy; onUpdate: () => void }) {
  const actionColors = {
    'auto-approve': 'bg-green-500/20 text-green-400',
    'auto-deny': 'bg-red-500/20 text-red-400',
    'queue': 'bg-yellow-500/20 text-yellow-400',
  };

  async function handleToggle() {
    try {
      await window.clausitron?.updateApprovalPolicy?.(policy.id, {
        enabled: !policy.enabled,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to toggle policy:', error);
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this policy?')) return;
    try {
      await window.clausitron?.deleteApprovalPolicy?.(policy.id);
      onUpdate();
    } catch (error) {
      console.error('Failed to delete policy:', error);
    }
  }

  return (
    <div className={clsx(
      'card p-4',
      !policy.enabled && 'opacity-60'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-surface-100">{policy.name}</h3>
          <div className="text-xs text-surface-500 mt-1">Priority: {policy.priority}</div>
        </div>
        <span className={clsx(
          'px-2 py-1 rounded text-xs font-medium',
          actionColors[policy.action]
        )}>
          {policy.action.replace('-', ' ')}
        </span>
      </div>

      <div className="text-sm font-mono text-surface-300 bg-surface-800 p-2 rounded mb-3">
        {policy.matcher}
      </div>

      {policy.conditions && (
        <div className="text-xs text-surface-400 mb-3">
          {policy.conditions}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-surface-700">
        <button
          onClick={handleToggle}
          className={clsx(
            'btn btn-sm flex-1',
            policy.enabled ? 'btn-secondary' : 'btn-primary'
          )}
        >
          {policy.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          onClick={handleDelete}
          className="btn btn-sm btn-danger"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CREATE POLICY MODAL
// ============================================================================

function CreatePolicyModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: () => void;
}) {
  const [name, setName] = useState('');
  const [matcher, setMatcher] = useState('*');
  const [action, setAction] = useState<'auto-approve' | 'auto-deny' | 'queue'>('queue');
  const [priority, setPriority] = useState('0');

  async function handleCreate() {
    try {
      await window.clausitron?.createApprovalPolicy?.({
        name,
        matcher,
        action,
        priority: parseInt(priority),
        enabled: true,
      });
      onCreate();
      onClose();
    } catch (error) {
      console.error('Failed to create policy:', error);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="card p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-surface-100 mb-4">Create Policy</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-surface-300 mb-1">Policy Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input w-full"
              placeholder="e.g., Allow Read Operations"
            />
          </div>

          <div>
            <label className="block text-sm text-surface-300 mb-1">Matcher Pattern</label>
            <input
              type="text"
              value={matcher}
              onChange={e => setMatcher(e.target.value)}
              className="input w-full font-mono"
              placeholder="e.g., Read, Edit(src/*), Bash(npm *)"
            />
            <p className="text-xs text-surface-500 mt-1">
              Use tool names, file:pattern, or wildcards (*)
            </p>
          </div>

          <div>
            <label className="block text-sm text-surface-300 mb-1">Action</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value as any)}
              className="input w-full"
            >
              <option value="auto-approve">Auto Approve</option>
              <option value="auto-deny">Auto Deny</option>
              <option value="queue">Queue for Review</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-surface-300 mb-1">Priority</label>
            <input
              type="number"
              value={priority}
              onChange={e => setPriority(e.target.value)}
              className="input w-full"
              placeholder="Higher = checked first"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleCreate} className="btn btn-primary flex-1" disabled={!name || !matcher}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
