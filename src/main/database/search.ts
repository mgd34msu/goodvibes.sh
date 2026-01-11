// ============================================================================
// SEARCH DATABASE OPERATIONS
// ============================================================================

import { getDatabase } from './index.js';
import type { Session, SearchOptions, SavedSearch } from '../../shared/types/index.js';

export function searchSessions(query: string): Session[] {
  const database = getDatabase();
  const searchTerm = `%${query}%`;
  const rows = database.prepare(`
    SELECT DISTINCT s.* FROM sessions s
    LEFT JOIN messages m ON s.id = m.session_id
    WHERE s.project_name LIKE ? OR m.content LIKE ?
    ORDER BY s.end_time DESC
  `).all(searchTerm, searchTerm);
  return rows.map(mapRowToSession);
}

export function searchSessionsAdvanced(options: SearchOptions): Session[] {
  const database = getDatabase();

  let sql = 'SELECT * FROM sessions WHERE 1=1';
  const params: unknown[] = [];

  if (options.query) {
    sql += ' AND (project_name LIKE ? OR notes LIKE ?)';
    params.push(`%${options.query}%`, `%${options.query}%`);
  }

  if (options.favorite !== undefined) {
    sql += ' AND favorite = ?';
    params.push(options.favorite ? 1 : 0);
  }

  if (options.archived !== undefined) {
    sql += ' AND archived = ?';
    params.push(options.archived ? 1 : 0);
  }

  if (options.collectionId) {
    sql += ' AND collection_id = ?';
    params.push(options.collectionId);
  }

  if (options.startDate) {
    sql += ' AND start_time >= ?';
    params.push(options.startDate);
  }

  if (options.endDate) {
    sql += ' AND start_time <= ?';
    params.push(options.endDate);
  }

  if (options.minCost !== undefined) {
    sql += ' AND cost >= ?';
    params.push(options.minCost);
  }

  if (options.maxCost !== undefined) {
    sql += ' AND cost <= ?';
    params.push(options.maxCost);
  }

  if (options.project) {
    sql += ' AND project_name LIKE ?';
    params.push(`%${options.project}%`);
  }

  sql += ' ORDER BY end_time DESC';

  if (options.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = database.prepare(sql).all(...params);
  return rows.map(mapRowToSession);
}

// ============================================================================
// SAVED SEARCHES
// ============================================================================

export function saveSearch(name: string, query: string, filters?: Record<string, unknown>): number {
  const database = getDatabase();
  const result = database.prepare(`
    INSERT INTO saved_searches (name, query, filters)
    VALUES (?, ?, ?)
  `).run(name, query, JSON.stringify(filters ?? {}));
  return result.lastInsertRowid as number;
}

export function getAllSavedSearches(): SavedSearch[] {
  const database = getDatabase();
  const rows = database.prepare('SELECT * FROM saved_searches ORDER BY created_at DESC').all();
  return rows.map(mapRowToSavedSearch);
}

export function deleteSavedSearch(id: number): void {
  const database = getDatabase();
  database.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
}

function mapRowToSession(row: any): Session {
  return {
    id: row.id,
    projectName: row.project_name,
    filePath: row.file_path,
    startTime: row.start_time,
    endTime: row.end_time,
    messageCount: row.message_count ?? 0,
    tokenCount: row.token_count ?? 0,
    cost: row.cost ?? 0,
    status: row.status ?? 'unknown',
    tags: row.tags,
    notes: row.notes,
    favorite: Boolean(row.favorite),
    archived: Boolean(row.archived),
    collectionId: row.collection_id,
    summary: row.summary,
    customTitle: row.custom_title,
    rating: row.rating,
    outcome: row.outcome,
    inputTokens: row.input_tokens ?? 0,
    outputTokens: row.output_tokens ?? 0,
    cacheWriteTokens: row.cache_write_tokens ?? 0,
    cacheReadTokens: row.cache_read_tokens ?? 0,
    fileMtime: row.file_mtime,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToSavedSearch(row: any): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    filters: row.filters,
    createdAt: row.created_at,
  };
}
