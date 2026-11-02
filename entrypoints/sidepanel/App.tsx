import { Clock, FolderTree, Wand2, Stethoscope, Activity, Trash2 } from 'lucide-react';

import '@/assets/tailwind.css';
import React, { useState, useEffect } from 'react';

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
  getPendingSuggestions,
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestion[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<TreeSnapshot | null>(null);
  const [trashCount, setTrashCount] = useState<number>(0);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isApplyingSuggestion, setIsApplyingSuggestion] = useState(false);
  const [explorerSearchQuery, setExplorerSearchQuery] = useState('');

  const refreshState = async () => {
    const [suggestions, snap, count] = await Promise.all([
      getPendingSuggestions(),
      getLatestSnapshot(),
      getTrashCount(),
    ]);
    setPendingSuggestions(suggestions);
    setLatestSnapshot(snap);
    setTrashCount(count);
    await updateBadgeCount(suggestions.length);
  };

  useEffect(() => {
    refreshState();

    // Listen for suggestions coming from background worker
    const messageListener = (msg: any) => {
      if (msg?.type === 'SUGGESTIONS_UPDATED' && Array.isArray(msg.suggestions)) {
        setPendingSuggestions(msg.suggestions);
      } else if (msg?.type === 'NEW_SUGGESTION') {
        refreshState();
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  const handleApplySuggestion = async (suggestion: PendingSuggestion, updatedTitle: string) => {
    setIsApplyingSuggestion(true);
    try {
      let targetFolderId = suggestion.suggestedFolderId;

      // If AI recommended a new folder, create it first under Bookmarks Bar ('1')
      if (suggestion.isNewFolder) {
        const folderName = suggestion.newFolderName || suggestion.suggestedFolderPath;
        const newFolder = await chrome.bookmarks.create({
          parentId: '1',
          title: folderName,
        });
        targetFolderId = newFolder.id;
      }

      // 1. Update bookmark title
      await chrome.bookmarks.update(suggestion.bookmarkId, {
        title: updatedTitle,
      });

      // 2. Move to target folder
      if (targetFolderId && targetFolderId !== 'NEW') {
        await chrome.bookmarks.move(suggestion.bookmarkId, {
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
          const newFolder = await chrome.bookmarks.create({
            parentId: '1',
            title: folderName,
          });
          targetFolderId = newFolder.id;
        }

        const titleToUse = editedTitles[item.bookmarkId] ?? item.suggestedTitle;
        await chrome.bookmarks.update(item.bookmarkId, {
          title: titleToUse,
        });

        if (targetFolderId && targetFolderId !== 'NEW') {
          await chrome.bookmarks.move(item.bookmarkId, {
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
        onOpenSettings={() => setIsSettingsOpen(true)}
        latestSnapshot={latestSnapshot}
        onUndo={handleUndo}
        isUndoing={isUndoing}
      />

      {/* Navigation Tabs - 6 Balanced Compact Modules */}
      <nav className="border-border/50 bg-muted/20 flex items-center gap-0.5 border-b px-1.5 py-1 select-none">
        {/* 1. Recent */}
        <button
          onClick={() => setActiveTab('recent')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-120 active:scale-[0.97] ${
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
          onClick={() => setActiveTab('explorer')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-120 active:scale-[0.97] ${
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
          onClick={() => setActiveTab('copilot')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-120 active:scale-[0.97] ${
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
          onClick={() => setActiveTab('doctor')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-120 active:scale-[0.97] ${
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
          onClick={() => setActiveTab('insights')}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-120 active:scale-[0.97] ${
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
          onClick={() => setActiveTab('trash')}
          className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-md px-0.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all duration-120 active:scale-[0.97] ${
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
        <div className={activeTab === 'recent' ? 'flex flex-1 flex-col' : 'hidden'}>
          <RecentBookmarks
            onBookmarkChanged={refreshState}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        </div>

        {/* Tab 2: Explorer */}
        <div className={activeTab === 'explorer' ? 'flex flex-1 flex-col' : 'hidden'}>
          <Explorer onBookmarkChanged={refreshState} initialSearchQuery={explorerSearchQuery} />
        </div>

        {/* Tab 3: Copilot (State preserved across tab navigation) */}
        <div className={activeTab === 'copilot' ? 'flex flex-1 flex-col' : 'hidden'}>
          <AICopilot onPlanApplied={refreshState} onOpenSettings={() => setIsSettingsOpen(true)} />
        </div>

        {/* Tab 4: Doctor (Health checks & subtab state preserved) */}
        <div className={activeTab === 'doctor' ? 'flex flex-1 flex-col' : 'hidden'}>
          <Doctor onFixed={refreshState} />
        </div>

        {/* Tab 5: Insights */}
        <div className={activeTab === 'insights' ? 'flex flex-1 flex-col' : 'hidden'}>
          <Insights
            onNavigateToDoctor={() => setActiveTab('doctor')}
            onNavigateToCopilot={() => setActiveTab('copilot')}
            onNavigateToExplorer={(query) => {
              setExplorerSearchQuery(query);
              setActiveTab('explorer');
            }}
          />
        </div>

        {/* Tab 6: Recycle Bin */}
        <div className={activeTab === 'trash' ? 'flex flex-1 flex-col' : 'hidden'}>
          <RecycleBin onRestored={refreshState} />
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsSaved={refreshState}
      />
    </div>
  );
};
