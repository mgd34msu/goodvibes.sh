// ============================================================================
// GITHUB SERVICE - Main exports
// ============================================================================

// Re-export credentials functions
export { isOAuthConfigured } from './credentials.js';

// Re-export auth functions
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
} from './auth.js';
