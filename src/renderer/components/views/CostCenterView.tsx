// ============================================================================
// COST CENTER VIEW - Budget management and cost tracking
// ============================================================================

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

// Types matching the backend
interface BudgetRecord {
  id: number;
  projectPath: string | null;
  sessionId: string | null;
  limitUsd: number;
  spentUsd: number;
  warningThreshold: number;
  hardStopEnabled: boolean;
  resetPeriod: 'session' | 'daily' | 'weekly' | 'monthly';
  lastReset: string;
  createdAt: string;
  updatedAt: string;
}

interface BudgetAlert {
  budgetId: number;
  type: 'warning' | 'limit_reached' | 'over_budget';
  percentUsed: number;
  spentUsd: number;
  limitUsd: number;
  projectPath: string | null;
  sessionId: string | null;
  timestamp: string;
}

export default function CostCenterView() {
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadBudgets();

    // Listen for budget warnings from hooks
    const unsubscribe = window.clausitron?.onBudgetWarning?.((data) => {
      const alert: BudgetAlert = {
        budgetId: data.id,
        type: data.percentage >= 100 ? 'limit_reached' : 'warning',
        percentUsed: data.percentage,
        spentUsd: data.spentUsd,
        limitUsd: data.limitUsd,
        projectPath: data.projectPath ?? null,
        sessionId: null,
        timestamp: new Date().toISOString(),
      };
      setAlerts(prev => [alert, ...prev].slice(0, 50));
      // Reload budgets to reflect changes
      loadBudgets();
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  async function loadBudgets() {
    setIsLoading(true);
    try {
      const result = await window.clausitron?.getBudgets?.();
      setBudgets(result || []);
    } catch (error) {
      console.error('Failed to load budgets:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function formatCurrency(value: number): string {
    return `$${value.toFixed(2)}`;
  }

  function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
  }

  function _getStatusColor(budget: BudgetRecord): string {
    const percent = (budget.spentUsd / budget.limitUsd) * 100;
    if (percent >= 100) return 'bg-red-500';
    if (percent >= budget.warningThreshold * 100) return 'bg-yellow-500';
    return 'bg-green-500';
  }
  void _getStatusColor; // Available for future use

  function getAlertIcon(type: BudgetAlert['type']): string {
    switch (type) {
      case 'warning': return '!';
      case 'limit_reached': return 'X';
      case 'over_budget': return '!!';
      default: return '?';
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-surface-400">Loading budgets...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-surface-100">Cost Center</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Budget
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            title="Total Budgets"
            value={budgets.length.toString()}
            subtitle="Active budgets"
          />
          <StatCard
            title="Total Allocated"
            value={formatCurrency(budgets.reduce((sum, b) => sum + b.limitUsd, 0))}
            subtitle="Across all budgets"
          />
          <StatCard
            title="Total Spent"
            value={formatCurrency(budgets.reduce((sum, b) => sum + b.spentUsd, 0))}
            subtitle="Across all budgets"
          />
        </div>

        {/* Budget Cards */}
        <div className="grid lg:grid-cols-2 gap-4">
          {budgets.length === 0 ? (
            <div className="col-span-2 card p-12 text-center">
              <div className="text-surface-400 mb-4">No budgets configured</div>
              <p className="text-sm text-surface-500 mb-4">
                Create a budget to track and control Claude API costs per project or session.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary"
              >
                Create Your First Budget
              </button>
            </div>
          ) : (
            budgets.map(budget => (
              <BudgetCard
                key={budget.id}
                budget={budget}
                onUpdate={loadBudgets}
              />
            ))
          )}
        </div>

        {/* Recent Alerts */}
        {alerts.length > 0 && (
          <div className="card p-6">
            <h2 className="text-sm font-medium text-surface-100 mb-4">Recent Alerts</h2>
            <div className="space-y-2 max-h-64 overflow-auto">
              {alerts.map((alert, idx) => (
                <div
                  key={`${alert.budgetId}-${alert.timestamp}-${idx}`}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-lg',
                    alert.type === 'warning' && 'bg-yellow-500/10 border border-yellow-500/30',
                    alert.type === 'limit_reached' && 'bg-red-500/10 border border-red-500/30',
                    alert.type === 'over_budget' && 'bg-red-500/20 border border-red-500/50'
                  )}
                >
                  <span className={clsx(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold',
                    alert.type === 'warning' && 'bg-yellow-500 text-black',
                    (alert.type === 'limit_reached' || alert.type === 'over_budget') && 'bg-red-500 text-white'
                  )}>
                    {getAlertIcon(alert.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-surface-200">
                      {alert.type === 'warning' && `Budget at ${formatPercent(alert.percentUsed)} capacity`}
                      {alert.type === 'limit_reached' && 'Budget limit reached'}
                      {alert.type === 'over_budget' && 'Over budget!'}
                    </div>
                    <div className="text-xs text-surface-400">
                      {formatCurrency(alert.spentUsd)} of {formatCurrency(alert.limitUsd)}
                      {alert.projectPath && ` - ${alert.projectPath.split(/[/\\]/).pop()}`}
                    </div>
                  </div>
                  <div className="text-xs text-surface-500">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Budget Modal */}
      {showCreateModal && (
        <CreateBudgetModal
          onClose={() => setShowCreateModal(false)}
          onCreate={loadBudgets}
        />
      )}
    </div>
  );
}

// ============================================================================
// STAT CARD
// ============================================================================

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-surface-500 uppercase tracking-wider">{title}</div>
      <div className="text-2xl font-bold text-surface-100 mt-1">{value}</div>
      <div className="text-xs text-surface-400 mt-1">{subtitle}</div>
    </div>
  );
}

// ============================================================================
// BUDGET CARD
// ============================================================================

function BudgetCard({ budget, onUpdate }: { budget: BudgetRecord; onUpdate: () => void }) {
  const percentUsed = (budget.spentUsd / budget.limitUsd) * 100;
  const remaining = budget.limitUsd - budget.spentUsd;

  const statusColor = percentUsed >= 100 ? 'red' : percentUsed >= budget.warningThreshold * 100 ? 'yellow' : 'green';

  async function handleReset() {
    try {
      // Reset by upserting with zero spent
      await window.clausitron?.upsertBudget?.({
        projectPath: budget.projectPath ?? undefined,
        sessionId: budget.sessionId ?? undefined,
        limitUsd: budget.limitUsd,
        spentUsd: 0,
        warningThreshold: budget.warningThreshold,
        hardStopEnabled: budget.hardStopEnabled,
        resetPeriod: budget.resetPeriod,
        lastReset: new Date().toISOString(),
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to reset budget:', error);
    }
  }

  async function handleToggleHardStop() {
    try {
      // Update by upserting with toggled hard stop
      await window.clausitron?.upsertBudget?.({
        projectPath: budget.projectPath ?? undefined,
        sessionId: budget.sessionId ?? undefined,
        limitUsd: budget.limitUsd,
        spentUsd: budget.spentUsd,
        warningThreshold: budget.warningThreshold,
        hardStopEnabled: !budget.hardStopEnabled,
        resetPeriod: budget.resetPeriod,
        lastReset: budget.lastReset,
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to toggle hard stop:', error);
    }
  }

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-medium text-surface-100">
            {budget.projectPath
              ? budget.projectPath.split(/[/\\]/).pop()
              : budget.sessionId
                ? `Session ${budget.sessionId.slice(0, 8)}`
                : 'Global Budget'}
          </h3>
          <div className="text-xs text-surface-500 mt-1">
            {budget.resetPeriod.charAt(0).toUpperCase() + budget.resetPeriod.slice(1)} budget
          </div>
        </div>
        <div className={clsx(
          'px-2 py-1 rounded text-xs font-medium',
          statusColor === 'green' && 'bg-green-500/20 text-green-400',
          statusColor === 'yellow' && 'bg-yellow-500/20 text-yellow-400',
          statusColor === 'red' && 'bg-red-500/20 text-red-400'
        )}>
          {percentUsed.toFixed(0)}% used
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full transition-all duration-300',
              statusColor === 'green' && 'bg-green-500',
              statusColor === 'yellow' && 'bg-yellow-500',
              statusColor === 'red' && 'bg-red-500'
            )}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-surface-400">
          <span>Spent: ${budget.spentUsd.toFixed(2)}</span>
          <span>Limit: ${budget.limitUsd.toFixed(2)}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-surface-500">Remaining</div>
          <div className={clsx(
            'text-lg font-semibold',
            remaining <= 0 ? 'text-red-400' : 'text-surface-100'
          )}>
            ${remaining.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-surface-500">Warning at</div>
          <div className="text-lg font-semibold text-surface-100">
            {(budget.warningThreshold * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Hard Stop Toggle */}
      <div className="flex items-center justify-between py-3 border-t border-surface-700">
        <div>
          <div className="text-sm text-surface-200">Hard Stop</div>
          <div className="text-xs text-surface-500">Block operations when limit reached</div>
        </div>
        <button
          onClick={handleToggleHardStop}
          className={clsx(
            'w-12 h-6 rounded-full transition-colors relative',
            budget.hardStopEnabled ? 'bg-red-500' : 'bg-surface-600'
          )}
        >
          <div className={clsx(
            'w-5 h-5 rounded-full bg-white shadow-md transition-transform absolute top-0.5',
            budget.hardStopEnabled ? 'translate-x-6' : 'translate-x-0.5'
          )} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleReset}
          className="btn btn-secondary flex-1"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// CREATE BUDGET MODAL
// ============================================================================

function CreateBudgetModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: () => void;
}) {
  const [limit, setLimit] = useState('10.00');
  const [warningThreshold, setWarningThreshold] = useState('80');
  const [resetPeriod, setResetPeriod] = useState<'session' | 'daily' | 'weekly' | 'monthly'>('daily');
  const [hardStop, setHardStop] = useState(false);
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [projectPath, setProjectPath] = useState('');

  async function handleCreate() {
    try {
      await window.clausitron?.upsertBudget?.({
        limitUsd: parseFloat(limit),
        spentUsd: 0,
        warningThreshold: parseInt(warningThreshold) / 100,
        resetPeriod,
        hardStopEnabled: hardStop,
        projectPath: scope === 'project' ? projectPath : undefined,
        lastReset: new Date().toISOString(),
      });
      onCreate();
      onClose();
    } catch (error) {
      console.error('Failed to create budget:', error);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="card p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-surface-100 mb-4">Create Budget</h2>

        <div className="space-y-4">
          {/* Limit */}
          <div>
            <label className="block text-sm text-surface-300 mb-1">Budget Limit (USD)</label>
            <input
              type="number"
              value={limit}
              onChange={e => setLimit(e.target.value)}
              className="input w-full"
              step="0.01"
              min="0"
            />
          </div>

          {/* Warning Threshold */}
          <div>
            <label className="block text-sm text-surface-300 mb-1">Warning Threshold (%)</label>
            <input
              type="number"
              value={warningThreshold}
              onChange={e => setWarningThreshold(e.target.value)}
              className="input w-full"
              min="0"
              max="100"
            />
          </div>

          {/* Reset Period */}
          <div>
            <label className="block text-sm text-surface-300 mb-1">Reset Period</label>
            <select
              value={resetPeriod}
              onChange={e => setResetPeriod(e.target.value as any)}
              className="input w-full"
            >
              <option value="session">Per Session</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Hard Stop */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hardStop"
              checked={hardStop}
              onChange={e => setHardStop(e.target.checked)}
              className="checkbox"
            />
            <label htmlFor="hardStop" className="text-sm text-surface-300">
              Enable hard stop (block operations when limit reached)
            </label>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm text-surface-300 mb-1">Scope</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as 'global' | 'project')}
              className="input w-full"
            >
              <option value="global">Global (all projects)</option>
              <option value="project">Specific Project</option>
            </select>
          </div>

          {scope === 'project' && (
            <div>
              <label className="block text-sm text-surface-300 mb-1">Project Path</label>
              <input
                type="text"
                value={projectPath}
                onChange={e => setProjectPath(e.target.value)}
                className="input w-full"
                placeholder="/path/to/project"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn btn-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleCreate} className="btn btn-primary flex-1">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
