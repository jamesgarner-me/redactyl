import { useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'dark' | 'light';

const KEY = 'redactyl-theme';

// Dark by default, independent of OS prefers-color-scheme. An inline script in
// index.html applies the stored theme before first paint to avoid a flash; this
// hook keeps React state in sync and persists explicit choices.
function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export interface ToggleOrigin {
  x: number;
  y: number;
}

export function useTheme(): [Theme, (origin: ToggleOrigin) => void] {
  const [theme, setTheme] = useState<Theme>(storedTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* persistence is best-effort */
    }
  }, [theme]);

  // The View Transition reveals the new theme with a clip-path circle expanding
  // from the toggle's screen coordinates. Reduced-motion and browsers without
  // startViewTransition fall back to an instant swap.
  const toggle = useCallback((origin: ToggleOrigin) => {
    const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    const commit = () => {
      applyTheme(next);
      setTheme(next);
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !document.startViewTransition) {
      commit();
      return;
    }
    const radius = Math.hypot(
      Math.max(origin.x, window.innerWidth - origin.x),
      Math.max(origin.y, window.innerHeight - origin.y),
    );
    const root = document.documentElement;
    root.style.setProperty('--tx', `${origin.x}px`);
    root.style.setProperty('--ty', `${origin.y}px`);
    root.style.setProperty('--r', `${radius}px`);
    document.startViewTransition(() => flushSync(commit));
  }, []);

  return [theme, toggle];
}
