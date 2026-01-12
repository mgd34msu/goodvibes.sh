// ============================================================================
// DATABASE - Tag Operations
// ============================================================================

import { getDatabase } from './connection.js';
import { Logger } from '../services/logger.js';
import type { Tag } from '../../shared/types/index.js';
import { mapRowToTag, type TagRow } from './mappers.js';

const logger = new Logger('Database:Tags');

// ============================================================================
// TAG OPERATIONS
// ============================================================================

export function getAllTags(): Tag[] {
  const database = getDatabase();
  const rows = database.prepare('SELECT * FROM tags ORDER BY name').all() as TagRow[];
  return rows.map(mapRowToTag);
}

export function createTag(name: string, color: string): void {
  const database = getDatabase();
  try {
    database.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)').run(name, color);
  } catch (error) {
    logger.debug(`Tag '${name}' may already exist or creation failed`, { error });
  }
}

export function deleteTag(tagId: number): void {
  const database = getDatabase();
  database.prepare('DELETE FROM session_tags WHERE tag_id = ?').run(tagId);
  database.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
}

export function addTagToSession(sessionId: string, tagId: number): void {
  const database = getDatabase();
  try {
    database.prepare('INSERT OR IGNORE INTO session_tags (session_id, tag_id) VALUES (?, ?)').run(sessionId, tagId);
  } catch (error) {
    logger.debug(`Session-tag association may already exist (session: ${sessionId}, tag: ${tagId})`, { error });
  }
}

export function removeTagFromSession(sessionId: string, tagId: number): void {
  const database = getDatabase();
  database.prepare('DELETE FROM session_tags WHERE session_id = ? AND tag_id = ?').run(sessionId, tagId);
}

export function getSessionTags(sessionId: string): Tag[] {
  const database = getDatabase();
  const rows = database.prepare(`
    SELECT t.* FROM tags t
    JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ?
  `).all(sessionId) as TagRow[];
  return rows.map(mapRowToTag);
}
