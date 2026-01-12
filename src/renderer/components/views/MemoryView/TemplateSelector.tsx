// ============================================================================
// TEMPLATE SELECTOR COMPONENT
// ============================================================================

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DEFAULT_TEMPLATES, type MemoryTemplate } from './types';

interface TemplateSelectorProps {
  onSelect: (template: MemoryTemplate) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-surface-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-800 text-surface-200 hover:bg-surface-700 transition-colors"
      >
        <span className="font-medium">Insert Template</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-3 bg-surface-900">
          {DEFAULT_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                onSelect(template);
                setExpanded(false);
              }}
              className="w-full text-left p-3 bg-surface-800 rounded-lg hover:bg-surface-700 transition-colors"
            >
              <div className="font-medium text-surface-200">{template.name}</div>
              <div className="text-sm text-surface-400 mt-1">{template.description}</div>
              {template.variables.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {template.variables.map((v) => (
                    <span
                      key={v}
                      className="text-xs px-2 py-0.5 bg-accent-purple/20 text-accent-purple rounded"
                    >
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
