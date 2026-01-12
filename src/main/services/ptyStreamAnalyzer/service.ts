// ============================================================================
// PTY STREAM ANALYZER SERVICE - Real-time Terminal Output Analysis
// ============================================================================

import { EventEmitter } from 'events';
import { Logger } from '../logger.js';
import { recordDetailedToolUsage } from '../../database/primitives.js';
import type { StreamEvent, ToolCall, StreamMetrics, PatternDefinition } from './types.js';
import { STREAM_PATTERNS, isToolName } from './patterns.js';

const logger = new Logger('PTYStreamAnalyzer');

// ============================================================================
// PTY STREAM ANALYZER SERVICE
// ============================================================================

export class PTYStreamAnalyzerService extends EventEmitter {
  private metrics: Map<number, StreamMetrics> = new Map();
  private activeToolCalls: Map<string, ToolCall> = new Map();
  private inThinking: Set<number> = new Set();
  private outputBuffers: Map<number, string> = new Map();
  private readonly MAX_BUFFER_SIZE = 50 * 1024; // 50KB per terminal

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  // ============================================================================
  // STREAM ANALYSIS
  // ============================================================================

  /**
   * Analyze terminal output and emit events
   */
  analyze(terminalId: number, data: string, sessionId?: string): StreamEvent[] {
    const events: StreamEvent[] = [];
    const timestamp = Date.now();

    // Update output buffer
    this.appendToBuffer(terminalId, data);

    // Initialize or update metrics
    this.updateMetrics(terminalId, sessionId, data);

    // Strip ANSI escape codes for pattern matching
    // eslint-disable-next-line no-control-regex
    const cleanData = data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');

    // Run pattern matching
    for (const patternDef of STREAM_PATTERNS) {
      const testData = patternDef.eventType === 'agent_spawn' || patternDef.eventType === 'agent_complete' || patternDef.eventType === 'agent_activity'
        ? cleanData
        : data;

      const match = testData.match(patternDef.pattern);
      if (match) {
        const eventData = patternDef.extract ? patternDef.extract(match) : {};

        if (eventData.skip) {
          continue;
        }

        const event: StreamEvent = {
          type: patternDef.eventType,
          terminalId,
          timestamp,
          data: eventData,
        };

        events.push(event);
        this.processEvent(event, sessionId);
        this.emit('stream:event', event);
      }
    }

    // Emit raw output for subscribers that need it
    this.emit('stream:output', { terminalId, data, timestamp });

    return events;
  }

  /**
   * Process specific event types
   */
  private processEvent(event: StreamEvent, sessionId?: string): void {
    const metrics = this.metrics.get(event.terminalId);

    switch (event.type) {
      case 'tool_start': {
        const toolName = event.data.toolName as string;
        const callId = `${event.terminalId}-${toolName}-${event.timestamp}`;

        this.activeToolCalls.set(callId, {
          name: toolName,
          input: '',
          startTime: event.timestamp,
        });

        if (metrics) metrics.toolCalls++;
        this.emit('tool:start', { terminalId: event.terminalId, toolName, callId });
        break;
      }

      case 'tool_end': {
        const toolName = event.data.toolName as string;

        for (const [callId, call] of this.activeToolCalls) {
          if (call.name === toolName && !call.endTime) {
            call.endTime = event.timestamp;
            call.success = event.data.success as boolean;

            if (sessionId) {
              recordDetailedToolUsage({
                sessionId,
                toolName: call.name,
                toolInput: call.input,
                toolResultPreview: call.result?.slice(0, 500) || null,
                success: call.success ?? true,
                durationMs: call.endTime - call.startTime,
                tokenCost: null,
              });
            }

            this.emit('tool:end', {
              terminalId: event.terminalId,
              toolName,
              callId,
              success: call.success,
              durationMs: call.endTime - call.startTime,
            });

            this.activeToolCalls.delete(callId);
            break;
          }
        }
        break;
      }

      case 'thinking_start':
        this.inThinking.add(event.terminalId);
        if (metrics) metrics.thinkingBlocks++;
        this.emit('thinking:start', { terminalId: event.terminalId });
        break;

      case 'thinking_end':
        this.inThinking.delete(event.terminalId);
        this.emit('thinking:end', { terminalId: event.terminalId });
        break;

      case 'error':
        if (metrics) metrics.errors++;
        this.emit('error:detected', {
          terminalId: event.terminalId,
          message: event.data.message,
        });
        break;

      case 'warning':
        if (metrics) metrics.warnings++;
        this.emit('warning:detected', {
          terminalId: event.terminalId,
          message: event.data.message,
        });
        break;

      case 'prompt_ready':
        this.emit('prompt:ready', { terminalId: event.terminalId });
        break;

      case 'cost_update':
        this.emit('cost:update', {
          terminalId: event.terminalId,
          costUSD: event.data.costUSD,
        });
        break;

      case 'token_usage':
        if (metrics) {
          metrics.estimatedTokens = event.data.tokens as number;
        }
        this.emit('tokens:update', {
          terminalId: event.terminalId,
          tokens: event.data.tokens,
        });
        break;

      case 'agent_spawn': {
        if (event.data.skip) {
          logger.debug('Skipping agent spawn - matched tool name, not a real agent');
          break;
        }

        const agentName = event.data.agentName as string;

        if (!agentName || isToolName(agentName)) {
          logger.debug(`Skipping agent spawn - tool name detected: ${agentName}`);
          break;
        }

        const description = event.data.description as string | undefined;
        const isRealAgent = event.data.isRealAgent as boolean | undefined;

        logger.info(`Agent detected: ${agentName}`, {
          description,
          terminalId: event.terminalId,
          source: event.data.source,
          isRealAgent,
        });

        this.emit('agent:spawn', {
          terminalId: event.terminalId,
          agentName,
          description,
          timestamp: event.timestamp,
          isRealAgent: isRealAgent ?? false,
        });
        break;
      }

      case 'agent_complete': {
        if (event.data.skip) {
          logger.debug('Skipping agent complete - matched tool name');
          break;
        }

        const agentId = event.data.agentId as string | undefined;
        const agentName = event.data.agentName as string | undefined;

        if (agentName && isToolName(agentName)) {
          logger.debug(`Skipping agent complete - tool name: ${agentName}`);
          break;
        }

        const reason = event.data.reason as string | undefined;
        logger.info(`Agent completed: ${agentId || agentName}`, { reason });
        this.emit('agent:complete', {
          terminalId: event.terminalId,
          agentId: agentId || '',
          agentName,
          reason,
          timestamp: event.timestamp,
        });
        break;
      }

      case 'agent_activity': {
        const agentName = event.data.agentName as string;
        this.emit('agent:activity', {
          terminalId: event.terminalId,
          agentName,
          activity: event.data.activity,
          timestamp: event.timestamp,
        });
        break;
      }
    }
  }

  // ============================================================================
  // BUFFER MANAGEMENT
  // ============================================================================

  private appendToBuffer(terminalId: number, data: string): void {
    const buffer = (this.outputBuffers.get(terminalId) || '') + data;
    const trimmedBuffer = buffer.length > this.MAX_BUFFER_SIZE
      ? buffer.slice(-this.MAX_BUFFER_SIZE)
      : buffer;
    this.outputBuffers.set(terminalId, trimmedBuffer);
  }

  getBuffer(terminalId: number): string {
    return this.outputBuffers.get(terminalId) || '';
  }

  clearBuffer(terminalId: number): void {
    this.outputBuffers.delete(terminalId);
  }

  searchBuffer(terminalId: number, pattern: RegExp): RegExpMatchArray | null {
    const buffer = this.outputBuffers.get(terminalId);
    return buffer ? buffer.match(pattern) : null;
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  private updateMetrics(terminalId: number, sessionId?: string, data?: string): void {
    let metrics = this.metrics.get(terminalId);

    if (!metrics) {
      metrics = {
        terminalId,
        sessionId,
        toolCalls: 0,
        thinkingBlocks: 0,
        errors: 0,
        warnings: 0,
        outputBytes: 0,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        estimatedTokens: 0,
      };
      this.metrics.set(terminalId, metrics);
    }

    metrics.lastActivityTime = Date.now();
    if (data) {
      metrics.outputBytes += data.length;
    }
    if (sessionId) {
      metrics.sessionId = sessionId;
    }
  }

  getMetrics(terminalId: number): StreamMetrics | undefined {
    return this.metrics.get(terminalId);
  }

  getAllMetrics(): StreamMetrics[] {
    return Array.from(this.metrics.values());
  }

  clearMetrics(terminalId: number): void {
    this.metrics.delete(terminalId);
  }

  // ============================================================================
  // STATE QUERIES
  // ============================================================================

  isThinking(terminalId: number): boolean {
    return this.inThinking.has(terminalId);
  }

  getActiveToolCalls(terminalId: number): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const [callId, call] of this.activeToolCalls) {
      if (callId.startsWith(`${terminalId}-`)) {
        calls.push(call);
      }
    }
    return calls;
  }

  getAllActiveToolCalls(): Map<string, ToolCall> {
    return new Map(this.activeToolCalls);
  }

  hasActiveToolCalls(terminalId: number): boolean {
    for (const callId of this.activeToolCalls.keys()) {
      if (callId.startsWith(`${terminalId}-`)) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // CUSTOM PATTERNS
  // ============================================================================

  addCustomPattern(pattern: PatternDefinition): void {
    STREAM_PATTERNS.push(pattern);
    logger.debug(`Added custom pattern: ${pattern.name}`);
  }

  removeCustomPattern(name: string): boolean {
    const index = STREAM_PATTERNS.findIndex(p => p.name === name);
    if (index > -1) {
      STREAM_PATTERNS.splice(index, 1);
      logger.debug(`Removed custom pattern: ${name}`);
      return true;
    }
    return false;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  clearTerminal(terminalId: number): void {
    this.metrics.delete(terminalId);
    this.outputBuffers.delete(terminalId);
    this.inThinking.delete(terminalId);

    for (const callId of this.activeToolCalls.keys()) {
      if (callId.startsWith(`${terminalId}-`)) {
        this.activeToolCalls.delete(callId);
      }
    }
  }

  shutdown(): void {
    this.metrics.clear();
    this.activeToolCalls.clear();
    this.inThinking.clear();
    this.outputBuffers.clear();
    this.removeAllListeners();
    logger.info('PTY Stream Analyzer shut down');
  }
}
