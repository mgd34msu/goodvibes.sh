// ============================================================================
// GITHUB SERVICE - Main exports
// ============================================================================

// Re-export credentials functions
export { isOAuthConfigured } from './credentials.js';

// Re-export auth functions (includes re-exports from other modules)
export {
  initializeGitHub,
  authenticateWithGitHub,
  handleOAuthCallback,
  setPendingOAuthCallback,
  logout,
  refreshTokenIfNeeded,
  getAccessToken,
  isAuthenticated,
  getCurrentUser,
  getAuthState,
  setOAuthCredentials,
  getOAuthConfig,
  clearOAuthCredentials,
  clearStoredCredentials,
} from './auth.js';

// Re-export types
export type { AuthenticateOptions } from './auth.js';
export type { OAuthCredentialSource, OAuthConfigStatus } from './oauth-config.js';
