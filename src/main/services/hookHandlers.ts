// ============================================================================
// HOOK HANDLERS - Enhanced handlers integrating all Phase 5-8 services
// ============================================================================
//
// This module registers enhanced hook handlers that integrate:
// - Budget & Cost Controls (Phase 5)
// - Approval Queue with Policy Engine (Phase 6)
// - Agent Tree Orchestration (Phase 7)
// - Session Intelligence (Phase 8)
//
// ============================================================================

import { Logger } from './logger.js';
import { getHookServer, type HookPayload, type HookResponse } from './hookServer.js';
import { getBudgetService } from './budgetService.js';
import { getPolicyEngine } from './policyEngine.js';
import { getAgentTreeService } from './agentTree.js';
import { getSessionIntelligence } from './sessionIntelligence.js';
import type { ExtendedHookEventType } from '../database/hookEvents.js';

const logger = new Logger('HookHandlers');

// ============================================================================
// HANDLER REGISTRATION
// ============================================================================

/**
 * Register all enhanced hook handlers
 */
export function registerEnhancedHookHandlers(): void {
  const hookServer = getHookServer();

  // Clear existing handlers and register enhanced ones
  const eventTypes: ExtendedHookEventType[] = [
    'PreToolUse',
    'PostToolUse',
    'SessionStart',
    'SessionEnd',
    'Stop',
    'SubagentStart',
    'SubagentStop',
    'PermissionRequest',
    'UserPromptSubmit',
  ];

  for (const eventType of eventTypes) {
    hookServer.clearHandlers(eventType);
  }

  // Register enhanced handlers
  hookServer.registerHandler('PreToolUse', handlePreToolUse);
  hookServer.registerHandler('PostToolUse', handlePostToolUse);
  hookServer.registerHandler('SessionStart', handleSessionStart);
  hookServer.registerHandler('SessionEnd', handleSessionEnd);
  hookServer.registerHandler('Stop', handleStop);
  hookServer.registerHandler('SubagentStart', handleSubagentStart);
  hookServer.registerHandler('SubagentStop', handleSubagentStop);
  hookServer.registerHandler('PermissionRequest', handlePermissionRequest);
  hookServer.registerHandler('UserPromptSubmit', handleUserPromptSubmit);

  logger.info('Enhanced hook handlers registered');
}

// ============================================================================
// PRE-TOOL-USE HANDLER
// ============================================================================

/**
 * Handle PreToolUse - Budget checking before tool execution
 */
async function handlePreToolUse(payload: HookPayload): Promise<HookResponse> {
  const budgetService = getBudgetService();

  const toolName = payload.tool_name || 'unknown';
  const toolInput = payload.tool_input || {};

  // Estimate cost for this operation
  const estimate = budgetService.estimateCost(toolName, toolInput);

  // Check budget
  const budgetCheck = budgetService.checkBudget(
    payload.working_directory,
    payload.session_id,
    estimate.estimatedCostUsd
  );

  // Block if budget exceeded and hard stop enabled
  if (!budgetCheck.allowed) {
    logger.warn(`Blocking operation due to budget: ${budgetCheck.blockMessage}`);
    return {
      decision: 'block',
      message: budgetCheck.blockMessage,
    };
  }

  // Emit warning if approaching budget limit
  if (budgetCheck.warningMessage) {
    logger.info(budgetCheck.warningMessage);
    // This warning will be shown in the UI but won't block
  }

  // Track tool call in agent tree if in sub-agent context
  if (payload.session_id) {
    const agentTree = getAgentTreeService();
    const agent = agentTree.getAgent(payload.session_id);
    if (agent) {
      agentTree.recordToolCall(payload.session_id);
    }
  }

  return { decision: 'allow' };
}

// ============================================================================
// POST-TOOL-USE HANDLER
// ============================================================================

/**
 * Handle PostToolUse - Cost tracking and session metrics after tool execution
 */
async function handlePostToolUse(payload: HookPayload): Promise<HookResponse> {
  const budgetService = getBudgetService();
  const sessionIntelligence = getSessionIntelligence();
  const agentTree = getAgentTreeService();

  const toolName = payload.tool_name || 'unknown';
  const toolInput = payload.tool_input || {};
  const toolResponse = payload.tool_response || { success: true, content: '' };

  // Calculate actual cost
  const actualCost = budgetService.calculateActualCost(
    toolName,
    toolInput,
    toolResponse
  );

  // Record cost in budget
  budgetService.recordCost(
    actualCost,
    payload.working_directory,
    payload.session_id
  );

  // Record tool call in session intelligence
  if (payload.session_id) {
    sessionIntelligence.recordToolCall(
      payload.session_id,
      toolName,
      toolInput,
      toolResponse
    );
    sessionIntelligence.recordCost(payload.session_id, actualCost);

    // Also track in agent tree if applicable
    const agent = agentTree.getAgent(payload.session_id);
    if (agent) {
      agentTree.recordCost(payload.session_id, actualCost);
    }
  }

  return { decision: 'allow' };
}

// ============================================================================
// SESSION START HANDLER
// ============================================================================

/**
 * Handle SessionStart - Initialize session intelligence
 */
async function handleSessionStart(payload: HookPayload): Promise<HookResponse> {
  const sessionIntelligence = getSessionIntelligence();

  if (payload.session_id && payload.working_directory) {
    // Initialize session tracking
    sessionIntelligence.handleSessionStart({
      sessionId: payload.session_id,
      projectPath: payload.working_directory,
    });
  }

  // Note: Context injection for agents/skills is handled by the existing
  // handler in hookServer.ts - this adds session intelligence on top
  return { decision: 'allow' };
}

// ============================================================================
// SESSION END HANDLER
// ============================================================================

/**
 * Handle SessionEnd - Finalize session metrics
 */
async function handleSessionEnd(payload: HookPayload): Promise<HookResponse> {
  const sessionIntelligence = getSessionIntelligence();

  if (payload.session_id) {
    sessionIntelligence.handleSessionEnd({
      sessionId: payload.session_id,
      status: 'completed',
    });
  }

  return { decision: 'allow' };
}

// ============================================================================
// STOP HANDLER
// ============================================================================

/**
 * Handle Stop - Generate session summary
 */
async function handleStop(payload: HookPayload): Promise<HookResponse> {
  const sessionIntelligence = getSessionIntelligence();

  if (payload.session_id) {
    // End session and generate summary
    sessionIntelligence.handleSessionEnd({
      sessionId: payload.session_id,
      status: 'completed',
    });
  }

  return { decision: 'allow' };
}

// ============================================================================
// SUBAGENT START HANDLER
// ============================================================================

/**
 * Handle SubagentStart - Register in agent tree
 */
async function handleSubagentStart(payload: HookPayload): Promise<HookResponse> {
  const agentTree = getAgentTreeService();

  if (payload.session_id && payload.agent_name) {
    agentTree.handleAgentStart({
      sessionId: payload.session_id,
      agentName: payload.agent_name,
      parentSessionId: payload.parent_session_id,
    });

    // Allocate budget to sub-agent if parent has budget
    if (payload.parent_session_id) {
      const budgetService = getBudgetService();
      const parentBudget = budgetService.getBudget(
        payload.working_directory,
        payload.parent_session_id
      );

      if (parentBudget) {
        // Allocate 20% of remaining parent budget to child
        const remaining = parentBudget.limitUsd - parentBudget.spentUsd;
        const allocation = remaining * 0.2;
        agentTree.allocateBudget(payload.session_id, allocation, true);
      }
    }
  }

  return { decision: 'allow' };
}

// ============================================================================
// SUBAGENT STOP HANDLER
// ============================================================================

/**
 * Handle SubagentStop - Update agent tree
 */
async function handleSubagentStop(payload: HookPayload): Promise<HookResponse> {
  const agentTree = getAgentTreeService();

  if (payload.session_id) {
    agentTree.handleAgentStop({
      sessionId: payload.session_id,
      success: true, // Assume success unless indicated otherwise
    });
  }

  return { decision: 'allow' };
}

// ============================================================================
// PERMISSION REQUEST HANDLER
// ============================================================================

/**
 * Handle PermissionRequest - Route through policy engine
 */
async function handlePermissionRequest(payload: HookPayload): Promise<HookResponse> {
  const policyEngine = getPolicyEngine();

  // Parse permission details
  let toolName: string | undefined;
  let filePath: string | undefined;
  let command: string | undefined;

  if (payload.permission_details) {
    try {
      const details = typeof payload.permission_details === 'string'
        ? JSON.parse(payload.permission_details)
        : payload.permission_details;

      toolName = details.tool_name || details.toolName;
      filePath = details.file_path || details.filePath;
      command = details.command;
    } catch (e) {
      // Use raw details if not JSON
    }
  }

  // Process through policy engine
  const decision = await policyEngine.processPermissionRequest({
    sessionId: payload.session_id || 'unknown',
    permissionType: payload.permission_type || 'unknown',
    toolName,
    filePath,
    command,
    details: payload.permission_details ? { raw: payload.permission_details } : undefined,
  });

  if (decision.approved) {
    return { decision: 'allow' };
  }

  if (decision.queueItem) {
    // Permission queued for manual review
    // For now, we'll block and require the user to approve in Clausitron
    return {
      decision: 'block',
      message: 'Permission requires approval in Clausitron. Check the approval queue.',
    };
  }

  // Auto-denied by policy
  return {
    decision: 'deny',
    message: decision.reason,
  };
}

// ============================================================================
// USER PROMPT SUBMIT HANDLER
// ============================================================================

/**
 * Handle UserPromptSubmit - Record prompt for session intelligence
 */
async function handleUserPromptSubmit(payload: HookPayload): Promise<HookResponse> {
  const sessionIntelligence = getSessionIntelligence();

  if (payload.session_id && payload.user_prompt) {
    sessionIntelligence.recordPrompt(payload.session_id, payload.user_prompt);
  }

  return { decision: 'allow' };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize all services and register handlers
 */
export function initializeHookHandlers(): void {
  // Initialize services
  getBudgetService();
  getPolicyEngine();
  getAgentTreeService().initialize();
  getSessionIntelligence().initialize();

  // Install default policies
  getPolicyEngine().installDefaultPolicies();

  // Register enhanced handlers
  registerEnhancedHookHandlers();

  logger.info('Hook handlers initialized');
}
