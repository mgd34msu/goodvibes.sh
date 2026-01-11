// ============================================================================
// SESSION INTELLIGENCE SERVICE - Session summary and resumption
// ============================================================================
//
// This service manages session intelligence features including:
// - Automatic summary generation when sessions end
// - Session comparison and diff
// - Session resumption with context injection
// - Cross-session search
//
// ============================================================================

import { EventEmitter } from 'events';
import { Logger } from './logger.js';
import { getMainWindow } from '../window.js';
import {
  createSessionSummariesTables,
  upsertSessionSummary,
  getSessionSummary,
  getSessionSummaryBySessionId,
  getRecentSessionsForProject,
  getRecentSessions,
  searchSessions,
  findSessionsByFile,
  updateSessionMetrics,
  endSession,
  updateContextSnapshot,
  updateLastPrompt,
  addFileChange,
  createCheckpoint,
  getSessionCheckpoints,
  deleteCheckpoint,
  compareSessions,
  cleanupOldSessions,
  type SessionSummary,
  type SessionCheckpoint,
  type SessionComparison,
} from '../database/sessionSummaries.js';

const logger = new Logger('SessionIntelligence');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Session start context
 */
export interface SessionStartContext {
  sessionId: string;
  projectPath: string;
  title?: string;
  resumeFromSessionId?: string;
}

/**
 * Session end event
 */
export interface SessionEndEvent {
  sessionId: string;
  status: 'completed' | 'aborted' | 'error';
  summary?: string;
}

/**
 * Resumption context for injecting into new session
 */
export interface ResumptionContext {
  previousSessionId: string;
  previousSummary: SessionSummary;
  contextToInject: string;
  lastPrompt: string | null;
  suggestedStartingPrompt: string;
}

/**
 * Topic extraction result
 */
interface ExtractedTopics {
  topics: string[];
  technologies: string[];
  actions: string[];
}

// ============================================================================
// SESSION INTELLIGENCE SERVICE
// ============================================================================

class SessionIntelligenceServiceClass extends EventEmitter {
  private initialized: boolean = false;
  private activeMetrics: Map<string, {
    toolCalls: number;
    filesModified: Set<string>;
    filesCreated: Set<string>;
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
    tokensUsed: number;
    costUsd: number;
    prompts: string[];
  }> = new Map();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  /**
   * Initialize the session intelligence service
   */
  initialize(): void {
    if (this.initialized) return;

    createSessionSummariesTables();
    this.initialized = true;

    logger.info('Session intelligence service initialized');
  }

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  /**
   * Handle session start
   */
  handleSessionStart(context: SessionStartContext): SessionSummary {
    this.initialize();

    logger.info(`Session started: ${context.sessionId}`);

    // Initialize metrics tracking for this session
    this.activeMetrics.set(context.sessionId, {
      toolCalls: 0,
      filesModified: new Set(),
      filesCreated: new Set(),
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      tokensUsed: 0,
      costUsd: 0,
      prompts: [],
    });

    // Generate initial title
    let title = context.title || 'New Session';
    let description = 'Session in progress...';

    // Check if resuming from previous session
    if (context.resumeFromSessionId) {
      const previous = getSessionSummaryBySessionId(context.resumeFromSessionId);
      if (previous) {
        title = `Continuing: ${previous.title}`;
        description = `Resumed from session ${context.resumeFromSessionId}`;
      }
    }

    // Create initial session summary
    const summary = upsertSessionSummary({
      sessionId: context.sessionId,
      projectPath: context.projectPath,
      title,
      description,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: 0,
      status: 'completed',
      toolCalls: 0,
      filesModified: 0,
      filesCreated: 0,
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      tokensUsed: 0,
      costUsd: 0,
      activeAgentIds: '[]',
      injectedSkillIds: '[]',
      keyTopics: '[]',
      fileChanges: '[]',
      lastPrompt: null,
      contextSnapshot: null,
    });

    this.emit('session:started', summary);
    this.notifyRenderer('session:intelligence-updated', { action: 'started', summary });

    return summary;
  }

  /**
   * Handle session end
   */
  handleSessionEnd(event: SessionEndEvent): SessionSummary | null {
    this.initialize();

    logger.info(`Session ended: ${event.sessionId}`, { status: event.status });

    // Get accumulated metrics
    const metrics = this.activeMetrics.get(event.sessionId);

    // End the session in the database
    endSession(event.sessionId, event.status);

    // Get the updated summary
    const summary = getSessionSummaryBySessionId(event.sessionId);
    if (!summary) return null;

    // Generate summary description
    if (metrics) {
      const description = this.generateSessionDescription(metrics, event.summary);
      const topics = this.extractTopics(metrics.prompts.join('\n'));

      // Update with final data
      upsertSessionSummary({
        ...summary,
        description,
        toolCalls: metrics.toolCalls,
        filesModified: metrics.filesModified.size,
        filesCreated: metrics.filesCreated.size,
        testsRun: metrics.testsRun,
        testsPassed: metrics.testsPassed,
        testsFailed: metrics.testsFailed,
        tokensUsed: metrics.tokensUsed,
        costUsd: metrics.costUsd,
        keyTopics: JSON.stringify(topics.topics),
        lastPrompt: metrics.prompts[metrics.prompts.length - 1] || null,
      });

      // Clean up active metrics
      this.activeMetrics.delete(event.sessionId);
    }

    const updatedSummary = getSessionSummaryBySessionId(event.sessionId);

    this.emit('session:ended', updatedSummary);
    this.notifyRenderer('session:intelligence-updated', { action: 'ended', summary: updatedSummary });

    return updatedSummary;
  }

  // ============================================================================
  // METRICS TRACKING
  // ============================================================================

  /**
   * Record a tool call
   */
  recordToolCall(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    output: { success: boolean; content: string }
  ): void {
    const metrics = this.activeMetrics.get(sessionId);
    if (!metrics) return;

    metrics.toolCalls++;

    // Track file changes
    if (toolName === 'Write') {
      const filePath = input.file_path as string;
      if (filePath) {
        metrics.filesCreated.add(filePath);
        addFileChange(sessionId, {
          filePath,
          action: 'created',
          timestamp: new Date().toISOString(),
        });
      }
    } else if (toolName === 'Edit') {
      const filePath = input.file_path as string;
      if (filePath) {
        metrics.filesModified.add(filePath);
        addFileChange(sessionId, {
          filePath,
          action: 'modified',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Track test results
    if (toolName === 'Bash') {
      const command = input.command as string;
      if (command && (
        command.includes('npm test') ||
        command.includes('yarn test') ||
        command.includes('pnpm test') ||
        command.includes('vitest') ||
        command.includes('jest')
      )) {
        this.parseTestResults(metrics, output.content);
      }
    }
  }

  /**
   * Parse test results from command output
   */
  private parseTestResults(
    metrics: ReturnType<typeof this.activeMetrics.get>,
    output: string
  ): void {
    if (!metrics) return;

    // Look for common test result patterns
    const patterns = [
      // Jest/Vitest: "Tests:       5 passed, 2 failed"
      /Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/i,
      // Jest: "Tests:  12 passed, 12 total"
      /Tests:\s+(\d+)\s+passed,\s+\d+\s+total/i,
      // Vitest: "✓ 15 tests passed"
      /[✓✔]\s+(\d+)\s+tests?\s+passed/i,
      // "12 passing"
      /(\d+)\s+passing/i,
      // "3 failing"
      /(\d+)\s+failing/i,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num)) {
          if (pattern.source.includes('passed') || pattern.source.includes('passing')) {
            metrics.testsPassed += num;
          } else if (pattern.source.includes('failed') || pattern.source.includes('failing')) {
            metrics.testsFailed += num;
          }
          metrics.testsRun += num;
        }
      }
    }
  }

  /**
   * Record a user prompt
   */
  recordPrompt(sessionId: string, prompt: string): void {
    const metrics = this.activeMetrics.get(sessionId);
    if (!metrics) return;

    metrics.prompts.push(prompt);
    updateLastPrompt(sessionId, prompt);
  }

  /**
   * Record token usage
   */
  recordTokens(sessionId: string, inputTokens: number, outputTokens: number): void {
    const metrics = this.activeMetrics.get(sessionId);
    if (!metrics) return;

    metrics.tokensUsed += inputTokens + outputTokens;
  }

  /**
   * Record cost
   */
  recordCost(sessionId: string, costUsd: number): void {
    const metrics = this.activeMetrics.get(sessionId);
    if (!metrics) return;

    metrics.costUsd += costUsd;
  }

  // ============================================================================
  // SUMMARY GENERATION
  // ============================================================================

  /**
   * Generate a human-readable session description
   */
  private generateSessionDescription(
    metrics: NonNullable<ReturnType<typeof this.activeMetrics.get>>,
    customSummary?: string
  ): string {
    if (customSummary) return customSummary;

    const parts: string[] = [];

    // Describe file changes
    const totalFiles = metrics.filesModified.size + metrics.filesCreated.size;
    if (totalFiles > 0) {
      const modifiedPart = metrics.filesModified.size > 0
        ? `modified ${metrics.filesModified.size}`
        : '';
      const createdPart = metrics.filesCreated.size > 0
        ? `created ${metrics.filesCreated.size}`
        : '';
      const filesPart = [modifiedPart, createdPart].filter(Boolean).join(' and ');
      parts.push(`${filesPart} file${totalFiles > 1 ? 's' : ''}`);
    }

    // Describe test results
    if (metrics.testsRun > 0) {
      if (metrics.testsFailed === 0) {
        parts.push(`all ${metrics.testsPassed} tests passed`);
      } else {
        parts.push(`${metrics.testsPassed}/${metrics.testsRun} tests passed`);
      }
    }

    // Describe activity
    if (metrics.toolCalls > 0) {
      parts.push(`${metrics.toolCalls} tool operations`);
    }

    if (parts.length === 0) {
      return 'Session completed with no significant changes.';
    }

    return `Session ${parts.join(', ')}.`;
  }

  /**
   * Extract topics from session prompts
   */
  private extractTopics(text: string): ExtractedTopics {
    const topics: Set<string> = new Set();
    const technologies: Set<string> = new Set();
    const actions: Set<string> = new Set();

    // Technology patterns
    const techPatterns = [
      /\b(React|Vue|Angular|Svelte|Next\.?js|Nuxt|Remix)\b/gi,
      /\b(TypeScript|JavaScript|Python|Go|Rust|Ruby)\b/gi,
      /\b(Node\.?js|Deno|Bun)\b/gi,
      /\b(PostgreSQL|MySQL|MongoDB|Redis|SQLite|Prisma)\b/gi,
      /\b(Docker|Kubernetes|AWS|GCP|Azure)\b/gi,
      /\b(GraphQL|REST|gRPC|WebSocket)\b/gi,
      /\b(Tailwind|SCSS|CSS)\b/gi,
      /\b(Jest|Vitest|Playwright|Cypress)\b/gi,
    ];

    for (const pattern of techPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        technologies.add(match[1].toLowerCase());
      }
    }

    // Action patterns
    const actionPatterns = [
      /\b(implement|add|create|build|write)\s+(\w+\s+)?(\w+)/gi,
      /\b(fix|debug|resolve|repair)\s+(\w+\s+)?(\w+)/gi,
      /\b(refactor|optimize|improve)\s+(\w+\s+)?(\w+)/gi,
      /\b(test|add tests for)\s+(\w+\s+)?(\w+)/gi,
      /\b(update|modify|change)\s+(\w+\s+)?(\w+)/gi,
    ];

    for (const pattern of actionPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const action = match[1].toLowerCase();
        const subject = match[3]?.toLowerCase();
        if (subject && subject.length > 2) {
          actions.add(action);
          topics.add(subject);
        }
      }
    }

    return {
      topics: Array.from(topics).slice(0, 10),
      technologies: Array.from(technologies).slice(0, 10),
      actions: Array.from(actions).slice(0, 5),
    };
  }

  // ============================================================================
  // SESSION QUERIES
  // ============================================================================

  /**
   * Get session summary
   */
  getSession(sessionId: string): SessionSummary | null {
    this.initialize();
    return getSessionSummaryBySessionId(sessionId);
  }

  /**
   * Get recent sessions for a project
   */
  getProjectSessions(projectPath: string, limit: number = 20): SessionSummary[] {
    this.initialize();
    return getRecentSessionsForProject(projectPath, limit);
  }

  /**
   * Get all recent sessions
   */
  getAllSessions(limit: number = 50): SessionSummary[] {
    this.initialize();
    return getRecentSessions(limit);
  }

  /**
   * Search sessions
   */
  search(query: string, projectPath?: string, limit: number = 50): SessionSummary[] {
    this.initialize();
    return searchSessions(query, projectPath, limit);
  }

  /**
   * Find sessions by file
   */
  findByFile(filePath: string, projectPath?: string, limit: number = 20): SessionSummary[] {
    this.initialize();
    return findSessionsByFile(filePath, projectPath, limit);
  }

  // ============================================================================
  // SESSION COMPARISON
  // ============================================================================

  /**
   * Compare two sessions
   */
  compare(sessionId1: string, sessionId2: string): SessionComparison | null {
    this.initialize();
    return compareSessions(sessionId1, sessionId2);
  }

  // ============================================================================
  // SESSION RESUMPTION
  // ============================================================================

  /**
   * Prepare context for resuming a session
   */
  prepareResumption(sessionId: string): ResumptionContext | null {
    this.initialize();

    const summary = getSessionSummaryBySessionId(sessionId);
    if (!summary) return null;

    // Build context to inject
    const contextParts: string[] = [];

    contextParts.push(`## Previous Session Summary`);
    contextParts.push(`Title: ${summary.title}`);
    contextParts.push(`Description: ${summary.description}`);
    contextParts.push(``);

    // Add file changes context
    const fileChanges = JSON.parse(summary.fileChanges) as Array<{
      filePath: string;
      action: string;
      timestamp: string;
    }>;
    if (fileChanges.length > 0) {
      contextParts.push(`### Files Changed`);
      for (const change of fileChanges.slice(-20)) {
        contextParts.push(`- ${change.action}: ${change.filePath}`);
      }
      contextParts.push(``);
    }

    // Add metrics summary
    contextParts.push(`### Session Metrics`);
    contextParts.push(`- Tool calls: ${summary.toolCalls}`);
    contextParts.push(`- Files modified: ${summary.filesModified}`);
    contextParts.push(`- Files created: ${summary.filesCreated}`);
    if (summary.testsRun > 0) {
      contextParts.push(`- Tests: ${summary.testsPassed}/${summary.testsRun} passed`);
    }
    contextParts.push(``);

    // Add key topics
    const topics = JSON.parse(summary.keyTopics) as string[];
    if (topics.length > 0) {
      contextParts.push(`### Key Topics`);
      contextParts.push(topics.join(', '));
      contextParts.push(``);
    }

    // Build suggested starting prompt
    let suggestedPrompt = 'Continue where we left off.';
    if (summary.lastPrompt) {
      suggestedPrompt = `Continue from where we left off. The last thing we were working on was: "${summary.lastPrompt.slice(0, 200)}${summary.lastPrompt.length > 200 ? '...' : ''}"`;
    }

    return {
      previousSessionId: sessionId,
      previousSummary: summary,
      contextToInject: contextParts.join('\n'),
      lastPrompt: summary.lastPrompt,
      suggestedStartingPrompt: suggestedPrompt,
    };
  }

  // ============================================================================
  // CHECKPOINTS
  // ============================================================================

  /**
   * Create a checkpoint
   */
  createCheckpoint(sessionId: string, name: string): SessionCheckpoint | null {
    this.initialize();

    const summary = getSessionSummaryBySessionId(sessionId);
    if (!summary) return null;

    const metrics = this.activeMetrics.get(sessionId);

    const context = {
      metrics: metrics ? {
        toolCalls: metrics.toolCalls,
        filesModified: Array.from(metrics.filesModified),
        filesCreated: Array.from(metrics.filesCreated),
        testsRun: metrics.testsRun,
        testsPassed: metrics.testsPassed,
        testsFailed: metrics.testsFailed,
        lastPrompt: metrics.prompts[metrics.prompts.length - 1],
      } : null,
      timestamp: new Date().toISOString(),
    };

    return createCheckpoint(sessionId, name, context);
  }

  /**
   * Get checkpoints for a session
   */
  getCheckpoints(sessionId: string): SessionCheckpoint[] {
    this.initialize();
    return getSessionCheckpoints(sessionId);
  }

  /**
   * Delete a checkpoint
   */
  deleteCheckpoint(checkpointId: number): void {
    this.initialize();
    deleteCheckpoint(checkpointId);
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  /**
   * Cleanup old sessions
   */
  cleanup(maxAgeDays: number = 30): number {
    return cleanupOldSessions(maxAgeDays);
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

let sessionIntelligence: SessionIntelligenceServiceClass | null = null;

export function getSessionIntelligence(): SessionIntelligenceServiceClass {
  if (!sessionIntelligence) {
    sessionIntelligence = new SessionIntelligenceServiceClass();
  }
  return sessionIntelligence;
}

export function initializeSessionIntelligence(): SessionIntelligenceServiceClass {
  sessionIntelligence = new SessionIntelligenceServiceClass();
  sessionIntelligence.initialize();
  return sessionIntelligence;
}

export { SessionIntelligenceServiceClass };
