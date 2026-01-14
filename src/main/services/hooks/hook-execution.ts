// ============================================================================
// HOOKS SERVICE - Hook Execution Logic
// ============================================================================

import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../logger.js';
import { DEFAULT_HOOK_TIMEOUT_MS } from '../../../shared/constants.js';
import { recordHookExecution } from '../../database/primitives.js';
import type { HookConfig } from './types.js';
import type { HookExecutionContext, HookExecutionResult } from './types.js';

const logger = new Logger('HookExecution');

/**
 * Manages hook execution lifecycle including process spawning,
 * timeout handling, and result collection.
 */
export class HookExecutor {
  private runningProcesses: Map<number, ChildProcess> = new Map();
  private readonly DEFAULT_TIMEOUT_MS = DEFAULT_HOOK_TIMEOUT_MS;

  /**
   * Execute all matching hooks for a given event context
   */
  async executeHooks(
    hooks: HookConfig[],
    context: HookExecutionContext,
    onExecuted?: (result: HookExecutionResult) => void
  ): Promise<HookExecutionResult[]> {
    const results: HookExecutionResult[] = [];

    for (const hook of hooks) {
      if (!this.matchesContext(hook, context)) {
        continue;
      }

      const result = await this.executeHook(hook, context);
      results.push(result);

      // Record execution in database
      recordHookExecution(
        hook.id,
        result.success ? 'success' : (result.exitCode === null ? 'timeout' : 'failure')
      );

      if (onExecuted) {
        onExecuted(result);
      }

      // If hook returned exit code 2, it wants to block the action
      if (result.shouldBlock) {
        logger.info(`Hook ${hook.name} requested to block action`);
        break;
      }
    }

    return results;
  }

  /**
   * Execute a single hook and return the result
   */
  async executeHook(hook: HookConfig, context: HookExecutionContext): Promise<HookExecutionResult> {
    const startTime = Date.now();

    logger.debug(`Executing hook: ${hook.name}`, { eventType: hook.eventType });

    return new Promise((resolve) => {
      const timeout = hook.timeout || this.DEFAULT_TIMEOUT_MS;
      let stdout = '';
      let stderr = '';
      let resolved = false;

      // Prepare environment
      const env = {
        ...process.env,
        GOODVIBES_HOOK_EVENT: context.eventType,
        GOODVIBES_HOOK_TOOL: context.toolName || '',
        GOODVIBES_HOOK_INPUT: context.toolInput ? JSON.stringify(context.toolInput) : '',
        GOODVIBES_HOOK_RESULT: context.toolResult || '',
        GOODVIBES_SESSION_ID: context.sessionId || '',
        GOODVIBES_PROJECT_PATH: context.projectPath || '',
        GOODVIBES_TIMESTAMP: context.timestamp.toString(),
      };

      // Spawn the command
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      const shellFlag = process.platform === 'win32' ? '/c' : '-c';

      const child = spawn(shell, [shellFlag, hook.command], {
        env,
        cwd: context.projectPath || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.runningProcesses.set(hook.id, child);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          child.kill('SIGKILL');
          this.runningProcesses.delete(hook.id);

          resolve({
            hookId: hook.id,
            hookName: hook.name,
            success: false,
            exitCode: null,
            stdout,
            stderr: stderr + '\n[Hook timed out]',
            durationMs: Date.now() - startTime,
            shouldBlock: false,
          });
        }
      }, timeout);

      // Collect stdout
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle completion
      child.on('close', (exitCode) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          this.runningProcesses.delete(hook.id);

          resolve({
            hookId: hook.id,
            hookName: hook.name,
            success: exitCode === 0,
            exitCode,
            stdout,
            stderr,
            durationMs: Date.now() - startTime,
            shouldBlock: exitCode === 2, // Exit code 2 means block the action
          });
        }
      });

      // Handle errors
      child.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          this.runningProcesses.delete(hook.id);

          resolve({
            hookId: hook.id,
            hookName: hook.name,
            success: false,
            exitCode: null,
            stdout,
            stderr: stderr + `\n[Error: ${error.message}]`,
            durationMs: Date.now() - startTime,
            shouldBlock: false,
          });
        }
      });
    });
  }

  /**
   * Check if a hook matches the execution context
   */
  matchesContext(hook: HookConfig, context: HookExecutionContext): boolean {
    if (!hook.matcher || hook.matcher === '*') {
      return true;
    }

    // For tool events, match against tool name
    if (context.toolName) {
      const pattern = hook.matcher;

      // Handle patterns like "Bash(*)" or "Edit(src/*)"
      const match = pattern.match(/^(\w+)\((.*)\)$/);
      if (match) {
        const [, toolPattern, argPattern] = match;

        // Check tool name
        if (toolPattern !== '*' && toolPattern !== context.toolName) {
          return false;
        }

        // Check argument pattern (simplified glob matching)
        if (argPattern !== '*' && context.toolInput) {
          const inputStr = JSON.stringify(context.toolInput);
          const regex = new RegExp(argPattern.replace(/\*/g, '.*'));
          return regex.test(inputStr);
        }

        return true;
      }

      // Simple tool name match
      return hook.matcher === context.toolName;
    }

    return true;
  }

  /**
   * Kill a running hook process by ID
   */
  killHook(hookId: number): boolean {
    const proc = this.runningProcesses.get(hookId);
    if (proc) {
      proc.kill('SIGKILL');
      this.runningProcesses.delete(hookId);
      logger.info(`Killed hook process: ${hookId}`);
      return true;
    }
    return false;
  }

  /**
   * Kill all running hook processes
   */
  killAllHooks(): void {
    for (const [hookId, proc] of this.runningProcesses) {
      proc.kill('SIGKILL');
      logger.debug(`Killed hook process: ${hookId}`);
    }
    this.runningProcesses.clear();
  }

  /**
   * Get the number of currently running hooks
   */
  getRunningCount(): number {
    return this.runningProcesses.size;
  }
}
