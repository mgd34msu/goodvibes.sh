// ============================================================================
// HOOKS VIEW - BUILT-IN HOOK TEMPLATES
// ============================================================================

import type { HookEventType } from './types';

export interface BuiltinHook {
  id: string;
  name: string;
  description: string;
  eventType: HookEventType;
  matcher: string | null;
  command: string;
  hookType: 'command' | 'prompt';
  prompt: string | null;
  timeout: number;
  category: 'safety' | 'automation' | 'notifications' | 'workflow';
  tags: string[];
}

// Category colors for badges
export const CATEGORY_COLORS: Record<BuiltinHook['category'], string> = {
  safety: 'bg-red-500/10 text-red-400 border-red-500/20',
  automation: 'bg-green-500/10 text-green-400 border-green-500/20',
  notifications: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  workflow: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

export const CATEGORY_LABELS: Record<BuiltinHook['category'], string> = {
  safety: 'Safety',
  automation: 'Automation',
  notifications: 'Notifications',
  workflow: 'Workflow',
};

export const BUILT_IN_HOOKS: BuiltinHook[] = [
  // ============================================================================
  // PreToolUse Hooks - Safety & Validation
  // ============================================================================
  {
    id: 'block-dangerous-commands',
    name: 'Block Dangerous Commands',
    description: 'Blocks rm -rf, format, and other destructive bash commands before execution',
    eventType: 'PreToolUse',
    matcher: 'Bash',
    command: `#!/bin/bash
# Block dangerous bash commands
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# List of dangerous patterns
DANGEROUS_PATTERNS=(
  "rm -rf /"
  "rm -rf /*"
  "rm -rf ~"
  "rm -rf $HOME"
  "format c:"
  "mkfs"
  ":(){:|:&};:"
  "dd if=/dev/zero"
  "chmod -R 777 /"
  "> /dev/sda"
)

for pattern in "\${DANGEROUS_PATTERNS[@]}"; do
  if [[ "$COMMAND" == *"$pattern"* ]]; then
    echo '{"decision":"block","reason":"Blocked dangerous command: '"$pattern"'"}' | jq .
    exit 2
  fi
done

# Allow safe commands
echo '{"decision":"allow"}' | jq .
exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 5000,
    category: 'safety',
    tags: ['security', 'bash', 'destructive', 'block'],
  },
  {
    id: 'auto-approve-read-operations',
    name: 'Auto-Approve Read Operations',
    description: 'Automatically allows Read, Glob, and Grep tools without prompting',
    eventType: 'PreToolUse',
    matcher: 'Read|Glob|Grep',
    command: `#!/bin/bash
# Auto-approve read-only operations
echo '{"decision":"allow","reason":"Auto-approved read-only operation"}'
exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 1000,
    category: 'automation',
    tags: ['auto-approve', 'read-only', 'permissions'],
  },

  // ============================================================================
  // PostToolUse Hooks - Automation
  // ============================================================================
  {
    id: 'run-linter-after-edit',
    name: 'Run Linter After Edit',
    description: 'Runs ESLint after file edits to catch issues immediately',
    eventType: 'PostToolUse',
    matcher: 'Edit|Write',
    command: `#!/bin/bash
# Run ESLint after edits
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

# Only lint JS/TS files
if [[ "$FILE_PATH" =~ \\.(js|jsx|ts|tsx)$ ]]; then
  cd "$CWD" 2>/dev/null || exit 0

  if command -v npx &> /dev/null && [ -f "node_modules/.bin/eslint" ]; then
    npx eslint --fix "$FILE_PATH" 2>&1 || true
  fi
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 30000,
    category: 'automation',
    tags: ['linting', 'eslint', 'code-quality', 'edit'],
  },
  {
    id: 'auto-format-on-save',
    name: 'Auto-Format on Save',
    description: 'Runs Prettier to format files after writes',
    eventType: 'PostToolUse',
    matcher: 'Write',
    command: `#!/bin/bash
# Auto-format with Prettier after writes
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

cd "$CWD" 2>/dev/null || exit 0

if command -v npx &> /dev/null && [ -f "node_modules/.bin/prettier" ]; then
  npx prettier --write "$FILE_PATH" 2>&1 || true
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 10000,
    category: 'automation',
    tags: ['formatting', 'prettier', 'code-style', 'write'],
  },

  // ============================================================================
  // Notification Hooks - Alerts
  // ============================================================================
  {
    id: 'desktop-notification-idle',
    name: 'Desktop Notification on Idle',
    description: 'Shows a system notification when Claude becomes idle and needs input',
    eventType: 'Notification',
    matcher: 'idle_prompt',
    command: `#!/bin/bash
# Cross-platform desktop notification
INPUT=$(cat)
MESSAGE=$(echo "$INPUT" | jq -r '.message // "Claude is waiting for input"')

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  osascript -e "display notification \\"$MESSAGE\\" with title \\"Claude Code\\""
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]; then
  # Windows (PowerShell)
  powershell -Command "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $textNodes = $template.GetElementsByTagName('text'); $textNodes.Item(0).AppendChild($template.CreateTextNode('Claude Code')); $textNodes.Item(1).AppendChild($template.CreateTextNode('$MESSAGE')); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code').Show([Windows.UI.Notifications.ToastNotification]::new($template))" 2>/dev/null || \\
  powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('$MESSAGE', 'Claude Code')" 2>/dev/null
else
  # Linux
  if command -v notify-send &> /dev/null; then
    notify-send "Claude Code" "$MESSAGE"
  fi
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 5000,
    category: 'notifications',
    tags: ['notification', 'desktop', 'idle', 'alert'],
  },
  {
    id: 'sound-alert-permission',
    name: 'Sound Alert on Permission',
    description: 'Plays a system sound when Claude needs permission approval',
    eventType: 'Notification',
    matcher: 'permission_prompt',
    command: `#!/bin/bash
# Cross-platform sound alert
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS - play system sound
  afplay /System/Library/Sounds/Glass.aiff &
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ -n "$WINDIR" ]]; then
  # Windows - play system beep
  powershell -Command "[console]::beep(800,300)" 2>/dev/null || echo -e "\\a"
else
  # Linux - try various methods
  if command -v paplay &> /dev/null; then
    paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null &
  elif command -v aplay &> /dev/null; then
    aplay /usr/share/sounds/sound-icons/glass-water-1.wav 2>/dev/null &
  else
    echo -e "\\a"
  fi
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 3000,
    category: 'notifications',
    tags: ['sound', 'alert', 'permission', 'audio'],
  },

  // ============================================================================
  // UserPromptSubmit Hooks - Context Injection
  // ============================================================================
  {
    id: 'inject-project-context',
    name: 'Inject Project Context',
    description: 'Adds project information and relevant context files to every prompt',
    eventType: 'UserPromptSubmit',
    matcher: null,
    command: `#!/bin/bash
# Inject project context into prompts
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

# Build context from project files
CONTEXT=""

# Add package.json info if present
if [ -f "$CWD/package.json" ]; then
  PKG_NAME=$(jq -r '.name // "unknown"' "$CWD/package.json" 2>/dev/null)
  PKG_DESC=$(jq -r '.description // ""' "$CWD/package.json" 2>/dev/null)
  CONTEXT="Project: $PKG_NAME"
  if [ -n "$PKG_DESC" ]; then
    CONTEXT="$CONTEXT - $PKG_DESC"
  fi
  CONTEXT="$CONTEXT\\n"
fi

# Add CLAUDE.md summary if present
if [ -f "$CWD/CLAUDE.md" ]; then
  CONTEXT="$CONTEXT\\nProject has CLAUDE.md with custom instructions."
fi

# Output the context to be injected
if [ -n "$CONTEXT" ]; then
  echo -e "[Project Context]\\n$CONTEXT\\n"
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 5000,
    category: 'workflow',
    tags: ['context', 'injection', 'prompt', 'project'],
  },

  // ============================================================================
  // SessionStart Hooks - Initialization
  // ============================================================================
  {
    id: 'load-environment-variables',
    name: 'Load Environment Variables',
    description: 'Loads .env file variables into the Claude session environment',
    eventType: 'SessionStart',
    matcher: 'startup',
    command: `#!/bin/bash
# Load .env file into session
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

if [ -f "$CWD/.env" ]; then
  echo "[SessionStart] Loading environment from .env"

  # Export vars (excluding comments and empty lines)
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue

    # Remove quotes from value if present
    value="\${value%\\"}"
    value="\${value#\\"}"
    value="\${value%\\'}"
    value="\${value#\\'}"

    export "$key=$value"
    echo "  Loaded: $key"
  done < "$CWD/.env"
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 5000,
    category: 'workflow',
    tags: ['environment', 'env', 'startup', 'initialization'],
  },

  // ============================================================================
  // Stop Hooks - Validation
  // ============================================================================
  {
    id: 'run-tests-before-stop',
    name: 'Run Tests Before Stop',
    description: 'Ensures tests pass before allowing Claude to finish the task',
    eventType: 'Stop',
    matcher: null,
    command: `#!/bin/bash
# Run tests before allowing Claude to stop
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

cd "$CWD" 2>/dev/null || exit 0

# Check if package.json has test script
if [ -f "package.json" ] && jq -e '.scripts.test' package.json > /dev/null 2>&1; then
  echo "[Stop Hook] Running tests before completion..."

  if npm test 2>&1; then
    echo "[Stop Hook] Tests passed!"
    exit 0
  else
    echo "[Stop Hook] Tests failed! Please fix before stopping."
    echo '{"decision":"block","reason":"Tests are failing. Please fix the failing tests before completing the task."}'
    exit 2
  fi
fi

# No tests configured, allow stop
exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 120000,
    category: 'workflow',
    tags: ['tests', 'validation', 'stop', 'quality'],
  },

  // ============================================================================
  // Additional Useful Hooks
  // ============================================================================
  {
    id: 'validate-json-schema',
    name: 'Validate JSON Files',
    description: 'Validates JSON files against common schemas after writes',
    eventType: 'PostToolUse',
    matcher: 'Write',
    command: `#!/bin/bash
# Validate JSON files after write
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only check JSON files
if [[ "$FILE_PATH" =~ \\.json$ ]]; then
  # Try to parse the JSON to validate syntax
  if ! jq . "$FILE_PATH" > /dev/null 2>&1; then
    echo "[JSON Validation] Warning: Invalid JSON syntax in $FILE_PATH"
    exit 1
  fi
  echo "[JSON Validation] $FILE_PATH is valid JSON"
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 5000,
    category: 'automation',
    tags: ['json', 'validation', 'schema', 'write'],
  },
  {
    id: 'git-status-after-edit',
    name: 'Git Status After Edit',
    description: 'Shows git status after file modifications to track changes',
    eventType: 'PostToolUse',
    matcher: 'Edit|Write',
    command: `#!/bin/bash
# Show git status after edits
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')

cd "$CWD" 2>/dev/null || exit 0

# Only run if in a git repo
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "[Git] Changes after edit:"
  git status --short 2>/dev/null
fi

exit 0`,
    hookType: 'command',
    prompt: null,
    timeout: 5000,
    category: 'workflow',
    tags: ['git', 'status', 'tracking', 'edit'],
  },
];
