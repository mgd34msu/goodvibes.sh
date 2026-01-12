// ============================================================================
// SKILLS VIEW - CONSTANTS AND BUILT-IN SKILLS
// ============================================================================

import type { BuiltInSkill } from './types';

export const BUILT_IN_SKILLS: BuiltInSkill[] = [
  {
    name: 'commit',
    description: 'Create a git commit with proper message formatting',
    content: `You are creating a git commit. Follow these steps:

1. Review all staged changes using git diff --staged
2. Analyze the nature of changes (bug fix, feature, refactor, etc.)
3. Write a commit message following conventional commits:
   - Use present tense ("Add feature" not "Added feature")
   - First line: type(scope): description (max 72 chars)
   - Body: explain what and why, not how
4. Execute the commit

Types: feat, fix, docs, style, refactor, test, chore`,
    allowedTools: ['Bash', 'Read', 'Edit'],
    scope: 'user',
    projectPath: null,
  },
  {
    name: 'review-pr',
    description: 'Perform a comprehensive PR review',
    content: `You are reviewing a pull request. Your review should cover:

## Code Quality
- Check for bugs, edge cases, error handling
- Verify code follows project patterns
- Look for potential performance issues

## Security
- Check for vulnerabilities (injection, auth bypass, etc.)
- Verify sensitive data handling

## Testing
- Are new features tested?
- Are edge cases covered?

## Documentation
- Are new functions documented?
- Is README updated if needed?

Provide constructive feedback with specific suggestions.`,
    allowedTools: ['Bash', 'Read', 'Grep', 'Glob'],
    scope: 'user',
    projectPath: null,
  },
  {
    name: 'debug',
    description: 'Systematic debugging workflow',
    content: `You are debugging an issue. Follow this systematic approach:

1. **Understand the Problem**
   - What is the expected behavior?
   - What is the actual behavior?
   - Can you reproduce it consistently?

2. **Gather Information**
   - Check error messages and stack traces
   - Review recent changes
   - Check logs and monitoring

3. **Form Hypothesis**
   - Based on evidence, what could cause this?
   - List possible causes in order of likelihood

4. **Test & Verify**
   - Add logging if needed
   - Test each hypothesis
   - Verify the fix doesn't break other things

5. **Document**
   - Record the root cause
   - Document the fix
   - Consider if similar bugs could exist elsewhere`,
    allowedTools: null,
    scope: 'user',
    projectPath: null,
  },
  {
    name: 'refactor',
    description: 'Safe code refactoring workflow',
    content: `You are refactoring code. Follow these safety guidelines:

1. **Ensure Test Coverage**
   - Verify tests exist for code being changed
   - Add tests if coverage is insufficient

2. **Make Small Changes**
   - One logical change at a time
   - Commit frequently

3. **Preserve Behavior**
   - Refactoring should not change functionality
   - Run tests after each change

4. **Common Refactorings**
   - Extract function/method
   - Rename for clarity
   - Remove duplication
   - Simplify conditionals
   - Improve type safety

5. **Verify**
   - All tests pass
   - No new warnings
   - Code review ready`,
    allowedTools: ['Read', 'Edit', 'Bash'],
    scope: 'user',
    projectPath: null,
  },
];
