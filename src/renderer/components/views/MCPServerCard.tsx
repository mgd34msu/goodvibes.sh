// ============================================================================
// MCP SERVER CARD - Individual server card component
// ============================================================================

import React from 'react';
import {
  Play,
  Square,
  RefreshCw,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface MCPServer {
  id: number;
  name: string;
  description: string | null;
  transport: 'stdio' | 'http';
  command: string | null;
  url: string | null;
  args: string[];
  env: Record<string, string>;
  scope: 'user' | 'project';
  projectPath: string | null;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'unknown';
  lastConnected: string | null;
  errorMessage: string | null;
  toolCount: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_STYLES: Record<string, { color: string; icon: React.ReactNode }> = {
  connected: { color: 'text-green-400', icon: <CheckCircle className="w-4 h-4" /> },
  disconnected: { color: 'text-surface-500', icon: <Square className="w-4 h-4" /> },
  error: { color: 'text-red-400', icon: <XCircle className="w-4 h-4" /> },
  unknown: { color: 'text-yellow-400', icon: <AlertCircle className="w-4 h-4" /> },
};

// ============================================================================
// SERVER CARD COMPONENT
// ============================================================================

interface ServerCardProps {
  server: MCPServer;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onRestart: (id: number) => void;
  onEdit: (server: MCPServer) => void;
  onDelete: (id: number) => void;
}

export function MCPServerCard({ server, onStart, onStop, onRestart, onEdit, onDelete }: ServerCardProps) {
  const statusStyle = STATUS_STYLES[server.status] ?? STATUS_STYLES.unknown;

  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-1 ${statusStyle?.color ?? ''}`}>{statusStyle?.icon ?? null}</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-surface-100">{server.name}</h3>
              <span className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-400">
                {server.transport.toUpperCase()}
              </span>
              <span className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-400">
                {server.scope}
              </span>
            </div>
            {server.description && (
              <p className="text-sm text-surface-400 mt-1">{server.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
              <span>Tools: {server.toolCount}</span>
              {server.lastConnected && (
                <span>Last connected: {new Date(server.lastConnected).toLocaleString()}</span>
              )}
            </div>
            {server.errorMessage && (
              <p className="text-xs text-red-400 mt-1">{server.errorMessage}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {server.status === 'connected' ? (
            <button
              onClick={() => onStop(server.id)}
              className="p-1.5 text-red-400 hover:bg-red-400/10 rounded transition-colors"
              title="Stop"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onStart(server.id)}
              className="p-1.5 text-green-400 hover:bg-green-400/10 rounded transition-colors"
              title="Start"
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onRestart(server.id)}
            className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
            title="Restart"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(server)}
            className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(server.id)}
            className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default MCPServerCard;
