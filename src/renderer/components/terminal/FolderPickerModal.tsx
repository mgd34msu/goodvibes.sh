// ============================================================================
// FOLDER PICKER MODAL - Select project folder for new terminal session
// ============================================================================

import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { useTerminalStore } from '../../stores/terminalStore';

// ============================================================================
// TYPES
// ============================================================================

interface RecentProject {
  path: string;
  name: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FolderPickerModal() {
  const isOpen = useAppStore((s) => s.isFolderPickerOpen);
  const close = useAppStore((s) => s.closeFolderPicker);
  const createTerminal = useTerminalStore((s) => s.createTerminal);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  // Load recent projects when modal opens
  useEffect(() => {
    if (isOpen) {
      window.clausitron.getRecentProjects().then(setRecentProjects);
    }
  }, [isOpen]);

  const handleSelectFolder = async () => {
    const folder = await window.clausitron.selectFolder();
    if (folder) {
      setSelectedFolder(folder);
    }
  };

  const handleStart = async () => {
    if (!selectedFolder) return;

    const name = selectedFolder.split(/[/\\]/).pop() || 'Terminal';
    await createTerminal(selectedFolder, name);
    setSelectedFolder(null);
    close();
  };

  const handleClose = () => {
    setSelectedFolder(null);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && selectedFolder) {
      handleStart();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal active"
      onClick={handleClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-picker-title"
    >
      <div
        className="modal-content modal-medium"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="folder-picker-title">Select Project Folder</h2>
          <button
            onClick={handleClose}
            className="modal-close"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body folder-picker">
          {/* Recent Projects */}
          {recentProjects.length > 0 && (
            <div className="recent-projects-section">
              <div className="section-header">
                <span className="section-title">Recent Projects</span>
              </div>
              <div className="recent-projects-list" role="listbox" aria-label="Recent projects">
                {recentProjects.slice(0, 5).map((project) => (
                  <button
                    key={project.path}
                    onClick={() => setSelectedFolder(project.path)}
                    role="option"
                    aria-selected={selectedFolder === project.path}
                    className={clsx(
                      'template-option',
                      selectedFolder === project.path && 'bg-primary-500/20'
                    )}
                  >
                    <span className="template-icon" aria-hidden="true">folder</span>
                    <div className="template-info">
                      <span className="template-label">{project.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Browse */}
          <div>
            <div className="section-header">
              <span className="section-title">Browse</span>
            </div>
            <button
              onClick={handleSelectFolder}
              className="folder-option"
              style={{ borderStyle: 'dashed' }}
            >
              <span className="folder-icon" aria-hidden="true">folder_open</span>
              <span className="folder-label">Open Folder</span>
              <span className="folder-desc">Select an existing project directory</span>
            </button>
          </div>

          {/* Selected Folder */}
          {selectedFolder && (
            <div className="selected-folder" aria-live="polite">
              <div>
                <div className="text-xs text-surface-500 mb-1">Selected:</div>
                <div className="folder-path">{selectedFolder}</div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="modal-footer">
          <button onClick={handleClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!selectedFolder}
            className="btn btn-primary"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}

export default FolderPickerModal;
