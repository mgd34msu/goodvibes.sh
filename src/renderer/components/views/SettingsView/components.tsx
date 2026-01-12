// ============================================================================
// SETTINGS VIEW - SHARED COMPONENTS
// ============================================================================

import { clsx } from 'clsx';

// ============================================================================
// SETTINGS SECTION
// ============================================================================

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider">{title}</h2>
        <div className="flex-1 h-px bg-gradient-to-r from-surface-700 to-transparent" />
      </div>
      <div className="card-elevated rounded-xl divide-y divide-surface-700/50 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// SETTING ROW
// ============================================================================

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between px-5 py-4 hover:bg-surface-800/30 transition-colors">
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-sm font-medium text-surface-100">{label}</div>
        {description && (
          <div className="text-xs text-surface-500 mt-0.5 leading-relaxed">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

// ============================================================================
// TOGGLE SWITCH
// ============================================================================

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleClick}
      className={clsx(
        'relative inline-flex flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-800',
        checked ? 'bg-primary-500 shadow-md shadow-primary-500/30' : 'bg-surface-600'
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200',
          checked ? 'translate-x-5 shadow-md' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

// ============================================================================
// SHORTCUT ROW
// ============================================================================

interface ShortcutRowProps {
  action: string;
  shortcut: string;
}

export function ShortcutRow({ action, shortcut }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 px-1 hover:bg-surface-800/20 rounded-lg transition-colors -mx-1">
      <span className="text-sm text-surface-300">{action}</span>
      <kbd className="px-2.5 py-1 text-xs font-medium bg-surface-800 border border-surface-700 rounded-md text-surface-300 shadow-sm">{shortcut}</kbd>
    </div>
  );
}
