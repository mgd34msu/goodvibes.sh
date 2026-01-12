// ============================================================================
// PROJECT REGISTRY DATABASE - Schema for multi-project orchestration
// ============================================================================
//
// This module provides database operations for managing project registrations,
// project-specific agent configurations, templates, and cross-project analytics.
//
// ============================================================================

import { getDatabase } from './index.js';
import { Logger } from '../services/logger.js';

const logger = new Logger('ProjectRegistryDB');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Registered project in the registry
 */
export interface RegisteredProject {
  id: number;
  path: string;
  name: string;
  description: string | null;
  lastOpened: string;
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project-specific settings stored as JSON
 */
export interface ProjectSettings {
  defaultModel?: string;
  permissionMode?: 'default' | 'strict' | 'permissive';
  budgetLimitUsd?: number;
  autoInjectClaudeMd?: boolean;
  claudeMdTemplate?: string;
  enabledHooks?: string[];
  enabledMCPServers?: string[];
  customEnv?: Record<string, string>;
  tags?: string[];
  priority?: number;
}

/**
 * Agent assigned to a project
 */
export interface ProjectAgent {
  id: number;
  projectId: number;
  agentId: number;
  priority: number;
  settings: ProjectAgentSettings;
  createdAt: string;
  updatedAt: string;
}

/**
 * Project-specific agent settings
 */
export interface ProjectAgentSettings {
  autoActivate?: boolean;
  budgetAllocation?: number;
  customPrompt?: string;
  disabled?: boolean;
}

/**
 * Project template for quick project setup
 */
export interface ProjectTemplate {
  id: number;
  name: string;
  description: string | null;
  settings: ProjectSettings;
  agents: TemplateAgent[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Agent configuration within a template
 */
export interface TemplateAgent {
  agentId: number;
  priority: number;
  settings: ProjectAgentSettings;
}

/**
 * Cross-project session tracking entry
 */
export interface CrossProjectSession {
  id: number;
  sessionId: string;
  projectId: number;
  agentSessionId: string | null;
  status: 'active' | 'completed' | 'failed';
  startedAt: string;
  endedAt: string | null;
  tokensUsed: number;
  costUsd: number;
  metadata: string | null;
}

/**
 * Project analytics summary
 */
export interface ProjectAnalytics {
  projectId: number;
  projectPath: string;
  projectName: string;
  totalSessions: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd: number;
  avgSessionDuration: number;
  avgTokensPerSession: number;
  avgCostPerSession: number;
  successRate: number;
  lastActivity: string | null;
}

/**
 * Global analytics across all projects
 */
export interface GlobalAnalytics {
  totalProjects: number;
  activeProjects: number;
  totalSessions: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerProject: number;
  avgSessionsPerProject: number;
  topProjectsByCost: ProjectAnalytics[];
  topProjectsBySessions: ProjectAnalytics[];
  projectDistribution: { projectId: number; projectName: string; percentage: number }[];
  recentActivity: { projectId: number; projectName: string; lastActivity: string }[];
}

// ============================================================================
// TABLE CREATION
// ============================================================================

export function createProjectRegistryTables(): void {
  const db = getDatabase();

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      last_opened TEXT DEFAULT CURRENT_TIMESTAMP,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Project agents table (many-to-many relationship)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      priority INTEGER DEFAULT 0,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES registered_projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, agent_id)
    )
  `);

  // Project templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      settings TEXT DEFAULT '{}',
      agents TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cross-project session tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS cross_project_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      project_id INTEGER NOT NULL,
      agent_session_id TEXT,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      metadata TEXT,
      FOREIGN KEY (project_id) REFERENCES registered_projects(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  createProjectRegistryIndexes();

  logger.info('Project registry tables created');
}

function createProjectRegistryIndexes(): void {
  const db = getDatabase();

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_registered_projects_path ON registered_projects(path)',
    'CREATE INDEX IF NOT EXISTS idx_registered_projects_name ON registered_projects(name)',
    'CREATE INDEX IF NOT EXISTS idx_registered_projects_last_opened ON registered_projects(last_opened DESC)',
    'CREATE INDEX IF NOT EXISTS idx_project_agents_project ON project_agents(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_project_agents_agent ON project_agents(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_project_templates_name ON project_templates(name)',
    'CREATE INDEX IF NOT EXISTS idx_cross_project_sessions_session ON cross_project_sessions(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_cross_project_sessions_project ON cross_project_sessions(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_cross_project_sessions_status ON cross_project_sessions(status)',
  ];

  for (const index of indexes) {
    try {
      db.exec(index);
    } catch (e) {
      const error = e as Error;
      if (!error.message?.includes('already exists')) {
        logger.warn(`Failed to create index: ${error.message}`);
      }
    }
  }
}

// ============================================================================
// REGISTERED PROJECT OPERATIONS
// ============================================================================

/**
 * Register a new project
 */
export function registerProject(
  path: string,
  name: string,
  description?: string,
  settings?: ProjectSettings
): RegisteredProject {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO registered_projects (path, name, description, settings)
    VALUES (?, ?, ?, ?)
  `).run(
    path,
    name,
    description || null,
    JSON.stringify(settings || {})
  );

  return getRegisteredProject(result.lastInsertRowid as number)!;
}

/**
 * Get registered project by ID
 */
export function getRegisteredProject(id: number): RegisteredProject | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM registered_projects WHERE id = ?').get(id) as any;
  return row ? mapRowToProject(row) : null;
}

/**
 * Get registered project by path
 */
export function getRegisteredProjectByPath(path: string): RegisteredProject | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM registered_projects WHERE path = ?').get(path) as any;
  return row ? mapRowToProject(row) : null;
}

/**
 * Get all registered projects
 */
export function getAllRegisteredProjects(): RegisteredProject[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM registered_projects
    ORDER BY last_opened DESC
  `).all() as any[];
  return rows.map(mapRowToProject);
}

/**
 * Update a registered project
 */
export function updateRegisteredProject(
  id: number,
  updates: Partial<{
    name: string;
    description: string | null;
    settings: ProjectSettings;
  }>
): RegisteredProject | null {
  const db = getDatabase();
  const existing = getRegisteredProject(id);
  if (!existing) return null;

  const setters: string[] = ['updated_at = datetime(\'now\')'];
  const params: any[] = [];

  if (updates.name !== undefined) {
    setters.push('name = ?');
    params.push(updates.name);
  }

  if (updates.description !== undefined) {
    setters.push('description = ?');
    params.push(updates.description);
  }

  if (updates.settings !== undefined) {
    setters.push('settings = ?');
    params.push(JSON.stringify(updates.settings));
  }

  params.push(id);

  db.prepare(`
    UPDATE registered_projects SET ${setters.join(', ')}
    WHERE id = ?
  `).run(...params);

  return getRegisteredProject(id);
}

/**
 * Update last opened timestamp
 */
export function touchProject(id: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE registered_projects SET
      last_opened = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

/**
 * Remove a project from registry
 */
export function unregisterProject(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM registered_projects WHERE id = ?').run(id);
}

/**
 * Search projects by name or path
 */
export function searchProjects(query: string): RegisteredProject[] {
  const db = getDatabase();
  const searchTerm = `%${query}%`;
  const rows = db.prepare(`
    SELECT * FROM registered_projects
    WHERE name LIKE ? OR path LIKE ? OR description LIKE ?
    ORDER BY last_opened DESC
  `).all(searchTerm, searchTerm, searchTerm) as any[];
  return rows.map(mapRowToProject);
}

function mapRowToProject(row: any): RegisteredProject {
  return {
    id: row.id,
    path: row.path,
    name: row.name,
    description: row.description,
    lastOpened: row.last_opened,
    settings: JSON.parse(row.settings || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// PROJECT AGENT OPERATIONS
// ============================================================================

/**
 * Assign an agent to a project
 */
export function assignAgentToProject(
  projectId: number,
  agentId: number,
  priority: number = 0,
  settings?: ProjectAgentSettings
): ProjectAgent {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO project_agents (project_id, agent_id, priority, settings)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, agent_id) DO UPDATE SET
      priority = excluded.priority,
      settings = excluded.settings,
      updated_at = datetime('now')
  `).run(
    projectId,
    agentId,
    priority,
    JSON.stringify(settings || {})
  );

  return getProjectAgent(result.lastInsertRowid as number)!;
}

/**
 * Get project agent by ID
 */
export function getProjectAgent(id: number): ProjectAgent | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM project_agents WHERE id = ?').get(id) as any;
  return row ? mapRowToProjectAgent(row) : null;
}

/**
 * Get all agents for a project
 */
export function getProjectAgents(projectId: number): ProjectAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM project_agents
    WHERE project_id = ?
    ORDER BY priority DESC
  `).all(projectId) as any[];
  return rows.map(mapRowToProjectAgent);
}

/**
 * Update project agent settings
 */
export function updateProjectAgent(
  id: number,
  updates: Partial<{ priority: number; settings: ProjectAgentSettings }>
): ProjectAgent | null {
  const db = getDatabase();
  const setters: string[] = ['updated_at = datetime(\'now\')'];
  const params: any[] = [];

  if (updates.priority !== undefined) {
    setters.push('priority = ?');
    params.push(updates.priority);
  }

  if (updates.settings !== undefined) {
    setters.push('settings = ?');
    params.push(JSON.stringify(updates.settings));
  }

  params.push(id);

  db.prepare(`
    UPDATE project_agents SET ${setters.join(', ')}
    WHERE id = ?
  `).run(...params);

  return getProjectAgent(id);
}

/**
 * Remove agent from project
 */
export function removeAgentFromProject(projectId: number, agentId: number): void {
  const db = getDatabase();
  db.prepare(`
    DELETE FROM project_agents
    WHERE project_id = ? AND agent_id = ?
  `).run(projectId, agentId);
}

function mapRowToProjectAgent(row: any): ProjectAgent {
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    priority: row.priority,
    settings: JSON.parse(row.settings || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// PROJECT TEMPLATE OPERATIONS
// ============================================================================

/**
 * Create a project template
 */
export function createProjectTemplate(
  name: string,
  description?: string,
  settings?: ProjectSettings,
  agents?: TemplateAgent[]
): ProjectTemplate {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO project_templates (name, description, settings, agents)
    VALUES (?, ?, ?, ?)
  `).run(
    name,
    description || null,
    JSON.stringify(settings || {}),
    JSON.stringify(agents || [])
  );

  return getProjectTemplate(result.lastInsertRowid as number)!;
}

/**
 * Get project template by ID
 */
export function getProjectTemplate(id: number): ProjectTemplate | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM project_templates WHERE id = ?').get(id) as any;
  return row ? mapRowToTemplate(row) : null;
}

/**
 * Get project template by name
 */
export function getProjectTemplateByName(name: string): ProjectTemplate | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM project_templates WHERE name = ?').get(name) as any;
  return row ? mapRowToTemplate(row) : null;
}

/**
 * Get all project templates
 */
export function getAllProjectTemplates(): ProjectTemplate[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM project_templates
    ORDER BY name ASC
  `).all() as any[];
  return rows.map(mapRowToTemplate);
}

/**
 * Update a project template
 */
export function updateProjectTemplate(
  id: number,
  updates: Partial<{
    name: string;
    description: string | null;
    settings: ProjectSettings;
    agents: TemplateAgent[];
  }>
): ProjectTemplate | null {
  const db = getDatabase();
  const setters: string[] = ['updated_at = datetime(\'now\')'];
  const params: any[] = [];

  if (updates.name !== undefined) {
    setters.push('name = ?');
    params.push(updates.name);
  }

  if (updates.description !== undefined) {
    setters.push('description = ?');
    params.push(updates.description);
  }

  if (updates.settings !== undefined) {
    setters.push('settings = ?');
    params.push(JSON.stringify(updates.settings));
  }

  if (updates.agents !== undefined) {
    setters.push('agents = ?');
    params.push(JSON.stringify(updates.agents));
  }

  params.push(id);

  db.prepare(`
    UPDATE project_templates SET ${setters.join(', ')}
    WHERE id = ?
  `).run(...params);

  return getProjectTemplate(id);
}

/**
 * Delete a project template
 */
export function deleteProjectTemplate(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM project_templates WHERE id = ?').run(id);
}

/**
 * Apply template to a project
 */
export function applyTemplateToProject(projectId: number, templateId: number): RegisteredProject | null {
  const db = getDatabase();
  const template = getProjectTemplate(templateId);
  const project = getRegisteredProject(projectId);

  if (!template || !project) return null;

  // Update project settings from template
  updateRegisteredProject(projectId, { settings: template.settings });

  // Clear existing agents and apply template agents
  db.prepare('DELETE FROM project_agents WHERE project_id = ?').run(projectId);

  for (const agent of template.agents) {
    assignAgentToProject(projectId, agent.agentId, agent.priority, agent.settings);
  }

  return getRegisteredProject(projectId);
}

/**
 * Create template from existing project
 */
export function createTemplateFromProject(
  projectId: number,
  templateName: string,
  description?: string
): ProjectTemplate | null {
  const project = getRegisteredProject(projectId);
  if (!project) return null;

  const projectAgents = getProjectAgents(projectId);
  const agents: TemplateAgent[] = projectAgents.map(pa => ({
    agentId: pa.agentId,
    priority: pa.priority,
    settings: pa.settings,
  }));

  return createProjectTemplate(templateName, description, project.settings, agents);
}

function mapRowToTemplate(row: any): ProjectTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    settings: JSON.parse(row.settings || '{}'),
    agents: JSON.parse(row.agents || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// CROSS-PROJECT SESSION OPERATIONS
// ============================================================================

/**
 * Record a session for cross-project tracking
 */
export function recordCrossProjectSession(
  sessionId: string,
  projectId: number,
  agentSessionId?: string,
  metadata?: Record<string, unknown>
): CrossProjectSession {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO cross_project_sessions (session_id, project_id, agent_session_id, metadata)
    VALUES (?, ?, ?, ?)
  `).run(
    sessionId,
    projectId,
    agentSessionId || null,
    metadata ? JSON.stringify(metadata) : null
  );

  return getCrossProjectSession(result.lastInsertRowid as number)!;
}

/**
 * Get cross-project session by ID
 */
export function getCrossProjectSession(id: number): CrossProjectSession | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM cross_project_sessions WHERE id = ?').get(id) as any;
  return row ? mapRowToCrossProjectSession(row) : null;
}

/**
 * Get cross-project session by session ID
 */
export function getCrossProjectSessionBySessionId(sessionId: string): CrossProjectSession | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM cross_project_sessions WHERE session_id = ?').get(sessionId) as any;
  return row ? mapRowToCrossProjectSession(row) : null;
}

/**
 * Get all sessions for a project
 */
export function getProjectSessions(projectId: number, limit: number = 50): CrossProjectSession[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM cross_project_sessions
    WHERE project_id = ?
    ORDER BY started_at DESC
    LIMIT ?
  `).all(projectId, limit) as any[];
  return rows.map(mapRowToCrossProjectSession);
}

/**
 * Get active sessions across all projects
 */
export function getActiveCrossProjectSessions(): CrossProjectSession[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM cross_project_sessions
    WHERE status = 'active'
    ORDER BY started_at DESC
  `).all() as any[];
  return rows.map(mapRowToCrossProjectSession);
}

/**
 * Update cross-project session
 */
export function updateCrossProjectSession(
  sessionId: string,
  updates: Partial<{
    status: 'active' | 'completed' | 'failed';
    tokensUsed: number;
    costUsd: number;
    metadata: Record<string, unknown>;
  }>
): void {
  const db = getDatabase();
  const setters: string[] = [];
  const params: any[] = [];

  if (updates.status !== undefined) {
    setters.push('status = ?');
    params.push(updates.status);
    if (updates.status !== 'active') {
      setters.push('ended_at = datetime(\'now\')');
    }
  }

  if (updates.tokensUsed !== undefined) {
    setters.push('tokens_used = ?');
    params.push(updates.tokensUsed);
  }

  if (updates.costUsd !== undefined) {
    setters.push('cost_usd = ?');
    params.push(updates.costUsd);
  }

  if (updates.metadata !== undefined) {
    setters.push('metadata = ?');
    params.push(JSON.stringify(updates.metadata));
  }

  if (setters.length === 0) return;

  params.push(sessionId);

  db.prepare(`
    UPDATE cross_project_sessions SET ${setters.join(', ')}
    WHERE session_id = ?
  `).run(...params);
}

/**
 * Increment session metrics
 */
export function incrementSessionMetrics(sessionId: string, tokens: number, cost: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE cross_project_sessions SET
      tokens_used = tokens_used + ?,
      cost_usd = cost_usd + ?
    WHERE session_id = ?
  `).run(tokens, cost, sessionId);
}

function mapRowToCrossProjectSession(row: any): CrossProjectSession {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectId: row.project_id,
    agentSessionId: row.agent_session_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    tokensUsed: row.tokens_used,
    costUsd: row.cost_usd,
    metadata: row.metadata,
  };
}

// ============================================================================
// ANALYTICS OPERATIONS
// ============================================================================

/**
 * Convert a file path to the encoded project_name format used in sessions table.
 * e.g., "C:\Users\buzzkill\Documents\clausitron" -> "C--Users-buzzkill-Documents-clausitron"
 */
function encodeProjectPath(path: string): string {
  return path.replace(/:/g, '-').replace(/[\\/]/g, '-');
}

/**
 * Get analytics for a single project.
 * Queries the main sessions table using the encoded project path.
 */
export function getProjectAnalytics(projectId: number): ProjectAnalytics | null {
  const db = getDatabase();
  const project = getRegisteredProject(projectId);
  if (!project) return null;

  // Convert project path to the encoded format used in sessions.project_name
  const encodedPath = encodeProjectPath(project.path);

  // Query the main sessions table for this project's stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      COALESCE(SUM(token_count), 0) as total_tokens,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
      COALESCE(SUM(cost), 0) as total_cost,
      COALESCE(AVG(
        CASE WHEN end_time IS NOT NULL AND start_time IS NOT NULL
        THEN (julianday(end_time) - julianday(start_time)) * 86400000
        ELSE NULL END
      ), 0) as avg_duration,
      MAX(end_time) as last_activity,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
    FROM sessions
    WHERE project_name = ?
  `).get(encodedPath) as any;

  const totalSessions = stats.total_sessions || 0;

  return {
    projectId,
    projectPath: project.path,
    projectName: project.name,
    totalSessions,
    totalTokens: stats.total_tokens || 0,
    inputTokens: stats.input_tokens || 0,
    outputTokens: stats.output_tokens || 0,
    cacheReadTokens: stats.cache_read_tokens || 0,
    cacheWriteTokens: stats.cache_write_tokens || 0,
    totalCostUsd: stats.total_cost || 0,
    avgSessionDuration: stats.avg_duration || 0,
    avgTokensPerSession: totalSessions > 0 ? (stats.total_tokens || 0) / totalSessions : 0,
    avgCostPerSession: totalSessions > 0 ? (stats.total_cost || 0) / totalSessions : 0,
    successRate: totalSessions > 0 ? (stats.completed_count || 0) / totalSessions : 0,
    lastActivity: stats.last_activity,
  };
}

/**
 * Get global analytics across all projects
 */
export function getGlobalAnalytics(): GlobalAnalytics {
  const db = getDatabase();

  // Basic stats
  const globalStats = db.prepare(`
    SELECT
      COUNT(DISTINCT p.id) as total_projects,
      COUNT(DISTINCT CASE WHEN s.status = 'active' THEN p.id END) as active_projects,
      COALESCE(SUM(s.tokens_used), 0) as total_tokens,
      COALESCE(SUM(s.cost_usd), 0) as total_cost,
      COUNT(s.id) as total_sessions
    FROM registered_projects p
    LEFT JOIN cross_project_sessions s ON p.id = s.project_id
  `).get() as any;

  const totalProjects = globalStats.total_projects || 0;

  // Top projects by cost
  const topByCost = db.prepare(`
    SELECT
      p.id as project_id,
      p.path as project_path,
      p.name as project_name,
      COUNT(s.id) as total_sessions,
      COALESCE(SUM(s.tokens_used), 0) as total_tokens,
      COALESCE(SUM(s.cost_usd), 0) as total_cost,
      MAX(s.started_at) as last_activity
    FROM registered_projects p
    LEFT JOIN cross_project_sessions s ON p.id = s.project_id
    GROUP BY p.id
    ORDER BY total_cost DESC
    LIMIT 10
  `).all() as any[];

  // Top projects by sessions
  const topBySessions = db.prepare(`
    SELECT
      p.id as project_id,
      p.path as project_path,
      p.name as project_name,
      COUNT(s.id) as total_sessions,
      COALESCE(SUM(s.tokens_used), 0) as total_tokens,
      COALESCE(SUM(s.cost_usd), 0) as total_cost,
      MAX(s.started_at) as last_activity
    FROM registered_projects p
    LEFT JOIN cross_project_sessions s ON p.id = s.project_id
    GROUP BY p.id
    ORDER BY total_sessions DESC
    LIMIT 10
  `).all() as any[];

  // Project distribution
  const distribution = db.prepare(`
    SELECT
      p.id as project_id,
      p.name as project_name,
      COALESCE(SUM(s.cost_usd), 0) as cost
    FROM registered_projects p
    LEFT JOIN cross_project_sessions s ON p.id = s.project_id
    GROUP BY p.id
    HAVING cost > 0
  `).all() as any[];

  const totalCost = globalStats.total_cost || 1; // Avoid division by zero
  const projectDistribution = distribution.map(d => ({
    projectId: d.project_id,
    projectName: d.project_name,
    percentage: (d.cost / totalCost) * 100,
  }));

  // Recent activity
  const recentActivity = db.prepare(`
    SELECT
      p.id as project_id,
      p.name as project_name,
      MAX(s.started_at) as last_activity
    FROM registered_projects p
    JOIN cross_project_sessions s ON p.id = s.project_id
    GROUP BY p.id
    ORDER BY last_activity DESC
    LIMIT 10
  `).all() as any[];

  const mapToProjectAnalytics = (row: any): ProjectAnalytics => {
    const sessions = row.total_sessions || 0;
    return {
      projectId: row.project_id,
      projectPath: row.project_path,
      projectName: row.project_name,
      totalSessions: sessions,
      totalTokens: row.total_tokens || 0,
      totalCostUsd: row.total_cost || 0,
      avgSessionDuration: 0,
      avgTokensPerSession: sessions > 0 ? (row.total_tokens || 0) / sessions : 0,
      avgCostPerSession: sessions > 0 ? (row.total_cost || 0) / sessions : 0,
      successRate: 0,
      lastActivity: row.last_activity,
    };
  };

  return {
    totalProjects,
    activeProjects: globalStats.active_projects || 0,
    totalSessions: globalStats.total_sessions || 0,
    totalTokens: globalStats.total_tokens || 0,
    totalCostUsd: globalStats.total_cost || 0,
    avgCostPerProject: totalProjects > 0 ? (globalStats.total_cost || 0) / totalProjects : 0,
    avgSessionsPerProject: totalProjects > 0 ? (globalStats.total_sessions || 0) / totalProjects : 0,
    topProjectsByCost: topByCost.map(mapToProjectAnalytics),
    topProjectsBySessions: topBySessions.map(mapToProjectAnalytics),
    projectDistribution,
    recentActivity: recentActivity.map(r => ({
      projectId: r.project_id,
      projectName: r.project_name,
      lastActivity: r.last_activity,
    })),
  };
}

/**
 * Get agent usage across projects
 */
export function getAgentUsageByProject(): { agentId: number; projectId: number; projectName: string; sessionCount: number; totalCost: number }[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      pa.agent_id,
      p.id as project_id,
      p.name as project_name,
      COUNT(s.id) as session_count,
      COALESCE(SUM(s.cost_usd), 0) as total_cost
    FROM project_agents pa
    JOIN registered_projects p ON pa.project_id = p.id
    LEFT JOIN cross_project_sessions s ON p.id = s.project_id
    GROUP BY pa.agent_id, p.id
    ORDER BY session_count DESC
  `).all() as any[];

  return rows.map(row => ({
    agentId: row.agent_id,
    projectId: row.project_id,
    projectName: row.project_name,
    sessionCount: row.session_count || 0,
    totalCost: row.total_cost || 0,
  }));
}

/**
 * Get session distribution by project
 */
export function getSessionDistribution(): { projectId: number; projectName: string; sessionCount: number; percentage: number }[] {
  const db = getDatabase();

  const total = db.prepare('SELECT COUNT(*) as count FROM cross_project_sessions').get() as { count: number };
  const totalSessions = total.count || 1;

  const rows = db.prepare(`
    SELECT
      p.id as project_id,
      p.name as project_name,
      COUNT(s.id) as session_count
    FROM registered_projects p
    LEFT JOIN cross_project_sessions s ON p.id = s.project_id
    GROUP BY p.id
    ORDER BY session_count DESC
  `).all() as any[];

  return rows.map(row => ({
    projectId: row.project_id,
    projectName: row.project_name,
    sessionCount: row.session_count || 0,
    percentage: ((row.session_count || 0) / totalSessions) * 100,
  }));
}

/**
 * Get project comparison metrics
 */
export function compareProjects(projectIds: number[]): ProjectAnalytics[] {
  return projectIds
    .map(id => getProjectAnalytics(id))
    .filter((a): a is ProjectAnalytics => a !== null);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up old session records
 */
export function cleanupOldSessions(maxAgeDays: number = 90): number {
  const db = getDatabase();
  const threshold = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  const result = db.prepare(`
    DELETE FROM cross_project_sessions
    WHERE ended_at IS NOT NULL AND ended_at < ?
  `).run(threshold);

  if (result.changes > 0) {
    logger.info(`Cleaned up ${result.changes} old cross-project session records`);
  }

  return result.changes;
}
