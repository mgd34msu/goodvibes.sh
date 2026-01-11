// ============================================================================
// CONTENT PRETTIFICATION UTILITIES
// Transforms raw content into beautifully formatted React components
// ============================================================================

import React, { useState, useRef } from 'react';
import { CopyButton } from '../common/CopyButton';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
// Import highlight.js core and only the languages we need to reduce bundle size
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import go from 'highlight.js/lib/languages/go';
import bash from 'highlight.js/lib/languages/bash';
import html from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import { clsx } from 'clsx';

// Register languages
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('go', go);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('html', html);
hljs.registerLanguage('xml', html);
hljs.registerLanguage('css', css);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);

// ============================================================================
// JSON PRETTIFICATION
// ============================================================================

/**
 * Detect if a string is valid JSON and prettify it with syntax highlighting
 * Used for assistant/thinking blocks where JSON should be displayed as JSON
 */
export function prettifyJSON(content: string): React.ReactNode {
  // Try to parse as JSON
  try {
    const trimmed = content.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const parsed = JSON.parse(trimmed);
      const formatted = JSON.stringify(parsed, null, 2);
      return <SyntaxHighlightedCode code={formatted} language="json" />;
    }
  } catch {
    // Not valid JSON, return as-is
  }
  return null;
}

/**
 * Detect if a string is valid JSON and return the parsed object
 * Returns null if not valid JSON
 */
function parseJSONSafe(content: string): unknown | null {
  try {
    const trimmed = content.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return JSON.parse(trimmed);
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

/**
 * Detect if content is a Claude content block array (array of {type: "text", text: "..."} objects)
 * Returns the concatenated text if it is, null otherwise
 */
function extractClaudeContentBlocks(content: string): string | null {
  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every((block: unknown) =>
            typeof block === 'object' &&
            block !== null &&
            'type' in block &&
            (block as { type: string }).type === 'text' &&
            'text' in block &&
            typeof (block as { text: unknown }).text === 'string'
          )) {
        // Concatenate all text blocks
        return parsed.map((block: { text: string }) => block.text).join('\n\n');
      }
    }
  } catch {
    // Not valid JSON or not the expected format
  }
  return null;
}

// ============================================================================
// PRETTIFIED OBJECT COMPONENT
// Renders objects/arrays as formatted key-value pairs instead of JSON
// ============================================================================

interface PrettifiedObjectProps {
  data: unknown;
  indent?: number;
}

/**
 * Recursively render an object as key-value pairs
 * - Strings: just the value
 * - Numbers/booleans: styled value
 * - Arrays: bulleted list or inline for simple arrays
 * - Objects: nested with indent
 */
export function PrettifiedObject({ data, indent = 0 }: PrettifiedObjectProps): React.ReactElement {
  const indentPx = indent * 16;

  // Handle null/undefined
  if (data === null || data === undefined) {
    return (
      <span className="text-surface-500 text-sm italic">
        {data === null ? 'null' : 'undefined'}
      </span>
    );
  }

  // Handle primitives
  if (typeof data === 'string') {
    // Check if it's a long multi-line string
    if (data.includes('\n') && data.length > 100) {
      return (
        <pre className="text-surface-300 text-sm font-mono whitespace-pre-wrap bg-surface-800/30 rounded px-2 py-1 mt-1">
          {data}
        </pre>
      );
    }
    return <span className="text-surface-300 text-sm">{data}</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-info-400 text-sm">{data}</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-amber-400 text-sm">{data ? 'true' : 'false'}</span>;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    // Empty array
    if (data.length === 0) {
      return <span className="text-surface-500 text-sm italic">[]</span>;
    }

    // Simple array of primitives - show inline
    const allPrimitives = data.every(
      item => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
    );

    if (allPrimitives && data.length <= 5) {
      return (
        <span className="text-surface-300 text-sm">
          {data.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-surface-500">, </span>}
              <PrettifiedObject data={item} indent={indent} />
            </React.Fragment>
          ))}
        </span>
      );
    }

    // Complex array - show as list
    return (
      <div style={{ marginLeft: indentPx > 0 ? 8 : 0 }}>
        {data.map((item, i) => (
          <div key={i} className="flex items-start gap-2 py-0.5">
            <span className="text-surface-500 select-none">-</span>
            <div className="flex-1">
              <PrettifiedObject data={item} indent={indent + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Handle objects
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);

    // Empty object
    if (entries.length === 0) {
      return <span className="text-surface-500 text-sm italic">{'{}'}</span>;
    }

    return (
      <div style={{ marginLeft: indentPx > 0 ? 8 : 0 }}>
        {entries.map(([key, value]) => {
          const isComplexValue =
            typeof value === 'object' &&
            value !== null &&
            (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0);

          return (
            <div key={key} className="py-0.5">
              {/* Use items-baseline for proper vertical alignment of key-value pairs */}
              <div className="flex items-baseline gap-2">
                <span className="text-surface-400 font-mono text-sm shrink-0">{key}:</span>
                {!isComplexValue && (
                  <div className="flex-1">
                    <PrettifiedObject data={value} indent={indent + 1} />
                  </div>
                )}
              </div>
              {isComplexValue && (
                <div className="mt-0.5">
                  <PrettifiedObject data={value} indent={indent + 1} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback for unknown types
  return <span className="text-surface-300 text-sm">{String(data)}</span>;
}

// ============================================================================
// TOOL USE PRETTIFICATION
// ============================================================================

/**
 * Format tool use with prominent tool name and pretty-printed input as key-value pairs
 * NOT as JSON code blocks - those are reserved for assistant/thinking content
 */
export function prettifyToolUse(
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined,
  toolId?: string
): React.ReactNode {
  const inputJson = toolInput ? JSON.stringify(toolInput, null, 2) : '';

  return (
    <div className="space-y-3 relative">
      {/* Copy button for full tool input */}
      {inputJson && (
        <CopyButton
          content={inputJson}
          label="Copy as JSON"
          position="top-right"
          iconOnly
        />
      )}

      {/* Tool Name Header */}
      <div className="flex items-center gap-3">
        <span className="text-warning-400 font-semibold text-base">
          {toolName || 'Unknown Tool'}
        </span>
        {toolId && (
          <span className="text-surface-500 text-xs font-mono bg-surface-800 px-2 py-0.5 rounded">
            {toolId}
          </span>
        )}
      </div>

      {/* Input Parameters - rendered as key-value pairs, not JSON */}
      {toolInput && Object.keys(toolInput).length > 0 && (
        <div className="space-y-2">
          <div className="border-t border-surface-700/50 pt-2">
            <PrettifiedObject data={toolInput} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TOOL RESULT PRETTIFICATION
// ============================================================================

/**
 * Tool Result Component - renders tool results with truncation and syntax highlighting
 * This is a proper React component since it needs state for truncation
 */
export function ToolResultPrettified({
  content,
  isError,
  toolName
}: {
  content: string;
  isError?: boolean;
  toolName?: string;
}): React.ReactElement {
  const MAX_LINES = 50;
  const lines = content.split('\n');
  const needsTruncation = lines.length > MAX_LINES;
  const [showFull, setShowFull] = useState(false);

  const displayContent = showFull ? content : lines.slice(0, MAX_LINES).join('\n');
  const isTruncated = needsTruncation && !showFull;

  // Detect language for copy label
  const language = detectLanguage(content, toolName);
  const copyLabel = getCopyLabel(content, language);

  // If error, show in red styling
  if (isError) {
    return (
      <div className="space-y-2 relative">
        <CopyButton
          content={content}
          label={copyLabel}
          position="top-right"
          iconOnly
        />
        <div className="flex items-center gap-2">
          <span className="text-error-400 text-xs font-semibold uppercase tracking-wide">Error</span>
        </div>
        <pre className="text-error-300 text-sm font-mono whitespace-pre-wrap bg-error-500/10 border border-error-500/30 rounded-lg p-3">
          {displayContent}
        </pre>
        {isTruncated && (
          <TruncationButton onClick={() => setShowFull(true)} remaining={lines.length - MAX_LINES} />
        )}
      </div>
    );
  }

  // Check if content is XML-like tag-based content (e.g., <status>running</status>)
  // This should be rendered as key-value pairs
  const { parsed: xmlTagData, hasXMLTags } = parseXMLTagContent(displayContent);
  if (hasXMLTags) {
    return (
      <div className="space-y-2 relative">
        <CopyButton
          content={content}
          label="Copy"
          position="top-right"
          iconOnly
        />
        <div className="bg-surface-800/30 border border-surface-700/50 rounded-lg p-3">
          <XMLTagsPrettified data={xmlTagData} />
        </div>
        {isTruncated && (
          <TruncationButton onClick={() => setShowFull(true)} remaining={lines.length - MAX_LINES} />
        )}
      </div>
    );
  }

  // Check if content is Claude content block array (array of {type: "text", text: "..."})
  // This should be rendered as markdown, not as JSON
  const extractedMarkdown = extractClaudeContentBlocks(displayContent);
  if (extractedMarkdown !== null) {
    return (
      <div className="space-y-2 relative">
        <CopyButton
          content={extractedMarkdown}
          label="Copy"
          position="top-right"
          iconOnly
        />
        <div className="text-surface-200">
          <ToolResultMarkdownRenderer content={extractedMarkdown} />
        </div>
        {isTruncated && (
          <TruncationButton onClick={() => setShowFull(true)} remaining={lines.length - MAX_LINES} />
        )}
      </div>
    );
  }

  // If it looks like code (but NOT JSON), syntax highlight it
  // JSON tool results should be shown as key-value pairs, not code blocks
  if (language && language !== 'json') {
    // If it's markdown, render it as markdown instead of code
    if (language === 'markdown') {
      return (
        <div className="space-y-2 relative">
          <CopyButton
            content={content}
            label="Copy"
            position="top-right"
            iconOnly
          />
          <div className="text-surface-200">
            <ToolResultMarkdownRenderer content={displayContent} />
          </div>
          {isTruncated && (
            <TruncationButton onClick={() => setShowFull(true)} remaining={lines.length - MAX_LINES} />
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <SyntaxHighlightedCode code={displayContent} language={language} copyLabel={copyLabel} />
        {isTruncated && (
          <TruncationButton onClick={() => setShowFull(true)} remaining={lines.length - MAX_LINES} />
        )}
      </div>
    );
  }

  // Check if content is JSON - show as formatted key-value pairs, not JSON code block
  const parsedJson = parseJSONSafe(displayContent);
  if (parsedJson !== null) {
    return (
      <div className="space-y-2 relative">
        <CopyButton
          content={content}
          label="Copy as JSON"
          position="top-right"
          iconOnly
        />
        <div className="bg-surface-800/30 border border-surface-700/50 rounded-lg p-3">
          <PrettifiedObject data={parsedJson} />
        </div>
        {isTruncated && (
          <TruncationButton onClick={() => setShowFull(true)} remaining={lines.length - MAX_LINES} />
        )}
      </div>
    );
  }

  // Default: formatted monospace text with copy button
  return (
    <div className="space-y-2 relative">
      <CopyButton
        content={content}
        label="Copy"
        position="top-right"
        iconOnly
      />
      <pre className="text-surface-300 text-sm font-mono whitespace-pre-wrap bg-surface-800/50 border border-surface-700 rounded-lg p-3 overflow-x-auto">
        {displayContent}
      </pre>
      {isTruncated && (
        <TruncationButton onClick={() => setShowFull(true)} remaining={lines.length - MAX_LINES} />
      )}
    </div>
  );
}

function TruncationButton({ onClick, remaining }: { onClick: () => void; remaining: number }) {
  return (
    <button
      onClick={onClick}
      className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
      Show {remaining} more lines
    </button>
  );
}

// ============================================================================
// MARKDOWN RENDERER FOR TOOL RESULTS
// ============================================================================

/**
 * Markdown renderer specifically for tool results
 * Renders markdown content with proper styling
 */
function ToolResultMarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        code: ({ inline, className, children, ...props }: any) => {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : '';

          if (inline) {
            return (
              <code
                className="px-1.5 py-0.5 bg-surface-700 rounded text-sm font-mono text-primary-300"
                {...props}
              >
                {children}
              </code>
            );
          }

          // For code blocks, wrap in a styled container
          return (
            <ToolResultCodeBlockWrapper language={language || ''}>
              <code className={clsx('hljs', className)} {...props}>
                {children}
              </code>
            </ToolResultCodeBlockWrapper>
          );
        },
        pre: ({ children }) => <>{children}</>,
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-surface-200">{children}</li>,
        h1: ({ children }) => <h1 className="text-xl font-bold mb-2 text-surface-100">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mb-2 text-surface-100">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-bold mb-2 text-surface-100">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-surface-600 pl-4 my-2 text-surface-300 italic">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-400 hover:text-primary-300 underline"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full border-collapse border border-surface-600">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-surface-600 px-3 py-2 bg-surface-700 text-left text-surface-200">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-surface-600 px-3 py-2 text-surface-300">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * Code block wrapper for markdown code blocks in tool results
 */
function ToolResultCodeBlockWrapper({ language, children }: { language: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  const handleCopy = async () => {
    if (codeRef.current) {
      const text = codeRef.current.textContent || '';
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative group rounded-lg overflow-hidden bg-surface-950 border border-surface-700 my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-800 border-b border-surface-700">
        <span className="text-xs text-surface-400 font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-surface-400 hover:text-surface-200 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre ref={codeRef} className="p-3 overflow-x-auto text-sm">
        {children}
      </pre>
    </div>
  );
}

// ============================================================================
// THINKING BLOCK PRETTIFICATION
// ============================================================================

/**
 * Parse and render thinking blocks with XML-like tags styled nicely
 */
export function prettifyThinking(content: string): React.ReactNode {
  // Parse XML-like tags and render them with subtle styling
  const parts = parseXmlLikeTags(content);

  return (
    <div className="space-y-2 text-sm relative">
      <CopyButton
        content={content}
        label="Copy"
        position="top-right"
        iconOnly
      />
      {parts.map((part, index) => {
        if (part.type === 'tag') {
          return (
            <div key={index} className="relative pl-3 border-l-2 border-accent-500/30">
              <span className="absolute -left-0.5 top-0 text-accent-400/60 text-xs font-mono">
                {part.tagName}
              </span>
              <div className="pt-4 text-surface-300 whitespace-pre-wrap">
                {part.content}
              </div>
            </div>
          );
        }
        return (
          <div key={index} className="text-surface-300 whitespace-pre-wrap">
            {part.content}
          </div>
        );
      })}
    </div>
  );
}

interface ParsedPart {
  type: 'text' | 'tag';
  content: string;
  tagName?: string;
}

function parseXmlLikeTags(content: string): ParsedPart[] {
  const parts: ParsedPart[] = [];

  // Match XML-like tags: <tagname>content</tagname>
  const tagRegex = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    // Add text before the tag
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index).trim();
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    // Add the tag content
    parts.push({
      type: 'tag',
      tagName: match[1] || '',
      content: (match[2] || '').trim(),
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
      parts.push({ type: 'text', content: remaining });
    }
  }

  // If no tags found, return the whole content as text
  if (parts.length === 0) {
    parts.push({ type: 'text', content: content });
  }

  return parts;
}

// ============================================================================
// CODE DETECTION & HIGHLIGHTING
// ============================================================================

/**
 * Detect programming language from content and optional hints
 */
function detectLanguage(content: string, hint?: string): string | null {
  // Check hint first (e.g., tool name like "Read" often returns file content)
  if (hint) {
    const hintLower = hint.toLowerCase();
    if (hintLower.includes('read') || hintLower.includes('write')) {
      // Try to detect from content
      return detectLanguageFromContent(content);
    }
  }

  return detectLanguageFromContent(content);
}

function detectLanguageFromContent(content: string): string | null {
  const trimmed = content.trim();

  // File path hints in first line (e.g., "1 -> export function...")
  const firstLine = trimmed.split('\n')[0];

  // Check for common file content patterns

  // TypeScript/JavaScript
  if (/^(import|export|const|let|var|function|class|interface|type)\s/.test(trimmed) ||
      /^['"]use (strict|client)['"];?/.test(trimmed)) {
    return 'typescript';
  }

  // Python
  if (/^(import|from|def|class|if __name__)\s/.test(trimmed) ||
      /^#!.*python/.test(trimmed)) {
    return 'python';
  }

  // Rust
  if (/^(use|fn|struct|impl|pub|mod|enum)\s/.test(trimmed) ||
      trimmed.includes('fn main()')) {
    return 'rust';
  }

  // Go
  if (/^package\s+\w+/.test(trimmed) || /^func\s+/.test(trimmed)) {
    return 'go';
  }

  // Shell/Bash
  if (/^#!\/bin\/(bash|sh|zsh)/.test(trimmed) ||
      /^\$\s/.test(firstLine || '')) {
    return 'bash';
  }

  // HTML
  if (/^<!DOCTYPE|^<html|^<div|^<span|^<p\s/.test(trimmed)) {
    return 'html';
  }

  // CSS
  if (/^[.#@][\w-]+\s*{/.test(trimmed) || /^:root\s*{/.test(trimmed)) {
    return 'css';
  }

  // SQL
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(trimmed)) {
    return 'sql';
  }

  // YAML
  if (/^[\w-]+:\s/.test(trimmed) && !trimmed.includes('{')) {
    return 'yaml';
  }

  // JSON (already handled elsewhere, but as fallback)
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  // XML
  if (/^<\?xml/.test(trimmed) || /^<[\w-]+\s*xmlns/.test(trimmed)) {
    return 'xml';
  }

  // Markdown (common patterns)
  if (/^#{1,6}\s/.test(trimmed) || /^\*\*.*\*\*/.test(trimmed)) {
    return 'markdown';
  }

  return null;
}

// ============================================================================
// SYNTAX HIGHLIGHTED CODE COMPONENT
// ============================================================================

interface SyntaxHighlightedCodeProps {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  /** Custom copy label like "Copy as JSON" or "Copy as TypeScript" */
  copyLabel?: string;
}

export function SyntaxHighlightedCode({
  code,
  language,
  showLineNumbers = false,
  copyLabel
}: SyntaxHighlightedCodeProps) {
  const [copied, setCopied] = useState(false);

  // Highlight the code
  let highlighted: string;
  try {
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(code, { language }).value;
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }
  } catch {
    highlighted = escapeHtml(code);
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine the display label - use custom label or generate from language
  const displayLabel = copyLabel || getLanguageDisplayLabel(language);

  const lines = highlighted.split('\n');

  return (
    <div className="relative group rounded-lg overflow-hidden bg-surface-950 border border-surface-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-800 border-b border-surface-700">
        <span className="text-xs text-surface-400 font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-surface-400 hover:text-surface-200 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {displayLabel}
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <div className="overflow-x-auto">
        <pre className="p-3">
          {showLineNumbers ? (
            <code className="text-sm font-mono">
              {lines.map((line, i) => (
                <div key={i} className="flex">
                  <span className="select-none text-surface-500 text-right pr-4 min-w-[3rem]">
                    {i + 1}
                  </span>
                  <span
                    className="flex-1"
                    dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }}
                  />
                </div>
              ))}
            </code>
          ) : (
            <code
              className="text-sm font-mono text-surface-200 hljs"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          )}
        </pre>
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// SUMMARY PRETTIFICATION
// ============================================================================

/**
 * Format summary content as nicely styled text/markdown
 */
export function prettifySummary(content: string): React.ReactNode {
  return (
    <div className="text-surface-300 text-sm leading-relaxed prose prose-invert prose-sm max-w-none relative">
      <CopyButton
        content={content}
        label="Copy"
        position="top-right"
        iconOnly
      />
      {content}
    </div>
  );
}

// ============================================================================
// SYSTEM MESSAGE PRETTIFICATION
// ============================================================================

/**
 * Format system messages with appropriate styling
 */
export function prettifySystem(content: string): React.ReactNode {
  return (
    <div className="text-surface-300 text-sm leading-relaxed relative">
      <CopyButton
        content={content}
        label="Copy"
        position="top-right"
        iconOnly
      />
      {content}
    </div>
  );
}

// ============================================================================
// COLLAPSIBLE CODE BLOCK - For tool results with "Show more"
// ============================================================================

interface CollapsibleContentProps {
  content: string;
  maxLines?: number;
  isError?: boolean;
  language?: string | null;
}

export function CollapsibleContent({
  content,
  maxLines = 50,
  isError = false,
  language
}: CollapsibleContentProps) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split('\n');
  const needsTruncation = lines.length > maxLines;

  const displayContent = expanded
    ? content
    : lines.slice(0, maxLines).join('\n');

  const contentClass = clsx(
    'text-sm font-mono whitespace-pre-wrap overflow-x-auto rounded-lg p-3',
    isError
      ? 'text-error-300 bg-error-500/10 border border-error-500/30'
      : 'text-surface-300 bg-surface-800/50 border border-surface-700'
  );

  // If we have a language hint, use syntax highlighting
  if (language && !isError) {
    return (
      <div className="space-y-2">
        <SyntaxHighlightedCode code={displayContent} language={language} />
        {needsTruncation && !expanded && (
          <TruncationButton
            onClick={() => setExpanded(true)}
            remaining={lines.length - maxLines}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <pre className={contentClass}>
        {displayContent}
      </pre>
      {needsTruncation && !expanded && (
        <TruncationButton
          onClick={() => setExpanded(true)}
          remaining={lines.length - maxLines}
        />
      )}
    </div>
  );
}

// ============================================================================
// COPY LABEL HELPERS
// ============================================================================

/**
 * Get a human-readable display label for the language
 */
function getLanguageDisplayLabel(language: string | null): string {
  if (!language) return 'Copy';

  const languageLabels: Record<string, string> = {
    javascript: 'Copy as JavaScript',
    typescript: 'Copy as TypeScript',
    python: 'Copy as Python',
    rust: 'Copy as Rust',
    go: 'Copy as Go',
    bash: 'Copy as Bash',
    html: 'Copy as HTML',
    xml: 'Copy as XML',
    css: 'Copy as CSS',
    sql: 'Copy as SQL',
    json: 'Copy as JSON',
    yaml: 'Copy as YAML',
    markdown: 'Copy as Markdown',
  };

  return languageLabels[language] || 'Copy';
}

/**
 * Get the appropriate copy label based on content and detected language
 */
function getCopyLabel(content: string, detectedLanguage: string | null): string {
  // If we have a detected language, use it
  if (detectedLanguage) {
    return getLanguageDisplayLabel(detectedLanguage);
  }

  // Check if content is JSON
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'Copy as JSON';
    } catch {
      // Not valid JSON
    }
  }

  return 'Copy';
}

// ============================================================================
// XML TAG CONTENT PARSING
// Parses XML-like tag-based output into key-value pairs
// ============================================================================

/**
 * Strip ANSI escape codes from a string
 */
function stripAnsiCodes(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Parse XML-like tag content into key-value pairs
 * Matches patterns like: <tag_name>content</tag_name>
 *
 * @returns Object with parsed key-value pairs and a flag indicating if any tags were found
 */
function parseXMLTagContent(content: string): { parsed: Record<string, string>; hasXMLTags: boolean } {
  // Match tags like <word-word> or <word_word> with closing tag
  const tagPattern = /<([\w][\w-]*)>([\s\S]*?)<\/\1>/g;
  const result: Record<string, string> = {};
  let match;
  let foundAny = false;

  while ((match = tagPattern.exec(content)) !== null) {
    foundAny = true;
    const [, matchedTagName, tagContent] = match;
    if (matchedTagName && tagContent !== undefined) {
      result[matchedTagName] = tagContent.trim();
    }
  }

  // Only return hasXMLTags: true if we found multiple tags or the content
  // looks like it's primarily XML-tag based (not just one accidental tag in prose)
  const tagCount = Object.keys(result).length;
  const isXMLTagContent = tagCount >= 2 ||
    (tagCount === 1 && content.trim().startsWith('<'));

  return { parsed: result, hasXMLTags: isXMLTagContent && foundAny };
}

/**
 * Component to render a single XML tag value
 * Handles multi-line content, ANSI codes, and special formatting
 */
function XMLTagValue({ value }: { value: string; tagName: string }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const MAX_LINES = 10;

  // Strip ANSI codes for display
  const cleanValue = stripAnsiCodes(value);
  const lines = cleanValue.split('\n');
  const isMultiLine = lines.length > 1;
  const needsTruncation = lines.length > MAX_LINES;

  // Empty value
  if (!cleanValue || cleanValue.length === 0) {
    return <span className="text-surface-500 text-sm italic">(empty)</span>;
  }

  // Single line value
  if (!isMultiLine) {
    return <span className="text-surface-300 text-sm">{cleanValue}</span>;
  }

  // Multi-line value - render as code block
  const displayContent = expanded ? cleanValue : lines.slice(0, MAX_LINES).join('\n');

  return (
    <div className="mt-1 space-y-1">
      <pre className="text-surface-300 text-sm font-mono whitespace-pre-wrap bg-surface-800/50 border border-surface-700 rounded-lg p-2 overflow-x-auto max-h-[300px] overflow-y-auto">
        {displayContent}
      </pre>
      {needsTruncation && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          Show {lines.length - MAX_LINES} more lines
        </button>
      )}
    </div>
  );
}

/**
 * Component to render parsed XML tags as prettified key-value pairs
 */
function XMLTagsPrettified({ data }: { data: Record<string, string> }): React.ReactElement {
  const entries = Object.entries(data);

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => {
        const cleanValue = stripAnsiCodes(value);
        const isMultiLine = cleanValue.includes('\n');

        return (
          <div key={key} className="py-0.5">
            <div className={clsx(
              "flex gap-2",
              isMultiLine ? "flex-col" : "items-baseline"
            )}>
              <span className="text-surface-400 font-mono text-sm shrink-0">{key}:</span>
              {!isMultiLine && (
                <div className="flex-1">
                  <XMLTagValue value={value} tagName={key} />
                </div>
              )}
            </div>
            {isMultiLine && (
              <XMLTagValue value={value} tagName={key} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Export helpers for use in other components
export { getCopyLabel, getLanguageDisplayLabel, detectLanguageFromContent, parseXMLTagContent, XMLTagsPrettified };
