import { ThemeToggle } from './ThemeToggle';
import type { Theme, ToggleOrigin } from './useTheme';

interface Props {
  theme: Theme;
  onToggleTheme: (origin: ToggleOrigin) => void;
  onOpenSettings: () => void;
}

export function TopBar({ theme, onToggleTheme, onOpenSettings }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="wordmark">Redactyl</span>
        <span className="tagline">Strip PII from PDFs and text, entirely in your browser</span>
      </div>
      <div className="topbar-actions">
        {/* Status indicator only; recovery actions live behind the gear.
            Becomes stateful in slice 6 (model gate). */}
        <span className="model-chip">Model: ready ✓</span>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button type="button" className="icon-button" aria-label="Settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </header>
  );
}
