// ============================================================================
// QUICK SWITCHER COMPONENT
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { useTerminalStore } from '../../stores/terminalStore';

export function QuickSwitcher() {
  const isOpen = useAppStore((s) => s.isQuickSwitcherOpen);
  const close = useAppStore((s) => s.closeQuickSwitcher);

  const terminalsMap = useTerminalStore((s) => s.terminals);
  const terminals = useMemo(() => Array.from(terminalsMap.values()), [terminalsMap]);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter terminals
  const filteredTerminals = useMemo(() => {
    if (!search.trim()) return terminals;
    const lower = search.toLowerCase();
    return terminals.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.cwd.toLowerCase().includes(lower)
    );
  }, [terminals, search]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredTerminals.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredTerminals[selectedIndex]) {
          setActiveTerminal(filteredTerminals[selectedIndex].id);
          setCurrentView('terminal');
          close();
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
    }
  }, [filteredTerminals, selectedIndex, setActiveTerminal, setCurrentView, close]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh] bg-surface-950/80 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-md bg-surface-900 border border-surface-700 rounded-xl shadow-elevation-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-700">
          <svg className="w-5 h-5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <input
            type="text"
            placeholder="Search terminals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-surface-100 placeholder:text-surface-500 outline-none"
            autoFocus
          />
        </div>

        {/* Terminals list */}
        <div className="max-h-64 overflow-y-auto">
          {filteredTerminals.map((terminal, index) => (
            <button
              key={terminal.id}
              onClick={() => {
                setActiveTerminal(terminal.id);
                setCurrentView('terminal');
                close();
              }}
              className={clsx(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                index === selectedIndex
                  ? 'bg-primary-500/20'
                  : 'hover:bg-surface-800'
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-surface-700 flex items-center justify-center text-surface-400">
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 9l3-3-3-3-.7.7L7.6 6 5.3 8.3z" />
                  <path d="M9 10h4v1H9z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-surface-100 truncate">
                  {terminal.name}
                </div>
                <div className="text-xs text-surface-500 truncate">
                  {terminal.cwd}
                </div>
              </div>
              {terminal.sessionType === 'subagent' && (
                <span className="badge badge-primary">Subagent</span>
              )}
            </button>
          ))}

          {filteredTerminals.length === 0 && (
            <div className="px-4 py-8 text-center text-surface-500">
              {terminals.length === 0 ? 'No terminals open' : 'No matching terminals'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-surface-700 text-xs text-surface-500">
          <div className="flex gap-4">
            <span><kbd className="px-1.5 py-0.5 bg-surface-800 rounded">↑↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface-800 rounded">Enter</kbd> Select</span>
          </div>
          <span><kbd className="px-1.5 py-0.5 bg-surface-800 rounded">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
