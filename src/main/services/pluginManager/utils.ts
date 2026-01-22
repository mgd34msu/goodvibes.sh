// ============================================================================
// PLUGIN MANAGER UTILITIES
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { PluginManifest } from './types.js';
import { Logger } from '../logger.js';

const logger = new Logger('PluginUtils');

// ============================================================================
// PATH UTILITIES
// ============================================================================

/**
 * Get the user-scope plugins directory
 */
export function getUserPluginsDir(): string {
  const homeDir = app.getPath('home');
  return path.join(homeDir, '.claude', 'plugins');
}

/**
 * Get the project-scope plugins directory
 */
export function getProjectPluginsDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'plugins');
}

/**
 * Get the plugins directory for a given scope
 */
export function getPluginsDir(scope: 'user' | 'project', projectPath?: string): string {
  if (scope === 'project') {
    if (!projectPath) {
      throw new Error('Project path is required for project-scope plugins');
    }
    return getProjectPluginsDir(projectPath);
  }
  return getUserPluginsDir();
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.debug(`Created directory: ${dirPath}`);
  }
}

// ============================================================================
// MANIFEST UTILITIES
// ============================================================================

/**
 * Read and parse a plugin manifest file
 */
export function readManifest(pluginDir: string): PluginManifest | null {
  const manifestPath = path.join(pluginDir, 'plugin.json');

  if (!fs.existsSync(manifestPath)) {
    logger.warn(`No plugin.json found in ${pluginDir}`);
    return null;
  }

  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as PluginManifest;

    // Validate required fields
    if (!manifest.name || !manifest.version || !manifest.description) {
      logger.error(`Invalid manifest in ${pluginDir}: missing required fields`);
      return null;
    }

    return manifest;
  } catch (error) {
    logger.error(`Failed to read manifest from ${pluginDir}`, error);
    return null;
  }
}

/**
 * Generate a plugin ID from its name
 */
export function generatePluginId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Validate a plugin name (for directory creation)
 */
export function validatePluginName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Plugin name must be a non-empty string' };
  }

  if (name.length > 100) {
    return { valid: false, error: 'Plugin name too long (max 100 characters)' };
  }

  // Only allow alphanumeric, dash, underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { valid: false, error: 'Plugin name can only contain alphanumeric characters, dashes, and underscores' };
  }

  return { valid: true };
}

// ============================================================================
// DIRECTORY SCANNING
// ============================================================================

/**
 * Scan a directory for plugin subdirectories
 */
export function scanPluginDirectory(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(baseDir, entry.name))
      .filter(pluginDir => {
        // Must have a plugin.json file
        const manifestPath = path.join(pluginDir, 'plugin.json');
        return fs.existsSync(manifestPath);
      });
  } catch (error) {
    logger.error(`Failed to scan directory ${baseDir}`, error);
    return [];
  }
}

/**
 * Check if a directory is a valid git repository
 */
export function isGitRepository(url: string): boolean {
  // Basic validation for git repository URLs
  const gitPatterns = [
    /^https?:\/\/.+\.git$/,
    /^git@.+:.+\.git$/,
    /^https?:\/\/github\.com\/.+\/.+$/,
    /^https?:\/\/gitlab\.com\/.+\/.+$/,
    /^https?:\/\/bitbucket\.org\/.+\/.+$/,
  ];

  return gitPatterns.some(pattern => pattern.test(url));
}

/**
 * Extract repository name from git URL
 */
export function getRepoNameFromUrl(url: string): string | null {
  try {
    // Handle various git URL formats
    const patterns = [
      /\/([^/]+?)(?:\.git)?$/,  // Extract last segment, optionally ending in .git
      /:([^/]+?)(?:\.git)?$/,   // Handle git@ format
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  } catch (error) {
    logger.error('Failed to extract repo name from URL', error);
    return null;
  }
}

/**
 * Remove a directory recursively
 */
export function removeDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    logger.debug(`Removed directory: ${dirPath}`);
  } catch (error) {
    logger.error(`Failed to remove directory ${dirPath}`, error);
    throw new Error(`Failed to remove directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
