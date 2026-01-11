// ============================================================================
// TERMINAL FOOTER - Zoom controls and session info
// ============================================================================

import { useMemo } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';

// ============================================================================
// COMPONENT
// ============================================================================

export function TerminalFooter() {
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const activeTerminal = useMemo(
    () => activeTerminalId ? terminalsMap.get(activeTerminalId) : undefined,
    [terminalsMap, activeTerminalId]
  );
  const zoomLevel = useTerminalStore((s) => s.zoomLevel);
  const setZoomLevel = useTerminalStore((s) => s.setZoomLevel);

  const handleZoomIn = () => setZoomLevel(zoomLevel + 10);
  const handleZoomOut = () => setZoomLevel(zoomLevel - 10);
  const handleZoomReset = () => setZoomLevel(100);

  return (
    <div className="terminal-footer">
      <div className="session-info">
        <span>{activeTerminal?.cwd || 'No folder selected'}</span>
      </div>

      <div className="zoom-controls" role="group" aria-label="Zoom controls">
        <button
          onClick={handleZoomOut}
          className="zoom-btn"
          title="Zoom Out"
          aria-label="Zoom out"
        >
          -
        </button>
        <span id="zoom-level" aria-live="polite">{zoomLevel}%</span>
        <button
          onClick={handleZoomIn}
          className="zoom-btn"
          title="Zoom In"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomReset}
          className="zoom-btn zoom-reset"
          title="Reset Zoom"
          aria-label="Reset zoom to 100%"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export default TerminalFooter;
