// ============================================================================
// RECOMMENDATION IPC HANDLERS (Phase 10)
// ============================================================================

import { ipcMain } from 'electron';
import { Logger } from '../../services/logger.js';
import {
  getRecommendationEngine,
  type Recommendation,
  type PromptAnalysis,
  type ProjectContext,
} from '../../services/recommendationEngine.js';
import {
  getRecommendationsForSession,
  getRecommendationsForProject,
  getPendingRecommendations,
  getTopPerformingItems,
  type RecommendationAction,
  type RecommendationType,
  type RecommendationStats,
} from '../../database/recommendations.js';

const logger = new Logger('RecommendationIPC');

// ============================================================================
// RECOMMENDATION HANDLERS
// ============================================================================

export function registerRecommendationHandlers(): void {
  const engine = getRecommendationEngine();

  // ============================================================================
  // PROMPT ANALYSIS & RECOMMENDATIONS
  // ============================================================================

  /**
   * Get recommendations for a user prompt
   * Analyzes the prompt and returns matching agents/skills
   */
  ipcMain.handle('recommendations:getForPrompt', async (
    _event,
    options: {
      prompt: string;
      sessionId?: string;
      projectPath?: string;
    }
  ): Promise<Recommendation[]> => {
    try {
      engine.initialize();
      return await engine.getRecommendationsForPrompt(
        options.prompt,
        options.sessionId ?? null,
        options.projectPath ?? null
      );
    } catch (error) {
      logger.error('Failed to get prompt recommendations:', error);
      return [];
    }
  });

  /**
   * Get recommendations based on project context only
   * Analyzes package.json, file patterns, etc.
   */
  ipcMain.handle('recommendations:getForProject', async (
    _event,
    projectPath: string
  ): Promise<Recommendation[]> => {
    try {
      engine.initialize();
      return await engine.getRecommendationsForProject(projectPath);
    } catch (error) {
      logger.error('Failed to get project recommendations:', error);
      return [];
    }
  });

  /**
   * Analyze a prompt without generating recommendations
   * Returns extracted keywords, intents, and technologies
   */
  ipcMain.handle('recommendations:analyzePrompt', async (
    _event,
    prompt: string
  ): Promise<PromptAnalysis> => {
    try {
      engine.initialize();
      return engine.analyzePrompt(prompt);
    } catch (error) {
      logger.error('Failed to analyze prompt:', error);
      return {
        keywords: [],
        intents: [],
        technologies: [],
        frameworks: [],
        actions: [],
      };
    }
  });

  /**
   * Analyze project context
   * Returns detected technologies, frameworks, dependencies
   */
  ipcMain.handle('recommendations:analyzeProject', async (
    _event,
    projectPath: string
  ): Promise<ProjectContext> => {
    try {
      engine.initialize();
      return await engine.analyzeProjectContext(projectPath);
    } catch (error) {
      logger.error('Failed to analyze project context:', error);
      return {
        name: null,
        technologies: [],
        frameworks: [],
        hasTests: false,
        hasDocker: false,
        hasTypeScript: false,
        packageDependencies: [],
      };
    }
  });

  // ============================================================================
  // FEEDBACK TRACKING
  // ============================================================================

  /**
   * Record user feedback on a recommendation
   * Tracks accept/reject/ignore actions for learning
   */
  ipcMain.handle('recommendations:recordFeedback', async (
    _event,
    options: {
      recommendationId: number;
      action: RecommendationAction;
    }
  ): Promise<boolean> => {
    try {
      engine.initialize();
      engine.recordFeedback(options.recommendationId, options.action);
      return true;
    } catch (error) {
      logger.error('Failed to record recommendation feedback:', error);
      return false;
    }
  });

  /**
   * Accept a recommendation
   * Shorthand for recordFeedback with 'accepted' action
   */
  ipcMain.handle('recommendations:accept', async (
    _event,
    recommendationId: number
  ): Promise<boolean> => {
    try {
      engine.initialize();
      engine.recordFeedback(recommendationId, 'accepted');
      return true;
    } catch (error) {
      logger.error('Failed to accept recommendation:', error);
      return false;
    }
  });

  /**
   * Reject a recommendation
   * Shorthand for recordFeedback with 'rejected' action
   */
  ipcMain.handle('recommendations:reject', async (
    _event,
    recommendationId: number
  ): Promise<boolean> => {
    try {
      engine.initialize();
      engine.recordFeedback(recommendationId, 'rejected');
      return true;
    } catch (error) {
      logger.error('Failed to reject recommendation:', error);
      return false;
    }
  });

  /**
   * Ignore a recommendation
   * Shorthand for recordFeedback with 'ignored' action
   */
  ipcMain.handle('recommendations:ignore', async (
    _event,
    recommendationId: number
  ): Promise<boolean> => {
    try {
      engine.initialize();
      engine.recordFeedback(recommendationId, 'ignored');
      return true;
    } catch (error) {
      logger.error('Failed to ignore recommendation:', error);
      return false;
    }
  });

  // ============================================================================
  // STATISTICS & HISTORY
  // ============================================================================

  /**
   * Get overall recommendation statistics
   * Returns acceptance rate, breakdown by type/source, top items
   */
  ipcMain.handle('recommendations:getStats', async (): Promise<RecommendationStats> => {
    try {
      engine.initialize();
      return engine.getStats();
    } catch (error) {
      logger.error('Failed to get recommendation stats:', error);
      return {
        totalRecommendations: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        ignoredCount: 0,
        pendingCount: 0,
        acceptanceRate: 0,
        byType: {
          agent: { total: 0, accepted: 0, rate: 0 },
          skill: { total: 0, accepted: 0, rate: 0 },
        },
        bySource: {
          prompt: { total: 0, accepted: 0, rate: 0 },
          project: { total: 0, accepted: 0, rate: 0 },
          context: { total: 0, accepted: 0, rate: 0 },
          historical: { total: 0, accepted: 0, rate: 0 },
        },
        topAcceptedItems: [],
      };
    }
  });

  /**
   * Get recommendations history for a session
   */
  ipcMain.handle('recommendations:getForSession', async (
    _event,
    options: {
      sessionId: string;
      limit?: number;
    }
  ) => {
    try {
      return getRecommendationsForSession(options.sessionId, options.limit ?? 50);
    } catch (error) {
      logger.error('Failed to get session recommendations:', error);
      return [];
    }
  });

  /**
   * Get recommendations history for a project
   */
  ipcMain.handle('recommendations:getHistoryForProject', async (
    _event,
    options: {
      projectPath: string;
      limit?: number;
    }
  ) => {
    try {
      return getRecommendationsForProject(options.projectPath, options.limit ?? 50);
    } catch (error) {
      logger.error('Failed to get project recommendation history:', error);
      return [];
    }
  });

  /**
   * Get pending recommendations (not yet acted upon)
   */
  ipcMain.handle('recommendations:getPending', async (
    _event,
    options?: {
      sessionId?: string;
      limit?: number;
    }
  ) => {
    try {
      return getPendingRecommendations(options?.sessionId, options?.limit ?? 20);
    } catch (error) {
      logger.error('Failed to get pending recommendations:', error);
      return [];
    }
  });

  /**
   * Get top performing items (highest acceptance rate)
   */
  ipcMain.handle('recommendations:getTopPerforming', async (
    _event,
    options?: {
      type?: RecommendationType;
      minRecommendations?: number;
      limit?: number;
    }
  ) => {
    try {
      return getTopPerformingItems(
        options?.type,
        options?.minRecommendations ?? 3,
        options?.limit ?? 20
      );
    } catch (error) {
      logger.error('Failed to get top performing items:', error);
      return [];
    }
  });

  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================

  /**
   * Clear all recommendation caches
   */
  ipcMain.handle('recommendations:clearCache', async (): Promise<boolean> => {
    try {
      engine.clearCaches();
      return true;
    } catch (error) {
      logger.error('Failed to clear recommendation caches:', error);
      return false;
    }
  });

  /**
   * Clear cache for a specific session
   */
  ipcMain.handle('recommendations:clearSessionCache', async (
    _event,
    sessionId: string
  ): Promise<boolean> => {
    try {
      engine.clearSessionCache(sessionId);
      return true;
    } catch (error) {
      logger.error('Failed to clear session cache:', error);
      return false;
    }
  });

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Configure the recommendation engine
   */
  ipcMain.handle('recommendations:configure', async (
    _event,
    config: {
      maxRecommendations?: number;
      minConfidenceScore?: number;
      historicalBoostWeight?: number;
      projectContextWeight?: number;
      cacheTimeoutMs?: number;
    }
  ): Promise<boolean> => {
    try {
      engine.configure(config);
      return true;
    } catch (error) {
      logger.error('Failed to configure recommendation engine:', error);
      return false;
    }
  });

  logger.debug('Recommendation IPC handlers registered');
}
