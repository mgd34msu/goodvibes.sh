// ============================================================================
// MCP MARKETPLACE CARD - Marketplace server card component
// ============================================================================

import React from 'react';
import {
  ExternalLink,
  Package,
  Zap,
  Database,
  MessageSquare,
  Wrench,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface MarketplaceServer {
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

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  productivity: <Zap className="w-4 h-4" />,
  devops: <Wrench className="w-4 h-4" />,
  communication: <MessageSquare className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
  custom: <Package className="w-4 h-4" />,
};

// Mock marketplace data
export const MARKETPLACE_SERVERS: MarketplaceServer[] = [
  {
    id: 'notion',
    name: 'Notion',
    description: 'Access and manage Notion workspaces, pages, and databases',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@notionhq/mcp-server',
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
    requiredEnv: ['SLACK_BOT_TOKEN'],
    popular: true,
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    category: 'database',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-postgres',
    requiredEnv: ['DATABASE_URL'],
    popular: true,
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-filesystem',
    popular: true,
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory store for conversations',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-memory',
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Search the web using Brave Search API',
    category: 'productivity',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-brave-search',
    requiredEnv: ['BRAVE_API_KEY'],
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query and manage SQLite databases',
    category: 'database',
    transport: 'stdio',
    npmPackage: '@modelcontextprotocol/server-sqlite',
    requiredEnv: ['SQLITE_DB_PATH'],
  },
];

// ============================================================================
// MARKETPLACE CARD COMPONENT
// ============================================================================

interface MarketplaceCardProps {
  server: MarketplaceServer;
  installed: boolean;
  onInstall: (server: MarketplaceServer) => void;
}

export function MCPMarketplaceCard({ server, installed, onInstall }: MarketplaceCardProps) {
  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-surface-700 rounded-lg flex items-center justify-center text-surface-300">
            {CATEGORY_ICONS[server.category]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-surface-100">{server.name}</h3>
              {server.popular && (
                <span className="text-xs px-2 py-0.5 bg-accent-purple/20 text-accent-purple rounded">
                  Popular
                </span>
              )}
            </div>
            <p className="text-sm text-surface-400 mt-1">{server.description}</p>
            {server.requiredEnv && server.requiredEnv.length > 0 && (
              <p className="text-xs text-surface-500 mt-2">
                Requires: {server.requiredEnv.join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {server.documentation && (
            <a
              href={server.documentation}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
              title="Documentation"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {installed ? (
            <span className="px-3 py-1.5 text-sm bg-green-400/20 text-green-400 rounded">
              Installed
            </span>
          ) : (
            <button
              onClick={() => onInstall(server)}
              className="px-3 py-1.5 text-sm bg-accent-purple text-white rounded hover:bg-accent-purple/80 transition-colors"
            >
              Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MCPMarketplaceCard;
