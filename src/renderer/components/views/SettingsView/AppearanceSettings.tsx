// ============================================================================
// APPEARANCE SETTINGS SECTION
// ============================================================================

import type { AppSettings } from '../../../../shared/types';
import { SettingsSection, SettingRow } from './components';

interface AppearanceSettingsProps {
  settings: AppSettings;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function AppearanceSettings({ settings, onChange }: AppearanceSettingsProps) {
  return (
    <SettingsSection title="Appearance">
      <SettingRow
        label="Theme"
        description="Choose your preferred color scheme"
      >
        <select
          value={settings.theme}
          onChange={(e) => onChange('theme', e.target.value as 'dark' | 'light')}
          className="select w-40"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </SettingRow>

      <SettingRow
        label="Font Size"
        description="Terminal font size in pixels"
      >
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange('fontSize', Math.max(10, settings.fontSize - 1))}
            disabled={settings.fontSize <= 10}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-800 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed text-surface-300 transition-colors"
            aria-label="Decrease font size"
          >
            -
          </button>
          <span className="text-sm text-surface-200 w-12 text-center font-medium">{settings.fontSize}px</span>
          <button
            onClick={() => onChange('fontSize', Math.min(24, settings.fontSize + 1))}
            disabled={settings.fontSize >= 24}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-800 hover:bg-surface-700 disabled:opacity-50 disabled:cursor-not-allowed text-surface-300 transition-colors"
            aria-label="Increase font size"
          >
            +
          </button>
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
