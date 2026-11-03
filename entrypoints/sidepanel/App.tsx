import { Clock, FolderTree, Wand2, Stethoscope, Activity, Trash2 } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import '@/assets/tailwind.css';
import { browser, type Browser } from 'wxt/browser';

import { AICopilot } from '@/components/AICopilot';
import { Doctor } from '@/components/Doctor';
import { Explorer } from '@/components/Explorer';
import { Header } from '@/components/Header';
import { Insights } from '@/components/Insights';
import { PendingSuggestionCard } from '@/components/PendingSuggestionCard';
import { RecentBookmarks } from '@/components/RecentBookmarks';
import { RecycleBin } from '@/components/RecycleBin';
import { SettingsModal } from '@/components/SettingsModal';
import { useI18n } from '@/lib/i18n';
import { getBookmarkTree, restoreSnapshot } from '@/services/bookmarks';
import {
  validateAndCleanPendingSuggestions,
  removePendingSuggestion,
  clearPendingSuggestions,
  updateBadgeCount,
  getLatestSnapshot,
  popLatestSnapshot,
  saveSnapshot,
} from '@/services/storage';
import { getTrashCount } from '@/services/trash';
import type { PendingSuggestion, TreeSnapshot } from '@/types';

type ActiveTab = 'recent' | 'explorer' | 'copilot' | 'doctor' | 'insights' | 'trash';

export const App: React.FC = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ActiveTab>('recent');
  // Lazy mount on demand: only mount tabs the user actually opens to guarantee instant <50ms TTI
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(() => new Set(['recent']));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<TreeSnapshot | null>(null);
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);
  const [explorerSearchQuery, setExplorerSearchQuery] = useState('');
  const [doctorSubTab, setDoctorSubTab] = useState<
    'duplicates' | 'similar' | 'trackers' | 'insecure' | '404' | 'empty'
  >('duplicates');

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);

  const handleNavigateToDoctor = useCallback(
    (subTab?: 'duplicates' | 'similar' | 'trackers' | 'insecure' | '404' | 'empty') => {
      if (subTab) setDoctorSubTab(subTab);
      handleTabChange('doctor');
    },
    [handleTabChange]
  );

  const handleNavigateToCopilot = useCallback(() => {
    handleTabChange('copilot');
  }, [handleTabChange]);

  const handleNavigateToExplorer = useCallback(
    (query: string) => {
      setExplorerSearchQuery(query);
      handleTabChange('explorer');
    },
    [handleTabChange]
  );

  const refreshState = useCallback(async () => {
    const [suggestions, snap, count] = await Promise.all([
      validateAndCleanPendingSuggestions(),
      getLatestSnapshot(),
      getTrashCount(),
    ]);
    setPendingSuggestions(suggestions);
    setLatestSnapshot(snap);
    setTrashCount(count);
    await updateBadgeCount(suggestions.length);
  }, []);

  useEffect(() => {
    refreshState();

    // 1. Direct storage sync for pending suggestions
    const storageListener = (
      changes: { [key: string]: Browser.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'local' && changes.pendingSuggestions) {
        const updated = (changes.pendingSuggestions.newValue as PendingSuggestion[]) || [];
        setPendingSuggestions(updated);
      }
    };
    browser.storage.onChanged.addListener(storageListener);

    // 2. Listen for suggestions messages coming from background worker
    const messageListener = (msg: any) => {
      if (msg?.type === 'SUGGESTIONS_UPDATED' && Array.isArray(msg.suggestions)) {
        setPendingSuggestions(msg.suggestions);
      } else if (msg?.type === 'NEW_SUGGESTION') {
        refreshState();
      }
    };
    browser.runtime.onMessage.addListener(messageListener);

    // 3. Real-time bookmark removal listener (unstar or delete from address bar)
    const bookmarkRemovedListener = async (id: string, removeInfo?: any) => {
      const removedUrl = removeInfo?.node?.url;
      const remaining = await removePendingSuggestion(id, removedUrl);
      setPendingSuggestions(remaining);
      await updateBadgeCount(remaining.length);
      refreshState();
    };
    browser.bookmarks.onRemoved.addListener(bookmarkRemovedListener);

    return () => {
      browser.storage.onChanged.removeListener(storageListener);
      browser.runtime.onMessage.removeListener(messageListener);
      browser.bookmarks.onRemoved.removeListener(bookmarkRemovedListener);
    };
  }, [refreshState]);

  const handleApplySuggestion = async (suggestion: PendingSuggestion, updatedTitle: string) => {
    setIsApplyingSuggestion(true);
    try {
      // Check if bookmark still exists in Chrome before applying
      try {
        const [node] = await browser.bookmarks.get(suggestion.bookmarkId);
        if (!node) {
          const remaining = await removePendingSuggestion(suggestion.bookmarkId);
          setPendingSuggestions(remaining);
          await updateBadgeCount(remaining.length);
          await refreshState();
          return;
        }
      } catch {
        const remaining = await removePendingSuggestion(suggestion.bookmarkId);
        setPendingSuggestions(remaining);
        await updateBadgeCount(remaining.length);
        await refreshState();
        return;
      }

      let targetFolderId = suggestion.suggestedFolderId;

      // If AI recommended a new folder, create it first under Bookmarks Bar ('1')
      if (suggestion.isNewFolder) {
        const folderName = suggestion.newFolderName || suggestion.suggestedFolderPath;
        const newFolder = await browser.bookmarks.create({
          parentId: '1',
          title: folderName,
        });
        targetFolderId = newFolder.id;
      }

      // 1. Update bookmark title
      await browser.bookmarks.update(suggestion.bookmarkId, {
        title: updatedTitle,
      });

      // 2. Move to target folder
      if (targetFolderId && targetFolderId !== 'NEW') {
        await browser.bookmarks.move(suggestion.bookmarkId, {
          parentId: targetFolderId,
        });
      }

      // 3. Remove suggestion from queue and update badge
      const remaining = await removePendingSuggestion(suggestion.bookmarkId);
      setPendingSuggestions(remaining);
      await updateBadgeCount(remaining.length);
      await refreshState();
    } catch (err) {
      console.error('Error applying suggestion:', err);
    } finally {
      setIsApplyingSuggestion(false);
    }
  };

  const handleApplyAll = async (editedTitles: Record<string, string>) => {
    if (pendingSuggestions.length === 0) return;
    setIsApplyingSuggestion(true);
    try {
      // Create backup snapshot before bulk change
      const tree = await getBookmarkTree();
      await saveSnapshot(`Applied ${pendingSuggestions.length} AI suggestions`, tree);

      for (const item of pendingSuggestions) {
        let targetFolderId = item.suggestedFolderId;
        if (item.isNewFolder) {
          const folderName = item.newFolderName || item.suggestedFolderPath;
          const newFolder = await browser.bookmarks.create({
            parentId: '1',
            title: folderName,
          });
          targetFolderId = newFolder.id;
        }

        const titleToUse = editedTitles[item.bookmarkId] ?? item.suggestedTitle;
        await browser.bookmarks.update(item.bookmarkId, {
          title: titleToUse,
        });

        if (targetFolderId && targetFolderId !== 'NEW') {
          await browser.bookmarks.move(item.bookmarkId, {
            parentId: targetFolderId,
          });
        }
      }

      await clearPendingSuggestions();
      setPendingSuggestions([]);
      await updateBadgeCount(0);
      await refreshState();
    } catch (err) {
      console.error('Error applying all suggestions:', err);
    } finally {
      setIsApplyingSuggestion(false);
    }
  };

  const handleDismissSuggestion = async (suggestion: PendingSuggestion) => {
    const remaining = await removePendingSuggestion(suggestion.bookmarkId);
    setPendingSuggestions(remaining);
    await updateBadgeCount(remaining.length);
  };

  const handleDismissAll = async () => {
    await clearPendingSuggestions();
    setPendingSuggestions([]);
    await updateBadgeCount(0);
  };

  const handleUndo = async () => {
    const snap = await popLatestSnapshot();
    if (!snap) return;
    setIsUndoing(true);
    try {
      await restoreSnapshot(snap);
      await refreshState();
    } catch (err) {
      console.error('Failed to undo:', err);
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="bg-background text-foreground selection:bg-primary/20 flex min-h-screen flex-col antialiased">
      <Header
        onOpenSettings={handleOpenSettings}
        latestSnapshot={latestSnapshot}
        onUndo={handleUndo}
        isUndoing={isUndoing}
      />

      {/* Navigation Tabs - 6 Balanced Compact Modules */}
      <nav className="border-border/50 bg-muted/20 flex items-center gap-0.5 border-b px-1.5 py-1 select-none">
        {/* 1. Recent */}
        <button
          onClick={() => handleTabChange('recent')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'recent'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
        >
          <Clock className="size-3 shrink-0" />
          <span>{t('tabRecent')}</span>
        </button>

        {/* 2. Explorer */}
        <button
          onClick={() => handleTabChange('explorer')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'explorer'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
        >
          <FolderTree className="size-3 shrink-0 text-amber-500" />
          <span>{t('tabExplorer') || 'Explorer'}</span>
        </button>

        {/* 3. Copilot */}
        <button
          onClick={() => handleTabChange('copilot')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'copilot'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
        >
          <Wand2 className="text-primary size-3 shrink-0" />
          <span>{t('tabCopilot')}</span>
        </button>

        {/* 4. Doctor */}
        <button
          onClick={() => handleTabChange('doctor')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'doctor'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
        >
          <Stethoscope className="size-3 shrink-0 text-emerald-500" />
          <span>{t('tabDoctor') || 'Doctor'}</span>
        </button>

        {/* 5. Insights */}
        <button
          onClick={() => handleTabChange('insights')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'insights'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
        >
          <Activity className="size-3 shrink-0 text-blue-500" />
          <span>{t('tabInsights') || 'Insights'}</span>
        </button>

        {/* 6. Trash */}
        <button
          onClick={() => handleTabChange('trash')}
          className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'trash'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          }`}
        >
          <Trash2 className="size-3 shrink-0 text-rose-500" />
          <span>{t('tabTrash') || 'Trash'}</span>
          {trashCount > 0 && <span className="size-1.5 shrink-0 rounded-full bg-rose-500" />}
        </button>
      </nav>

      <main className="flex flex-1 flex-col">
        {pendingSuggestions.length > 0 && (
          <PendingSuggestionCard
            suggestions={pendingSuggestions}
            onApply={handleApplySuggestion}
            onApplyAll={handleApplyAll}
            onDismiss={handleDismissSuggestion}
            onDismissAll={handleDismissAll}
            isApplying={isApplyingSuggestion}
          />
        )}

        {/* Tab 1: Recent */}
        {visitedTabs.has('recent') && (
          <div className={activeTab === 'recent' ? 'flex flex-1 flex-col' : 'hidden'}>
            <RecentBookmarks onBookmarkChanged={refreshState} onOpenSettings={handleOpenSettings} />
          </div>
        )}

        {/* Tab 2: Explorer */}
        {visitedTabs.has('explorer') && (
          <div className={activeTab === 'explorer' ? 'flex flex-1 flex-col' : 'hidden'}>
            <Explorer onBookmarkChanged={refreshState} initialSearchQuery={explorerSearchQuery} />
          </div>
        )}

        {/* Tab 3: Copilot (State preserved across tab navigation) */}
        {visitedTabs.has('copilot') && (
          <div className={activeTab === 'copilot' ? 'flex flex-1 flex-col' : 'hidden'}>
            <AICopilot onPlanApplied={refreshState} onOpenSettings={handleOpenSettings} />
          </div>
        )}

        {/* Tab 4: Doctor (Health checks & subtab state preserved) */}
        {visitedTabs.has('doctor') && (
          <div className={activeTab === 'doctor' ? 'flex flex-1 flex-col' : 'hidden'}>
            <Doctor onFixed={refreshState} initialSubTab={doctorSubTab} />
          </div>
        )}

        {/* Tab 5: Insights */}
        {visitedTabs.has('insights') && (
          <div className={activeTab === 'insights' ? 'flex flex-1 flex-col' : 'hidden'}>
            <Insights
              onNavigateToDoctor={handleNavigateToDoctor}
              onNavigateToCopilot={handleNavigateToCopilot}
              onNavigateToExplorer={handleNavigateToExplorer}
            />
          </div>
        )}

        {/* Tab 6: Recycle Bin */}
        {visitedTabs.has('trash') && (
          <div className={activeTab === 'trash' ? 'flex flex-1 flex-col' : 'hidden'}>
            <RecycleBin onRestored={refreshState} />
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleCloseSettings}
        onSettingsSaved={refreshState}
      />
    </div>
  );
};
