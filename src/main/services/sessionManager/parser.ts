// ============================================================================
// SESSION MANAGER - FILE PARSER
// ============================================================================

import fs from 'fs/promises';
import { Logger } from '../logger.js';
import type { SessionMessage } from '../../../shared/types/index.js';
import type { TokenStats, ParsedSessionData } from './types.js';
import { resolveToolNames } from './toolParser.js';

const logger = new Logger('SessionParser');

// ============================================================================
// SESSION FILE PARSING
// ============================================================================

/**
 * Parse a session file and extract messages, token stats, cost, and tool usage
 */
export async function parseSessionFileWithStats(filePath: string): Promise<ParsedSessionData> {
  const messages: Partial<SessionMessage>[] = [];
  let tokenStats: TokenStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
  let costUSD = 0;
  let model: string | null = null;
  const toolUsage = new Map<string, number>();

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Use regex-based token extraction for robustness
    const sumTokens = (regex: RegExp): number => {
      const matches = content.match(regex) || [];
      return matches.reduce((acc, m) => {
        const numMatch = m.match(/\d+/);
        return acc + (numMatch ? parseInt(numMatch[0], 10) : 0);
      }, 0);
    };

    tokenStats = {
      inputTokens: sumTokens(/"input_tokens"\s*:\s*\d+/g),
      outputTokens: sumTokens(/"output_tokens"\s*:\s*\d+/g),
      cacheWriteTokens: sumTokens(/"cache_creation_input_tokens"\s*:\s*\d+/g),
      cacheReadTokens: sumTokens(/"cache_read_input_tokens"\s*:\s*\d+/g),
    };

    // Extract model name
    const modelMatch = content.match(/"model"\s*:\s*"([^"]+)"/);
    if (modelMatch) {
      model = modelMatch[1] ?? null;
    }

    // Extract cost using regex
    const costMatches = content.match(/"costUSD"\s*:\s*[\d.]+/g) || [];
    costUSD = costMatches.reduce((acc, m) => {
      const numMatch = m.match(/[\d.]+$/);
      return acc + (numMatch ? parseFloat(numMatch[0]) : 0);
    }, 0);

    // Parse messages line by line
    const lines = content.trim().split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const parsed = parseEntry(entry);
        if (parsed) {
          messages.push(parsed);
        }

        // Extract tool usage from tool_use entries
        extractToolUsage(entry, toolUsage);
      } catch (error) {
        logger.debug('Skipped malformed JSON line in session file', {
          filePath,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  } catch (error) {
    logger.error(`Failed to parse session file: ${filePath}`, error);
  }

  return { messages, tokenStats, costUSD, model, toolUsage };
}

/**
 * Parse a single entry from a session file
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEntry(entry: any): Partial<SessionMessage> | null {
  let role = entry.type || entry.role || 'unknown';
  let content = '';
  let tokenCount = 0;

  // Extract token count from usage data
  if (entry.usage) {
    tokenCount = (entry.usage.input_tokens ?? 0) + (entry.usage.output_tokens ?? 0);
  }

  // Handle different entry types
  if (entry.type === 'thinking' || entry.thinking) {
    role = 'thinking';
    content = entry.thinking || entry.content || '';
  } else if (entry.type === 'tool_use' || entry.tool_use) {
    role = 'tool';
    const tool = entry.tool_use || entry;
    content = `[Tool: ${tool.name || 'unknown'}]\n${JSON.stringify(tool.input || {}, null, 2)}`;
  } else if (entry.type === 'tool_result' || entry.tool_result) {
    role = 'tool_result';
    const result = entry.tool_result || entry;
    content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content || result, null, 2);
  } else if (entry.message !== undefined) {
    content = extractContent(entry.message);
  } else if (entry.content) {
    content = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
  }

  if (!content.trim()) return null;

  return {
    role,
    content,
    timestamp: entry.timestamp,
    tokenCount,
  };
}

/**
 * Extract content from a message
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractContent(message: any): string {
  if (typeof message === 'string') return message;

  if (Array.isArray(message)) {
    return message
      .map(block => {
        if (typeof block === 'string') return block;
        if (block.type === 'text') return block.text || '';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  if (typeof message === 'object') {
    if (message.content) return extractContent(message.content);
    if (message.text) return message.text;
  }

  return '';
}

/**
 * Extract tool usage from a session entry and update the toolUsage map
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractToolUsage(entry: any, toolUsage: Map<string, number>): void {
  // Check for direct tool_use entry
  if (entry.type === 'tool_use' || entry.tool_use) {
    const tool = entry.tool_use || entry;
    const toolName = tool.name;
    const toolInput = tool.input;

    if (toolName) {
      const resolvedNames = resolveToolNames(toolName, toolInput);
      for (const name of resolvedNames) {
        toolUsage.set(name, (toolUsage.get(name) || 0) + 1);
      }
    }
  }

  // Check for tool_use in message.content array
  if (entry.message?.content && Array.isArray(entry.message.content)) {
    for (const block of entry.message.content) {
      if (block.type === 'tool_use' && block.name) {
        const resolvedNames = resolveToolNames(block.name, block.input);
        for (const name of resolvedNames) {
          toolUsage.set(name, (toolUsage.get(name) || 0) + 1);
        }
      }
    }
  }
}
