// ============================================================================
// PROJECT REGISTRY SERVICE - Multi-project management
// ============================================================================
//
// This service manages project lifecycle, agent configurations,
// context preservation, templates, and analytics aggregation.
//
// ============================================================================

import path from 'path';
import { EventEmitter } from 'events';
import { Logger } from './logger.js';
import {
  createProjectRegistryTables,
  registerProject,
  getRegisteredProject,
  getRegisteredProjectByPath,
  getAllRegisteredProjects,
  updateRegisteredProject,
  touchProject,
  unregisterProject,
  searchProjects,
  assignAgentToProject,
  getProjectAgents,
  updateProjectAgent,
  removeAgentFromProject,
  createProjectTemplate,
  getProjectTemplate,
  getProjectTemplateByName,
  getAllProjectTemplates,
  updateProjectTemplate,
  deleteProjectTemplate,
  applyTemplateToProject,
  createTemplateFromProject,
  recordCrossProjectSession,
  getCrossProjectSessionBySessionId,
  getProjectSessions,
  getActiveCrossProjectSessions,
  updateCrossProjectSession,
  incrementSessionMetrics,
  getProjectAnalytics,
  getGlobalAnalytics,
  getAgentUsageByProject,
  getSessionDistribution,
  compareProjects,
  cleanupOldSessions,
  type RegisteredProject,
  type ProjectSettings,
  type ProjectAgent,
  type ProjectAgentSettings,
  type ProjectTemplate,
  type TemplateAgent,
  type CrossProjectSession,
  type ProjectAnalytics,
  type GlobalAnalytics,
} from '../database/projectRegistry.js';

const logger = new Logger('ProjectRegistryService');

// ============================================================================
// SERVICE STATE
// ============================================================================

interface ProjectContext {
  projectId: number;
  projectPath: string;
  activeSessionId: string | null;
  activatedAgents: number[];
  injectedSkills: number[];
  lastActivity: Date;
}

let projectContexts: Map<number, ProjectContext> = new Map();
let currentProjectId: number | null = null;
let eventEmitter: EventEmitter | null = null;
let initialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the project registry service
 */
export function initProjectRegistry(emitter?: EventEmitter): void {
  if (initialized) {
    logger.debug('Project registry already initialized');
    return;
  }

  createProjectRegistryTables();
  eventEmitter = emitter || new EventEmitter();
  initialized = true;

  logger.info('Project registry service initialized');
}

/**
 * Get the event emitter for project events
 */
export function getProjectEventEmitter(): EventEmitter {
  if (!eventEmitter) {
    eventEmitter = new EventEmitter();
  }
  return eventEmitter;
}

// ============================================================================
// PROJECT LIFECYCLE
// ============================================================================

/**
 * Register a new project with the registry
 */
export function addProject(
  projectPath: string,
  name?: string,
  description?: string,
  settings?: ProjectSettings
): RegisteredProject {
  const projectName = name || path.basename(projectPath);

  // Check if already registered
  const existing = getRegisteredProjectByPath(projectPath);
  if (existing) {
    logger.debug(`Project already registered: ${projectPath}`);
    touchProject(existing.id);
    return existing;
  }

  const project = registerProject(projectPath, projectName, description, settings);
  logger.info(`Registered new project: ${projectName} at ${projectPath}`);

  emitEvent('project:registered', { project });
  return project;
}

/**
 * Update an existing project's details
 */
export function updateProject(
  projectId: number,
  updates: Partial<{ name: string; description: string | null; settings: ProjectSettings }>
): RegisteredProject | null {
  const project = updateRegisteredProject(projectId, updates);
  if (project) {
    emitEvent('project:updated', { project });
    logger.debug(`Updated project: ${project.name}`);
  }
  return project;
}

/**
 * Remove a project from the registry
 */
export function removeProject(projectId: number): void {
  const project = getRegisteredProject(projectId);
  if (!project) return;

  // Clear context if this project is active
  if (currentProjectId === projectId) {
    currentProjectId = null;
  }
  projectContexts.delete(projectId);

  unregisterProject(projectId);
  emitEvent('project:removed', { projectId, projectPath: project.path });
  logger.info(`Removed project from registry: ${project.name}`);
}

/**
 * Get a project by ID
 */
export function getProject(projectId: number): RegisteredProject | null {
  return getRegisteredProject(projectId);
}

/**
 * Get a project by path
 */
export function getProjectByPath(projectPath: string): RegisteredProject | null {
  return getRegisteredProjectByPath(projectPath);
}

/**
 * Get all registered projects
 */
export function getAllProjects(): RegisteredProject[] {
  return getAllRegisteredProjects();
}

/**
 * Search projects by name, path, or description
 */
export function findProjects(query: string): RegisteredProject[] {
  return searchProjects(query);
}

/**
 * Get project settings
 */
export function getProjectSettings(projectId: number): ProjectSettings | null {
  const project = getRegisteredProject(projectId);
  return project?.settings || null;
}

/**
 * Update project settings
 */
export function updateProjectSettings(projectId: number, settings: ProjectSettings): RegisteredProject | null {
  return updateRegisteredProject(projectId, { settings });
}

// ============================================================================
// CONTEXT MANAGEMENT
// ============================================================================

/**
 * Switch to a different project context
 */
export function switchProject(projectId: number): ProjectContext | null {
  const project = getRegisteredProject(projectId);
  if (!project) {
    logger.warn(`Cannot switch to unknown project: ${projectId}`);
    return null;
  }

  // Preserve old context
  if (currentProjectId !== null) {
    preserveContext(currentProjectId);
  }

  // Set new current project
  currentProjectId = projectId;
  touchProject(projectId);

  // Get or create context
  let context = projectContexts.get(projectId);
  if (!context) {
    context = {
      projectId,
      projectPath: project.path,
      activeSessionId: null,
      activatedAgents: [],
      injectedSkills: [],
      lastActivity: new Date(),
    };
    projectContexts.set(projectId, context);
  }

  emitEvent('project:switched', { projectId, projectPath: project.path });
  logger.info(`Switched to project: ${project.name}`);

  return context;
}

/**
 * Get the current project ID
 */
export function getCurrentProjectId(): number | null {
  return currentProjectId;
}

/**
 * Get the current project
 */
export function getCurrentProject(): RegisteredProject | null {
  if (currentProjectId === null) return null;
  return getRegisteredProject(currentProjectId);
}

/**
 * Get project context
 */
export function getProjectContext(projectId: number): ProjectContext | null {
  return projectContexts.get(projectId) || null;
}

/**
 * Preserve context for later resumption
 */
export function preserveContext(projectId: number): void {
  const context = projectContexts.get(projectId);
  if (context) {
    context.lastActivity = new Date();
    // Context is already in memory; could be persisted to DB if needed
    logger.debug(`Preserved context for project ${projectId}`);
  }
}

/**
 * Restore project context
 */
export function restoreContext(projectId: number): ProjectContext | null {
  const project = getRegisteredProject(projectId);
  if (!project) return null;

  let context = projectContexts.get(projectId);
  if (!context) {
    // Create fresh context
    context = {
      projectId,
      projectPath: project.path,
      activeSessionId: null,
      activatedAgents: [],
      injectedSkills: [],
      lastActivity: new Date(),
    };
    projectContexts.set(projectId, context);
  }

  return context;
}

/**
 * Update project context with session information
 */
export function updateProjectContext(
  projectId: number,
  updates: Partial<{
    activeSessionId: string | null;
    activatedAgents: number[];
    injectedSkills: number[];
  }>
): void {
  let context = projectContexts.get(projectId);
  if (!context) {
    const project = getRegisteredProject(projectId);
    if (!project) return;

    context = {
      projectId,
      projectPath: project.path,
      activeSessionId: null,
      activatedAgents: [],
      injectedSkills: [],
      lastActivity: new Date(),
    };
    projectContexts.set(projectId, context);
  }

  if (updates.activeSessionId !== undefined) {
    context.activeSessionId = updates.activeSessionId;
  }
  if (updates.activatedAgents !== undefined) {
    context.activatedAgents = updates.activatedAgents;
  }
  if (updates.injectedSkills !== undefined) {
    context.injectedSkills = updates.injectedSkills;
  }
  context.lastActivity = new Date();
}

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================

/**
 * Assign an agent to a project
 */
export function addAgentToProject(
  projectId: number,
  agentId: number,
  priority: number = 0,
  settings?: ProjectAgentSettings
): ProjectAgent {
  const agent = assignAgentToProject(projectId, agentId, priority, settings);
  emitEvent('project:agent-assigned', { projectId, agentId, priority });
  return agent;
}

/**
 * Get all agents configured for a project
 */
export function getAgentsForProject(projectId: number): ProjectAgent[] {
  return getProjectAgents(projectId);
}

/**
 * Update agent configuration for a project
 */
export function updateAgentConfig(
  agentAssignmentId: number,
  updates: Partial<{ priority: number; settings: ProjectAgentSettings }>
): ProjectAgent | null {
  const agent = updateProjectAgent(agentAssignmentId, updates);
  if (agent) {
    emitEvent('project:agent-updated', { projectId: agent.projectId, agentId: agent.agentId });
  }
  return agent;
}

/**
 * Remove an agent from a project
 */
export function removeAgentFromProjectConfig(projectId: number, agentId: number): void {
  removeAgentFromProject(projectId, agentId);
  emitEvent('project:agent-removed', { projectId, agentId });
}

/**
 * Get agents that should be auto-activated for a project
 */
export function getAutoActivateAgents(projectId: number): ProjectAgent[] {
  const agents = getProjectAgents(projectId);
  return agents.filter(a => a.settings.autoActivate && !a.settings.disabled);
}

// ============================================================================
// TEMPLATE MANAGEMENT
// ============================================================================

/**
 * Create a new project template
 */
export function createTemplate(
  name: string,
  description?: string,
  settings?: ProjectSettings,
  agents?: TemplateAgent[]
): ProjectTemplate {
  const template = createProjectTemplate(name, description, settings, agents);
  emitEvent('template:created', { template });
  logger.info(`Created project template: ${name}`);
  return template;
}

/**
 * Get a template by ID
 */
export function getTemplate(templateId: number): ProjectTemplate | null {
  return getProjectTemplate(templateId);
}

/**
 * Get a template by name
 */
export function getTemplateByName(name: string): ProjectTemplate | null {
  return getProjectTemplateByName(name);
}

/**
 * Get all templates
 */
export function getAllTemplates(): ProjectTemplate[] {
  return getAllProjectTemplates();
}

/**
 * Update a template
 */
export function updateTemplate(
  templateId: number,
  updates: Partial<{
    name: string;
    description: string | null;
    settings: ProjectSettings;
    agents: TemplateAgent[];
  }>
): ProjectTemplate | null {
  const template = updateProjectTemplate(templateId, updates);
  if (template) {
    emitEvent('template:updated', { template });
  }
  return template;
}

/**
 * Delete a template
 */
export function removeTemplate(templateId: number): void {
  const template = getProjectTemplate(templateId);
  if (!template) return;

  deleteProjectTemplate(templateId);
  emitEvent('template:deleted', { templateId, templateName: template.name });
  logger.info(`Deleted project template: ${template.name}`);
}

/**
 * Apply a template to a project
 */
export function applyTemplate(projectId: number, templateId: number): RegisteredProject | null {
  const result = applyTemplateToProject(projectId, templateId);
  if (result) {
    emitEvent('template:applied', { projectId, templateId });
    logger.info(`Applied template ${templateId} to project ${projectId}`);
  }
  return result;
}

/**
 * Create a template from an existing project
 */
export function createTemplateFromExistingProject(
  projectId: number,
  templateName: string,
  description?: string
): ProjectTemplate | null {
  const template = createTemplateFromProject(projectId, templateName, description);
  if (template) {
    emitEvent('template:created-from-project', { template, projectId });
    logger.info(`Created template '${templateName}' from project ${projectId}`);
  }
  return template;
}

// ============================================================================
// SESSION TRACKING
// ============================================================================

/**
 * Start tracking a session for a project
 */
export function startProjectSession(
  sessionId: string,
  projectId: number,
  agentSessionId?: string,
  metadata?: Record<string, unknown>
): CrossProjectSession {
  const session = recordCrossProjectSession(sessionId, projectId, agentSessionId, metadata);

  // Update context
  updateProjectContext(projectId, { activeSessionId: sessionId });

  emitEvent('session:started', { sessionId, projectId });
  return session;
}

/**
 * Get session tracking info
 */
export function getSessionTracking(sessionId: string): CrossProjectSession | null {
  return getCrossProjectSessionBySessionId(sessionId);
}

/**
 * Get all sessions for a project
 */
export function getSessionsForProject(projectId: number, limit: number = 50): CrossProjectSession[] {
  return getProjectSessions(projectId, limit);
}

/**
 * Get all active sessions across projects
 */
export function getActiveSessionsAcrossProjects(): CrossProjectSession[] {
  return getActiveCrossProjectSessions();
}

/**
 * Complete a session
 */
export function completeSession(sessionId: string, success: boolean = true): void {
  updateCrossProjectSession(sessionId, {
    status: success ? 'completed' : 'failed',
  });

  // Clear from context
  const session = getCrossProjectSessionBySessionId(sessionId);
  if (session) {
    const context = projectContexts.get(session.projectId);
    if (context && context.activeSessionId === sessionId) {
      context.activeSessionId = null;
    }
  }

  emitEvent('session:completed', { sessionId, success });
}

/**
 * Update session metrics
 */
export function updateSessionUsage(sessionId: string, tokens: number, cost: number): void {
  incrementSessionMetrics(sessionId, tokens, cost);
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get analytics for a specific project
 */
export function getAnalyticsForProject(projectId: number): ProjectAnalytics | null {
  return getProjectAnalytics(projectId);
}

/**
 * Get global analytics across all projects
 */
export function getGlobalProjectAnalytics(): GlobalAnalytics {
  return getGlobalAnalytics();
}

/**
 * Get agent usage statistics by project
 */
export function getAgentUsageStats(): ReturnType<typeof getAgentUsageByProject> {
  return getAgentUsageByProject();
}

/**
 * Get session distribution across projects
 */
export function getSessionDistributionStats(): ReturnType<typeof getSessionDistribution> {
  return getSessionDistribution();
}

/**
 * Compare analytics between multiple projects
 */
export function compareProjectAnalytics(projectIds: number[]): ProjectAnalytics[] {
  return compareProjects(projectIds);
}

/**
 * Get total cost across all projects
 */
export function getTotalCostAcrossProjects(): number {
  const analytics = getGlobalAnalytics();
  return analytics.totalCostUsd;
}

// ============================================================================
// MAINTENANCE
// ============================================================================

/**
 * Clean up old session records
 */
export function cleanup(maxAgeDays: number = 90): number {
  return cleanupOldSessions(maxAgeDays);
}

/**
 * Get service status
 */
export function getStatus(): {
  initialized: boolean;
  currentProjectId: number | null;
  activeContexts: number;
  totalProjects: number;
} {
  return {
    initialized,
    currentProjectId,
    activeContexts: projectContexts.size,
    totalProjects: getAllRegisteredProjects().length,
  };
}

// ============================================================================
// EVENT HELPERS
// ============================================================================

function emitEvent(event: string, data: Record<string, unknown>): void {
  if (eventEmitter) {
    eventEmitter.emit(event, data);
    eventEmitter.emit('project:*', { event, ...data });
  }
}

// ============================================================================
// SINGLETON ACCESSOR
// ============================================================================

let instance: {
  init: typeof initProjectRegistry;
  addProject: typeof addProject;
  updateProject: typeof updateProject;
  removeProject: typeof removeProject;
  getProject: typeof getProject;
  getProjectByPath: typeof getProjectByPath;
  getAllProjects: typeof getAllProjects;
  findProjects: typeof findProjects;
  getProjectSettings: typeof getProjectSettings;
  updateProjectSettings: typeof updateProjectSettings;
  switchProject: typeof switchProject;
  getCurrentProjectId: typeof getCurrentProjectId;
  getCurrentProject: typeof getCurrentProject;
  getProjectContext: typeof getProjectContext;
  preserveContext: typeof preserveContext;
  restoreContext: typeof restoreContext;
  updateProjectContext: typeof updateProjectContext;
  addAgentToProject: typeof addAgentToProject;
  getAgentsForProject: typeof getAgentsForProject;
  updateAgentConfig: typeof updateAgentConfig;
  removeAgentFromProjectConfig: typeof removeAgentFromProjectConfig;
  getAutoActivateAgents: typeof getAutoActivateAgents;
  createTemplate: typeof createTemplate;
  getTemplate: typeof getTemplate;
  getTemplateByName: typeof getTemplateByName;
  getAllTemplates: typeof getAllTemplates;
  updateTemplate: typeof updateTemplate;
  removeTemplate: typeof removeTemplate;
  applyTemplate: typeof applyTemplate;
  createTemplateFromExistingProject: typeof createTemplateFromExistingProject;
  startProjectSession: typeof startProjectSession;
  getSessionTracking: typeof getSessionTracking;
  getSessionsForProject: typeof getSessionsForProject;
  getActiveSessionsAcrossProjects: typeof getActiveSessionsAcrossProjects;
  completeSession: typeof completeSession;
  updateSessionUsage: typeof updateSessionUsage;
  getAnalyticsForProject: typeof getAnalyticsForProject;
  getGlobalProjectAnalytics: typeof getGlobalProjectAnalytics;
  getAgentUsageStats: typeof getAgentUsageStats;
  getSessionDistributionStats: typeof getSessionDistributionStats;
  compareProjectAnalytics: typeof compareProjectAnalytics;
  getTotalCostAcrossProjects: typeof getTotalCostAcrossProjects;
  cleanup: typeof cleanup;
  getStatus: typeof getStatus;
  getEventEmitter: typeof getProjectEventEmitter;
} | null = null;

export function getProjectRegistry() {
  if (!instance) {
    instance = {
      init: initProjectRegistry,
      addProject,
      updateProject,
      removeProject,
      getProject,
      getProjectByPath,
      getAllProjects,
      findProjects,
      getProjectSettings,
      updateProjectSettings,
      switchProject,
      getCurrentProjectId,
      getCurrentProject,
      getProjectContext,
      preserveContext,
      restoreContext,
      updateProjectContext,
      addAgentToProject,
      getAgentsForProject,
      updateAgentConfig,
      removeAgentFromProjectConfig,
      getAutoActivateAgents,
      createTemplate,
      getTemplate,
      getTemplateByName,
      getAllTemplates,
      updateTemplate,
      removeTemplate,
      applyTemplate,
      createTemplateFromExistingProject,
      startProjectSession,
      getSessionTracking,
      getSessionsForProject,
      getActiveSessionsAcrossProjects,
      completeSession,
      updateSessionUsage,
      getAnalyticsForProject,
      getGlobalProjectAnalytics,
      getAgentUsageStats,
      getSessionDistributionStats,
      compareProjectAnalytics,
      getTotalCostAcrossProjects,
      cleanup,
      getStatus,
      getEventEmitter: getProjectEventEmitter,
    };
  }
  return instance;
}

// Re-export types
export type {
  RegisteredProject,
  ProjectSettings,
  ProjectAgent,
  ProjectAgentSettings,
  ProjectTemplate,
  TemplateAgent,
  CrossProjectSession,
  ProjectAnalytics,
  GlobalAnalytics,
  ProjectContext,
};
