// ============================================================================
// GITHUB AUTHENTICATION
// ============================================================================

import { BrowserWindow, app, shell } from 'electron';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { Logger } from '../logger.js';
import type {
  GitHubUser,
  GitHubAuthState,
  GitHubAuthResult,
} from '../../../shared/types/github.js';
import {
  GITHUB_AUTHORIZE_URL,
  DEFAULT_SCOPES,
  OAUTH_CALLBACK_URL,
  OAUTH_TIMEOUT_MS,
} from './types.js';
import {
  githubStore,
  getOAuthCredentialsInternal,
  clearCredentialsCache,
} from './credentials.js';
import {
  exchangeCodeForTokens,
  fetchGitHubUser,
  verifyToken,
  refreshAccessToken,
} from './api.js';

const logger = new Logger('GitHubAuth');

// ============================================================================
// STATE
// ============================================================================

let authState: GitHubAuthState = {
  isAuthenticated: false,
  user: null,
  accessToken: null,
  tokenExpiresAt: null,
};

// ============================================================================
// PENDING OAUTH CALLBACK STATE
// ============================================================================

interface PendingOAuthCallback {
  state: string;
  scopes: string[];
  resolve: (result: GitHubAuthResult) => void;
  timeoutId: NodeJS.Timeout;
}

let pendingOAuthCallback: PendingOAuthCallback | null = null;

/**
 * Set pending OAuth callback (called when opening external browser for OAuth)
 */
export function setPendingOAuthCallback(
  state: string,
  scopes: string[],
  resolve: (result: GitHubAuthResult) => void
): void {
  if (pendingOAuthCallback) {
    clearTimeout(pendingOAuthCallback.timeoutId);
    pendingOAuthCallback.resolve({
      success: false,
      error: 'OAuth flow was superseded by a new authentication attempt',
    });
  }

  const timeoutId = setTimeout(() => {
    if (pendingOAuthCallback && pendingOAuthCallback.state === state) {
      logger.warn('OAuth callback timeout reached');
      pendingOAuthCallback.resolve({
        success: false,
        error: 'OAuth flow timed out. Please try again.',
      });
      pendingOAuthCallback = null;
    }
  }, OAUTH_TIMEOUT_MS);

  pendingOAuthCallback = {
    state,
    scopes,
    resolve,
    timeoutId,
  };

  logger.debug('Pending OAuth callback set', { state });
}

/**
 * Handle OAuth callback from the custom protocol (goodvibes://oauth/callback)
 */
export async function handleOAuthCallback(
  code: string | null,
  state: string | null,
  error: string | null,
  errorDescription: string | null
): Promise<void> {
  logger.info('OAuth callback received', { hasCode: !!code, hasError: !!error, state });

  if (!pendingOAuthCallback) {
    logger.warn('OAuth callback received but no pending callback');
    return;
  }

  if (state !== pendingOAuthCallback.state) {
    logger.error('OAuth state mismatch', {
      expected: pendingOAuthCallback.state,
      received: state,
    });
    pendingOAuthCallback.resolve({
      success: false,
      error: 'OAuth state mismatch. This may indicate a security issue. Please try again.',
    });
    clearTimeout(pendingOAuthCallback.timeoutId);
    pendingOAuthCallback = null;
    return;
  }

  clearTimeout(pendingOAuthCallback.timeoutId);

  if (error) {
    logger.error('OAuth callback error', { error, errorDescription });
    pendingOAuthCallback.resolve({
      success: false,
      error: errorDescription || error,
    });
    pendingOAuthCallback = null;
    return;
  }

  if (!code) {
    logger.error('OAuth callback missing code');
    pendingOAuthCallback.resolve({
      success: false,
      error: 'Authorization code not received',
    });
    pendingOAuthCallback = null;
    return;
  }

  const { clientId, clientSecret } = getOAuthCredentialsInternal();

  if (!clientId || !clientSecret) {
    pendingOAuthCallback.resolve({
      success: false,
      error: 'OAuth credentials not configured',
    });
    pendingOAuthCallback = null;
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret);

    if (!tokens) {
      pendingOAuthCallback.resolve({
        success: false,
        error: 'Failed to exchange authorization code for access token',
      });
      pendingOAuthCallback = null;
      return;
    }

    const user = await fetchGitHubUser(tokens.access_token);

    if (!user) {
      pendingOAuthCallback.resolve({
        success: false,
        error: 'Failed to fetch user information',
      });
      pendingOAuthCallback = null;
      return;
    }

    // Store credentials
    githubStore.set('accessToken', tokens.access_token);
    if (tokens.refresh_token) {
      githubStore.set('refreshToken', tokens.refresh_token);
    }
    if (tokens.expires_in) {
      const expiresAt = Date.now() + tokens.expires_in * 1000;
      githubStore.set('tokenExpiresAt', expiresAt);
    }
    githubStore.set('user', user);

    // Update state
    authState = {
      isAuthenticated: true,
      user,
      accessToken: tokens.access_token,
      tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    };

    logger.info('GitHub authentication successful via protocol callback', { user: user.login });

    pendingOAuthCallback.resolve({
      success: true,
      user,
    });
    pendingOAuthCallback = null;
  } catch (err) {
    logger.error('OAuth callback processing failed', err);
    if (pendingOAuthCallback) {
      pendingOAuthCallback.resolve({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error during authentication',
      });
      pendingOAuthCallback = null;
    }
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the GitHub service by loading any stored credentials
 */
export async function initializeGitHub(): Promise<void> {
  logger.info('Initializing GitHub service');

  try {
    const storedToken = githubStore.get('accessToken');
    const storedUser = githubStore.get('user');
    const tokenExpiresAt = githubStore.get('tokenExpiresAt');

    if (storedToken && storedUser) {
      const isValid = await verifyToken(storedToken);

      if (isValid) {
        authState = {
          isAuthenticated: true,
          user: storedUser,
          accessToken: storedToken,
          tokenExpiresAt: tokenExpiresAt ?? null,
        };
        logger.info('GitHub authentication restored from storage', { user: storedUser.login });
      } else {
        logger.info('Stored GitHub token is invalid, clearing credentials');
        await clearStoredCredentials();
      }
    }
  } catch (error) {
    logger.error('Failed to initialize GitHub service', error);
    await clearStoredCredentials();
  }
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Open a BrowserWindow for OAuth authentication
 */
async function openOAuthWindow(authUrl: string, expectedState: string): Promise<string | null> {
  return new Promise((resolve) => {
    const authWindow = new BrowserWindow({
      width: 600,
      height: 800,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    authWindow.setMenu(null);

    const handleNavigation = (url: string) => {
      try {
        const parsedUrl = new URL(url);

        if (parsedUrl.host === 'localhost' || parsedUrl.host === '127.0.0.1') {
          const code = parsedUrl.searchParams.get('code');
          const state = parsedUrl.searchParams.get('state');
          const error = parsedUrl.searchParams.get('error');

          if (error) {
            logger.error('OAuth error', { error, description: parsedUrl.searchParams.get('error_description') });
            authWindow.close();
            resolve(null);
            return;
          }

          if (state !== expectedState) {
            logger.error('OAuth state mismatch', { expected: expectedState, received: state });
            authWindow.close();
            resolve(null);
            return;
          }

          if (code) {
            authWindow.close();
            resolve(code);
            return;
          }
        }
      } catch {
        // Not a valid URL, ignore
      }
    };

    authWindow.webContents.on('will-redirect', (event, url) => {
      handleNavigation(url);
    });

    authWindow.webContents.on('will-navigate', (event, url) => {
      handleNavigation(url);
    });

    authWindow.on('closed', () => {
      resolve(null);
    });

    authWindow.loadURL(authUrl);
  });
}

/**
 * Authenticate with GitHub using OAuth flow
 */
export async function authenticateWithGitHub(options?: {
  scopes?: string[];
  useExternalBrowser?: boolean;
}): Promise<GitHubAuthResult> {
  logger.info('Starting GitHub OAuth flow');

  const { clientId, clientSecret } = getOAuthCredentialsInternal();

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: 'GitHub integration is not configured. The application developer needs to set up GitHub OAuth credentials.',
    };
  }

  const scopes = options?.scopes || DEFAULT_SCOPES;
  const useExternalBrowser = options?.useExternalBrowser ?? true;

  try {
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = new URL(GITHUB_AUTHORIZE_URL);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('allow_signup', 'true');

    if (useExternalBrowser) {
      authUrl.searchParams.set('redirect_uri', OAUTH_CALLBACK_URL);

      return new Promise<GitHubAuthResult>((resolve) => {
        setPendingOAuthCallback(state, scopes, resolve);

        shell.openExternal(authUrl.toString()).catch((err) => {
          logger.error('Failed to open external browser', err);
          resolve({
            success: false,
            error: 'Failed to open browser for authentication',
          });
        });

        logger.info('OAuth flow started in external browser');
      });
    } else {
      const code = await openOAuthWindow(authUrl.toString(), state);

      if (!code) {
        return {
          success: false,
          error: 'OAuth flow was cancelled or failed',
        };
      }

      const tokens = await exchangeCodeForTokens(code, clientId, clientSecret);

      if (!tokens) {
        return {
          success: false,
          error: 'Failed to exchange authorization code for access token',
        };
      }

      const user = await fetchGitHubUser(tokens.access_token);

      if (!user) {
        return {
          success: false,
          error: 'Failed to fetch user information',
        };
      }

      githubStore.set('accessToken', tokens.access_token);
      if (tokens.refresh_token) {
        githubStore.set('refreshToken', tokens.refresh_token);
      }
      if (tokens.expires_in) {
        const expiresAt = Date.now() + tokens.expires_in * 1000;
        githubStore.set('tokenExpiresAt', expiresAt);
      }
      githubStore.set('user', user);

      authState = {
        isAuthenticated: true,
        user,
        accessToken: tokens.access_token,
        tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      };

      logger.info('GitHub authentication successful', { user: user.login });

      return {
        success: true,
        user,
      };
    }
  } catch (error) {
    logger.error('GitHub OAuth flow failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during authentication',
    };
  }
}

// ============================================================================
// LOGOUT & TOKEN MANAGEMENT
// ============================================================================

/**
 * Clear all stored credentials
 */
export async function clearStoredCredentials(): Promise<void> {
  githubStore.delete('accessToken');
  githubStore.delete('refreshToken');
  githubStore.delete('tokenExpiresAt');
  githubStore.delete('user');
}

/**
 * Logout from GitHub and clear stored credentials
 */
export async function logout(): Promise<void> {
  logger.info('Logging out from GitHub');

  await clearStoredCredentials();

  authState = {
    isAuthenticated: false,
    user: null,
    accessToken: null,
    tokenExpiresAt: null,
  };

  logger.info('GitHub logout complete');
}

/**
 * Refresh the access token if it's expired or about to expire
 */
export async function refreshTokenIfNeeded(): Promise<boolean> {
  const refreshToken = githubStore.get('refreshToken');
  const tokenExpiresAt = githubStore.get('tokenExpiresAt');

  if (!refreshToken) {
    return authState.isAuthenticated;
  }

  const fiveMinutes = 5 * 60 * 1000;
  const isExpiringSoon = tokenExpiresAt && Date.now() > tokenExpiresAt - fiveMinutes;

  if (!isExpiringSoon) {
    return authState.isAuthenticated;
  }

  logger.info('Refreshing GitHub access token');

  const { clientId, clientSecret } = getOAuthCredentialsInternal();

  if (!clientId || !clientSecret) {
    logger.error('Cannot refresh token: OAuth credentials not configured');
    return false;
  }

  const data = await refreshAccessToken(refreshToken, clientId, clientSecret);

  if (!data) {
    return false;
  }

  githubStore.set('accessToken', data.access_token);
  if (data.refresh_token) {
    githubStore.set('refreshToken', data.refresh_token);
  }
  if (data.expires_in) {
    const expiresAt = Date.now() + data.expires_in * 1000;
    githubStore.set('tokenExpiresAt', expiresAt);
  }

  authState.accessToken = data.access_token;
  authState.tokenExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : null;

  logger.info('GitHub token refreshed successfully');
  return true;
}

// ============================================================================
// GETTERS
// ============================================================================

/**
 * Get the current access token
 */
export function getAccessToken(): string | null {
  return authState.accessToken;
}

/**
 * Check if the user is authenticated
 */
export function isAuthenticated(): boolean {
  return authState.isAuthenticated;
}

/**
 * Get the current authenticated user
 */
export function getCurrentUser(): GitHubUser | null {
  return authState.user;
}

/**
 * Get the full auth state
 */
export function getAuthState(): GitHubAuthState {
  return { ...authState };
}

// ============================================================================
// OAUTH CONFIGURATION
// ============================================================================

/**
 * Set OAuth credentials (legacy support only)
 * @deprecated Use environment variables or bundled config instead
 */
export function setOAuthCredentials(clientId: string, clientSecret: string): void {
  githubStore.set('clientId', clientId);
  githubStore.set('clientSecret', clientSecret);
  clearCredentialsCache();
  logger.info('GitHub OAuth credentials updated (legacy mode)');
}

/**
 * Get OAuth configuration status
 */
export function getOAuthConfig(): {
  isConfigured: boolean;
  source: 'environment' | 'bundled' | 'user' | 'none';
  clientId: string | null;
} {
  const envClientId = process.env.GITHUB_CLIENT_ID;
  const envClientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    return {
      isConfigured: true,
      source: 'environment',
      clientId: envClientId,
    };
  }

  // Check bundled config
  try {
    const configPaths = [
      path.join(path.dirname(app.getPath('exe')), 'github-oauth.json'),
      path.join(app.getAppPath(), 'github-oauth.json'),
      path.join(process.resourcesPath || '', 'github-oauth.json'),
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.clientId && config.clientSecret) {
          return {
            isConfigured: true,
            source: 'bundled',
            clientId: config.clientId,
          };
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Check legacy user-saved credentials
  const storedClientId = githubStore.get('clientId');
  const storedClientSecret = githubStore.get('clientSecret');

  if (storedClientId && storedClientSecret) {
    return {
      isConfigured: true,
      source: 'user',
      clientId: storedClientId,
    };
  }

  return {
    isConfigured: false,
    source: 'none',
    clientId: null,
  };
}

/**
 * Clear legacy user-saved OAuth credentials
 */
export function clearOAuthCredentials(): void {
  githubStore.delete('clientId');
  githubStore.delete('clientSecret');
  clearCredentialsCache();
  logger.info('Legacy GitHub OAuth credentials cleared');
}
