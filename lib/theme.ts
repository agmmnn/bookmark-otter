import { useState, useEffect } from 'react';
import { browser, type Browser } from 'wxt/browser';

export type Theme = 'light' | 'dark' | 'system';

export async function getSavedTheme(): Promise<Theme> {
  try {
    if (browser.storage?.local) {
      const data = await browser.storage.local.get('theme');
      if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system') {
        return data.theme as Theme;
      }
    }
  } catch {}

  try {
    const local = localStorage.getItem('theme');
    if (local === 'light' || local === 'dark' || local === 'system') {
      return local;
    }
  } catch {}

  return 'system';
}

export function applyTheme(theme: Theme): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const root = document.documentElement;
  const meta = document.querySelector('meta[name="color-scheme"]');

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  if (meta) {
    meta.setAttribute('content', theme === 'system' ? 'light dark' : theme);
  }

  return isDark;
}

export async function setSavedTheme(theme: Theme): Promise<void> {
  try {
    if (browser.storage?.local) {
      await browser.storage.local.set({ theme });
    }
  } catch {}

  try {
    localStorage.setItem('theme', theme);
  } catch {}

  applyTheme(theme);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedIsDark, setResolvedIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  });

  useEffect(() => {
    getSavedTheme().then((t) => {
      setThemeState(t);
      const isDark = applyTheme(t);
      setResolvedIsDark(isDark);
    });

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      getSavedTheme().then((currTheme) => {
        if (currTheme === 'system') {
          const isDark = applyTheme('system');
          setResolvedIsDark(isDark);
        }
      });
    };

    mql.addEventListener('change', handleMediaChange);

    const handleStorageChange = (changes: { [key: string]: Browser.storage.StorageChange }) => {
      if (changes.theme) {
        const nextTheme = changes.theme.newValue as Theme;
        setThemeState(nextTheme);
        const isDark = applyTheme(nextTheme);
        setResolvedIsDark(isDark);
      }
    };

    if (browser.storage?.onChanged) {
      browser.storage.onChanged.addListener(handleStorageChange);
    }

    return () => {
      mql.removeEventListener('change', handleMediaChange);
      if (browser.storage?.onChanged) {
        browser.storage.onChanged.removeListener(handleStorageChange);
      }
    };
  }, []);

  const changeTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    const isDark = applyTheme(newTheme);
    setResolvedIsDark(isDark);
    await setSavedTheme(newTheme);
  };

  const toggleTheme = async () => {
    const nextTheme: Theme = resolvedIsDark ? 'light' : 'dark';
    await changeTheme(nextTheme);
  };

  return {
    theme,
    isDark: resolvedIsDark,
    setTheme: changeTheme,
    toggleTheme,
  };
}
