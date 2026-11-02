import { Settings, RotateCcw, Globe, Sun, Moon } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useI18n, type Language } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import type { TreeSnapshot } from '@/types';

interface HeaderProps {
  onOpenSettings: () => void;
  latestSnapshot: TreeSnapshot | null;
  onUndo: () => void;
  isUndoing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  latestSnapshot,
  onUndo,
  isUndoing = false,
}) => {
  const { lang, setLang, t } = useI18n();
  const { isDark, toggleTheme } = useTheme();

  const toggleLanguage = () => {
    const next: Language = lang === 'en' ? 'tr' : 'en';
    setLang(next);
  };

  return (
    <header className="border-border/60 bg-card/80 sticky top-0 z-20 flex items-center justify-between border-b px-3 py-2 backdrop-blur-md transition-colors duration-150">
      {/* Brand Identity */}
      <div className="flex items-center gap-2">
        <img
          src="/logo.png"
          alt="Bookmark Otter"
          className="size-6 rounded-md object-contain transition-transform duration-150 select-none active:scale-90"
        />
        <div className="flex items-center gap-1.5">
          <h1 className="text-foreground text-[12.5px] font-semibold tracking-tight">
            {t('appTitle')}
          </h1>
          <Badge
            variant="secondary"
            className="bg-primary/10 text-primary border-primary/20 h-3.5 px-1 py-0 text-[9px] font-medium tracking-wide"
          >
            {t('copilotBadge')}
          </Badge>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-1">
        {/* Undo button - only appears when a snapshot exists */}
        {latestSnapshot && (
          <Button
            size="xs"
            variant="outline"
            className="animate-in fade-in-0 zoom-in-95 h-6 cursor-pointer gap-1 border-amber-300 bg-amber-500/10 px-2 text-[10.5px] font-medium text-amber-600 transition-all duration-150 hover:bg-amber-500/20 active:scale-[0.97] dark:border-amber-800/80 dark:text-amber-400"
            onClick={onUndo}
            disabled={isUndoing}
            title={`${t('undoTooltip')}: ${latestSnapshot.description}`}
          >
            <RotateCcw className={`h-3 w-3 ${isUndoing ? 'animate-spin' : ''}`} />
            <span>{t('undoBtn')}</span>
          </Button>
        )}

        {/* Language Switcher */}
        <Button
          size="xs"
          variant="ghost"
          onClick={toggleLanguage}
          title={`Change Language (${lang.toUpperCase()})`}
          className="text-muted-foreground hover:text-foreground h-6 cursor-pointer gap-1 rounded-md px-1.5 text-[10px] font-medium transition-all duration-150 active:scale-[0.97]"
        >
          <Globe className="text-muted-foreground/80 h-3 w-3" />
          <span>{lang.toUpperCase()}</span>
        </Button>

        {/* Dark / Light Mode Switch (shadcn Switch) */}
        <div
          onClick={toggleTheme}
          title={isDark ? t('switchToLight') : t('switchToDark')}
          className="hover:bg-muted/50 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors select-none active:scale-[0.97]"
        >
          <Sun
            className={`size-3 transition-colors ${
              !isDark ? 'text-amber-500' : 'text-muted-foreground/40'
            }`}
          />
          <Switch
            size="sm"
            checked={isDark}
            aria-label="Toggle dark mode"
            className="pointer-events-none cursor-pointer"
          />
          <Moon
            className={`size-3 transition-colors ${
              isDark ? 'text-sky-400' : 'text-muted-foreground/40'
            }`}
          />
        </div>

        {/* Settings Button */}
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={onOpenSettings}
          title={t('settingsTooltip')}
          className="text-muted-foreground hover:text-foreground size-6 cursor-pointer transition-all duration-150 active:scale-[0.97]"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
};
