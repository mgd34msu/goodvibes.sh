// ============================================================================
// RETRY UTILITY - Handles transient failures with exponential backoff
// ============================================================================
//
// This module provides robust retry logic for operations that may fail
// transiently (network issues, temporary file locks, etc.)
// ============================================================================

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds before first retry (default: 100ms) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds between retries (default: 5000ms) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Whether to add jitter to delays to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Predicate to determine if an error is retryable (default: all errors) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback invoked on each retry attempt */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal to cancel retries */
  signal?: AbortSignal;
}

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry' | 'signal'>> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: () => true,
};

/**
 * Error thrown when all retry attempts are exhausted
 */
export class RetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly lastError: unknown,
    public readonly attempts: number
  ) {
    super(message);
    this.name = 'RetryExhaustedError';
  }
}

/**
 * Error thrown when retry is aborted
 */
export class RetryAbortedError extends Error {
  constructor(message: string = 'Retry aborted') {
    super(message);
    this.name = 'RetryAbortedError';
  }
}

/**
 * Calculate delay with optional jitter
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  // Exponential backoff: delay = initial * (multiplier ^ attempt)
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  if (jitter) {
    // Add random jitter: 50% to 100% of calculated delay
    return Math.floor(cappedDelay * (0.5 + Math.random() * 0.5));
  }

  return cappedDelay;
}

/**
 * Sleep for a specified duration, respecting AbortSignal
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortedError());
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new RetryAbortedError());
    }, { once: true });
  });
}

/**
 * Execute an async operation with retry logic
 *
 * @param operation - Async function to execute
 * @param options - Retry configuration options
 * @returns Result of the operation
 * @throws RetryExhaustedError if all attempts fail
 * @throws RetryAbortedError if aborted via signal
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await retry(() => fetchData(url));
 *
 * // With custom options
 * const result = await retry(
 *   () => gitPush(repo),
 *   {
 *     maxAttempts: 5,
 *     initialDelayMs: 500,
 *     isRetryable: (err) => isNetworkError(err),
 *     onRetry: (err, attempt) => console.log(`Retry ${attempt}...`)
 *   }
 * );
 * ```
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    backoffMultiplier,
    jitter,
    isRetryable,
  } = { ...DEFAULT_OPTIONS, ...options };

  const { onRetry, signal } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check for abort before each attempt
    if (signal?.aborted) {
      throw new RetryAbortedError();
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if this is the last attempt
      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt) {
        break;
      }

      // Check if error is retryable
      if (!isRetryable(error)) {
        break;
      }

      // Calculate delay for next attempt
      const delayMs = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        backoffMultiplier,
        jitter
      );

      // Notify about retry
      onRetry?.(error, attempt + 1, delayMs);

      // Wait before retrying
      await sleep(delayMs, signal);
    }
  }

  throw new RetryExhaustedError(
    `Operation failed after ${maxAttempts} attempts`,
    lastError,
    maxAttempts
  );
}

/**
 * Execute a sync operation with retry logic (useful for simple synchronous operations)
 *
 * @param operation - Sync function to execute
 * @param options - Retry configuration options (excluding signal)
 * @returns Result of the operation
 */
export function retrySync<T>(
  operation: () => T,
  options: Omit<RetryOptions, 'signal'> = {}
): T {
  const {
    maxAttempts,
    isRetryable,
  } = { ...DEFAULT_OPTIONS, ...options };

  const { onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return operation();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxAttempts - 1;
      if (isLastAttempt || !isRetryable(error)) {
        break;
      }

      // Note: synchronous retry doesn't include delay (use async version for delays)
      onRetry?.(error, attempt + 1, 0);
    }
  }

  throw new RetryExhaustedError(
    `Operation failed after ${maxAttempts} attempts`,
    lastError,
    maxAttempts
  );
}

// ============================================================================
// PREDEFINED RETRY PREDICATES
// ============================================================================

/**
 * Check if error is a network-related error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('socket') ||
      message.includes('fetch failed') ||
      message.includes('dns')
    );
  }
  return false;
}

/**
 * Check if error is a file system lock error
 */
export function isFileLockError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('ebusy') ||
      message.includes('locked') ||
      message.includes('in use') ||
      message.includes('eacces') ||
      message.includes('permission denied')
    );
  }
  return false;
}

/**
 * Check if error is a Git-related transient error
 */
export function isGitTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('index.lock') ||
      message.includes('another git process') ||
      message.includes('resource busy') ||
      message.includes('unable to lock') ||
      isNetworkError(error)
    );
  }
  return false;
}

/**
 * Check if error is an HTTP 5xx or timeout error
 */
export function isServerError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Check for HTTP 5xx status codes
    if (/\b5\d{2}\b/.test(message)) {
      return true;
    }
    return (
      message.includes('timeout') ||
      message.includes('server error') ||
      message.includes('service unavailable') ||
      message.includes('bad gateway') ||
      message.includes('gateway timeout')
    );
  }
  return false;
}

/**
 * Combine multiple error predicates with OR logic
 */
export function anyOf(...predicates: ((error: unknown) => boolean)[]): (error: unknown) => boolean {
  return (error: unknown) => predicates.some(predicate => predicate(error));
}

/**
 * Create a predicate that checks error message against patterns
 */
export function matchesPattern(...patterns: (string | RegExp)[]): (error: unknown) => boolean {
  return (error: unknown) => {
    if (!(error instanceof Error)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return message.includes(pattern.toLowerCase());
      }
      return pattern.test(error.message);
    });
  };
}

// ============================================================================
// RETRY PRESETS - Common configurations
// ============================================================================

/**
 * Preset for network operations (API calls, etc.)
 */
export const NETWORK_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: anyOf(isNetworkError, isServerError),
};

/**
 * Preset for file system operations
 */
export const FILE_SYSTEM_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 5,
  initialDelayMs: 100,
  maxDelayMs: 2000,
  backoffMultiplier: 1.5,
  jitter: true,
  isRetryable: isFileLockError,
};

/**
 * Preset for Git operations
 */
export const GIT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 3000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: isGitTransientError,
};

/**
 * Preset for database operations
 */
export const DATABASE_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 50,
  maxDelayMs: 1000,
  backoffMultiplier: 2,
  jitter: true,
  isRetryable: matchesPattern('database is locked', 'busy', 'sqlite_busy'),
};
