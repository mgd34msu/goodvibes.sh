// ============================================================================
// TYPE GUARDS - Runtime type checking for proper type narrowing
// ============================================================================

import type {
  Session,
  SessionMessage,
  SessionStatus,
  SessionOutcome,
  MessageRole,
  Tag,
  Collection,
  SmartCollection,
  SmartCollectionRule,
  Prompt,
  AppNotification,
  QuickNote,
  KnowledgeEntry,
  ActivityLogEntry,
  TerminalInfo,
  TerminalStartResult,
  Analytics,
  GitStatus,
  GitFileChange,
  GitBranchInfo,
  GitCommitInfo,
  GitDetailedStatus,
  ParsedSessionEntry,
  SessionEntryType,
} from './types/index.js';

// ============================================================================
// PRIMITIVE TYPE GUARDS
// ============================================================================

/**
 * Check if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if value is a number (and not NaN)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if value is null or undefined
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

// ============================================================================
// SESSION TYPE GUARDS
// ============================================================================

const SESSION_STATUSES: SessionStatus[] = ['active', 'completed', 'error', 'unknown'];
const SESSION_OUTCOMES: SessionOutcome[] = ['success', 'partial', 'failed', 'abandoned'];
const MESSAGE_ROLES: MessageRole[] = ['user', 'assistant', 'system', 'tool', 'tool_result', 'thinking', 'unknown'];

/**
 * Check if value is a valid SessionStatus
 */
export function isSessionStatus(value: unknown): value is SessionStatus {
  return isString(value) && SESSION_STATUSES.includes(value as SessionStatus);
}

/**
 * Check if value is a valid SessionOutcome
 */
export function isSessionOutcome(value: unknown): value is SessionOutcome {
  return isString(value) && SESSION_OUTCOMES.includes(value as SessionOutcome);
}

/**
 * Check if value is a valid MessageRole
 */
export function isMessageRole(value: unknown): value is MessageRole {
  return isString(value) && MESSAGE_ROLES.includes(value as MessageRole);
}

/**
 * Check if value is a valid Session object
 */
export function isSession(value: unknown): value is Session {
  if (!isObject(value)) return false;

  return (
    isString(value.id) &&
    (isString(value.projectName) || value.projectName === null) &&
    (isString(value.filePath) || value.filePath === null) &&
    (isString(value.startTime) || value.startTime === null) &&
    (isString(value.endTime) || value.endTime === null) &&
    isNumber(value.messageCount) &&
    isNumber(value.tokenCount) &&
    isNumber(value.cost) &&
    isSessionStatus(value.status) &&
    isBoolean(value.favorite) &&
    isBoolean(value.archived)
  );
}

/**
 * Check if value is a valid SessionMessage object
 */
export function isSessionMessage(value: unknown): value is SessionMessage {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.sessionId) &&
    isNumber(value.messageIndex) &&
    isMessageRole(value.role) &&
    isString(value.content) &&
    isNumber(value.tokenCount)
  );
}

// ============================================================================
// TAG & COLLECTION TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid Tag object
 */
export function isTag(value: unknown): value is Tag {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.name) &&
    isString(value.color) &&
    (isNumber(value.parentId) || value.parentId === null) &&
    isString(value.createdAt)
  );
}

/**
 * Check if value is a valid Collection object
 */
export function isCollection(value: unknown): value is Collection {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.name) &&
    isString(value.color) &&
    isString(value.icon) &&
    (isNumber(value.parentId) || value.parentId === null) &&
    isNumber(value.sortOrder)
  );
}

/**
 * Check if value is a valid SmartCollectionRule object
 */
export function isSmartCollectionRule(value: unknown): value is SmartCollectionRule {
  if (!isObject(value)) return false;

  const validTypes = ['TAG', 'PROJECT', 'DATE_RANGE', 'RATING', 'COST', 'OUTCOME'];
  return isString(value.type) && validTypes.includes(value.type);
}

/**
 * Check if value is a valid SmartCollection object
 */
export function isSmartCollection(value: unknown): value is SmartCollection {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.name) &&
    isString(value.color) &&
    isString(value.icon) &&
    isArray(value.rules) &&
    (value.rules as unknown[]).every(isSmartCollectionRule) &&
    (value.matchMode === 'all' || value.matchMode === 'any')
  );
}

// ============================================================================
// PROMPT & NOTE TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid Prompt object
 */
export function isPrompt(value: unknown): value is Prompt {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.title) &&
    isString(value.content) &&
    isString(value.category) &&
    isNumber(value.useCount) &&
    (isString(value.lastUsed) || value.lastUsed === null)
  );
}

/**
 * Check if value is a valid QuickNote object
 */
export function isQuickNote(value: unknown): value is QuickNote {
  if (!isObject(value)) return false;

  const validStatuses = ['active', 'completed', 'archived'];
  const validPriorities = ['low', 'normal', 'high'];

  return (
    isNumber(value.id) &&
    isString(value.content) &&
    (isString(value.sessionId) || value.sessionId === null) &&
    isString(value.status) &&
    validStatuses.includes(value.status as string) &&
    isString(value.priority) &&
    validPriorities.includes(value.priority as string)
  );
}

// ============================================================================
// NOTIFICATION TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid AppNotification object
 */
export function isAppNotification(value: unknown): value is AppNotification {
  if (!isObject(value)) return false;

  const validTypes = ['info', 'success', 'warning', 'error', 'budget', 'session'];
  const validPriorities = ['low', 'normal', 'high'];

  return (
    isNumber(value.id) &&
    isString(value.type) &&
    validTypes.includes(value.type as string) &&
    isString(value.title) &&
    (isString(value.message) || value.message === null) &&
    isString(value.priority) &&
    validPriorities.includes(value.priority as string) &&
    isBoolean(value.read) &&
    isBoolean(value.dismissed)
  );
}

// ============================================================================
// KNOWLEDGE TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid KnowledgeEntry object
 */
export function isKnowledgeEntry(value: unknown): value is KnowledgeEntry {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.title) &&
    isString(value.content) &&
    (isString(value.category) || value.category === null) &&
    isNumber(value.viewCount)
  );
}

// ============================================================================
// ACTIVITY TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid ActivityLogEntry object
 */
export function isActivityLogEntry(value: unknown): value is ActivityLogEntry {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.type) &&
    (isString(value.sessionId) || value.sessionId === null) &&
    isString(value.description) &&
    isString(value.timestamp)
  );
}

// ============================================================================
// TERMINAL TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid TerminalInfo object
 */
export function isTerminalInfo(value: unknown): value is TerminalInfo {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isString(value.name) &&
    isString(value.cwd) &&
    value.startTime instanceof Date
  );
}

/**
 * Check if value is a valid TerminalStartResult object
 */
export function isTerminalStartResult(value: unknown): value is TerminalStartResult {
  if (!isObject(value)) return false;

  // Either has an error OR has valid terminal info
  if (isString(value.error)) {
    return true;
  }

  return (
    (isNumber(value.id) || value.id === undefined) &&
    (isString(value.name) || value.name === undefined) &&
    (isString(value.cwd) || value.cwd === undefined)
  );
}

// ============================================================================
// ANALYTICS TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid Analytics object
 */
export function isAnalytics(value: unknown): value is Analytics {
  if (!isObject(value)) return false;

  return (
    isNumber(value.totalSessions) &&
    isNumber(value.totalTokens) &&
    isNumber(value.totalCost) &&
    isNumber(value.dailyCost) &&
    isNumber(value.avgTokensPerSession) &&
    isObject(value.costByProject) &&
    isArray(value.sessionsOverTime)
  );
}

// ============================================================================
// GIT TYPE GUARDS
// ============================================================================

/**
 * Check if value is a valid GitStatus object
 */
export function isGitStatus(value: unknown): value is GitStatus {
  if (!isObject(value)) return false;

  return (
    isBoolean(value.success) &&
    (isString(value.output) || value.output === undefined) &&
    (isString(value.error) || value.error === undefined)
  );
}

/**
 * Check if value is a valid GitFileChange object
 */
export function isGitFileChange(value: unknown): value is GitFileChange {
  if (!isObject(value)) return false;

  const validStatuses = ['modified', 'added', 'deleted', 'renamed', 'copied', 'untracked', 'ignored'];

  return (
    isString(value.status) &&
    validStatuses.includes(value.status as string) &&
    isString(value.file) &&
    isBoolean(value.staged)
  );
}

/**
 * Check if value is a valid GitBranchInfo object
 */
export function isGitBranchInfo(value: unknown): value is GitBranchInfo {
  if (!isObject(value)) return false;

  return (
    isString(value.name) &&
    isString(value.hash) &&
    isBoolean(value.isCurrent) &&
    isBoolean(value.isRemote)
  );
}

/**
 * Check if value is a valid GitCommitInfo object
 */
export function isGitCommitInfo(value: unknown): value is GitCommitInfo {
  if (!isObject(value)) return false;

  return (
    isString(value.hash) &&
    isString(value.shortHash) &&
    isString(value.author) &&
    isString(value.email) &&
    isString(value.date) &&
    isString(value.subject)
  );
}

/**
 * Check if value is a valid GitDetailedStatus object
 */
export function isGitDetailedStatus(value: unknown): value is GitDetailedStatus {
  if (!isObject(value)) return false;

  return (
    isBoolean(value.success) &&
    isArray(value.staged) &&
    isArray(value.unstaged) &&
    isArray(value.untracked) &&
    isString(value.branch) &&
    isNumber(value.ahead) &&
    isNumber(value.behind)
  );
}

// ============================================================================
// SESSION PREVIEW TYPE GUARDS
// ============================================================================

const SESSION_ENTRY_TYPES: SessionEntryType[] = [
  'user', 'assistant', 'tool_use', 'tool_result', 'thinking', 'system', 'summary', 'unknown'
];

/**
 * Check if value is a valid SessionEntryType
 */
export function isSessionEntryType(value: unknown): value is SessionEntryType {
  return isString(value) && SESSION_ENTRY_TYPES.includes(value as SessionEntryType);
}

/**
 * Check if value is a valid ParsedSessionEntry object
 */
export function isParsedSessionEntry(value: unknown): value is ParsedSessionEntry {
  if (!isObject(value)) return false;

  return (
    isNumber(value.id) &&
    isSessionEntryType(value.type) &&
    isString(value.content)
  );
}

// ============================================================================
// ARRAY TYPE GUARDS
// ============================================================================

/**
 * Check if value is an array of Sessions
 */
export function isSessionArray(value: unknown): value is Session[] {
  return isArray(value) && value.every(isSession);
}

/**
 * Check if value is an array of Tags
 */
export function isTagArray(value: unknown): value is Tag[] {
  return isArray(value) && value.every(isTag);
}

/**
 * Check if value is an array of SessionMessages
 */
export function isSessionMessageArray(value: unknown): value is SessionMessage[] {
  return isArray(value) && value.every(isSessionMessage);
}

// ============================================================================
// UTILITY TYPE GUARDS
// ============================================================================

/**
 * Assert that a value is of a specific type, throwing if not
 */
export function assertType<T>(
  value: unknown,
  guard: (v: unknown) => v is T,
  message = 'Type assertion failed'
): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(message);
  }
}

/**
 * Safe cast with type guard, returns undefined if guard fails
 */
export function safeCast<T>(value: unknown, guard: (v: unknown) => v is T): T | undefined {
  return guard(value) ? value : undefined;
}

/**
 * Narrow an array to only elements that pass the type guard
 */
export function filterByType<T>(arr: unknown[], guard: (v: unknown) => v is T): T[] {
  return arr.filter(guard);
}
