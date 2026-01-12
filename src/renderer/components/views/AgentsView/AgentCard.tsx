// ============================================================================
// AGENT CARD COMPONENT
// ============================================================================

import { useState } from 'react';
import {
  Edit2,
  Trash2,
  Copy,
  Check,
  Play,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';
import type { AgentCardAgent } from './types';
import { AGENT_ICONS } from './constants';

interface AgentCardProps {
  agent: AgentCardAgent;
  onUse: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
}

export function AgentCard({ agent, onUse, onEdit, onDelete, onCopy }: AgentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const isBuiltIn = 'isBuiltIn' in agent;

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const icon = AGENT_ICONS[agent.name] || <Zap className="w-4 h-4" />;

  return (
    <div className="bg-surface-900 rounded-lg border border-surface-700">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-surface-400 hover:text-surface-200 transition-colors"
            >
              {expanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-accent-purple">{icon}</span>
                <h3 className="font-medium text-surface-100">{agent.name}</h3>
                {isBuiltIn && (
                  <span className="text-xs px-2 py-0.5 bg-blue-400/20 text-blue-400 rounded">
                    Built-in
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-400">
                  {agent.cwd ? 'project' : 'user'}
                </span>
                {agent.model && (
                  <span className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-400">
                    {agent.model.replace('claude-', '').replace(/-\d+$/, '')}
                  </span>
                )}
              </div>
              {agent.description && (
                <p className="text-sm text-surface-400 mt-1">{agent.description}</p>
              )}
              {!isBuiltIn && 'createdAt' in agent && (
                <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                  <span>Created: {new Date(agent.createdAt).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onUse}
              className="px-3 py-1.5 text-sm bg-accent-purple text-white rounded hover:bg-accent-purple/80 transition-colors flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              Use
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
              title="Copy prompt"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
            {!isBuiltIn && onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
                title="Edit"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            {!isBuiltIn && onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-surface-700 space-y-4">
            {agent.initialPrompt && (
              <div>
                <span className="text-xs text-surface-500 uppercase tracking-wider">Initial Prompt</span>
                <div className="bg-surface-800 rounded-lg p-3 mt-1">
                  <pre className="text-sm text-surface-300 whitespace-pre-wrap font-mono">
                    {agent.initialPrompt}
                  </pre>
                </div>
              </div>
            )}

            {agent.claudeMdContent && (
              <div>
                <span className="text-xs text-surface-500 uppercase tracking-wider">CLAUDE.md Content</span>
                <div className="bg-surface-800 rounded-lg p-3 mt-1">
                  <pre className="text-sm text-surface-300 whitespace-pre-wrap font-mono">
                    {agent.claudeMdContent}
                  </pre>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              {agent.permissionMode && agent.permissionMode !== 'default' && (
                <div>
                  <span className="text-xs text-surface-500">Permission Mode:</span>
                  <span className="ml-2 text-xs px-2 py-0.5 bg-yellow-400/20 text-yellow-400 rounded">
                    {agent.permissionMode}
                  </span>
                </div>
              )}

              {agent.allowedTools && agent.allowedTools.length > 0 && (
                <div>
                  <span className="text-xs text-surface-500">Allowed Tools:</span>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {agent.allowedTools.map((tool) => (
                      <span
                        key={tool}
                        className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-300"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {agent.flags && agent.flags.length > 0 && (
                <div>
                  <span className="text-xs text-surface-500">CLI Flags:</span>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {agent.flags.map((flag) => (
                      <span
                        key={flag}
                        className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-300 font-mono"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
