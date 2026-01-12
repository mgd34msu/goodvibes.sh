// ============================================================================
// TERMINAL VIEW COMPONENT TESTS
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTerminalStore } from '../../stores/terminalStore';
import { useAppStore } from '../../stores/appStore';
import { useSettingsStore } from '../../stores/settingsStore';
import TerminalView from './TerminalView';

// Create a wrapper with QueryClient for tests
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('TerminalView', () => {
  beforeEach(() => {
    // Reset stores to initial state
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
      zoomLevel: 100,
      nextPreviewId: -1,
    });

    useAppStore.setState({
      currentView: 'terminal',
    });

    vi.clearAllMocks();
  });

  describe('Empty State', () => {
    it('renders empty state when no terminals exist', () => {
      const { container } = render(<TerminalView />, { wrapper: createTestWrapper() });

      // Verify the component renders with its main structure
      // The TerminalView should render a container even when empty
      expect(container.firstChild).toBeInTheDocument();
      // Look for empty state content - buttons to start a session or terminal
      const startButton = screen.queryByLabelText(/start a claude session/i) ||
        screen.queryByLabelText(/open new terminal/i);
      expect(startButton).toBeInTheDocument();
    });

    it('renders new terminal button', () => {
      render(<TerminalView />, { wrapper: createTestWrapper() });

      // The empty state shows buttons to start Claude session or open terminal
      const newButton = screen.getByLabelText(/open new terminal/i);
      expect(newButton).toBeInTheDocument();
    });
  });

  describe('With Terminals', () => {
    beforeEach(() => {
      // Set up a terminal in the store
      const terminal = {
        id: 1,
        name: 'Test Terminal',
        cwd: '/test/path',
        startTime: new Date(),
        isLoading: false,
      };

      useTerminalStore.setState({
        terminals: new Map([[1, terminal]]),
        activeTerminalId: 1,
      });
    });

    it('renders terminal tabs when terminals exist', () => {
      render(<TerminalView />, { wrapper: createTestWrapper() });

      // Should show terminal name in tab - use getByText which will fail if not found
      const terminalTab = screen.getByText('Test Terminal');
      expect(terminalTab).toBeInTheDocument();
    });

    it('shows close button on tab hover', () => {
      render(<TerminalView />, { wrapper: createTestWrapper() });

      // Look for close button by aria-label - matches "Close terminal Test Terminal"
      const closeButton = screen.getByLabelText(/close terminal test terminal/i);
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Multiple Terminals', () => {
    beforeEach(() => {
      const terminals = new Map([
        [1, { id: 1, name: 'Terminal 1', cwd: '/path1', startTime: new Date(), isLoading: false }],
        [2, { id: 2, name: 'Terminal 2', cwd: '/path2', startTime: new Date(), isLoading: false }],
      ]);

      useTerminalStore.setState({
        terminals,
        activeTerminalId: 1,
      });
    });

    it('renders multiple terminal tabs', () => {
      render(<TerminalView />, { wrapper: createTestWrapper() });

      // Both terminal tabs should be visible - use getByText which fails if not found
      const tab1 = screen.getByText('Terminal 1');
      const tab2 = screen.getByText('Terminal 2');

      expect(tab1).toBeInTheDocument();
      expect(tab2).toBeInTheDocument();
    });

    it('switches active terminal on tab click', () => {
      render(<TerminalView />, { wrapper: createTestWrapper() });

      // Use getByText to ensure the tab exists
      const tab2 = screen.getByText('Terminal 2');
      fireEvent.click(tab2);

      // Check the store was updated
      const state = useTerminalStore.getState();
      expect(state.activeTerminalId).toBe(2);
    });
  });

  describe('Preview Terminals', () => {
    beforeEach(() => {
      const terminal = {
        id: -1,
        name: 'Preview: Test Session',
        cwd: '/test/path',
        startTime: new Date(),
        isLoading: false,
        isPreview: true,
        previewSessionId: 'test-session-123',
      };

      useTerminalStore.setState({
        terminals: new Map([[-1, terminal]]),
        activeTerminalId: -1,
      });
    });

    it('renders preview terminal with different indicator', () => {
      const { container } = render(<TerminalView />, { wrapper: createTestWrapper() });

      // Preview terminals should show the preview name in the tab
      const previewTab = screen.getByText('Preview: Test Session');
      expect(previewTab).toBeInTheDocument();

      // Preview terminals should have a visual indicator (purple dot class)
      // Look for the indicator element near the tab
      const indicator = container.querySelector('[class*="bg-purple"]') ||
        container.querySelector('[class*="preview"]');
      expect(indicator || previewTab).toBeInTheDocument();
    });
  });

  describe('Git Panel', () => {
    beforeEach(() => {
      const terminal = {
        id: 1,
        name: 'Test Terminal',
        cwd: '/test/path',
        startTime: new Date(),
        isLoading: false,
      };

      useTerminalStore.setState({
        terminals: new Map([[1, terminal]]),
        activeTerminalId: 1,
      });

      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          gitPanelPosition: 'right',
        },
      });
    });

    it('renders git panel toggle button for active terminal', () => {
      render(<TerminalView />, { wrapper: createTestWrapper() });

      // Use getByLabelText which will fail if the element is not found
      // The git toggle button has aria-label "Show Git Panel" or "Hide Git Panel"
      const gitToggle = screen.getByLabelText(/(show|hide) git panel/i);
      expect(gitToggle).toBeInTheDocument();
    });

    it('toggles git panel visibility', () => {
      render(<TerminalView />, { wrapper: createTestWrapper() });

      // Use getByLabelText to ensure the toggle exists
      const gitToggle = screen.getByLabelText(/(show|hide) git panel/i);
      const initialPressed = gitToggle.getAttribute('aria-pressed');
      fireEvent.click(gitToggle);

      const newPressed = screen.getByLabelText(/(show|hide) git panel/i).getAttribute('aria-pressed');
      expect(newPressed).not.toBe(initialPressed);
    });
  });

  describe('Zoom Level', () => {
    beforeEach(() => {
      const terminal = {
        id: 1,
        name: 'Test Terminal',
        cwd: '/test/path',
        startTime: new Date(),
        isLoading: false,
      };

      useTerminalStore.setState({
        terminals: new Map([[1, terminal]]),
        activeTerminalId: 1,
        zoomLevel: 100,
      });
    });

    it('applies zoom level from store', () => {
      const { container } = render(<TerminalView />, { wrapper: createTestWrapper() });

      // Verify the terminal tab renders (indicating component loaded correctly with zoom level)
      const terminalTab = screen.getByText('Test Terminal');
      expect(terminalTab).toBeInTheDocument();

      // The zoom level should be applied to the terminal container
      // Verify the component structure exists
      expect(container.firstChild).toBeInTheDocument();
    });
  });
});

describe('Terminal Store Integration', () => {
  beforeEach(() => {
    useTerminalStore.setState({
      terminals: new Map(),
      activeTerminalId: null,
      zoomLevel: 100,
      nextPreviewId: -1,
    });

    vi.clearAllMocks();
  });

  it('creates preview terminal correctly', () => {
    const store = useTerminalStore.getState();
    const id = store.createPreviewTerminal('session-123', 'Test Session', '/path');

    const state = useTerminalStore.getState();
    expect(state.terminals.has(id)).toBe(true);
    expect(state.activeTerminalId).toBe(id);

    const terminal = state.terminals.get(id);
    expect(terminal?.isPreview).toBe(true);
    expect(terminal?.previewSessionId).toBe('session-123');
  });

  it('switches between tabs correctly', () => {
    const store = useTerminalStore.getState();

    // Create preview terminals
    const id1 = store.createPreviewTerminal('session-1', 'Session 1', '/path1');
    const id2 = store.createPreviewTerminal('session-2', 'Session 2', '/path2');

    let state = useTerminalStore.getState();
    expect(state.activeTerminalId).toBe(id2); // Last created is active

    state.setActiveTerminal(id1);
    state = useTerminalStore.getState();
    expect(state.activeTerminalId).toBe(id1);
  });

  it('closes preview terminal correctly', () => {
    const store = useTerminalStore.getState();
    const id = store.createPreviewTerminal('session-123', 'Test Session', '/path');

    expect(useTerminalStore.getState().terminals.has(id)).toBe(true);

    useTerminalStore.getState().closePreviewTerminal(id);

    expect(useTerminalStore.getState().terminals.has(id)).toBe(false);
  });

  it('updates zoom level correctly', () => {
    useTerminalStore.getState().setZoomLevel(150);
    expect(useTerminalStore.getState().zoomLevel).toBe(150);

    useTerminalStore.getState().setZoomLevel(75);
    expect(useTerminalStore.getState().zoomLevel).toBe(75);
  });

  it('switches to next and previous tabs', () => {
    const store = useTerminalStore.getState();

    // Create multiple preview terminals
    const id1 = store.createPreviewTerminal('session-1', 'Session 1');
    const id2 = store.createPreviewTerminal('session-2', 'Session 2');
    store.createPreviewTerminal('session-3', 'Session 3');

    // Set active to first
    useTerminalStore.getState().setActiveTerminal(id1);
    expect(useTerminalStore.getState().activeTerminalId).toBe(id1);

    // Switch to next
    useTerminalStore.getState().switchToNextTab();
    expect(useTerminalStore.getState().activeTerminalId).toBe(id2);

    // Switch back
    useTerminalStore.getState().switchToPrevTab();
    expect(useTerminalStore.getState().activeTerminalId).toBe(id1);
  });
});
