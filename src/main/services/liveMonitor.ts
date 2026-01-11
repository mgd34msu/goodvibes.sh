// ============================================================================
// LIVE MONITOR SERVICE - Real-time file change and git integration
// ============================================================================
//
// This service provides:
// - Real-time file change tracking from PostToolUse events
// - Rolling buffer of recent file changes
// - Git integration for rollback capability
// - Diff tracking (before/after content)
//
// ============================================================================

import { EventEmitter } from 'events';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger.js';
import { getMainWindow } from '../window.js';
import { getHookServer, type HookPayload } from './hookServer.js';

const logger = new Logger('LiveMonitor');

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_FILE_CHANGES = 100;
const MAX_CONTENT_SIZE = 100000; // 100KB max for storing content

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a file change event
 */
export interface FileChange {
  id: string;
  sessionId: string | null;
  projectPath: string | null;
  filePath: string;
  action: 'created' | 'modified' | 'deleted';
  toolName: 'Edit' | 'Write';
  timestamp: string;
  beforeContent: string | null;
  afterContent: string | null;
  diffLines: DiffLine[];
  isGitRepo: boolean;
  gitStatus: GitFileStatus | null;
  canRollback: boolean;
}

/**
 * A single line in a diff
 */
export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

/**
 * Git status for a file
 */
export interface GitFileStatus {
  staged: boolean;
  modified: boolean;
  untracked: boolean;
  deleted: boolean;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  message: string;
  filePath: string;
  method: 'git' | 'content' | 'none';
}

/**
 * File change stats
 */
export interface FileChangeStats {
  totalChanges: number;
  byAction: Record<string, number>;
  byProject: Record<string, number>;
  recentFiles: string[];
}

// ============================================================================
// LIVE MONITOR SERVICE
// ============================================================================

class LiveMonitorService extends EventEmitter {
  private fileChanges: FileChange[] = [];
  private isListening = false;
  private hookCleanup: (() => void) | null = null;

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start listening for file changes from hook events
   */
  start(): void {
    if (this.isListening) {
      logger.warn('Live monitor already listening');
      return;
    }

    const hookServer = getHookServer();

    // Listen to PostToolUse events
    const handleHookProcessed = (data: {
      payload: HookPayload;
      response: unknown;
      durationMs: number;
    }) => {
      this.processHookEvent(data.payload);
    };

    hookServer.on('hook:processed', handleHookProcessed);

    this.hookCleanup = () => {
      hookServer.off('hook:processed', handleHookProcessed);
    };

    this.isListening = true;
    logger.info('Live monitor started');
  }

  /**
   * Stop listening for file changes
   */
  stop(): void {
    if (this.hookCleanup) {
      this.hookCleanup();
      this.hookCleanup = null;
    }
    this.isListening = false;
    logger.info('Live monitor stopped');
  }

  /**
   * Get service status
   */
  getStatus(): { listening: boolean; changeCount: number } {
    return {
      listening: this.isListening,
      changeCount: this.fileChanges.length,
    };
  }

  // ============================================================================
  // EVENT PROCESSING
  // ============================================================================

  /**
   * Process a hook event and extract file changes
   */
  private processHookEvent(payload: HookPayload): void {
    // Only process PostToolUse events for Edit and Write tools
    if (payload.hook_event_name !== 'PostToolUse') {
      return;
    }

    const toolName = payload.tool_name;
    if (toolName !== 'Edit' && toolName !== 'Write') {
      return;
    }

    const toolInput = payload.tool_input;
    if (!toolInput) {
      return;
    }

    const filePath = toolInput.file_path as string | undefined;
    if (!filePath) {
      return;
    }

    // Read the file content after the change
    const afterContent = this.readFileContent(filePath);

    // Determine action based on tool and file existence
    let action: 'created' | 'modified' | 'deleted' = 'modified';
    if (toolName === 'Write') {
      // Check if we have this file in our recent changes
      const existingChange = this.fileChanges.find(c => c.filePath === filePath);
      action = existingChange ? 'modified' : 'created';
    }

    // Get git information
    const projectPath = payload.working_directory || this.getProjectPath(filePath);
    const isGitRepo = this.isGitRepository(projectPath);
    let gitStatus: GitFileStatus | null = null;

    if (isGitRepo) {
      gitStatus = this.getGitFileStatus(projectPath, filePath);
    }

    // Get before content from previous change or git
    let beforeContent: string | null = null;
    const previousChange = this.fileChanges.find(c => c.filePath === filePath);
    if (previousChange && previousChange.afterContent) {
      beforeContent = previousChange.afterContent;
    } else if (isGitRepo) {
      beforeContent = this.getGitFileContent(projectPath, filePath);
    }

    // Generate diff
    const diffLines = this.generateDiff(beforeContent, afterContent);

    // Create file change record
    const fileChange: FileChange = {
      id: this.generateId(),
      sessionId: payload.session_id || null,
      projectPath: projectPath || null,
      filePath,
      action,
      toolName: toolName as 'Edit' | 'Write',
      timestamp: new Date().toISOString(),
      beforeContent: this.truncateContent(beforeContent),
      afterContent: this.truncateContent(afterContent),
      diffLines,
      isGitRepo,
      gitStatus,
      canRollback: isGitRepo || beforeContent !== null,
    };

    // Add to buffer
    this.addFileChange(fileChange);

    // Emit event for real-time updates
    this.emit('file:changed', fileChange);
    this.notifyRenderer('live-monitor:file-changed', fileChange);

    logger.debug(`File change recorded: ${action} ${filePath}`);
  }

  // ============================================================================
  // FILE CHANGE MANAGEMENT
  // ============================================================================

  /**
   * Add a file change to the rolling buffer
   */
  private addFileChange(change: FileChange): void {
    this.fileChanges.unshift(change);

    // Keep only the last MAX_FILE_CHANGES
    if (this.fileChanges.length > MAX_FILE_CHANGES) {
      this.fileChanges = this.fileChanges.slice(0, MAX_FILE_CHANGES);
    }
  }

  /**
   * Get recent file changes
   */
  getRecentFileChanges(limit = 50, sessionId?: string): FileChange[] {
    let changes = this.fileChanges;

    if (sessionId) {
      changes = changes.filter(c => c.sessionId === sessionId);
    }

    return changes.slice(0, limit);
  }

  /**
   * Get file change by ID
   */
  getFileChange(id: string): FileChange | null {
    return this.fileChanges.find(c => c.id === id) || null;
  }

  /**
   * Get file change stats
   */
  getStats(): FileChangeStats {
    const byAction: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const recentFiles: string[] = [];

    for (const change of this.fileChanges) {
      byAction[change.action] = (byAction[change.action] || 0) + 1;

      const project = change.projectPath || 'unknown';
      byProject[project] = (byProject[project] || 0) + 1;

      if (recentFiles.length < 10 && !recentFiles.includes(change.filePath)) {
        recentFiles.push(change.filePath);
      }
    }

    return {
      totalChanges: this.fileChanges.length,
      byAction,
      byProject,
      recentFiles,
    };
  }

  /**
   * Clear all file changes
   */
  clear(): void {
    this.fileChanges = [];
    this.emit('changes:cleared');
  }

  // ============================================================================
  // GIT INTEGRATION
  // ============================================================================

  /**
   * Check if a directory is a git repository
   */
  private isGitRepository(projectPath: string | null): boolean {
    if (!projectPath) return false;

    try {
      const gitDir = path.join(projectPath, '.git');
      return fs.existsSync(gitDir);
    } catch {
      return false;
    }
  }

  /**
   * Get git status for a specific file
   */
  private getGitFileStatus(projectPath: string | null, filePath: string): GitFileStatus | null {
    if (!projectPath) return null;

    try {
      const relativePath = path.relative(projectPath, filePath);
      const result = execSync(`git status --porcelain "${relativePath}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (!result.trim()) {
        return {
          staged: false,
          modified: false,
          untracked: false,
          deleted: false,
        };
      }

      const status = result.trim().substring(0, 2);
      return {
        staged: status[0] !== ' ' && status[0] !== '?',
        modified: status[1] === 'M' || status[0] === 'M',
        untracked: status === '??',
        deleted: status[1] === 'D' || status[0] === 'D',
      };
    } catch (error) {
      logger.debug(`Failed to get git status for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get the original content of a file from git
   */
  private getGitFileContent(projectPath: string | null, filePath: string): string | null {
    if (!projectPath) return null;

    try {
      const relativePath = path.relative(projectPath, filePath);
      const result = execSync(`git show HEAD:"${relativePath}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: MAX_CONTENT_SIZE,
      });
      return result;
    } catch {
      // File might not exist in git yet
      return null;
    }
  }

  /**
   * Rollback a file to its previous state
   */
  rollbackFile(id: string): RollbackResult {
    const change = this.getFileChange(id);
    if (!change) {
      return {
        success: false,
        message: 'File change not found',
        filePath: '',
        method: 'none',
      };
    }

    const { filePath, projectPath, isGitRepo, beforeContent } = change;

    // Try git checkout first if it's a git repo
    if (isGitRepo && projectPath) {
      try {
        const relativePath = path.relative(projectPath, filePath);
        execSync(`git checkout HEAD -- "${relativePath}"`, {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5000,
        });

        logger.info(`Rolled back file via git: ${filePath}`);
        this.emit('file:rolledback', { id, filePath, method: 'git' });
        this.notifyRenderer('live-monitor:file-rolledback', { id, filePath, method: 'git' });

        return {
          success: true,
          message: `File restored from git: ${filePath}`,
          filePath,
          method: 'git',
        };
      } catch (error) {
        logger.warn(`Git checkout failed for ${filePath}, trying content restore:`, error);
      }
    }

    // Fall back to restoring from stored content
    if (beforeContent !== null) {
      try {
        fs.writeFileSync(filePath, beforeContent, 'utf-8');

        logger.info(`Rolled back file via content restore: ${filePath}`);
        this.emit('file:rolledback', { id, filePath, method: 'content' });
        this.notifyRenderer('live-monitor:file-rolledback', { id, filePath, method: 'content' });

        return {
          success: true,
          message: `File restored from previous content: ${filePath}`,
          filePath,
          method: 'content',
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to restore file content: ${filePath}`, error);
        return {
          success: false,
          message: `Failed to restore file: ${errorMessage}`,
          filePath,
          method: 'none',
        };
      }
    }

    return {
      success: false,
      message: 'No rollback method available for this file',
      filePath,
      method: 'none',
    };
  }

  /**
   * Get git diff for a file
   */
  getGitDiff(projectPath: string, filePath: string): string | null {
    if (!this.isGitRepository(projectPath)) {
      return null;
    }

    try {
      const relativePath = path.relative(projectPath, filePath);
      const result = execSync(`git diff "${relativePath}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: MAX_CONTENT_SIZE,
      });
      return result;
    } catch (error) {
      logger.debug(`Failed to get git diff for ${filePath}:`, error);
      return null;
    }
  }

  // ============================================================================
  // DIFF GENERATION
  // ============================================================================

  /**
   * Generate a simple line-by-line diff
   */
  private generateDiff(before: string | null, after: string | null): DiffLine[] {
    const diffLines: DiffLine[] = [];

    if (before === null && after === null) {
      return diffLines;
    }

    if (before === null) {
      // All lines are new
      const lines = (after || '').split('\n');
      lines.forEach((line, i) => {
        diffLines.push({
          type: 'added',
          content: line,
          oldLineNumber: null,
          newLineNumber: i + 1,
        });
      });
      return diffLines;
    }

    if (after === null) {
      // All lines are removed
      const lines = before.split('\n');
      lines.forEach((line, i) => {
        diffLines.push({
          type: 'removed',
          content: line,
          oldLineNumber: i + 1,
          newLineNumber: null,
        });
      });
      return diffLines;
    }

    // Simple Myers-like diff algorithm
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');

    // Create a map of line content to positions in the after array
    const afterMap = new Map<string, number[]>();
    afterLines.forEach((line, i) => {
      const positions = afterMap.get(line) || [];
      positions.push(i);
      afterMap.set(line, positions);
    });

    let oldLineNum = 1;
    let newLineNum = 1;
    let beforeIdx = 0;
    let afterIdx = 0;

    while (beforeIdx < beforeLines.length || afterIdx < afterLines.length) {
      if (beforeIdx >= beforeLines.length) {
        // Remaining lines are additions
        diffLines.push({
          type: 'added',
          content: afterLines[afterIdx],
          oldLineNumber: null,
          newLineNumber: newLineNum++,
        });
        afterIdx++;
      } else if (afterIdx >= afterLines.length) {
        // Remaining lines are removals
        diffLines.push({
          type: 'removed',
          content: beforeLines[beforeIdx],
          oldLineNumber: oldLineNum++,
          newLineNumber: null,
        });
        beforeIdx++;
      } else if (beforeLines[beforeIdx] === afterLines[afterIdx]) {
        // Lines match
        diffLines.push({
          type: 'unchanged',
          content: beforeLines[beforeIdx],
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
        beforeIdx++;
        afterIdx++;
      } else {
        // Check if the before line exists later in after
        const positions = afterMap.get(beforeLines[beforeIdx]) || [];
        const laterPosition = positions.find(p => p > afterIdx);

        if (laterPosition !== undefined) {
          // The before line exists later, so current after lines are additions
          diffLines.push({
            type: 'added',
            content: afterLines[afterIdx],
            oldLineNumber: null,
            newLineNumber: newLineNum++,
          });
          afterIdx++;
        } else {
          // The before line was removed
          diffLines.push({
            type: 'removed',
            content: beforeLines[beforeIdx],
            oldLineNumber: oldLineNum++,
            newLineNumber: null,
          });
          beforeIdx++;
        }
      }
    }

    return diffLines;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Read file content safely
   */
  private readFileContent(filePath: string): string | null {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_CONTENT_SIZE) {
        logger.debug(`File too large to read: ${filePath} (${stats.size} bytes)`);
        return null;
      }
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Truncate content to max size
   */
  private truncateContent(content: string | null): string | null {
    if (content === null) return null;
    if (content.length <= MAX_CONTENT_SIZE) return content;
    return content.substring(0, MAX_CONTENT_SIZE) + '\n... (truncated)';
  }

  /**
   * Extract project path from file path
   */
  private getProjectPath(filePath: string): string | null {
    try {
      let current = path.dirname(filePath);
      const root = path.parse(current).root;

      while (current !== root) {
        if (fs.existsSync(path.join(current, '.git'))) {
          return current;
        }
        if (fs.existsSync(path.join(current, 'package.json'))) {
          return current;
        }
        current = path.dirname(current);
      }

      return path.dirname(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `fc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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

let liveMonitor: LiveMonitorService | null = null;

export function getLiveMonitor(): LiveMonitorService {
  if (!liveMonitor) {
    liveMonitor = new LiveMonitorService();
  }
  return liveMonitor;
}

export function startLiveMonitor(): void {
  const monitor = getLiveMonitor();
  monitor.start();
}

export function stopLiveMonitor(): void {
  if (liveMonitor) {
    liveMonitor.stop();
  }
}

export { LiveMonitorService };
