// ============================================================================
// PLUGIN MANAGER TYPES
// ============================================================================

// ============================================================================
// PLUGIN MANIFEST
// ============================================================================

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  repository?: string;
  commands?: string[]; // paths to command files
  skills?: string[]; // paths to skill files
  hooks?: HookConfig[]; // hook configurations
  mcpServers?: Record<string, MCPServerConfig>;
}

export interface HookConfig {
  name: string;
  eventType: 'PreToolUse' | 'PostToolUse' | 'SessionStart' | 'SessionEnd' | 'Notification' | 'Stop';
  matcher?: string;
  command: string;
  timeout?: number;
}

export interface MCPServerConfig {
  command?: string;
  url?: string;
  args?: string[];
  env?: Record<string, string>;
}

// ============================================================================
// INSTALLED PLUGIN
// ============================================================================

export interface InstalledPlugin {
  id: string; // generated from name
  name: string;
  version: string;
  description: string;
  author?: string;
  repository?: string;
  scope: 'user' | 'project';
  projectPath?: string;
  path: string; // filesystem path to plugin directory
  enabled: boolean;
  installedAt: string;
  manifest: PluginManifest;
}

// ============================================================================
// PLUGIN INSTALLATION OPTIONS
// ============================================================================

export interface InstallPluginOptions {
  scope: 'user' | 'project';
  projectPath?: string;
  enabled?: boolean;
}
