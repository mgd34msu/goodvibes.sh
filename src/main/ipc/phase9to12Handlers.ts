// ============================================================================
// PHASE 9-12 IPC HANDLERS - Re-export from modular structure
// ============================================================================
//
// This file maintains backward compatibility by re-exporting all functions
// from the modular phase9to12Handlers/ directory.
//
// ============================================================================

export {
  registerPhase9to12Handlers,
  initializePhase9to12Services,
  cleanupPhase9to12Services,
} from './phase9to12Handlers/index.js';
