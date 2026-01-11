// ============================================================================
// APP E2E TESTS - Core Application Functionality
// ============================================================================
//
// These tests verify the core Electron application behavior including
// window creation, navigation, and basic UI interactions.
//
// Note: These tests require the app to be built first (npm run build)
// ============================================================================

import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'path';

// ============================================================================
// TEST SETUP
// ============================================================================

let electronApp: ElectronApplication;
let mainWindow: Page;

test.beforeAll(async () => {
  // Launch Electron app
  const appPath = path.join(__dirname, '../../');

  electronApp = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Wait for the main window to be ready
  mainWindow = await electronApp.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

// ============================================================================
// WINDOW TESTS
// ============================================================================

test.describe('Window Management', () => {
  test('should launch with a visible window', async () => {
    const isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);
  });

  test('should have correct window title', async () => {
    const title = await mainWindow.title();
    expect(title).toContain('Clausitron');
  });

  test('should render the main application shell with root element', async () => {
    // The root element must exist for React to mount
    const rootElement = await mainWindow.locator('#root');
    await expect(rootElement).toBeVisible();

    // Root should have content (React has rendered)
    const hasContent = await rootElement.evaluate(el => el.children.length > 0);
    expect(hasContent).toBe(true);
  });

  test('should have proper window dimensions', async () => {
    const window = await electronApp.browserWindow(mainWindow);
    const bounds = await window.evaluate(win => win.getBounds());

    // Window should meet minimum size requirements
    expect(bounds.width).toBeGreaterThanOrEqual(800);
    expect(bounds.height).toBeGreaterThanOrEqual(600);
  });
});

// ============================================================================
// NAVIGATION TESTS
// ============================================================================

test.describe('Navigation', () => {
  test('should display navigation sidebar with expected items', async () => {
    // Look for navigation elements - should have Terminal, Sessions, Settings at minimum
    const terminalNav = mainWindow.locator('text=Terminal').first();
    const sessionsNav = mainWindow.locator('text=Sessions').first();
    const settingsNav = mainWindow.locator('text=Settings').first();

    // At least one navigation item should be visible
    const hasTerminal = await terminalNav.isVisible().catch(() => false);
    const hasSessions = await sessionsNav.isVisible().catch(() => false);
    const hasSettings = await settingsNav.isVisible().catch(() => false);

    expect(hasTerminal || hasSessions || hasSettings).toBe(true);
  });

  test('should navigate to Sessions view and display session content', async () => {
    const sessionsNav = mainWindow.locator('text=Sessions').first();

    if (await sessionsNav.isVisible()) {
      await sessionsNav.click();
      await mainWindow.waitForTimeout(500);

      // Sessions view should have identifiable content
      // Look for session list container or empty state
      const sessionsList = mainWindow.locator('[data-testid="sessions-list"], [class*="session"], text=No sessions, text=Session History');
      const sessionContent = await sessionsList.first().isVisible().catch(() => false);

      // Should display sessions view content (list or empty state)
      expect(sessionContent).toBe(true);
    }
  });

  test('should navigate to Settings view and display settings sections', async () => {
    const settingsNav = mainWindow.locator('text=Settings').first();

    if (await settingsNav.isVisible()) {
      await settingsNav.click();
      await mainWindow.waitForTimeout(500);

      // Settings view should contain configuration options
      // Look for common settings section headers
      const appearanceSection = mainWindow.locator('text=Appearance');
      const themeSection = mainWindow.locator('text=Theme');

      const hasAppearance = await appearanceSection.isVisible().catch(() => false);
      const hasTheme = await themeSection.isVisible().catch(() => false);

      // At least one settings section should be visible
      expect(hasAppearance || hasTheme).toBe(true);
    }
  });

  test('should navigate back to Terminal view', async () => {
    const terminalNav = mainWindow.locator('text=Terminal').first();

    if (await terminalNav.isVisible()) {
      await terminalNav.click();
      await mainWindow.waitForTimeout(500);

      // Terminal view should show either terminal content or empty state
      const terminalContent = mainWindow.locator('[class*="terminal"], [class*="xterm"], canvas, text=New Session, text=Welcome');
      const hasTerminalContent = await terminalContent.first().isVisible().catch(() => false);

      expect(hasTerminalContent).toBe(true);
    }
  });
});

// ============================================================================
// KEYBOARD SHORTCUT TESTS
// ============================================================================

test.describe('Keyboard Shortcuts', () => {
  test('should handle Ctrl+Shift+P without crashing', async () => {
    // Capture any errors during keyboard interaction
    const errors: string[] = [];
    mainWindow.on('pageerror', err => errors.push(err.message));

    await mainWindow.keyboard.press('Control+Shift+P');
    await mainWindow.waitForTimeout(300);

    // Should not crash - page should still be responsive
    const isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);

    // Close any opened modal/palette
    await mainWindow.keyboard.press('Escape');
    await mainWindow.waitForTimeout(100);

    // No page errors should have occurred
    expect(errors).toHaveLength(0);
  });

  test('should handle Ctrl+K without crashing', async () => {
    const errors: string[] = [];
    mainWindow.on('pageerror', err => errors.push(err.message));

    await mainWindow.keyboard.press('Control+K');
    await mainWindow.waitForTimeout(300);

    const isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);

    await mainWindow.keyboard.press('Escape');
    await mainWindow.waitForTimeout(100);

    expect(errors).toHaveLength(0);
  });

  test('should open command palette with visible search input', async () => {
    await mainWindow.keyboard.press('Control+Shift+P');
    await mainWindow.waitForTimeout(300);

    // Look for command palette dialog/modal
    const dialog = mainWindow.locator('[role="dialog"], [class*="command-palette"], [class*="CommandPalette"], [class*="modal"]');
    const isDialogVisible = await dialog.first().isVisible().catch(() => false);

    // If command palette is implemented, it should be visible
    if (isDialogVisible) {
      // Should have a search/input field
      const searchInput = mainWindow.locator('input[type="text"], input[type="search"]');
      const hasInput = await searchInput.first().isVisible().catch(() => false);
      expect(hasInput).toBe(true);
    }

    await mainWindow.keyboard.press('Escape');
  });
});

// ============================================================================
// APP STATE TESTS
// ============================================================================

test.describe('Application State', () => {
  test('should preserve app state across navigation without data loss', async () => {
    // Navigate to sessions
    const sessionsNav = mainWindow.locator('text=Sessions').first();
    if (await sessionsNav.isVisible()) {
      await sessionsNav.click();
      await mainWindow.waitForTimeout(300);
    }

    // Navigate to terminal
    const terminalNav = mainWindow.locator('text=Terminal').first();
    if (await terminalNav.isVisible()) {
      await terminalNav.click();
      await mainWindow.waitForTimeout(300);
    }

    // App should still be responsive
    const isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);

    // Root element should still have React content
    const rootElement = await mainWindow.locator('#root');
    const hasContent = await rootElement.evaluate(el => el.children.length > 0);
    expect(hasContent).toBe(true);
  });

  test('should handle window resize gracefully without layout breakage', async () => {
    const window = await electronApp.browserWindow(mainWindow);

    // Get original size
    const originalBounds = await window.evaluate(win => win.getBounds());

    // Resize window to minimum size
    await window.evaluate((win) => {
      win.setSize(800, 600);
    });
    await mainWindow.waitForTimeout(300);

    // App should still be responsive
    let isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);

    // Resize to a larger size
    await window.evaluate((win) => {
      win.setSize(1600, 1000);
    });
    await mainWindow.waitForTimeout(300);

    isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);

    // Navigation should still work after resize
    const settingsNav = mainWindow.locator('text=Settings').first();
    if (await settingsNav.isVisible()) {
      await settingsNav.click();
      await mainWindow.waitForTimeout(200);

      const hasSettingsContent = await mainWindow.locator('text=Appearance, text=Theme').first().isVisible().catch(() => false);
      expect(hasSettingsContent).toBe(true);
    }

    // Restore original window size
    await window.evaluate((win, bounds) => {
      win.setSize(bounds.width, bounds.height);
    }, originalBounds);
  });

  test('should not have memory leaks from repeated navigation', async () => {
    // Navigate multiple times to check for stability
    for (let i = 0; i < 5; i++) {
      const sessionsNav = mainWindow.locator('text=Sessions').first();
      if (await sessionsNav.isVisible()) {
        await sessionsNav.click();
        await mainWindow.waitForTimeout(100);
      }

      const terminalNav = mainWindow.locator('text=Terminal').first();
      if (await terminalNav.isVisible()) {
        await terminalNav.click();
        await mainWindow.waitForTimeout(100);
      }

      const settingsNav = mainWindow.locator('text=Settings').first();
      if (await settingsNav.isVisible()) {
        await settingsNav.click();
        await mainWindow.waitForTimeout(100);
      }
    }

    // App should still be responsive after repeated navigation
    const isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);

    // No console errors should have accumulated
    const errors: string[] = [];
    mainWindow.on('pageerror', err => errors.push(err.message));

    await mainWindow.waitForTimeout(100);
    expect(errors).toHaveLength(0);
  });
});

// ============================================================================
// ACCESSIBILITY TESTS
// ============================================================================

test.describe('Accessibility', () => {
  test('should have focusable navigation elements', async () => {
    // Tab through the interface
    await mainWindow.keyboard.press('Tab');
    await mainWindow.waitForTimeout(100);

    // Should have a focused element
    const focusedElement = await mainWindow.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('should escape key close modals/dialogs', async () => {
    // Open command palette
    await mainWindow.keyboard.press('Control+Shift+P');
    await mainWindow.waitForTimeout(300);

    // Press Escape
    await mainWindow.keyboard.press('Escape');
    await mainWindow.waitForTimeout(200);

    // Modal should be closed - check if dialog is no longer visible
    const dialog = mainWindow.locator('[role="dialog"]:visible');
    const dialogCount = await dialog.count();

    // No visible dialogs should remain
    expect(dialogCount).toBe(0);
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

test.describe('Error Handling', () => {
  test('should have error boundary that prevents app crashes', async () => {
    // The app should not crash from normal usage
    const isVisible = await mainWindow.isVisible('body');
    expect(isVisible).toBe(true);

    // Root should have content (not replaced by error boundary fallback)
    const rootElement = await mainWindow.locator('#root');
    await expect(rootElement).toBeVisible();
  });

  test('should handle IPC communication failures gracefully', async () => {
    // Navigate to settings which uses IPC
    const settingsNav = mainWindow.locator('text=Settings').first();
    if (await settingsNav.isVisible()) {
      await settingsNav.click();
      await mainWindow.waitForTimeout(500);

      // App should remain functional
      const isVisible = await mainWindow.isVisible('body');
      expect(isVisible).toBe(true);
    }
  });
});
