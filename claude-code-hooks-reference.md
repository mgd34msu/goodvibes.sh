# Claude Code Hooks: Comprehensive Reference Guide

Hooks are shell commands or LLM prompts that execute automatically at specific points in Claude Code's lifecycle. They provide deterministic control over Claude's behavior—unlike instructions in CLAUDE.md which are suggestions, hooks are guaranteed to run.

---

## Table of Contents

1. [Configuration](#configuration)
2. [Hook Events Reference](#hook-events-reference)
3. [Input Schemas](#input-schemas)
4. [Output & Decision Control](#output--decision-control)
5. [Working with MCP Tools](#working-with-mcp-tools)
6. [Best Practices](#best-practices)
7. [Debugging](#debugging)

---

## Configuration

### Settings File Locations

| Location | Scope | Priority |
|----------|-------|----------|
| `.claude/settings.json` | Project | Highest |
| `.claude/settings.local.json` | Project (not committed) | High |
| `~/.claude/settings.json` | User (all projects) | Lower |
| Enterprise managed policy | Organization | Varies |

### Basic Structure

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [
          {
            "type": "command",
            "command": "your-command-here",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

### Configuration Fields

| Field | Description |
|-------|-------------|
| `matcher` | Pattern to match (tool names, notification types, etc.). Supports regex. Use `*` or `""` for all. |
| `type` | `"command"` for shell commands, `"prompt"` for LLM-based evaluation |
| `command` | Shell command to execute (for `type: "command"`) |
| `prompt` | LLM prompt text (for `type: "prompt"`) |
| `timeout` | Timeout in seconds (default: 60) |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_PROJECT_DIR` | Absolute path to project root |
| `CLAUDE_CODE_REMOTE` | `"true"` if running in web environment |
| `CLAUDE_ENV_FILE` | File path for persisting env vars (SessionStart only) |

---

## Hook Events Reference

### Quick Reference Table

| Hook | When It Fires | Matcher Support | Can Block | Exit Code 2 Behavior |
|------|---------------|-----------------|-----------|---------------------|
| **PreToolUse** | Before tool executes | ✅ Tool name | ✅ Deny | Blocks tool, shows stderr to Claude |
| **PermissionRequest** | Permission dialog shown | ✅ Tool name | ✅ Deny | Denies permission, shows stderr to Claude |
| **PostToolUse** | After tool succeeds | ✅ Tool name | ✅ Feedback | Shows stderr to Claude |
| **PostToolUseFailure** | After tool fails | ✅ Tool name | ✅ Feedback | Shows stderr to Claude |
| **Notification** | System notification | ✅ Notification type | ❌ | Shows stderr to user only |
| **UserPromptSubmit** | User submits prompt | ❌ | ✅ Block | Blocks prompt, shows stderr to user |
| **Stop** | Main agent finishes | ❌ | ✅ Force continue | Blocks stop, shows stderr to Claude |
| **SubagentStart** | Subagent spawns | ✅ Subagent name | ❌ | Shows stderr to user only |
| **SubagentStop** | Subagent finishes | ❌ | ✅ Force continue | Blocks stop, shows stderr to subagent |
| **PreCompact** | Before compaction | ✅ manual/auto | ❌ | Shows stderr to user only |
| **SessionStart** | Session begins | ✅ Source type | ❌ | Shows stderr to user only |
| **SessionEnd** | Session ends | ❌ | ❌ | Shows stderr to user only |

---

### 1. PreToolUse

**When it fires:** After Claude creates tool parameters, before the tool executes.

**Use cases:**
- Block dangerous operations (rm -rf, .env access)
- Auto-approve safe operations
- Modify tool inputs before execution
- Validate commands against security policies

**Common matchers:**
- `Bash` - Shell commands
- `Read` - File reading
- `Write` - File creation
- `Edit` - File editing
- `Glob` - File pattern matching
- `Grep` - Content search
- `Task` - Subagent tasks
- `WebFetch`, `WebSearch` - Web operations

**Example:**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-bash.py"
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/check-file-permissions.sh"
          }
        ]
      }
    ]
  }
}
```

**Decision control (JSON output):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Auto-approved documentation file",
    "updatedInput": {
      "command": "npm run lint --fix"
    }
  }
}
```

| Decision | Effect |
|----------|--------|
| `"allow"` | Bypasses permission system |
| `"deny"` | Prevents tool execution |
| `"ask"` | Shows user confirmation dialog |

---

### 2. PermissionRequest

**When it fires:** When the user is shown a permission dialog (before they respond).

**Use cases:**
- Auto-approve permissions programmatically
- Implement custom permission logic
- Deny permissions based on context

**Matchers:** Same as PreToolUse (tool names)

**Example:**
```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/auto-approve-reads.sh"
          }
        ]
      }
    ]
  }
}
```

**Decision control (JSON output):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedInput": {
        "command": "npm run lint"
      }
    }
  }
}
```

For deny:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "deny",
      "message": "This operation is not allowed",
      "interrupt": true
    }
  }
}
```

---

### 3. PostToolUse

**When it fires:** Immediately after a tool completes successfully.

**Use cases:**
- Run linters/formatters after file edits
- Execute tests after code changes
- Log tool results for auditing
- Trigger downstream workflows

**Matchers:** Same as PreToolUse (tool names)

**Example:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs -I {} sh -c 'if echo {} | grep -qE \"\\.(ts|tsx)$\"; then npx prettier --write {}; fi'"
          }
        ]
      }
    ]
  }
}
```

**Decision control (JSON output):**
```json
{
  "decision": "block",
  "reason": "Linting failed: 3 errors found",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Error details: missing semicolons on lines 12, 45, 67"
  }
}
```

---

### 4. PostToolUseFailure

**When it fires:** After a tool fails (as opposed to PostToolUse which fires on success).

**Use cases:**
- Custom error handling and recovery
- Failure logging and alerting
- Retry logic implementation
- Error analysis and reporting

**Matchers:** Same as PreToolUse (tool names)

**Example:**
```json
{
  "hooks": {
    "PostToolUseFailure": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/log-failure.sh"
          }
        ]
      }
    ]
  }
}
```

---

### 5. Notification

**When it fires:** When Claude Code sends notifications to the user.

**Notification types (matchers):**
| Type | Description |
|------|-------------|
| `permission_prompt` | Permission requests from Claude |
| `idle_prompt` | After 60+ seconds of idle time |
| `auth_success` | Authentication success |
| `elicitation_dialog` | MCP tool elicitation |

**Use cases:**
- Desktop notifications when Claude needs attention
- Slack/Discord alerts for permission requests
- Custom sound alerts
- Mobile push notifications

**Example:**
```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude needs permission\" with title \"Claude Code\"'"
          }
        ]
      },
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "say 'Claude is waiting for your input'"
          }
        ]
      }
    ]
  }
}
```

---

### 6. UserPromptSubmit

**When it fires:** When the user submits a prompt, before Claude processes it.

**Use cases:**
- Inject dynamic context (git status, TODOs, sprint info)
- Validate prompts for sensitive content
- Block certain types of requests
- Add security filtering

**Special behavior:** `stdout` is added to conversation context (not shown to Claude otherwise).

**Example:**
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/inject-context.py"
          }
        ]
      }
    ]
  }
}
```

**Context injection script example:**
```python
#!/usr/bin/env python3
import json
import sys
import subprocess

# Read input
input_data = json.load(sys.stdin)
prompt = input_data.get("prompt", "")

# Inject git context
git_status = subprocess.run(["git", "status", "--short"], capture_output=True, text=True)
git_branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True)

context = f"""
Current branch: {git_branch.stdout.strip()}
Modified files:
{git_status.stdout}
"""

# Output context (will be added to conversation)
print(context)
sys.exit(0)
```

**Decision control (JSON output):**
```json
{
  "decision": "block",
  "reason": "Prompt contains potential secrets. Please rephrase.",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Current sprint: Q1-2026 Auth Refactor"
  }
}
```

---

### 7. Stop

**When it fires:** When the main Claude Code agent finishes responding. Does NOT fire on user interrupt.

**Use cases:**
- Force Claude to continue working
- Run cleanup tasks
- Send completion notifications
- Ensure all tasks are complete before stopping

**Important:** Check `stop_hook_active` to prevent infinite loops.

**Example:**
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/verify-completion.sh"
          }
        ]
      }
    ]
  }
}
```

**Prompt-based hook example (LLM evaluation):**
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if Claude should stop. Context: $ARGUMENTS\n\nCheck if:\n1. All requested tasks are complete\n2. Any errors need addressing\n3. Tests pass\n\nRespond with JSON: {\"decision\": \"approve\" or \"block\", \"reason\": \"explanation\"}",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**Decision control (JSON output):**
```json
{
  "decision": "block",
  "reason": "Tests are still failing. Please fix the 3 failing test cases before stopping."
}
```

---

### 8. SubagentStart

**When it fires:** When a subagent is spawned via the Task tool.

**Use cases:**
- Set up resources before subagent runs
- Initialize database connections
- Configure environment for specific subagents
- Inject subagent-specific context

**Matchers:** Subagent names

**Example:**
```json
{
  "hooks": {
    "SubagentStart": [
      {
        "matcher": "db-agent",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/setup-db-connection.sh"
          }
        ]
      },
      {
        "matcher": "test-runner",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/setup-test-env.sh"
          }
        ]
      }
    ]
  }
}
```

---

### 9. SubagentStop

**When it fires:** When a Claude Code subagent (Task tool call) finishes responding.

**Use cases:**
- Ensure subagent tasks complete properly
- Clean up resources after subagent finishes
- Validate subagent output
- Coordinate between parallel agents

**Example:**
```json
{
  "hooks": {
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/cleanup-subagent.sh"
          }
        ]
      }
    ]
  }
}
```

**Paired with SubagentStart for lifecycle management:**
```json
{
  "hooks": {
    "SubagentStart": [
      {
        "matcher": "db-agent",
        "hooks": [{ "type": "command", "command": "./scripts/setup-db-connection.sh" }]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "db-agent",
        "hooks": [{ "type": "command", "command": "./scripts/cleanup-db-connection.sh" }]
      }
    ]
  }
}
```

**Decision control:** Same as Stop hook.

---

### 10. PreCompact

**When it fires:** Before Claude Code runs a compaction operation (context window management).

**Matchers:**
| Value | Trigger |
|-------|---------|
| `manual` | From `/compact` command |
| `auto` | From automatic compaction |

**Use cases:**
- Backup transcripts before compaction
- Preserve important context
- Log pre-compaction state
- Export conversation data

**Example:**
```json
{
  "hooks": {
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "cp \"$(jq -r '.transcript_path' /dev/stdin)\" ~/backups/transcript-$(date +%s).jsonl"
          }
        ]
      }
    ]
  }
}
```

---

### 11. SessionStart

**When it fires:** When Claude Code starts a new session or resumes an existing one.

**Matchers:**
| Value | Trigger |
|-------|---------|
| `startup` | Fresh start |
| `resume` | From `--resume`, `--continue`, or `/resume` |
| `clear` | From `/clear` |
| `compact` | After compaction |

**Use cases:**
- Load development context (git status, TODOs, recent issues)
- Install dependencies
- Set up environment variables
- Initialize project state

**Special behavior:** Can write to `$CLAUDE_ENV_FILE` to persist environment variables.

**Example:**
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/load-context.sh"
          }
        ]
      }
    ]
  }
}
```

**Environment persistence script example:**
```bash
#!/bin/bash

# Capture current environment
ENV_BEFORE=$(export -p | sort)

# Run setup commands
source ~/.nvm/nvm.sh
nvm use 20

# Persist environment changes
if [ -n "$CLAUDE_ENV_FILE" ]; then
  ENV_AFTER=$(export -p | sort)
  comm -13 <(echo "$ENV_BEFORE") <(echo "$ENV_AFTER") >> "$CLAUDE_ENV_FILE"
fi

# Output context (added to conversation)
echo "Git branch: $(git branch --show-current)"
echo "Node version: $(node --version)"
echo "Recent commits:"
git log --oneline -5

exit 0
```

---

### 12. SessionEnd

**When it fires:** When a Claude Code session ends.

**Reason values in input:**
| Value | Trigger |
|-------|---------|
| `clear` | `/clear` command |
| `logout` | User logged out |
| `prompt_input_exit` | User exited while prompt visible |
| `other` | Other exit reasons |

**Use cases:**
- Cleanup tasks
- Log session statistics
- Save session state
- Send session summary notifications

**Example:**
```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/session-cleanup.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Input Schemas

All hooks receive JSON via stdin with common fields plus event-specific data.

### Common Fields (All Hooks)

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../session.jsonl",
  "cwd": "/Users/mike/projects/pellux",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

| Field | Description |
|-------|-------------|
| `session_id` | Unique session identifier |
| `transcript_path` | Path to conversation JSONL file |
| `cwd` | Current working directory |
| `permission_mode` | Current mode: `default`, `plan`, `acceptEdits`, `bypassPermissions` |
| `hook_event_name` | The hook event type |

### PreToolUse / PostToolUse Input

```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "...",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "npm run test"
  },
  "tool_use_id": "toolu_01ABC123..."
}
```

PostToolUse additionally includes:
```json
{
  "tool_response": {
    "stdout": "All tests passed",
    "stderr": "",
    "exit_code": 0
  }
}
```

### Notification Input

```json
{
  "hook_event_name": "Notification",
  "message": "Claude needs your permission to use Bash",
  "notification_type": "permission_prompt"
}
```

### UserPromptSubmit Input

```json
{
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Write a function to calculate factorial"
}
```

### Stop / SubagentStop Input

```json
{
  "hook_event_name": "Stop",
  "stop_hook_active": false
}
```

**Important:** `stop_hook_active` is `true` when Claude is already continuing due to a stop hook. Check this to prevent infinite loops.

### PreCompact Input

```json
{
  "hook_event_name": "PreCompact",
  "trigger": "manual",
  "custom_instructions": "Focus on the authentication refactor"
}
```

### SessionStart Input

```json
{
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```

### SessionEnd Input

```json
{
  "hook_event_name": "SessionEnd",
  "reason": "prompt_input_exit"
}
```

---

## Output & Decision Control

### Exit Codes

| Exit Code | Effect |
|-----------|--------|
| **0** | Success. `stdout` processed (shown in verbose mode or added to context for UserPromptSubmit/SessionStart) |
| **2** | Blocking error. `stderr` fed to Claude. JSON in `stdout` is ignored. |
| **Other** | Non-blocking error. `stderr` shown to user in verbose mode. |

### JSON Output Structure

Return structured JSON to `stdout` for sophisticated control:

```json
{
  "continue": true,
  "stopReason": "Message shown when continue is false",
  "suppressOutput": false,
  "systemMessage": "Warning message shown to user",
  "decision": "block",
  "reason": "Explanation for decision",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Auto-approved",
    "updatedInput": {},
    "additionalContext": "Extra info for Claude"
  }
}
```

### Decision Control by Hook Type

| Hook | Available Decisions |
|------|---------------------|
| PreToolUse | `allow`, `deny`, `ask` + `updatedInput` |
| PermissionRequest | `allow`, `deny` + `updatedInput`, `message`, `interrupt` |
| PostToolUse | `block` + `reason`, `additionalContext` |
| UserPromptSubmit | `block` + `reason`, `additionalContext` |
| Stop / SubagentStop | `block` + `reason` |
| SessionStart | `additionalContext` only |

---

## Working with MCP Tools

MCP tools follow the pattern `mcp__<server>__<tool>`:

```
mcp__memory__create_entities
mcp__filesystem__read_file
mcp__github__search_repositories
mcp__playwright__browser_click
```

### Targeting MCP Tools

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Memory operation' >> ~/mcp.log"
          }
        ]
      },
      {
        "matcher": "mcp__.*__write.*",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/validate-mcp-write.py"
          }
        ]
      }
    ]
  }
}
```

---

## Best Practices

### Do

- ✅ **Validate and sanitize inputs** - Never trust input data blindly
- ✅ **Always quote shell variables** - Use `"$VAR"` not `$VAR`
- ✅ **Use absolute paths** - Use `$CLAUDE_PROJECT_DIR` for project scripts
- ✅ **Check `stop_hook_active`** - Prevent infinite loops in Stop hooks
- ✅ **Test hooks manually first** - Run commands in isolation before configuring
- ✅ **Use specific matchers** - Target specific tools rather than `*` for performance
- ✅ **Handle errors gracefully** - Provide clear error messages

### Don't

- ❌ **Block path traversal** - Check for `..` in file paths
- ❌ **Touch sensitive files** - Skip `.env`, `.git/`, keys, credentials
- ❌ **Run expensive operations on every tool** - Scope matchers precisely
- ❌ **Forget timeout configuration** - Long-running hooks can slow everything down
- ❌ **Ignore exit codes** - Use appropriate codes for your intent

### Performance Tips

- Hooks run in parallel when multiple match
- Timeout defaults to 60 seconds (configurable per hook)
- Identical hook commands are deduplicated automatically
- Use matchers to avoid running hooks unnecessarily

---

## Debugging

### Enable Debug Mode

```bash
claude --debug
```

### Check Hook Configuration

```
/hooks
```

### Debug Output Example

```
[DEBUG] Executing hooks for PostToolUse:Write
[DEBUG] Getting matching hook commands for PostToolUse with query: Write
[DEBUG] Found 1 hook matchers in settings
[DEBUG] Matched 1 hooks for query "Write"
[DEBUG] Found 1 hook commands to execute
[DEBUG] Executing hook command: ./scripts/format.sh with timeout 60000ms
[DEBUG] Hook command completed with status 0: Formatted successfully
```

### Common Issues

| Problem | Solution |
|---------|----------|
| Hook not running | Check `/hooks`, verify matcher pattern, ensure script is executable |
| JSON not parsing | Ensure exit code is 0, check JSON syntax |
| Command not found | Use absolute paths or `$CLAUDE_PROJECT_DIR` |
| Infinite loop | Check `stop_hook_active` in Stop hooks |
| Changes not taking effect | Hooks snapshot at startup; use `/hooks` to review changes |

---

## Complete Example Configuration

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/load-context.sh"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/inject-sprint-context.py"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/validate-bash.py"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/format-and-lint.sh"
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "db-agent",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/setup-db.sh"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "db-agent",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/cleanup-db.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all tasks are complete. Context: $ARGUMENTS. Return {\"decision\": \"approve\" or \"block\", \"reason\": \"...\"}",
            "timeout": 30
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude needs permission\" with title \"Claude Code\"'"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/backup-transcript.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-summary.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Resources

- [Official Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Hooks Getting Started Guide](https://code.claude.com/docs/en/hooks-guide)
- [Subagents Documentation](https://code.claude.com/docs/en/sub-agents)
- [Settings Reference](https://code.claude.com/docs/en/settings)

---

*Last updated: January 2026*
