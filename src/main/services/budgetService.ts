// ============================================================================
// BUDGET SERVICE - Cost tracking and budget enforcement
// ============================================================================
//
// This service manages budget tracking, cost estimation, and enforcement.
// It integrates with hooks to check budgets before tool execution and
// track costs after tool completion.
//
// ============================================================================

import { EventEmitter } from 'events';
import { Logger } from './logger.js';
import { getMainWindow } from '../window.js';
import {
  upsertBudget,
  getBudget,
  getBudgetForScope,
  updateBudgetSpent,
  getAllBudgets,
  type BudgetRecord,
} from '../database/hookEvents.js';

const logger = new Logger('BudgetService');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Cost estimation for a tool operation
 */
export interface CostEstimate {
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  model: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Cost breakdown by category
 */
export interface CostBreakdown {
  byTool: Record<string, number>;
  bySession: Record<string, number>;
  byAgent: Record<string, number>;
  total: number;
}

/**
 * Budget alert
 */
export interface BudgetAlert {
  budgetId: number;
  type: 'warning' | 'limit_reached' | 'over_budget';
  percentUsed: number;
  spentUsd: number;
  limitUsd: number;
  projectPath: string | null;
  sessionId: string | null;
  timestamp: string;
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  allowed: boolean;
  budgetId: number | null;
  remainingUsd: number;
  estimatedCostUsd: number;
  warningMessage?: string;
  blockMessage?: string;
}

/**
 * Cost rates per 1K tokens by model
 */
const COST_RATES: Record<string, { input: number; output: number }> = {
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku': { input: 0.001, output: 0.005 },
  'default': { input: 0.003, output: 0.015 }, // Default to Sonnet pricing
};

/**
 * Estimated token counts by tool type (for pre-execution estimation)
 */
const TOOL_TOKEN_ESTIMATES: Record<string, { inputTokens: number; outputTokens: number }> = {
  'Read': { inputTokens: 100, outputTokens: 2000 },
  'Write': { inputTokens: 2000, outputTokens: 100 },
  'Edit': { inputTokens: 1000, outputTokens: 500 },
  'Bash': { inputTokens: 200, outputTokens: 1000 },
  'Glob': { inputTokens: 50, outputTokens: 500 },
  'Grep': { inputTokens: 100, outputTokens: 1000 },
  'LSP': { inputTokens: 100, outputTokens: 500 },
  'WebFetch': { inputTokens: 100, outputTokens: 3000 },
  'WebSearch': { inputTokens: 100, outputTokens: 2000 },
  'Task': { inputTokens: 500, outputTokens: 2000 },
  'TodoWrite': { inputTokens: 200, outputTokens: 100 },
  'NotebookEdit': { inputTokens: 500, outputTokens: 500 },
  'default': { inputTokens: 500, outputTokens: 1000 },
};

// ============================================================================
// BUDGET SERVICE
// ============================================================================

class BudgetServiceClass extends EventEmitter {
  private costHistory: Map<string, number[]> = new Map(); // sessionId -> cost array

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // ============================================================================
  // COST ESTIMATION
  // ============================================================================

  /**
   * Estimate the cost of a tool operation before execution
   */
  estimateCost(
    toolName: string,
    toolInput: Record<string, unknown>,
    model: string = 'default'
  ): CostEstimate {
    // Get base token estimates for this tool
    const baseEstimate = TOOL_TOKEN_ESTIMATES[toolName] || TOOL_TOKEN_ESTIMATES['default'];

    // Adjust based on input size
    let inputTokens = baseEstimate.inputTokens;
    let outputTokens = baseEstimate.outputTokens;
    let confidence: 'high' | 'medium' | 'low' = 'medium';

    // Adjust estimates based on specific tool inputs
    if (toolName === 'Write' && toolInput.content) {
      const content = toolInput.content as string;
      inputTokens = Math.ceil(content.length / 4); // Rough estimate: 4 chars per token
      confidence = 'high';
    } else if (toolName === 'Read') {
      // Reading files usually returns more tokens based on file size
      outputTokens = baseEstimate.outputTokens * 2;
      confidence = 'low';
    } else if (toolName === 'Bash') {
      const command = toolInput.command as string;
      if (command?.includes('npm') || command?.includes('yarn') || command?.includes('pnpm')) {
        outputTokens = 3000; // Package managers produce lots of output
      }
      confidence = 'low';
    } else if (toolName === 'Grep') {
      outputTokens = baseEstimate.outputTokens * 2;
      confidence = 'low';
    } else if (toolName === 'Task') {
      // Task tool spawns sub-agents, much higher cost
      inputTokens = 2000;
      outputTokens = 5000;
      confidence = 'low';
    }

    // Calculate cost
    const rates = COST_RATES[model] || COST_RATES['default'];
    const estimatedCostUsd = (
      (inputTokens / 1000) * rates.input +
      (outputTokens / 1000) * rates.output
    );

    return {
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000, // Round to 4 decimal places
      inputTokens,
      outputTokens,
      model: model === 'default' ? 'claude-3-5-sonnet' : model,
      confidence,
    };
  }

  /**
   * Calculate actual cost from tool response
   */
  calculateActualCost(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: { success: boolean; content: string },
    model: string = 'default'
  ): number {
    // Estimate input tokens from tool input
    const inputStr = JSON.stringify(toolInput);
    const inputTokens = Math.ceil(inputStr.length / 4);

    // Estimate output tokens from response
    const outputTokens = Math.ceil(toolResponse.content.length / 4);

    // Calculate cost
    const rates = COST_RATES[model] || COST_RATES['default'];
    const costUsd = (
      (inputTokens / 1000) * rates.input +
      (outputTokens / 1000) * rates.output
    );

    return Math.round(costUsd * 10000) / 10000;
  }

  // ============================================================================
  // BUDGET CHECKING
  // ============================================================================

  /**
   * Check if an operation is allowed within budget constraints
   */
  checkBudget(
    projectPath?: string,
    sessionId?: string,
    estimatedCostUsd?: number
  ): BudgetCheckResult {
    const budget = getBudgetForScope(projectPath, sessionId);

    if (!budget) {
      // No budget set, allow all operations
      return {
        allowed: true,
        budgetId: null,
        remainingUsd: Infinity,
        estimatedCostUsd: estimatedCostUsd || 0,
      };
    }

    const remainingUsd = budget.limitUsd - budget.spentUsd;
    const percentUsed = (budget.spentUsd / budget.limitUsd) * 100;
    const cost = estimatedCostUsd || 0;

    // Check if over budget
    if (budget.spentUsd >= budget.limitUsd) {
      if (budget.hardStopEnabled) {
        return {
          allowed: false,
          budgetId: budget.id,
          remainingUsd: 0,
          estimatedCostUsd: cost,
          blockMessage: `Budget limit of $${budget.limitUsd.toFixed(2)} reached. Spent: $${budget.spentUsd.toFixed(2)}`,
        };
      }
    }

    // Check if this operation would exceed budget
    if (budget.hardStopEnabled && (budget.spentUsd + cost) > budget.limitUsd) {
      return {
        allowed: false,
        budgetId: budget.id,
        remainingUsd,
        estimatedCostUsd: cost,
        blockMessage: `This operation (estimated $${cost.toFixed(4)}) would exceed budget limit of $${budget.limitUsd.toFixed(2)}. Remaining: $${remainingUsd.toFixed(2)}`,
      };
    }

    // Check for warning threshold
    let warningMessage: string | undefined;
    if (percentUsed >= budget.warningThreshold * 100) {
      warningMessage = `Budget warning: ${percentUsed.toFixed(1)}% used ($${budget.spentUsd.toFixed(2)} of $${budget.limitUsd.toFixed(2)})`;
    }

    return {
      allowed: true,
      budgetId: budget.id,
      remainingUsd,
      estimatedCostUsd: cost,
      warningMessage,
    };
  }

  // ============================================================================
  // BUDGET MANAGEMENT
  // ============================================================================

  /**
   * Create or update a budget
   */
  setBudget(
    limitUsd: number,
    options: {
      projectPath?: string;
      sessionId?: string;
      warningThreshold?: number;
      hardStopEnabled?: boolean;
      resetPeriod?: 'session' | 'daily' | 'weekly' | 'monthly';
    } = {}
  ): BudgetRecord {
    const budget = upsertBudget({
      projectPath: options.projectPath || null,
      sessionId: options.sessionId || null,
      limitUsd,
      spentUsd: 0,
      warningThreshold: options.warningThreshold ?? 0.8,
      hardStopEnabled: options.hardStopEnabled ?? false,
      resetPeriod: options.resetPeriod ?? 'session',
      lastReset: new Date().toISOString(),
    });

    this.emit('budget:created', budget);
    this.notifyRenderer('budget:updated', budget);

    return budget;
  }

  /**
   * Record cost and update budget
   */
  recordCost(
    costUsd: number,
    projectPath?: string,
    sessionId?: string
  ): void {
    const budget = getBudgetForScope(projectPath, sessionId);

    if (budget) {
      updateBudgetSpent(budget.id, costUsd);

      // Track cost history for projections
      if (sessionId) {
        const history = this.costHistory.get(sessionId) || [];
        history.push(costUsd);
        this.costHistory.set(sessionId, history);
      }

      // Check for alerts
      const updated = getBudget(budget.id);
      if (updated) {
        this.checkAndEmitAlerts(updated);
      }
    }
  }

  /**
   * Check budget status and emit alerts if needed
   */
  private checkAndEmitAlerts(budget: BudgetRecord): void {
    const percentUsed = (budget.spentUsd / budget.limitUsd) * 100;

    let alertType: BudgetAlert['type'] | null = null;

    if (budget.spentUsd >= budget.limitUsd) {
      alertType = 'limit_reached';
    } else if (percentUsed >= budget.warningThreshold * 100) {
      alertType = 'warning';
    }

    if (alertType) {
      const alert: BudgetAlert = {
        budgetId: budget.id,
        type: alertType,
        percentUsed,
        spentUsd: budget.spentUsd,
        limitUsd: budget.limitUsd,
        projectPath: budget.projectPath,
        sessionId: budget.sessionId,
        timestamp: new Date().toISOString(),
      };

      this.emit('budget:alert', alert);
      this.notifyRenderer('budget:alert', alert);
    }
  }

  /**
   * Get budget for a scope
   */
  getBudget(projectPath?: string, sessionId?: string): BudgetRecord | null {
    return getBudgetForScope(projectPath, sessionId);
  }

  /**
   * Get all budgets
   */
  getAllBudgets(): BudgetRecord[] {
    return getAllBudgets();
  }

  /**
   * Get cost breakdown
   */
  getCostBreakdown(sessionId?: string): CostBreakdown {
    // This would require additional tracking in the database
    // For now, return empty breakdown
    return {
      byTool: {},
      bySession: {},
      byAgent: {},
      total: 0,
    };
  }

  /**
   * Project remaining session cost based on current rate
   */
  projectSessionCost(sessionId: string, remainingMinutes: number = 30): number {
    const history = this.costHistory.get(sessionId);
    if (!history || history.length === 0) {
      return 0;
    }

    // Calculate cost per minute based on recent history
    const totalCost = history.reduce((sum, cost) => sum + cost, 0);
    const avgCostPerOperation = totalCost / history.length;

    // Estimate operations per minute (rough estimate: 2 ops/min)
    const opsPerMinute = 2;
    const projectedCost = avgCostPerOperation * opsPerMinute * remainingMinutes;

    return Math.round(projectedCost * 10000) / 10000;
  }

  /**
   * Reset budget spent amount
   */
  resetBudget(budgetId: number): void {
    const budget = getBudget(budgetId);
    if (budget) {
      upsertBudget({
        ...budget,
        spentUsd: 0,
        lastReset: new Date().toISOString(),
      });

      this.emit('budget:reset', { budgetId });
      this.notifyRenderer('budget:reset', { budgetId });
    }
  }

  /**
   * Clear cost history for a session
   */
  clearSessionHistory(sessionId: string): void {
    this.costHistory.delete(sessionId);
  }

  /**
   * Notify the renderer process
   */
  private notifyRenderer(channel: string, data: unknown): void {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let budgetService: BudgetServiceClass | null = null;

export function getBudgetService(): BudgetServiceClass {
  if (!budgetService) {
    budgetService = new BudgetServiceClass();
  }
  return budgetService;
}

export function initializeBudgetService(): BudgetServiceClass {
  budgetService = new BudgetServiceClass();
  return budgetService;
}

export { BudgetServiceClass };
