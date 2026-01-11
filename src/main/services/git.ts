// ============================================================================
// GIT SERVICE
// ============================================================================

import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from './logger.js';
import type { GitStatus, GitFileChange, GitBranchInfo, GitCommitInfo, GitDetailedStatus, GitCommitDetail, GitCommitFile, GitFileDiff, GitDiffHunk, GitDiffLine, GitTag } from '../../shared/types/index.js';

const execFileAsync = promisify(execFile);
const logger = new Logger('Git');

const GIT_TIMEOUT = 30000;
const GIT_MAX_BUFFER = 1024 * 1024 * 10; // 10MB

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

// Token bucket rate limiter for Git operations
// Prevents abuse and protects against runaway scripts
const rateLimiter: RateLimiterState = {
  tokens: 50,        // Start with 50 tokens (allows burst)
  lastRefill: Date.now(),
};

const RATE_LIMIT_CONFIG = {
  maxTokens: 50,     // Maximum tokens in bucket
  refillRate: 10,    // Tokens added per second
  tokensPerRequest: 1, // Tokens consumed per request
};

/**
 * Check if a request can proceed under rate limiting.
 * Uses a token bucket algorithm that allows bursts while limiting sustained rate.
 * @returns true if request is allowed, false if rate limited
 */
function checkRateLimit(): boolean {
  const now = Date.now();
  const timeSinceRefill = (now - rateLimiter.lastRefill) / 1000; // in seconds

  // Refill tokens based on time elapsed
  const tokensToAdd = Math.floor(timeSinceRefill * RATE_LIMIT_CONFIG.refillRate);
  if (tokensToAdd > 0) {
    rateLimiter.tokens = Math.min(
      RATE_LIMIT_CONFIG.maxTokens,
      rateLimiter.tokens + tokensToAdd
    );
    rateLimiter.lastRefill = now;
  }

  // Check if we have tokens available
  if (rateLimiter.tokens >= RATE_LIMIT_CONFIG.tokensPerRequest) {
    rateLimiter.tokens -= RATE_LIMIT_CONFIG.tokensPerRequest;
    return true;
  }

  return false;
}

/**
 * Runs a git command safely using execFile to prevent command injection.
 * Arguments are passed as an array, not interpolated into a shell string.
 * Includes rate limiting to prevent abuse.
 */
async function runGitCommand(cwd: string, args: string[]): Promise<GitStatus> {
  // Apply rate limiting
  if (!checkRateLimit()) {
    logger.warn('Git operation rate limited', { cwd, command: args[0] });
    return {
      success: false,
      error: 'Too many Git operations. Please wait a moment and try again.',
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: GIT_TIMEOUT,
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true,
    });
    return { success: true, output: stdout.trim(), stderr: stderr.trim() };
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: string };
    return {
      success: false,
      error: err.message ?? 'Unknown error',
      stderr: err.stderr?.trim() ?? '',
    };
  }
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['status', '--porcelain', '-b']);
}

export async function gitBranch(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['branch', '--show-current']);
}

export async function gitLog(cwd: string, limit: number = 10): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  // Validate limit is a positive integer to prevent injection via numeric args
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(Number(limit))));
  return runGitCommand(cwd, ['log', '--oneline', '-n', String(safeLimit)]);
}

export async function gitDiff(cwd: string, staged: boolean = false): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  const args = staged ? ['diff', '--staged', '--stat'] : ['diff', '--stat'];
  return runGitCommand(cwd, args);
}

export async function gitAdd(cwd: string, files?: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  // Split files by whitespace if provided, otherwise add all
  const fileList = files ? files.split(/\s+/).filter(Boolean) : ['.'];
  return runGitCommand(cwd, ['add', ...fileList]);
}

export async function gitCommit(cwd: string, message: string): Promise<GitStatus> {
  if (!cwd || !message) return { success: false, error: 'Missing cwd or commit message' };
  // No escaping needed - execFile passes arguments safely without shell interpretation
  return runGitCommand(cwd, ['commit', '-m', message]);
}

export async function gitPush(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['push']);
}

export async function gitPull(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['pull']);
}

export async function gitIsRepo(cwd: string): Promise<boolean> {
  if (!cwd) return false;
  const result = await runGitCommand(cwd, ['rev-parse', '--git-dir']);
  return result.success;
}

export async function gitRemote(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['remote', '-v']);
}

export async function gitStash(cwd: string, action?: 'pop' | 'list'): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  const args = action === 'pop' ? ['stash', 'pop'] : action === 'list' ? ['stash', 'list'] : ['stash'];
  return runGitCommand(cwd, args);
}

export async function gitInit(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['init']);
}

export async function gitReset(cwd: string, files?: string[]): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  // Files are passed as individual arguments, preventing injection
  const args = files && files.length > 0 ? ['reset', 'HEAD', ...files] : ['reset', 'HEAD'];
  return runGitCommand(cwd, args);
}

export async function gitFetch(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['fetch']);
}

// ============================================================================
// ENHANCED GIT METHODS FOR FULL-FEATURED GIT PANEL
// ============================================================================

/**
 * Parse git status porcelain output into structured file changes
 */
function parseStatusLine(line: string): GitFileChange | null {
  if (!line || line.length < 3) return null;

  const indexStatus = line.charAt(0);
  const workTreeStatus = line.charAt(1);
  let filePath = line.substring(3);
  let originalPath: string | undefined;

  // Handle renamed files (format: "R  old -> new")
  if (filePath.includes(' -> ')) {
    const parts = filePath.split(' -> ');
    originalPath = parts[0];
    filePath = parts[1];
  }

  // Determine status category
  let status: GitFileChange['status'];
  let staged = false;

  if (indexStatus === '?' && workTreeStatus === '?') {
    status = 'untracked';
  } else if (indexStatus === '!' && workTreeStatus === '!') {
    status = 'ignored';
  } else if (indexStatus !== ' ' && indexStatus !== '?') {
    // Has staged changes
    staged = true;
    if (indexStatus === 'A') status = 'added';
    else if (indexStatus === 'D') status = 'deleted';
    else if (indexStatus === 'M') status = 'modified';
    else if (indexStatus === 'R') status = 'renamed';
    else if (indexStatus === 'C') status = 'copied';
    else status = 'modified';
  } else if (workTreeStatus !== ' ') {
    // Has unstaged changes
    if (workTreeStatus === 'D') status = 'deleted';
    else if (workTreeStatus === 'M') status = 'modified';
    else status = 'modified';
  } else {
    return null;
  }

  return {
    status,
    file: filePath,
    staged,
    indexStatus,
    workTreeStatus,
    originalPath,
  };
}

/**
 * Get detailed git status with parsed file changes
 */
export async function gitDetailedStatus(cwd: string): Promise<GitDetailedStatus> {
  if (!cwd) {
    return {
      success: false,
      error: 'No working directory specified',
      staged: [],
      unstaged: [],
      untracked: [],
      branch: '',
      ahead: 0,
      behind: 0,
    };
  }

  const result = await runGitCommand(cwd, ['status', '--porcelain=v1', '-b', '-u']);

  if (!result.success || !result.output) {
    return {
      success: result.success,
      error: result.error,
      staged: [],
      unstaged: [],
      untracked: [],
      branch: '',
      ahead: 0,
      behind: 0,
    };
  }

  const lines = result.output.split('\n');
  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];
  const untracked: GitFileChange[] = [];
  let branch = '';
  let ahead = 0;
  let behind = 0;

  for (const line of lines) {
    if (line.startsWith('##')) {
      // Parse branch line: ## branch...origin/branch [ahead N, behind M]
      const branchMatch = line.match(/^## ([^.]+)/);
      if (branchMatch) {
        branch = branchMatch[1].replace('No commits yet on ', '');
      }

      const aheadMatch = line.match(/ahead (\d+)/);
      const behindMatch = line.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
      if (behindMatch) behind = parseInt(behindMatch[1], 10);
      continue;
    }

    const change = parseStatusLine(line);
    if (!change) continue;

    if (change.status === 'untracked') {
      untracked.push(change);
    } else if (change.staged) {
      staged.push(change);
      // File might also have unstaged changes
      if (change.workTreeStatus !== ' ') {
        unstaged.push({
          ...change,
          staged: false,
        });
      }
    } else {
      unstaged.push(change);
    }
  }

  return {
    success: true,
    staged,
    unstaged,
    untracked,
    branch,
    ahead,
    behind,
  };
}

/**
 * Get list of all branches (local and remote)
 *
 * SIMPLE APPROACH: Use plain `git branch` output which always works,
 * including in repos without commits. Format:
 *   first-branch
 * * current-branch
 *   main
 *
 * Where * marks the current branch.
 */
export async function gitBranches(cwd: string): Promise<{ success: boolean; branches: GitBranchInfo[]; error?: string }> {
  if (!cwd) {
    return { success: false, branches: [], error: 'No working directory specified' };
  }

  const branches: GitBranchInfo[] = [];

  // Use plain `git branch` - this ALWAYS works, even in repos without commits
  // Output format: "  branch-name" or "* current-branch" (one per line)
  const localResult = await runGitCommand(cwd, ['branch']);

  logger.debug(`gitBranches: git branch command result - success: ${localResult.success}, output: "${localResult.output}", error: "${localResult.error}"`);

  if (localResult.success && localResult.output) {
    // Split on newlines, handling both Unix (\n) and Windows (\r\n) line endings
    const lines = localResult.output.split(/\r?\n/);
    logger.debug(`gitBranches: parsing ${lines.length} lines from output: "${localResult.output.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);

    for (const line of lines) {
      // Skip empty lines
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Parse line: "* current-branch" or "  other-branch"
      // The asterisk indicates the current branch
      const isCurrent = trimmedLine.startsWith('*');

      // Remove the leading "* " or "  " and any extra whitespace
      // Handle cases like "* main" or "  feature-branch"
      const branchName = trimmedLine.replace(/^\*?\s*/, '').trim();

      logger.debug(`gitBranches: parsed line "${trimmedLine}" -> branch: "${branchName}", isCurrent: ${isCurrent}`);

      if (!branchName) continue;

      branches.push({
        name: branchName,
        hash: '',
        upstream: undefined,
        isCurrent,
        isRemote: false,
      });
    }
  } else if (!localResult.success) {
    logger.warn(`gitBranches: git branch failed - ${localResult.error}`);
  } else {
    logger.debug(`gitBranches: git branch returned empty output`);
  }

  logger.debug(`gitBranches: found ${branches.length} local branches`);

  // Get remote branches separately (optional enhancement, may fail in new repos)
  const remoteResult = await runGitCommand(cwd, ['branch', '-r']);

  if (remoteResult.success && remoteResult.output) {
    // Split on newlines, handling both Unix (\n) and Windows (\r\n) line endings
    const lines = remoteResult.output.split(/\r?\n/);
    for (const line of lines) {
      const branchName = line.trim();
      if (!branchName) continue;

      // Skip HEAD references like origin/HEAD -> origin/main
      if (branchName.includes('HEAD')) continue;

      branches.push({
        name: branchName,
        hash: '',
        upstream: undefined,
        isCurrent: false,
        isRemote: true,
      });
    }
  }

  logger.info(`gitBranches: returning ${branches.length} total branches`);

  return { success: true, branches };
}

/**
 * Checkout a branch
 */
export async function gitCheckout(cwd: string, branch: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!branch) return { success: false, error: 'No branch specified' };

  // Sanitize branch name - allow alphanumeric, dash, underscore, slash, and dots
  // Git branch names can contain dots (e.g., feature.test, v1.0.0)
  if (!/^[\w\-\/.]+$/.test(branch)) {
    return { success: false, error: 'Invalid branch name' };
  }

  // Prevent directory traversal attempts
  if (branch.includes('..')) {
    return { success: false, error: 'Invalid branch name' };
  }

  logger.info(`Checking out branch: ${branch}`);
  const result = await runGitCommand(cwd, ['checkout', branch]);

  if (result.success) {
    logger.info(`Successfully checked out branch: ${branch}`);
  } else {
    logger.error(`Failed to checkout branch ${branch}: ${result.error}`);
  }

  return result;
}

/**
 * Create a new branch
 */
export async function gitCreateBranch(cwd: string, name: string, checkout: boolean = true): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!name) return { success: false, error: 'No branch name specified' };

  // Sanitize branch name - allow alphanumeric, dash, underscore, slash, and dots
  if (!/^[\w\-\/.]+$/.test(name)) {
    return { success: false, error: 'Invalid branch name. Use only letters, numbers, dashes, underscores, slashes, and dots.' };
  }

  // Prevent directory traversal attempts
  if (name.includes('..')) {
    return { success: false, error: 'Invalid branch name' };
  }

  logger.info(`Creating branch: ${name} (checkout: ${checkout})`);

  if (checkout) {
    return runGitCommand(cwd, ['checkout', '-b', name]);
  } else {
    return runGitCommand(cwd, ['branch', name]);
  }
}

/**
 * Stage specific files
 */
export async function gitStage(cwd: string, files: string[]): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!files || files.length === 0) return { success: false, error: 'No files specified' };

  return runGitCommand(cwd, ['add', '--', ...files]);
}

/**
 * Unstage specific files
 */
export async function gitUnstage(cwd: string, files: string[]): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!files || files.length === 0) return { success: false, error: 'No files specified' };

  return runGitCommand(cwd, ['reset', 'HEAD', '--', ...files]);
}

/**
 * Get recent commits with detailed info for the current branch
 *
 * Note: By default, git log shows all commits reachable from HEAD.
 * This is standard Git behavior - if branch B was created from branch A,
 * B will include A's history up to the point of divergence.
 */
export async function gitLogDetailed(cwd: string, limit: number = 20): Promise<{ success: boolean; commits: GitCommitInfo[]; error?: string }> {
  if (!cwd) {
    return { success: false, commits: [], error: 'No working directory specified' };
  }

  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit))));

  // First, get the current branch name for logging purposes
  const branchResult = await runGitCommand(cwd, ['branch', '--show-current']);
  const currentBranch = branchResult.success ? branchResult.output?.trim() : 'unknown';
  logger.debug(`Fetching commits for branch: ${currentBranch}`);

  // Format: hash|short_hash|author|email|date|subject
  // We use HEAD explicitly to ensure we're getting commits from current position
  const result = await runGitCommand(cwd, [
    'log',
    'HEAD',
    `--max-count=${safeLimit}`,
    '--format=%H|%h|%an|%ae|%aI|%s'
  ]);

  if (!result.success) {
    // Check if it's just an empty repo (handles both "does not have any commits" and "does not have any commits yet")
    if (result.error?.includes('does not have any commits') || result.stderr?.includes('does not have any commits')) {
      return { success: true, commits: [] };
    }
    return { success: false, commits: [], error: result.error };
  }

  const commits: GitCommitInfo[] = [];
  const lines = result.output?.split('\n').filter(Boolean) || [];

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length >= 6) {
      commits.push({
        hash: parts[0],
        shortHash: parts[1],
        author: parts[2],
        email: parts[3],
        date: parts[4],
        subject: parts.slice(5).join('|'), // Subject might contain |
      });
    }
  }

  return { success: true, commits };
}

/**
 * Get ahead/behind counts for current branch relative to remote
 *
 * This function handles multiple scenarios:
 * 1. Branch has upstream configured - use rev-list with @{upstream}
 * 2. No upstream but remote exists - compare with origin/<branch>
 * 3. No remote at all - return 0/0 with hasRemote: false
 */
export async function gitAheadBehind(cwd: string): Promise<{
  success: boolean;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  hasUpstream: boolean;
  error?: string;
}> {
  if (!cwd) {
    return { success: false, ahead: 0, behind: 0, hasRemote: false, hasUpstream: false, error: 'No working directory specified' };
  }

  // First, check if any remote exists
  const remoteResult = await runGitCommand(cwd, ['remote']);
  const hasRemote = remoteResult.success && !!remoteResult.output?.trim();

  if (!hasRemote) {
    // No remotes configured - push/pull won't work regardless
    return { success: true, ahead: 0, behind: 0, hasRemote: false, hasUpstream: false };
  }

  // Get current branch name
  const branchResult = await runGitCommand(cwd, ['branch', '--show-current']);
  if (!branchResult.success || !branchResult.output?.trim()) {
    // Detached HEAD or other issue
    return { success: true, ahead: 0, behind: 0, hasRemote: true, hasUpstream: false };
  }
  const currentBranch = branchResult.output.trim();

  // Try to use the configured upstream first
  const upstreamResult = await runGitCommand(cwd, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);

  if (upstreamResult.success && upstreamResult.output) {
    const parts = upstreamResult.output.trim().split(/\s+/) || [];
    const behind = parseInt(parts[0], 10) || 0;
    const ahead = parseInt(parts[1], 10) || 0;
    return { success: true, ahead, behind, hasRemote: true, hasUpstream: true };
  }

  // No upstream set - try to compare with origin/<branch> if it exists
  const remoteBranchResult = await runGitCommand(cwd, ['rev-parse', '--verify', `origin/${currentBranch}`]);

  if (remoteBranchResult.success) {
    // Remote branch exists, compare with it
    const compareResult = await runGitCommand(cwd, ['rev-list', '--left-right', '--count', `origin/${currentBranch}...HEAD`]);

    if (compareResult.success && compareResult.output) {
      const parts = compareResult.output.trim().split(/\s+/) || [];
      const behind = parseInt(parts[0], 10) || 0;
      const ahead = parseInt(parts[1], 10) || 0;
      return { success: true, ahead, behind, hasRemote: true, hasUpstream: false };
    }
  }

  // Remote exists but this branch hasn't been pushed yet
  // Count all commits from the branch as "ahead"
  const countResult = await runGitCommand(cwd, ['rev-list', '--count', 'HEAD']);
  if (countResult.success && countResult.output) {
    const ahead = parseInt(countResult.output.trim(), 10) || 0;
    // New branch not on remote - user can push to create it
    return { success: true, ahead, behind: 0, hasRemote: true, hasUpstream: false };
  }

  return { success: true, ahead: 0, behind: 0, hasRemote: true, hasUpstream: false };
}

/**
 * Discard changes to a file (restore to HEAD)
 */
export async function gitDiscardChanges(cwd: string, files: string[]): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!files || files.length === 0) return { success: false, error: 'No files specified' };

  return runGitCommand(cwd, ['checkout', 'HEAD', '--', ...files]);
}

/**
 * Delete untracked files
 */
export async function gitCleanFile(cwd: string, file: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!file) return { success: false, error: 'No file specified' };

  return runGitCommand(cwd, ['clean', '-f', '--', file]);
}

/**
 * Get detailed information about a specific commit including files changed
 */
export async function gitShowCommit(cwd: string, hash: string): Promise<{ success: boolean; commit?: GitCommitDetail; error?: string }> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!hash) return { success: false, error: 'No commit hash specified' };

  // Validate hash format (prevent injection)
  if (!/^[a-fA-F0-9]+$/.test(hash)) {
    return { success: false, error: 'Invalid commit hash format' };
  }

  // Get commit info with body
  const commitResult = await runGitCommand(cwd, [
    'show',
    hash,
    '--format=%H|%h|%an|%ae|%aI|%s|%b',
    '--no-patch'
  ]);

  if (!commitResult.success || !commitResult.output) {
    return { success: false, error: commitResult.error || 'Failed to get commit info' };
  }

  // Parse commit info (first line is the format, rest might be body with newlines)
  const lines = commitResult.output.split('\n');
  const firstLine = lines[0];
  const parts = firstLine.split('|');

  if (parts.length < 6) {
    return { success: false, error: 'Failed to parse commit info' };
  }

  const [fullHash, shortHash, author, email, date, subject] = parts;
  // Body might contain pipes, so join remaining parts and include all lines after first
  const bodyFromParts = parts.slice(6).join('|');
  const bodyFromLines = lines.slice(1).join('\n');
  const body = (bodyFromParts + (bodyFromLines ? '\n' + bodyFromLines : '')).trim();

  // Get file stats for the commit
  const statsResult = await runGitCommand(cwd, [
    'show',
    hash,
    '--stat',
    '--format='
  ]);

  const files: GitCommitFile[] = [];
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  if (statsResult.success && statsResult.output) {
    const statLines = statsResult.output.trim().split('\n').filter(Boolean);

    for (const line of statLines) {
      // Last line is summary like "3 files changed, 10 insertions(+), 5 deletions(-)"
      const summaryMatch = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      if (summaryMatch) {
        filesChanged = parseInt(summaryMatch[1], 10) || 0;
        insertions = parseInt(summaryMatch[2], 10) || 0;
        deletions = parseInt(summaryMatch[3], 10) || 0;
        continue;
      }

      // File lines like " src/file.ts | 10 +++++-----"
      const fileMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s*([+-]*)/);
      if (fileMatch) {
        const filePath = fileMatch[1].trim();
        const changes = parseInt(fileMatch[2], 10) || 0;
        const changeIndicator = fileMatch[3] || '';

        // Count + and - in the indicator to estimate insertions/deletions
        const adds = (changeIndicator.match(/\+/g) || []).length;
        const dels = (changeIndicator.match(/-/g) || []).length;
        const total = adds + dels || 1;

        const fileInsertions = Math.round(changes * (adds / total));
        const fileDeletions = changes - fileInsertions;

        files.push({
          file: filePath,
          status: 'modified', // Will be refined below
          insertions: fileInsertions,
          deletions: fileDeletions,
        });
      }
    }
  }

  // Get file statuses (added, modified, deleted, renamed)
  const nameStatusResult = await runGitCommand(cwd, [
    'show',
    hash,
    '--name-status',
    '--format='
  ]);

  if (nameStatusResult.success && nameStatusResult.output) {
    const statusLines = nameStatusResult.output.trim().split('\n').filter(Boolean);

    for (const line of statusLines) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const statusCode = parts[0];
        const filePath = parts[parts.length - 1]; // Use last part for file path

        // Find matching file in our list and update status
        const fileEntry = files.find(f => f.file === filePath || f.file.includes(filePath));
        if (fileEntry) {
          if (statusCode.startsWith('R')) {
            fileEntry.status = 'renamed';
            fileEntry.oldPath = parts[1];
          } else if (statusCode.startsWith('C')) {
            fileEntry.status = 'copied';
            fileEntry.oldPath = parts[1];
          } else if (statusCode === 'A') {
            fileEntry.status = 'added';
          } else if (statusCode === 'D') {
            fileEntry.status = 'deleted';
          } else {
            fileEntry.status = 'modified';
          }
        }
      }
    }
  }

  return {
    success: true,
    commit: {
      hash: fullHash,
      shortHash,
      author,
      email,
      date,
      subject,
      body,
      files,
      stats: {
        filesChanged,
        insertions,
        deletions,
      },
    },
  };
}

/**
 * Get diff for a specific file (optionally staged, or for a specific commit)
 */
export async function gitFileDiff(
  cwd: string,
  file?: string,
  options?: { staged?: boolean; commit?: string }
): Promise<{ success: boolean; diff?: GitFileDiff; rawDiff?: string; error?: string }> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args: string[] = ['diff'];

  if (options?.commit) {
    // Validate commit hash
    if (!/^[a-fA-F0-9]+$/.test(options.commit)) {
      return { success: false, error: 'Invalid commit hash format' };
    }
    // Show diff for a specific commit
    args.push(`${options.commit}^..${options.commit}`);
  } else if (options?.staged) {
    args.push('--staged');
  }

  args.push('--unified=3'); // Standard context lines

  if (file) {
    args.push('--', file);
  }

  const result = await runGitCommand(cwd, args);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  if (!result.output || result.output.trim() === '') {
    return {
      success: true,
      diff: {
        file: file || '',
        hunks: [],
        isBinary: false,
      },
      rawDiff: '',
    };
  }

  // Parse the diff output
  const diff = parseDiffOutput(result.output, file);

  return {
    success: true,
    diff,
    rawDiff: result.output,
  };
}

/**
 * Parse git diff output into structured format
 */
function parseDiffOutput(output: string, targetFile?: string): GitFileDiff {
  const lines = output.split('\n');
  const hunks: GitDiffHunk[] = [];
  let currentHunk: GitDiffHunk | null = null;
  let isBinary = false;
  let filePath = targetFile || '';
  let oldPath: string | undefined;

  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // Check for binary file
    if (line.startsWith('Binary files')) {
      isBinary = true;
      continue;
    }

    // Extract file paths from diff header
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        if (match[1] !== match[2]) {
          oldPath = match[1];
        }
        filePath = match[2];
      }
      continue;
    }

    // Parse hunk header
    if (line.startsWith('@@')) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      // Parse line numbers from hunk header: @@ -start,count +start,count @@
      const hunkMatch = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunkMatch) {
        oldLineNum = parseInt(hunkMatch[1], 10);
        newLineNum = parseInt(hunkMatch[2], 10);
      }

      currentHunk = {
        header: line,
        lines: [{
          type: 'header',
          content: line,
        }],
      };
      continue;
    }

    // Skip diff metadata lines
    if (line.startsWith('---') || line.startsWith('+++') ||
        line.startsWith('index ') || line.startsWith('new file') ||
        line.startsWith('deleted file') || line.startsWith('old mode') ||
        line.startsWith('new mode') || line.startsWith('similarity') ||
        line.startsWith('rename ') || line.startsWith('copy ')) {
      continue;
    }

    // Parse diff content lines
    if (currentHunk) {
      let type: GitDiffLine['type'] = 'context';
      let oldNum: number | undefined = oldLineNum;
      let newNum: number | undefined = newLineNum;

      if (line.startsWith('+')) {
        type = 'addition';
        oldNum = undefined;
        newLineNum++;
      } else if (line.startsWith('-')) {
        type = 'deletion';
        newNum = undefined;
        oldLineNum++;
      } else if (line.startsWith(' ') || line === '') {
        type = 'context';
        oldLineNum++;
        newLineNum++;
      } else {
        // Skip lines that don't match expected format
        continue;
      }

      currentHunk.lines.push({
        type,
        content: line.substring(1) || '', // Remove the +/-/space prefix
        oldLineNumber: oldNum,
        newLineNumber: newNum,
      });
    }
  }

  // Push the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return {
    file: filePath,
    hunks,
    isBinary,
    oldPath,
  };
}

/**
 * Get raw diff output (for simpler display)
 */
export async function gitDiffRaw(
  cwd: string,
  options?: { staged?: boolean; file?: string; commit?: string }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args: string[] = ['diff'];

  if (options?.commit) {
    if (!/^[a-fA-F0-9]+$/.test(options.commit)) {
      return { success: false, error: 'Invalid commit hash format' };
    }
    args.push(`${options.commit}^..${options.commit}`);
  } else if (options?.staged) {
    args.push('--staged');
  }

  if (options?.file) {
    args.push('--', options.file);
  }

  return runGitCommand(cwd, args);
}

/**
 * Get branches with hierarchy information.
 * For each branch, determine its likely parent branch based on merge-base analysis.
 * This helps visualize branch relationships in the UI.
 *
 * Algorithm: For each branch, find the CLOSEST parent by checking which other branch's
 * tip is closest to (or at) the merge-base point. The parent is the branch whose HEAD
 * has the fewest commits from the merge-base to its tip.
 *
 * Example:
 *   main: A - B - C - D
 *                  \
 *   first-branch:   E - F
 *                        \
 *   first-branch-part-two: G - H
 *
 * For "first-branch-part-two":
 *   - merge-base with main is C, distance from C to main tip (D) = 1
 *   - merge-base with first-branch is F, distance from F to first-branch tip (F) = 0
 *   - first-branch is closer (0 < 1), so first-branch is the parent
 */
/**
 * Merge a branch into the current branch
 */
export async function gitMerge(cwd: string, branch: string, options?: { noFf?: boolean; squash?: boolean }): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!branch) return { success: false, error: 'No branch specified' };

  // Sanitize branch name
  if (!/^[\w\-\/.]+$/.test(branch)) {
    return { success: false, error: 'Invalid branch name' };
  }

  // Prevent directory traversal
  if (branch.includes('..')) {
    return { success: false, error: 'Invalid branch name' };
  }

  const args = ['merge'];

  if (options?.noFf) {
    args.push('--no-ff');
  }

  if (options?.squash) {
    args.push('--squash');
  }

  args.push(branch);

  logger.info(`Merging branch: ${branch} with options: ${JSON.stringify(options)}`);
  const result = await runGitCommand(cwd, args);

  if (result.success) {
    logger.info(`Successfully merged branch: ${branch}`);
  } else {
    logger.error(`Failed to merge branch ${branch}: ${result.error}`);
  }

  return result;
}

/**
 * Abort a merge in progress
 */
export async function gitMergeAbort(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['merge', '--abort']);
}

/**
 * Check if there's a merge in progress
 */
export async function gitMergeInProgress(cwd: string): Promise<boolean> {
  if (!cwd) return false;
  // Check for MERGE_HEAD file which indicates a merge in progress
  const result = await runGitCommand(cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  return result.success;
}

/**
 * Get list of configured remotes with their URLs
 */
export async function gitRemotes(cwd: string): Promise<{
  success: boolean;
  remotes: Array<{ name: string; fetchUrl: string; pushUrl: string }>;
  error?: string;
}> {
  if (!cwd) {
    return { success: false, remotes: [], error: 'No working directory specified' };
  }

  const result = await runGitCommand(cwd, ['remote', '-v']);

  if (!result.success) {
    return { success: false, remotes: [], error: result.error };
  }

  const remotes = new Map<string, { name: string; fetchUrl: string; pushUrl: string }>();

  if (result.output) {
    const lines = result.output.split('\n').filter(Boolean);
    for (const line of lines) {
      // Format: "origin  https://github.com/user/repo.git (fetch)" or "(push)"
      const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (match) {
        const [, name, url, type] = match;
        if (!remotes.has(name)) {
          remotes.set(name, { name, fetchUrl: '', pushUrl: '' });
        }
        const remote = remotes.get(name)!;
        if (type === 'fetch') {
          remote.fetchUrl = url;
        } else {
          remote.pushUrl = url;
        }
      }
    }
  }

  return { success: true, remotes: Array.from(remotes.values()) };
}

/**
 * Add a new remote
 */
export async function gitRemoteAdd(cwd: string, name: string, url: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!name) return { success: false, error: 'No remote name specified' };
  if (!url) return { success: false, error: 'No URL specified' };

  // Sanitize remote name
  if (!/^[\w\-]+$/.test(name)) {
    return { success: false, error: 'Invalid remote name' };
  }

  return runGitCommand(cwd, ['remote', 'add', name, url]);
}

/**
 * Remove a remote
 */
export async function gitRemoteRemove(cwd: string, name: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!name) return { success: false, error: 'No remote name specified' };

  // Sanitize remote name
  if (!/^[\w\-]+$/.test(name)) {
    return { success: false, error: 'Invalid remote name' };
  }

  return runGitCommand(cwd, ['remote', 'remove', name]);
}

/**
 * List stashes
 */
export async function gitStashList(cwd: string): Promise<{
  success: boolean;
  stashes: Array<{ index: number; message: string; branch: string }>;
  error?: string;
}> {
  if (!cwd) {
    return { success: false, stashes: [], error: 'No working directory specified' };
  }

  const result = await runGitCommand(cwd, ['stash', 'list']);

  if (!result.success) {
    return { success: false, stashes: [], error: result.error };
  }

  const stashes: Array<{ index: number; message: string; branch: string }> = [];

  if (result.output) {
    const lines = result.output.split('\n').filter(Boolean);
    for (const line of lines) {
      // Format: "stash@{0}: On main: message" or "stash@{0}: WIP on main: hash message"
      const match = line.match(/^stash@\{(\d+)\}:\s*(?:(?:On|WIP on)\s+(\S+):\s*)?(.*)$/);
      if (match) {
        const [, indexStr, branch, message] = match;
        stashes.push({
          index: parseInt(indexStr, 10),
          branch: branch || '',
          message: message.trim(),
        });
      }
    }
  }

  return { success: true, stashes };
}

/**
 * Push changes to stash with optional message
 */
export async function gitStashPush(cwd: string, message?: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['stash', 'push'];
  if (message) {
    args.push('-m', message);
  }

  return runGitCommand(cwd, args);
}

/**
 * Pop a stash (apply and remove)
 */
export async function gitStashPop(cwd: string, index?: number): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['stash', 'pop'];
  if (index !== undefined) {
    args.push(`stash@{${index}}`);
  }

  return runGitCommand(cwd, args);
}

/**
 * Apply a stash without removing it
 */
export async function gitStashApply(cwd: string, index?: number): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['stash', 'apply'];
  if (index !== undefined) {
    args.push(`stash@{${index}}`);
  }

  return runGitCommand(cwd, args);
}

/**
 * Drop a stash
 */
export async function gitStashDrop(cwd: string, index?: number): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['stash', 'drop'];
  if (index !== undefined) {
    args.push(`stash@{${index}}`);
  }

  return runGitCommand(cwd, args);
}

export async function gitBranchesWithHierarchy(cwd: string): Promise<{
  success: boolean;
  branches: Array<GitBranchInfo & { parentBranch?: string; commitsAhead?: number }>;
  error?: string;
}> {
  if (!cwd) {
    return { success: false, branches: [], error: 'No working directory specified' };
  }

  // First get all branches
  const branchesResult = await gitBranches(cwd);
  if (!branchesResult.success) {
    return { success: false, branches: [], error: branchesResult.error };
  }

  const localBranches = branchesResult.branches.filter(b => !b.isRemote);

  // If only one branch or no branches, no hierarchy to compute
  if (localBranches.length <= 1) {
    return { success: true, branches: branchesResult.branches };
  }

  // Determine the main/default branch (usually main or master)
  const mainBranch = localBranches.find(b => b.name === 'main')
    || localBranches.find(b => b.name === 'master')
    || localBranches[0];

  // Get the commit hash for each branch (needed for comparison)
  const branchCommits = new Map<string, string>();
  for (const branch of localBranches) {
    const result = await runGitCommand(cwd, ['rev-parse', branch.name]);
    if (result.success && result.output) {
      branchCommits.set(branch.name, result.output.trim());
    }
  }

  const branchesWithHierarchy: Array<GitBranchInfo & { parentBranch?: string; commitsAhead?: number }> = [];

  for (const branch of branchesResult.branches) {
    if (branch.isRemote) {
      branchesWithHierarchy.push(branch);
      continue;
    }

    // For the main branch, it has no parent
    if (branch.name === mainBranch?.name) {
      branchesWithHierarchy.push({ ...branch, parentBranch: undefined });
      continue;
    }

    // For other branches, find the CLOSEST parent
    // The closest parent is the one where:
    // 1. The merge-base exists
    // 2. The distance from merge-base to the other branch's tip is SMALLEST
    //    (ideally 0, meaning the other branch's tip IS the merge-base)
    let closestParent: string | undefined;
    let smallestDistanceToParentTip = Infinity;
    let commitsAhead = 0;

    for (const otherBranch of localBranches) {
      if (otherBranch.name === branch.name) continue;

      // Find the merge-base between this branch and the potential parent
      const mergeBaseResult = await runGitCommand(cwd, ['merge-base', otherBranch.name, branch.name]);
      if (!mergeBaseResult.success || !mergeBaseResult.output) continue;

      const mergeBase = mergeBaseResult.output.trim();
      const otherBranchTip = branchCommits.get(otherBranch.name);

      // Calculate distance from merge-base to the other branch's tip
      // If this is 0, the other branch's tip IS the merge-base (ideal parent)
      let distanceToParentTip = Infinity;

      if (otherBranchTip === mergeBase) {
        // The other branch's tip is exactly at the merge-base
        // This means our branch was created from the tip of that branch
        distanceToParentTip = 0;
      } else {
        // Count commits from merge-base to the other branch's tip
        const distResult = await runGitCommand(cwd, [
          'rev-list', '--count',
          `${mergeBase}..${otherBranch.name}`
        ]);
        if (distResult.success && distResult.output) {
          distanceToParentTip = parseInt(distResult.output.trim(), 10) || Infinity;
        }
      }

      // Also count how many commits our branch is ahead of the merge-base
      const aheadResult = await runGitCommand(cwd, [
        'rev-list', '--count',
        `${mergeBase}..${branch.name}`
      ]);
      const branchCommitsAhead = aheadResult.success && aheadResult.output
        ? parseInt(aheadResult.output.trim(), 10) || 0
        : 0;

      // Choose this branch as parent if it's closer to the merge-base
      if (distanceToParentTip < smallestDistanceToParentTip) {
        smallestDistanceToParentTip = distanceToParentTip;
        closestParent = otherBranch.name;
        commitsAhead = branchCommitsAhead;
      }
    }

    branchesWithHierarchy.push({
      ...branch,
      parentBranch: closestParent,
      commitsAhead,
    });
  }

  return { success: true, branches: branchesWithHierarchy };
}

// ============================================================================
// BRANCH DELETION
// ============================================================================

/**
 * Delete a local branch
 * @param force If true, use -D (force delete even if not merged)
 */
export async function gitDeleteBranch(
  cwd: string,
  branch: string,
  options?: { force?: boolean }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!branch) return { success: false, error: 'No branch specified' };

  // Sanitize branch name
  if (!/^[\w\-\/.]+$/.test(branch)) {
    return { success: false, error: 'Invalid branch name' };
  }

  // Prevent directory traversal
  if (branch.includes('..')) {
    return { success: false, error: 'Invalid branch name' };
  }

  // Cannot delete current branch
  const currentBranch = await runGitCommand(cwd, ['branch', '--show-current']);
  if (currentBranch.success && currentBranch.output?.trim() === branch) {
    return { success: false, error: 'Cannot delete the currently checked out branch' };
  }

  const flag = options?.force ? '-D' : '-d';
  logger.info(`Deleting branch: ${branch} (force: ${options?.force ?? false})`);

  return runGitCommand(cwd, ['branch', flag, branch]);
}

/**
 * Delete a remote branch
 */
export async function gitDeleteRemoteBranch(
  cwd: string,
  remote: string,
  branch: string
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!remote) return { success: false, error: 'No remote specified' };
  if (!branch) return { success: false, error: 'No branch specified' };

  // Sanitize inputs
  if (!/^[\w\-]+$/.test(remote)) {
    return { success: false, error: 'Invalid remote name' };
  }
  if (!/^[\w\-\/.]+$/.test(branch)) {
    return { success: false, error: 'Invalid branch name' };
  }

  logger.info(`Deleting remote branch: ${remote}/${branch}`);
  return runGitCommand(cwd, ['push', remote, '--delete', branch]);
}

// ============================================================================
// COMMIT AMEND
// ============================================================================

/**
 * Amend the last commit
 * @param message If provided, change the commit message; otherwise keep the existing message
 */
export async function gitCommitAmend(
  cwd: string,
  options?: { message?: string; noEdit?: boolean }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['commit', '--amend'];

  if (options?.message) {
    args.push('-m', options.message);
  } else if (options?.noEdit) {
    args.push('--no-edit');
  }

  logger.info('Amending last commit');
  return runGitCommand(cwd, args);
}

// ============================================================================
// CHERRY-PICK
// ============================================================================

/**
 * Cherry-pick a commit
 */
export async function gitCherryPick(cwd: string, commit: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!commit) return { success: false, error: 'No commit specified' };

  // Validate commit hash
  if (!/^[a-fA-F0-9]+$/.test(commit)) {
    return { success: false, error: 'Invalid commit hash format' };
  }

  logger.info(`Cherry-picking commit: ${commit}`);
  return runGitCommand(cwd, ['cherry-pick', commit]);
}

/**
 * Abort a cherry-pick in progress
 */
export async function gitCherryPickAbort(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['cherry-pick', '--abort']);
}

/**
 * Continue a cherry-pick after resolving conflicts
 */
export async function gitCherryPickContinue(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['cherry-pick', '--continue']);
}

/**
 * Check if a cherry-pick is in progress
 */
export async function gitCherryPickInProgress(cwd: string): Promise<boolean> {
  if (!cwd) return false;
  // Check for CHERRY_PICK_HEAD file which indicates a cherry-pick in progress
  const result = await runGitCommand(cwd, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']);
  return result.success;
}

// ============================================================================
// HUNK/LINE STAGING (Interactive Staging)
// ============================================================================

/**
 * Stage specific lines from a file using git apply
 * @param patch The unified diff patch to apply to the index
 */
export async function gitApplyPatch(
  cwd: string,
  patch: string,
  options?: { cached?: boolean; reverse?: boolean }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!patch) return { success: false, error: 'No patch content specified' };

  const args = ['apply'];
  if (options?.cached) args.push('--cached');
  if (options?.reverse) args.push('--reverse');
  args.push('-');

  // Use spawn to pass the patch via stdin
  const { spawn } = await import('child_process');

  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (error: Error) => {
      resolve({
        success: false,
        error: error.message,
        stderr: stderr.trim(),
      });
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ success: true, output: stdout.trim(), stderr: stderr.trim() });
      } else {
        resolve({
          success: false,
          error: stderr.trim() || `Process exited with code ${code}`,
          stderr: stderr.trim(),
        });
      }
    });

    // Write the patch to stdin and close
    proc.stdin.write(patch);
    proc.stdin.end();
  });
}

/**
 * Get unified diff for a file that can be used for hunk staging
 * Returns diff with line numbers for selective staging
 */
export async function gitDiffForStaging(
  cwd: string,
  file: string,
  staged?: boolean
): Promise<{ success: boolean; diff?: string; error?: string }> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!file) return { success: false, error: 'No file specified' };

  const args = ['diff', '--no-color'];
  if (staged) args.push('--staged');
  args.push('--', file);

  const result = await runGitCommand(cwd, args);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, diff: result.output };
}

// ============================================================================
// GIT BLAME
// ============================================================================

export interface GitBlameLine {
  hash: string;
  author: string;
  authorTime: string;
  lineNumber: number;
  content: string;
}

/**
 * Get blame information for a file
 */
export async function gitBlame(
  cwd: string,
  file: string,
  options?: { startLine?: number; endLine?: number }
): Promise<{ success: boolean; lines: GitBlameLine[]; error?: string }> {
  if (!cwd) return { success: false, lines: [], error: 'No working directory specified' };
  if (!file) return { success: false, lines: [], error: 'No file specified' };

  const args = ['blame', '--porcelain'];

  if (options?.startLine && options?.endLine) {
    args.push(`-L${options.startLine},${options.endLine}`);
  }

  args.push('--', file);

  const result = await runGitCommand(cwd, args);
  if (!result.success) {
    return { success: false, lines: [], error: result.error };
  }

  // Parse porcelain blame output
  const lines: GitBlameLine[] = [];
  const output = result.output || '';
  const outputLines = output.split('\n');

  let currentHash = '';
  let currentAuthor = '';
  let currentTime = '';
  let lineNumber = 0;

  for (const line of outputLines) {
    // First line of a blame entry is: hash origLine finalLine [numLines]
    const hashMatch = line.match(/^([a-f0-9]{40})\s+\d+\s+(\d+)/);
    if (hashMatch) {
      currentHash = hashMatch[1];
      lineNumber = parseInt(hashMatch[2], 10);
      continue;
    }

    if (line.startsWith('author ')) {
      currentAuthor = line.substring(7);
      continue;
    }

    if (line.startsWith('author-time ')) {
      const timestamp = parseInt(line.substring(12), 10);
      currentTime = new Date(timestamp * 1000).toISOString();
      continue;
    }

    // The actual code line starts with a tab
    if (line.startsWith('\t')) {
      lines.push({
        hash: currentHash.substring(0, 8),
        author: currentAuthor,
        authorTime: currentTime,
        lineNumber,
        content: line.substring(1),
      });
    }
  }

  return { success: true, lines };
}

// ============================================================================
// TAG MANAGEMENT
// ============================================================================

// GitTag interface is imported from shared types

/**
 * List all tags with their details
 */
export async function gitTags(cwd: string): Promise<{ success: boolean; tags: GitTag[]; error?: string }> {
  if (!cwd) return { success: false, tags: [], error: 'No working directory specified' };

  // Get all tags with their commit hashes
  const result = await runGitCommand(cwd, ['tag', '-l', '--format=%(refname:short)|%(objecttype)|%(objectname:short)']);

  if (!result.success) {
    // Empty output is ok - means no tags
    if (result.error?.includes('No names found')) {
      return { success: true, tags: [] };
    }
    return { success: false, tags: [], error: result.error };
  }

  const tags: GitTag[] = [];
  const lines = (result.output || '').split('\n').filter(Boolean);

  for (const line of lines) {
    const [name, objectType, hash] = line.split('|');
    if (!name) continue;

    const tag: GitTag = {
      name,
      hash: hash || '',
      isAnnotated: objectType === 'tag',
    };

    // For annotated tags, get additional details
    if (tag.isAnnotated) {
      const detailResult = await runGitCommand(cwd, ['tag', '-l', name, '-n1', '--format=%(taggername)|%(taggerdate:iso)|%(contents:subject)']);
      if (detailResult.success && detailResult.output) {
        const [tagger, date, message] = detailResult.output.split('|');
        tag.tagger = tagger?.trim();
        tag.date = date?.trim();
        tag.message = message?.trim();
      }
    }

    tags.push(tag);
  }

  return { success: true, tags };
}

/**
 * Create a new tag
 * @param annotated If true, creates an annotated tag with a message
 */
export async function gitCreateTag(
  cwd: string,
  name: string,
  options?: { message?: string; commit?: string }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!name) return { success: false, error: 'No tag name specified' };

  // Sanitize tag name
  if (!/^[\w\-\/.]+$/.test(name)) {
    return { success: false, error: 'Invalid tag name' };
  }

  const args = ['tag'];

  if (options?.message) {
    args.push('-a', name, '-m', options.message);
  } else {
    args.push(name);
  }

  if (options?.commit) {
    if (!/^[a-fA-F0-9]+$/.test(options.commit)) {
      return { success: false, error: 'Invalid commit hash format' };
    }
    args.push(options.commit);
  }

  logger.info(`Creating tag: ${name}`);
  return runGitCommand(cwd, args);
}

/**
 * Delete a tag
 */
export async function gitDeleteTag(cwd: string, name: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!name) return { success: false, error: 'No tag name specified' };

  if (!/^[\w\-\/.]+$/.test(name)) {
    return { success: false, error: 'Invalid tag name' };
  }

  logger.info(`Deleting tag: ${name}`);
  return runGitCommand(cwd, ['tag', '-d', name]);
}

/**
 * Push a tag to remote
 */
export async function gitPushTag(cwd: string, name: string, remote: string = 'origin'): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!name) return { success: false, error: 'No tag name specified' };

  if (!/^[\w\-\/.]+$/.test(name)) {
    return { success: false, error: 'Invalid tag name' };
  }
  if (!/^[\w\-]+$/.test(remote)) {
    return { success: false, error: 'Invalid remote name' };
  }

  logger.info(`Pushing tag ${name} to ${remote}`);
  return runGitCommand(cwd, ['push', remote, name]);
}

/**
 * Push all tags to remote
 */
export async function gitPushAllTags(cwd: string, remote: string = 'origin'): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  if (!/^[\w\-]+$/.test(remote)) {
    return { success: false, error: 'Invalid remote name' };
  }

  logger.info(`Pushing all tags to ${remote}`);
  return runGitCommand(cwd, ['push', remote, '--tags']);
}

/**
 * Delete a tag from remote
 */
export async function gitDeleteRemoteTag(cwd: string, name: string, remote: string = 'origin'): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!name) return { success: false, error: 'No tag name specified' };

  if (!/^[\w\-\/.]+$/.test(name)) {
    return { success: false, error: 'Invalid tag name' };
  }
  if (!/^[\w\-]+$/.test(remote)) {
    return { success: false, error: 'Invalid remote name' };
  }

  logger.info(`Deleting remote tag ${name} from ${remote}`);
  return runGitCommand(cwd, ['push', remote, '--delete', `refs/tags/${name}`]);
}

// ============================================================================
// FILE HISTORY
// ============================================================================

export interface GitFileHistoryEntry {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  subject: string;
}

/**
 * Get commit history for a specific file
 */
export async function gitFileHistory(
  cwd: string,
  file: string,
  limit: number = 50
): Promise<{ success: boolean; commits: GitFileHistoryEntry[]; error?: string }> {
  if (!cwd) return { success: false, commits: [], error: 'No working directory specified' };
  if (!file) return { success: false, commits: [], error: 'No file specified' };

  const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit))));

  const result = await runGitCommand(cwd, [
    'log',
    `--max-count=${safeLimit}`,
    '--format=%H|%h|%an|%aI|%s',
    '--follow',
    '--',
    file,
  ]);

  if (!result.success) {
    return { success: false, commits: [], error: result.error };
  }

  const commits: GitFileHistoryEntry[] = [];
  const lines = (result.output || '').split('\n').filter(Boolean);

  for (const line of lines) {
    const [hash, shortHash, author, date, ...subjectParts] = line.split('|');
    if (hash && shortHash) {
      commits.push({
        hash,
        shortHash,
        author,
        date,
        subject: subjectParts.join('|'),
      });
    }
  }

  return { success: true, commits };
}

/**
 * Get file content at a specific commit
 */
export async function gitShowFile(cwd: string, file: string, commit: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!file) return { success: false, error: 'No file specified' };
  if (!commit) return { success: false, error: 'No commit specified' };

  if (!/^[a-fA-F0-9]+$/.test(commit)) {
    return { success: false, error: 'Invalid commit hash format' };
  }

  return runGitCommand(cwd, ['show', `${commit}:${file}`]);
}

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

export interface GitConflictFile {
  file: string;
  ourStatus: string;
  theirStatus: string;
}

/**
 * Get list of files with merge conflicts
 */
export async function gitConflictFiles(cwd: string): Promise<{ success: boolean; files: GitConflictFile[]; error?: string }> {
  if (!cwd) return { success: false, files: [], error: 'No working directory specified' };

  // Get unmerged files
  const result = await runGitCommand(cwd, ['diff', '--name-only', '--diff-filter=U']);

  if (!result.success) {
    return { success: false, files: [], error: result.error };
  }

  const files: GitConflictFile[] = [];
  const lines = (result.output || '').split('\n').filter(Boolean);

  for (const file of lines) {
    files.push({
      file,
      ourStatus: 'modified',
      theirStatus: 'modified',
    });
  }

  return { success: true, files };
}

/**
 * Accept "ours" version for a conflicted file
 */
export async function gitResolveOurs(cwd: string, file: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!file) return { success: false, error: 'No file specified' };

  logger.info(`Resolving conflict for ${file} with "ours"`);
  const checkoutResult = await runGitCommand(cwd, ['checkout', '--ours', '--', file]);
  if (!checkoutResult.success) return checkoutResult;

  return runGitCommand(cwd, ['add', '--', file]);
}

/**
 * Accept "theirs" version for a conflicted file
 */
export async function gitResolveTheirs(cwd: string, file: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!file) return { success: false, error: 'No file specified' };

  logger.info(`Resolving conflict for ${file} with "theirs"`);
  const checkoutResult = await runGitCommand(cwd, ['checkout', '--theirs', '--', file]);
  if (!checkoutResult.success) return checkoutResult;

  return runGitCommand(cwd, ['add', '--', file]);
}

/**
 * Mark a file as resolved (after manual conflict resolution)
 */
export async function gitMarkResolved(cwd: string, files: string[]): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!files || files.length === 0) return { success: false, error: 'No files specified' };

  logger.info(`Marking ${files.length} file(s) as resolved`);
  return runGitCommand(cwd, ['add', '--', ...files]);
}

// ============================================================================
// REBASE SUPPORT
// ============================================================================

/**
 * Rebase current branch onto another branch
 */
export async function gitRebase(cwd: string, onto: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!onto) return { success: false, error: 'No target branch specified' };

  if (!/^[\w\-\/.]+$/.test(onto)) {
    return { success: false, error: 'Invalid branch name' };
  }

  logger.info(`Rebasing onto: ${onto}`);
  return runGitCommand(cwd, ['rebase', onto]);
}

/**
 * Abort a rebase in progress
 */
export async function gitRebaseAbort(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['rebase', '--abort']);
}

/**
 * Continue a rebase after resolving conflicts
 */
export async function gitRebaseContinue(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['rebase', '--continue']);
}

/**
 * Skip the current commit during rebase
 */
export async function gitRebaseSkip(cwd: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  return runGitCommand(cwd, ['rebase', '--skip']);
}

/**
 * Check if a rebase is in progress
 */
export async function gitRebaseInProgress(cwd: string): Promise<boolean> {
  if (!cwd) return false;
  // Check for rebase-merge or rebase-apply directories
  const mergeResult = await runGitCommand(cwd, ['rev-parse', '--git-path', 'rebase-merge']);

  if (mergeResult.success && mergeResult.output) {
    // If either directory exists as a real path (not just returned), rebase is in progress
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const gitDir = await runGitCommand(cwd, ['rev-parse', '--git-dir']);
    if (gitDir.success && gitDir.output) {
      const rebaseMerge = join(cwd, gitDir.output.trim(), 'rebase-merge');
      const rebaseApply = join(cwd, gitDir.output.trim(), 'rebase-apply');
      return existsSync(rebaseMerge) || existsSync(rebaseApply);
    }
  }

  return false;
}

// ============================================================================
// REFLOG
// ============================================================================

export interface GitReflogEntry {
  hash: string;
  shortHash: string;
  action: string;
  message: string;
  date: string;
  index: number;
}

/**
 * Get reflog entries
 */
export async function gitReflog(
  cwd: string,
  limit: number = 50
): Promise<{ success: boolean; entries: GitReflogEntry[]; error?: string }> {
  if (!cwd) return { success: false, entries: [], error: 'No working directory specified' };

  const safeLimit = Math.max(1, Math.min(200, Math.floor(Number(limit))));

  const result = await runGitCommand(cwd, [
    'reflog',
    `--max-count=${safeLimit}`,
    '--format=%H|%h|%gD|%gs|%aI',
  ]);

  if (!result.success) {
    return { success: false, entries: [], error: result.error };
  }

  const entries: GitReflogEntry[] = [];
  const lines = (result.output || '').split('\n').filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const [hash, shortHash, ref, message, date] = line.split('|');
    if (hash && shortHash) {
      // Extract action from message (e.g., "commit:", "checkout:", "rebase:")
      const actionMatch = message?.match(/^(\w+):/);
      entries.push({
        hash,
        shortHash,
        action: actionMatch?.[1] || 'unknown',
        message: message || '',
        date: date || '',
        index: i,
      });
    }
  }

  return { success: true, entries };
}

/**
 * Reset to a reflog entry
 */
export async function gitResetToReflog(
  cwd: string,
  index: number,
  options?: { hard?: boolean; soft?: boolean }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['reset'];
  if (options?.hard) args.push('--hard');
  else if (options?.soft) args.push('--soft');
  args.push(`HEAD@{${index}}`);

  logger.info(`Resetting to reflog entry HEAD@{${index}}`);
  return runGitCommand(cwd, args);
}

// ============================================================================
// SUBMODULE SUPPORT
// ============================================================================

export interface GitSubmodule {
  path: string;
  url: string;
  branch?: string;
  hash: string;
  status: 'initialized' | 'uninitialized' | 'modified' | 'unknown';
}

/**
 * List all submodules
 */
export async function gitSubmodules(cwd: string): Promise<{ success: boolean; submodules: GitSubmodule[]; error?: string }> {
  if (!cwd) return { success: false, submodules: [], error: 'No working directory specified' };

  const result = await runGitCommand(cwd, ['submodule', 'status', '--recursive']);

  if (!result.success) {
    return { success: false, submodules: [], error: result.error };
  }

  const submodules: GitSubmodule[] = [];
  const lines = (result.output || '').split('\n').filter(Boolean);

  for (const line of lines) {
    // Format: [+-U ]hash path (branch)
    const match = line.match(/^([ +-U])([a-f0-9]+)\s+(.+?)(?:\s+\((.+)\))?$/);
    if (match) {
      const [, statusChar, hash, path, branch] = match;
      let status: GitSubmodule['status'] = 'unknown';

      switch (statusChar) {
        case ' ': status = 'initialized'; break;
        case '-': status = 'uninitialized'; break;
        case '+': status = 'modified'; break;
        case 'U': status = 'modified'; break;
      }

      submodules.push({
        path: path.trim(),
        url: '', // Will be filled from config
        branch: branch?.trim(),
        hash: hash.substring(0, 8),
        status,
      });
    }
  }

  // Get URLs from .gitmodules
  const configResult = await runGitCommand(cwd, ['config', '--file', '.gitmodules', '--get-regexp', 'url']);
  if (configResult.success && configResult.output) {
    const urlLines = configResult.output.split('\n').filter(Boolean);
    for (const urlLine of urlLines) {
      const urlMatch = urlLine.match(/^submodule\.(.+)\.url\s+(.+)$/);
      if (urlMatch) {
        const [, name, url] = urlMatch;
        const submodule = submodules.find(s => s.path === name || s.path.endsWith(`/${name}`));
        if (submodule) {
          submodule.url = url;
        }
      }
    }
  }

  return { success: true, submodules };
}

/**
 * Initialize submodules
 */
export async function gitSubmoduleInit(cwd: string, path?: string): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['submodule', 'init'];
  if (path) args.push('--', path);

  logger.info(`Initializing submodules${path ? `: ${path}` : ''}`);
  return runGitCommand(cwd, args);
}

/**
 * Update submodules
 */
export async function gitSubmoduleUpdate(
  cwd: string,
  options?: { init?: boolean; recursive?: boolean; remote?: boolean; path?: string }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  const args = ['submodule', 'update'];
  if (options?.init) args.push('--init');
  if (options?.recursive) args.push('--recursive');
  if (options?.remote) args.push('--remote');
  if (options?.path) args.push('--', options.path);

  logger.info(`Updating submodules`);
  return runGitCommand(cwd, args);
}

// ============================================================================
// WORKTREE SUPPORT
// ============================================================================

export interface GitWorktree {
  path: string;
  hash: string;
  branch?: string;
  isMain: boolean;
  isDetached: boolean;
}

/**
 * List all worktrees
 */
export async function gitWorktrees(cwd: string): Promise<{ success: boolean; worktrees: GitWorktree[]; error?: string }> {
  if (!cwd) return { success: false, worktrees: [], error: 'No working directory specified' };

  const result = await runGitCommand(cwd, ['worktree', 'list', '--porcelain']);

  if (!result.success) {
    return { success: false, worktrees: [], error: result.error };
  }

  const worktrees: GitWorktree[] = [];
  const output = result.output || '';
  const blocks = output.split('\n\n').filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n');
    const worktree: Partial<GitWorktree> = { isMain: false, isDetached: false };

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        worktree.path = line.substring(9);
      } else if (line.startsWith('HEAD ')) {
        worktree.hash = line.substring(5, 13);
      } else if (line.startsWith('branch ')) {
        worktree.branch = line.substring(7).replace('refs/heads/', '');
      } else if (line === 'bare') {
        worktree.isMain = true;
      } else if (line === 'detached') {
        worktree.isDetached = true;
      }
    }

    if (worktree.path) {
      // First worktree is the main one
      if (worktrees.length === 0) {
        worktree.isMain = true;
      }
      worktrees.push(worktree as GitWorktree);
    }
  }

  return { success: true, worktrees };
}

/**
 * Add a new worktree
 */
export async function gitWorktreeAdd(
  cwd: string,
  path: string,
  branch?: string,
  options?: { newBranch?: boolean; detach?: boolean }
): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!path) return { success: false, error: 'No path specified' };

  const args = ['worktree', 'add'];

  if (options?.detach) {
    args.push('--detach');
  } else if (branch && options?.newBranch) {
    args.push('-b', branch);
  }

  args.push(path);

  if (branch && !options?.newBranch && !options?.detach) {
    args.push(branch);
  }

  logger.info(`Adding worktree at ${path}`);
  return runGitCommand(cwd, args);
}

/**
 * Remove a worktree
 */
export async function gitWorktreeRemove(cwd: string, path: string, force?: boolean): Promise<GitStatus> {
  if (!cwd) return { success: false, error: 'No working directory specified' };
  if (!path) return { success: false, error: 'No path specified' };

  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(path);

  logger.info(`Removing worktree at ${path}`);
  return runGitCommand(cwd, args);
}

// ============================================================================
// COMMIT TEMPLATES
// ============================================================================

/**
 * Get commit template from .gitmessage or git config
 */
export async function gitCommitTemplate(cwd: string): Promise<{ success: boolean; template?: string; error?: string }> {
  if (!cwd) return { success: false, error: 'No working directory specified' };

  // First check git config for commit.template
  const configResult = await runGitCommand(cwd, ['config', 'commit.template']);

  if (configResult.success && configResult.output?.trim()) {
    const templatePath = configResult.output.trim();
    // Read the template file
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Handle relative paths
      const fullPath = path.isAbsolute(templatePath)
        ? templatePath
        : path.join(cwd, templatePath);

      const template = await fs.readFile(fullPath, 'utf-8');
      return { success: true, template };
    } catch {
      return { success: false, error: `Could not read template file: ${templatePath}` };
    }
  }

  // Check for .gitmessage in project root
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const gitmessagePath = path.join(cwd, '.gitmessage');
    const template = await fs.readFile(gitmessagePath, 'utf-8');
    return { success: true, template };
  } catch {
    // No template found, which is fine
    return { success: true, template: undefined };
  }
}

/**
 * Get conventional commit prefixes based on recent commits
 */
export async function gitConventionalPrefixes(cwd: string): Promise<{ success: boolean; prefixes: string[]; error?: string }> {
  if (!cwd) return { success: false, prefixes: [], error: 'No working directory specified' };

  // Standard conventional commit prefixes
  const standardPrefixes = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];

  // Get recent commit prefixes from the repo
  const result = await runGitCommand(cwd, ['log', '--oneline', '-100', '--format=%s']);

  if (!result.success) {
    return { success: true, prefixes: standardPrefixes };
  }

  const usedPrefixes = new Set<string>();
  const lines = (result.output || '').split('\n').filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\w+)(?:\([^)]+\))?:/);
    if (match) {
      usedPrefixes.add(match[1].toLowerCase());
    }
  }

  // Combine standard prefixes with any found in the repo, prioritizing used ones
  const allPrefixes = [...usedPrefixes, ...standardPrefixes.filter(p => !usedPrefixes.has(p))];

  return { success: true, prefixes: allPrefixes };
}
