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
          className="size-6 rounded-md object-contain transition-transform duration-150 select-none active:scale-90"
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
              'relative flex h-6 cursor-pointer items-center gap-1 rounded-full border px-1.5 text-[10px] font-medium transition-all duration-150 select-none active:scale-[0.97]',
              isTrashOpen
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            )}
          >
            <Trash2 className={cn('size-3', isTrashOpen && 'text-rose-500')} />
            {trashCount > 0 && (
              <span
                className={cn(
                  'rounded-full px-1 py-0 text-[9px] leading-tight font-semibold',
                  isTrashOpen
                    ? 'bg-rose-500 text-white'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
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
          className="border-border/60 bg-muted/40 hover:bg-muted/70 flex h-6 cursor-pointer items-center gap-0.5 rounded-full border p-0.5 transition-colors select-none active:scale-[0.97]"
        >
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full transition-all duration-150',
              !isDark
                ? 'bg-card text-amber-500 shadow-2xs'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
          >
            <Sun className="size-3" />
          </span>
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full transition-all duration-150',
              isDark
                ? 'bg-card text-sky-400 shadow-2xs'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            )}
          >
            <Moon className="size-3" />
          </span>
        </button>

        {/* Settings Button */}
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onOpenSettings}
          title={t('settingsTooltip')}
          aria-label={t('settingsTooltip')}
          aria-pressed={isSettingsOpen}
          className={cn(
            'group size-6 cursor-pointer transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
            isSettingsOpen
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Settings className="h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:rotate-45" />
        </Button>
      </div>
    </header>
  );
};
