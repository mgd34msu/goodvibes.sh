// ============================================================================
// HOOK CARD COMPONENT
// ============================================================================

import { useState } from 'react';
import {
  Play,
  Pause,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { EVENT_TYPES, EVENT_TYPE_ICONS, type Hook } from './types';

interface HookCardProps {
  hook: Hook;
  onToggle: (id: number, enabled: boolean) => void;
  onEdit: (hook: Hook) => void;
  onDelete: (id: number) => void;
  onTest: (id: number) => void;
}

export function HookCard({ hook, onToggle, onEdit, onDelete, onTest }: HookCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getResultIcon = () => {
    switch (hook.lastResult) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'failure':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'timeout':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`bg-surface-900 rounded-lg border transition-colors ${
        hook.enabled ? 'border-surface-700' : 'border-surface-800 opacity-60'
      }`}
    >
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
                {EVENT_TYPE_ICONS[hook.eventType]}
                <h3 className="font-medium text-surface-100">{hook.name}</h3>
                <span className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-400">
                  {hook.scope}
                </span>
              </div>

              <p className="text-sm text-surface-400 mt-1">
                {EVENT_TYPES.find((t) => t.value === hook.eventType)?.label}
                {hook.matcher && hook.matcher !== '*' && (
                  <span className="ml-2 font-mono text-xs text-surface-500">
                    ({hook.matcher})
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hook.executionCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-surface-500">
                {getResultIcon()}
                <span>{hook.executionCount}x</span>
              </div>
            )}

            <button
              onClick={() => onToggle(hook.id, !hook.enabled)}
              className={`p-1.5 rounded transition-colors ${
                hook.enabled
                  ? 'text-green-400 hover:bg-green-400/10'
                  : 'text-surface-500 hover:bg-surface-700'
              }`}
              title={hook.enabled ? 'Disable' : 'Enable'}
            >
              {hook.enabled ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>

            <button
              onClick={() => onEdit(hook)}
              className="p-1.5 text-surface-400 hover:text-surface-200 hover:bg-surface-700 rounded transition-colors"
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => onDelete(hook.id)}
              className="p-1.5 text-surface-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-surface-700">
            <div className="space-y-3">
              <div>
                <span className="text-xs text-surface-500 uppercase tracking-wider">
                  Command
                </span>
                <p className="mt-1 font-mono text-sm text-surface-300 bg-surface-800 p-2 rounded">
                  {hook.command}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-surface-500">Timeout:</span>
                  <span className="ml-2 text-surface-300">{hook.timeout}ms</span>
                </div>
                <div>
                  <span className="text-surface-500">Executions:</span>
                  <span className="ml-2 text-surface-300">{hook.executionCount}</span>
                </div>
                <div>
                  <span className="text-surface-500">Last Run:</span>
                  <span className="ml-2 text-surface-300">
                    {hook.lastExecuted
                      ? new Date(hook.lastExecuted).toLocaleString()
                      : 'Never'}
                  </span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => onTest(hook.id)}
                  className="px-3 py-1.5 text-sm bg-surface-700 text-surface-200 rounded hover:bg-surface-600 transition-colors flex items-center gap-2"
                >
                  <Play className="w-3 h-3" />
                  Test Hook
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
