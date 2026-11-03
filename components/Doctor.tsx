import {
  Stethoscope,
  Copy,
  Link2Off,
  FolderX,
  Play,
  Square,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Folder,
  RefreshCw,
  Sparkles,
  EyeOff,
  Loader2,
  AlertTriangle,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { browser } from 'wxt/browser';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { getBookmarkTree, flattenBookmarks } from '@/services/bookmarks';
import {
  findDuplicates,
  findEmptyFolders,
  scanBrokenLinks,
  resolveDuplicateGroup,
  removeEmptyFolder,
  removeBookmarkWithTrash,
  removeMultipleBookmarksWithTrash,
  findSimilarBookmarks,
  findTrackingParameters,
  cleanBookmarkUrl,
  cleanMultipleBookmarkUrls,
  findInsecureHttpBookmarks,
  upgradeBookmarkToHttps,
  upgradeMultipleBookmarksToHttps,
} from '@/services/cleaner';
import type {
  DuplicateGroup,
  EmptyFolder,
  BrokenLinkResult,
  FlatBookmark,
  SimilarGroup,
  TrackingCleanItem,
  TrackingCleanOptions,
  BookmarkTreeNode,
} from '@/types';

export type DoctorSubTab =
  | 'duplicates'
  | 'similar'
  | 'trackers'
  | 'insecure'
  | 'broken'
  | 'empty'
  | '404';

interface DoctorProps {
  onFixed?: () => void;
  initialSubTab?: DoctorSubTab;
}

export const Doctor: React.FC<DoctorProps> = React.memo(function Doctor({
  onFixed,
  initialSubTab = 'duplicates',
}) {
  const { t } = useI18n();
  const normalizeSubTab = (
    tab: DoctorSubTab
  ): 'duplicates' | 'similar' | 'trackers' | 'insecure' | 'broken' | 'empty' =>
    tab === '404' ? 'broken' : tab;
  const [subTab, setSubTab] = useState<
    'duplicates' | 'similar' | 'trackers' | 'insecure' | 'broken' | 'empty'
  >(normalizeSubTab(initialSubTab));

  // Mount on demand: only render subtabs the user has actually visited to keep DOM lightweight
  const [visitedSubTabs, setVisitedSubTabs] = useState<
    Set<'duplicates' | 'similar' | 'trackers' | 'insecure' | 'broken' | 'empty'>
  >(() => new Set([normalizeSubTab(initialSubTab)]));

  const handleSubTabChange = (
    nextTab: 'duplicates' | 'similar' | 'trackers' | 'insecure' | 'broken' | 'empty'
  ) => {
    setSubTab(nextTab);
    setVisitedSubTabs((prev) => (prev.has(nextTab) ? prev : new Set(prev).add(nextTab)));
  };

  useEffect(() => {
    if (initialSubTab) {
      const normalized = normalizeSubTab(initialSubTab);
      setSubTab(normalized);
      setVisitedSubTabs((prev) => (prev.has(normalized) ? prev : new Set(prev).add(normalized)));
    }
  }, [initialSubTab]);

  // Data states
  const [isLoading, setIsLoading] = useState(true);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [emptyFolders, setEmptyFolders] = useState<EmptyFolder[]>([]);
  const [allBookmarks, setAllBookmarks] = useState<FlatBookmark[]>([]);
  const [rawBookmarkTree, setRawBookmarkTree] = useState<BookmarkTreeNode[]>([]);

  // Similar bookmarks state
  const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
  const [selectedSimilarIds, setSelectedSimilarIds] = useState<Set<string>>(new Set());
  const [isDeletingSimilar, setIsDeletingSimilar] = useState(false);

  // Tracking parameters state
  const [trackingItems, setTrackingItems] = useState<TrackingCleanItem[]>([]);
  const [trackingOptions, setTrackingOptions] = useState<TrackingCleanOptions>({
    includeSiteSpecific: true,
    includeAffiliate: false,
  });
  const [isCleaningTrackers, setIsCleaningTrackers] = useState(false);
  const [cleanTrackersProgress, setCleanTrackersProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [cleaningSingleTrackerId, setCleaningSingleTrackerId] = useState<string | null>(null);

  // Insecure HTTP bookmarks state
  const [insecureBookmarks, setInsecureBookmarks] = useState<FlatBookmark[]>([]);
  const [isUpgradingHttps, setIsUpgradingHttps] = useState(false);
  const [upgradeHttpsProgress, setUpgradeHttpsProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [upgradingSingleId, setUpgradingSingleId] = useState<string | null>(null);

  // Broken link scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, currentUrl: '' });
  const [brokenLinks, setBrokenLinks] = useState<BrokenLinkResult[]>([]);
  const [hasScannedBroken, setHasScannedBroken] = useState(false);
  const [dismissedBrokenIds, setDismissedBrokenIds] = useState<Set<string>>(new Set());
  const [brokenFilter, setBrokenFilter] = useState<'all' | '404' | '5xx' | 'timeout'>('all');
  const [isRemovingBroken, setIsRemovingBroken] = useState(false);
  const [removingBrokenProgress, setRemovingBrokenProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [deletingBrokenId, setDeletingBrokenId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleDismissBroken = (bookmarkId: string) => {
    setDismissedBrokenIds((prev) => new Set([...prev, bookmarkId]));
    showToast('Dismissed bookmark from broken list');
  };

  const count404 = useMemo(
    () =>
      brokenLinks.filter((b) => !dismissedBrokenIds.has(b.bookmark.id) && b.statusCode === 404)
        .length,
    [brokenLinks, dismissedBrokenIds]
  );

  const count5xx = useMemo(
    () =>
      brokenLinks.filter(
        (b) => !dismissedBrokenIds.has(b.bookmark.id) && b.statusCode && b.statusCode >= 500
      ).length,
    [brokenLinks, dismissedBrokenIds]
  );

  const countTimeout = useMemo(
    () =>
      brokenLinks.filter(
        (b) =>
          !dismissedBrokenIds.has(b.bookmark.id) &&
          (!b.statusCode || (b.statusCode !== 404 && b.statusCode < 500))
      ).length,
    [brokenLinks, dismissedBrokenIds]
  );

  const activeBrokenLinks = useMemo(() => {
    return brokenLinks.filter((item) => {
      if (dismissedBrokenIds.has(item.bookmark.id)) return false;
      if (brokenFilter === '404') return item.statusCode === 404;
      if (brokenFilter === '5xx') return Boolean(item.statusCode && item.statusCode >= 500);
      if (brokenFilter === 'timeout')
        return !item.statusCode || (item.statusCode !== 404 && item.statusCode < 500);
      return true;
    });
  }, [brokenLinks, dismissedBrokenIds, brokenFilter]);

  // Action status toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const tree = await getBookmarkTree();
      setRawBookmarkTree(tree);
      // Flatten ONCE and reuse across all scanners for 5x CPU performance gain
      const flats = flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'));
      const dups = findDuplicates(flats);
      const empties = findEmptyFolders(tree);
      const similar = findSimilarBookmarks(flats);
      const trackers = findTrackingParameters(flats, trackingOptions);
      const insecures = findInsecureHttpBookmarks(flats);

      setDuplicates(dups);
      setEmptyFolders(empties);
      setAllBookmarks(flats);
      setSimilarGroups(similar);
      setTrackingItems(trackers);
      setInsecureBookmarks(insecures);
    } catch (err) {
      console.error('Failed to load doctor data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [trackingOptions]);

  useEffect(() => {
    loadData();
    return () => {
      // Abort any in-flight link scanner on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadData]);

  // --- Duplicates Actions ---
  const handleResolveGroup = async (
    group: DuplicateGroup,
    keepMode: 'newest' | 'oldest' = 'newest'
  ) => {
    const removedCount = await resolveDuplicateGroup(group, keepMode);
    setDuplicates((prev) => prev.filter((g) => g.normalizedUrl !== group.normalizedUrl));
    showToast(
      t('duplicatesCleanedMsg', { count: removedCount }) ||
        `Removed ${removedCount} duplicate(s) (kept ${keepMode}). Moved to Recycle Bin.`
    );
    if (onFixed) onFixed();
  };

  const handleRemoveSingleDuplicate = async (group: DuplicateGroup, item: FlatBookmark) => {
    await removeBookmarkWithTrash(item);
    setDuplicates((prev) =>
      prev
        .map((g) => {
          if (g.normalizedUrl === group.normalizedUrl) {
            const remaining = g.items.filter((it) => it.id !== item.id);
            return { ...g, items: remaining };
          }
          return g;
        })
        .filter((g) => g.items.length > 1)
    );
    showToast(t('brokenLinkRemoved') || 'Removed duplicate to Recycle Bin');
    if (onFixed) onFixed();
  };

  const handleCleanAllDuplicates = async () => {
    let totalRemoved = 0;
    for (const group of duplicates) {
      const count = await resolveDuplicateGroup(group, 'newest');
      totalRemoved += count;
    }
    setDuplicates([]);
    showToast(
      t('allDuplicatesCleaned', { count: totalRemoved }) ||
        `Cleaned ${totalRemoved} duplicates! Backed up in Recycle Bin.`
    );
    if (onFixed) onFixed();
  };

  // --- Similar Bookmarks Actions ---
  const toggleSelectSimilar = (id: string) => {
    setSelectedSimilarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = (group: SimilarGroup) => {
    const allGroupSelected = group.items.every((it) => selectedSimilarIds.has(it.id));
    setSelectedSimilarIds((prev) => {
      const next = new Set(prev);
      for (const it of group.items) {
        if (allGroupSelected) {
          next.delete(it.id);
        } else {
          next.add(it.id);
        }
      }
      return next;
    });
  };

  const allSimilarBookmarkIds = useMemo(
    () => similarGroups.flatMap((g) => g.items.map((it) => it.id)),
    [similarGroups]
  );

  const isAllSimilarSelected =
    allSimilarBookmarkIds.length > 0 &&
    allSimilarBookmarkIds.every((id) => selectedSimilarIds.has(id));

  const toggleSelectAllSimilar = () => {
    if (isAllSimilarSelected) {
      setSelectedSimilarIds(new Set());
    } else {
      setSelectedSimilarIds(new Set(allSimilarBookmarkIds));
    }
  };

  const handleOpenSelectedSimilar = () => {
    const selectedBookmarks = similarGroups
      .flatMap((g) => g.items)
      .filter((it) => selectedSimilarIds.has(it.id));

    for (const b of selectedBookmarks) {
      if (b.url) {
        browser.tabs.create({ url: b.url, active: false });
      }
    }
    showToast(t('openInTabs') || `Opened ${selectedBookmarks.length} tabs`);
  };

  const handleDeleteSelectedSimilar = async () => {
    if (selectedSimilarIds.size === 0 || isDeletingSimilar) return;
    setIsDeletingSimilar(true);
    try {
      const selectedItems = similarGroups
        .flatMap((g) => g.items)
        .filter((it) => selectedSimilarIds.has(it.id));

      const count = await removeMultipleBookmarksWithTrash(selectedItems);
      setSimilarGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            items: g.items.filter((it) => !selectedSimilarIds.has(it.id)),
          }))
          .filter((g) => g.items.length > 1)
      );
      setSelectedSimilarIds(new Set());
      showToast(t('brokenLinkRemoved') || `Moved ${count} bookmark(s) to Recycle Bin.`);
      if (onFixed) onFixed();
    } catch (err) {
      console.error('Failed to delete selected similar bookmarks:', err);
    } finally {
      setIsDeletingSimilar(false);
    }
  };

  const handleDeleteSingleSimilar = async (item: FlatBookmark) => {
    await removeBookmarkWithTrash(item);
    setSimilarGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          items: g.items.filter((it) => it.id !== item.id),
        }))
        .filter((g) => g.items.length > 1)
    );
    setSelectedSimilarIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    showToast(t('brokenLinkRemoved') || 'Moved bookmark to Recycle Bin');
    if (onFixed) onFixed();
  };

  // --- Tracking Parameters Actions ---
  const handleToggleTrackingOption = (key: keyof TrackingCleanOptions) => {
    const updated = { ...trackingOptions, [key]: !trackingOptions[key] };
    setTrackingOptions(updated);
    if (rawBookmarkTree.length > 0) {
      const freshTrackers = findTrackingParameters(rawBookmarkTree, updated);
      setTrackingItems(freshTrackers);
    }
  };

  const siteSpecificCount = useMemo(() => {
    if (rawBookmarkTree.length === 0) return 0;
    const all = findTrackingParameters(rawBookmarkTree, {
      includeSiteSpecific: true,
      includeAffiliate: true,
    });
    return all.filter((item) =>
      item.segments.some((s) => s.isRemoved && s.type === 'site-specific')
    ).length;
  }, [rawBookmarkTree]);

  const affiliateCount = useMemo(() => {
    if (rawBookmarkTree.length === 0) return 0;
    const all = findTrackingParameters(rawBookmarkTree, {
      includeSiteSpecific: true,
      includeAffiliate: true,
    });
    return all.filter((item) => item.segments.some((s) => s.isRemoved && s.type === 'affiliate'))
      .length;
  }, [rawBookmarkTree]);

  const handleCleanSingleTracker = async (item: TrackingCleanItem) => {
    setCleaningSingleTrackerId(item.bookmark.id);
    try {
      const ok = await cleanBookmarkUrl(item.bookmark.id, item.cleanUrl);
      if (ok) {
        setTrackingItems((prev) => prev.filter((it) => it.bookmark.id !== item.bookmark.id));
        showToast(t('cleanedUrlsSuccess', { count: 1 }) || 'Bookmark URL cleaned!');
        if (onFixed) onFixed();
      }
    } catch (err) {
      console.error('Failed to clean bookmark URL:', err);
    } finally {
      setCleaningSingleTrackerId(null);
    }
  };

  const handleCleanAllTrackers = async () => {
    if (trackingItems.length === 0 || isCleaningTrackers) return;
    setIsCleaningTrackers(true);
    setCleanTrackersProgress({ current: 0, total: trackingItems.length });
    try {
      const itemsToClean = trackingItems.map((it) => ({
        id: it.bookmark.id,
        cleanUrl: it.cleanUrl,
      }));
      const count = await cleanMultipleBookmarkUrls(itemsToClean, (current, total) =>
        setCleanTrackersProgress({ current, total })
      );
      setTrackingItems([]);
      showToast(
        t('cleanedUrlsSuccess', { count }) || `Cleaned ${count} bookmark URLs successfully.`
      );
      if (onFixed) onFixed();
      const tree = await getBookmarkTree();
      setRawBookmarkTree(tree);
    } catch (err) {
      console.error('Failed to clean all tracking parameters:', err);
    } finally {
      setIsCleaningTrackers(false);
      setCleanTrackersProgress(null);
    }
  };

  // --- Insecure HTTP Actions ---
  const handleUpgradeSingleHttps = async (item: FlatBookmark) => {
    setUpgradingSingleId(item.id);
    try {
      const ok = await upgradeBookmarkToHttps(item.id, item.url);
      if (ok) {
        setInsecureBookmarks((prev) => prev.filter((b) => b.id !== item.id));
        showToast(t('upgradedHttpsSuccess', { count: 1 }) || 'Upgraded bookmark to HTTPS!');
        if (onFixed) onFixed();
      }
    } catch (err) {
      console.error('Failed to upgrade bookmark to HTTPS:', err);
    } finally {
      setUpgradingSingleId(null);
    }
  };

  const handleUpgradeAllHttps = async () => {
    if (insecureBookmarks.length === 0 || isUpgradingHttps) return;
    setIsUpgradingHttps(true);
    setUpgradeHttpsProgress({ current: 0, total: insecureBookmarks.length });
    try {
      const items = insecureBookmarks.map((b) => ({ id: b.id, url: b.url }));
      const count = await upgradeMultipleBookmarksToHttps(items, (current, total) => {
        setUpgradeHttpsProgress({ current, total });
      });
      setInsecureBookmarks([]);
      showToast(t('upgradedHttpsSuccess', { count }) || `Upgraded ${count} bookmark(s) to HTTPS!`);
      if (onFixed) onFixed();
      const tree = await getBookmarkTree();
      setRawBookmarkTree(tree);
    } catch (err) {
      console.error('Failed to upgrade all bookmarks to HTTPS:', err);
    } finally {
      setIsUpgradingHttps(false);
      setUpgradeHttpsProgress(null);
    }
  };

  const handleDismissInsecure = (bookmarkId: string) => {
    setInsecureBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    showToast('Dismissed bookmark from insecure list');
  };

  const handleRemoveInsecure = async (item: FlatBookmark) => {
    await removeBookmarkWithTrash(item);
    setInsecureBookmarks((prev) => prev.filter((b) => b.id !== item.id));
    showToast(t('brokenLinkRemoved') || 'Removed link to Recycle Bin');
    if (onFixed) onFixed();
  };

  // --- Broken Links Actions ---
  const startScan = async () => {
    if (allBookmarks.length === 0) return;
    setIsScanning(true);
    setHasScannedBroken(true);
    setBrokenLinks([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const results = await scanBrokenLinks(
        allBookmarks,
        (scanned, total, current) => {
          setScanProgress({
            current: scanned,
            total,
            currentUrl: current?.title || current?.domain || '',
          });
        },
        controller.signal,
        8 // concurrency
      );
      setBrokenLinks(results);
    } catch (err) {
      console.warn('Scan aborted or failed:', err);
    } finally {
      setIsScanning(false);
      abortControllerRef.current = null;
    }
  };

  const stopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsScanning(false);
    }
  };

  const handleRemoveBroken = async (item: BrokenLinkResult) => {
    if (deletingBrokenId) return;
    setDeletingBrokenId(item.bookmark.id);
    try {
      await removeBookmarkWithTrash(item.bookmark);
      setBrokenLinks((prev) => prev.filter((b) => b.bookmark.id !== item.bookmark.id));
      showToast(t('brokenLinkRemoved') || `Removed "${item.bookmark.title}" to Recycle Bin`);
      if (onFixed) onFixed();
    } finally {
      setDeletingBrokenId(null);
    }
  };

  const handleRemoveBrokenBatch = async (onlyFiltered = false) => {
    if (isRemovingBroken) return;
    const targets = onlyFiltered
      ? activeBrokenLinks
      : brokenLinks.filter((b) => !dismissedBrokenIds.has(b.bookmark.id));
    if (targets.length === 0) return;

    setIsRemovingBroken(true);
    setRemovingBrokenProgress({ current: 0, total: targets.length });

    try {
      const removedCount = await removeMultipleBookmarksWithTrash(
        targets.map((t) => t.bookmark),
        (current, total) => {
          setRemovingBrokenProgress({ current, total });
        }
      );

      const targetIds = new Set(targets.map((t) => t.bookmark.id));
      setBrokenLinks((prev) => prev.filter((b) => !targetIds.has(b.bookmark.id)));

      showToast(
        t('allBrokenRemoved', { count: removedCount }) ||
          `Removed ${removedCount} broken link(s). Backed up in Recycle Bin.`
      );
      if (onFixed) onFixed();
    } catch (err) {
      console.error('Failed to remove batch broken links:', err);
    } finally {
      setIsRemovingBroken(false);
      setRemovingBrokenProgress(null);
    }
  };

  // --- Empty Folders Actions ---
  const handleRemoveEmptyFolder = async (folder: EmptyFolder) => {
    const ok = await removeEmptyFolder(folder);
    if (ok) {
      setEmptyFolders((prev) => prev.filter((f) => f.id !== folder.id));
      showToast(t('folderRemoved') || `Removed empty folder "${folder.title}" to Recycle Bin`);
      if (onFixed) onFixed();
    }
  };

  const handleCleanAllEmptyFolders = async () => {
    let count = 0;
    for (const f of emptyFolders) {
      const ok = await removeEmptyFolder(f);
      if (ok) count++;
    }
    setEmptyFolders([]);
    showToast(
      t('allEmptyFoldersCleaned', { count }) ||
        `Cleaned ${count} empty folders. Backed up in Recycle Bin.`
    );
    if (onFixed) onFixed();
  };

  const totalDuplicateBookmarks = duplicates.reduce((acc, g) => acc + (g.items.length - 1), 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col space-y-4 p-4">
      {/* Header */}
      <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              {t('doctorTitle') || 'Bookmark Doctor'}
            </h2>
            <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px] font-medium">
              {duplicates.length +
                emptyFolders.length +
                brokenLinks.length +
                similarGroups.length +
                trackingItems.length +
                insecureBookmarks.length}{' '}
              {t('issuesLabel') || 'issues'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('doctorDesc') || 'Detect duplicates, test 404 links, and sweep empty folders.'}
          </p>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={loadData}
          disabled={isLoading || isScanning}
          className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs active:scale-[0.97]"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Subtab Segmented Control */}
      <div className="bg-muted/30 border-border/60 grid grid-cols-6 gap-0.5 rounded-lg border p-1 select-none">
        <button
          onClick={() => handleSubTabChange('duplicates')}
          className={`flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            subTab === 'duplicates'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t('tabDuplicates') || 'Duplicates'}
        >
          <Copy className="size-3 shrink-0 text-amber-500" />
          <span className="truncate text-[11px]">{t('tabDuplicates') || 'Duplicates'}</span>
          {totalDuplicateBookmarks > 0 && (
            <Badge
              variant="secondary"
              className="h-3.5 shrink-0 bg-amber-500/15 px-1 py-0 text-[8.5px] font-semibold text-amber-600 dark:text-amber-400"
            >
              {totalDuplicateBookmarks}
            </Badge>
          )}
        </button>

        <button
          onClick={() => handleSubTabChange('similar')}
          className={`flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            subTab === 'similar'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t('tabSimilar') || 'Similar'}
        >
          <Layers className="size-3 shrink-0 text-cyan-500" />
          <span className="truncate text-[11px]">{t('tabSimilar') || 'Similar'}</span>
          {similarGroups.length > 0 && (
            <Badge
              variant="secondary"
              className="h-3.5 shrink-0 bg-cyan-500/15 px-1 py-0 text-[8.5px] font-semibold text-cyan-600 dark:text-cyan-400"
            >
              {similarGroups.length}
            </Badge>
          )}
        </button>

        <button
          onClick={() => handleSubTabChange('trackers')}
          className={`flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            subTab === 'trackers'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t('tabTrackers') || 'Trackers'}
        >
          <ShieldCheck className="size-3 shrink-0 text-teal-500" />
          <span className="truncate text-[11px]">{t('tabTrackers') || 'Trackers'}</span>
          {trackingItems.length > 0 && (
            <Badge
              variant="secondary"
              className="h-3.5 shrink-0 bg-teal-500/15 px-1 py-0 text-[8.5px] font-semibold text-teal-600 dark:text-teal-400"
            >
              {trackingItems.length}
            </Badge>
          )}
        </button>

        <button
          onClick={() => handleSubTabChange('insecure')}
          className={`flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            subTab === 'insecure'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t('tabInsecure') || 'Insecure HTTP'}
        >
          <ShieldAlert className="size-3 shrink-0 text-amber-500" />
          <span className="truncate text-[11px]">{t('tabInsecure') || 'HTTP'}</span>
          {insecureBookmarks.length > 0 && (
            <Badge
              variant="secondary"
              className="h-3.5 shrink-0 bg-amber-500/15 px-1 py-0 text-[8.5px] font-semibold text-amber-600 dark:text-amber-400"
            >
              {insecureBookmarks.length}
            </Badge>
          )}
        </button>

        <button
          onClick={() => handleSubTabChange('broken')}
          className={`flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            subTab === 'broken'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t('tabBroken') || '404 Links'}
        >
          <Link2Off className="size-3 shrink-0 text-rose-500" />
          <span className="truncate text-[11px]">{t('tabBroken') || '404'}</span>
          {brokenLinks.length > 0 && (
            <Badge
              variant="destructive"
              className="h-3.5 shrink-0 px-1 py-0 text-[8.5px] font-semibold"
            >
              {brokenLinks.length}
            </Badge>
          )}
        </button>

        <button
          onClick={() => handleSubTabChange('empty')}
          className={`flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            subTab === 'empty'
              ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t('tabEmptyFolders') || 'Empty Folders'}
        >
          <FolderX className="size-3 shrink-0 text-blue-500" />
          <span className="truncate text-[11px]">{t('tabEmptyFolders') || 'Empty'}</span>
          {emptyFolders.length > 0 && (
            <Badge
              variant="secondary"
              className="h-3.5 shrink-0 bg-blue-500/15 px-1 py-0 text-[8.5px] font-semibold text-blue-600 dark:text-blue-400"
            >
              {emptyFolders.length}
            </Badge>
          )}
        </button>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* ===================== TAB 1: DUPLICATES ===================== */}
      {visitedSubTabs.has('duplicates') && (
        <div className={subTab === 'duplicates' ? 'space-y-3' : 'hidden'}>
          {duplicates.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
              <div className="text-xs">
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  {totalDuplicateBookmarks}{' '}
                  {t('duplicateItemsFound') || 'duplicate bookmarks found'}
                </span>
                <p className="mt-0.5 text-[11px] text-amber-600/80 dark:text-amber-400/80">
                  {t('duplicateDesc') ||
                    'Clean redundant copies while preserving the newest saved item.'}
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={handleCleanAllDuplicates}
                className="h-7 border-amber-500/40 text-xs font-medium text-amber-700 hover:bg-amber-500/20 active:scale-[0.97] dark:text-amber-300"
              >
                <Sparkles className="mr-1 size-3" />
                {t('cleanAllDuplicatesBtn') || 'Clean All (Keep Newest)'}
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
            </div>
          ) : duplicates.length === 0 ? (
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-12 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <h3 className="text-foreground text-xs font-semibold">
                {t('noDuplicatesTitle') || 'No Duplicates Found'}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {t('noDuplicatesDesc') || 'All your bookmark URLs are unique and clean.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {duplicates.map((group, idx) => {
                const isExpanded = expandedGroups[group.normalizedUrl] ?? false;
                const visibleItems =
                  isExpanded || group.items.length <= 3 ? group.items : group.items.slice(0, 3);
                const hasMore = group.items.length > 3;

                return (
                  <div
                    key={idx}
                    className="border-border/60 bg-card overflow-hidden rounded-lg border shadow-2xs transition-[border-color,background-color,box-shadow] duration-150"
                  >
                    {/* Group Header */}
                    <div className="bg-muted/20 border-border/40 flex items-center justify-between gap-2 border-b px-3 py-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <img
                          src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
                            group.displayUrl
                          )}&sz=32`}
                          alt=""
                          className="size-3.5 shrink-0 rounded-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="text-foreground truncate text-xs font-semibold">
                          {group.domain}
                        </span>
                        <Badge
                          variant="secondary"
                          className="h-4 px-1.5 py-0 font-mono text-[9.5px] font-medium"
                        >
                          {group.items.length} copies
                        </Badge>
                      </div>

                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleResolveGroup(group, 'newest')}
                        className="h-6 cursor-pointer border-amber-400/50 px-2 text-[10.5px] font-medium text-amber-700 hover:bg-amber-500/10 active:scale-[0.97] dark:text-amber-300"
                      >
                        {t('keepNewestBtn') || 'Keep Newest'}
                      </Button>
                    </div>

                    {/* Compact Flat List of copies */}
                    <div className="divide-border/30 divide-y text-xs">
                      {visibleItems.map((item, itemIdx) => (
                        <div
                          key={item.id}
                          className={`group flex items-center justify-between gap-2 px-3 py-1.5 transition-colors ${
                            itemIdx === 0 ? 'bg-emerald-500/5' : 'hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-1.5">
                            {itemIdx === 0 ? (
                              <Badge
                                variant="outline"
                                className="h-3.5 shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1 py-0 text-[8.5px] font-medium text-emerald-600 dark:text-emerald-400"
                              >
                                {t('newestBadge') || 'Newest'}
                              </Badge>
                            ) : (
                              <span className="bg-muted-foreground/40 ml-1 size-1 shrink-0 rounded-full" />
                            )}

                            <span className="text-muted-foreground truncate text-[11px] select-none">
                              📁 {item.path}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground cursor-pointer p-1 transition-transform active:scale-90"
                              title="Open in new tab"
                            >
                              <ExternalLink className="size-3" />
                            </a>
                            {itemIdx !== 0 && (
                              <button
                                onClick={() => handleRemoveSingleDuplicate(group, item)}
                                className="text-muted-foreground cursor-pointer p-1 transition-[color,transform] duration-120 hover:text-rose-500 active:scale-90"
                                title="Delete this copy"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Expand/Collapse Footer if > 3 items */}
                    {hasMore && (
                      <div className="bg-muted/10 border-border/30 border-t px-3 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => toggleGroupExpanded(group.normalizedUrl)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] font-medium transition-colors"
                        >
                          {isExpanded
                            ? 'Show less'
                            : `+ Show ${group.items.length - 3} more copies`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: SIMILAR BOOKMARKS ===================== */}
      {visitedSubTabs.has('similar') && (
        <div className={subTab === 'similar' ? 'space-y-3' : 'hidden'}>
          {/* Header Hero Banner */}
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-[10px] font-semibold tracking-wider text-cyan-600 uppercase dark:text-cyan-400">
                  {t('doctorTitle') || 'DOCTOR'} ·{' '}
                  {t('similarSubtitle') || 'Nearly identical titles or URLs'}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Layers className="size-4 shrink-0 text-cyan-500" />
                  <h3 className="text-foreground text-sm font-bold">
                    {t('similarTitle') || 'Similar Bookmarks'}
                  </h3>
                  <span className="text-muted-foreground font-mono text-xs">
                    {t('similarFound', { count: similarGroups.length }) ||
                      `${similarGroups.length} similarities in total`}
                  </span>
                </div>
              </div>

              {/* Batch actions when bookmarks are selected */}
              {selectedSimilarIds.size > 0 && (
                <div className="animate-in fade-in flex items-center gap-1.5 duration-150">
                  <Badge
                    variant="outline"
                    className="h-6 border-cyan-500/30 px-2 font-mono text-[10px] text-cyan-600 dark:text-cyan-400"
                  >
                    {selectedSimilarIds.size} selected
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenSelectedSimilar}
                    className="h-7 border-cyan-500/30 px-2 text-xs text-cyan-700 hover:bg-cyan-500/10 active:scale-[0.97] dark:text-cyan-300"
                    title="Open selected bookmarks in tabs"
                  >
                    <ExternalLink className="mr-1 size-3" />
                    {t('openInTabs') || 'Open in Tabs'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleDeleteSelectedSimilar}
                    disabled={isDeletingSimilar}
                    className="h-7 px-2 text-xs active:scale-[0.97]"
                  >
                    {isDeletingSimilar ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 size-3" />
                    )}
                    {t('deleteSelected') || 'Delete Selected'}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Global Select All Bar (if groups exist) */}
          {similarGroups.length > 0 && (
            <div className="text-muted-foreground flex items-center justify-between px-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={isAllSimilarSelected}
                  onChange={toggleSelectAllSimilar}
                  className="border-border size-3.5 cursor-pointer rounded accent-cyan-600"
                />
                <span className="text-foreground text-[11px] font-medium">
                  {isAllSimilarSelected ? 'Deselect All' : 'Select All Bookmarks'}
                </span>
              </label>
              <span className="text-muted-foreground font-mono text-[10px]">
                {similarGroups.reduce((acc, g) => acc + g.items.length, 0)} total links
              </span>
            </div>
          )}

          {/* Group Cards List */}
          {isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
            </div>
          ) : similarGroups.length === 0 ? (
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-12 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <h3 className="text-foreground text-xs font-semibold">
                {t('noSimilarTitle') || 'No Similar Bookmarks'}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {t('noSimilarDesc') ||
                  'No overlapping base URLs or near-duplicate titles detected.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {similarGroups.map((group) => {
                const isGroupAllSelected = group.items.every((it) => selectedSimilarIds.has(it.id));
                return (
                  <div
                    key={group.id}
                    className="border-border/60 bg-card overflow-hidden rounded-lg border shadow-2xs"
                  >
                    {/* Group Header */}
                    <div className="bg-muted/30 border-border/40 flex items-center justify-between gap-2 border-b px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isGroupAllSelected}
                          onChange={() => toggleSelectGroup(group)}
                          className="border-border size-3.5 shrink-0 cursor-pointer rounded accent-cyan-600"
                        />
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${group.domain}&sz=32`}
                          alt=""
                          className="size-3.5 shrink-0 rounded-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span
                          className="text-foreground truncate font-mono text-xs font-semibold"
                          title={group.baseUrl}
                        >
                          {group.baseUrl}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className="h-4 shrink-0 px-1.5 py-0 font-mono text-[9px]"
                      >
                        {group.items.length} links
                      </Badge>
                    </div>

                    {/* Group Items */}
                    <div className="divide-border/30 divide-y">
                      {group.items.map((item) => {
                        const isSelected = selectedSimilarIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`group hover:bg-muted/40 flex items-center justify-between gap-2.5 px-3 py-2 transition-colors ${
                              isSelected ? 'bg-cyan-500/5' : ''
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectSimilar(item.id)}
                                className="border-border size-3.5 shrink-0 cursor-pointer rounded accent-cyan-600"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-foreground truncate text-xs font-medium">
                                    {item.title || item.domain}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2">
                                  <span
                                    className="text-muted-foreground/75 max-w-[240px] truncate font-mono text-[10px]"
                                    title={item.url}
                                  >
                                    {item.url}
                                  </span>
                                  {item.path && (
                                    <Badge
                                      variant="outline"
                                      className="text-muted-foreground border-border/50 h-3.5 max-w-[120px] shrink-0 truncate px-1 py-0 text-[8.5px]"
                                      title={item.path}
                                    >
                                      📁 {item.path}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Item Actions */}
                            <div className="flex shrink-0 items-center gap-1 opacity-80 group-hover:opacity-100">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
                                title={t('openInTabTooltip') || 'Open in new tab'}
                              >
                                <ExternalLink className="size-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleSimilar(item)}
                                className="text-muted-foreground cursor-pointer rounded p-1 transition-[color,transform] duration-120 hover:text-rose-500 active:scale-90"
                                title="Move to Recycle Bin"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: TRACKING PARAMETERS ===================== */}
      {visitedSubTabs.has('trackers') && (
        <div className={subTab === 'trackers' ? 'space-y-3' : 'hidden'}>
          {/* Header Hero Banner */}
          <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-[10px] font-semibold tracking-wider text-teal-600 uppercase dark:text-teal-400">
                  {t('doctorTitle') || 'DOCTOR'} ·{' '}
                  {t('trackersSubtitle') || 'utm_ and other trackers in saved URLs'}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-teal-500" />
                  <h3 className="text-foreground text-sm font-bold">
                    {t('trackersTitle') || 'Tracking Parameters'}
                  </h3>
                  <span className="text-muted-foreground font-mono text-xs">
                    {t('trackersFound', { count: trackingItems.length }) ||
                      `${trackingItems.length} bookmarks will be cleaned`}
                  </span>
                </div>
              </div>

              {/* Clean All Button */}
              {trackingItems.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleCleanAllTrackers}
                  disabled={isCleaningTrackers}
                  className="h-7 cursor-pointer border border-teal-500/40 bg-teal-600 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 active:scale-[0.97] dark:bg-teal-500 dark:hover:bg-teal-600"
                >
                  {isCleaningTrackers ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      <span>
                        {cleanTrackersProgress
                          ? `${cleanTrackersProgress.current}/${cleanTrackersProgress.total}`
                          : t('cleaningUrls') || 'Cleaning...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1 size-3" />
                      <span>{t('cleanAllUrlsBtn') || 'Clean All URLs'}</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Options Toggles */}
            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-teal-500/15 pt-2.5 text-xs select-none">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={trackingOptions.includeSiteSpecific}
                  onChange={() => handleToggleTrackingOption('includeSiteSpecific')}
                  className="border-border size-3.5 cursor-pointer rounded accent-amber-500"
                />
                <span className="text-foreground text-[11.5px] font-medium">
                  {t('siteSpecificClean') || 'Site-specific deep clean'}
                </span>
                {siteSpecificCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 bg-amber-500/15 px-1.5 py-0 font-mono text-[9px] font-semibold text-amber-600 dark:text-amber-400"
                  >
                    {siteSpecificCount}
                  </Badge>
                )}
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={trackingOptions.includeAffiliate}
                  onChange={() => handleToggleTrackingOption('includeAffiliate')}
                  className="border-border size-3.5 cursor-pointer rounded accent-purple-500"
                />
                <span className="text-foreground text-[11.5px] font-medium">
                  {t('affiliateTags') || 'Affiliate tags'}
                </span>
                {affiliateCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 bg-purple-500/15 px-1.5 py-0 font-mono text-[9px] font-semibold text-purple-600 dark:text-purple-400"
                  >
                    {affiliateCount}
                  </Badge>
                )}
              </label>
            </div>

            {/* Visual Legend */}
            <div className="text-muted-foreground/85 mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px]">
              <span className="font-medium text-rose-500 line-through">struck through</span>
              <span>= will be removed</span>
              <span>·</span>
              <span className="font-medium text-amber-500 line-through decoration-dotted">
                dotted
              </span>
              <span>= removed only if its toggle above is on</span>
            </div>
          </div>

          {/* List of Tracked Bookmarks */}
          {isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
            </div>
          ) : trackingItems.length === 0 ? (
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-12 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <h3 className="text-foreground text-xs font-semibold">
                {t('noTrackersTitle') || 'URLs Are Clean!'}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {t('noTrackersDesc') ||
                  'No marketing trackers (utm, fbclid, gclid) found in your saved URLs.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {trackingItems.map((item) => {
                const isCleaningThis = cleaningSingleTrackerId === item.bookmark.id;
                return (
                  <div
                    key={item.bookmark.id}
                    className="group border-border/50 bg-card hover:border-border rounded-lg border p-3 shadow-2xs transition-[border-color,background-color] duration-120"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Title & Domain */}
                        <div className="flex items-center gap-2">
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${item.bookmark.domain}&sz=32`}
                            alt=""
                            className="size-3.5 shrink-0 rounded-xs"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <span className="text-foreground truncate text-xs font-semibold">
                            {item.bookmark.title || item.bookmark.domain}
                          </span>
                          {item.bookmark.path && (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground border-border/50 h-4 max-w-[130px] shrink-0 truncate px-1.5 py-0 text-[9px]"
                              title={item.bookmark.path}
                            >
                              📁 {item.bookmark.path}
                            </Badge>
                          )}
                        </div>

                        {/* Strikethrough URL segments */}
                        <div className="bg-muted/25 border-border/30 rounded border p-1.5 font-mono text-[10.5px] leading-relaxed break-all">
                          {item.segments.map((seg, idx) => {
                            if (!seg.isRemoved) {
                              return (
                                <span key={idx} className="text-foreground/80">
                                  {seg.text}
                                </span>
                              );
                            }
                            if (seg.type === 'site-specific') {
                              return (
                                <span
                                  key={idx}
                                  className="rounded-xs bg-amber-500/10 px-0.5 font-semibold text-amber-600 line-through decoration-dotted dark:text-amber-400"
                                  title="Site-specific tracking parameter"
                                >
                                  {seg.text}
                                </span>
                              );
                            }
                            if (seg.type === 'affiliate') {
                              return (
                                <span
                                  key={idx}
                                  className="rounded-xs bg-purple-500/10 px-0.5 font-semibold text-purple-600 line-through decoration-dashed dark:text-purple-400"
                                  title="Affiliate referral parameter"
                                >
                                  {seg.text}
                                </span>
                              );
                            }
                            return (
                              <span
                                key={idx}
                                className="rounded-xs bg-rose-500/10 px-0.5 font-semibold text-rose-600 line-through dark:text-rose-400"
                                title="Universal tracking parameter"
                              >
                                {seg.text}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* Quick Clean Action */}
                      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isCleaningThis || isCleaningTrackers}
                          onClick={() => handleCleanSingleTracker(item)}
                          className="h-7 cursor-pointer border-teal-500/30 px-2 text-xs text-teal-700 hover:bg-teal-500/10 active:scale-[0.97] dark:text-teal-300"
                          title="Clean tracking parameters from this URL"
                        >
                          {isCleaningThis ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                          ) : (
                            <Sparkles className="mr-1 size-3" />
                          )}
                          <span>Clean</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 4: INSECURE HTTP ===================== */}
      {visitedSubTabs.has('insecure') && (
        <div className={subTab === 'insecure' ? 'space-y-3' : 'hidden'}>
          {/* Header Hero Banner */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-[10px] font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
                  {t('doctorTitle') || 'DOCTOR'} ·{' '}
                  {t('insecureSubtitle') || 'Bookmarks saved over unencrypted HTTP'}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <ShieldAlert className="size-4 shrink-0 text-amber-500" />
                  <h3 className="text-foreground text-sm font-bold">
                    {t('insecureTitle') || 'Insecure HTTP Bookmarks'}
                  </h3>
                  <span className="text-muted-foreground font-mono text-xs">
                    {t('insecureFound', { count: insecureBookmarks.length }) ||
                      `${insecureBookmarks.length} insecure links found`}
                  </span>
                </div>
              </div>

              {/* Upgrade All Button */}
              {insecureBookmarks.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleUpgradeAllHttps}
                  disabled={isUpgradingHttps}
                  className="h-7 cursor-pointer border border-amber-500/40 bg-amber-600 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 active:scale-[0.97] dark:bg-amber-500 dark:hover:bg-amber-600"
                >
                  {isUpgradingHttps ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      <span>
                        {upgradeHttpsProgress
                          ? `${upgradeHttpsProgress.current}/${upgradeHttpsProgress.total}`
                          : t('upgradingHttps') || 'Upgrading...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock className="mr-1 size-3" />
                      <span>{t('upgradeAllHttpsBtn') || 'Upgrade All to HTTPS'}</span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Notice about ignored localhost and private IPs */}
            <div className="text-muted-foreground/90 mt-3 flex items-center gap-1.5 border-t border-amber-500/15 pt-2.5 text-[10.5px]">
              <span className="font-medium text-amber-700 dark:text-amber-300">
                🔒{' '}
                {t('localExcludedNotice') ||
                  'Localhost, 127.0.0.1, and private LAN IP addresses are automatically excluded.'}
              </span>
            </div>
          </div>

          {/* List of Insecure Bookmarks */}
          {isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
            </div>
          ) : insecureBookmarks.length === 0 ? (
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-12 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <h3 className="text-foreground text-xs font-semibold">
                {t('noInsecureTitle') || 'All URLs Are Secure!'}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {t('noInsecureDesc') ||
                  'All public bookmarks use encrypted HTTPS. No unencrypted HTTP links found.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {insecureBookmarks.map((item) => {
                const isUpgradingThis = upgradingSingleId === item.id;
                const pathPart = item.url.slice(7);
                return (
                  <div
                    key={item.id}
                    className="group border-border/50 bg-card hover:border-border rounded-lg border p-3 shadow-2xs transition-[border-color,background-color] duration-120"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Title & Domain */}
                        <div className="flex items-center gap-2">
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`}
                            alt=""
                            className="size-3.5 shrink-0 rounded-xs"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <span className="text-foreground truncate text-xs font-semibold">
                            {item.title || item.domain}
                          </span>
                          {item.path && (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground border-border/50 h-4 max-w-[130px] shrink-0 truncate px-1.5 py-0 text-[9px]"
                              title={item.path}
                            >
                              📁 {item.path}
                            </Badge>
                          )}
                        </div>

                        {/* URL comparison with protocol highlight */}
                        <div className="bg-muted/25 border-border/30 flex items-center gap-1.5 rounded border p-1.5 font-mono text-[10.5px] leading-relaxed break-all">
                          <span className="rounded-xs bg-amber-500/10 px-0.5 font-semibold text-amber-600 line-through dark:text-amber-400">
                            http://
                          </span>
                          <span className="text-muted-foreground truncate">{pathPart}</span>
                          <span className="text-muted-foreground/60 shrink-0">→</span>
                          <span className="shrink-0 rounded-xs bg-emerald-500/10 px-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                            https://
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1 pt-0.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpgradingThis || isUpgradingHttps}
                          onClick={() => handleUpgradeSingleHttps(item)}
                          className="h-7 cursor-pointer border-amber-500/30 px-2 text-xs text-amber-700 hover:bg-amber-500/10 active:scale-[0.97] dark:text-amber-300"
                          title="Upgrade this bookmark to HTTPS"
                        >
                          {isUpgradingThis ? (
                            <Loader2 className="mr-1 size-3 animate-spin" />
                          ) : (
                            <Lock className="mr-1 size-3" />
                          )}
                          <span>{t('upgradeSingleBtn') || 'Upgrade'}</span>
                        </Button>

                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
                          title={t('openInTabTooltip') || 'Open in new tab'}
                        >
                          <ExternalLink className="size-3" />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDismissInsecure(item.id)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
                          title="Dismiss (Keep as HTTP)"
                        >
                          <EyeOff className="size-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveInsecure(item)}
                          className="text-muted-foreground cursor-pointer rounded p-1 transition-[color,transform] duration-120 hover:text-rose-500 active:scale-90"
                          title="Move to Recycle Bin"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 5: BROKEN LINKS ===================== */}
      {visitedSubTabs.has('broken') && (
        <div className={subTab === 'broken' ? 'space-y-3' : 'hidden'}>
          {/* Scanner Controls Card */}
          <div className="border-border/60 bg-muted/15 space-y-2.5 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-foreground text-xs font-semibold">
                  {t('brokenLinkScannerTitle') || 'Link Health Checker'}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-[10.5px]">
                  {t('brokenLinkScannerDesc') ||
                    'Tests your bookmarks via browser fetch for 404 Not Found & dead links.'}
                </p>
              </div>

              {isScanning ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={stopScan}
                  className="h-7 cursor-pointer px-2.5 text-xs active:scale-[0.97]"
                >
                  <Square className="mr-1 size-3 fill-current" />
                  {t('stopScanBtn') || 'Stop'}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  onClick={startScan}
                  className="h-7 cursor-pointer px-2.5 text-xs font-medium active:scale-[0.97]"
                >
                  <Play className="mr-1 size-3 fill-current" />
                  {hasScannedBroken
                    ? t('reScanBtn') || 'Re-Scan All'
                    : t('scanAllLinksBtn') || 'Scan All Links'}
                </Button>
              )}
            </div>

            {/* Live Progress Bar */}
            {isScanning && (
              <div className="animate-in fade-in space-y-1.5 duration-150">
                <div className="text-muted-foreground flex justify-between text-[10.5px]">
                  <span className="max-w-[200px] truncate font-mono">
                    {scanProgress.currentUrl || 'Testing...'}
                  </span>
                  <span className="font-mono">
                    {scanProgress.current} / {scanProgress.total} (
                    {Math.round((scanProgress.current / (scanProgress.total || 1)) * 100)}%)
                  </span>
                </div>
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-[width] duration-150 ease-out"
                    style={{
                      width: `${(scanProgress.current / (scanProgress.total || 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results Banner & Filters */}
          {brokenLinks.length > 0 && (
            <div className="space-y-2">
              <div className="space-y-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5">
                      {isRemovingBroken ? (
                        <Loader2 className="size-3.5 animate-spin text-rose-600 dark:text-rose-400" />
                      ) : (
                        <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400" />
                      )}
                      <span className="font-semibold text-rose-700 dark:text-rose-300">
                        {isRemovingBroken
                          ? `Removing broken links (${removingBrokenProgress?.current || 0}/${
                              removingBrokenProgress?.total || 0
                            })...`
                          : `${brokenLinks.length - dismissedBrokenIds.size} ${
                              t('brokenLinksDetected') || 'broken link(s) found'
                            }`}
                      </span>
                    </div>
                    <p className="mt-0.5 pl-5 text-[10px] text-rose-600/80 dark:text-rose-400/80">
                      {isRemovingBroken
                        ? 'Safely moving bookmarks to Recycle Bin...'
                        : t('brokenLinksNotice') || 'Safely moved to Recycle Bin when removed.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={isRemovingBroken || activeBrokenLinks.length === 0}
                      onClick={() => handleRemoveBrokenBatch(brokenFilter !== 'all')}
                      className="h-7 cursor-pointer gap-1 px-3 text-[11px] font-medium shadow-xs active:scale-[0.97]"
                    >
                      {isRemovingBroken ? (
                        <>
                          <Loader2 className="size-3 animate-spin" />
                          <span>
                            {removingBrokenProgress
                              ? `${Math.round(
                                  (removingBrokenProgress.current /
                                    (removingBrokenProgress.total || 1)) *
                                    100
                                )}%`
                              : 'Removing...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="size-3" />
                          <span>
                            {brokenFilter !== 'all'
                              ? `Remove ${activeBrokenLinks.length} Filtered`
                              : `Remove All (${brokenLinks.length - dismissedBrokenIds.size})`}
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Real-time Animated Deletion Progress Bar */}
                {isRemovingBroken && removingBrokenProgress && (
                  <div className="animate-in fade-in h-1.5 w-full overflow-hidden rounded-full bg-rose-500/20 duration-150">
                    <div
                      className="h-full bg-rose-500 transition-[width] duration-100 ease-out"
                      style={{
                        width: `${
                          (removingBrokenProgress.current / (removingBrokenProgress.total || 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => setBrokenFilter('all')}
                  className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                    brokenFilter === 'all'
                      ? 'bg-primary/10 text-primary border-primary/20 border font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All ({brokenLinks.length - dismissedBrokenIds.size})
                </button>
                {count404 > 0 && (
                  <button
                    type="button"
                    onClick={() => setBrokenFilter('404')}
                    className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                      brokenFilter === '404'
                        ? 'border border-rose-500/30 bg-rose-500/15 font-semibold text-rose-600 dark:text-rose-400'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    HTTP 404 ({count404})
                  </button>
                )}
                {count5xx > 0 && (
                  <button
                    type="button"
                    onClick={() => setBrokenFilter('5xx')}
                    className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                      brokenFilter === '5xx'
                        ? 'border border-orange-500/30 bg-orange-500/15 font-semibold text-orange-600 dark:text-orange-400'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    5xx Error ({count5xx})
                  </button>
                )}
                {countTimeout > 0 && (
                  <button
                    type="button"
                    onClick={() => setBrokenFilter('timeout')}
                    className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                      brokenFilter === 'timeout'
                        ? 'border border-amber-500/30 bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Timeout / Dead ({countTimeout})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* State 1: Prompt to Scan */}
          {!hasScannedBroken ? (
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-10 text-center">
              <Stethoscope className="text-muted-foreground/50 mb-2 size-8" />
              <p className="text-muted-foreground max-w-xs text-xs">
                {t('clickScanPrompt') ||
                  'Click "Scan All Links" above to verify HTTP response statuses for all bookmarks.'}
              </p>
            </div>
          ) : activeBrokenLinks.length === 0 && !isScanning ? (
            /* State 2: Healthy or all dismissed */
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-12 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <h3 className="text-foreground text-xs font-semibold">
                {t('allLinksAliveTitle') || 'All Links Are Healthy!'}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {t('allLinksAliveDesc') || 'No 404 or dead URLs were found in your bookmarks.'}
              </p>
            </div>
          ) : (
            /* State 3: Compact Sleek Table List */
            <div className="border-border/60 bg-card divide-border/30 divide-y overflow-hidden rounded-lg border shadow-2xs">
              {activeBrokenLinks.map((item) => {
                const displayTitle =
                  item.bookmark.title?.trim() || item.bookmark.domain || item.bookmark.url;
                const is404 = item.statusCode === 404;
                const is5xx = Boolean(item.statusCode && item.statusCode >= 500);
                const isDeletingThis = deletingBrokenId === item.bookmark.id;

                return (
                  <div
                    key={item.bookmark.id}
                    className={`group flex items-center justify-between gap-2.5 px-3 py-2 text-xs transition-colors ${
                      isDeletingThis ? 'bg-rose-500/5 opacity-50' : 'hover:bg-muted/20'
                    }`}
                  >
                    {/* Left: Favicon + Title + Path */}
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <img
                        src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
                          item.bookmark.url
                        )}&sz=32`}
                        alt=""
                        className="mt-0.5 size-3.5 shrink-0 rounded-xs"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <a
                            href={item.bookmark.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground hover:text-primary max-w-[210px] cursor-pointer truncate font-medium transition-colors"
                            title={item.bookmark.title || item.bookmark.url}
                          >
                            {displayTitle}
                          </a>
                          <Badge
                            variant="outline"
                            className={`h-4 shrink-0 px-1.5 py-0 font-mono text-[8.5px] font-medium ${
                              is404
                                ? 'border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : is5xx
                                  ? 'border-orange-400/40 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                  : 'border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                            title={
                              item.error ||
                              (is404
                                ? 'HTTP 404 Not Found'
                                : is5xx
                                  ? `HTTP ${item.statusCode} Server Error`
                                  : 'Connection Timeout')
                            }
                          >
                            {is404 ? 'HTTP 404' : is5xx ? `HTTP ${item.statusCode}` : 'Unreachable'}
                          </Badge>
                        </div>

                        {/* Clean Subtitle without redundant red error strings */}
                        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
                          <span
                            className="text-muted-foreground/80 max-w-[170px] truncate"
                            title={item.bookmark.path}
                          >
                            📁 {item.bookmark.path}
                          </span>
                          {displayTitle !== item.bookmark.domain && (
                            <>
                              <span>•</span>
                              <span className="text-muted-foreground/60 max-w-[130px] truncate font-mono">
                                {item.bookmark.domain}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex shrink-0 items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                      <a
                        href={item.bookmark.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
                        title={t('openInTabTooltip') || 'Open in new tab'}
                      >
                        <ExternalLink className="size-3" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleDismissBroken(item.bookmark.id)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
                        title="Keep bookmark (Dismiss from broken list)"
                      >
                        <EyeOff className="size-3" />
                      </button>

                      <button
                        type="button"
                        disabled={isDeletingThis || isRemovingBroken}
                        onClick={() => handleRemoveBroken(item)}
                        className="text-muted-foreground cursor-pointer rounded p-1 transition-[color,transform] duration-120 hover:text-rose-500 active:scale-90 disabled:opacity-50"
                        title="Move to Recycle Bin"
                      >
                        {isDeletingThis ? (
                          <Loader2 className="size-3 animate-spin text-rose-500" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 6: EMPTY FOLDERS ===================== */}
      {visitedSubTabs.has('empty') && (
        <div className={subTab === 'empty' ? 'space-y-3' : 'hidden'}>
          {emptyFolders.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
              <div className="text-xs">
                <span className="font-semibold text-blue-700 dark:text-blue-300">
                  {emptyFolders.length} {t('emptyFoldersDetected') || 'empty folder(s) found'}
                </span>
                <p className="mt-0.5 text-[11px] text-blue-600/80 dark:text-blue-400/80">
                  {t('emptyFoldersNotice') ||
                    'These folders contain no bookmarks or active subfolders.'}
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={handleCleanAllEmptyFolders}
                className="h-7 border-blue-500/40 text-xs font-medium text-blue-700 hover:bg-blue-500/20 active:scale-[0.97] dark:text-blue-300"
              >
                <Trash2 className="mr-1 size-3" />
                {t('cleanAllEmptyFoldersBtn') || 'Clean All Empty'}
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
            </div>
          ) : emptyFolders.length === 0 ? (
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-12 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <h3 className="text-foreground text-xs font-semibold">
                {t('noEmptyFoldersTitle') || 'Folder Tree is Clean'}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {t('noEmptyFoldersDesc') ||
                  'No empty or abandoned folders found in your bookmarks.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {emptyFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="border-border/50 bg-card hover:border-border flex items-center justify-between gap-3 rounded-lg border p-3 transition-[border-color,background-color] duration-120"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Folder className="size-4 shrink-0 text-blue-500" />
                    <div className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-xs font-medium">
                        {folder.title}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block truncate text-[10px]">
                        📁 {folder.path}
                      </span>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveEmptyFolder(folder)}
                    className="text-destructive hover:bg-destructive/10 h-7 px-2 text-xs active:scale-[0.97]"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
