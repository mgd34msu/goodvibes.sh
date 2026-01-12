// ============================================================================
// MEMORY VIEW - SHARED TYPES
// ============================================================================

export interface ClaudeMdFile {
  path: string;
  name: string;
  scope: 'user' | 'project' | 'local';
  content: string;
  exists: boolean;
  lastModified?: string;
}

export interface MemoryTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  variables: string[];
}

export const DEFAULT_TEMPLATES: MemoryTemplate[] = [
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Instructions for code review sessions',
    content: `# Code Review Agent

You are a code review specialist. Your role is to:
- Review code changes for bugs, security issues, and best practices
- Provide constructive feedback with specific suggestions
- Focus on code quality, maintainability, and performance
- Be thorough but respectful in your reviews

## Project Context
{{project_description}}

## Review Guidelines
- Always explain the "why" behind your suggestions
- Prioritize issues by severity (critical, major, minor)
- Include code examples when suggesting improvements
`,
    variables: ['project_description'],
  },
  {
    id: 'backend',
    name: 'Backend Developer',
    description: 'Instructions for backend development',
    content: `# Backend Developer

You are a backend development specialist. Your expertise includes:
- API design and implementation (REST, GraphQL)
- Database schema design and optimization
- Authentication and authorization
- Performance optimization
- Testing and debugging

## Tech Stack
{{tech_stack}}

## Coding Standards
- Follow existing project patterns
- Write comprehensive tests for new code
- Document all public APIs
- Handle errors gracefully
`,
    variables: ['tech_stack'],
  },
  {
    id: 'frontend',
    name: 'Frontend Developer',
    description: 'Instructions for frontend development',
    content: `# Frontend Developer

You are a frontend development specialist. Your expertise includes:
- Component architecture and state management
- CSS and responsive design
- Accessibility (WCAG compliance)
- Performance optimization
- User experience

## Framework
{{framework}}

## Guidelines
- Use semantic HTML
- Follow component composition patterns
- Implement proper error boundaries
- Optimize for performance
`,
    variables: ['framework'],
  },
];
