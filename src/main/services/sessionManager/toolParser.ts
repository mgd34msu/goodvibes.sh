// ============================================================================
// SESSION MANAGER - TOOL PARSER
// ============================================================================

import { Logger } from '../logger.js';

const logger = new Logger('ToolParser');

// ============================================================================
// MCP CLI TOOL PARSER
// ============================================================================

export function parseMcpCliTool(toolRef: string): string | null {
  if (!toolRef || typeof toolRef !== 'string') {
    return null;
  }
  const parts = toolRef.split('/');
  if (parts.length !== 2) {
    return `mcp-cli: ${toolRef}`;
  }
  const server = parts[0];
  const tool = parts[1];
  if (!server || !tool) {
    return `mcp-cli: ${toolRef}`;
  }
  const isGoodvibes = server.toLowerCase().includes('goodvibes');
  if (isGoodvibes) {
    return `goodvibes - ${tool}`;
  }
  return `mcp:${server} - ${tool}`;
}

// ============================================================================
// BASH COMMAND PARSER
// ============================================================================

export function parseBashCommand(command: string): string[] {
  if (!command || typeof command !== 'string') {
    logger.debug('[TOOL_PARSE] No command or not string', { command });
    return ['Bash'];
  }
  const tools: string[] = [];
  logger.debug('[TOOL_PARSE] Parsing command', { command: command.substring(0, 100) });

  // Check for mcp-cli calls first (highest priority)
  const mcpMatch = command.match(/mcp-cli\s+(?:call|info)\s+([^\s'"]+)/);
  // Also match mcp-cli tools, servers, grep, resources, read
  const mcpOtherMatch = command.match(/^mcp-cli\s+(tools|servers|grep|resources|read)\b/i);
  if (mcpOtherMatch) {
    return [`mcp-cli ${mcpOtherMatch[1]}`];
  }
  if (mcpMatch && mcpMatch[1]) {
    const mcpTool = parseMcpCliTool(mcpMatch[1]);
    if (mcpTool) {
      tools.push(mcpTool);
    }
  }
  if (tools.length > 0) {
    return tools;
  }

  // Extract the first command (handle cd prefix - including Windows cd /d)
  const cleanedCommand = command
    .replace(/^cd\s+\/d\s+"[^"]+"\s*&&\s*/i, '')  // Windows: cd /d "path" &&
    .replace(/^cd\s+\/d\s+[^\s]+\s*&&\s*/i, '')   // Windows: cd /d path &&
    .replace(/^cd\s+"[^"]+"\s*&&\s*/i, '')        // Unix: cd "path" &&
    .replace(/^cd\s+[^\s]+\s*&&\s*/i, '')         // Unix: cd path &&
    .trim();

  const commandPatterns: Array<{ pattern: RegExp; name: string | ((match: RegExpMatchArray) => string) }> = [
    { pattern: /^git\s+(add|commit|push|pull|fetch|merge|rebase|checkout|branch|status|diff|log|stash|reset|cherry-pick|clone|init|tag|remote)/i, name: (m) => `git ${m[1] ?? ''}` },
    { pattern: /^git\s+/i, name: 'git' },
    { pattern: /^npm\s+(install|run|test|build|start|publish|update|outdated|audit|ci|init|link|pack|uninstall)/i, name: (m) => `npm ${m[1] ?? ''}` },
    { pattern: /^npm\s+/i, name: 'npm' },
    { pattern: /^pnpm\s+(install|run|test|build|add|remove|update)/i, name: (m) => `pnpm ${m[1] ?? ''}` },
    { pattern: /^pnpm\s+/i, name: 'pnpm' },
    { pattern: /^yarn\s+(add|remove|install|run|build|test|start)/i, name: (m) => `yarn ${m[1] ?? ''}` },
    { pattern: /^yarn\s+/i, name: 'yarn' },
    { pattern: /^bun\s+(install|run|test|build|add|remove)/i, name: (m) => `bun ${m[1] ?? ''}` },
    { pattern: /^bun\s+/i, name: 'bun' },
    { pattern: /^(vitest|jest|mocha|playwright|cypress)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(tsc|typescript|eslint|prettier|biome)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(vite|webpack|rollup|esbuild|turbo)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^docker(-compose)?\s+(build|run|exec|ps|logs|pull|push|start|stop|up|down)/i, name: (m) => `docker ${m[2] ?? ''}` },
    { pattern: /^docker(-compose)?\s+/i, name: 'docker' },
    { pattern: /^kubectl\s+(get|apply|delete|describe|logs|exec|port-forward)/i, name: (m) => `kubectl ${m[1] ?? ''}` },
    { pattern: /^kubectl\s+/i, name: 'kubectl' },
    { pattern: /^(curl|wget|gh|az|aws|gcloud|terraform|pulumi)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(python|python3|node|deno|bun|ruby|go|cargo|rustc)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(powershell|pwsh|cmd)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(mkdir|rm|rmdir|mv|cp|touch|chmod|chown)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(cat|head|tail|less|more|grep|find|ls|dir)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(taskkill|tasklist|netstat|ipconfig|ping)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    // npx commands (must be before bun since bun pattern might also match)
    { pattern: /^npx\s+(\S+)/i, name: (m) => `npx ${m[1] ?? ''}` },
    // Windows-specific commands
    { pattern: /^(rd|del|copy|move|type|where|attrib|icacls)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    { pattern: /^(echo|set|setx|cls|exit|pause)/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    // SQLite
    { pattern: /^sqlite3?\s+/i, name: 'sqlite' },
    // Shell utilities
    { pattern: /^(wc|timeout|sleep|pkill|kill)\b/i, name: (m) => (m[1] ?? 'unknown').toLowerCase() },
    // Command check
    { pattern: /^command\s+-v\s+/i, name: 'command' },
  ];

  for (const { pattern, name } of commandPatterns) {
    const match = cleanedCommand.match(pattern);
    if (match) {
      const toolName = typeof name === 'function' ? name(match) : name;
      tools.push(toolName);
      break;
    }
  }
  return tools.length > 0 ? tools : ['Bash'];
}

// ============================================================================
// TOOL NAME RESOLVER
// ============================================================================

export function resolveToolNames(toolName: string, toolInput: Record<string, unknown> | null): string[] {
  if (toolName === 'Bash' && toolInput && typeof toolInput.command === 'string') {
    return parseBashCommand(toolInput.command);
  }
  return [toolName];
}
