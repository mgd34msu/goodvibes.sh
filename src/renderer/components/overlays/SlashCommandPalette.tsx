// ============================================================================
// SLASH COMMAND PALETTE - Quick access to Claude Code slash commands
// ============================================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Command,
  Search,
  GitCommit,
  Eye,
  Bug,
  FileText,
  TestTube,
  Zap,
  RefreshCw,
  Settings,
  HelpCircle,
  History,
  Terminal,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useTerminalStore } from '../../stores/terminalStore';

// ============================================================================
// TYPES
// ============================================================================

interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'navigation' | 'skill' | 'action' | 'settings';
  action: () => void;
  keywords?: string[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SlashCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setCurrentView = useAppStore((s) => s.setCurrentView);
  const createTerminal = useTerminalStore((s) => s.createTerminal);

  // Define commands
  const commands: SlashCommand[] = useMemo(
    () => [
      // Navigation commands
      {
        name: 'terminal',
        description: 'Go to terminal view',
        icon: <Terminal className="w-4 h-4" />,
        category: 'navigation',
        action: () => setCurrentView('terminal'),
        keywords: ['shell', 'console', 'cli'],
      },
      {
        name: 'sessions',
        description: 'View session history',
        icon: <History className="w-4 h-4" />,
        category: 'navigation',
        action: () => setCurrentView('sessions'),
        keywords: ['history', 'past'],
      },
      {
        name: 'settings',
        description: 'Open settings',
        icon: <Settings className="w-4 h-4" />,
        category: 'navigation',
        action: () => setCurrentView('settings'),
        keywords: ['preferences', 'config'],
      },

      // Skill commands
      {
        name: 'commit',
        description: 'Create a git commit with proper formatting',
        icon: <GitCommit className="w-4 h-4" />,
        category: 'skill',
        action: async () => {
          // Copy the skill command to clipboard for pasting into terminal
          await navigator.clipboard.writeText('/commit');
          // Switch to terminal view
          setCurrentView('terminal');
        },
        keywords: ['git', 'save', 'push'],
      },
      {
        name: 'review-pr',
        description: 'Review a pull request',
        icon: <Eye className="w-4 h-4" />,
        category: 'skill',
        action: async () => {
          await navigator.clipboard.writeText('/review-pr');
          setCurrentView('terminal');
        },
        keywords: ['pr', 'pull request', 'code review'],
      },
      {
        name: 'debug',
        description: 'Systematic debugging workflow',
        icon: <Bug className="w-4 h-4" />,
        category: 'skill',
        action: async () => {
          await navigator.clipboard.writeText('/debug');
          setCurrentView('terminal');
        },
        keywords: ['fix', 'error', 'issue'],
      },
      {
        name: 'docs',
        description: 'Generate documentation',
        icon: <FileText className="w-4 h-4" />,
        category: 'skill',
        action: async () => {
          await navigator.clipboard.writeText('/docs');
          setCurrentView('terminal');
        },
        keywords: ['documentation', 'readme', 'jsdoc'],
      },
      {
        name: 'test',
        description: 'Write or run tests',
        icon: <TestTube className="w-4 h-4" />,
        category: 'skill',
        action: async () => {
          await navigator.clipboard.writeText('/test');
          setCurrentView('terminal');
        },
        keywords: ['testing', 'unit', 'jest', 'vitest'],
      },
      {
        name: 'refactor',
        description: 'Safe code refactoring',
        icon: <RefreshCw className="w-4 h-4" />,
        category: 'skill',
        action: async () => {
          await navigator.clipboard.writeText('/refactor');
          setCurrentView('terminal');
        },
        keywords: ['improve', 'clean', 'restructure'],
      },

      // Action commands
      {
        name: 'new-session',
        description: 'Start a new terminal session',
        icon: <Zap className="w-4 h-4" />,
        category: 'action',
        action: async () => {
          // Create a new terminal session and switch to terminal view
          await createTerminal();
          setCurrentView('terminal');
        },
        keywords: ['create', 'start', 'fresh'],
      },
      {
        name: 'help',
        description: 'Show help and documentation',
        icon: <HelpCircle className="w-4 h-4" />,
        category: 'action',
        action: async () => {
          // Copy /help command to clipboard and switch to terminal
          await navigator.clipboard.writeText('/help');
          setCurrentView('terminal');
        },
        keywords: ['?', 'docs', 'guide'],
      },
    ],
    [setCurrentView, createTerminal]
  );

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    if (!query) return commands;

    const lowerQuery = query.toLowerCase().replace(/^\//, '');
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.description.toLowerCase().includes(lowerQuery) ||
        cmd.keywords?.some((k) => k.toLowerCase().includes(lowerQuery))
    );
  }, [commands, query]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, SlashCommand[]> = {
      navigation: [],
      skill: [],
      action: [],
      settings: [],
    };

    for (const cmd of filteredCommands) {
      const categoryGroup = groups[cmd.category];
      if (categoryGroup) {
        categoryGroup.push(cmd);
      }
    }

    return groups;
  }, [filteredCommands]);

  // Get flat list for keyboard navigation
  const flatCommands = useMemo(
    () => filteredCommands,
    [filteredCommands]
  );

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+/ or Cmd+/ to open
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setIsOpen(true);
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          executeCommand(flatCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  // Execute selected command
  const executeCommand = (cmd: SlashCommand) => {
    setIsOpen(false);
    cmd.action();
  };

  // Scroll selected item into view
  useEffect(() => {
    const selected = listRef.current?.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-surface-900 rounded-xl border border-surface-700 shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-700">
          <Command className="w-5 h-5 text-surface-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-surface-100 placeholder-surface-500 outline-none"
          />
          <kbd className="text-xs text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded">
            esc
          </kbd>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-surface-500">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No commands found</p>
            </div>
          ) : (
            <>
              {/* Skills */}
              {(groupedCommands.skill?.length ?? 0) > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Skills
                  </div>
                  {groupedCommands.skill?.map((cmd) => {
                    const globalIdx = flatCommands.indexOf(cmd);
                    return (
                      <CommandItem
                        key={cmd.name}
                        command={cmd}
                        isSelected={globalIdx === selectedIndex}
                        onSelect={() => executeCommand(cmd)}
                        onHover={() => setSelectedIndex(globalIdx)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Navigation */}
              {(groupedCommands.navigation?.length ?? 0) > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Navigation
                  </div>
                  {groupedCommands.navigation?.map((cmd) => {
                    const globalIdx = flatCommands.indexOf(cmd);
                    return (
                      <CommandItem
                        key={cmd.name}
                        command={cmd}
                        isSelected={globalIdx === selectedIndex}
                        onSelect={() => executeCommand(cmd)}
                        onHover={() => setSelectedIndex(globalIdx)}
                      />
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              {(groupedCommands.action?.length ?? 0) > 0 && (
                <div className="mb-2">
                  <div className="px-2 py-1 text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Actions
                  </div>
                  {groupedCommands.action?.map((cmd) => {
                    const globalIdx = flatCommands.indexOf(cmd);
                    return (
                      <CommandItem
                        key={cmd.name}
                        command={cmd}
                        isSelected={globalIdx === selectedIndex}
                        onSelect={() => executeCommand(cmd)}
                        onHover={() => setSelectedIndex(globalIdx)}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-surface-700 flex items-center justify-between text-xs text-surface-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="bg-surface-800 px-1 rounded">↑</kbd>
              <kbd className="bg-surface-800 px-1 rounded">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-surface-800 px-1 rounded">↵</kbd>
              select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="bg-surface-800 px-1.5 rounded">Ctrl</kbd>
            <kbd className="bg-surface-800 px-1 rounded">/</kbd>
            to toggle
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMMAND ITEM COMPONENT
// ============================================================================

interface CommandItemProps {
  command: SlashCommand;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function CommandItem({ command, isSelected, onSelect, onHover }: CommandItemProps) {
  return (
    <button
      data-selected={isSelected}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
        isSelected
          ? 'bg-accent-purple/20 text-surface-100'
          : 'text-surface-300 hover:bg-surface-800'
      }`}
      onClick={onSelect}
      onMouseEnter={onHover}
    >
      <span
        className={`flex-shrink-0 ${
          isSelected ? 'text-accent-purple' : 'text-surface-400'
        }`}
      >
        {command.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-medium">/{command.name}</div>
        <div className="text-xs text-surface-500 truncate">{command.description}</div>
      </div>
      {isSelected && (
        <kbd className="text-xs bg-accent-purple/20 text-accent-purple px-1.5 py-0.5 rounded">
          ↵
        </kbd>
      )}
    </button>
  );
}
