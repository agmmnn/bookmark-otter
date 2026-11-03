import {
  Sparkles,
  ExternalLink,
  Clock,
  Folder,
  Loader2,
  Check,
  RefreshCw,
  FolderPlus,
  ArrowRight,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { browser } from 'wxt/browser';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { suggestForNewBookmark } from '@/services/ai';
import { getRecentBookmarks, getBookmarkTree, getAllFolders } from '@/services/bookmarks';
import type { FlatBookmark, PendingSuggestion } from '@/types';

interface RecentBookmarksProps {
  onBookmarkChanged?: () => void;
  onOpenSettings?: () => void;
}

export const RecentBookmarks: React.FC<RecentBookmarksProps> = React.memo(function RecentBookmarks({
  onBookmarkChanged,
  onOpenSettings,
}) {
  const { t } = useI18n();
  const [bookmarks, setBookmarks] = useState<FlatBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState<PendingSuggestion | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRecent = async () => {
    setIsLoading(true);
    try {
      const items = await getRecentBookmarks(15);
      setBookmarks(items);
    } catch (err) {
      console.error('Failed to load recent bookmarks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecent();

    // Listen to bookmark changes in real-time
    const onCreated = () => loadRecent();
    const onRemoved = (removedId: string) => {
      loadRecent();
      setActiveSuggestion((prev) => (prev?.bookmarkId === removedId ? null : prev));
    };
    const onChanged = () => loadRecent();
    const onMoved = () => loadRecent();

    browser.bookmarks.onCreated.addListener(onCreated);
    browser.bookmarks.onRemoved.addListener(onRemoved);
    browser.bookmarks.onChanged.addListener(onChanged);
    browser.bookmarks.onMoved.addListener(onMoved);

    return () => {
      browser.bookmarks.onCreated.removeListener(onCreated);
      browser.bookmarks.onRemoved.removeListener(onRemoved);
      browser.bookmarks.onChanged.removeListener(onChanged);
      browser.bookmarks.onMoved.removeListener(onMoved);
    };
  }, []);

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diffSec = Math.floor((now - timestamp) / 1000);
    if (diffSec < 60) return t('justNow');
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return t('minutesAgo', { m: diffMin });
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return t('hoursAgo', { h: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t('daysAgo', { d: diffDays });
  };

  const handleRequestSuggestion = async (item: FlatBookmark) => {
    setLoadingItemId(item.id);
    setError(null);
    try {
      const tree = await getBookmarkTree();
      const folders = getAllFolders(tree);

      const suggestion = await suggestForNewBookmark({
        bookmarkId: item.id,
        originalTitle: item.title,
        url: item.url,
        folders,
      });

      setActiveSuggestion(suggestion);
      setEditedTitle(suggestion.suggestedTitle);
    } catch (err: any) {
      console.error('Failed to get suggestion:', err);
      setError(err?.message || 'Could not generate suggestion.');
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleApplySuggestion = async () => {
    if (!activeSuggestion) return;
    try {
      let targetFolderId = activeSuggestion.suggestedFolderId;

      if (activeSuggestion.isNewFolder) {
        const folderName = activeSuggestion.newFolderName || activeSuggestion.suggestedFolderPath;
        const newFolder = await browser.bookmarks.create({
          parentId: '1', // default under Bookmarks Bar
          title: folderName,
        });
        targetFolderId = newFolder.id;
      }

      await browser.bookmarks.update(activeSuggestion.bookmarkId, {
        title: editedTitle.trim() || activeSuggestion.suggestedTitle,
      });

      if (targetFolderId && targetFolderId !== 'NEW') {
        await browser.bookmarks.move(activeSuggestion.bookmarkId, {
          parentId: targetFolderId,
        });
      }

      // Flash success animation
      const targetId = activeSuggestion.bookmarkId;
      setAppliedId(targetId);
      setActiveSuggestion(null);
      setTimeout(() => setAppliedId(null), 2000);

      await loadRecent();
      onBookmarkChanged?.();
    } catch (err: any) {
      console.error('Failed to apply suggestion:', err);
      setError('Failed to apply suggestion.');
    }
  };

  return (
    <div className="flex h-full flex-col space-y-2.5 p-3">
      {/* Subheader */}
      <div className="border-border/50 flex items-center justify-between border-b pb-1">
        <div>
          <h2 className="text-foreground flex items-center gap-1.5 text-xs font-semibold tracking-tight">
            <Clock className="text-muted-foreground h-3.5 w-3.5" />
            {t('recentTitle')}
          </h2>
          <p className="text-muted-foreground pt-0.5 text-[10px]">{t('recentDesc')}</p>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={loadRecent}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground size-6 active:scale-95"
          title={t('refreshTooltip')}
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="bg-destructive/10 border-destructive/20 text-destructive flex items-center justify-between rounded-lg border p-2 text-[11px]">
          <span className="truncate">{error}</span>
          {error.includes('API') && onOpenSettings && (
            <Button
              size="xs"
              variant="outline"
              onClick={onOpenSettings}
              className="h-5 shrink-0 px-1.5 text-[9.5px]"
            >
              Key
            </Button>
          )}
        </div>
      )}

      {/* Unfiled Triage Quick Bar */}
      {bookmarks.filter((b) => b.path === 'Bookmarks Bar' || b.path === 'Other Bookmarks').length >
        1 && (
        <div className="animate-in fade-in-0 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[11px] duration-150">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
            <Sparkles className="size-3 shrink-0 text-amber-500" />
            <span>
              {
                bookmarks.filter((b) => b.path === 'Bookmarks Bar' || b.path === 'Other Bookmarks')
                  .length
              }{' '}
              unfiled bookmarks
            </span>
          </div>
          <span className="text-[10px] font-medium text-amber-700/80 dark:text-amber-300/80">
            Use Copilot for batch triage 🪄
          </span>
        </div>
      )}

      {/* Bookmarks List */}
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
        {isLoading && bookmarks.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center space-y-2 py-10">
            <Loader2 className="h-4 w-4 animate-spin duration-500" />
            <span className="text-[11px]">Loading...</span>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-muted-foreground py-10 text-center text-xs">
            {t('noRecentBookmarks')}
          </div>
        ) : (
          bookmarks.map((b) => {
            const isAnalyzing = loadingItemId === b.id;
            const isCurrentSuggestion = activeSuggestion?.bookmarkId === b.id;
            const wasJustApplied = appliedId === b.id;

            return (
              <div
                key={b.id}
                className={`space-y-1.5 rounded-lg border p-2 text-xs transition-[border-color,background-color,transform] duration-150 ${
                  wasJustApplied
                    ? 'border-emerald-500/50 bg-emerald-500/10'
                    : isCurrentSuggestion
                      ? 'border-amber-400/80 bg-amber-500/5 shadow-2xs'
                      : 'border-border/60 bg-card/60 hover:bg-card hover:border-border'
                }`}
              >
                {/* Main Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {/* Favicon */}
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${b.domain}&sz=32`}
                      alt=""
                      className="mt-0.5 size-3.5 shrink-0 rounded-xs"
                      onError={(e) => {
                        // fallback to hide broken image
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div
                        className="text-foreground truncate text-[11px] leading-tight font-medium"
                        title={b.title}
                      >
                        {b.title || b.domain}
                      </div>

                      <div className="text-muted-foreground flex items-center gap-1.5 text-[9.5px]">
                        <span className="text-muted-foreground/80 truncate font-mono">
                          {b.domain}
                        </span>
                        <span>•</span>
                        <span
                          className="text-muted-foreground/70 flex items-center gap-0.5 truncate"
                          title={b.path}
                        >
                          <Folder className="size-2.5 shrink-0" />
                          <span className="max-w-[120px] truncate">{b.path}</span>
                        </span>
                        {b.dateAdded && (
                          <>
                            <span>•</span>
                            <span className="shrink-0">{formatRelativeTime(b.dateAdded)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground/60 hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
                      title={t('openInTabTooltip')}
                    >
                      <ExternalLink className="size-3" />
                    </a>

                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleRequestSuggestion(b)}
                      disabled={isAnalyzing}
                      className="h-6 cursor-pointer gap-1 rounded-md border border-amber-400/30 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-800 transition-all duration-120 hover:bg-amber-500/20 active:scale-[0.95] dark:text-amber-200"
                      title={t('aiSuggestBtn')}
                    >
                      {isAnalyzing ? (
                        <Loader2 className="size-3 animate-spin text-amber-500 duration-500" />
                      ) : wasJustApplied ? (
                        <Check className="size-3 text-emerald-500" />
                      ) : (
                        <Sparkles className="size-3 fill-amber-500/20 text-amber-500" />
                      )}
                      <span>{wasJustApplied ? t('doneBtn') : t('aiSuggestBtn')}</span>
                    </Button>
                  </div>
                </div>

                {/* Inline Expanded Suggestion Proposal */}
                {isCurrentSuggestion && (
                  <div className="animate-in fade-in-0 zoom-in-98 mt-1 space-y-2 border-t border-amber-300/40 pt-2 text-[10.5px] duration-150 dark:border-amber-700/40">
                    {/* Suggested Title Input */}
                    <div className="space-y-0.5">
                      <div className="text-muted-foreground flex items-center justify-between text-[9.5px]">
                        <span>{t('editTitleTooltip')}</span>
                        <span className="max-w-[140px] truncate line-through opacity-60">
                          {activeSuggestion.originalTitle}
                        </span>
                      </div>
                      <Input
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="h-6 px-2 text-[11px] font-medium"
                      />
                    </div>

                    {/* Target Folder */}
                    <div className="bg-card/70 border-border/40 flex items-center justify-between gap-1 rounded border p-1 text-[10px]">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <ArrowRight className="size-2.5 text-amber-500" />
                        {t('targetFolderLabel')}
                      </span>
                      {activeSuggestion.isNewFolder ? (
                        <Badge
                          variant="outline"
                          className="h-4 gap-0.5 border-amber-400 px-1 text-[8.5px] text-amber-600 dark:text-amber-300"
                        >
                          <FolderPlus className="size-2.5" />
                          {activeSuggestion.newFolderName || activeSuggestion.suggestedFolderPath}
                        </Badge>
                      ) : (
                        <span className="text-foreground truncate font-medium">
                          {activeSuggestion.suggestedFolderPath}
                        </span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setActiveSuggestion(null)}
                        className="h-5 px-2 text-[10px] active:scale-95"
                      >
                        {t('cancelBtn')}
                      </Button>
                      <Button
                        size="xs"
                        onClick={handleApplySuggestion}
                        className="h-5 gap-1 bg-amber-600 px-2.5 text-[10px] font-medium text-white shadow-2xs hover:bg-amber-600/90 active:scale-97"
                      >
                        <Check className="size-2.5" />
                        {t('applyBtn')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
