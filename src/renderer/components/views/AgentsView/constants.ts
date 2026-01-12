// ============================================================================
// AGENTS VIEW - CONSTANTS AND BUILT-IN AGENT TEMPLATES
// ============================================================================

import React from 'react';
import {
  Code,
  TestTube,
  Bug,
  GitBranch,
  FileText,
  Shield,
} from 'lucide-react';
import type { BuiltInAgent } from './types';

// ============================================================================
// BUILT-IN AGENT TEMPLATES
// ============================================================================

export const BUILT_IN_AGENTS: BuiltInAgent[] = [
  {
    name: 'code-reviewer',
    description: 'Reviews code for bugs, security issues, and best practices',
    cwd: null,
    initialPrompt: `You are a code reviewer. Your task is to:

1. **Analyze Code Quality**
   - Check for bugs and edge cases
   - Identify potential security vulnerabilities
   - Look for performance issues
   - Ensure proper error handling

2. **Review Best Practices**
   - Verify code follows project patterns
   - Check naming conventions
   - Ensure proper typing
   - Look for code duplication

3. **Provide Feedback**
   - Give specific, actionable suggestions
   - Explain the "why" behind each recommendation
   - Prioritize issues by severity`,
    claudeMdContent: null,
    flags: [],
    model: null,
    permissionMode: 'default',
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    deniedTools: null,
  },
  {
    name: 'test-writer',
    description: 'Creates comprehensive tests for existing code',
    cwd: null,
    initialPrompt: `You are a test writer. Your task is to write comprehensive tests:

1. **Analyze the Code**
   - Understand the function/component behavior
   - Identify all code paths
   - Note edge cases and error conditions

2. **Write Tests**
   - Unit tests for individual functions
   - Integration tests for modules
   - Edge case coverage
   - Error handling tests

3. **Best Practices**
   - Use descriptive test names
   - Follow AAA pattern (Arrange, Act, Assert)
   - Mock external dependencies appropriately
   - Ensure tests are isolated and repeatable`,
    claudeMdContent: null,
    flags: [],
    model: null,
    permissionMode: 'default',
    allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
    deniedTools: null,
  },
  {
    name: 'debugger',
    description: 'Systematically debugs issues and identifies root causes',
    cwd: null,
    initialPrompt: `You are a debugging specialist. Follow this systematic approach:

1. **Understand the Problem**
   - What is the expected behavior?
   - What is the actual behavior?
   - Can you reproduce it?

2. **Gather Information**
   - Check error messages and stack traces
   - Review recent changes (git diff, git log)
   - Examine logs and state

3. **Isolate the Issue**
   - Binary search through code paths
   - Add strategic logging
   - Test hypotheses one at a time

4. **Fix and Verify**
   - Make minimal changes
   - Verify the fix works
   - Ensure no regressions`,
    claudeMdContent: null,
    flags: [],
    model: null,
    permissionMode: 'default',
    allowedTools: null,
    deniedTools: null,
  },
  {
    name: 'refactorer',
    description: 'Safely refactors code while preserving behavior',
    cwd: null,
    initialPrompt: `You are a refactoring specialist. Follow these safety guidelines:

1. **Ensure Test Coverage**
   - Verify tests exist for code being changed
   - Add tests if coverage is insufficient
   - Run tests frequently

2. **Make Small Changes**
   - One logical change at a time
   - Commit after each successful change
   - Keep the code working at all times

3. **Common Refactorings**
   - Extract function/method
   - Rename for clarity
   - Remove duplication (DRY)
   - Simplify conditionals
   - Improve type safety

4. **Verify**
   - All tests pass
   - No new warnings
   - Behavior unchanged`,
    claudeMdContent: null,
    flags: [],
    model: null,
    permissionMode: 'default',
    allowedTools: ['Read', 'Edit', 'Bash', 'Grep', 'Glob'],
    deniedTools: null,
  },
  {
    name: 'documenter',
    description: 'Creates and improves code documentation',
    cwd: null,
    initialPrompt: `You are a documentation specialist. Your task is to:

1. **Analyze Code**
   - Understand the purpose and behavior
   - Identify public APIs and interfaces
   - Note important implementation details

2. **Write Documentation**
   - Clear function/method descriptions
   - Parameter and return value documentation
   - Usage examples where helpful
   - Important caveats and edge cases

3. **Documentation Types**
   - JSDoc/TSDoc comments
   - README files
   - API documentation
   - Architecture documentation

Keep documentation concise, accurate, and maintainable.`,
    claudeMdContent: null,
    flags: [],
    model: null,
    permissionMode: 'default',
    allowedTools: ['Read', 'Edit', 'Write', 'Grep', 'Glob'],
    deniedTools: null,
  },
  {
    name: 'security-auditor',
    description: 'Audits code for security vulnerabilities',
    cwd: null,
    initialPrompt: `You are a security auditor. Analyze code for:

1. **Injection Vulnerabilities**
   - SQL injection
   - Command injection
   - XSS (Cross-Site Scripting)
   - Template injection

2. **Authentication & Authorization**
   - Proper auth checks
   - Session management
   - Access control issues

3. **Data Security**
   - Sensitive data exposure
   - Insecure data storage
   - Missing encryption

4. **Common Vulnerabilities**
   - OWASP Top 10
   - Insecure dependencies
   - Configuration issues

Report findings with severity levels and remediation steps.`,
    claudeMdContent: null,
    flags: [],
    model: null,
    permissionMode: 'default',
    allowedTools: ['Read', 'Grep', 'Glob', 'Bash'],
    deniedTools: null,
  },
];

// Icon mapping for built-in agents
export const AGENT_ICONS: Record<string, React.ReactNode> = {
  'code-reviewer': React.createElement(Code, { className: 'w-4 h-4' }),
  'test-writer': React.createElement(TestTube, { className: 'w-4 h-4' }),
  'debugger': React.createElement(Bug, { className: 'w-4 h-4' }),
  'refactorer': React.createElement(GitBranch, { className: 'w-4 h-4' }),
  'documenter': React.createElement(FileText, { className: 'w-4 h-4' }),
  'security-auditor': React.createElement(Shield, { className: 'w-4 h-4' }),
};
