// ============================================================================
// PROJECT CARD COMPONENT
// ============================================================================

import { useState } from 'react';
import { clsx } from 'clsx';
import { Plus, History } from 'lucide-react';
import type { RegisteredProject, ProjectTemplate, ProjectAnalytics } from './types';

interface ProjectCardProps {
  project: RegisteredProject;
  analytics?: ProjectAnalytics;
  templates: ProjectTemplate[];
  isSelected: boolean;
  onSelect: () => void;
  onNewSession: () => void;
  onOpenPreviousSession: () => void;
  onRemove: () => void;
  onOpenSettings: () => void;
  onApplyTemplate: (templateId: number) => void;
  onCreateTemplate: () => void;
  formatDate: (date: string) => string;
  formatCurrency: (value: number) => string;
}

export function ProjectCard({
  project,
  analytics,
  templates,
  isSelected,
  onSelect,
  onNewSession,
  onOpenPreviousSession,
  onRemove,
  onOpenSettings,
  onApplyTemplate,
  onCreateTemplate,
  formatDate,
  formatCurrency,
}: ProjectCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  return (
    <div
      className={clsx(
        'card p-4 transition-all cursor-pointer',
        isSelected && 'ring-2 ring-primary-500'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-4">
        {/* Project Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-surface-100">{project.name}</h3>
            {project.settings.tags?.map((tag, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-surface-700 rounded text-xs text-surface-400"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="text-sm text-surface-500 truncate mt-1">{project.path}</div>
          {project.description && (
            <p className="text-sm text-surface-400 mt-2">{project.description}</p>
          )}

          {/* Quick Stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-surface-500">
            <div>Last opened: {formatDate(project.lastOpened)}</div>
            {analytics && (
              <>
                <div>{(analytics.totalSessions ?? 0).toLocaleString()} sessions</div>
                <div>{formatCurrency(analytics.totalCostUsd ?? 0)} spent</div>
                <div title={`Input: ${(analytics.inputTokens ?? 0).toLocaleString()} | Output: ${(analytics.outputTokens ?? 0).toLocaleString()} | Cache Read: ${(analytics.cacheReadTokens ?? 0).toLocaleString()} | Cache Write: ${(analytics.cacheWriteTokens ?? 0).toLocaleString()}`}>
                  {(analytics.totalTokens ?? 0).toLocaleString()} tokens
                </div>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onNewSession(); }}
            className="btn btn-sm btn-primary flex items-center gap-1.5"
            title="Start a new Claude session for this project"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
          <button
            onClick={e => { e.stopPropagation(); onOpenPreviousSession(); }}
            className="btn btn-sm btn-secondary flex items-center gap-1.5"
            title="Open a previous session"
          >
            <History className="w-4 h-4" />
            Previous
          </button>
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="btn btn-sm btn-ghost"
            >
              ...
            </button>
            {showMenu && (
              <div
                className="absolute right-0 top-full mt-1 w-48 bg-surface-800 border border-surface-700 rounded-lg shadow-lg z-[9959]"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => { onOpenSettings(); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-surface-700 text-surface-300"
                >
                  Settings
                </button>
                <button
                  onClick={() => { onCreateTemplate(); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-surface-700 text-surface-300"
                >
                  Create Template
                </button>
                {templates.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowTemplateMenu(!showTemplateMenu)}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-surface-700 text-surface-300 flex items-center justify-between"
                    >
                      Apply Template
                      <span>&gt;</span>
                    </button>
                    {showTemplateMenu && (
                      <div className="absolute left-full top-0 w-48 bg-surface-800 border border-surface-700 rounded-lg shadow-lg">
                        {templates.map(template => (
                          <button
                            key={template.id}
                            onClick={() => {
                              onApplyTemplate(template.id);
                              setShowTemplateMenu(false);
                              setShowMenu(false);
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-surface-700 text-surface-300"
                          >
                            {template.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="border-t border-surface-700 my-1" />
                <button
                  onClick={() => { onRemove(); setShowMenu(false); }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-surface-700 text-red-400"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
