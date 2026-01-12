// ============================================================================
// SKILL CARD COMPONENT
// ============================================================================

import { useState } from 'react';
import {
  Sparkles,
  Edit2,
  Trash2,
  Copy,
  Check,
  Play,
  Star,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { SkillCardSkill } from './types';

interface SkillCardProps {
  skill: SkillCardSkill;
  onUse: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
}

export function SkillCard({ skill, onUse, onEdit, onDelete, onCopy }: SkillCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const isBuiltIn = 'isBuiltIn' in skill;

  const handleCopy = () => {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
                <Sparkles className="w-4 h-4 text-accent-purple" />
                <h3 className="font-medium text-surface-100">/{skill.name}</h3>
                {isBuiltIn && (
                  <span className="text-xs px-2 py-0.5 bg-blue-400/20 text-blue-400 rounded">
                    Built-in
                  </span>
                )}
                <span className="text-xs px-2 py-0.5 bg-surface-700 rounded text-surface-400">
                  {skill.scope}
                </span>
              </div>
              {skill.description && (
                <p className="text-sm text-surface-400 mt-1">{skill.description}</p>
              )}
              {!isBuiltIn && 'useCount' in skill && skill.useCount > 0 && (
                <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    Used {skill.useCount} times
                  </span>
                  {skill.lastUsed && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last: {new Date(skill.lastUsed).toLocaleDateString()}
                    </span>
                  )}
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
              title="Copy"
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
          <div className="mt-4 pt-4 border-t border-surface-700">
            <div className="bg-surface-800 rounded-lg p-3">
              <pre className="text-sm text-surface-300 whitespace-pre-wrap font-mono">
                {skill.content}
              </pre>
            </div>
            {skill.allowedTools && skill.allowedTools.length > 0 && (
              <div className="mt-3">
                <span className="text-xs text-surface-500">Allowed Tools:</span>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {skill.allowedTools.map((tool) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
