const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/shared/types/index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add preview fields to TerminalInfo
content = content.replace(
  /(sessionType\?: 'user' \| 'subagent';)\r?\n(\})/,
  `$1\n  isPreview?: boolean;\n  previewSessionId?: string;\n$2`
);

// Add preview settings to AppSettings interface
content = content.replace(
  /(budgetNotifications: boolean;)\r?\n(\})/,
  `$1\n  // Preview settings\n  showThinkingBlocks: boolean;\n  expandThinkingByDefault: boolean;\n  showToolUse: boolean;\n  expandToolUseByDefault: boolean;\n$2`
);

// Add preview settings to DEFAULT_SETTINGS
content = content.replace(
  /(budgetNotifications: false,)\r?\n(\};)/,
  `$1\n  // Preview settings\n  showThinkingBlocks: true,\n  expandThinkingByDefault: false,\n  showToolUse: true,\n  expandToolUseByDefault: false,\n$2`
);

// Add ParsedSessionEntry type at the end
content += `
// ============================================================================
// Session Preview Types
// ============================================================================

export interface ParsedSessionEntry {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'unknown';
  content: string;
  timestamp?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
`;

fs.writeFileSync(filePath, content, 'utf8');
console.log('File updated successfully');
