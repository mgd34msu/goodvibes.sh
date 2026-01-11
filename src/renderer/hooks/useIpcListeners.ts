// ============================================================================
// IPC LISTENERS HOOK
// ============================================================================

import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useTerminalStore } from '../stores/terminalStore';
import { useQueryClient } from '@tanstack/react-query';
import type { ViewName } from '../../shared/constants';

export function useIpcListeners() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Collect cleanup functions from each listener
    const cleanups: (() => void)[] = [];

    // Menu commands - use store.getState() inside callbacks to always get current values
    cleanups.push(
      window.clausitron.onNewSession(() => {
        useAppStore.getState().openFolderPicker();
      })
    );

    cleanups.push(
      window.clausitron.onCloseTab(() => {
        const { activeTerminalId } = useTerminalStore.getState();
        if (activeTerminalId !== null) {
          useTerminalStore.getState().closeTerminal(activeTerminalId);
        }
      })
    );

    cleanups.push(
      window.clausitron.onNextTab(() => {
        useTerminalStore.getState().switchToNextTab();
      })
    );

    cleanups.push(
      window.clausitron.onPrevTab(() => {
        useTerminalStore.getState().switchToPrevTab();
      })
    );

    cleanups.push(
      window.clausitron.onSwitchView((view: string) => {
        useAppStore.getState().setCurrentView(view as ViewName);
      })
    );

    cleanups.push(
      window.clausitron.onOpenSettings(() => {
        useAppStore.getState().setCurrentView('settings');
      })
    );

    cleanups.push(
      window.clausitron.onShowAbout(() => {
        useAppStore.getState().openModal('about');
      })
    );

    // Session events
    cleanups.push(
      window.clausitron.onSessionDetected(() => {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      })
    );

    cleanups.push(
      window.clausitron.onSubagentSessionUpdate(() => {
        queryClient.invalidateQueries({ queryKey: ['live-sessions'] });
      })
    );

    // Cleanup all listeners on unmount
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [queryClient]);
}
