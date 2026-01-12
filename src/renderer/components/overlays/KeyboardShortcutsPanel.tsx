// ============================================================================
// KEYBOARD SHORTCUTS PANEL
// Overlay showing all keyboard shortcuts with search and customization
// ============================================================================

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import {
  X,
  Search,
  RotateCcw,
  AlertTriangle,
  Keyboard,
  ChevronDown,
  ChevronRight,
  Edit2,
  Check,
} from 'lucide-react';
import { FocusTrap } from '../common/FocusTrap';
import { useConfirm } from './ConfirmModal';
import {
  useShortcutState,
  bindingToDisplayString,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type KeyBinding,
  type ShortcutDefinition,
  type ShortcutCategory,
} from '../../hooks/useKeyboardShortcuts';

// ============================================================================
// Component
// ============================================================================

export function KeyboardShortcutsPanel() {
  const {
    shortcutsByCategory,
    customBindings,
    conflicts,
    isHelpOpen,
    closeHelp,
    setCustomBinding,
    resetBinding,
    resetAllBindings,
    getEffectiveBinding,
  } = useShortcutState();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<ShortcutCategory>>(
    new Set(CATEGORY_ORDER)
  );
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Confirm dialog for reset all
  const { confirm: confirmReset, ConfirmDialog } = useConfirm({
    title: 'Reset All Shortcuts',
    message: 'Reset all keyboard shortcuts to their defaults?',
    confirmText: 'Reset',
    cancelText: 'Cancel',
    variant: 'warning',
  });

  // Focus search input when opened
  useEffect(() => {
    if (isHelpOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isHelpOpen]);

  // Reset search when closed
  useEffect(() => {
    if (!isHelpOpen) {
      setSearchQuery('');
      setEditingShortcut(null);
    }
  }, [isHelpOpen]);

  // Filter shortcuts by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return shortcutsByCategory;
    }

    const query = searchQuery.toLowerCase();
    const filtered = new Map<ShortcutCategory, ShortcutDefinition[]>();

    for (const [category, shortcuts] of shortcutsByCategory) {
      const matchingShortcuts = shortcuts.filter(
        (s) =>
          s.label.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          bindingToDisplayString(s.binding).toLowerCase().includes(query)
      );

      if (matchingShortcuts.length > 0) {
        filtered.set(category, matchingShortcuts);
      }
    }

    return filtered;
  }, [shortcutsByCategory, searchQuery]);

  // Toggle category expansion
  const toggleCategory = useCallback((category: ShortcutCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Check if shortcut has a custom binding
  const hasCustomBinding = useCallback(
    (id: string) => customBindings.has(id),
    [customBindings]
  );

  // Check if shortcut has a conflict
  const hasConflict = useCallback(
    (id: string) => conflicts.some((c) => c.shortcutId === id || c.conflictingId === id),
    [conflicts]
  );

  // Handle reset all
  const handleResetAll = useCallback(async () => {
    const confirmed = await confirmReset();
    if (confirmed) {
      resetAllBindings();
    }
  }, [resetAllBindings, confirmReset]);

  if (!isHelpOpen) return null;

  const hasCustomizations = customBindings.size > 0;
  const hasConflicts = conflicts.length > 0;

  return (
    <>
    <ConfirmDialog />
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeHelp}
        aria-hidden="true"
      />

      {/* Panel */}
      <FocusTrap active>
        <div className="relative w-full max-w-2xl max-h-[80vh] mx-4 bg-surface-900 rounded-xl shadow-2xl border border-surface-700 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                <Keyboard className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 id="shortcuts-title" className="text-lg font-semibold text-surface-100">
                  Keyboard Shortcuts
                </h2>
                <p className="text-xs text-surface-500">
                  {shortcutsByCategory.size > 0
                    ? `${Array.from(shortcutsByCategory.values()).reduce((a, b) => a + b.length, 0)} shortcuts available`
                    : 'Loading shortcuts...'}
                </p>
              </div>
            </div>
            <button
              onClick={closeHelp}
              className="p-2 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-800 transition-colors"
              aria-label="Close shortcuts panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-surface-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search shortcuts..."
                className="input w-full pl-10 pr-4 py-2 text-sm"
                aria-label="Search shortcuts"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded text-surface-500 hover:text-surface-300"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Conflicts Warning */}
          {hasConflicts && (
            <div className="px-6 py-2 bg-warning-500/10 border-b border-warning-500/20">
              <div className="flex items-center gap-2 text-sm text-warning-400">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>
                  {conflicts.length} shortcut conflict{conflicts.length > 1 ? 's' : ''} detected
                </span>
              </div>
            </div>
          )}

          {/* Shortcuts List */}
          <div className="flex-1 overflow-y-auto">
            {filteredCategories.size === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="w-10 h-10 text-surface-600 mb-3" />
                <p className="text-surface-400">No shortcuts found</p>
                <p className="text-sm text-surface-500">
                  Try a different search term
                </p>
              </div>
            ) : (
              <div className="py-2">
                {CATEGORY_ORDER.filter((cat) => filteredCategories.has(cat)).map((category) => (
                  <CategorySection
                    key={category}
                    category={category}
                    shortcuts={filteredCategories.get(category) || []}
                    isExpanded={expandedCategories.has(category)}
                    onToggle={() => toggleCategory(category)}
                    editingShortcut={editingShortcut}
                    onEditShortcut={setEditingShortcut}
                    getEffectiveBinding={getEffectiveBinding}
                    hasCustomBinding={hasCustomBinding}
                    hasConflict={hasConflict}
                    onSetCustomBinding={setCustomBinding}
                    onResetBinding={resetBinding}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-surface-800 bg-surface-900/50">
            <div className="text-xs text-surface-500">
              Press <kbd className="px-1.5 py-0.5 rounded bg-surface-700 font-mono">Esc</kbd> to close
            </div>
            {hasCustomizations && (
              <button
                onClick={handleResetAll}
                className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-surface-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset All
              </button>
            )}
          </div>
        </div>
      </FocusTrap>
    </div>
    </>
  );
}

// ============================================================================
// Category Section
// ============================================================================

interface CategorySectionProps {
  category: ShortcutCategory;
  shortcuts: ShortcutDefinition[];
  isExpanded: boolean;
  onToggle: () => void;
  editingShortcut: string | null;
  onEditShortcut: (id: string | null) => void;
  getEffectiveBinding: (id: string) => KeyBinding | undefined;
  hasCustomBinding: (id: string) => boolean;
  hasConflict: (id: string) => boolean;
  onSetCustomBinding: (id: string, binding: KeyBinding) => void;
  onResetBinding: (id: string) => void;
}

function CategorySection({
  category,
  shortcuts,
  isExpanded,
  onToggle,
  editingShortcut,
  onEditShortcut,
  getEffectiveBinding,
  hasCustomBinding,
  hasConflict,
  onSetCustomBinding,
  onResetBinding,
}: CategorySectionProps) {
  return (
    <div className="mb-1">
      {/* Category Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-6 py-2 text-left hover:bg-surface-800/50 transition-colors"
        aria-expanded={isExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-surface-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-surface-500" />
        )}
        <span className="text-sm font-medium text-surface-300">
          {CATEGORY_LABELS[category]}
        </span>
        <span className="text-xs text-surface-600">({shortcuts.length})</span>
      </button>

      {/* Shortcuts */}
      {isExpanded && (
        <div className="px-6 pb-2">
          {shortcuts.map((shortcut) => (
            <ShortcutRow
              key={shortcut.id}
              shortcut={shortcut}
              isEditing={editingShortcut === shortcut.id}
              onStartEdit={() => onEditShortcut(shortcut.id)}
              onStopEdit={() => onEditShortcut(null)}
              effectiveBinding={getEffectiveBinding(shortcut.id)}
              isCustom={hasCustomBinding(shortcut.id)}
              hasConflict={hasConflict(shortcut.id)}
              onSetBinding={(binding) => onSetCustomBinding(shortcut.id, binding)}
              onReset={() => onResetBinding(shortcut.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Shortcut Row
// ============================================================================

interface ShortcutRowProps {
  shortcut: ShortcutDefinition;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  effectiveBinding: KeyBinding | undefined;
  isCustom: boolean;
  hasConflict: boolean;
  onSetBinding: (binding: KeyBinding) => void;
  onReset: () => void;
}

function ShortcutRow({
  shortcut,
  isEditing,
  onStartEdit,
  onStopEdit,
  effectiveBinding,
  isCustom,
  hasConflict,
  onSetBinding,
  onReset,
}: ShortcutRowProps) {
  const [pendingBinding, setPendingBinding] = useState<KeyBinding | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  // Handle key capture
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels
      if (e.key === 'Escape') {
        setPendingBinding(null);
        onStopEdit();
        return;
      }

      // Enter confirms
      if (e.key === 'Enter' && pendingBinding) {
        onSetBinding(pendingBinding);
        setPendingBinding(null);
        onStopEdit();
        return;
      }

      // Ignore modifier-only presses
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      // Capture the binding
      setPendingBinding({
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    },
    [pendingBinding, onSetBinding, onStopEdit]
  );

  const handleConfirm = useCallback(() => {
    if (pendingBinding) {
      onSetBinding(pendingBinding);
    }
    setPendingBinding(null);
    onStopEdit();
  }, [pendingBinding, onSetBinding, onStopEdit]);

  const handleCancel = useCallback(() => {
    setPendingBinding(null);
    onStopEdit();
  }, [onStopEdit]);

  const displayBinding = pendingBinding || effectiveBinding || shortcut.binding;

  return (
    <div
      className={clsx(
        'flex items-center justify-between py-2 pl-6 pr-2 rounded-lg',
        isEditing && 'bg-surface-800',
        hasConflict && !isEditing && 'bg-warning-500/5'
      )}
    >
      {/* Label and Description */}
      <div className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-surface-200">{shortcut.label}</span>
          {isCustom && !isEditing && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-primary-500/20 text-primary-400">
              Custom
            </span>
          )}
          {hasConflict && !isEditing && (
            <AlertTriangle className="w-3.5 h-3.5 text-warning-400" />
          )}
        </div>
        <p className="text-xs text-surface-500 truncate">{shortcut.description}</p>
      </div>

      {/* Binding */}
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <input
              ref={inputRef}
              type="text"
              readOnly
              value={bindingToDisplayString(displayBinding)}
              onKeyDown={handleKeyDown}
              className="w-40 px-3 py-1.5 text-sm text-center bg-surface-700 border border-surface-600 rounded focus:outline-none focus:border-primary-500"
              placeholder="Press keys..."
            />
            <button
              onClick={handleConfirm}
              className="p-1.5 rounded text-success-400 hover:bg-success-500/20"
              title="Confirm"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 rounded text-surface-400 hover:bg-surface-700"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <kbd className="px-2 py-1 text-sm font-mono bg-surface-800 border border-surface-700 rounded text-surface-300">
              {bindingToDisplayString(displayBinding)}
            </kbd>
            <button
              onClick={onStartEdit}
              className="p-1.5 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-800 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit shortcut"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            {isCustom && (
              <button
                onClick={onReset}
                className="p-1.5 rounded text-surface-500 hover:text-surface-300 hover:bg-surface-800"
                title="Reset to default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
