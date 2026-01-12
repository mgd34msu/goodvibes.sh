// ============================================================================
// SKILLS VIEW - TYPE DEFINITIONS
// ============================================================================

export interface Skill {
  id: number;
  name: string;
  description: string | null;
  content: string;
  allowedTools: string[] | null;
  scope: 'user' | 'project';
  projectPath: string | null;
  useCount: number;
  lastUsed: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BuiltInSkill = Omit<Skill, 'id' | 'useCount' | 'lastUsed' | 'createdAt' | 'updatedAt'>;

export type SkillCardSkill = Skill | (BuiltInSkill & { isBuiltIn: true });
