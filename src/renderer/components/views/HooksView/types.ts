// ============================================================================
// HOOKS VIEW - SHARED TYPES AND CONSTANTS
// ============================================================================

import React from 'react';
import {
  Zap,
  CheckCircle,
  Play,
  Pause,
  AlertCircle,
  XCircle,
} from 'lucide-react';

export interface Hook {
  id: number;
  name: string;
  eventType: HookEventType;
  matcher: string | null;
  command: string;
  timeout: number;
  enabled: boolean;
  scope: 'user' | 'project';
  projectPath: string | null;
  executionCount: number;
  lastExecuted: string | null;
  lastResult: 'success' | 'failure' | 'timeout' | null;
  createdAt: string;
  updatedAt: string;
}

export type HookEventType =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Notification'
  | 'Stop';

export const EVENT_TYPES: { value: HookEventType; label: string; description: string }[] = [
  { value: 'PreToolUse', label: 'Pre Tool Use', description: 'Before a tool is executed' },
  { value: 'PostToolUse', label: 'Post Tool Use', description: 'After a tool completes' },
  { value: 'SessionStart', label: 'Session Start', description: 'When a session begins' },
  { value: 'SessionEnd', label: 'Session End', description: 'When a session ends' },
  {
    value: 'Notification',
    label: 'Notification',
    description: 'When Claude sends a notification',
  },
  { value: 'Stop', label: 'Stop', description: 'When Claude stops' },
];

export const EVENT_TYPE_ICONS: Record<HookEventType, React.ReactNode> = {
  PreToolUse: React.createElement(Zap, { className: 'w-4 h-4 text-yellow-400' }),
  PostToolUse: React.createElement(CheckCircle, { className: 'w-4 h-4 text-green-400' }),
  SessionStart: React.createElement(Play, { className: 'w-4 h-4 text-blue-400' }),
  SessionEnd: React.createElement(Pause, { className: 'w-4 h-4 text-purple-400' }),
  Notification: React.createElement(AlertCircle, { className: 'w-4 h-4 text-orange-400' }),
  Stop: React.createElement(XCircle, { className: 'w-4 h-4 text-red-400' }),
};
