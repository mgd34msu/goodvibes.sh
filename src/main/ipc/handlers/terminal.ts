// ============================================================================
// TERMINAL IPC HANDLERS
// ============================================================================

import { ipcMain } from 'electron';
import { execSync } from 'child_process';
import { Logger } from '../../services/logger.js';
import { withContext } from '../utils.js';
import {
  startTerminal,
  startPlainTerminal,
  writeToTerminal,
  resizeTerminal,
  killTerminal,
  getAllTerminals,
} from '../../services/terminalManager.js';

// ============================================================================
// TEXT EDITOR DETECTION
// ============================================================================

interface TextEditorInfo {
  name: string;
  command: string;
  available: boolean;
}

const TEXT_EDITORS: Array<{ name: string; command: string; windowsCommands?: string[] }> = [
  { name: 'Neovim', command: 'nvim', windowsCommands: ['nvim', 'nvim.exe'] },
  { name: 'Vim', command: 'vim', windowsCommands: ['vim', 'vim.exe'] },
  { name: 'Nano', command: 'nano', windowsCommands: ['nano', 'nano.exe'] },
  { name: 'VS Code', command: 'code', windowsCommands: ['code', 'code.cmd'] },
  { name: 'Emacs', command: 'emacs', windowsCommands: ['emacs', 'emacs.exe'] },
  { name: 'Helix', command: 'hx', windowsCommands: ['hx', 'hx.exe'] },
  { name: 'Micro', command: 'micro', windowsCommands: ['micro', 'micro.exe'] },
];

function checkCommandExists(command: string): boolean {
  try {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${command}` : `which ${command}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function detectAvailableEditors(): TextEditorInfo[] {
  const isWindows = process.platform === 'win32';

  return TEXT_EDITORS.map(editor => {
    let available = false;
    let command = editor.command;

    if (isWindows && editor.windowsCommands) {
      for (const cmd of editor.windowsCommands) {
        if (checkCommandExists(cmd)) {
          available = true;
          command = cmd;
          break;
        }
      }
    } else {
      available = checkCommandExists(editor.command);
    }

    return {
      name: editor.name,
      command,
      available,
    };
  });
}

function getDefaultEditor(): string | null {
  const editors = detectAvailableEditors();
  const available = editors.find(e => e.available);
  return available?.command ?? null;
}

const logger = new Logger('IPC:Terminal');

export function registerTerminalHandlers(): void {
  ipcMain.handle('start-claude', withContext('start-claude', async (_, options: { cwd?: string; name?: string; resumeSessionId?: string; sessionType?: 'user' | 'subagent' }) => {
    logger.info('IPC: start-claude received', {
      cwd: options.cwd,
      name: options.name,
      resumeSessionId: options.resumeSessionId,
      sessionType: options.sessionType
    });
    return startTerminal(options);
  }));

  ipcMain.handle('start-plain-terminal', withContext('start-plain-terminal', async (_, options: { cwd?: string; name?: string }) => {
    logger.info('IPC: start-plain-terminal received', {
      cwd: options.cwd,
      name: options.name
    });
    return startPlainTerminal(options);
  }));

  ipcMain.handle('terminal-input', withContext('terminal-input', async (_, { id, data }) => {
    writeToTerminal(id, data);
    return true;
  }));

  ipcMain.handle('terminal-resize', withContext('terminal-resize', async (_, { id, cols, rows }) => {
    resizeTerminal(id, cols, rows);
    return true;
  }));

  ipcMain.handle('kill-terminal', withContext('kill-terminal', async (_, id) => {
    return killTerminal(id);
  }));

  ipcMain.handle('get-terminals', withContext('get-terminals', async () => {
    return getAllTerminals();
  }));

  // Text editor detection
  ipcMain.handle('get-available-editors', withContext('get-available-editors', async () => {
    return detectAvailableEditors();
  }));

  ipcMain.handle('get-default-editor', withContext('get-default-editor', async () => {
    return getDefaultEditor();
  }));

  logger.info('Terminal handlers registered');
}
