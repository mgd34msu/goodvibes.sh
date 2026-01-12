// ============================================================================
// SKILLS VIEW - CUSTOM HOOKS
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import type { Skill, BuiltInSkill } from './types';
import { createLogger } from '../../../../shared/logger';
import { formatTimestamp } from '../../../../shared/dateUtils';

const logger = createLogger('SkillsView');

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.goodvibes.getSkills();
      // Map API response to Skill interface
      const mappedSkills: Skill[] = (result || []).map((s: Record<string, unknown>) => ({
        id: s.id as number,
        name: s.name as string,
        description: s.description as string | null,
        content: s.content as string || s.promptTemplate as string || '',
        allowedTools: s.allowedTools as string[] | null,
        scope: (s.scope as 'user' | 'project') || 'user',
        projectPath: s.projectPath as string | null,
        useCount: (s.useCount as number) || 0,
        lastUsed: s.lastUsed as string | null,
        createdAt: s.createdAt as string || formatTimestamp(),
        updatedAt: s.updatedAt as string || formatTimestamp(),
      }));
      setSkills(mappedSkills);
    } catch (error) {
      logger.error('Failed to load skills:', error);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const saveSkill = async (skillData: Partial<Skill>, projectPath: string | null) => {
    try {
      if (skillData.id) {
        await window.goodvibes.updateSkill(skillData.id, {
          name: skillData.name,
          description: skillData.description,
          promptTemplate: skillData.content,
          allowedTools: skillData.allowedTools,
          scope: skillData.scope,
          projectPath: projectPath || undefined,
        });
      } else {
        await window.goodvibes.createSkill({
          name: skillData.name || '',
          description: skillData.description || undefined,
          promptTemplate: skillData.content || '',
          isBuiltIn: false,
          scope: skillData.scope,
          projectPath: projectPath || undefined,
        });
      }
      await loadSkills();
      return { success: true };
    } catch (error) {
      logger.error('Failed to save skill:', error);
      return { success: false, error };
    }
  };

  const deleteSkill = async (id: number) => {
    try {
      await window.goodvibes.deleteSkill(id);
      await loadSkills();
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete skill:', error);
      return { success: false, error };
    }
  };

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      return { success: true };
    } catch (error) {
      logger.error('Failed to copy to clipboard:', error);
      return { success: false, error };
    }
  };

  return {
    skills,
    loading,
    loadSkills,
    saveSkill,
    deleteSkill,
    copyToClipboard,
  };
}

export function useSkillFilters(skills: Skill[], builtInSkills: BuiltInSkill[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showBuiltIn, setShowBuiltIn] = useState(true);

  const filteredSkills = skills.filter(
    (s) =>
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBuiltIn = builtInSkills.filter(
    (s) =>
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return {
    searchQuery,
    setSearchQuery,
    showBuiltIn,
    setShowBuiltIn,
    filteredSkills,
    filteredBuiltIn,
  };
}
