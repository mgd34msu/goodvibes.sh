# Remediation Plan

**Total Tasks**: 15
**Estimated Agents**: 4 (max 6 concurrent)

## Execution Rules

- **Max concurrent agents**: 6
- **Agent type**: goodvibes background ONLY
- **Context**: Fresh context per task (no accumulated state)
- **Tool priority**: MCP tools > bash (mandatory)
- **Monitoring**: None - agents self-report via SubagentStop hook

## Task Checklist

### Wave 1: Critical [P0]

- [ ] TASK-001: Fix SessionManager memory leak - add cleanup for deleted file watchers | Severity: critical | Files: `src/main/services/sessionManager/service.ts`
  - Add `cleanupDeletedSessions()` method to periodically check for deleted files
  - Call `unwatchFile()` and remove from `watchedSessions` Map when files don't exist
  - Call cleanup from `scanForNewSessions()` every scan interval

- [ ] TASK-002: Optimize getAnalytics() with SQL aggregations instead of JS filters | Severity: critical | Files: `src/main/database/index.ts`
  - Replace `SELECT *` with single aggregation query
  - Use SQL `COUNT()`, `SUM(CASE WHEN...)` instead of `.filter()` in JavaScript
  - Remove in-memory session array

- [ ] TASK-003: Fix all 12 TypeScript compilation errors | Severity: critical | Files: Multiple
  - `src/renderer/components/common/ErrorFallback.tsx` - type narrow unknown error
  - `src/renderer/components/views/AgentsView/AgentsView.test.tsx` - fix HTMLElement | undefined
  - `src/renderer/components/views/CommandsView/hooks.ts` - fix 'content' property access
  - `src/renderer/components/views/SkillsView/hooks.ts` - fix 'content' property access
  - `src/renderer/components/views/HooksView/index.tsx` - remove unused variables
  - `src/renderer/main.tsx` - fix error handler type

### Wave 2: High [P1]

- [ ] TASK-004: Add database indexes for frequently queried columns | Severity: high | Files: `src/main/database/schema.ts`, `src/main/database/index.ts`
  - Add index on `sessions.start_time`
  - Add index on `sessions.favorite`
  - Add composite index on `messages(session_id, message_index)`
  - Ensure indexes created during migration

- [ ] TASK-005: Add React.memo to list item components | Severity: high | Files: `src/renderer/components/git/GitStatus.tsx`, `src/renderer/components/github/IssuesList.tsx`, `src/renderer/components/github/PullRequestList.tsx`
  - Wrap FileChangeRow with React.memo
  - Wrap IssueItem with React.memo
  - Wrap PullRequestItem with React.memo
  - Wrap CommitItem with React.memo

- [ ] TASK-006: Implement list virtualization for GitCommits | Severity: high | Files: `src/renderer/components/git/GitCommits.tsx`
  - Import `useVirtualizer` from @tanstack/react-virtual
  - Replace direct .map() render with virtualized list
  - Add proper container sizing

- [ ] TASK-007: Remove debug console.log statements | Severity: high | Files: `src/main/ipc/handlers/features.ts`
  - Remove lines 427-438 (UNINSTALL DEBUG console.log)
  - Replace with logger.debug() if logging needed

- [ ] TASK-008: Add LIMIT clause to getAllSessions() | Severity: high | Files: `src/main/database/index.ts`
  - Add optional limit parameter
  - Implement pagination with LIMIT/OFFSET
  - Update callers if needed

### Wave 3: Medium [P2]

- [ ] TASK-009: Add timeout cleanup for PTYStreamAnalyzer activeToolCalls | Severity: medium | Files: `src/main/services/ptyStreamAnalyzer/service.ts`
  - Add timestamp to tool call entries
  - Implement periodic cleanup of stale entries (>5 minute timeout)
  - Clear interval on service shutdown

- [ ] TASK-010: Add cleanup for HookServer session Maps | Severity: medium | Files: `src/main/services/hookServer/service.ts`
  - Clear `sessionStacks` entry when session_stop event received
  - Clear `pendingSubagentParents` entry when subagent session ends
  - Add size limits to prevent unbounded growth

- [ ] TASK-011: Ensure Logger.shutdown() called on app quit | Severity: medium | Files: `src/main/index.ts`, `src/main/services/logger.ts`
  - Add Logger.shutdown() call in app 'will-quit' handler
  - Verify flushInterval is cleared

- [ ] TASK-012: Move statusMap outside FileChangeRow component | Severity: medium | Files: `src/renderer/components/git/GitStatus.tsx`
  - Extract statusMap constant outside component
  - Or wrap with useMemo if needs component props

- [ ] TASK-013: Fix empty catch blocks - add error logging | Severity: medium | Files: Multiple
  - Search for empty catch blocks
  - Add logger.error() or logger.debug() as appropriate
  - Ensure no silent failures

### Wave 4: Low [P3]

- [ ] TASK-014: Batch N+1 queries in agent registry operations | Severity: low | Files: `src/main/database/primitives.ts`
  - Convert upsertIndexedAgent to use batch INSERT
  - Convert updateAgentMetrics to use batch UPDATE
  - Use prepared statements

- [ ] TASK-015: Audit and improve test assertions | Severity: low | Files: `src/**/*.test.tsx`, `src/**/*.test.ts`
  - Review tests for meaningful assertions
  - Remove or fix any `expect(true).toBe(true)` patterns
  - Ensure all tests verify actual behavior

## Implementation Notes

### For TASK-001 (SessionManager cleanup):
```typescript
// Add to SessionManagerInstance class:
private cleanupDeletedSessions(): void {
  for (const [filePath] of this.watchedSessions) {
    if (!existsSync(filePath)) {
      try {
        unwatchFile(filePath);
      } catch (e) {
        // File may already be unwatched
      }
      this.watchedSessions.delete(filePath);
      this.knownSessionFiles.delete(filePath);
      logger.debug('Cleaned up deleted session file', { filePath });
    }
  }
}

// Call in scanForNewSessions():
private async scanForNewSessions(): Promise<void> {
  if (!existsSync(this.claudeDir)) return;

  // Clean up first
  this.cleanupDeletedSessions();
  // ... rest of method
}
```

### For TASK-002 (getAnalytics optimization):
```typescript
// Replace current implementation with:
export function getAnalytics(): Analytics {
  const today = getTodayString();

  const stats = database.prepare(`
    SELECT
      COUNT(*) as totalSessions,
      COALESCE(SUM(token_count), 0) as totalTokens,
      COALESCE(SUM(cost), 0) as totalCost,
      COALESCE(AVG(token_count), 0) as avgTokensPerSession,
      SUM(CASE WHEN start_time LIKE ? || '%' THEN 1 ELSE 0 END) as todaySessions,
      SUM(CASE WHEN id LIKE 'agent-%' THEN 1 ELSE 0 END) as totalSubagents,
      SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favoriteCount
    FROM sessions
  `).get(today) as {...};

  // Separate query for costByProject (still needed but more efficient)
  const projectCosts = database.prepare(`
    SELECT project_name, SUM(cost) as cost
    FROM sessions
    GROUP BY project_name
  `).all() as Array<{project_name: string; cost: number}>;

  const costByProject: Record<string, number> = {};
  for (const row of projectCosts) {
    costByProject[row.project_name] = row.cost;
  }

  return {
    totalSessions: stats.totalSessions,
    totalTokens: stats.totalTokens,
    totalCost: stats.totalCost,
    avgTokensPerSession: Math.round(stats.avgTokensPerSession),
    todaySessions: stats.todaySessions,
    totalSubagents: stats.totalSubagents,
    favoriteCount: stats.favoriteCount,
    costByProject,
  };
}
```

### For TASK-004 (Database indexes):
```sql
-- Add to schema migrations:
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_favorite ON sessions(favorite);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, message_index);
```
