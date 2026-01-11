// ============================================================================
// PHASE 5-8 IPC HANDLERS - Budget, Approval, Agent Tree, Session Intelligence
// ============================================================================
//
// This module registers IPC handlers for the Phase 5-8 features:
// - Budget & Cost Controls
// - Approval Queue
// - Agent Orchestration
// - Session Intelligence
//
// ============================================================================

import { ipcMain } from 'electron';
import { Logger } from '../services/logger.js';
import { getBudgetService } from '../services/budgetService.js';
import { getPolicyEngine } from '../services/policyEngine.js';
import { getAgentTreeService } from '../services/agentTree.js';
import { getSessionIntelligence } from '../services/sessionIntelligence.js';

const logger = new Logger('Phase5to8IPC');

// ============================================================================
// REGISTRATION
// ============================================================================

export function registerPhase5to8Handlers(): void {
  // Budget Handlers
  registerBudgetHandlers();

  // Approval Handlers
  registerApprovalHandlers();

  // Agent Tree Handlers
  registerAgentTreeHandlers();

  // Session Intelligence Handlers
  registerSessionIntelligenceHandlers();

  logger.info('Phase 5-8 IPC handlers registered');
}

// ============================================================================
// BUDGET HANDLERS (Phase 5)
// ============================================================================

function registerBudgetHandlers(): void {
  const budgetService = getBudgetService();

  // Get all budgets
  ipcMain.handle('budget:getAll', async () => {
    return budgetService.getAllBudgets();
  });

  // Get budget for scope
  ipcMain.handle('budget:getForScope', async (_event, projectPath?: string, sessionId?: string) => {
    return budgetService.getBudget(projectPath, sessionId);
  });

  // Create budget
  ipcMain.handle('budget:create', async (_event, options: {
    limitUsd: number;
    warningThreshold?: number;
    hardStopEnabled?: boolean;
    resetPeriod?: 'session' | 'daily' | 'weekly' | 'monthly';
    projectPath?: string;
    sessionId?: string;
  }) => {
    return budgetService.setBudget(options.limitUsd, {
      warningThreshold: options.warningThreshold,
      hardStopEnabled: options.hardStopEnabled,
      resetPeriod: options.resetPeriod,
      projectPath: options.projectPath,
      sessionId: options.sessionId,
    });
  });

  // Update budget
  ipcMain.handle('budget:update', async (_event, budgetId: number, updates: {
    limitUsd?: number;
    warningThreshold?: number;
    hardStopEnabled?: boolean;
    resetPeriod?: 'session' | 'daily' | 'weekly' | 'monthly';
  }) => {
    const budget = budgetService.getBudget(undefined, undefined);
    if (!budget) return null;

    // Re-create with updates
    return budgetService.setBudget(updates.limitUsd ?? budget.limitUsd, {
      warningThreshold: updates.warningThreshold ?? budget.warningThreshold,
      hardStopEnabled: updates.hardStopEnabled ?? budget.hardStopEnabled,
      resetPeriod: updates.resetPeriod ?? budget.resetPeriod,
      projectPath: budget.projectPath ?? undefined,
      sessionId: budget.sessionId ?? undefined,
    });
  });

  // Reset budget
  ipcMain.handle('budget:reset', async (_event, budgetId: number) => {
    budgetService.resetBudget(budgetId);
    return true;
  });

  // Get cost breakdown
  ipcMain.handle('budget:getCostBreakdown', async (_event, sessionId?: string) => {
    return budgetService.getCostBreakdown(sessionId);
  });

  // Project session cost
  ipcMain.handle('budget:projectCost', async (_event, sessionId: string, remainingMinutes: number) => {
    return budgetService.projectSessionCost(sessionId, remainingMinutes);
  });
}

// ============================================================================
// APPROVAL HANDLERS (Phase 6)
// ============================================================================

function registerApprovalHandlers(): void {
  const policyEngine = getPolicyEngine();

  // Get pending approvals
  ipcMain.handle('approval:getPending', async (_event, sessionId?: string) => {
    return policyEngine.getPendingApprovals(sessionId);
  });

  // Approve item
  ipcMain.handle('approval:approve', async (_event, itemId: number) => {
    policyEngine.approveItem(itemId, true);
    return true;
  });

  // Deny item
  ipcMain.handle('approval:deny', async (_event, itemId: number) => {
    policyEngine.denyItem(itemId, true);
    return true;
  });

  // Batch approve
  ipcMain.handle('approval:batchApprove', async (_event, itemIds: number[]) => {
    policyEngine.batchApprove(itemIds);
    return true;
  });

  // Batch deny
  ipcMain.handle('approval:batchDeny', async (_event, itemIds: number[]) => {
    policyEngine.batchDeny(itemIds);
    return true;
  });

  // Get all policies
  ipcMain.handle('policy:getAll', async () => {
    return policyEngine.getAllPolicies();
  });

  // Get enabled policies
  ipcMain.handle('policy:getEnabled', async () => {
    return policyEngine.getEnabledPolicies();
  });

  // Create policy
  ipcMain.handle('policy:create', async (_event, policy: {
    name: string;
    matcher: string;
    action: 'auto-approve' | 'auto-deny' | 'queue';
    priority?: number;
    enabled?: boolean;
  }) => {
    return policyEngine.createPolicy(policy);
  });

  // Update policy
  ipcMain.handle('policy:update', async (_event, id: number, updates: {
    name?: string;
    matcher?: string;
    action?: 'auto-approve' | 'auto-deny' | 'queue';
    priority?: number;
    enabled?: boolean;
  }) => {
    policyEngine.updatePolicy(id, updates);
    return policyEngine.getPolicy(id);
  });

  // Delete policy
  ipcMain.handle('policy:delete', async (_event, id: number) => {
    policyEngine.deletePolicy(id);
    return true;
  });
}

// ============================================================================
// AGENT TREE HANDLERS (Phase 7)
// ============================================================================

function registerAgentTreeHandlers(): void {
  const agentTreeService = getAgentTreeService();

  // Get agent by session ID
  ipcMain.handle('agentTree:getAgent', async (_event, sessionId: string) => {
    return agentTreeService.getAgent(sessionId);
  });

  // Get full tree
  ipcMain.handle('agentTree:getTree', async (_event, rootSessionId: string) => {
    return agentTreeService.getTree(rootSessionId);
  });

  // Get running agents
  ipcMain.handle('agentTree:getRunning', async (_event, rootSessionId?: string) => {
    return agentTreeService.getRunningAgents(rootSessionId);
  });

  // Get children
  ipcMain.handle('agentTree:getChildren', async (_event, sessionId: string) => {
    return agentTreeService.getChildren(sessionId);
  });

  // Get summary
  ipcMain.handle('agentTree:getSummary', async (_event, rootSessionId: string) => {
    return agentTreeService.getSummary(rootSessionId);
  });

  // Get visualization tree
  ipcMain.handle('agentTree:getVisualizationTree', async (_event, rootSessionId: string) => {
    return agentTreeService.getVisualizationTree(rootSessionId);
  });

  // Get flat tree list
  ipcMain.handle('agentTree:getFlatList', async (_event, rootSessionId: string) => {
    return agentTreeService.getFlatTreeList(rootSessionId);
  });

  // Get agent metrics
  ipcMain.handle('agentTree:getMetrics', async (_event, agentName: string) => {
    return agentTreeService.getAgentMetrics(agentName);
  });

  // Get all metrics
  ipcMain.handle('agentTree:getAllMetrics', async () => {
    return agentTreeService.getAllMetrics();
  });

  // Terminate agent
  ipcMain.handle('agentTree:terminate', async (_event, sessionId: string) => {
    agentTreeService.terminateAgent(sessionId);
    return true;
  });

  // Allocate budget
  ipcMain.handle('agentTree:allocateBudget', async (_event, sessionId: string, amount: number) => {
    return agentTreeService.allocateBudget(sessionId, amount, false);
  });
}

// ============================================================================
// SESSION INTELLIGENCE HANDLERS (Phase 8)
// ============================================================================

function registerSessionIntelligenceHandlers(): void {
  const sessionIntelligence = getSessionIntelligence();

  // Get session
  ipcMain.handle('session:get', async (_event, sessionId: string) => {
    return sessionIntelligence.getSession(sessionId);
  });

  // Get recent sessions
  ipcMain.handle('session:getRecent', async (_event, limit?: number) => {
    return sessionIntelligence.getAllSessions(limit);
  });

  // Get project sessions
  ipcMain.handle('session:getForProject', async (_event, projectPath: string, limit?: number) => {
    return sessionIntelligence.getProjectSessions(projectPath, limit);
  });

  // Search sessions
  ipcMain.handle('session:search', async (_event, query: string, projectPath?: string, limit?: number) => {
    return sessionIntelligence.search(query, projectPath, limit);
  });

  // Find by file
  ipcMain.handle('session:findByFile', async (_event, filePath: string, projectPath?: string, limit?: number) => {
    return sessionIntelligence.findByFile(filePath, projectPath, limit);
  });

  // Compare sessions
  ipcMain.handle('session:compare', async (_event, sessionId1: string, sessionId2: string) => {
    return sessionIntelligence.compare(sessionId1, sessionId2);
  });

  // Prepare resumption
  ipcMain.handle('session:prepareResumption', async (_event, sessionId: string) => {
    return sessionIntelligence.prepareResumption(sessionId);
  });

  // Create checkpoint
  ipcMain.handle('session:createCheckpoint', async (_event, sessionId: string, name: string) => {
    return sessionIntelligence.createCheckpoint(sessionId, name);
  });

  // Get checkpoints
  ipcMain.handle('session:getCheckpoints', async (_event, sessionId: string) => {
    return sessionIntelligence.getCheckpoints(sessionId);
  });

  // Delete checkpoint
  ipcMain.handle('session:deleteCheckpoint', async (_event, checkpointId: number) => {
    sessionIntelligence.deleteCheckpoint(checkpointId);
    return true;
  });
}
