import {
  Sparkles,
  Check,
  X,
  FolderPlus,
  Folder,
  ArrowRight,
  Globe,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import type { PendingSuggestion } from '@/types';

export interface PendingSuggestionCardProps {
  suggestion?: PendingSuggestion | null;
  suggestions?: PendingSuggestion[];
  onApply: (suggestion: PendingSuggestion, updatedTitle: string) => Promise<void>;
  onApplyAll?: (editedTitles: Record<string, string>) => Promise<void>;
  onDismiss: (suggestion: PendingSuggestion) => void | Promise<void>;
  onDismissAll?: () => void | Promise<void>;
  isApplying?: boolean;
}

export const PendingSuggestionCard: React.FC<PendingSuggestionCardProps> = ({
  suggestion,
  suggestions,
  onApply,
  onApplyAll,
  onDismiss,
  onDismissAll,
  isApplying = false,
}) => {
  const { t } = useI18n();

  // Normalize suggestions into array
  const items = useMemo(() => {
    if (suggestions && suggestions.length > 0) return suggestions;
    if (suggestion) return [suggestion];
    return [];
  }, [suggestions, suggestion]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);

  // Keep index within bounds
  const safeIndex = items.length === 0 ? 0 : Math.min(currentIndex, items.length - 1);
  const currentItem = items[safeIndex];

  // Reset editing mode when switching active item
  useEffect(() => {
    setIsEditing(false);
  }, [safeIndex, currentItem?.bookmarkId]);

  // Keyboard navigation (Left / Right arrows when not editing text)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft' && safeIndex > 0) {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight' && safeIndex < items.length - 1) {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(items.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, safeIndex, items.length]);

  if (!currentItem || items.length === 0) {
    return null;
  }

  const currentEditedTitle = editedTitles[currentItem.bookmarkId] ?? currentItem.suggestedTitle;

  const domain = (() => {
    try {
      return new URL(currentItem.url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  })();

  const handleTitleChange = (val: string) => {
    setEditedTitles((prev) => ({
      ...prev,
      [currentItem.bookmarkId]: val,
    }));
  };

  const hasMultiple = items.length > 1;

  return (
    <div className="animate-in fade-in-0 zoom-in-95 mx-3 mt-3 rounded-xl border border-amber-300/80 bg-gradient-to-b from-amber-500/10 via-amber-500/5 to-transparent p-3 shadow-xs transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] dark:border-amber-700/60">
      {/* Header Bar */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 fill-amber-500/20 text-amber-500" />
          <span className="truncate text-[11.5px] font-semibold tracking-tight text-amber-900 dark:text-amber-200">
            {hasMultiple
              ? t('suggestionsQueueTitle', { count: items.length })
              : t('suggestionTitle')}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Multi-item Stepper */}
          {hasMultiple && (
            <div className="flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-900 dark:bg-amber-500/25 dark:text-amber-200">
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                disabled={safeIndex === 0}
                title={t('prevSuggestionTooltip')}
                className="cursor-pointer rounded p-0.5 transition-transform hover:bg-amber-500/20 active:scale-[0.92] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <span className="px-0.5 font-semibold select-none">
                {safeIndex + 1}/{items.length}
              </span>
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => Math.min(items.length - 1, i + 1))}
                disabled={safeIndex === items.length - 1}
                title={t('nextSuggestionTooltip')}
                className="cursor-pointer rounded p-0.5 transition-transform hover:bg-amber-500/20 active:scale-[0.92] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Domain Hostname */}
          <span className="text-muted-foreground flex items-center gap-1 font-mono text-[10px]">
            <Globe className="text-muted-foreground/60 h-2.5 w-2.5" />
            <span className="max-w-[100px] truncate">{domain}</span>
          </span>
        </div>
      </div>

      {/* Main Card Content */}
      <div
        key={currentItem.bookmarkId}
        className="animate-in fade-in-0 space-y-2 text-xs duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]"
      >
        {/* Title Comparison */}
        <div className="bg-card/85 border-border/60 space-y-1 rounded-lg border p-2.5 backdrop-blur-xs transition-colors duration-150">
          <div
            className="text-muted-foreground/70 truncate text-[10px] line-through select-none"
            title={currentItem.originalTitle}
          >
            {currentItem.originalTitle}
          </div>

          {isEditing ? (
            <div className="flex items-center gap-1.5 pt-0.5">
              <Input
                value={currentEditedTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="h-6 px-2 text-xs focus-visible:ring-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditing(false);
                }}
              />
              <Button
                size="xs"
                variant="secondary"
                onClick={() => setIsEditing(false)}
                className="h-6 px-2 text-[10px] active:scale-[0.97]"
              >
                {t('doneBtn')}
              </Button>
            </div>
          ) : (
            <div
              className="text-foreground hover:text-primary group flex cursor-pointer items-center justify-between text-xs font-medium transition-colors select-none"
              onClick={() => setIsEditing(true)}
              title={t('editTitleTooltip')}
            >
              <span className="truncate pr-2">{currentEditedTitle}</span>
              <span className="text-muted-foreground/60 group-hover:text-primary shrink-0 text-[9.5px] font-normal transition-colors">
                {t('editBtn')}
              </span>
            </div>
          )}
        </div>

        {/* Folder Target */}
        <div className="bg-card/50 border-border/40 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]">
          <span className="text-muted-foreground/90 flex items-center gap-1 text-[10.5px]">
            <ArrowRight className="h-3 w-3 text-amber-500/80" />
            {t('targetFolderLabel')}
          </span>
          <div className="flex items-center gap-1 truncate font-medium">
            {currentItem.isNewFolder ? (
              <Badge
                variant="outline"
                className="h-4 gap-1 border-amber-400/80 bg-amber-500/10 px-1.5 text-[9px] text-amber-700 dark:text-amber-300"
              >
                <FolderPlus className="h-2.5 w-2.5" />
                {t('newFolderBadge')}:{' '}
                {currentItem.newFolderName || currentItem.suggestedFolderPath}
              </Badge>
            ) : (
              <span className="text-foreground flex items-center gap-1 truncate text-[10.5px]">
                <Folder className="text-muted-foreground/70 h-3 w-3" />
                {currentItem.suggestedFolderPath}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Pagination Dot Pills (if multiple and up to 8 items) */}
      {hasMultiple && items.length <= 8 && (
        <div className="flex items-center justify-center gap-1.5 pt-2 select-none">
          {items.map((it, idx) => (
            <button
              key={it.bookmarkId}
              type="button"
              onClick={() => setCurrentIndex(idx)}
              className={`cursor-pointer transition-[width,background-color,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                idx === safeIndex
                  ? 'h-1 w-3.5 rounded-full bg-amber-500'
                  : 'h-1 w-1 rounded-full bg-amber-300/80 hover:bg-amber-400 dark:bg-amber-700/80'
              }`}
              title={it.originalTitle}
            />
          ))}
        </div>
      )}

      {/* Action Buttons with physical feedback */}
      <div className="border-border/30 mt-2.5 flex items-center justify-between gap-1.5 border-t pt-2">
        <div>
          {hasMultiple && onDismissAll && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onDismissAll()}
              disabled={isApplying}
              className="text-muted-foreground/80 hover:text-destructive h-6 cursor-pointer px-1.5 text-[10px] transition-[transform,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
            >
              {t('dismissAllBtn')}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onDismiss(currentItem)}
            disabled={isApplying}
            className="text-muted-foreground hover:text-foreground h-6 cursor-pointer px-2 text-[10.5px] transition-all duration-150 active:scale-[0.97]"
          >
            <X className="mr-1 h-3 w-3" />
            {t('dismissBtn')}
          </Button>

          {hasMultiple && onApplyAll ? (
            <>
              <Button
                size="xs"
                variant="outline"
                onClick={() => onApply(currentItem, currentEditedTitle)}
                disabled={isApplying}
                className="h-6 cursor-pointer gap-1 px-2 text-[10.5px] font-medium transition-all duration-150 active:scale-[0.97]"
              >
                <Check className="h-3 w-3" />
                {t('applyBtn')}
              </Button>
              <Button
                size="xs"
                variant="default"
                onClick={() => onApplyAll(editedTitles)}
                disabled={isApplying}
                className="h-6 cursor-pointer gap-1 bg-amber-600 px-2.5 text-[10.5px] font-medium text-white shadow-xs transition-all duration-150 hover:bg-amber-500 active:scale-[0.97]"
              >
                <CheckCheck className="h-3 w-3" />
                {isApplying ? t('applyingBtn') : t('applyAllBtn', { count: items.length })}
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              variant="default"
              onClick={() => onApply(currentItem, currentEditedTitle)}
              disabled={isApplying}
              className="h-6 cursor-pointer gap-1 bg-amber-600 px-2.5 text-[10.5px] font-medium text-white shadow-xs transition-all duration-150 hover:bg-amber-500 active:scale-[0.97]"
            >
              <Check className="h-3 w-3" />
              {isApplying ? t('applyingBtn') : t('applyBtn')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
