import { ThemeToggle } from './ThemeToggle';
import type { Theme, ToggleOrigin } from './useTheme';

interface Props {
  theme: Theme;
  onToggleTheme: (origin: ToggleOrigin) => void;
  onOpenSettings: () => void;
  onHome: () => void;
}

export function TopBar({ theme, onToggleTheme, onOpenSettings, onHome }: Props) {
  return (
    <header className="topbar">
      <button type="button" className="topbar-brand" onClick={onHome} aria-label="Redactyl home, start over">
        <span className="wordmark">Redactyl</span>
        <span className="tagline">Remove personal data from PDFs and text, entirely in your browser</span>
      </button>
      <div className="topbar-actions">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button type="button" className="icon-button" aria-label="Settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>
    </header>
  );
}
