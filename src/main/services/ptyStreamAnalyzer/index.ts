// ============================================================================
// PTY STREAM ANALYZER - Main exports
// ============================================================================

import { PTYStreamAnalyzerService } from './service.js';

// Re-export types
export type {
  StreamEvent,
  StreamEventType,
  ToolCall,
  StreamMetrics,
  PatternDefinition,
} from './types.js';

// Re-export pattern utilities
export { isToolName, STREAM_PATTERNS } from './patterns.js';

// Re-export the service class
export { PTYStreamAnalyzerService };

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let streamAnalyzer: PTYStreamAnalyzerService | null = null;

export function getPTYStreamAnalyzer(): PTYStreamAnalyzerService {
  if (!streamAnalyzer) {
    streamAnalyzer = new PTYStreamAnalyzerService();
  }
  return streamAnalyzer;
}

export function shutdownPTYStreamAnalyzer(): void {
  if (streamAnalyzer) {
    streamAnalyzer.shutdown();
    streamAnalyzer = null;
  }
}
