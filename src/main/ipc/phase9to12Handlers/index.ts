// ============================================================================
// PHASE 9-12 IPC HANDLERS - Project Registry, Coordination, Templates, Recommendations
// ============================================================================
//
// This module registers IPC handlers for the Phase 9-12 features:
// - Project Registry (registration, settings, analytics)
// - Project Coordination (cross-project agents, shared skills)
// - Project Templates (create, apply, manage)
// - Global Analytics (cross-project metrics)
// - Test Monitor (test result parsing, statistics)
// - Agent Recommendations (Phase 10)
//
// ============================================================================

import { Logger } from '../../services/logger.js';
import { startTestMonitor, stopTestMonitor } from '../../services/testMonitor.js';
import {
  registerProjectHandlers,
  registerTemplateHandlers,
  registerCoordinationHandlers,
} from './projectRegistry.js';
import {
  registerAnalyticsHandlers,
  registerTestMonitorHandlers,
} from './analytics.js';
import { registerRecommendationHandlers } from './recommendations.js';

const logger = new Logger('Phase9to12IPC');

// ============================================================================
// REGISTRATION
// ============================================================================

export function registerPhase9to12Handlers(): void {
  // Project Registry Handlers
  registerProjectHandlers();

  // Template Handlers
  registerTemplateHandlers();

  // Coordination Handlers
  registerCoordinationHandlers();

  // Analytics Handlers
  registerAnalyticsHandlers();

  // Test Monitor Handlers
  registerTestMonitorHandlers();

  // Recommendation Handlers (Phase 10)
  registerRecommendationHandlers();

  logger.info('Phase 9-12 IPC handlers registered');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Phase 9-12 services
 * Call this during app startup after hook server is ready
 */
export function initializePhase9to12Services(): void {
  startTestMonitor();
  logger.info('Phase 9-12 monitoring services initialized');
}

/**
 * Cleanup Phase 9-12 services
 * Call this during app shutdown
 */
export function cleanupPhase9to12Services(): void {
  stopTestMonitor();
  logger.info('Phase 9-12 monitoring services cleaned up');
}
