export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'opencollab-theme';

export function getStoredTheme(): ThemeMode | null {
  const value = localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function resolveTheme(value?: ThemeMode | null): ThemeMode {
  if (value === 'light' || value === 'dark') return value;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

export function initTheme() {
  applyTheme(resolveTheme(getStoredTheme()));
}

export function toggleTheme(): ThemeMode {
  const next: ThemeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
