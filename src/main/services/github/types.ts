// ============================================================================
// GITHUB TYPES AND CONSTANTS
// ============================================================================

// ============================================================================
// CONSTANTS
// ============================================================================

export const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
export const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_API_URL = 'https://api.github.com';

// Default scopes needed for full GitHub integration
export const DEFAULT_SCOPES = ['repo', 'read:user', 'read:org', 'workflow'];

// Custom protocol callback URL
export const OAUTH_CALLBACK_URL = 'goodvibes://oauth/callback';

// OAuth timeout - if callback doesn't arrive within 5 minutes, abort
export const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
