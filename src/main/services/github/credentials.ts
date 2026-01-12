// ============================================================================
// GITHUB OAUTH CREDENTIALS MANAGEMENT
// ============================================================================

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';
import { Logger } from '../logger.js';
import type { GitHubUser } from '../../../shared/types/github.js';

const logger = new Logger('GitHubCredentials');

// ============================================================================
// SECURE STORE
// ============================================================================

// Type for GitHub store schema
interface GitHubStoreSchema {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  user?: GitHubUser;
  clientId?: string;
  clientSecret?: string;
}

// Create an encrypted store for GitHub credentials
export const githubStore = new Store<GitHubStoreSchema>({
  name: 'github-auth',
  encryptionKey: 'goodvibes-github-store',
});

// ============================================================================
// CREDENTIAL LOADING
// ============================================================================

// Cached credentials (loaded once at startup)
let cachedCredentials: { clientId: string | null; clientSecret: string | null } | null = null;

/**
 * Load OAuth credentials from environment or bundled config.
 *
 * For desktop apps like GoodVibes, embedding OAuth credentials is standard practice.
 * The developer creates ONE GitHub OAuth App for the entire GoodVibes application.
 * End users simply click "Login with GitHub" - zero setup required.
 *
 * Credential loading priority:
 * 1. Environment variables (GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET)
 * 2. Bundled config file (for production builds)
 * 3. Previously saved user credentials (legacy fallback)
 */
export function loadOAuthCredentials(): { clientId: string | null; clientSecret: string | null } {
  // Try environment variables first (development or custom deployment)
  const envClientId = process.env.GITHUB_CLIENT_ID;
  const envClientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (envClientId && envClientSecret) {
    logger.debug('Using OAuth credentials from environment variables');
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  // Try bundled config file (for production builds)
  try {
    const configPaths = [
      // Production: alongside the executable
      path.join(path.dirname(app.getPath('exe')), 'github-oauth.json'),
      // Development: in project root
      path.join(app.getAppPath(), 'github-oauth.json'),
      // Alternative: in resources
      path.join(process.resourcesPath || '', 'github-oauth.json'),
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.clientId && config.clientSecret) {
          logger.debug('Using OAuth credentials from bundled config', { path: configPath });
          return { clientId: config.clientId, clientSecret: config.clientSecret };
        }
      }
    }
  } catch {
    logger.debug('No bundled OAuth config found');
  }

  // Legacy fallback: check electron-store for user-saved credentials
  const storedClientId = githubStore.get('clientId');
  const storedClientSecret = githubStore.get('clientSecret');

  if (storedClientId && storedClientSecret) {
    logger.debug('Using legacy user-saved OAuth credentials');
    return { clientId: storedClientId, clientSecret: storedClientSecret };
  }

  return { clientId: null, clientSecret: null };
}

/**
 * Get OAuth credentials (cached for performance)
 */
export function getOAuthCredentialsInternal(): { clientId: string | null; clientSecret: string | null } {
  if (!cachedCredentials) {
    cachedCredentials = loadOAuthCredentials();
  }
  return cachedCredentials;
}

/**
 * Clear the cached credentials (used when credentials are updated)
 */
export function clearCredentialsCache(): void {
  cachedCredentials = null;
}

/**
 * Check if OAuth is configured (either bundled or user-provided)
 */
export function isOAuthConfigured(): boolean {
  const creds = getOAuthCredentialsInternal();
  return !!(creds.clientId && creds.clientSecret);
}
