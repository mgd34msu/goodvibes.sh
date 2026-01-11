// ============================================================================
// MCP MANAGER SERVICE - Model Context Protocol Server Management
// ============================================================================

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';
import { Logger } from './logger.js';
import {
  createMCPServer,
  getMCPServer,
  getAllMCPServers,
  updateMCPServer,
  updateMCPServerStatus,
  deleteMCPServer,
  type MCPServer,
} from '../database/primitives.js';

const logger = new Logger('MCPManager');

// ============================================================================
// TYPES
// ============================================================================

export interface MCPServerConfig {
  name: string;
  description?: string;
  transport: 'stdio' | 'http';
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string>;
  scope?: 'user' | 'project';
  projectPath?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPServerInfo {
  server: MCPServer;
  tools: MCPTool[];
  process?: ChildProcess;
  connected: boolean;
}

export interface MCPProjectConfig {
  mcpServers: Record<string, {
    command?: string;
    url?: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
}

// ============================================================================
// KNOWN MCP SERVERS (MARKETPLACE)
// ============================================================================

export interface MarketplaceMCPServer {
  id: string;
  name: string;
  description: string;
  category: 'productivity' | 'devops' | 'communication' | 'database' | 'custom';
  transport: 'stdio' | 'http';
  npmPackage?: string;
  command?: string;
  args?: string[];
  requiredEnv?: string[];
  documentation?: string;
  popular?: boolean;
}

const MARKETPLACE_SERVERS: MarketplaceMCPServer[] = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Access and manage Notion workspaces, pages, and databases',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@notionhq/mcp-server',
    command: 'npx',
    args: ['@notionhq/mcp-server'],
    requiredEnv: ['NOTION_API_KEY'],
    documentation: 'https://developers.notion.com/',
    popular: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Access GitHub repositories, issues, PRs, and more',
    category: 'devops',
    transport: 'stdio',
    npmPackage: '@github/mcp-server',
    command: 'npx',
    args: ['@github/mcp-server'],
    requiredEnv: ['GITHUB_TOKEN'],
    documentation: 'https://docs.github.com/en/rest',
    popular: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send messages and interact with Slack workspaces',
    category: 'communication',
    transport: 'stdio',
    npmPackage: '@slack/mcp-server',
    command: 'npx',
    args: ['@slack/mcp-server'],
    requiredEnv: ['SLACK_BOT_TOKEN'],
    documentation: 'https://api.slack.com/',
    popular: true,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    category: 'database',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-postgres',
    command: 'npx',
    args: ['@modelcontextprotocol/server-postgres'],
    requiredEnv: ['DATABASE_URL'],
    documentation: 'https://www.postgresql.org/docs/',
    popular: true,
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-filesystem',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem'],
    requiredEnv: [],
    documentation: 'https://modelcontextprotocol.io/servers/filesystem',
    popular: true,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Search the web using Brave Search API',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-brave-search',
    command: 'npx',
    args: ['@modelcontextprotocol/server-brave-search'],
    requiredEnv: ['BRAVE_API_KEY'],
    documentation: 'https://brave.com/search/api/',
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Automate browser interactions with Puppeteer',
    category: 'devops',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-puppeteer',
    command: 'npx',
    args: ['@modelcontextprotocol/server-puppeteer'],
    requiredEnv: [],
    documentation: 'https://pptr.dev/',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    category: 'database',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-sqlite',
    command: 'npx',
    args: ['@modelcontextprotocol/server-sqlite'],
    requiredEnv: ['SQLITE_DB_PATH'],
    documentation: 'https://www.sqlite.org/docs.html',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory store for conversations',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-memory',
    command: 'npx',
    args: ['@modelcontextprotocol/server-memory'],
    requiredEnv: [],
    documentation: 'https://modelcontextprotocol.io/servers/memory',
  },
];

// ============================================================================
// MCP MANAGER SERVICE
// ============================================================================

class MCPManagerService extends EventEmitter {
  private runningServers: Map<number, MCPServerInfo> = new Map();

  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // ============================================================================
  // SERVER MANAGEMENT
  // ============================================================================

  /**
   * Add a new MCP server
   */
  addServer(config: MCPServerConfig): MCPServer {
    const server = createMCPServer({
      name: config.name,
      description: config.description || null,
      transport: config.transport,
      command: config.command || null,
      url: config.url || null,
      args: config.args || [],
      env: config.env || {},
      scope: config.scope || 'user',
      projectPath: config.projectPath || null,
      enabled: true,
    });

    logger.info(`Added MCP server: ${server.name}`);
    this.emit('server:added', server);
    return server;
  }

  /**
   * Get a server by ID
   */
  getServer(id: number): MCPServer | null {
    return getMCPServer(id);
  }

  /**
   * Get all servers
   */
  getAllServers(scope?: 'user' | 'project', projectPath?: string): MCPServer[] {
    return getAllMCPServers(scope, projectPath);
  }

  /**
   * Update a server
   */
  updateServer(id: number, updates: Partial<MCPServer>): void {
    updateMCPServer(id, updates);
    const server = getMCPServer(id);
    if (server) {
      logger.info(`Updated MCP server: ${server.name}`);
      this.emit('server:updated', server);
    }
  }

  /**
   * Delete a server
   */
  deleteServer(id: number): void {
    const server = getMCPServer(id);
    if (server) {
      // Stop if running
      this.stopServer(id);
      deleteMCPServer(id);
      logger.info(`Deleted MCP server: ${server.name}`);
      this.emit('server:deleted', server);
    }
  }

  /**
   * Enable/disable a server
   */
  setServerEnabled(id: number, enabled: boolean): void {
    updateMCPServer(id, { enabled });
    if (!enabled) {
      this.stopServer(id);
    }
    const server = getMCPServer(id);
    if (server) {
      logger.info(`${enabled ? 'Enabled' : 'Disabled'} MCP server: ${server.name}`);
      this.emit('server:toggled', server);
    }
  }

  // ============================================================================
  // SERVER LIFECYCLE
  // ============================================================================

  /**
   * Start an MCP server
   */
  async startServer(id: number): Promise<boolean> {
    const server = getMCPServer(id);
    if (!server) {
      logger.error(`MCP server not found: ${id}`);
      return false;
    }

    if (!server.enabled) {
      logger.warn(`MCP server is disabled: ${server.name}`);
      return false;
    }

    // Check if already running
    if (this.runningServers.has(id)) {
      logger.debug(`MCP server already running: ${server.name}`);
      return true;
    }

    logger.info(`Starting MCP server: ${server.name}`);

    if (server.transport === 'stdio') {
      return this.startStdioServer(server);
    } else if (server.transport === 'http') {
      return this.testHttpServer(server);
    }

    return false;
  }

  /**
   * Start a stdio-based MCP server
   */
  private async startStdioServer(server: MCPServer): Promise<boolean> {
    if (!server.command) {
      logger.error(`No command specified for stdio server: ${server.name}`);
      updateMCPServerStatus(server.id, 'error', 'No command specified');
      return false;
    }

    try {
      const env = {
        ...process.env,
        ...server.env,
      };

      const child = spawn(server.command, server.args, {
        env,
        cwd: server.projectPath || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const serverInfo: MCPServerInfo = {
        server,
        tools: [],
        process: child,
        connected: false,
      };

      this.runningServers.set(server.id, serverInfo);

      // Wait for server to be ready
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (!serverInfo.connected) {
            updateMCPServerStatus(server.id, 'error', 'Connection timeout');
            this.stopServer(server.id);
            resolve(false);
          }
        }, 10000);

        child.stdout?.on('data', (data) => {
          const output = data.toString();
          logger.debug(`MCP ${server.name} stdout: ${output}`);

          // Try to parse as JSON to detect tools
          try {
            const json = JSON.parse(output);
            if (json.tools) {
              serverInfo.tools = json.tools;
              updateMCPServer(server.id, { toolCount: json.tools.length });
            }
          } catch {
            // Not JSON, ignore
          }

          // Mark as connected on first output
          if (!serverInfo.connected) {
            serverInfo.connected = true;
            clearTimeout(timeout);
            updateMCPServerStatus(server.id, 'connected');
            this.emit('server:connected', server);
            resolve(true);
          }
        });

        child.stderr?.on('data', (data) => {
          logger.warn(`MCP ${server.name} stderr: ${data.toString()}`);
        });

        child.on('error', (error) => {
          clearTimeout(timeout);
          logger.error(`MCP ${server.name} error:`, error);
          updateMCPServerStatus(server.id, 'error', error.message);
          this.runningServers.delete(server.id);
          this.emit('server:error', server, error);
          resolve(false);
        });

        child.on('close', (code) => {
          clearTimeout(timeout);
          logger.info(`MCP ${server.name} exited with code: ${code}`);
          updateMCPServerStatus(server.id, 'disconnected');
          this.runningServers.delete(server.id);
          this.emit('server:disconnected', server);
        });
      });
    } catch (error) {
      logger.error(`Failed to start MCP server: ${server.name}`, error);
      updateMCPServerStatus(server.id, 'error', (error as Error).message);
      return false;
    }
  }

  /**
   * Test connection to HTTP-based MCP server
   */
  private async testHttpServer(server: MCPServer): Promise<boolean> {
    if (!server.url) {
      logger.error(`No URL specified for HTTP server: ${server.name}`);
      updateMCPServerStatus(server.id, 'error', 'No URL specified');
      return false;
    }

    try {
      const response = await fetch(server.url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        updateMCPServerStatus(server.id, 'connected');

        const serverInfo: MCPServerInfo = {
          server,
          tools: [],
          connected: true,
        };

        this.runningServers.set(server.id, serverInfo);
        this.emit('server:connected', server);
        return true;
      } else {
        updateMCPServerStatus(server.id, 'error', `HTTP ${response.status}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to connect to HTTP MCP server: ${server.name}`, error);
      updateMCPServerStatus(server.id, 'error', (error as Error).message);
      return false;
    }
  }

  /**
   * Stop an MCP server
   */
  stopServer(id: number): void {
    const serverInfo = this.runningServers.get(id);
    if (serverInfo) {
      if (serverInfo.process) {
        serverInfo.process.kill('SIGTERM');
      }
      this.runningServers.delete(id);
      updateMCPServerStatus(id, 'disconnected');
      this.emit('server:disconnected', serverInfo.server);
      logger.info(`Stopped MCP server: ${serverInfo.server.name}`);
    }
  }

  /**
   * Stop all running servers
   */
  stopAllServers(): void {
    for (const [id] of this.runningServers) {
      this.stopServer(id);
    }
  }

  /**
   * Restart an MCP server
   */
  async restartServer(id: number): Promise<boolean> {
    this.stopServer(id);
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.startServer(id);
  }

  /**
   * Get running server info
   */
  getRunningServerInfo(id: number): MCPServerInfo | undefined {
    return this.runningServers.get(id);
  }

  /**
   * Get all running servers
   */
  getRunningServers(): MCPServerInfo[] {
    return Array.from(this.runningServers.values());
  }

  // ============================================================================
  // CLAUDE CONFIG INTEGRATION
  // ============================================================================

  /**
   * Read .mcp.json from project
   */
  async readMCPConfig(projectPath: string): Promise<MCPProjectConfig | null> {
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
  async writeMCPConfig(projectPath: string, config: MCPProjectConfig): Promise<void> {
    const configPath = path.join(projectPath, '.mcp.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.info(`Wrote MCP config: ${configPath}`);
  }

  /**
   * Read user's claude.json
   */
  async readUserClaudeConfig(): Promise<Record<string, unknown> | null> {
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

  /**
   * Sync database servers to Claude config files
   */
  async syncToClaudeConfig(projectPath?: string): Promise<void> {
    const servers = this.getAllServers();

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
      const userConfig = await this.readUserClaudeConfig() || {};
      userConfig.mcpServers = userServers;
      const userConfigPath = path.join(os.homedir(), '.claude.json');
      await fs.writeFile(userConfigPath, JSON.stringify(userConfig, null, 2), 'utf-8');
      logger.info('Updated user MCP config');
    }

    // Write project config
    if (projectPath && Object.keys(projectServers).length > 0) {
      await this.writeMCPConfig(projectPath, { mcpServers: projectServers });
    }
  }

  // ============================================================================
  // MARKETPLACE
  // ============================================================================

  /**
   * Get marketplace servers
   */
  getMarketplaceServers(): MarketplaceMCPServer[] {
    return MARKETPLACE_SERVERS;
  }

  /**
   * Get marketplace server by ID
   */
  getMarketplaceServer(id: string): MarketplaceMCPServer | undefined {
    return MARKETPLACE_SERVERS.find(s => s.id === id);
  }

  /**
   * Get popular marketplace servers
   */
  getPopularServers(): MarketplaceMCPServer[] {
    return MARKETPLACE_SERVERS.filter(s => s.popular);
  }

  /**
   * Get servers by category
   */
  getServersByCategory(category: MarketplaceMCPServer['category']): MarketplaceMCPServer[] {
    return MARKETPLACE_SERVERS.filter(s => s.category === category);
  }

  /**
   * Install a marketplace server
   */
  async installMarketplaceServer(
    marketplaceId: string,
    env: Record<string, string> = {},
    scope: 'user' | 'project' = 'user',
    projectPath?: string
  ): Promise<MCPServer | null> {
    const marketplace = this.getMarketplaceServer(marketplaceId);
    if (!marketplace) {
      logger.error(`Marketplace server not found: ${marketplaceId}`);
      return null;
    }

    // Validate required env vars
    for (const required of marketplace.requiredEnv || []) {
      if (!env[required]) {
        logger.error(`Missing required environment variable: ${required}`);
        throw new Error(`Missing required environment variable: ${required}`);
      }
    }

    // Install npm package if needed
    if (marketplace.npmPackage) {
      logger.info(`Installing npm package: ${marketplace.npmPackage}`);
      // Note: In a real implementation, you might want to actually run npm install
      // For now, we assume npx will handle it
    }

    // Create server entry
    const server = this.addServer({
      name: marketplace.name,
      description: marketplace.description,
      transport: marketplace.transport,
      command: marketplace.command,
      args: marketplace.args,
      env,
      scope,
      projectPath,
    });

    logger.info(`Installed marketplace server: ${marketplace.name}`);
    return server;
  }

  // ============================================================================
  // SHUTDOWN
  // ============================================================================

  shutdown(): void {
    this.stopAllServers();
    this.removeAllListeners();
    logger.info('MCP Manager shut down');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let mcpManager: MCPManagerService | null = null;

export function getMCPManager(): MCPManagerService {
  if (!mcpManager) {
    mcpManager = new MCPManagerService();
  }
  return mcpManager;
}

export function shutdownMCPManager(): void {
  if (mcpManager) {
    mcpManager.shutdown();
    mcpManager = null;
  }
}

// Export the class for testing
export { MCPManagerService };
