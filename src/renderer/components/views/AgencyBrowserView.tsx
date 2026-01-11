// ============================================================================
// AGENCY BROWSER VIEW - Browse and activate agents/skills from agency library
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot,
  Wand2,
  Search,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Star,
  Clock,
  Play,
  Square,
  RefreshCw,
  AlertCircle,
  Book,
  Plus,
  X,
  Layers,
  Activity,
  Hash,
  Tag,
  Sparkles,
} from 'lucide-react';
import { RecommendationPanel, type Recommendation } from '../recommendations';
import { useRecommendations } from '../../hooks/useRecommendations';

// ============================================================================
// TYPES
// ============================================================================

interface AgencyCategory {
  id: number;
  name: string;
  path: string;
  parentId: number | null;
  type: 'agent' | 'skill';
  itemCount: number;
}

interface IndexedAgent {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  categoryId: number;
  categoryPath: string;
  filePath: string;
  skills: string[];
  tags: string[];
  useCount: number;
  lastUsed: string | null;
  lastIndexed: string;
}

interface IndexedSkill {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  content: string;
  categoryId: number;
  categoryPath: string;
  filePath: string;
  agentSlug: string | null;
  triggers: string[];
  tags: string[];
  useCount: number;
  lastUsed: string | null;
  lastIndexed: string;
}

interface ActiveAgent {
  id: number;
  sessionId: string | null;
  projectPath: string | null;
  agentId: number;
  priority: number;
  activatedAt: string;
  isActive: boolean;
}

interface QueuedSkill {
  id: number;
  sessionId: string | null;
  projectPath: string | null;
  skillId: number;
  priority: number;
  injected: boolean;
  queuedAt: string;
}

interface SearchResult<T> {
  item: T;
  score: number;
  matchedFields: string[];
}

type ViewMode = 'agents' | 'skills';
type FilterMode = 'all' | 'popular' | 'recent' | 'active';

// ============================================================================
// CATEGORY TREE COMPONENT
// ============================================================================

interface CategoryTreeProps {
  categories: AgencyCategory[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  viewMode: ViewMode;
}

function CategoryTree({ categories, selectedPath, onSelect, viewMode }: CategoryTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Build tree structure from flat list
  const tree = useMemo(() => {
    const typePrefix = viewMode === 'agents' ? 'agent:' : 'skill:';
    const filtered = categories.filter(c => c.path.startsWith(typePrefix));

    // Group by parent path
    const byParent = new Map<string | null, AgencyCategory[]>();
    for (const cat of filtered) {
      const pathWithoutPrefix = cat.path.replace(typePrefix, '');
      const parts = pathWithoutPrefix.split('/');
      const parentPath = parts.length > 1
        ? typePrefix + parts.slice(0, -1).join('/')
        : null;

      if (!byParent.has(parentPath)) {
        byParent.set(parentPath, []);
      }
      byParent.get(parentPath)!.push(cat);
    }

    return { byParent, typePrefix };
  }, [categories, viewMode]);

  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (category: AgencyCategory, level: number) => {
    const children = tree.byParent.get(category.path) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedPaths.has(category.path);
    const isSelected = selectedPath === category.path;

    return (
      <div key={category.id}>
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
            isSelected
              ? 'bg-accent-purple/20 text-accent-purple'
              : 'hover:bg-surface-700 text-surface-300'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onSelect(isSelected ? null : category.path)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(category.path);
              }}
              className="text-surface-500 hover:text-surface-300"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          <FolderTree className="w-4 h-4 text-surface-500" />
          <span className="flex-1 truncate text-sm">{category.name}</span>
          <span className="text-xs text-surface-500">{category.itemCount}</span>
        </div>

        {isExpanded && children.map(child => renderNode(child, level + 1))}
      </div>
    );
  };

  const rootCategories = tree.byParent.get(null) || [];

  return (
    <div className="space-y-0.5">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
          selectedPath === null
            ? 'bg-accent-purple/20 text-accent-purple'
            : 'hover:bg-surface-700 text-surface-300'
        }`}
        onClick={() => onSelect(null)}
      >
        <Layers className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">All {viewMode === 'agents' ? 'Agents' : 'Skills'}</span>
      </div>
      {rootCategories.map(cat => renderNode(cat, 0))}
    </div>
  );
}

// ============================================================================
// AGENT CARD COMPONENT
// ============================================================================

interface AgentCardProps {
  agent: IndexedAgent;
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
}

function AgentCard({ agent, isSelected, isActive, onSelect, onActivate, onDeactivate }: AgentCardProps) {
  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'bg-surface-800 border-accent-purple/50'
          : 'bg-surface-900 border-surface-700 hover:border-surface-600'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent-blue flex-shrink-0" />
            <h4 className="font-medium text-surface-100 truncate">{agent.name}</h4>
            {isActive && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                <Activity className="w-3 h-3" />
                Active
              </span>
            )}
          </div>
          {agent.description && (
            <p className="text-sm text-surface-400 mt-1 line-clamp-2">{agent.description}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            isActive ? onDeactivate() : onActivate();
          }}
          className={`p-1.5 rounded transition-colors ${
            isActive
              ? 'text-red-400 hover:bg-red-400/10'
              : 'text-green-400 hover:bg-green-400/10'
          }`}
          title={isActive ? 'Deactivate' : 'Activate'}
        >
          {isActive ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
        <span className="flex items-center gap-1">
          <Hash className="w-3 h-3" />
          {agent.useCount} uses
        </span>
        {agent.tags.length > 0 && (
          <span className="flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {agent.tags.slice(0, 3).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SKILL CARD COMPONENT
// ============================================================================

interface SkillCardProps {
  skill: IndexedSkill;
  isSelected: boolean;
  isQueued: boolean;
  onSelect: () => void;
  onQueue: () => void;
  onRemove: () => void;
}

function SkillCard({ skill, isSelected, isQueued, onSelect, onQueue, onRemove }: SkillCardProps) {
  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'bg-surface-800 border-accent-purple/50'
          : 'bg-surface-900 border-surface-700 hover:border-surface-600'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-accent-green flex-shrink-0" />
            <h4 className="font-medium text-surface-100 truncate">{skill.name}</h4>
            {isQueued && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                <Clock className="w-3 h-3" />
                Queued
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-sm text-surface-400 mt-1 line-clamp-2">{skill.description}</p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            isQueued ? onRemove() : onQueue();
          }}
          className={`p-1.5 rounded transition-colors ${
            isQueued
              ? 'text-red-400 hover:bg-red-400/10'
              : 'text-accent-green hover:bg-accent-green/10'
          }`}
          title={isQueued ? 'Remove from queue' : 'Add to queue'}
        >
          {isQueued ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex items-center gap-4 mt-2 text-xs text-surface-500">
        <span className="flex items-center gap-1">
          <Hash className="w-3 h-3" />
          {skill.useCount} uses
        </span>
        {skill.triggers.length > 0 && (
          <span className="flex items-center gap-1 truncate">
            Triggers: {skill.triggers.slice(0, 2).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// DETAIL PANEL COMPONENT
// ============================================================================

interface DetailPanelProps {
  item: IndexedAgent | IndexedSkill | null;
  type: 'agent' | 'skill';
  isActive: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

function DetailPanel({ item, type, isActive, onActivate, onDeactivate }: DetailPanelProps) {
  if (!item) {
    return (
      <div className="flex items-center justify-center h-full text-surface-500">
        <p>Select an item to view details</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-surface-700">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {type === 'agent' ? (
              <Bot className="w-6 h-6 text-accent-blue" />
            ) : (
              <Wand2 className="w-6 h-6 text-accent-green" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-surface-100">{item.name}</h2>
              <p className="text-sm text-surface-500">{item.slug}</p>
            </div>
          </div>
          <button
            onClick={isActive ? onDeactivate : onActivate}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-accent-purple text-white hover:bg-accent-purple/90'
            }`}
          >
            {isActive ? (
              <>
                <Square className="w-4 h-4" />
                {type === 'agent' ? 'Deactivate' : 'Remove'}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {type === 'agent' ? 'Activate' : 'Add to Queue'}
              </>
            )}
          </button>
        </div>

        {item.description && (
          <p className="text-surface-300 mt-3">{item.description}</p>
        )}

        {/* Meta info */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div className="flex items-center gap-1.5 text-surface-400">
            <Hash className="w-4 h-4" />
            <span>{item.useCount} uses</span>
          </div>
          {item.lastUsed && (
            <div className="flex items-center gap-1.5 text-surface-400">
              <Clock className="w-4 h-4" />
              <span>Last used {new Date(item.lastUsed).toLocaleDateString()}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-surface-400">
            <FolderTree className="w-4 h-4" />
            <span>{item.categoryPath}</span>
          </div>
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {item.tags.map(tag => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded-full bg-surface-700 text-surface-300"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Content preview */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-3">
          <Book className="w-4 h-4 text-surface-400" />
          <h3 className="text-sm font-medium text-surface-300">Content Preview</h3>
        </div>
        <div className="bg-surface-900 border border-surface-700 rounded-lg p-4 text-sm text-surface-300 font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
          {item.content.slice(0, 2000)}
          {item.content.length > 2000 && (
            <span className="text-surface-500">... (truncated)</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN AGENCY BROWSER VIEW
// ============================================================================

export default function AgencyBrowserView() {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('agents');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<IndexedAgent | IndexedSkill | null>(null);

  const [categories, setCategories] = useState<AgencyCategory[]>([]);
  const [agents, setAgents] = useState<IndexedAgent[]>([]);
  const [skills, setSkills] = useState<IndexedSkill[]>([]);
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);
  const [queuedSkills, setQueuedSkills] = useState<QueuedSkill[]>([]);

  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [indexStats, setIndexStats] = useState<{ agentCount: number; skillCount: number }>({
    agentCount: 0,
    skillCount: 0,
  });
  const [error, setError] = useState<string | null>(null);

  // Recommendations hook
  const {
    recommendations,
    isLoading: recommendationsLoading,
    error: recommendationsError,
    getForPrompt,
    accept: acceptRecommendation,
    reject: rejectRecommendation,
  } = useRecommendations({
    autoFetch: false,
  });

  // Get recommendations when search query changes
  useEffect(() => {
    if (searchQuery && searchQuery.length >= 3) {
      const debounce = setTimeout(() => {
        getForPrompt(searchQuery);
      }, 500);
      return () => clearTimeout(debounce);
    }
    return undefined;
  }, [searchQuery, getForPrompt]);

  // Handle recommendation accept
  const handleRecommendationAccept = useCallback(async (rec: Recommendation) => {
    await acceptRecommendation(rec.id);
    // Activate the agent or queue the skill
    if (rec.type === 'agent') {
      await handleActivateAgent(rec.itemId);
    } else {
      await handleQueueSkill(rec.itemId);
    }
  }, [acceptRecommendation]);

  // Handle recommendation reject
  const handleRecommendationReject = useCallback(async (rec: Recommendation) => {
    await rejectRecommendation(rec.id);
  }, [rejectRecommendation]);

  // Handle recommendation select - show in detail panel
  const handleRecommendationSelect = useCallback(async (rec: Recommendation) => {
    // Fetch the full item to show in detail panel
    if (rec.type === 'agent') {
      const agent = agents.find(a => a.id === rec.itemId);
      if (agent) {
        setSelectedItem(agent);
        setViewMode('agents');
      }
    } else {
      const skill = skills.find(s => s.id === rec.itemId);
      if (skill) {
        setSelectedItem(skill);
        setViewMode('skills');
      }
    }
  }, [agents, skills]);

  // Load initial data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Load categories
      const cats = await window.clausitron.agencyGetCategories();
      setCategories(cats || []);

      // Load items based on view mode
      if (viewMode === 'agents') {
        let agentList: IndexedAgent[];
        if (filterMode === 'popular') {
          agentList = await window.clausitron.agencyGetPopularAgents(50);
        } else if (filterMode === 'recent') {
          agentList = await window.clausitron.agencyGetRecentAgents(50);
        } else if (searchQuery) {
          const results = await window.clausitron.agencySearchAgents(searchQuery, 50);
          agentList = results.map((r: SearchResult<IndexedAgent>) => r.item);
        } else if (selectedCategory) {
          agentList = await window.clausitron.agencyGetAgentsByCategory(selectedCategory);
        } else {
          agentList = await window.clausitron.agencyGetIndexedAgents();
        }
        setAgents(agentList || []);
      } else {
        let skillList: IndexedSkill[];
        if (filterMode === 'popular') {
          skillList = await window.clausitron.agencyGetPopularSkills(50);
        } else if (filterMode === 'recent') {
          skillList = await window.clausitron.agencyGetRecentSkills(50);
        } else if (searchQuery) {
          const results = await window.clausitron.agencySearchSkills(searchQuery, 50);
          skillList = results.map((r: SearchResult<IndexedSkill>) => r.item);
        } else if (selectedCategory) {
          skillList = await window.clausitron.agencyGetSkillsByCategory(selectedCategory);
        } else {
          skillList = await window.clausitron.agencyGetIndexedSkills();
        }
        setSkills(skillList || []);
      }

      // Load active agents and queued skills
      const active = await window.clausitron.agencyGetAllActiveAgents();
      setActiveAgents(active || []);

      const queued = await window.clausitron.agencyGetPendingSkills();
      setQueuedSkills(queued || []);

      // Load index stats
      const stats = await window.clausitron.agencyIndexStatus();
      setIndexStats({
        agentCount: stats?.agentCount || 0,
        skillCount: stats?.skillCount || 0,
      });
    } catch (err) {
      const e = err as Error;
      setError(e.message);
      console.error('Failed to load agency data:', e);
    } finally {
      setLoading(false);
    }
  }, [viewMode, filterMode, searchQuery, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reindex handlers
  const handleReindex = async () => {
    setIndexing(true);
    setError(null);

    try {
      // Initialize if needed
      await window.clausitron.agencyIndexInit({
        agencyPath: 'C:\\Users\\buzzkill\\Documents\\agency', // TODO: Make configurable
      });

      // Index both agents and skills
      const agentResult = await window.clausitron.agencyIndexAgents();
      const skillResult = await window.clausitron.agencyIndexSkills();

      if (!agentResult.success || !skillResult.success) {
        const errors = [...(agentResult.errors || []), ...(skillResult.errors || [])];
        setError(`Indexing completed with errors: ${errors.join(', ')}`);
      }

      // Reload data
      await loadData();
    } catch (err) {
      const e = err as Error;
      setError(`Indexing failed: ${e.message}`);
    } finally {
      setIndexing(false);
    }
  };

  // Activation handlers
  const handleActivateAgent = async (agentId: number) => {
    try {
      await window.clausitron.agencyActivateAgent(agentId);
      await window.clausitron.agencyRecordAgentUsage(agentId);
      const active = await window.clausitron.agencyGetAllActiveAgents();
      setActiveAgents(active || []);
    } catch (err) {
      console.error('Failed to activate agent:', err);
    }
  };

  const handleDeactivateAgent = async (agentId: number) => {
    try {
      await window.clausitron.agencyDeactivateAgent(agentId);
      const active = await window.clausitron.agencyGetAllActiveAgents();
      setActiveAgents(active || []);
    } catch (err) {
      console.error('Failed to deactivate agent:', err);
    }
  };

  const handleQueueSkill = async (skillId: number) => {
    try {
      await window.clausitron.agencyQueueSkill(skillId);
      await window.clausitron.agencyRecordSkillUsage(skillId);
      const queued = await window.clausitron.agencyGetPendingSkills();
      setQueuedSkills(queued || []);
    } catch (err) {
      console.error('Failed to queue skill:', err);
    }
  };

  const handleRemoveSkill = async (queuedId: number) => {
    try {
      await window.clausitron.agencyRemoveQueuedSkill(queuedId);
      const queued = await window.clausitron.agencyGetPendingSkills();
      setQueuedSkills(queued || []);
    } catch (err) {
      console.error('Failed to remove skill:', err);
    }
  };

  // Check if item is active/queued
  const isAgentActive = (agentId: number) =>
    activeAgents.some(a => a.agentId === agentId && a.isActive);

  const getQueuedSkillId = (skillId: number) =>
    queuedSkills.find(q => q.skillId === skillId && !q.injected)?.id;

  const isSkillQueued = (skillId: number) =>
    queuedSkills.some(q => q.skillId === skillId && !q.injected);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-surface-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderTree className="w-6 h-6 text-accent-purple" />
            <div>
              <h1 className="text-xl font-semibold text-surface-100">Agency Browser</h1>
              <p className="text-sm text-surface-400">
                {indexStats.agentCount} agents, {indexStats.skillCount} skills indexed
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleReindex}
              disabled={indexing}
              className="flex items-center gap-2 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${indexing ? 'animate-spin' : ''}`} />
              {indexing ? 'Indexing...' : 'Reindex'}
            </button>
          </div>
        </div>

        {/* View mode tabs */}
        <div className="flex items-center gap-4 mt-4">
          <div className="flex bg-surface-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('agents')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                viewMode === 'agents'
                  ? 'bg-surface-700 text-surface-100'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Bot className="w-4 h-4" />
              Agents
            </button>
            <button
              onClick={() => setViewMode('skills')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${
                viewMode === 'skills'
                  ? 'bg-surface-700 text-surface-100'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Wand2 className="w-4 h-4" />
              Skills
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                filterMode === 'all'
                  ? 'bg-accent-purple/20 text-accent-purple'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('popular')}
              className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
                filterMode === 'popular'
                  ? 'bg-accent-purple/20 text-accent-purple'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Star className="w-3 h-3" />
              Popular
            </button>
            <button
              onClick={() => setFilterMode('recent')}
              className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
                filterMode === 'recent'
                  ? 'bg-accent-purple/20 text-accent-purple'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              Recent
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${viewMode}...`}
            className="w-full pl-10 pr-4 py-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:border-accent-purple"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Category sidebar */}
        <div className="w-64 border-r border-surface-800 overflow-y-auto p-4 flex-shrink-0">
          <CategoryTree
            categories={categories}
            selectedPath={selectedCategory}
            onSelect={setSelectedCategory}
            viewMode={viewMode}
          />
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto p-4 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-purple" />
            </div>
          ) : viewMode === 'agents' ? (
            agents.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-surface-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-surface-300">No agents found</h3>
                <p className="text-surface-500 mt-2">
                  Try a different search or category, or reindex the agency
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {agents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedItem?.id === agent.id}
                    isActive={isAgentActive(agent.id)}
                    onSelect={() => setSelectedItem(agent)}
                    onActivate={() => handleActivateAgent(agent.id)}
                    onDeactivate={() => handleDeactivateAgent(agent.id)}
                  />
                ))}
              </div>
            )
          ) : (
            skills.length === 0 ? (
              <div className="text-center py-12">
                <Wand2 className="w-12 h-12 text-surface-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-surface-300">No skills found</h3>
                <p className="text-surface-500 mt-2">
                  Try a different search or category, or reindex the agency
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {skills.map(skill => {
                  const queuedId = getQueuedSkillId(skill.id);
                  return (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      isSelected={selectedItem?.id === skill.id}
                      isQueued={isSkillQueued(skill.id)}
                      onSelect={() => setSelectedItem(skill)}
                      onQueue={() => handleQueueSkill(skill.id)}
                      onRemove={() => queuedId && handleRemoveSkill(queuedId)}
                    />
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Detail panel */}
        <div className="w-96 border-l border-surface-800 flex-shrink-0 flex flex-col">
          {selectedItem ? (
            <DetailPanel
              item={selectedItem}
              type={viewMode === 'agents' ? 'agent' : 'skill'}
              isActive={
                viewMode === 'agents'
                  ? isAgentActive(selectedItem.id)
                  : isSkillQueued(selectedItem.id)
              }
              onActivate={() => {
                if (viewMode === 'agents') {
                  handleActivateAgent(selectedItem.id);
                } else {
                  handleQueueSkill(selectedItem.id);
                }
              }}
              onDeactivate={() => {
                if (viewMode === 'agents') {
                  handleDeactivateAgent(selectedItem.id);
                } else {
                  const queuedId = getQueuedSkillId(selectedItem.id);
                  if (queuedId) handleRemoveSkill(queuedId);
                }
              }}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Recommendations Panel */}
              {(recommendations.length > 0 || recommendationsLoading || searchQuery.length >= 3) && (
                <RecommendationPanel
                  recommendations={recommendations}
                  title={searchQuery ? `Suggestions for "${searchQuery.slice(0, 30)}..."` : 'Recommended'}
                  isLoading={recommendationsLoading}
                  error={recommendationsError}
                  onAccept={handleRecommendationAccept}
                  onReject={handleRecommendationReject}
                  onSelect={handleRecommendationSelect}
                  compact={false}
                  maxInitial={5}
                  collapsible={true}
                  defaultCollapsed={false}
                />
              )}

              {/* Empty state when no recommendations and no search */}
              {recommendations.length === 0 && !recommendationsLoading && searchQuery.length < 3 && (
                <div className="flex flex-col items-center justify-center h-64 text-surface-500">
                  <Sparkles className="w-12 h-12 mb-4 opacity-50" />
                  <h3 className="text-lg font-medium text-surface-300 mb-2">
                    Smart Recommendations
                  </h3>
                  <p className="text-sm text-center px-4">
                    Start typing in the search box to get personalized agent and skill recommendations
                  </p>
                </div>
              )}

              {/* Active agents summary */}
              {activeAgents.length > 0 && (
                <div className="mt-4 p-4 bg-surface-800/50 rounded-lg border border-surface-700">
                  <h3 className="text-sm font-medium text-surface-200 mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    Active Agents ({activeAgents.length})
                  </h3>
                  <div className="space-y-2">
                    {activeAgents.slice(0, 5).map(active => {
                      const agent = agents.find(a => a.id === active.agentId);
                      return agent ? (
                        <div
                          key={active.id}
                          className="flex items-center justify-between p-2 bg-surface-900 rounded text-sm"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Bot className="w-4 h-4 text-accent-blue flex-shrink-0" />
                            <span className="truncate text-surface-200">{agent.name}</span>
                          </div>
                          <button
                            onClick={() => handleDeactivateAgent(agent.id)}
                            className="p-1 text-red-400 hover:bg-red-400/10 rounded"
                            title="Deactivate"
                          >
                            <Square className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null;
                    })}
                    {activeAgents.length > 5 && (
                      <p className="text-xs text-surface-500 text-center">
                        +{activeAgents.length - 5} more active
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Queued skills summary */}
              {queuedSkills.filter(q => !q.injected).length > 0 && (
                <div className="mt-4 p-4 bg-surface-800/50 rounded-lg border border-surface-700">
                  <h3 className="text-sm font-medium text-surface-200 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-yellow-400" />
                    Queued Skills ({queuedSkills.filter(q => !q.injected).length})
                  </h3>
                  <div className="space-y-2">
                    {queuedSkills.filter(q => !q.injected).slice(0, 5).map(queued => {
                      const skill = skills.find(s => s.id === queued.skillId);
                      return skill ? (
                        <div
                          key={queued.id}
                          className="flex items-center justify-between p-2 bg-surface-900 rounded text-sm"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Wand2 className="w-4 h-4 text-accent-green flex-shrink-0" />
                            <span className="truncate text-surface-200">{skill.name}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveSkill(queued.id)}
                            className="p-1 text-red-400 hover:bg-red-400/10 rounded"
                            title="Remove"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
