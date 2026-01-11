// ============================================================================
// SESSION MANAGER SERVICE
// ============================================================================

import fs from 'fs/promises';
import { existsSync, watchFile, unwatchFile } from 'fs';
import path from 'path';
import os from 'os';
import {
  upsertSession,
  storeMessages,
  getSession,
  getAllSessions,
  getSessionMessages,
  getAnalytics,
  logActivity,
} from '../database/index.js';
import { sendToRenderer } from '../window.js';
import { Logger } from './logger.js';
import {
  SESSION_SCAN_INTERVAL_MS,
  NEW_SESSION_THRESHOLD_MS,
  LIVE_SESSION_THRESHOLD_MS,
  SESSION_FILE_WATCH_INTERVAL_MS,
  LIVE_SESSION_CHECK_THRESHOLD_MS,
  COST_PER_MILLION_INPUT_TOKENS,
  COST_PER_MILLION_OUTPUT_TOKENS,
  TOKEN_RATIO_ASSUMPTION,
} from '../../shared/constants.js';
import type { Session, SessionMessage } from '../../shared/types/index.js';

const logger = new Logger('SessionManager');

type StatusCallback = (status: string, message?: string, progress?: { current: number; total: number }) => void;

let sessionManager: SessionManagerInstance | null = null;

// ============================================================================
// SESSION MANAGER CLASS
// ============================================================================

class SessionManagerInstance {
  private claudeDir: string;
  private statusCallback: StatusCallback;
  private watchedSessions = new Map<string, boolean>();
  private knownSessionFiles = new Set<string>();
  private sessionWatchInterval: NodeJS.Timeout | null = null;

  constructor(statusCallback: StatusCallback) {
    this.claudeDir = path.join(os.homedir(), '.claude', 'projects');
    this.statusCallback = statusCallback;
  }

  async init(): Promise<void> {
    logger.info('Initializing session manager...');

    if (!existsSync(this.claudeDir)) {
      logger.warn(`Claude directory not found: ${this.claudeDir}`);
      this.statusCallback('complete', 'No sessions found');
      return;
    }

    try {
      await this.scanSessions();
      this.startSessionWatching();
      logger.info('Session manager initialized');
    } catch (error) {
      logger.error('Failed to initialize session manager', error);
      this.statusCallback('error', 'Failed to scan sessions');
    }
  }

  private async scanSessions(): Promise<void> {
    this.statusCallback('scanning', 'Scanning for sessions...');

    const files = await this.findSessionFiles(this.claudeDir);
    const total = files.length;

    logger.info(`Found ${total} session files`);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.statusCallback('scanning', `Processing ${path.basename(file.path)}`, { current: i + 1, total });

      try {
        await this.processSessionFile(file.path, file.mtime);
        this.knownSessionFiles.add(file.path);
      } catch (error) {
        logger.error(`Failed to process session file: ${file.path}`, error);
      }
    }

    this.statusCallback('complete', `Scanned ${total} sessions`);
  }

  private async findSessionFiles(dir: string): Promise<{ path: string; mtime: number }[]> {
    const files: { path: string; mtime: number }[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const subFiles = await this.findSessionFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.name.endsWith('.jsonl')) {
          try {
            const stats = await fs.stat(fullPath);
            files.push({ path: fullPath, mtime: stats.mtimeMs });
          } catch (error) {
            logger.debug('Could not stat session file', {
              filePath: fullPath,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    } catch (error) {
      logger.debug('Could not read directory', {
        dir,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return files.sort((a, b) => b.mtime - a.mtime);
  }

  private async processSessionFile(filePath: string, mtime: number, forceReparse: boolean = false): Promise<void> {
    const filename = path.basename(filePath, '.jsonl');
    const projectName = path.basename(path.dirname(filePath));

    // Check if we need to update this session (unless force reparse is requested)
    const existingSession = getSession(filename);

    // Force reparse if the session exists but has no token data (legacy sessions
    // scanned before token extraction was implemented). This ensures all sessions
    // eventually get their token data populated.
    const needsTokenReparse = existingSession && existingSession.tokenCount === 0 && existingSession.messageCount > 0;

    if (!forceReparse && !needsTokenReparse && existingSession?.fileMtime === mtime) {
      return; // Session hasn't changed and has valid token data
    }

    const { messages, tokenStats, costUSD } = await this.parseSessionFileWithStats(filePath);

    // Calculate session stats
    let startTime: string | null = null;
    let endTime: string | null = null;

    for (const msg of messages) {
      if (msg.timestamp) {
        if (!startTime || msg.timestamp < startTime) startTime = msg.timestamp;
        if (!endTime || msg.timestamp > endTime) endTime = msg.timestamp;
      }
    }

    // Calculate total tokens
    const totalTokens = tokenStats.inputTokens + tokenStats.outputTokens;

    // Use actual cost from JSONL if available, otherwise estimate
    const totalCost = costUSD > 0 ? costUSD : this.estimateCost(totalTokens);

    // Upsert session with token breakdown
    upsertSession({
      id: filename,
      projectName,
      filePath,
      startTime,
      endTime,
      messageCount: messages.length,
      tokenCount: totalTokens,
      cost: totalCost,
      status: 'completed',
      fileMtime: mtime,
      inputTokens: tokenStats.inputTokens,
      outputTokens: tokenStats.outputTokens,
      cacheWriteTokens: tokenStats.cacheWriteTokens,
      cacheReadTokens: tokenStats.cacheReadTokens,
    });

    // Store messages
    storeMessages(filename, messages);
  }

  private async parseSessionFileWithStats(filePath: string): Promise<{
    messages: Partial<SessionMessage>[];
    tokenStats: {
      inputTokens: number;
      outputTokens: number;
      cacheWriteTokens: number;
      cacheReadTokens: number;
    };
    costUSD: number;
  }> {
    const messages: Partial<SessionMessage>[] = [];
    let tokenStats = {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };
    let costUSD = 0;

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Use regex-based token extraction for robustness (like the JS version)
      // This finds all token counts regardless of JSON structure
      const sumTokens = (regex: RegExp): number => {
        const matches = content.match(regex) || [];
        return matches.reduce((acc, m) => {
          const numMatch = m.match(/\d+/);
          return acc + (numMatch ? parseInt(numMatch[0], 10) : 0);
        }, 0);
      };

      tokenStats = {
        inputTokens: sumTokens(/"input_tokens"\s*:\s*\d+/g),
        outputTokens: sumTokens(/"output_tokens"\s*:\s*\d+/g),
        cacheWriteTokens: sumTokens(/"cache_creation_input_tokens"\s*:\s*\d+/g),
        cacheReadTokens: sumTokens(/"cache_read_input_tokens"\s*:\s*\d+/g),
      };

      // Extract cost using regex as well for robustness
      const costMatches = content.match(/"costUSD"\s*:\s*[\d.]+/g) || [];
      costUSD = costMatches.reduce((acc, m) => {
        const numMatch = m.match(/[\d.]+$/);
        return acc + (numMatch ? parseFloat(numMatch[0]) : 0);
      }, 0);

      // Parse messages line by line
      const lines = content.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const parsed = this.parseEntry(entry);
          if (parsed) {
            messages.push(parsed);
          }
        } catch (error) {
          // Skip malformed JSON lines - this is expected for partially written files
          logger.debug('Skipped malformed JSON line in session file', {
            filePath,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } catch (error) {
      logger.error(`Failed to parse session file: ${filePath}`, error);
    }

    return { messages, tokenStats, costUSD };
  }

  private async parseSessionFile(filePath: string): Promise<Partial<SessionMessage>[]> {
    const { messages } = await this.parseSessionFileWithStats(filePath);
    return messages;
  }

  private parseEntry(entry: any): Partial<SessionMessage> | null {
    let role = entry.type || entry.role || 'unknown';
    let content = '';
    let tokenCount = 0;

    // Extract token count from usage data
    if (entry.usage) {
      tokenCount = (entry.usage.input_tokens ?? 0) + (entry.usage.output_tokens ?? 0);
    }

    // Handle different entry types
    if (entry.type === 'thinking' || entry.thinking) {
      role = 'thinking';
      content = entry.thinking || entry.content || '';
    } else if (entry.type === 'tool_use' || entry.tool_use) {
      role = 'tool';
      const tool = entry.tool_use || entry;
      content = `[Tool: ${tool.name || 'unknown'}]\n${JSON.stringify(tool.input || {}, null, 2)}`;
    } else if (entry.type === 'tool_result' || entry.tool_result) {
      role = 'tool_result';
      const result = entry.tool_result || entry;
      content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content || result, null, 2);
    } else if (entry.message !== undefined) {
      content = this.extractContent(entry.message);
    } else if (entry.content) {
      content = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
    }

    if (!content.trim()) return null;

    return {
      role,
      content,
      timestamp: entry.timestamp,
      tokenCount,
    };
  }

  private extractContent(message: any): string {
    if (typeof message === 'string') return message;

    if (Array.isArray(message)) {
      return message
        .map(block => {
          if (typeof block === 'string') return block;
          if (block.type === 'text') return block.text || '';
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (typeof message === 'object') {
      if (message.content) return this.extractContent(message.content);
      if (message.text) return message.text;
    }

    return '';
  }

  /**
   * Estimates the cost of tokens when actual cost is not available from the session file.
   * @param tokens - Total number of tokens
   * @returns Estimated cost in USD
   */
  private estimateCost(tokens: number): number {
    // Assumes a split between input and output tokens when actual breakdown is unknown
    const inputCost = (tokens * TOKEN_RATIO_ASSUMPTION * COST_PER_MILLION_INPUT_TOKENS) / 1_000_000;
    const outputCost = (tokens * TOKEN_RATIO_ASSUMPTION * COST_PER_MILLION_OUTPUT_TOKENS) / 1_000_000;
    return inputCost + outputCost;
  }

  // ============================================================================
  // SESSION WATCHING
  // ============================================================================

  private startSessionWatching(): void {
    if (this.sessionWatchInterval) return;

    this.sessionWatchInterval = setInterval(() => {
      this.scanForNewSessions();
    }, SESSION_SCAN_INTERVAL_MS);
  }

  private async scanForNewSessions(): Promise<void> {
    if (!existsSync(this.claudeDir)) return;

    try {
      const files = await this.findSessionFiles(this.claudeDir);

      for (const file of files) {
        if (!this.knownSessionFiles.has(file.path)) {
          this.knownSessionFiles.add(file.path);

          // Check if recently modified
          const age = Date.now() - file.mtime;
          if (age < NEW_SESSION_THRESHOLD_MS) {
            this.notifyNewSession(file.path);
            this.startWatchingSessionFile(file.path);
          }
        }
      }
    } catch (error) {
      logger.error('Error scanning for new sessions', error);
    }
  }

  private notifyNewSession(filePath: string): void {
    const projectName = path.basename(path.dirname(filePath));
    const filename = path.basename(filePath, '.jsonl');
    const isAgent = filename.startsWith('agent-');

    // Log activity for session detection
    logActivity(
      'session_detected',
      filename,
      `New ${isAgent ? 'subagent' : 'user'} session detected: ${filename}`,
      { projectName, filePath, isAgent }
    );

    sendToRenderer('session-detected', {
      path: filePath,
      projectName,
      sessionType: isAgent ? 'subagent' : 'user',
      sessionId: filename,
      timestamp: Date.now(),
    });
  }

  private startWatchingSessionFile(filePath: string): void {
    if (this.watchedSessions.has(filePath)) return;

    let lastSize = 0;

    watchFile(filePath, { interval: SESSION_FILE_WATCH_INTERVAL_MS }, async () => {
      try {
        const stats = await fs.stat(filePath);
        if (stats.size !== lastSize) {
          lastSize = stats.size;
          const messages = await this.parseSessionFile(filePath);

          sendToRenderer('subagent-session-update', {
            path: filePath,
            messages,
            isLive: true,
          });
        }
      } catch (error) {
        logger.debug('Session file watch error (file may have been deleted)', {
          filePath,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.watchedSessions.set(filePath, true);
  }

  stopWatching(): void {
    if (this.sessionWatchInterval) {
      clearInterval(this.sessionWatchInterval);
      this.sessionWatchInterval = null;
    }

    for (const [filePath] of this.watchedSessions) {
      try {
        unwatchFile(filePath);
      } catch (error) {
        logger.debug('Could not unwatch session file', {
          filePath,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    this.watchedSessions.clear();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  getAllSessions(): Session[] {
    return getAllSessions();
  }

  getSession(sessionId: string): Session | null {
    return getSession(sessionId);
  }

  async getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
    // First try database
    const dbMessages = getSessionMessages(sessionId);
    if (dbMessages.length > 0) {
      return dbMessages;
    }

    // If no messages in database, try to read from file directly
    const session = getSession(sessionId);
    if (session?.filePath && existsSync(session.filePath)) {
      try {
        const parsedMessages = await this.parseSessionFile(session.filePath);
        // Store for future queries
        if (parsedMessages.length > 0) {
          storeMessages(sessionId, parsedMessages);
        }
        // Return as SessionMessage with required fields
        return parsedMessages.map((msg, index) => ({
          id: index,
          sessionId,
          messageIndex: index,
          role: msg.role as any ?? 'unknown',
          content: msg.content ?? '',
          timestamp: msg.timestamp ?? null,
          tokenCount: msg.tokenCount ?? 0,
          toolName: msg.toolName ?? null,
          toolInput: msg.toolInput ?? null,
          toolResult: msg.toolResult ?? null,
          createdAt: new Date().toISOString(),
        }));
      } catch (error) {
        logger.error(`Failed to read messages from file for session ${sessionId}`, error);
      }
    }

    return [];
  }

  getAnalytics() {
    return getAnalytics();
  }

  getLiveSessions(): Session[] {
    // Return sessions modified within the threshold
    const threshold = Date.now() - LIVE_SESSION_THRESHOLD_MS;
    return this.getAllSessions().filter(s => {
      if (!s.endTime) return false;
      return new Date(s.endTime).getTime() > threshold;
    });
  }
  async getSessionRawEntries(sessionId: string): Promise<unknown[]> {
    const session = getSession(sessionId);
    if (!session?.filePath || !existsSync(session.filePath)) {
      return [];
    }

    try {
      const content = await fs.readFile(session.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.trim());
      const entries: unknown[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          entries.push(entry);
        } catch (error) {
          // Skip malformed JSON lines - this is expected for partially written files
          logger.debug('Skipped malformed JSON line in raw entries', {
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      return entries;
    } catch (error) {
      logger.error(`Failed to read raw entries for session ${sessionId}`, error);
      return [];
    }
  }

  async refreshSessionTokens(sessionId: string): Promise<Session | null> {
    const session = getSession(sessionId);
    if (!session?.filePath || !existsSync(session.filePath)) {
      return session;
    }

    try {
      const stats = await fs.stat(session.filePath);
      // Force reparse to ensure token data is recalculated
      await this.processSessionFile(session.filePath, stats.mtimeMs, true);
      return getSession(sessionId);
    } catch (error) {
      logger.error(`Failed to refresh session tokens for ${sessionId}`, error);
      return session;
    }
  }

  isSessionLive(sessionId: string): boolean {
    const session = getSession(sessionId);
    if (!session?.filePath || !existsSync(session.filePath)) {
      return false;
    }

    // Check if file was modified in the last 30 seconds using the cached mtime from session
    // This avoids synchronous file operations
    if (session.fileMtime) {
      return Date.now() - session.fileMtime < LIVE_SESSION_CHECK_THRESHOLD_MS;
    }
    return false;
  }

  async isSessionLiveAsync(sessionId: string): Promise<boolean> {
    const session = getSession(sessionId);
    if (!session?.filePath || !existsSync(session.filePath)) {
      return false;
    }

    try {
      const stats = await fs.stat(session.filePath);
      return Date.now() - stats.mtimeMs < LIVE_SESSION_CHECK_THRESHOLD_MS;
    } catch (error) {
      logger.debug('Could not stat session file for live check', {
        sessionId,
        filePath: session.filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function initSessionManager(statusCallback: StatusCallback): void {
  sessionManager = new SessionManagerInstance(statusCallback);
}

export function getSessionManager(): SessionManagerInstance | null {
  return sessionManager;
}
