// ============================================================================
// SESSION IPC HANDLERS
// ============================================================================

import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../../services/logger.js';
import { withContext } from '../utils.js';
import { getSessionManager } from '../../services/sessionManager.js';
import * as db from '../../database/index.js';
import * as sessionSummaries from '../../database/sessionSummaries/index.js';
import { getDatabase } from '../../database/connection.js';
import { type SessionRow } from '../../database/mappers.js';

const logger = new Logger('IPC:Sessions');

// Helper to find the most recent session from the user's ~/.claude/projects/ directory
interface ClaudeSessionFile {
  sessionId: string;
  projectPath: string;
  filePath: string;
  modifiedTime: Date;
  firstPrompt?: string;
}

function findMostRecentClaudeSession(): ClaudeSessionFile | null {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');

  if (!fs.existsSync(claudeDir)) {
    logger.debug('Claude projects directory not found', { claudeDir });
    return null;
  }

  let mostRecent: ClaudeSessionFile | null = null;

  try {
    // Get all project directories
    const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(claudeDir, d.name));

    for (const projectDir of projectDirs) {
      // Get all .jsonl files (session files) in the project directory
      const sessionFiles = fs.readdirSync(projectDir, { withFileTypes: true })
        .filter(f => f.isFile() && f.name.endsWith('.jsonl') && !f.name.startsWith('agent-'))
        .map(f => {
          const filePath = path.join(projectDir, f.name);
          const stats = fs.statSync(filePath);
          return {
            name: f.name,
            filePath,
            modifiedTime: stats.mtime,
          };
        });

      for (const file of sessionFiles) {
        if (!mostRecent || file.modifiedTime > mostRecent.modifiedTime) {
          // Extract session ID from filename (remove .jsonl extension)
          const sessionId = file.name.replace('.jsonl', '');

          // Extract project path from directory name
          // Directory format: C--Users-buzzkill-Documents-project -> C:\Users\buzzkill\Documents\project
          const projectDirName = path.basename(projectDir);
          let projectPath = projectDirName;

          // Try to reconstruct the original path
          // Format is drive letter followed by dashes for separators
          if (process.platform === 'win32') {
            // Windows: C--Users-... -> C:\Users\...
            const match = projectDirName.match(/^([A-Z])--(.*)/);
            if (match) {
              projectPath = match[1] + ':\\' + match[2].replace(/-/g, '\\');
            }
          } else {
            // Unix: -home-user-... -> /home/user/...
            if (projectDirName.startsWith('-')) {
              projectPath = projectDirName.replace(/-/g, '/');
            }
          }

          // Try to read the first user prompt from the session file
          let firstPrompt: string | undefined;
          try {
            const content = fs.readFileSync(file.filePath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            for (const line of lines) {
              try {
                const entry = JSON.parse(line);
                if (entry.type === 'human' || entry.type === 'user') {
                  // Extract the text content
                  if (typeof entry.message === 'string') {
                    firstPrompt = entry.message.slice(0, 100);
                    break;
                  } else if (entry.message?.content) {
                    if (typeof entry.message.content === 'string') {
                      firstPrompt = entry.message.content.slice(0, 100);
                      break;
                    } else if (Array.isArray(entry.message.content)) {
                      const textBlock = entry.message.content.find((b: { type: string }) => b.type === 'text');
                      if (textBlock?.text) {
                        firstPrompt = textBlock.text.slice(0, 100);
                        break;
                      }
                    }
                  }
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          } catch {
            // Ignore read errors
          }

          mostRecent = {
            sessionId,
            projectPath,
            filePath: file.filePath,
            modifiedTime: file.modifiedTime,
            firstPrompt,
          };
        }
      }
    }
  } catch (error) {
    logger.error('Error scanning Claude sessions directory', { error });
  }

  return mostRecent;
}

// Helper to get sessions from the main sessions table for a project
function getSessionsFromMainTable(projectPath: string, limit: number) {
  const database = getDatabase();

  // Convert project path to the format stored in sessions.project_name
  // e.g., "C:\Users\buzzkill\Documents\clausitron" -> "C--Users-buzzkill-Documents-clausitron"
  const normalizedProjectName = projectPath
    .replace(/\\/g, '-')
    .replace(/:/g, '-')
    .replace(/\//g, '-');

  // Query sessions table by project_name (stored as path with dashes)
  // Filter to only user sessions (not agent sessions which start with 'agent-')
  const rows = database.prepare(`
    SELECT * FROM sessions
    WHERE project_name = ?
      AND (archived = 0 OR archived IS NULL)
      AND id NOT LIKE 'agent-%'
      AND message_count > 0
    ORDER BY start_time DESC
    LIMIT ?
  `).all(normalizedProjectName, limit) as SessionRow[];

  // Map to the format expected by the modal
  return rows.map(row => ({
    sessionId: row.id,
    cwd: projectPath,
    messageCount: row.message_count ?? 0,
    costUsd: row.cost ?? 0,
    startedAt: row.start_time ?? new Date().toISOString(),
    lastActive: row.end_time ?? row.start_time ?? new Date().toISOString(),
    firstPrompt: row.summary ?? undefined,
  }));
}

export function registerSessionHandlers(): void {
  ipcMain.handle('get-sessions', withContext('get-sessions', async () => {
    const sessionManager = getSessionManager();
    return sessionManager?.getAllSessions() ?? [];
  }));

  ipcMain.handle('get-session', withContext('get-session', async (_, id: string) => {
    const sessionManager = getSessionManager();
    return sessionManager?.getSession(id) ?? null;
  }));

  ipcMain.handle('get-session-messages', withContext('get-session-messages', async (_, id: string) => {
    const sessionManager = getSessionManager();
    return await sessionManager?.getSessionMessages(id) ?? [];
  }));

  ipcMain.handle('get-active-sessions', withContext('get-active-sessions', async () => {
    return db.getActiveSessions();
  }));

  ipcMain.handle('get-favorite-sessions', withContext('get-favorite-sessions', async () => {
    return db.getFavoriteSessions();
  }));

  ipcMain.handle('get-archived-sessions', withContext('get-archived-sessions', async () => {
    return db.getArchivedSessions();
  }));

  ipcMain.handle('toggle-favorite', withContext('toggle-favorite', async (_, id: string) => {
    db.toggleFavorite(id);
    return true;
  }));

  ipcMain.handle('toggle-archive', withContext('toggle-archive', async (_, id: string) => {
    db.toggleArchive(id);
    return true;
  }));

  ipcMain.handle('delete-session', withContext('delete-session', async (_, id: string) => {
    db.deleteSession(id);
    return true;
  }));

  ipcMain.handle('get-live-sessions', withContext('get-live-sessions', async () => {
    const sessionManager = getSessionManager();
    return sessionManager?.getLiveSessions() ?? [];
  }));

  ipcMain.handle('get-session-raw-entries', withContext('get-session-raw-entries', async (_, id: string) => {
    const sessionManager = getSessionManager();
    return await sessionManager?.getSessionRawEntries(id) ?? [];
  }));

  ipcMain.handle('refresh-session', withContext('refresh-session', async (_, id: string) => {
    const sessionManager = getSessionManager();
    return await sessionManager?.refreshSessionTokens(id) ?? null;
  }));

  ipcMain.handle('is-session-live', withContext('is-session-live', async (_, id: string) => {
    const sessionManager = getSessionManager();
    return sessionManager?.isSessionLive(id) ?? false;
  }));

  ipcMain.handle('recalculate-session-costs', withContext('recalculate-session-costs', async () => {
    const sessionManager = getSessionManager();
    if (!sessionManager) {
      return { success: false, error: 'Session manager not initialized', count: 0 };
    }
    try {
      const count = await sessionManager.recalculateAllCosts();
      return { success: true, count };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', count: 0 };
    }
  }));

  // Session summary handlers (for phase5to8Api)
  ipcMain.handle('session:get', withContext('session:get', async (_, sessionId: string) => {
    return sessionSummaries.getSessionSummaryBySessionId(sessionId);
  }));

  ipcMain.handle('session:getRecent', withContext('session:getRecent', async (_, limit?: number) => {
    return sessionSummaries.getRecentSessions(limit ?? 50);
  }));

  ipcMain.handle('session:getForProject', withContext('session:getForProject', async (_, projectPath: string, limit?: number) => {
    // First try session_summaries table
    try {
      const summaries = sessionSummaries.getRecentSessionsForProject(projectPath, limit ?? 5);
      if (summaries.length > 0) {
        // Map session summaries to the expected format
        return summaries.map(s => ({
          sessionId: s.sessionId,
          cwd: s.projectPath,
          messageCount: s.toolCalls ?? 0,
          costUsd: s.costUsd ?? 0,
          startedAt: s.startedAt,
          lastActive: s.endedAt ?? s.startedAt,
          firstPrompt: s.title ?? s.lastPrompt ?? undefined,
        }));
      }
    } catch (error) {
      logger.debug('session_summaries table not available, using fallback', { error });
    }

    // Fallback to main sessions table
    return getSessionsFromMainTable(projectPath, limit ?? 5);
  }));

  ipcMain.handle('session:search', withContext('session:search', async (_, query: string, projectPath?: string, limit?: number) => {
    return sessionSummaries.searchSessions(query, projectPath, limit ?? 20);
  }));

  // Get most recent session for quick restart
  // Scans the user's ~/.claude/projects/ directory for the most recently modified session file
  ipcMain.handle('session:getMostRecent', withContext('session:getMostRecent', async () => {
    // Scan the user's Claude sessions directory directly
    const mostRecent = findMostRecentClaudeSession();

    if (mostRecent) {
      logger.debug('Found most recent Claude session', {
        sessionId: mostRecent.sessionId,
        projectPath: mostRecent.projectPath,
        modifiedTime: mostRecent.modifiedTime.toISOString(),
      });

      return {
        sessionId: mostRecent.sessionId,
        cwd: mostRecent.projectPath,
        messageCount: 0, // Not available from file scan
        costUsd: 0, // Not available from file scan
        startedAt: mostRecent.modifiedTime.toISOString(),
        lastActive: mostRecent.modifiedTime.toISOString(),
        firstPrompt: mostRecent.firstPrompt,
      };
    }

    logger.debug('No recent Claude sessions found in ~/.claude/projects/');
    return null;
  }));

  logger.info('Session handlers registered');
}
