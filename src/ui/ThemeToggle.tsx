import type { Theme, ToggleOrigin } from './useTheme';

interface Props {
  theme: Theme;
  onToggle: (origin: ToggleOrigin) => void;
}

// Single sun/moon source of truth in the top bar. The click coordinates seed the
// View Transition's expanding circle (see useTheme).
export function ThemeToggle({ theme, onToggle }: Props) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={(e) => {
        // Keyboard activation (Enter/Space) fires a click with no pointer
        // coordinates (detail === 0, clientX/Y === 0); emanate from the button
        // itself rather than the top-left corner.
        const rect = e.currentTarget.getBoundingClientRect();
        const fromKeyboard = e.detail === 0;
        onToggle({
          x: fromKeyboard ? rect.left + rect.width / 2 : e.clientX,
          y: fromKeyboard ? rect.top + rect.height / 2 : e.clientY,
        });
      }}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
