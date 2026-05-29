import { ThemeToggle } from './ThemeToggle';
import type { Theme, ToggleOrigin } from './useTheme';
import type { ModelState } from '../model/modelGate';

interface Props {
  modelStatus: ModelState['name'];
  theme: Theme;
  onToggleTheme: (origin: ToggleOrigin) => void;
  onOpenSettings: () => void;
}

// Status indicator only; recovery actions live behind the gear.
function chipFor(status: ModelState['name']): { label: string; ready: boolean } {
  switch (status) {
    case 'ready':
      return { label: 'Model: ready ✓', ready: true };
    case 'downloading':
      return { label: 'Model: downloading…', ready: false };
    case 'probing':
      return { label: 'Model: checking…', ready: false };
    default:
      return { label: 'Model: not loaded', ready: false };
  }
}

export function TopBar({ modelStatus, theme, onToggleTheme, onOpenSettings }: Props) {
  const chip = chipFor(modelStatus);
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="wordmark">Redactyl</span>
        <span className="tagline">Strip PII from PDFs and text, entirely in your browser</span>
      </div>
      <div className="topbar-actions">
        <span className={chip.ready ? 'model-chip ready' : 'model-chip'}>{chip.label}</span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button type="button" className="icon-button" aria-label="Settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </header>
  );
}
