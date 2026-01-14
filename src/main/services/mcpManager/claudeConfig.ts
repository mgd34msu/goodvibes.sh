// ============================================================================
// CLAUDE CONFIG INTEGRATION - .mcp.json and .claude.json management
// ============================================================================

import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { Logger } from '../logger.js';
import { getAllMCPServers } from '../../database/primitives.js';
import type { MCPProjectConfig } from './types.js';

const logger = new Logger('MCPManager');

// ============================================================================
// PROJECT CONFIG (.mcp.json)
// ============================================================================

/**
 * Read .mcp.json from project
 */
export async function readMCPConfig(projectPath: string): Promise<MCPProjectConfig | null> {
  const configPath = path.join(projectPath, '.mcp.json');

  if (existsSync(configPath)) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn(`Failed to read .mcp.json: ${configPath}`, error);
    }
  }

  return null;
}

/**
 * Write .mcp.json to project
 */
export async function writeMCPConfig(
  projectPath: string,
  config: MCPProjectConfig
): Promise<void> {
  const configPath = path.join(projectPath, '.mcp.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  logger.info(`Wrote MCP config: ${configPath}`);
}

// ============================================================================
// USER CONFIG (.claude.json)
// ============================================================================

/**
 * Read user's claude.json
 */
export async function readUserClaudeConfig(): Promise<Record<string, unknown> | null> {
  const configPath = path.join(os.homedir(), '.claude.json');

  if (existsSync(configPath)) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn(`Failed to read .claude.json`, error);
    }
  }

  return null;
}

// ============================================================================
// CONFIG SYNC
// ============================================================================

/**
 * Sync database servers to Claude config files
 */
export async function syncToClaudeConfig(projectPath?: string): Promise<void> {
  const servers = getAllMCPServers();

  // Build user config
  const userServers: Record<string, {
    command?: string;
    url?: string;
    args?: string[];
    env?: Record<string, string>;
  }> = {};

  // Build project config
  const projectServers: Record<string, {
    command?: string;
    url?: string;
    args?: string[];
    env?: Record<string, string>;
  }> = {};

  for (const server of servers) {
    if (!server.enabled) continue;

    const config = {
      ...(server.command && { command: server.command }),
      ...(server.url && { url: server.url }),
      ...(server.args.length > 0 && { args: server.args }),
      ...(Object.keys(server.env).length > 0 && { env: server.env }),
    };

    if (server.scope === 'user') {
      userServers[server.name] = config;
    } else if (server.projectPath === projectPath) {
      projectServers[server.name] = config;
    }
  }

  // Write user config
  if (Object.keys(userServers).length > 0) {
    const userConfig = await readUserClaudeConfig() || {};
    userConfig.mcpServers = userServers;
    const userConfigPath = path.join(os.homedir(), '.claude.json');
    await fs.writeFile(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
    logger.info('Updated user MCP config');
  }

  // Write project config
  if (projectPath && Object.keys(projectServers).length > 0) {
    await writeMCPConfig(projectPath, { mcpServers: projectServers });
  }
}
