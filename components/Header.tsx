import { cn } from 'cn';
import { Settings, Sun, Moon, Trash2 } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

interface HeaderProps {
  onOpenSettings: () => void;
  isSettingsOpen?: boolean;
  trashCount?: number;
  isTrashOpen?: boolean;
  onToggleTrash?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  isSettingsOpen = false,
  trashCount = 0,
  isTrashOpen = false,
  onToggleTrash,
}) => {
  const { t } = useI18n();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="border-border/60 bg-card/95 sticky top-0 z-20 flex items-center justify-between border-b px-3 py-2 backdrop-blur-xs transition-colors duration-150">
      {/* Brand Identity */}
      <div className="flex items-center gap-2">
        <img
          src="/icon/48.png"
          alt="Bookmark Otter"
          className="size-6 rounded-md object-contain select-none"
        />
        <h1 className="text-foreground text-[12.5px] font-semibold tracking-tight">
          {t('appTitle')}
        </h1>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-1.5">
        {/* Recycle Bin Header Icon + Badge */}
        {onToggleTrash && (
          <button
            type="button"
            onClick={onToggleTrash}
            title="Recycle Bin"
            aria-label="Recycle Bin"
            aria-pressed={isTrashOpen}
            className={cn(
              'relative flex h-6 cursor-pointer items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] select-none active:scale-[0.97]',
              isTrashOpen
                ? 'border-border bg-muted text-foreground'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            )}
          >
            <Trash2 className="size-3" />
            {trashCount > 0 && (
              <span
                className={cn(
                  'rounded-full px-1 py-0 text-[9px] leading-tight font-semibold',
                  isTrashOpen
                    ? 'bg-foreground/15 text-foreground'
                    : 'bg-muted-foreground/15 text-muted-foreground'
                )}
              >
                {trashCount > 99 ? '99+' : trashCount}
              </span>
            )}
          </button>
        )}

        {/* Sun / Moon Icon Pair Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? t('switchToLight') : t('switchToDark')}
          aria-label="Toggle theme"
          className="border-border/60 bg-muted/40 hover:bg-muted/70 flex h-6 cursor-pointer items-center gap-0.5 rounded-full border p-0.5 transition-[transform,background-color] duration-150 ease-[var(--ease-out)] select-none active:scale-[0.97]"
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-out)]',
              !isDark
                ? 'bg-card text-amber-500 shadow-2xs'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
          >
            <Sun className="size-3" />
          </span>
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-150 ease-[var(--ease-out)]',
              isDark
                ? 'bg-card text-sky-400 shadow-2xs'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
          >
            <Moon className="size-3" />
          </span>
        </button>

        {/* GitHub Repository Link */}
        <a
          href="https://github.com/agmmnn/bookmark-otter"
          target="_blank"
          rel="noreferrer"
          title="GitHub"
          aria-label="GitHub Repository"
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex size-6 cursor-pointer items-center justify-center rounded-md transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
        </a>

        {/* Settings Button */}
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onOpenSettings}
          title={t('settingsTooltip')}
          aria-label={t('settingsTooltip')}
          aria-pressed={isSettingsOpen}
          className={cn(
            'group size-6 cursor-pointer transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.97]',
            isSettingsOpen
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Settings className="hover-spin-gear h-3.5 w-3.5 transition-transform duration-200 ease-[var(--ease-out)]" />
        </Button>
      </div>
    </header>
  );
};
