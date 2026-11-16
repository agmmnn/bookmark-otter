import { cn } from 'cn';
import { Settings, Sun, Moon } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

interface HeaderProps {
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenSettings }) => {
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
          className="group text-muted-foreground hover:text-foreground size-6 cursor-pointer transition-[transform,background-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
        >
          <Settings className="h-3.5 w-3.5 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:rotate-45" />
        </Button>
      </div>
    </header>
  );
};
