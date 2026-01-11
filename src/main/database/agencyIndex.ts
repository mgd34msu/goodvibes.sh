// ============================================================================
// AGENCY INDEX DATABASE - Schema for indexed agents and skills from agency
// ============================================================================
//
// This module provides database operations for storing and querying indexed
// agents and skills from the external agency directory. It includes full-text
// search capabilities using SQLite FTS5.
//
// ============================================================================

import { getDatabase } from './index.js';
import { Logger } from '../services/logger.js';

const logger = new Logger('AgencyIndexDB');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Category in the agent/skill hierarchy
 */
export interface AgencyCategory {
  id: number;
  name: string;
  path: string;  // e.g., "webdev/ai-ml" or "webdev/backend"
  parentId: number | null;
  type: 'agent' | 'skill';
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Indexed agent from agency directory
 */
export interface IndexedAgent {
  id: number;
  name: string;
  slug: string;  // File name without extension
  description: string | null;
  content: string;  // Full markdown content
  categoryId: number;
  categoryPath: string;  // e.g., "webdev/ai-ml"
  filePath: string;  // Absolute path to the .md file
  skills: string[];  // Related skill slugs (JSON array)
  tags: string[];  // Extracted tags (JSON array)
  useCount: number;
  lastUsed: string | null;
  lastIndexed: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Indexed skill from agency directory
 */
export interface IndexedSkill {
  id: number;
  name: string;
  slug: string;  // Directory name containing SKILL.md
  description: string | null;
  content: string;  // Full SKILL.md content
  categoryId: number;
  categoryPath: string;  // e.g., "webdev/ai-ml/implementing-anthropic-patterns"
  filePath: string;  // Absolute path to the SKILL.md file
  agentSlug: string | null;  // Related agent if any
  triggers: string[];  // Trigger keywords (JSON array)
  tags: string[];  // Extracted tags (JSON array)
  useCount: number;
  lastUsed: string | null;
  lastIndexed: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Active agent configuration for a session
 */
export interface ActiveAgent {
  id: number;
  sessionId: string | null;  // null for global activation
  projectPath: string | null;
  agentId: number;
  priority: number;  // Higher = processed first
  activatedAt: string;
  deactivatedAt: string | null;
  isActive: boolean;
}

/**
 * Queued skill for injection
 */
export interface QueuedSkill {
  id: number;
  sessionId: string | null;
  projectPath: string | null;
  skillId: number;
  priority: number;
  injected: boolean;
  injectedAt: string | null;
  queuedAt: string;
}

/**
 * Search result with relevance score
 */
export interface SearchResult<T> {
  item: T;
  score: number;
  matchedFields: string[];
}

// ============================================================================
// TABLE CREATION
// ============================================================================

export function createAgencyIndexTables(): void {
  const db = getDatabase();

  // Categories table for hierarchical organization
  db.exec(`
    CREATE TABLE IF NOT EXISTS agency_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      parent_id INTEGER,
      type TEXT NOT NULL CHECK (type IN ('agent', 'skill')),
      item_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES agency_categories(id) ON DELETE SET NULL
    )
  `);

  // Indexed agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexed_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      content TEXT NOT NULL,
      category_id INTEGER,
      category_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      skills TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      use_count INTEGER DEFAULT 0,
      last_used TEXT,
      last_indexed TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES agency_categories(id) ON DELETE SET NULL
    )
  `);

  // Indexed skills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexed_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      content TEXT NOT NULL,
      category_id INTEGER,
      category_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      agent_slug TEXT,
      triggers TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      use_count INTEGER DEFAULT 0,
      last_used TEXT,
      last_indexed TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES agency_categories(id) ON DELETE SET NULL
    )
  `);

  // Active agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      project_path TEXT,
      agent_id INTEGER NOT NULL,
      priority INTEGER DEFAULT 0,
      activated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deactivated_at TEXT,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (agent_id) REFERENCES indexed_agents(id) ON DELETE CASCADE
    )
  `);

  // Queued skills table
  db.exec(`
    CREATE TABLE IF NOT EXISTS queued_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      project_path TEXT,
      skill_id INTEGER NOT NULL,
      priority INTEGER DEFAULT 0,
      injected INTEGER DEFAULT 0,
      injected_at TEXT,
      queued_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (skill_id) REFERENCES indexed_skills(id) ON DELETE CASCADE
    )
  `);

  // Create FTS5 virtual tables for full-text search
  createFTSTables();

  // Create indexes
  createAgencyIndexIndexes();

  logger.info('Agency index tables created');
}

function createFTSTables(): void {
  const db = getDatabase();

  // FTS5 table for agent search
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS indexed_agents_fts USING fts5(
        name,
        slug,
        description,
        content,
        tags,
        content='indexed_agents',
        content_rowid='id',
        tokenize='porter unicode61'
      )
    `);
  } catch (e) {
    // Table might already exist with different schema
    logger.debug('Agent FTS table already exists or creation failed');
  }

  // FTS5 table for skill search
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS indexed_skills_fts USING fts5(
        name,
        slug,
        description,
        content,
        triggers,
        tags,
        content='indexed_skills',
        content_rowid='id',
        tokenize='porter unicode61'
      )
    `);
  } catch (e) {
    logger.debug('Skill FTS table already exists or creation failed');
  }

  // Create triggers to keep FTS tables in sync
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS indexed_agents_ai AFTER INSERT ON indexed_agents BEGIN
        INSERT INTO indexed_agents_fts(rowid, name, slug, description, content, tags)
        VALUES (new.id, new.name, new.slug, new.description, new.content, new.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS indexed_agents_ad AFTER DELETE ON indexed_agents BEGIN
        INSERT INTO indexed_agents_fts(indexed_agents_fts, rowid, name, slug, description, content, tags)
        VALUES ('delete', old.id, old.name, old.slug, old.description, old.content, old.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS indexed_agents_au AFTER UPDATE ON indexed_agents BEGIN
        INSERT INTO indexed_agents_fts(indexed_agents_fts, rowid, name, slug, description, content, tags)
        VALUES ('delete', old.id, old.name, old.slug, old.description, old.content, old.tags);
        INSERT INTO indexed_agents_fts(rowid, name, slug, description, content, tags)
        VALUES (new.id, new.name, new.slug, new.description, new.content, new.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS indexed_skills_ai AFTER INSERT ON indexed_skills BEGIN
        INSERT INTO indexed_skills_fts(rowid, name, slug, description, content, triggers, tags)
        VALUES (new.id, new.name, new.slug, new.description, new.content, new.triggers, new.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS indexed_skills_ad AFTER DELETE ON indexed_skills BEGIN
        INSERT INTO indexed_skills_fts(indexed_skills_fts, rowid, name, slug, description, content, triggers, tags)
        VALUES ('delete', old.id, old.name, old.slug, old.description, old.content, old.triggers, old.tags);
      END
    `);

    db.exec(`
      CREATE TRIGGER IF NOT EXISTS indexed_skills_au AFTER UPDATE ON indexed_skills BEGIN
        INSERT INTO indexed_skills_fts(indexed_skills_fts, rowid, name, slug, description, content, triggers, tags)
        VALUES ('delete', old.id, old.name, old.slug, old.description, old.content, old.triggers, old.tags);
        INSERT INTO indexed_skills_fts(rowid, name, slug, description, content, triggers, tags)
        VALUES (new.id, new.name, new.slug, new.description, new.content, new.triggers, new.tags);
      END
    `);
  } catch (e) {
    logger.debug('FTS triggers may already exist');
  }
}

function createAgencyIndexIndexes(): void {
  const db = getDatabase();

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_agency_categories_path ON agency_categories(path)',
    'CREATE INDEX IF NOT EXISTS idx_agency_categories_parent ON agency_categories(parent_id)',
    'CREATE INDEX IF NOT EXISTS idx_agency_categories_type ON agency_categories(type)',
    'CREATE INDEX IF NOT EXISTS idx_indexed_agents_category ON indexed_agents(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_indexed_agents_slug ON indexed_agents(slug)',
    'CREATE INDEX IF NOT EXISTS idx_indexed_agents_use_count ON indexed_agents(use_count DESC)',
    'CREATE INDEX IF NOT EXISTS idx_indexed_skills_category ON indexed_skills(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_indexed_skills_slug ON indexed_skills(slug)',
    'CREATE INDEX IF NOT EXISTS idx_indexed_skills_agent ON indexed_skills(agent_slug)',
    'CREATE INDEX IF NOT EXISTS idx_indexed_skills_use_count ON indexed_skills(use_count DESC)',
    'CREATE INDEX IF NOT EXISTS idx_active_agents_session ON active_agents(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_active_agents_project ON active_agents(project_path)',
    'CREATE INDEX IF NOT EXISTS idx_active_agents_active ON active_agents(is_active)',
    'CREATE INDEX IF NOT EXISTS idx_queued_skills_session ON queued_skills(session_id)',
    'CREATE INDEX IF NOT EXISTS idx_queued_skills_project ON queued_skills(project_path)',
    'CREATE INDEX IF NOT EXISTS idx_queued_skills_injected ON queued_skills(injected)',
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
// CATEGORY OPERATIONS
// ============================================================================

export function upsertCategory(category: Omit<AgencyCategory, 'id' | 'createdAt' | 'updatedAt'>): AgencyCategory {
  const db = getDatabase();

  const existing = db.prepare('SELECT id FROM agency_categories WHERE path = ?').get(category.path) as { id: number } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE agency_categories SET
        name = ?,
        parent_id = ?,
        type = ?,
        item_count = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      category.name,
      category.parentId,
      category.type,
      category.itemCount,
      existing.id
    );
    return getCategory(existing.id)!;
  } else {
    const result = db.prepare(`
      INSERT INTO agency_categories (name, path, parent_id, type, item_count)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      category.name,
      category.path,
      category.parentId,
      category.type,
      category.itemCount
    );
    return getCategory(result.lastInsertRowid as number)!;
  }
}

export function getCategory(id: number): AgencyCategory | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM agency_categories WHERE id = ?').get(id) as any;
  return row ? mapRowToCategory(row) : null;
}

export function getCategoryByPath(path: string): AgencyCategory | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM agency_categories WHERE path = ?').get(path) as any;
  return row ? mapRowToCategory(row) : null;
}

export function getCategories(type?: 'agent' | 'skill'): AgencyCategory[] {
  const db = getDatabase();
  let query = 'SELECT * FROM agency_categories';
  const params: string[] = [];

  if (type) {
    query += ' WHERE type = ?';
    params.push(type);
  }

  query += ' ORDER BY path';
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(mapRowToCategory);
}

export function getCategoryTree(type: 'agent' | 'skill'): AgencyCategory[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM agency_categories
    WHERE type = ?
    ORDER BY path
  `).all(type) as any[];
  return rows.map(mapRowToCategory);
}

export function updateCategoryCount(id: number, count: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE agency_categories SET
      item_count = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(count, id);
}

function mapRowToCategory(row: any): AgencyCategory {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    parentId: row.parent_id,
    type: row.type,
    itemCount: row.item_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// INDEXED AGENT OPERATIONS
// ============================================================================

export function upsertIndexedAgent(agent: Omit<IndexedAgent, 'id' | 'useCount' | 'lastUsed' | 'createdAt' | 'updatedAt'>): IndexedAgent {
  const db = getDatabase();

  const existing = db.prepare('SELECT id, use_count, last_used FROM indexed_agents WHERE slug = ?').get(agent.slug) as { id: number; use_count: number; last_used: string | null } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE indexed_agents SET
        name = ?,
        description = ?,
        content = ?,
        category_id = ?,
        category_path = ?,
        file_path = ?,
        skills = ?,
        tags = ?,
        last_indexed = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      agent.name,
      agent.description,
      agent.content,
      agent.categoryId,
      agent.categoryPath,
      agent.filePath,
      JSON.stringify(agent.skills || []),
      JSON.stringify(agent.tags || []),
      agent.lastIndexed,
      existing.id
    );
    return getIndexedAgent(existing.id)!;
  } else {
    const result = db.prepare(`
      INSERT INTO indexed_agents (
        name, slug, description, content, category_id, category_path,
        file_path, skills, tags, last_indexed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agent.name,
      agent.slug,
      agent.description,
      agent.content,
      agent.categoryId,
      agent.categoryPath,
      agent.filePath,
      JSON.stringify(agent.skills || []),
      JSON.stringify(agent.tags || []),
      agent.lastIndexed
    );
    return getIndexedAgent(result.lastInsertRowid as number)!;
  }
}

export function getIndexedAgent(id: number): IndexedAgent | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM indexed_agents WHERE id = ?').get(id) as any;
  return row ? mapRowToIndexedAgent(row) : null;
}

export function getIndexedAgentBySlug(slug: string): IndexedAgent | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM indexed_agents WHERE slug = ?').get(slug) as any;
  return row ? mapRowToIndexedAgent(row) : null;
}

export function getAllIndexedAgents(): IndexedAgent[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM indexed_agents ORDER BY name').all() as any[];
  return rows.map(mapRowToIndexedAgent);
}

export function getIndexedAgentsByCategory(categoryId: number): IndexedAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_agents
    WHERE category_id = ?
    ORDER BY name
  `).all(categoryId) as any[];
  return rows.map(mapRowToIndexedAgent);
}

export function getIndexedAgentsByCategoryPath(categoryPath: string): IndexedAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_agents
    WHERE category_path LIKE ?
    ORDER BY name
  `).all(`${categoryPath}%`) as any[];
  return rows.map(mapRowToIndexedAgent);
}

export function getPopularAgents(limit: number = 10): IndexedAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_agents
    ORDER BY use_count DESC, name
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(mapRowToIndexedAgent);
}

export function getRecentlyUsedAgents(limit: number = 10): IndexedAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_agents
    WHERE last_used IS NOT NULL
    ORDER BY last_used DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(mapRowToIndexedAgent);
}

export function searchIndexedAgents(query: string, limit: number = 50): SearchResult<IndexedAgent>[] {
  const db = getDatabase();

  // Use FTS5 for full-text search
  const rows = db.prepare(`
    SELECT ia.*, fts.rank
    FROM indexed_agents ia
    JOIN indexed_agents_fts fts ON ia.id = fts.rowid
    WHERE indexed_agents_fts MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `).all(query, limit) as any[];

  return rows.map(row => ({
    item: mapRowToIndexedAgent(row),
    score: -row.rank, // FTS5 rank is negative, lower is better
    matchedFields: ['name', 'description', 'content'], // Simplified
  }));
}

export function recordAgentUsage(id: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE indexed_agents SET
      use_count = use_count + 1,
      last_used = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function deleteIndexedAgent(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM indexed_agents WHERE id = ?').run(id);
}

export function clearIndexedAgents(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM indexed_agents').run();
}

export function getAgentCount(): number {
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM indexed_agents').get() as { count: number };
  return result.count;
}

function mapRowToIndexedAgent(row: any): IndexedAgent {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    content: row.content,
    categoryId: row.category_id,
    categoryPath: row.category_path,
    filePath: row.file_path,
    skills: JSON.parse(row.skills || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    useCount: row.use_count,
    lastUsed: row.last_used,
    lastIndexed: row.last_indexed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// INDEXED SKILL OPERATIONS
// ============================================================================

export function upsertIndexedSkill(skill: Omit<IndexedSkill, 'id' | 'useCount' | 'lastUsed' | 'createdAt' | 'updatedAt'>): IndexedSkill {
  const db = getDatabase();

  const existing = db.prepare('SELECT id, use_count, last_used FROM indexed_skills WHERE slug = ?').get(skill.slug) as { id: number; use_count: number; last_used: string | null } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE indexed_skills SET
        name = ?,
        description = ?,
        content = ?,
        category_id = ?,
        category_path = ?,
        file_path = ?,
        agent_slug = ?,
        triggers = ?,
        tags = ?,
        last_indexed = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      skill.name,
      skill.description,
      skill.content,
      skill.categoryId,
      skill.categoryPath,
      skill.filePath,
      skill.agentSlug,
      JSON.stringify(skill.triggers || []),
      JSON.stringify(skill.tags || []),
      skill.lastIndexed,
      existing.id
    );
    return getIndexedSkill(existing.id)!;
  } else {
    const result = db.prepare(`
      INSERT INTO indexed_skills (
        name, slug, description, content, category_id, category_path,
        file_path, agent_slug, triggers, tags, last_indexed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      skill.name,
      skill.slug,
      skill.description,
      skill.content,
      skill.categoryId,
      skill.categoryPath,
      skill.filePath,
      skill.agentSlug,
      JSON.stringify(skill.triggers || []),
      JSON.stringify(skill.tags || []),
      skill.lastIndexed
    );
    return getIndexedSkill(result.lastInsertRowid as number)!;
  }
}

export function getIndexedSkill(id: number): IndexedSkill | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM indexed_skills WHERE id = ?').get(id) as any;
  return row ? mapRowToIndexedSkill(row) : null;
}

export function getIndexedSkillBySlug(slug: string): IndexedSkill | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM indexed_skills WHERE slug = ?').get(slug) as any;
  return row ? mapRowToIndexedSkill(row) : null;
}

export function getAllIndexedSkills(): IndexedSkill[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM indexed_skills ORDER BY name').all() as any[];
  return rows.map(mapRowToIndexedSkill);
}

export function getIndexedSkillsByCategory(categoryId: number): IndexedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_skills
    WHERE category_id = ?
    ORDER BY name
  `).all(categoryId) as any[];
  return rows.map(mapRowToIndexedSkill);
}

export function getIndexedSkillsByCategoryPath(categoryPath: string): IndexedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_skills
    WHERE category_path LIKE ?
    ORDER BY name
  `).all(`${categoryPath}%`) as any[];
  return rows.map(mapRowToIndexedSkill);
}

export function getIndexedSkillsByAgent(agentSlug: string): IndexedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_skills
    WHERE agent_slug = ?
    ORDER BY name
  `).all(agentSlug) as any[];
  return rows.map(mapRowToIndexedSkill);
}

export function getPopularSkills(limit: number = 10): IndexedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_skills
    ORDER BY use_count DESC, name
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(mapRowToIndexedSkill);
}

export function getRecentlyUsedSkills(limit: number = 10): IndexedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM indexed_skills
    WHERE last_used IS NOT NULL
    ORDER BY last_used DESC
    LIMIT ?
  `).all(limit) as any[];
  return rows.map(mapRowToIndexedSkill);
}

export function searchIndexedSkills(query: string, limit: number = 50): SearchResult<IndexedSkill>[] {
  const db = getDatabase();

  // Use FTS5 for full-text search
  const rows = db.prepare(`
    SELECT isk.*, fts.rank
    FROM indexed_skills isk
    JOIN indexed_skills_fts fts ON isk.id = fts.rowid
    WHERE indexed_skills_fts MATCH ?
    ORDER BY fts.rank
    LIMIT ?
  `).all(query, limit) as any[];

  return rows.map(row => ({
    item: mapRowToIndexedSkill(row),
    score: -row.rank,
    matchedFields: ['name', 'description', 'content', 'triggers'],
  }));
}

export function recordSkillUsage(id: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE indexed_skills SET
      use_count = use_count + 1,
      last_used = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function deleteIndexedSkill(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM indexed_skills WHERE id = ?').run(id);
}

export function clearIndexedSkills(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM indexed_skills').run();
}

export function getSkillCount(): number {
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM indexed_skills').get() as { count: number };
  return result.count;
}

function mapRowToIndexedSkill(row: any): IndexedSkill {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    content: row.content,
    categoryId: row.category_id,
    categoryPath: row.category_path,
    filePath: row.file_path,
    agentSlug: row.agent_slug,
    triggers: JSON.parse(row.triggers || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    useCount: row.use_count,
    lastUsed: row.last_used,
    lastIndexed: row.last_indexed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// ACTIVE AGENT OPERATIONS
// ============================================================================

export function activateAgent(agentId: number, sessionId?: string, projectPath?: string, priority: number = 0): ActiveAgent {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO active_agents (session_id, project_path, agent_id, priority)
    VALUES (?, ?, ?, ?)
  `).run(sessionId || null, projectPath || null, agentId, priority);

  return getActiveAgent(result.lastInsertRowid as number)!;
}

export function getActiveAgent(id: number): ActiveAgent | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM active_agents WHERE id = ?').get(id) as any;
  return row ? mapRowToActiveAgent(row) : null;
}

export function getActiveAgentsForSession(sessionId: string): ActiveAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM active_agents
    WHERE (session_id = ? OR session_id IS NULL) AND is_active = 1
    ORDER BY priority DESC
  `).all(sessionId) as any[];
  return rows.map(mapRowToActiveAgent);
}

export function getActiveAgentsForProject(projectPath: string): ActiveAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM active_agents
    WHERE (project_path = ? OR project_path IS NULL) AND is_active = 1
    ORDER BY priority DESC
  `).all(projectPath) as any[];
  return rows.map(mapRowToActiveAgent);
}

export function getAllActiveAgentConfigs(): ActiveAgent[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM active_agents
    WHERE is_active = 1
    ORDER BY priority DESC
  `).all() as any[];
  return rows.map(mapRowToActiveAgent);
}

export function deactivateAgent(id: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE active_agents SET
      is_active = 0,
      deactivated_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function deactivateAgentByAgentId(agentId: number, sessionId?: string, projectPath?: string): void {
  const db = getDatabase();

  let query = 'UPDATE active_agents SET is_active = 0, deactivated_at = datetime(\'now\') WHERE agent_id = ?';
  const params: (number | string | null)[] = [agentId];

  if (sessionId !== undefined) {
    query += ' AND (session_id = ? OR session_id IS NULL)';
    params.push(sessionId || null);
  }

  if (projectPath !== undefined) {
    query += ' AND (project_path = ? OR project_path IS NULL)';
    params.push(projectPath || null);
  }

  db.prepare(query).run(...params);
}

function mapRowToActiveAgent(row: any): ActiveAgent {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectPath: row.project_path,
    agentId: row.agent_id,
    priority: row.priority,
    activatedAt: row.activated_at,
    deactivatedAt: row.deactivated_at,
    isActive: row.is_active === 1,
  };
}

// ============================================================================
// QUEUED SKILL OPERATIONS
// ============================================================================

export function queueSkill(skillId: number, sessionId?: string, projectPath?: string, priority: number = 0): QueuedSkill {
  const db = getDatabase();

  const result = db.prepare(`
    INSERT INTO queued_skills (session_id, project_path, skill_id, priority)
    VALUES (?, ?, ?, ?)
  `).run(sessionId || null, projectPath || null, skillId, priority);

  return getQueuedSkill(result.lastInsertRowid as number)!;
}

export function getQueuedSkill(id: number): QueuedSkill | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM queued_skills WHERE id = ?').get(id) as any;
  return row ? mapRowToQueuedSkill(row) : null;
}

export function getPendingSkillsForSession(sessionId: string): QueuedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM queued_skills
    WHERE (session_id = ? OR session_id IS NULL) AND injected = 0
    ORDER BY priority DESC, queued_at ASC
  `).all(sessionId) as any[];
  return rows.map(mapRowToQueuedSkill);
}

export function getPendingSkillsForProject(projectPath: string): QueuedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM queued_skills
    WHERE (project_path = ? OR project_path IS NULL) AND injected = 0
    ORDER BY priority DESC, queued_at ASC
  `).all(projectPath) as any[];
  return rows.map(mapRowToQueuedSkill);
}

export function getAllPendingSkills(): QueuedSkill[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT * FROM queued_skills
    WHERE injected = 0
    ORDER BY priority DESC, queued_at ASC
  `).all() as any[];
  return rows.map(mapRowToQueuedSkill);
}

export function markSkillInjected(id: number): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE queued_skills SET
      injected = 1,
      injected_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function removeQueuedSkill(id: number): void {
  const db = getDatabase();
  db.prepare('DELETE FROM queued_skills WHERE id = ?').run(id);
}

export function clearSkillQueue(sessionId?: string, projectPath?: string): void {
  const db = getDatabase();

  let query = 'DELETE FROM queued_skills WHERE 1=1';
  const params: (string | null)[] = [];

  if (sessionId !== undefined) {
    query += ' AND (session_id = ? OR session_id IS NULL)';
    params.push(sessionId || null);
  }

  if (projectPath !== undefined) {
    query += ' AND (project_path = ? OR project_path IS NULL)';
    params.push(projectPath || null);
  }

  db.prepare(query).run(...params);
}

function mapRowToQueuedSkill(row: any): QueuedSkill {
  return {
    id: row.id,
    sessionId: row.session_id,
    projectPath: row.project_path,
    skillId: row.skill_id,
    priority: row.priority,
    injected: row.injected === 1,
    injectedAt: row.injected_at,
    queuedAt: row.queued_at,
  };
}

// ============================================================================
// STATISTICS
// ============================================================================

export function getIndexStats(): {
  agentCount: number;
  skillCount: number;
  categoryCount: number;
  activeAgentCount: number;
  pendingSkillCount: number;
  lastIndexed: string | null;
} {
  const db = getDatabase();

  const agentCount = (db.prepare('SELECT COUNT(*) as count FROM indexed_agents').get() as { count: number }).count;
  const skillCount = (db.prepare('SELECT COUNT(*) as count FROM indexed_skills').get() as { count: number }).count;
  const categoryCount = (db.prepare('SELECT COUNT(*) as count FROM agency_categories').get() as { count: number }).count;
  const activeAgentCount = (db.prepare('SELECT COUNT(*) as count FROM active_agents WHERE is_active = 1').get() as { count: number }).count;
  const pendingSkillCount = (db.prepare('SELECT COUNT(*) as count FROM queued_skills WHERE injected = 0').get() as { count: number }).count;
  const lastIndexed = (db.prepare('SELECT MAX(last_indexed) as last FROM indexed_agents').get() as { last: string | null }).last;

  return {
    agentCount,
    skillCount,
    categoryCount,
    activeAgentCount,
    pendingSkillCount,
    lastIndexed,
  };
}
