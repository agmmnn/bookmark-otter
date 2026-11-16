import { Inbox, FolderTree, Wand2, Stethoscope, Loader2 } from 'lucide-react';
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { toast } from 'sonner';

import '@/assets/tailwind.css';
import { browser, type Browser } from 'wxt/browser';

import type { DoctorSubTab } from '@/components/Doctor';
import { Header } from '@/components/Header';
import { PendingSuggestionCard } from '@/components/PendingSuggestionCard';
import { RecentBookmarks } from '@/components/RecentBookmarks';
import { Toaster } from '@/components/ui/sonner';
import { useI18n } from '@/lib/i18n';
import { useResponsiveTabStage } from '@/lib/utils';
import { getBookmarkTree, restoreSnapshot } from '@/services/bookmarks';
import {
  validateAndCleanPendingSuggestions,
  removePendingSuggestion,
  clearPendingSuggestions,
  updateBadgeCount,
  popLatestSnapshot,
  saveSnapshot,
} from '@/services/storage';
import { getTrashCount } from '@/services/trash';
import type { PendingSuggestion, UndoOperation } from '@/types';

const AICopilot = lazy(() =>
  import('@/components/AICopilot').then((m) => ({ default: m.AICopilot }))
);
const Doctor = lazy(() => import('@/components/Doctor').then((m) => ({ default: m.Doctor })));
const Explorer = lazy(() => import('@/components/Explorer').then((m) => ({ default: m.Explorer })));
const RecycleBin = lazy(() =>
  import('@/components/RecycleBin').then((m) => ({ default: m.RecycleBin }))
);
const SettingsModal = lazy(() =>
  import('@/components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
);

const TabFallback = () => (
  <div className="text-muted-foreground flex flex-1 items-center justify-center py-12">
    <Loader2 className="size-4 animate-spin" />
  </div>
);

type ActiveTab = 'inbox' | 'library' | 'copilot' | 'doctor';

export const App: React.FC = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<ActiveTab>('inbox');
  // Lazy mount on demand: only mount tabs the user actually opens to guarantee instant <50ms TTI
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(() => new Set(['inbox']));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [doctorSubTab, setDoctorSubTab] = useState<DoctorSubTab>('overview');

  // 3-Stage Responsive Tab Bar based on container inline-size (~84px per labeled tab)
  const { containerRef: navRef, stage: navStage } = useResponsiveTabStage<HTMLElement>(4, 84);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setIsTrashOpen(false);
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
  const handleToggleTrash = useCallback(() => setIsTrashOpen((prev) => !prev), []);
  const handleCloseTrash = useCallback(() => setIsTrashOpen(false), []);

  const handleNavigateToLibrary = useCallback(
    (query: string) => {
      setLibrarySearchQuery(query);
      handleTabChange('library');
    },
    [handleTabChange]
  );

  const refreshState = useCallback(async () => {
    const [suggestions, count] = await Promise.all([
      validateAndCleanPendingSuggestions(),
      getTrashCount(),
    ]);
    setPendingSuggestions(suggestions);
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

  const handleUndo = useCallback(async () => {
    const snap = await popLatestSnapshot();
    if (!snap) return;
    try {
      const restored = await restoreSnapshot(snap);
      await refreshState();
      if (restored) {
        toast.success(t('undoSuccess'));
      } else {
        toast.error(t('undoFailed'));
      }
    } catch (err) {
      console.error('Failed to undo:', err);
      toast.error(t('undoFailed'));
    }
  }, [refreshState, t]);

  const handlePlanApplied = useCallback(() => {
    refreshState();
    toast.success(t('planAppliedSuccess'), {
      description: t('undoAvailableDesc'),
      duration: 10000,
      action: {
        label: t('undoBtn'),
        onClick: () => handleUndo(),
      },
    });
  }, [refreshState, handleUndo, t]);

  const handleApplyAll = async (editedTitles: Record<string, string>) => {
    if (pendingSuggestions.length === 0) return;
    setIsApplyingSuggestion(true);
    const count = pendingSuggestions.length;
    try {
      // Create backup snapshot with atomic inverse operations before bulk change
      const tree = await getBookmarkTree();
      const inverseOps: UndoOperation[] = [];

      for (const item of pendingSuggestions) {
        try {
          const [orig] = await browser.bookmarks.get(item.bookmarkId);
          if (orig) {
            inverseOps.push({
              type: 'RENAME',
              id: item.bookmarkId,
              originalTitle: orig.title,
            });
            inverseOps.push({
              type: 'MOVE',
              bookmarkId: item.bookmarkId,
              originalParentId: orig.parentId || '1',
              originalIndex: orig.index,
            });
          }
        } catch {}

        let targetFolderId = item.suggestedFolderId;
        if (item.isNewFolder) {
          const folderName = item.newFolderName || item.suggestedFolderPath;
          const newFolder = await browser.bookmarks.create({
            parentId: '1',
            title: folderName,
          });
          targetFolderId = newFolder.id;
          inverseOps.push({
            type: 'CREATE_FOLDER',
            createdFolderId: newFolder.id,
          });
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

      await saveSnapshot(`Applied ${count} AI suggestions`, tree, inverseOps);

      await clearPendingSuggestions();
      setPendingSuggestions([]);
      await updateBadgeCount(0);
      await refreshState();

      toast.success(t('appliedAllSuccess', { count }), {
        description: t('undoAvailableDesc'),
        duration: 9000,
        action: {
          label: t('undoBtn'),
          onClick: () => handleUndo(),
        },
      });
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

  const isTabLabelVisible = (tabKey: ActiveTab) =>
    navStage === 'wide' || (navStage === 'medium' && activeTab === tabKey && !isTrashOpen);

  return (
    <div className="bg-background text-foreground selection:bg-primary/20 flex min-h-screen flex-col antialiased">
      <Header
        onOpenSettings={handleOpenSettings}
        trashCount={trashCount}
        isTrashOpen={isTrashOpen}
        onToggleTrash={handleToggleTrash}
      />

      {/* 3-Stage Responsive Navigation Bar (Inbox · Library · Copilot · Doctor) */}
      <nav
        ref={navRef}
        data-stage={navStage}
        role="tablist"
        aria-label="Main navigation"
        className="responsive-tab-bar border-border/50 bg-muted/20 flex items-center gap-1 border-b px-2 py-1 select-none"
      >
        {/* 1. Inbox */}
        <button
          role="tab"
          aria-selected={activeTab === 'inbox' && !isTrashOpen}
          aria-label={t('tabInbox') || 'Inbox'}
          data-active={activeTab === 'inbox' && !isTrashOpen}
          onClick={() => handleTabChange('inbox')}
          title={t('tabInbox') || 'Inbox'}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'inbox' && !isTrashOpen
              ? 'bg-card text-foreground border-border/70 flex-[1.4] border px-2.5 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 flex-1 px-1.5'
          }`}
        >
          <Inbox className="size-3.5 shrink-0" />
          <span
            className={`tab-label overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isTabLabelVisible('inbox')
                ? 'ml-1.5 max-w-[96px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabInbox') || 'Inbox'}
          </span>
        </button>

        {/* 2. Library */}
        <button
          role="tab"
          aria-selected={activeTab === 'library' && !isTrashOpen}
          aria-label={t('tabLibrary') || 'Library'}
          data-active={activeTab === 'library' && !isTrashOpen}
          onClick={() => handleTabChange('library')}
          title={t('tabLibrary') || 'Library'}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'library' && !isTrashOpen
              ? 'bg-card text-foreground border-border/70 flex-[1.4] border px-2.5 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 flex-1 px-1.5'
          }`}
        >
          <FolderTree className="size-3.5 shrink-0 text-amber-500" />
          <span
            className={`tab-label overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isTabLabelVisible('library')
                ? 'ml-1.5 max-w-[96px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabLibrary') || 'Library'}
          </span>
        </button>

        {/* 3. Copilot */}
        <button
          role="tab"
          aria-selected={activeTab === 'copilot' && !isTrashOpen}
          aria-label={t('tabCopilot') || 'Copilot'}
          data-active={activeTab === 'copilot' && !isTrashOpen}
          onClick={() => handleTabChange('copilot')}
          title={t('tabCopilot') || 'Copilot'}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'copilot' && !isTrashOpen
              ? 'bg-card text-foreground border-border/70 flex-[1.4] border px-2.5 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 flex-1 px-1.5'
          }`}
        >
          <Wand2 className="text-primary size-3.5 shrink-0" />
          <span
            className={`tab-label overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isTabLabelVisible('copilot')
                ? 'ml-1.5 max-w-[96px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabCopilot') || 'Copilot'}
          </span>
        </button>

        {/* 4. Doctor */}
        <button
          role="tab"
          aria-selected={activeTab === 'doctor' && !isTrashOpen}
          aria-label={t('tabDoctor') || 'Doctor'}
          data-active={activeTab === 'doctor' && !isTrashOpen}
          onClick={() => {
            setDoctorSubTab('overview');
            handleTabChange('doctor');
          }}
          title={t('tabDoctor') || 'Doctor'}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            activeTab === 'doctor' && !isTrashOpen
              ? 'bg-card text-foreground border-border/70 flex-[1.4] border px-2.5 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30 flex-1 px-1.5'
          }`}
        >
          <Stethoscope className="size-3.5 shrink-0 text-emerald-500" />
          <span
            className={`tab-label overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isTabLabelVisible('doctor')
                ? 'ml-1.5 max-w-[96px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabDoctor') || 'Doctor'}
          </span>
        </button>
      </nav>

      <main className="relative flex flex-1 flex-col">
        {isTrashOpen ? (
          <Suspense fallback={<TabFallback />}>
            <RecycleBin onRestored={refreshState} onClose={handleCloseTrash} />
          </Suspense>
        ) : (
          <>
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

            {/* Tab 1: Inbox */}
            {visitedTabs.has('inbox') && (
              <div className={activeTab === 'inbox' ? 'flex flex-1 flex-col' : 'hidden'}>
                <RecentBookmarks
                  onBookmarkChanged={refreshState}
                  onOpenSettings={handleOpenSettings}
                />
              </div>
            )}

            {/* Tab 2: Library */}
            {visitedTabs.has('library') && (
              <div className={activeTab === 'library' ? 'flex flex-1 flex-col' : 'hidden'}>
                <Suspense fallback={<TabFallback />}>
                  <Explorer
                    onBookmarkChanged={refreshState}
                    initialSearchQuery={librarySearchQuery}
                  />
                </Suspense>
              </div>
            )}

            {/* Tab 3: Copilot (State preserved across tab navigation) */}
            {visitedTabs.has('copilot') && (
              <div className={activeTab === 'copilot' ? 'flex flex-1 flex-col' : 'hidden'}>
                <Suspense fallback={<TabFallback />}>
                  <AICopilot
                    onPlanApplied={handlePlanApplied}
                    onOpenSettings={handleOpenSettings}
                  />
                </Suspense>
              </div>
            )}

            {/* Tab 4: Doctor (Includes Overview + Health checks) */}
            {visitedTabs.has('doctor') && (
              <div className={activeTab === 'doctor' ? 'flex flex-1 flex-col' : 'hidden'}>
                <Suspense fallback={<TabFallback />}>
                  <Doctor
                    onFixed={refreshState}
                    initialSubTab={doctorSubTab}
                    onNavigateToLibrary={handleNavigateToLibrary}
                  />
                </Suspense>
              </div>
            )}
          </>
        )}
      </main>

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={handleCloseSettings}
            onSettingsSaved={refreshState}
          />
        </Suspense>
      )}

      <Toaster position="bottom-center" />
    </div>
  );
};
