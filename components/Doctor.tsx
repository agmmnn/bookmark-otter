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
  Search,
  X,
  Clock,
  Info,
  Activity,
  ArrowRight,
  Bookmark,
  Globe,
  CalendarDays,
  FolderTree,
  FileSpreadsheet,
  FileCode,
  Share2,
  Check,
  ChevronDown,
  ChevronRight,
  Radio,
  MoreHorizontal,
  GitMerge,
  FolderInput,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { formatFolderTitle, formatShortFolderPath, useResponsiveTabStage } from '@/lib/utils';
import { getBookmarkTree, flattenBookmarks, getAllFolders } from '@/services/bookmarks';
import {
  findDuplicatesWithSeparators,
  findEmptyFolders,
  scanBrokenLinks,
  resolveDuplicateGroup,
  pickDefaultKeepBookmark,
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
  restoreBookmarkUrls,
  verifyHttpsSupportBatch,
} from '@/services/cleaner';
import { calculateInsights } from '@/services/insights';
import { hasWebScanPermission, requestWebScanPermission } from '@/services/permissions';
import { restoreRecentTrashItems } from '@/services/trash';
import type {
  DuplicateGroup,
  DuplicateScope,
  EmptyFolder,
  BrokenLinkResult,
  FlatBookmark,
  FlatFolder,
  HttpsVerifyInfo,
  SimilarGroup,
  TrackingCleanItem,
  TrackingCleanOptions,
  InsightsData,
} from '@/types';

export type DoctorSubTab =
  | 'overview'
  | 'duplicates'
  | 'similar'
  | 'trackers'
  | 'insecure'
  | 'broken'
  | 'empty'
  | '404';

type NormalizedDoctorSubTab =
  | 'overview'
  | 'duplicates'
  | 'similar'
  | 'trackers'
  | 'insecure'
  | 'broken'
  | 'empty';

interface DoctorProps {
  onFixed?: () => void;
  initialSubTab?: DoctorSubTab;
  onNavigateToLibrary?: (query: string) => void;
}

export const Doctor: React.FC<DoctorProps> = React.memo(function Doctor({
  onFixed,
  initialSubTab = 'overview',
  onNavigateToLibrary,
}) {
  const { t, lang } = useI18n();
  const normalizeSubTab = (tab: DoctorSubTab): NormalizedDoctorSubTab =>
    tab === '404' ? 'broken' : tab;
  const [subTab, setSubTab] = useState<NormalizedDoctorSubTab>(normalizeSubTab(initialSubTab));

  // Mount on demand: only render subtabs the user has actually visited to keep DOM lightweight
  const [visitedSubTabs, setVisitedSubTabs] = useState<Set<NormalizedDoctorSubTab>>(
    () => new Set([normalizeSubTab(initialSubTab)])
  );

  const { containerRef: subTabBarRef, stage: subTabStage } = useResponsiveTabStage<HTMLDivElement>(
    7,
    84
  );

  const handleSubTabChange = (nextTab: NormalizedDoctorSubTab) => {
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
  const [insightsBase, setInsightsBase] = useState<InsightsData | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [openOverviewSections, setOpenOverviewSections] = useState<Record<string, boolean>>({
    facts: true,
    age: false,
    folders: true,
    domains: false,
    export: false,
  });

  const toggleOverviewSection = (key: string) => {
    setOpenOverviewSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [separatorGroups, setSeparatorGroups] = useState<DuplicateGroup[]>([]);
  const [duplicateScope, setDuplicateScope] = useState<DuplicateScope>('library');
  const [showSeparatorsSection, setShowSeparatorsSection] = useState(false);
  const [selectedKeepIds, setSelectedKeepIds] = useState<Record<string, string>>({});
  const [ignoredDuplicateKeys, setIgnoredDuplicateKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('doctor_ignored_duplicates');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.filter((x) => typeof x === 'string'));
      }
    } catch {}
    return new Set();
  });
  const [confirmCleanDuplicates, setConfirmCleanDuplicates] = useState(false);
  const [emptyFolders, setEmptyFolders] = useState<EmptyFolder[]>([]);
  const [confirmCleanEmpty, setConfirmCleanEmpty] = useState(false);
  const [allBookmarks, setAllBookmarks] = useState<FlatBookmark[]>([]);
  const [allFolders, setAllFolders] = useState<FlatFolder[]>([]);

  // Similar bookmarks state
  const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
  const [selectedSimilarIds, setSelectedSimilarIds] = useState<Set<string>>(new Set());
  const [isDeletingSimilar, setIsDeletingSimilar] = useState(false);
  const [confirmDeleteSimilar, setConfirmDeleteSimilar] = useState(false);
  const [similarActionPanel, setSimilarActionPanel] = useState<'merge' | 'move' | null>(null);
  const [mergeKeepId, setMergeKeepId] = useState<string>('');
  const [mergeTitle, setMergeTitle] = useState<string>('');
  const [isMergingSimilar, setIsMergingSimilar] = useState(false);
  const [moveFolderSearch, setMoveFolderSearch] = useState('');
  const [isMovingSimilar, setIsMovingSimilar] = useState(false);

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
  const [httpsVerifyMap, setHttpsVerifyMap] = useState<Map<string, HttpsVerifyInfo>>(new Map());
  const [hasCompletedHttpsVerify, setHasCompletedHttpsVerify] = useState(false);
  const [deadMovedCount, setDeadMovedCount] = useState(0);
  const [isVerifyingHttps, setIsVerifyingHttps] = useState(false);
  const [verifyHttpsProgress, setVerifyHttpsProgress] = useState<{
    current: number;
    total: number;
    currentDomain?: string;
  } | null>(null);
  const [httpSearchQuery, setHttpSearchQuery] = useState('');
  const [groupHttpByDomain, setGroupHttpByDomain] = useState(true);
  const [collapsedHttpDomains, setCollapsedHttpDomains] = useState<Set<string>>(new Set());
  const [visibleHttpCount, setVisibleHttpCount] = useState(30);

  // Broken link scanner & optional host permission state
  const [hasScanPermission, setHasScanPermission] = useState<boolean>(false);
  const [scanPermissionDenied, setScanPermissionDenied] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0, currentUrl: '' });
  const [brokenLinks, setBrokenLinks] = useState<BrokenLinkResult[]>([]);
  const [hasScannedBroken, setHasScannedBroken] = useState(false);
  const [lastScannedAt, setLastScannedAt] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem('last_broken_scan');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.timestamp === 'number') return parsed.timestamp;
      }
    } catch {}
    return null;
  });
  const [dismissedBrokenIds, setDismissedBrokenIds] = useState<Set<string>>(new Set());
  const [brokenFilter, setBrokenFilter] = useState<'all' | '404' | '5xx' | 'unverified'>('all');
  const [isRemovingBroken, setIsRemovingBroken] = useState(false);
  const [confirmRemoveBroken, setConfirmRemoveBroken] = useState(false);
  const [removingBrokenProgress, setRemovingBrokenProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [deletingBrokenId, setDeletingBrokenId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const showToast = (msg: string, onAction?: () => Promise<void> | void, actionLabel?: string) => {
    if (onAction) {
      toast.success(msg, {
        action: {
          label: actionLabel || t('undoBtn') || (lang === 'tr' ? 'Geri Al' : 'Undo'),
          onClick: () => {
            onAction();
          },
        },
      });
    } else {
      toast.success(msg);
    }
  };

  const formatItemDate = (timestamp?: number) => {
    if (!timestamp || timestamp <= 0) return '';
    try {
      return new Date(timestamp).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const handleDismissBroken = (bookmarkId: string) => {
    setDismissedBrokenIds((prev) => new Set([...prev, bookmarkId]));
    showToast(
      lang === 'tr' ? 'Yer imi listeden gizlendi' : 'Ignored bookmark (hidden from broken list)'
    );
  };

  const isConfirmedBroken = (b: BrokenLinkResult) =>
    b.statusCode === 404 || b.statusCode === 410 || Boolean(b.statusCode && b.statusCode >= 500);

  const count404 = useMemo(
    () =>
      brokenLinks.filter(
        (b) =>
          !dismissedBrokenIds.has(b.bookmark.id) && (b.statusCode === 404 || b.statusCode === 410)
      ).length,
    [brokenLinks, dismissedBrokenIds]
  );

  const count5xx = useMemo(
    () =>
      brokenLinks.filter(
        (b) => !dismissedBrokenIds.has(b.bookmark.id) && b.statusCode && b.statusCode >= 500
      ).length,
    [brokenLinks, dismissedBrokenIds]
  );

  const countUnverified = useMemo(
    () =>
      brokenLinks.filter((b) => !dismissedBrokenIds.has(b.bookmark.id) && !isConfirmedBroken(b))
        .length,
    [brokenLinks, dismissedBrokenIds]
  );

  const confirmedBrokenLinks = useMemo(
    () => brokenLinks.filter((b) => !dismissedBrokenIds.has(b.bookmark.id) && isConfirmedBroken(b)),
    [brokenLinks, dismissedBrokenIds]
  );

  const activeBrokenLinks = useMemo(() => {
    return brokenLinks.filter((item) => {
      if (dismissedBrokenIds.has(item.bookmark.id)) return false;
      if (brokenFilter === '404') return item.statusCode === 404 || item.statusCode === 410;
      if (brokenFilter === '5xx') return Boolean(item.statusCode && item.statusCode >= 500);
      if (brokenFilter === 'unverified') return !isConfirmedBroken(item);
      return true;
    });
  }, [brokenLinks, dismissedBrokenIds, brokenFilter]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let cachedBrokenCount = 0;
      try {
        const rawScan = localStorage.getItem('last_broken_scan');
        if (rawScan) {
          const parsed = JSON.parse(rawScan);
          if (typeof parsed?.brokenCount === 'number') {
            cachedBrokenCount = parsed.brokenCount;
          }
        }
      } catch {}

      const tree = await getBookmarkTree();
      // Flatten ONCE and reuse across all scanners for 5x CPU performance gain
      const flats = flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'));
      const folders = getAllFolders(tree).filter((f) => f.id !== '0');
      const { duplicates: dups, separators: seps } = findDuplicatesWithSeparators(flats, {
        scope: duplicateScope,
      });
      const dupIds = new Set(dups.flatMap((g) => g.items.map((it) => it.id)));
      const empties = findEmptyFolders(tree);
      const similar = findSimilarBookmarks(flats, dupIds);
      const trackers = findTrackingParameters(flats, trackingOptions);
      const insecures = findInsecureHttpBookmarks(flats);
      const baseInsights = calculateInsights(tree, cachedBrokenCount);

      setDuplicates(dups);
      setSeparatorGroups(seps);
      setEmptyFolders(empties);
      setAllBookmarks(flats);
      setAllFolders(folders);
      setSimilarGroups(similar);
      setTrackingItems(trackers);
      setInsecureBookmarks(insecures);
      setInsightsBase(baseInsights);
    } catch (err) {
      console.error('Failed to load doctor data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [trackingOptions, duplicateScope]);

  // Recompute duplicates & similar instantaneously when scope toggles on cached bookmarks
  const handleDuplicateScopeChange = (nextScope: DuplicateScope) => {
    if (nextScope === duplicateScope) return;
    setDuplicateScope(nextScope);
    setConfirmCleanDuplicates(false);
    if (allBookmarks.length > 0) {
      const { duplicates: dups, separators: seps } = findDuplicatesWithSeparators(allBookmarks, {
        scope: nextScope,
      });
      const dupIds = new Set(dups.flatMap((g) => g.items.map((it) => it.id)));
      setDuplicates(dups);
      setSeparatorGroups(seps);
      setSimilarGroups(findSimilarBookmarks(allBookmarks, dupIds));
    }
  };

  useEffect(() => {
    loadData();
    hasWebScanPermission().then((granted) => setHasScanPermission(granted));

    const onPermChange = () => {
      hasWebScanPermission().then((granted) => {
        setHasScanPermission(granted);
        if (granted) setScanPermissionDenied(false);
      });
    };

    browser.permissions?.onAdded?.addListener?.(onPermChange);
    browser.permissions?.onRemoved?.addListener?.(onPermChange);

    return () => {
      // Abort any in-flight link scanner on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      browser.permissions?.onAdded?.removeListener?.(onPermChange);
      browser.permissions?.onRemoved?.removeListener?.(onPermChange);
    };
  }, [loadData]);

  // --- Duplicates Actions ---
  const activeDuplicates = useMemo(
    () => duplicates.filter((g) => !ignoredDuplicateKeys.has(g.normalizedUrl)),
    [duplicates, ignoredDuplicateKeys]
  );

  const ignoredDuplicateCount = useMemo(
    () => duplicates.filter((g) => ignoredDuplicateKeys.has(g.normalizedUrl)).length,
    [duplicates, ignoredDuplicateKeys]
  );

  const getGroupKeepId = useCallback(
    (group: DuplicateGroup): string => {
      const chosen = selectedKeepIds[group.normalizedUrl];
      if (chosen && group.items.some((it) => it.id === chosen)) {
        return chosen;
      }
      return pickDefaultKeepBookmark(group.items).id;
    },
    [selectedKeepIds]
  );

  const handleSelectKeepId = (groupKey: string, itemId: string) => {
    setSelectedKeepIds((prev) => ({ ...prev, [groupKey]: itemId }));
  };

  const handleIgnoreDuplicateGroup = (groupKey: string) => {
    setIgnoredDuplicateKeys((prev) => {
      const next = new Set(prev);
      next.add(groupKey);
      try {
        localStorage.setItem('doctor_ignored_duplicates', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
    showToast(
      lang === 'tr' ? 'Grup mükerrer listesinden gizlendi' : 'Group ignored from duplicates'
    );
  };

  const handleResetIgnoredDuplicates = () => {
    setIgnoredDuplicateKeys(new Set());
    try {
      localStorage.removeItem('doctor_ignored_duplicates');
    } catch {}
  };

  const handleResolveGroup = async (group: DuplicateGroup, keepId?: string) => {
    const resolvedKeepId = keepId || getGroupKeepId(group);
    const removedCount = await resolveDuplicateGroup(group, { keepId: resolvedKeepId });
    setDuplicates((prev) => prev.filter((g) => g.normalizedUrl !== group.normalizedUrl));
    showToast(
      t('duplicatesCleanedMsg', { count: removedCount }) ||
        `Removed ${removedCount} duplicate(s). Moved to Recycle Bin.`,
      async () => {
        await restoreRecentTrashItems(removedCount);
        await loadData();
        onFixed?.();
      }
    );
    if (onFixed) onFixed();
  };

  const handleRemoveDuplicateItems = async (
    group: DuplicateGroup,
    itemsToDelete: FlatBookmark[]
  ) => {
    if (itemsToDelete.length === 0) return;
    const count = await removeMultipleBookmarksWithTrash(itemsToDelete);
    const deleteIds = new Set(itemsToDelete.map((it) => it.id));
    setDuplicates((prev) =>
      prev
        .map((g) => {
          if (g.normalizedUrl === group.normalizedUrl) {
            const remaining = g.items.filter((it) => !deleteIds.has(it.id));
            return { ...g, items: remaining };
          }
          return g;
        })
        .filter((g) => g.items.length > 1)
    );
    showToast(
      lang === 'tr'
        ? `${count} kopya Çöp Kutusuna taşındı`
        : `Moved ${count} copy(ies) to Recycle Bin`,
      async () => {
        await restoreRecentTrashItems(count);
        await loadData();
        onFixed?.();
      }
    );
    if (onFixed) onFixed();
  };

  const handleCleanAllDuplicates = async () => {
    let totalRemoved = 0;
    const resolvedKeys = new Set<string>();
    for (const group of activeDuplicates) {
      const keepId = getGroupKeepId(group);
      const count = await resolveDuplicateGroup(group, { keepId });
      totalRemoved += count;
      resolvedKeys.add(group.normalizedUrl);
    }
    setDuplicates((prev) => prev.filter((g) => !resolvedKeys.has(g.normalizedUrl)));
    setConfirmCleanDuplicates(false);
    showToast(
      t('allDuplicatesCleaned', { count: totalRemoved }) ||
        `Cleaned ${totalRemoved} duplicates! Backed up in Recycle Bin.`,
      async () => {
        await restoreRecentTrashItems(totalRemoved);
        await loadData();
        onFixed?.();
      }
    );
    if (onFixed) onFixed();
  };

  // --- Similar Bookmarks Actions ---
  const toggleSelectSimilar = (id: string) => {
    setSelectedSimilarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) {
        setSimilarActionPanel(null);
        setConfirmDeleteSimilar(false);
      }
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
      if (next.size === 0) {
        setSimilarActionPanel(null);
        setConfirmDeleteSimilar(false);
      }
      return next;
    });
  };

  const selectExceptNewestInGroup = (group: SimilarGroup) => {
    if (group.items.length < 2) return;
    const sorted = [...group.items].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
    const newestId = sorted[0]!.id;
    const otherIds = group.items.filter((it) => it.id !== newestId).map((it) => it.id);
    const allOthersSelected =
      !selectedSimilarIds.has(newestId) && otherIds.every((id) => selectedSimilarIds.has(id));

    setSelectedSimilarIds((prev) => {
      const next = new Set(prev);
      if (allOthersSelected) {
        for (const id of otherIds) next.delete(id);
      } else {
        next.delete(newestId);
        for (const id of otherIds) next.add(id);
      }
      if (next.size === 0) {
        setSimilarActionPanel(null);
        setConfirmDeleteSimilar(false);
      }
      return next;
    });
  };

  const allSimilarBookmarkIds = useMemo(
    () => similarGroups.flatMap((g) => g.items.map((it) => it.id)),
    [similarGroups]
  );

  const selectedSimilarItems = useMemo(
    () => similarGroups.flatMap((g) => g.items).filter((it) => selectedSimilarIds.has(it.id)),
    [similarGroups, selectedSimilarIds]
  );

  const isAllSimilarSelected =
    allSimilarBookmarkIds.length > 0 &&
    allSimilarBookmarkIds.every((id) => selectedSimilarIds.has(id));

  const toggleSelectAllSimilar = () => {
    if (isAllSimilarSelected) {
      setSelectedSimilarIds(new Set());
      setSimilarActionPanel(null);
      setConfirmDeleteSimilar(false);
    } else {
      setSelectedSimilarIds(new Set(allSimilarBookmarkIds));
    }
  };

  const handleOpenSelectedSimilar = () => {
    for (const b of selectedSimilarItems) {
      if (b.url) {
        browser.tabs.create({ url: b.url, active: false });
      }
    }
    showToast(t('openInTabs') || `Opened ${selectedSimilarItems.length} tabs`);
  };

  const handleDeleteSelectedSimilar = async () => {
    if (selectedSimilarIds.size === 0 || isDeletingSimilar) return;
    setIsDeletingSimilar(true);
    try {
      const count = await removeMultipleBookmarksWithTrash(selectedSimilarItems);
      setSimilarGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            items: g.items.filter((it) => !selectedSimilarIds.has(it.id)),
          }))
          .filter((g) => g.items.length > 1)
      );
      setSelectedSimilarIds(new Set());
      setConfirmDeleteSimilar(false);
      setSimilarActionPanel(null);
      showToast(
        t('brokenLinkRemoved') || `Moved ${count} bookmark(s) to Recycle Bin.`,
        async () => {
          await restoreRecentTrashItems(count);
          await loadData();
          onFixed?.();
        }
      );
      if (onFixed) onFixed();
    } catch (err) {
      console.error('Failed to delete selected similar bookmarks:', err);
    } finally {
      setIsDeletingSimilar(false);
    }
  };

  const handleOpenMergeSimilar = () => {
    if (selectedSimilarItems.length < 2) return;
    if (similarActionPanel === 'merge') {
      setSimilarActionPanel(null);
      return;
    }
    const defaultKeep = pickDefaultKeepBookmark(selectedSimilarItems);
    setMergeKeepId(defaultKeep.id);
    setMergeTitle(defaultKeep.title || defaultKeep.domain);
    setConfirmDeleteSimilar(false);
    setSimilarActionPanel('merge');
  };

  const handleConfirmMergeSimilar = async () => {
    if (selectedSimilarItems.length < 2 || isMergingSimilar) return;
    const keeper =
      selectedSimilarItems.find((it) => it.id === mergeKeepId) || selectedSimilarItems[0];
    if (!keeper) return;

    const toTrash = selectedSimilarItems.filter((it) => it.id !== keeper.id);
    const trimmedTitle = mergeTitle.trim();
    const prevKeeperTitle = keeper.title;

    setIsMergingSimilar(true);
    try {
      if (trimmedTitle && trimmedTitle !== keeper.title) {
        await browser.bookmarks.update(keeper.id, { title: trimmedTitle });
      }
      const trashedCount = await removeMultipleBookmarksWithTrash(toTrash);
      setSelectedSimilarIds(new Set());
      setSimilarActionPanel(null);
      await loadData();
      showToast(
        lang === 'tr'
          ? `1 yer imi korundu, ${trashedCount} benzer kopya Çöp Kutusuna taşındı`
          : `Merged: kept 1 bookmark, moved ${trashedCount} to Recycle Bin`,
        async () => {
          if (trimmedTitle && trimmedTitle !== prevKeeperTitle) {
            await browser.bookmarks.update(keeper.id, { title: prevKeeperTitle });
          }
          await restoreRecentTrashItems(trashedCount);
          await loadData();
          onFixed?.();
        }
      );
      if (onFixed) onFixed();
    } catch (err) {
      console.error('Failed to merge similar bookmarks:', err);
    } finally {
      setIsMergingSimilar(false);
    }
  };

  const handleMoveSelectedSimilar = async (targetFolderId: string, targetFolderTitle: string) => {
    if (selectedSimilarItems.length === 0 || isMovingSimilar) return;
    const previousParents = selectedSimilarItems.map((it) => ({
      id: it.id,
      parentId: it.parentId,
    }));
    setIsMovingSimilar(true);
    try {
      let moved = 0;
      for (const item of selectedSimilarItems) {
        if (item.parentId !== targetFolderId) {
          await browser.bookmarks.move(item.id, { parentId: targetFolderId });
          moved++;
        }
      }
      setSelectedSimilarIds(new Set());
      setSimilarActionPanel(null);
      setMoveFolderSearch('');
      await loadData();
      showToast(
        lang === 'tr'
          ? `${moved} yer imi "${targetFolderTitle}" klasörüne taşındı`
          : `Moved ${moved} bookmark(s) to "${targetFolderTitle}"`,
        async () => {
          for (const prev of previousParents) {
            if (prev.parentId) {
              await browser.bookmarks.move(prev.id, { parentId: prev.parentId });
            }
          }
          await loadData();
          onFixed?.();
        }
      );
      if (onFixed) onFixed();
    } catch (err) {
      console.error('Failed to move selected similar bookmarks:', err);
    } finally {
      setIsMovingSimilar(false);
    }
  };

  const filteredMoveFolders = useMemo(() => {
    const q = moveFolderSearch.trim().toLowerCase();
    if (!q) return allFolders;
    return allFolders.filter(
      (f) => f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [allFolders, moveFolderSearch]);

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
    showToast(t('brokenLinkRemoved') || 'Moved bookmark to Recycle Bin', async () => {
      await restoreRecentTrashItems(1);
      await loadData();
      onFixed?.();
    });
    if (onFixed) onFixed();
  };

  // --- Tracking Parameters Actions ---
  const handleToggleTrackingOption = (key: keyof TrackingCleanOptions) => {
    const updated = { ...trackingOptions, [key]: !trackingOptions[key] };
    setTrackingOptions(updated);
    if (allBookmarks.length > 0) {
      const freshTrackers = findTrackingParameters(allBookmarks, updated);
      setTrackingItems(freshTrackers);
    }
  };

  const siteSpecificCount = useMemo(() => {
    if (allBookmarks.length === 0) return 0;
    const all = findTrackingParameters(allBookmarks, {
      includeSiteSpecific: true,
      includeAffiliate: true,
    });
    return all.filter((item) =>
      item.segments.some((s) => s.isRemoved && s.type === 'site-specific')
    ).length;
  }, [allBookmarks]);

  const affiliateCount = useMemo(() => {
    if (allBookmarks.length === 0) return 0;
    const all = findTrackingParameters(allBookmarks, {
      includeSiteSpecific: true,
      includeAffiliate: true,
    });
    return all.filter((item) => item.segments.some((s) => s.isRemoved && s.type === 'affiliate'))
      .length;
  }, [allBookmarks]);

  const handleCleanSingleTracker = async (item: TrackingCleanItem) => {
    setCleaningSingleTrackerId(item.bookmark.id);
    const prevUrl = item.originalUrl;
    try {
      const ok = await cleanBookmarkUrl(item.bookmark.id, item.cleanUrl);
      if (ok) {
        setTrackingItems((prev) => prev.filter((it) => it.bookmark.id !== item.bookmark.id));
        setAllBookmarks((prev) =>
          prev.map((b) => (b.id === item.bookmark.id ? { ...b, url: item.cleanUrl } : b))
        );
        showToast(t('cleanedUrlsSuccess', { count: 1 }) || 'Bookmark URL cleaned!', async () => {
          await restoreBookmarkUrls([{ id: item.bookmark.id, originalUrl: prevUrl }]);
          await loadData();
          onFixed?.();
        });
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
    const previousItems = trackingItems.map((it) => ({
      id: it.bookmark.id,
      originalUrl: it.originalUrl,
    }));
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
        t('cleanedUrlsSuccess', { count }) || `Cleaned ${count} bookmark URLs successfully.`,
        async () => {
          await restoreBookmarkUrls(previousItems);
          await loadData();
          onFixed?.();
        }
      );
      if (onFixed) onFixed();
      await loadData();
    } catch (err) {
      console.error('Failed to clean all tracking parameters:', err);
    } finally {
      setIsCleaningTrackers(false);
      setCleanTrackersProgress(null);
    }
  };

  // --- Insecure HTTP Actions ---
  const getHttpStatusRank = useCallback(
    (id: string): number => {
      const info = httpsVerifyMap.get(id);
      switch (info?.status) {
        case 'supported':
          return 0;
        case 'redirect':
          return 1;
        case 'unsupported':
          return 3;
        default:
          return 2; // unverified
      }
    },
    [httpsVerifyMap]
  );

  const filteredInsecureBookmarks = useMemo(() => {
    const q = httpSearchQuery.trim().toLowerCase();
    const list = q
      ? insecureBookmarks.filter(
          (b) =>
            b.title.toLowerCase().includes(q) ||
            b.url.toLowerCase().includes(q) ||
            b.domain.toLowerCase().includes(q) ||
            b.path.toLowerCase().includes(q)
        )
      : insecureBookmarks;

    return [...list].sort((a, b) => {
      const rankDiff = getHttpStatusRank(a.id) - getHttpStatusRank(b.id);
      if (rankDiff !== 0) return rankDiff;
      const domDiff = (a.domain || '').localeCompare(b.domain || '');
      if (domDiff !== 0) return domDiff;
      return (a.title || a.url).localeCompare(b.title || b.url);
    });
  }, [insecureBookmarks, httpSearchQuery, getHttpStatusRank]);

  const groupedInsecureDomains = useMemo(() => {
    const map = new Map<string, FlatBookmark[]>();
    for (const b of filteredInsecureBookmarks) {
      const key = (b.domain || 'other').toLowerCase();
      const existing = map.get(key) || [];
      existing.push(b);
      map.set(key, existing);
    }

    return Array.from(map.entries())
      .map(([domain, items]) => {
        const minRank = Math.min(...items.map((it) => getHttpStatusRank(it.id)));
        const supportedCount = items.filter(
          (it) => httpsVerifyMap.get(it.id)?.status === 'supported'
        ).length;
        return { domain, items, minRank, supportedCount };
      })
      .sort((a, b) => {
        if (a.minRank !== b.minRank) return a.minRank - b.minRank;
        if (b.supportedCount !== a.supportedCount) return b.supportedCount - a.supportedCount;
        return a.domain.localeCompare(b.domain);
      });
  }, [filteredInsecureBookmarks, getHttpStatusRank, httpsVerifyMap]);

  const visibleInsecureBookmarks = useMemo(
    () => filteredInsecureBookmarks.slice(0, visibleHttpCount),
    [filteredInsecureBookmarks, visibleHttpCount]
  );

  const verifiedHttpItems = useMemo(
    () => insecureBookmarks.filter((b) => httpsVerifyMap.get(b.id)?.status === 'supported'),
    [insecureBookmarks, httpsVerifyMap]
  );

  const handleVerifyHttpsSupport = async () => {
    if (insecureBookmarks.length === 0 || isVerifyingHttps) return;
    const targets = [...insecureBookmarks];
    const targetById = new Map(targets.map((b) => [b.id, b]));
    setIsVerifyingHttps(true);
    setHasCompletedHttpsVerify(false);
    setDeadMovedCount(0);
    setHttpsVerifyMap(new Map());
    setVerifyHttpsProgress({ current: 0, total: targets.length });

    try {
      const map = await verifyHttpsSupportBatch(targets, (checked, total, id, info) => {
        const currentItem = targetById.get(id);
        setVerifyHttpsProgress({
          current: checked,
          total,
          currentDomain: currentItem?.domain || '',
        });
        setHttpsVerifyMap((prev) => {
          const next = new Map(prev);
          next.set(id, info);
          return next;
        });
      });

      setHttpsVerifyMap(map);
      setHasCompletedHttpsVerify(true);

      // Route dead sites found during HTTPS check directly to the 404 Broken Links tab
      const deadBrokenEntries: BrokenLinkResult[] = [];
      const deadIds = new Set<string>();
      for (const item of targets) {
        const info = map.get(item.id);
        if (info?.status === 'dead') {
          deadIds.add(item.id);
          deadBrokenEntries.push({
            bookmark: item,
            status: 'broken',
            statusCode: info.statusCode,
            error: info.error,
            finalUrl: info.finalUrl,
            checkedAt: Date.now(),
          });
        }
      }

      if (deadBrokenEntries.length > 0) {
        setBrokenLinks((prev) => {
          const existingIds = new Set(prev.map((p) => p.bookmark.id));
          const merged = [...prev];
          for (const entry of deadBrokenEntries) {
            if (!existingIds.has(entry.bookmark.id)) {
              merged.push(entry);
            }
          }
          return merged;
        });
        setHasScannedBroken(true);
        setInsecureBookmarks((prev) => prev.filter((b) => !deadIds.has(b.id)));
        setDeadMovedCount(deadBrokenEntries.length);
      }

      const okCount = Array.from(map.values()).filter((v) => v.status === 'supported').length;
      if (deadBrokenEntries.length > 0) {
        showToast(
          lang === 'tr'
            ? `${okCount} sitede HTTPS çalışıyor. ${deadBrokenEntries.length} ölü site 404 sekmesine yönlendirildi.`
            : `${okCount} sites support HTTPS. ${deadBrokenEntries.length} dead site(s) routed to 404 tab.`,
          () => handleSubTabChange('broken'),
          lang === 'tr' ? "404'e Git" : 'View 404'
        );
      } else {
        showToast(
          lang === 'tr'
            ? `${okCount} / ${targets.length} sitede HTTPS desteği doğrulandı.`
            : `Verified HTTPS support on ${okCount} of ${targets.length} sites.`
        );
      }
    } catch (err) {
      console.warn('Could not verify HTTPS support:', err);
    } finally {
      setIsVerifyingHttps(false);
      setVerifyHttpsProgress(null);
    }
  };

  const handleUpgradeSingleHttps = async (item: FlatBookmark) => {
    setUpgradingSingleId(item.id);
    const prevUrl = item.url;
    try {
      const ok = await upgradeBookmarkToHttps(item.id, item.url);
      if (ok) {
        setInsecureBookmarks((prev) => prev.filter((b) => b.id !== item.id));
        showToast(
          t('upgradedHttpsSuccess', { count: 1 }) || 'Upgraded bookmark to HTTPS!',
          async () => {
            await restoreBookmarkUrls([{ id: item.id, originalUrl: prevUrl }]);
            await loadData();
            onFixed?.();
          }
        );
        if (onFixed) onFixed();
      }
    } catch (err) {
      console.error('Failed to upgrade bookmark to HTTPS:', err);
    } finally {
      setUpgradingSingleId(null);
    }
  };

  const handleUpgradeAllHttps = async () => {
    if (
      insecureBookmarks.length === 0 ||
      isUpgradingHttps ||
      isVerifyingHttps ||
      !hasCompletedHttpsVerify
    ) {
      return;
    }

    const targets = verifiedHttpItems;
    if (targets.length === 0) {
      showToast(
        lang === 'tr'
          ? 'HTTPS destekleyen doğrulanmış site bulunamadı.'
          : 'No verified HTTPS-supported sites found to upgrade.'
      );
      return;
    }

    const previousUrls = targets.map((b) => ({ id: b.id, originalUrl: b.url }));
    setIsUpgradingHttps(true);
    setUpgradeHttpsProgress({ current: 0, total: targets.length });
    try {
      const items = targets.map((b) => ({ id: b.id, url: b.url }));
      const count = await upgradeMultipleBookmarksToHttps(items, (current, total) => {
        setUpgradeHttpsProgress({ current, total });
      });
      const upgradedIds = new Set(targets.map((t) => t.id));
      setInsecureBookmarks((prev) => prev.filter((b) => !upgradedIds.has(b.id)));
      showToast(
        t('upgradedHttpsSuccess', { count }) || `Upgraded ${count} verified bookmark(s) to HTTPS!`,
        async () => {
          await restoreBookmarkUrls(previousUrls);
          await loadData();
          onFixed?.();
        }
      );
      if (onFixed) onFixed();
    } catch (err) {
      console.error('Failed to upgrade all bookmarks to HTTPS:', err);
    } finally {
      setIsUpgradingHttps(false);
      setUpgradeHttpsProgress(null);
    }
  };

  const handleDismissInsecure = (bookmarkId: string) => {
    setInsecureBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    showToast(
      lang === 'tr' ? 'Yer imi listeden gizlendi' : 'Ignored bookmark (hidden from HTTP list)'
    );
  };

  const handleRemoveInsecure = async (item: FlatBookmark) => {
    await removeBookmarkWithTrash(item);
    setInsecureBookmarks((prev) => prev.filter((b) => b.id !== item.id));
    showToast(t('brokenLinkRemoved') || 'Removed link to Recycle Bin', async () => {
      await restoreRecentTrashItems(1);
      await loadData();
      onFixed?.();
    });
    if (onFixed) onFixed();
  };

  const toggleHttpDomainCollapsed = (domain: string) => {
    setCollapsedHttpDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  const handleVerifyHttpsClick = () => {
    if (hasScanPermission) {
      handleVerifyHttpsSupport();
      return;
    }
    // Call requestWebScanPermission synchronously inside click handler (no prior await)
    requestWebScanPermission()
      .then((granted) => {
        setHasScanPermission(granted);
        setScanPermissionDenied(!granted);
        if (granted) {
          handleVerifyHttpsSupport();
        }
      })
      .catch(() => setScanPermissionDenied(true));
  };

  const handleUpgradeAllHttpsClick = () => {
    if (!hasCompletedHttpsVerify || verifiedHttpItems.length === 0) return;
    handleUpgradeAllHttps();
  };

  const handleScanLinksClick = () => {
    if (hasScanPermission) {
      startScan();
      return;
    }
    // Call requestWebScanPermission synchronously inside click handler (no prior await)
    requestWebScanPermission()
      .then((granted) => {
        setHasScanPermission(granted);
        setScanPermissionDenied(!granted);
        if (granted) {
          startScan();
        }
      })
      .catch(() => setScanPermissionDenied(true));
  };

  // --- Broken Links Actions ---
  const startScan = async () => {
    if (allBookmarks.length === 0) return;
    setIsScanning(true);
    setHasScannedBroken(true);
    setBrokenLinks([]);
    setConfirmRemoveBroken(false);

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
      const now = Date.now();
      setLastScannedAt(now);
      const confirmedCount = results.filter((r) => isConfirmedBroken(r)).length;
      try {
        localStorage.setItem(
          'last_broken_scan',
          JSON.stringify({ timestamp: now, brokenCount: confirmedCount })
        );
      } catch {}
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
      showToast(
        t('brokenLinkRemoved') || `Removed "${item.bookmark.title}" to Recycle Bin`,
        async () => {
          await restoreRecentTrashItems(1);
          await loadData();
          onFixed?.();
        }
      );
      if (onFixed) onFixed();
    } finally {
      setDeletingBrokenId(null);
    }
  };

  const handleRemoveBrokenBatch = async () => {
    if (isRemovingBroken) return;
    // Exclude unverified (CORS/blocked) links from Remove All for safety
    const targets =
      brokenFilter === '404' || brokenFilter === '5xx' ? activeBrokenLinks : confirmedBrokenLinks;
    if (targets.length === 0) return;

    setIsRemovingBroken(true);
    setConfirmRemoveBroken(false);
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
          `Removed ${removedCount} broken link(s). Backed up in Recycle Bin.`,
        async () => {
          await restoreRecentTrashItems(removedCount);
          await loadData();
          onFixed?.();
        }
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
      showToast(
        t('folderRemoved') || `Removed empty folder "${folder.title}" to Recycle Bin`,
        async () => {
          await restoreRecentTrashItems(1);
          await loadData();
          onFixed?.();
        }
      );
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
    setConfirmCleanEmpty(false);
    showToast(
      t('allEmptyFoldersCleaned', { count }) ||
        `Cleaned ${count} empty folders. Backed up in Recycle Bin.`,
      async () => {
        await restoreRecentTrashItems(count);
        await loadData();
        onFixed?.();
      }
    );
    if (onFixed) onFixed();
  };

  const totalDuplicateBookmarks = activeDuplicates.reduce(
    (acc, g) => acc + (g.items.length - 1),
    0
  );

  const hasEverScanned404 = hasScannedBroken || lastScannedAt !== null;

  const activeBrokenTotalCount = Math.max(0, brokenLinks.length - dismissedBrokenIds.size);

  const effectiveBrokenCount = useMemo(() => {
    if (hasScannedBroken) return confirmedBrokenLinks.length;
    return insightsBase?.brokenCount || 0;
  }, [hasScannedBroken, confirmedBrokenLinks.length, insightsBase?.brokenCount]);

  // Unified live Insights & Health state derived from the exact same Doctor subtab data sources
  const liveInsights = useMemo(() => {
    if (!insightsBase) return null;
    const dupCount = totalDuplicateBookmarks;
    const emptyCount = emptyFolders.length;
    const httpCount = insecureBookmarks.length;
    const brokenCount = effectiveBrokenCount;
    const similarCount = similarGroups.length;
    const trackingCount = trackingItems.length;

    const dupPenalty = Math.min(25, dupCount * 3);
    const emptyPenalty = Math.min(15, emptyCount * 2);
    const httpPenalty = Math.min(15, httpCount * 2);
    const brokenPenalty = hasEverScanned404 ? Math.min(35, brokenCount * 5) : 0;

    const rawScore = 100 - dupPenalty - emptyPenalty - httpPenalty - brokenPenalty;
    const healthScore = Math.max(10, Math.min(100, Math.round(rawScore)));
    let rating: InsightsData['rating'] = 'excellent';
    if (healthScore >= 90) rating = 'excellent';
    else if (healthScore >= 75) rating = 'good';
    else if (healthScore >= 50) rating = 'warning';
    else rating = 'critical';

    return {
      ...insightsBase,
      healthScore,
      rating,
      duplicateCount: dupCount,
      emptyFolderCount: emptyCount,
      httpCount,
      brokenCount,
      similarCount,
      trackingCount,
      penalties: {
        duplicates: dupPenalty,
        emptyFolders: emptyPenalty,
        insecureHttp: httpPenalty,
        brokenLinks: brokenPenalty,
      },
    };
  }, [
    insightsBase,
    totalDuplicateBookmarks,
    emptyFolders.length,
    insecureBookmarks.length,
    effectiveBrokenCount,
    similarGroups.length,
    trackingItems.length,
    hasEverScanned404,
  ]);

  const formatPct = (count: number, pct: number) => {
    if (count > 0 && pct === 0) return '<1%';
    return `${pct}%`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10';
    if (score >= 75) return 'text-teal-500 border-teal-500/30 bg-teal-500/10';
    if (score >= 50) return 'text-amber-500 border-amber-500/30 bg-amber-500/10';
    return 'text-rose-500 border-rose-500/30 bg-rose-500/10';
  };

  const getRatingLabel = (rating: InsightsData['rating']) => {
    switch (rating) {
      case 'excellent':
        return t('healthExcellent') || 'Excellent Health';
      case 'good':
        return t('healthGood') || 'Good Health';
      case 'warning':
        return t('healthWarning') || 'Needs Attention';
      case 'critical':
        return t('healthCritical') || 'Critical Issues';
    }
  };

  const handleExportDomainsCsv = () => {
    if (!liveInsights) return;
    const rows = [
      ['Domain', 'Bookmarks Count', 'Percentage'],
      ...liveInsights.topDomains.map((d) => [d.domain, String(d.count), `${d.percentage}%`]),
    ];
    const csvContent = rows
      .map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmark-domains-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFullJson = async () => {
    try {
      const tree = await getBookmarkTree();
      const all = flattenBookmarks(tree);
      const jsonContent = JSON.stringify(
        all.map((b) => ({
          title: b.title,
          url: b.url,
          domain: b.domain,
          path: b.path,
          dateAdded: b.dateAdded ? new Date(b.dateAdded).toISOString() : undefined,
        })),
        null,
        2
      );
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bookmark-otter-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export JSON:', err);
    }
  };

  const handleCopySummary = async () => {
    if (!liveInsights) return;
    const oldestStr = liveInsights.oldestBookmark
      ? `• Oldest Bookmark: ${liveInsights.oldestBookmark.title} (${new Date(
          liveInsights.oldestBookmark.dateAdded
        ).getFullYear()})`
      : '';
    const busiestStr = liveInsights.busiestMonth
      ? `• Busiest Month: ${new Date(
          liveInsights.busiestMonth.year,
          liveInsights.busiestMonth.month
        ).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', {
          month: 'long',
          year: 'numeric',
        })} (${liveInsights.busiestMonth.count} bookmarks)`
      : '';

    const text = [
      `🦦 Bookmark Otter — Library Report`,
      `• Health Score: ${liveInsights.healthScore}/100 (${getRatingLabel(liveInsights.rating)})`,
      `• Total Bookmarks: ${liveInsights.totalBookmarks} across ${liveInsights.totalFolders} folders`,
      `• Unique Domains: ${liveInsights.uniqueDomains} (${liveInsights.httpsRatio}% HTTPS)`,
      `• Duplicates: ${liveInsights.duplicateCount} | Empty Folders: ${liveInsights.emptyFolderCount}`,
      oldestStr,
      busiestStr,
    ]
      .filter(Boolean)
      .join('\n');

    await navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const isSubTabLabelVisible = (tabKey: NormalizedDoctorSubTab) =>
    subTabStage === 'wide' || (subTabStage === 'medium' && subTab === tabKey);

  const clusterDuplicateItems = (group: DuplicateGroup) => {
    const map = new Map<
      string,
      { key: string; primaryItem: FlatBookmark; items: FlatBookmark[]; count: number }
    >();
    for (const item of group.items) {
      const dateStr = formatItemDate(item.dateAdded);
      const key = `${(item.title || '').trim()}||${item.path}||${dateStr}||${item.url}`;
      const existing = map.get(key);
      if (existing) {
        existing.items.push(item);
        existing.count++;
      } else {
        map.set(key, { key, primaryItem: item, items: [item], count: 1 });
      }
    }
    return Array.from(map.values());
  };

  const getDuplicateUrlDiffBadge = (itemUrl: string, groupDisplayUrl: string): string | null => {
    if (itemUrl === groupDisplayUrl) return null;
    try {
      const a = new URL(itemUrl);
      const b = new URL(groupDisplayUrl);
      const diffs: string[] = [];
      if (a.protocol !== b.protocol) {
        diffs.push(a.protocol.replace(':', ''));
      }
      if (a.hostname !== b.hostname) {
        diffs.push(a.hostname);
      }
      if (a.search !== b.search) {
        diffs.push(a.search || '(no query)');
      }
      if (a.hash !== b.hash) {
        diffs.push(a.hash || '(no hash)');
      }
      if (diffs.length > 0) return diffs.join(' ');
    } catch {}
    return itemUrl;
  };

  const splitUrlDiff = (url: string, allUrls: string[]): { prefix: string; diff: string } => {
    if (allUrls.length < 2) return { prefix: '', diff: url };
    let commonLen = url.length;
    for (const other of allUrls) {
      let i = 0;
      const limit = Math.min(commonLen, other.length);
      while (i < limit && url[i] === other[i]) i++;
      commonLen = Math.min(commonLen, i);
    }
    // Snap back slightly to nearest delimiter so differing key/param or fragment stands out cleanly
    let snapIdx = commonLen;
    while (snapIdx > 0 && !['?', '&', '#', '/', '='].includes(url[snapIdx - 1]!)) {
      snapIdx--;
    }
    if (snapIdx === 0) snapIdx = commonLen;

    const rawPrefix = url.slice(0, snapIdx);
    const diff = url.slice(snapIdx);
    let compactPrefix = rawPrefix;
    if (rawPrefix.length > 36) {
      try {
        const parsed = new URL(url);
        const tailLen = 16;
        compactPrefix = `${parsed.hostname}/…${rawPrefix.slice(-tailLen)}`;
      } catch {
        compactPrefix = `…${rawPrefix.slice(-26)}`;
      }
    }
    return { prefix: compactPrefix, diff };
  };

  const renderHttpRowCard = (item: FlatBookmark, insideDomainGroup = false) => {
    const isUpgradingThis = upgradingSingleId === item.id;
    const verifyInfo = httpsVerifyMap.get(item.id);
    const verifyStatus = verifyInfo?.status ?? 'unverified';
    let displayDomainPath = item.domain;
    try {
      const parsed = new URL(item.url);
      const shortPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
      displayDomainPath = `${item.domain}${shortPath}`;
    } catch {}

    return (
      <div
        key={item.id}
        className={`group transition-[border-color,background-color] duration-120 ${
          insideDomainGroup
            ? 'hover:bg-muted/30 px-3 py-2'
            : 'border-border/50 bg-card hover:border-border rounded-lg border px-3 py-2 shadow-2xs'
        }`}
      >
        {/* Line 1: Favicon + Single-line Ellipsis Title + Status Action & Overflow Menu */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {!insideDomainGroup && (
              <img
                src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`}
                alt=""
                className="size-3.5 shrink-0 rounded-xs"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            )}
            <span
              className="text-foreground min-w-0 flex-1 truncate text-xs font-semibold"
              title={item.title || item.url}
            >
              {item.title || item.domain}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {verifyStatus === 'supported' && (
              <Button
                size="xs"
                variant="ghost"
                disabled={isUpgradingThis || isUpgradingHttps}
                onClick={() => handleUpgradeSingleHttps(item)}
                className="h-6 cursor-pointer gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-500/20 active:scale-[0.97] dark:text-emerald-300"
                title={lang === 'tr' ? "HTTPS'e yükselt" : 'Upgrade to HTTPS'}
              >
                {isUpgradingThis ? (
                  <Loader2 className="size-2.5 animate-spin" />
                ) : (
                  <Lock className="size-2.5" />
                )}
                <span>{t('upgradeSingleBtn') || 'Upgrade'}</span>
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex size-6 cursor-pointer items-center justify-center rounded transition-colors"
                aria-label={lang === 'tr' ? 'İşlemler' : 'Actions'}
                title={lang === 'tr' ? 'Diğer işlemler' : 'More actions'}
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto min-w-40 text-xs">
                {verifyStatus !== 'supported' && (
                  <DropdownMenuItem
                    disabled={isUpgradingThis || isUpgradingHttps}
                    onClick={() => handleUpgradeSingleHttps(item)}
                    className="cursor-pointer text-xs"
                  >
                    <Lock className="size-3.5 text-amber-500" />
                    <span>{lang === 'tr' ? "Yine de HTTPS'e Yükselt" : 'Force Upgrade HTTPS'}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    if (browser.tabs?.create) {
                      browser.tabs.create({ url: item.url, active: true });
                    } else {
                      window.open(item.url, '_blank', 'noreferrer');
                    }
                  }}
                  className="cursor-pointer text-xs"
                >
                  <ExternalLink className="size-3.5" />
                  <span>{lang === 'tr' ? 'Yeni sekmede aç' : 'Open in new tab'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDismissInsecure(item.id)}
                  className="cursor-pointer text-xs"
                >
                  <EyeOff className="size-3.5" />
                  <span>{lang === 'tr' ? 'Yoksay' : 'Ignore'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => handleRemoveInsecure(item)}
                  className="cursor-pointer text-xs"
                >
                  <Trash2 className="size-3.5" />
                  <span>{lang === 'tr' ? 'Çöp Kutusuna Taşı' : 'Delete (Trash)'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Line 2: Compact Domain + Status Badge + Folder */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px]">
          <span className="text-muted-foreground min-w-0 truncate font-mono" title={item.url}>
            {displayDomainPath}
          </span>

          {verifyStatus === 'supported' && (
            <Badge
              variant="outline"
              className="h-4 shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[8.5px] font-medium text-emerald-700 dark:text-emerald-300"
            >
              {lang === 'tr' ? 'HTTPS çalışıyor ✓' : 'HTTPS works ✓'}
            </Badge>
          )}
          {verifyStatus === 'unsupported' && (
            <Badge
              variant="outline"
              className="h-4 shrink-0 border-rose-500/30 bg-rose-500/10 px-1.5 py-0 text-[8.5px] font-medium text-rose-600 dark:text-rose-400"
            >
              {lang === 'tr' ? 'Desteklemiyor ✗' : 'Not supported ✗'}
            </Badge>
          )}
          {verifyStatus === 'redirect' && (
            <Badge
              variant="outline"
              className="h-4 shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[8.5px] font-medium text-amber-700 dark:text-amber-300"
              title={
                verifyInfo?.redirectDomain
                  ? `${lang === 'tr' ? 'Yönlendirilen:' : 'Redirects to:'} ${verifyInfo.redirectDomain}`
                  : verifyInfo?.finalUrl
              }
            >
              {lang === 'tr' ? 'Başka domaine yönlendiriyor ⚠' : 'Redirects domain ⚠'}
            </Badge>
          )}
          {verifyStatus === 'unverified' && (
            <Badge
              variant="outline"
              className="text-muted-foreground border-border/60 h-4 shrink-0 px-1.5 py-0 text-[8.5px]"
            >
              {lang === 'tr' ? 'Doğrulanmadı' : 'Unverified'}
            </Badge>
          )}

          {item.path && (
            <Badge
              variant="outline"
              className="text-muted-foreground border-border/50 ml-auto h-4 max-w-[115px] shrink-0 truncate px-1.5 py-0 text-[8.5px]"
              title={item.path}
            >
              📁 {formatShortFolderPath(item.path, lang)}
            </Badge>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col space-y-3 p-3">
      {/* Header */}
      <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              {t('doctorTitle') || 'Bookmark Doctor'}
            </h2>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
              {totalDuplicateBookmarks +
                emptyFolders.length +
                effectiveBrokenCount +
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
          title={t('refreshTooltip')}
          aria-label={t('refreshTooltip')}
          className="text-muted-foreground hover:text-foreground h-7 px-2 text-xs active:scale-[0.97]"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 3-Stage Responsive Subtab Bar (container-type: inline-size) */}
      <div
        ref={subTabBarRef}
        data-stage={subTabStage}
        role="tablist"
        className="responsive-tab-bar bg-muted/30 border-border/60 flex items-center gap-1 rounded-lg border p-1 select-none"
      >
        <button
          role="tab"
          aria-selected={subTab === 'overview'}
          aria-label={t('tabOverview') || 'Overview'}
          data-active={subTab === 'overview'}
          onClick={() => handleSubTabChange('overview')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
            subTab === 'overview'
              ? 'bg-card text-foreground border-border/70 flex-[1.5] border px-2 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground flex-1 px-1'
          }`}
          title={t('tabOverview') || 'Overview'}
        >
          <Activity className="size-3.5 shrink-0 text-emerald-500" />
          <span
            className={`tab-label overflow-hidden text-[11px] whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSubTabLabelVisible('overview')
                ? 'ml-1 max-w-[90px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabOverview') || 'Overview'}
          </span>
        </button>

        <button
          role="tab"
          aria-selected={subTab === 'duplicates'}
          aria-label={t('tabDuplicates') || 'Duplicates'}
          data-active={subTab === 'duplicates'}
          onClick={() => handleSubTabChange('duplicates')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
            subTab === 'duplicates'
              ? 'bg-card text-foreground border-border/70 flex-[1.5] border px-2 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground flex-1 px-1'
          }`}
          title={t('tabDuplicates') || 'Duplicates'}
        >
          <Copy className="size-3.5 shrink-0 text-amber-500" />
          <span
            className={`tab-label overflow-hidden text-[11px] whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSubTabLabelVisible('duplicates')
                ? 'ml-1 max-w-[90px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabDuplicates') || 'Duplicates'}
          </span>
          {totalDuplicateBookmarks > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-3.5 shrink-0 bg-amber-500/15 px-1 py-0 text-[8.5px] font-semibold text-amber-600 dark:text-amber-400"
            >
              {totalDuplicateBookmarks}
            </Badge>
          )}
        </button>

        <button
          role="tab"
          aria-selected={subTab === 'similar'}
          aria-label={t('tabSimilar') || 'Similar'}
          data-active={subTab === 'similar'}
          onClick={() => handleSubTabChange('similar')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
            subTab === 'similar'
              ? 'bg-card text-foreground border-border/70 flex-[1.5] border px-2 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground flex-1 px-1'
          }`}
          title={t('tabSimilar') || 'Similar Bookmarks'}
        >
          <Layers className="size-3.5 shrink-0 text-cyan-500" />
          <span
            className={`tab-label overflow-hidden text-[11px] whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSubTabLabelVisible('similar')
                ? 'ml-1 max-w-[90px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabSimilar') || 'Similar'}
          </span>
          {similarGroups.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-3.5 shrink-0 bg-cyan-500/15 px-1 py-0 text-[8.5px] font-semibold text-cyan-600 dark:text-cyan-400"
            >
              {similarGroups.length}
            </Badge>
          )}
        </button>

        <button
          role="tab"
          aria-selected={subTab === 'trackers'}
          aria-label={t('tabTrackers') || 'Trackers'}
          data-active={subTab === 'trackers'}
          onClick={() => handleSubTabChange('trackers')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
            subTab === 'trackers'
              ? 'bg-card text-foreground border-border/70 flex-[1.5] border px-2 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground flex-1 px-1'
          }`}
          title={t('tabTrackers') || 'Tracking Parameters'}
        >
          <ShieldCheck className="size-3.5 shrink-0 text-teal-500" />
          <span
            className={`tab-label overflow-hidden text-[11px] whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSubTabLabelVisible('trackers')
                ? 'ml-1 max-w-[90px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabTrackers') || 'Trackers'}
          </span>
          {trackingItems.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-3.5 shrink-0 bg-teal-500/15 px-1 py-0 text-[8.5px] font-semibold text-teal-600 dark:text-teal-400"
            >
              {trackingItems.length}
            </Badge>
          )}
        </button>

        <button
          role="tab"
          aria-selected={subTab === 'insecure'}
          aria-label={t('tabInsecure') || 'HTTP'}
          data-active={subTab === 'insecure'}
          onClick={() => handleSubTabChange('insecure')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
            subTab === 'insecure'
              ? 'bg-card text-foreground border-border/70 flex-[1.5] border px-2 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground flex-1 px-1'
          }`}
          title={
            lang === 'tr'
              ? 'HTTP: Şifresiz (http://) bağlantılar — site çalışıyor olabilir ancak HTTPS kullanmıyor'
              : 'Insecure HTTP: Unencrypted (http://) protocol — site works but does not use HTTPS'
          }
        >
          <ShieldAlert className="size-3.5 shrink-0 text-amber-500" />
          <span
            className={`tab-label overflow-hidden text-[11px] whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSubTabLabelVisible('insecure')
                ? 'ml-1 max-w-[90px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabInsecure') || 'HTTP'}
          </span>
          {insecureBookmarks.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-3.5 shrink-0 bg-amber-500/15 px-1 py-0 text-[8.5px] font-semibold text-amber-600 dark:text-amber-400"
            >
              {insecureBookmarks.length}
            </Badge>
          )}
        </button>

        <button
          role="tab"
          aria-selected={subTab === 'broken'}
          aria-label={t('tabBroken') || '404 Links'}
          data-active={subTab === 'broken'}
          onClick={() => handleSubTabChange('broken')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
            subTab === 'broken'
              ? 'bg-card text-foreground border-border/70 flex-[1.5] border px-2 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground flex-1 px-1'
          }`}
          title={
            lang === 'tr'
              ? '404 Kırık Linkler: Silinmiş veya ulaşılamayan (404/5xx) ölü sayfalar'
              : '404 Broken Links: Dead or missing (404/5xx) pages that no longer exist'
          }
        >
          <Link2Off className="size-3.5 shrink-0 text-rose-500" />
          <span
            className={`tab-label overflow-hidden text-[11px] whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSubTabLabelVisible('broken')
                ? 'ml-1 max-w-[90px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabBroken') || '404'}
          </span>
          {(effectiveBrokenCount > 0 || (hasScannedBroken && activeBrokenTotalCount > 0)) && (
            <Badge
              variant="destructive"
              className="ml-1 h-3.5 shrink-0 px-1 py-0 text-[8.5px] font-semibold"
            >
              {effectiveBrokenCount > 0 ? effectiveBrokenCount : activeBrokenTotalCount}
            </Badge>
          )}
        </button>

        <button
          role="tab"
          aria-selected={subTab === 'empty'}
          aria-label={t('tabEmptyFolders') || 'Empty Folders'}
          data-active={subTab === 'empty'}
          onClick={() => handleSubTabChange('empty')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
            subTab === 'empty'
              ? 'bg-card text-foreground border-border/70 flex-[1.5] border px-2 font-semibold shadow-2xs'
              : 'text-muted-foreground hover:text-foreground flex-1 px-1'
          }`}
          title={t('tabEmptyFolders') || 'Empty Folders'}
        >
          <FolderX className="size-3.5 shrink-0 text-blue-500" />
          <span
            className={`tab-label overflow-hidden text-[11px] whitespace-nowrap transition-[max-width,opacity,margin] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              isSubTabLabelVisible('empty')
                ? 'ml-1 max-w-[90px] opacity-100'
                : 'ml-0 max-w-0 opacity-0'
            }`}
          >
            {t('tabEmptyFolders') || 'Empty'}
          </span>
          {emptyFolders.length > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-3.5 shrink-0 bg-blue-500/15 px-1 py-0 text-[8.5px] font-semibold text-blue-600 dark:text-blue-400"
            >
              {emptyFolders.length}
            </Badge>
          )}
        </button>
      </div>

      {/* ===================== TAB 0: OVERVIEW (HEALTH + ISSUE CARDS + COLLAPSIBLE INSIGHTS) ===================== */}
      {visitedSubTabs.has('overview') && (
        <div className={subTab === 'overview' ? 'space-y-3' : 'hidden'}>
          {isLoading || !liveInsights ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center space-y-2 py-16">
              <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
              <p className="text-xs">{t('calculatingInsights') || 'Calculating insights...'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 1. Health Score Hero Card (Single Score Representation + Linked Deductions) */}
              <div className="border-border/60 bg-card space-y-3 rounded-xl border p-3.5 shadow-2xs">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="text-muted-foreground block text-[11px] font-medium tracking-wider uppercase">
                      {t('overallHealth') || 'Overall Health Score'}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={`px-2 py-0.5 text-[10.5px] font-semibold ${getScoreColor(
                          liveInsights.healthScore
                        )}`}
                      >
                        {getRatingLabel(liveInsights.rating)}
                      </Badge>
                      <span className="text-muted-foreground text-[11px]">
                        {liveInsights.duplicateCount === 0 &&
                        liveInsights.emptyFolderCount === 0 &&
                        liveInsights.httpCount === 0
                          ? t('healthCleanMsg') || 'No clutter detected'
                          : t('healthIssuesMsg', {
                              count:
                                liveInsights.duplicateCount +
                                liveInsights.emptyFolderCount +
                                liveInsights.httpCount,
                            }) ||
                            `${
                              liveInsights.duplicateCount +
                              liveInsights.emptyFolderCount +
                              liveInsights.httpCount
                            } items to optimize`}
                      </span>
                    </div>
                  </div>

                  {/* Single Health Score Ring */}
                  <div
                    className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-full border-4 shadow-xs ${getScoreColor(
                      liveInsights.healthScore
                    )}`}
                  >
                    <span className="text-base leading-none font-bold">
                      {liveInsights.healthScore}
                    </span>
                    <span className="text-[8.5px] font-medium opacity-75">/ 100</span>
                  </div>
                </div>

                {/* Line-by-line Score Deductions linked to Doctor subtabs */}
                {(liveInsights.penalties.duplicates > 0 ||
                  liveInsights.penalties.emptyFolders > 0 ||
                  liveInsights.penalties.insecureHttp > 0 ||
                  liveInsights.penalties.brokenLinks > 0) && (
                  <div className="border-border/40 bg-muted/20 space-y-1.5 rounded-lg border p-2.5 text-xs">
                    <div className="text-muted-foreground flex items-center justify-between text-[10px] font-semibold tracking-wider uppercase">
                      <span>{t('scoreBreakdown') || 'Score Deductions'}</span>
                      <span>-{100 - liveInsights.healthScore} pts</span>
                    </div>
                    <div className="divide-border/30 flex flex-col divide-y text-[11px]">
                      {liveInsights.penalties.duplicates > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSubTabChange('duplicates')}
                          className="hover:bg-muted/40 flex w-full cursor-pointer items-center justify-between rounded px-1 py-1 text-left text-amber-600 transition-colors dark:text-amber-400"
                        >
                          <span>• {t('deductDuplicates') || 'Duplicates'}</span>
                          <span className="flex items-center gap-1 font-semibold">
                            -{liveInsights.penalties.duplicates}
                            <ArrowRight className="size-2.5 opacity-70" />
                          </span>
                        </button>
                      )}
                      {liveInsights.penalties.emptyFolders > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSubTabChange('empty')}
                          className="hover:bg-muted/40 flex w-full cursor-pointer items-center justify-between rounded px-1 py-1 text-left text-blue-600 transition-colors dark:text-blue-400"
                        >
                          <span>• {t('deductEmpty') || 'Empty folders'}</span>
                          <span className="flex items-center gap-1 font-semibold">
                            -{liveInsights.penalties.emptyFolders}
                            <ArrowRight className="size-2.5 opacity-70" />
                          </span>
                        </button>
                      )}
                      {liveInsights.penalties.insecureHttp > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSubTabChange('insecure')}
                          className="text-muted-foreground hover:bg-muted/40 hover:text-foreground flex w-full cursor-pointer items-center justify-between rounded px-1 py-1 text-left transition-colors"
                        >
                          <span>• {t('deductHttp') || 'Insecure HTTP'}</span>
                          <span className="flex items-center gap-1 font-semibold">
                            -{liveInsights.penalties.insecureHttp}
                            <ArrowRight className="size-2.5 opacity-70" />
                          </span>
                        </button>
                      )}
                      {liveInsights.penalties.brokenLinks > 0 && (
                        <button
                          type="button"
                          onClick={() => handleSubTabChange('broken')}
                          className="hover:bg-muted/40 flex w-full cursor-pointer items-center justify-between rounded px-1 py-1 text-left text-rose-600 transition-colors dark:text-rose-400"
                        >
                          <span>• {t('deductBroken') || 'Broken / 404'}</span>
                          <span className="flex items-center gap-1 font-semibold">
                            -{liveInsights.penalties.brokenLinks}
                            <ArrowRight className="size-2.5 opacity-70" />
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. 6 Issue Cards (Unified counts from Doctor subtabs) */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {/* Duplicates */}
                <button
                  type="button"
                  onClick={() => handleSubTabChange('duplicates')}
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
                    liveInsights.duplicateCount > 0
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-border/50 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10.5px] font-medium">
                      {t('duplicatesMetric') || 'Duplicates'}
                    </span>
                    {liveInsights.duplicateCount > 0 ? (
                      <ArrowRight className="size-3 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold">{liveInsights.duplicateCount}</span>
                    {liveInsights.duplicateCount === 0 && (
                      <span className="text-muted-foreground text-[9.5px]">
                        {t('allClear') || 'All clear'}
                      </span>
                    )}
                  </div>
                </button>

                {/* Similar */}
                <button
                  type="button"
                  onClick={() => handleSubTabChange('similar')}
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
                    (liveInsights.similarCount || 0) > 0
                      ? 'border-cyan-500/30 bg-cyan-500/5'
                      : 'border-border/50 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10.5px] font-medium">
                      {t('tabSimilar') || 'Similar'}
                    </span>
                    {(liveInsights.similarCount || 0) > 0 ? (
                      <ArrowRight className="size-3 text-cyan-500" />
                    ) : (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold">{liveInsights.similarCount || 0}</span>
                    {(liveInsights.similarCount || 0) === 0 && (
                      <span className="text-muted-foreground text-[9.5px]">
                        {t('allClear') || 'All clear'}
                      </span>
                    )}
                  </div>
                </button>

                {/* Trackers */}
                <button
                  type="button"
                  onClick={() => handleSubTabChange('trackers')}
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
                    (liveInsights.trackingCount || 0) > 0
                      ? 'border-teal-500/30 bg-teal-500/5'
                      : 'border-border/50 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10.5px] font-medium">
                      {t('tabTrackers') || 'Trackers'}
                    </span>
                    {(liveInsights.trackingCount || 0) > 0 ? (
                      <ArrowRight className="size-3 text-teal-500" />
                    ) : (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold">{liveInsights.trackingCount || 0}</span>
                    {(liveInsights.trackingCount || 0) === 0 && (
                      <span className="text-muted-foreground text-[9.5px]">
                        {t('allClear') || 'All clear'}
                      </span>
                    )}
                  </div>
                </button>

                {/* HTTP */}
                <button
                  type="button"
                  onClick={() => handleSubTabChange('insecure')}
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
                    liveInsights.httpCount > 0
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-border/50 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10.5px] font-medium">
                      {t('tabInsecure') || 'HTTP'}
                    </span>
                    {liveInsights.httpCount > 0 ? (
                      <ArrowRight className="size-3 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold">{liveInsights.httpCount}</span>
                    {liveInsights.httpCount === 0 && (
                      <span className="text-muted-foreground text-[9.5px]">
                        {t('allClear') || 'All clear'}
                      </span>
                    )}
                  </div>
                </button>

                {/* 404 Links */}
                <button
                  type="button"
                  onClick={() => handleSubTabChange('broken')}
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
                    hasEverScanned404 && (liveInsights.brokenCount || 0) > 0
                      ? 'border-rose-500/30 bg-rose-500/5'
                      : !hasEverScanned404
                        ? 'border-border/40 bg-muted/15 opacity-80'
                        : 'border-border/50 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10.5px] font-medium">
                      404 Links
                    </span>
                    {hasEverScanned404 && (liveInsights.brokenCount || 0) > 0 ? (
                      <AlertTriangle className="size-3 text-rose-500" />
                    ) : hasEverScanned404 ? (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    ) : (
                      <Radio className="text-muted-foreground/50 size-3" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    {hasEverScanned404 ? (
                      <>
                        <span className="text-base font-bold">{liveInsights.brokenCount || 0}</span>
                        {(liveInsights.brokenCount || 0) === 0 && (
                          <span className="text-muted-foreground text-[9.5px]">
                            {t('allClear') || 'All clear'}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs font-medium italic">
                        {lang === 'tr' ? 'Taranmadı' : 'Not scanned'}
                      </span>
                    )}
                  </div>
                </button>

                {/* Empty Folders */}
                <button
                  type="button"
                  onClick={() => handleSubTabChange('empty')}
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.98] ${
                    liveInsights.emptyFolderCount > 0
                      ? 'border-blue-500/30 bg-blue-500/5'
                      : 'border-border/50 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[10.5px] font-medium">
                      {t('emptyFoldersMetric') || 'Empty Folders'}
                    </span>
                    {liveInsights.emptyFolderCount > 0 ? (
                      <ArrowRight className="size-3 text-blue-500" />
                    ) : (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-bold">{liveInsights.emptyFolderCount}</span>
                    {liveInsights.emptyFolderCount === 0 && (
                      <span className="text-muted-foreground text-[9.5px]">
                        {t('allClear') || 'All clear'}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* 3. Collapsible Section: Library Facts */}
              <div className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleOverviewSection('facts')}
                  className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-amber-500" />
                    <span className="text-foreground text-xs font-semibold tracking-tight">
                      {t('libraryFactsTitle') || 'Library Facts'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">
                      {liveInsights.totalBookmarks} {t('totalLinks') || 'links'} ·{' '}
                      {liveInsights.totalFolders} {t('totalFolders') || 'folders'}
                    </span>
                    <ChevronDown
                      className={`text-muted-foreground size-3.5 transition-transform duration-150 ${
                        openOverviewSections.facts ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {openOverviewSections.facts && (
                  <div className="border-border/40 divide-border/30 divide-y border-t px-3.5 py-1.5 text-xs">
                    {liveInsights.oldestBookmark && (
                      <div className="flex items-center justify-between gap-2 py-2">
                        <span className="text-muted-foreground flex shrink-0 items-center gap-1.5">
                          <Clock className="size-3 text-blue-500" />
                          {t('oldestBookmark') || 'Oldest Bookmark'}
                        </span>
                        <a
                          href={liveInsights.oldestBookmark.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary flex min-w-0 items-center gap-1 truncate text-[11px] font-medium hover:underline"
                          title={`${liveInsights.oldestBookmark.title} — ${liveInsights.oldestBookmark.domain}`}
                        >
                          <span className="truncate">{liveInsights.oldestBookmark.title}</span>
                          <span className="text-muted-foreground shrink-0 text-[10px]">
                            ({new Date(liveInsights.oldestBookmark.dateAdded).getFullYear()})
                          </span>
                          <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                        </a>
                      </div>
                    )}

                    {liveInsights.busiestMonth && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <CalendarDays className="size-3 text-emerald-500" />
                          {t('busiestMonth') || 'Busiest Month'}
                        </span>
                        <span className="text-[11px] font-medium">
                          {new Date(
                            liveInsights.busiestMonth.year,
                            liveInsights.busiestMonth.month
                          ).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', {
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          <span className="text-muted-foreground font-normal">
                            ({liveInsights.busiestMonth.count})
                          </span>
                        </span>
                      </div>
                    )}

                    <div
                      onClick={() => {
                        const parts = (liveInsights.deepestFolderPath || '').split(' / ');
                        const leaf = parts[parts.length - 1] || '';
                        onNavigateToLibrary?.(leaf);
                      }}
                      className="hover:bg-muted/30 -mx-1 flex cursor-pointer items-center justify-between rounded px-1 py-2 transition-colors"
                      title={
                        liveInsights.deepestFolderPath
                          ? `Filter Library: ${liveInsights.deepestFolderPath}`
                          : 'Open in Library'
                      }
                    >
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Layers className="size-3 text-purple-500" />
                        {t('deepestNesting') || 'Deepest Folder Nesting'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium">
                        {liveInsights.deepestNesting} {t('levels') || 'levels'}
                        <ArrowRight className="text-muted-foreground size-2.5" />
                      </span>
                    </div>

                    <div
                      onClick={() => onNavigateToLibrary?.('is:loose')}
                      className="hover:bg-muted/30 -mx-1 flex cursor-pointer items-center justify-between rounded px-1 py-2 transition-colors"
                      title={
                        lang === 'tr'
                          ? 'Klasörsüz yer imlerini Kütüphanede filtrele'
                          : 'Filter loose bookmarks in Library'
                      }
                    >
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Bookmark className="size-3 text-amber-500" />
                        {t('looseBookmarks') || 'Loose Bookmarks (No Folder)'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium">
                        {liveInsights.looseBookmarksCount}
                        <ArrowRight className="text-muted-foreground size-2.5" />
                      </span>
                    </div>

                    <div
                      onClick={() => onNavigateToLibrary?.('')}
                      className="hover:bg-muted/30 -mx-1 flex cursor-pointer items-center justify-between rounded px-1 py-2 transition-colors"
                      title={lang === 'tr' ? 'Kütüphanede aç' : 'Open in Library'}
                    >
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <FolderTree className="size-3 text-sky-500" />
                        {t('avgBookmarksPerFolder') || 'Avg. Bookmarks / Folder'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium">
                        {liveInsights.avgBookmarksPerFolder}
                        <ArrowRight className="text-muted-foreground size-2.5" />
                      </span>
                    </div>

                    <div
                      onClick={() => onNavigateToLibrary?.('is:single-domain')}
                      className="hover:bg-muted/30 -mx-1 flex cursor-pointer items-center justify-between rounded px-1 py-2 transition-colors"
                      title={
                        lang === 'tr'
                          ? 'Tek seferlik domainleri Kütüphanede filtrele'
                          : 'Filter single-use domains in Library'
                      }
                    >
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Globe className="size-3 text-indigo-500" />
                        {t('singleUseDomains') || 'Domains Saved Only Once'}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-medium">
                        {liveInsights.singleUseDomainsCount}
                        <ArrowRight className="text-muted-foreground size-2.5" />
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Collapsible Section: Bookmark Age Distribution */}
              <div className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleOverviewSection('age')}
                  className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="size-3.5 text-sky-500" />
                    <span className="text-foreground text-xs font-semibold tracking-tight">
                      {t('bookmarkAgeTitle') || 'Bookmark Age Distribution'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">
                      {liveInsights.totalBookmarks} total
                    </span>
                    <ChevronDown
                      className={`text-muted-foreground size-3.5 transition-transform duration-150 ${
                        openOverviewSections.age ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {openOverviewSections.age && (
                  <div className="border-border/40 space-y-3 border-t p-3.5">
                    <div className="bg-muted/40 flex h-2 w-full overflow-hidden rounded-full">
                      <div
                        className="bg-emerald-500 transition-[width] duration-200 ease-[var(--ease-out)]"
                        style={{
                          width: `${liveInsights.ageDistribution.under6Months.percentage}%`,
                        }}
                      />
                      <div
                        className="bg-sky-500 transition-[width] duration-200 ease-[var(--ease-out)]"
                        style={{
                          width: `${liveInsights.ageDistribution.sixTo12Months.percentage}%`,
                        }}
                      />
                      <div
                        className="bg-amber-500 transition-[width] duration-200 ease-[var(--ease-out)]"
                        style={{
                          width: `${liveInsights.ageDistribution.oneTo3Years.percentage}%`,
                        }}
                      />
                      <div
                        className="bg-purple-500 transition-[width] duration-200 ease-[var(--ease-out)]"
                        style={{
                          width: `${liveInsights.ageDistribution.over3Years.percentage}%`,
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          <span>{t('under6mo') || '< 6 months'}</span>
                        </div>
                        <div className="flex items-baseline gap-1 text-[11px] font-semibold">
                          <span>
                            {formatPct(
                              liveInsights.ageDistribution.under6Months.count,
                              liveInsights.ageDistribution.under6Months.percentage
                            )}
                          </span>
                          <span className="text-muted-foreground text-[9.5px] font-normal">
                            ({liveInsights.ageDistribution.under6Months.count})
                          </span>
                        </div>
                      </div>

                      <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-sky-600 dark:text-sky-400">
                          <span className="size-1.5 rounded-full bg-sky-500" />
                          <span>{t('sixTo12mo') || '6 - 12 months'}</span>
                        </div>
                        <div className="flex items-baseline gap-1 text-[11px] font-semibold">
                          <span>
                            {formatPct(
                              liveInsights.ageDistribution.sixTo12Months.count,
                              liveInsights.ageDistribution.sixTo12Months.percentage
                            )}
                          </span>
                          <span className="text-muted-foreground text-[9.5px] font-normal">
                            ({liveInsights.ageDistribution.sixTo12Months.count})
                          </span>
                        </div>
                      </div>

                      <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                          <span className="size-1.5 rounded-full bg-amber-500" />
                          <span>{t('oneTo3yr') || '1 - 3 years'}</span>
                        </div>
                        <div className="flex items-baseline gap-1 text-[11px] font-semibold">
                          <span>
                            {formatPct(
                              liveInsights.ageDistribution.oneTo3Years.count,
                              liveInsights.ageDistribution.oneTo3Years.percentage
                            )}
                          </span>
                          <span className="text-muted-foreground text-[9.5px] font-normal">
                            ({liveInsights.ageDistribution.oneTo3Years.count})
                          </span>
                        </div>
                      </div>

                      <div className="border-border/40 bg-muted/15 space-y-0.5 rounded-md border p-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-purple-600 dark:text-purple-400">
                          <span className="size-1.5 rounded-full bg-purple-500" />
                          <span>{t('over3yr') || '3+ years'}</span>
                        </div>
                        <div className="flex items-baseline gap-1 text-[11px] font-semibold">
                          <span>
                            {formatPct(
                              liveInsights.ageDistribution.over3Years.count,
                              liveInsights.ageDistribution.over3Years.percentage
                            )}
                          </span>
                          <span className="text-muted-foreground text-[9.5px] font-normal">
                            ({liveInsights.ageDistribution.over3Years.count})
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Collapsible Section: Largest Folders */}
              {liveInsights.topFolders.length > 0 && (
                <div className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-2xs">
                  <button
                    type="button"
                    onClick={() => toggleOverviewSection('folders')}
                    className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Folder className="size-3.5 text-amber-500" />
                      <span className="text-foreground text-xs font-semibold tracking-tight">
                        {t('largestFoldersTitle') || 'Largest Folders'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-[10px]">
                        {liveInsights.totalFolders} folders
                      </span>
                      <ChevronDown
                        className={`text-muted-foreground size-3.5 transition-transform duration-150 ${
                          openOverviewSections.folders ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {openOverviewSections.folders && (
                    <div className="border-border/40 space-y-2 border-t p-3.5">
                      {(() => {
                        const maxFolderCount = Math.max(1, liveInsights.topFolders[0]?.count || 1);
                        return liveInsights.topFolders.map((folder) => {
                          const barWidth = Math.round((folder.count / maxFolderCount) * 100);
                          return (
                            <div
                              key={folder.id}
                              onClick={() => onNavigateToLibrary?.(folder.title)}
                              className="hover:bg-muted/40 group cursor-pointer space-y-1 rounded-md p-1.5 transition-colors"
                              title={`${folder.path} — Click to filter Library`}
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <Folder className="size-3.5 shrink-0 text-amber-500" />
                                  <span className="text-foreground group-hover:text-primary truncate text-[11px] font-medium transition-colors">
                                    {formatFolderTitle(folder.title, folder.path, lang)}
                                  </span>
                                  <span
                                    className="text-muted-foreground/60 hidden truncate text-[9.5px] sm:inline"
                                    title={folder.path}
                                  >
                                    ({formatShortFolderPath(folder.path, lang)})
                                  </span>
                                </div>
                                <span className="text-muted-foreground group-hover:text-foreground shrink-0 text-[10.5px]">
                                  {folder.count} ({formatPct(folder.count, folder.percentage)})
                                </span>
                              </div>

                              <div className="bg-muted/40 h-1.5 w-full overflow-hidden rounded-full">
                                <div
                                  className="h-full w-full origin-left rounded-full bg-amber-500 transition-transform duration-200 ease-[var(--ease-out)]"
                                  style={{ transform: `scaleX(${barWidth / 100})` }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* 6. Collapsible Section: Top Domains */}
              <div className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleOverviewSection('domains')}
                  className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="size-3.5 text-indigo-500" />
                    <span className="text-foreground text-xs font-semibold tracking-tight">
                      {t('topDomainsTitle') || 'Top Bookmarked Domains'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[10px]">
                      {liveInsights.uniqueDomains} {t('totalUnique') || 'unique'}
                    </span>
                    <ChevronDown
                      className={`text-muted-foreground size-3.5 transition-transform duration-150 ${
                        openOverviewSections.domains ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {openOverviewSections.domains && (
                  <div className="border-border/40 space-y-1.5 border-t p-3.5">
                    {liveInsights.topDomains.length === 0 ? (
                      <p className="text-muted-foreground py-2 text-xs">
                        {t('noDomainsYet') || 'No domains bookmarked yet.'}
                      </p>
                    ) : (
                      (() => {
                        const maxDomainCount = Math.max(1, liveInsights.topDomains[0]?.count || 1);
                        return liveInsights.topDomains.map((item) => {
                          const barWidth = Math.round((item.count / maxDomainCount) * 100);
                          return (
                            <div
                              key={item.domain}
                              onClick={() => onNavigateToLibrary?.(item.domain)}
                              className="hover:bg-muted/40 group cursor-pointer space-y-1 rounded-md p-1 transition-colors"
                              title={`Click to filter Library by ${item.domain}`}
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
                                      `https://${item.domain}`
                                    )}&sz=32`}
                                    alt=""
                                    className="size-3.5 shrink-0 rounded-xs"
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                  <span className="text-foreground group-hover:text-primary truncate font-mono text-[11px] font-medium transition-colors">
                                    {item.domain}
                                  </span>
                                </div>
                                <span className="text-muted-foreground group-hover:text-foreground shrink-0 text-[10.5px]">
                                  {item.count} ({formatPct(item.count, item.percentage)})
                                </span>
                              </div>

                              <div className="bg-muted/40 h-1.5 w-full overflow-hidden rounded-full">
                                <div
                                  className="bg-foreground/60 h-full w-full origin-left rounded-full transition-transform duration-200 ease-[var(--ease-out)]"
                                  style={{ transform: `scaleX(${barWidth / 100})` }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                )}
              </div>

              {/* 7. Collapsible Section: Share & Export */}
              <div className="border-border/60 bg-card overflow-hidden rounded-xl border shadow-2xs">
                <button
                  type="button"
                  onClick={() => toggleOverviewSection('export')}
                  className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Share2 className="text-muted-foreground size-3.5" />
                    <span className="text-foreground text-xs font-semibold tracking-tight">
                      {t('exportShareTitle') || 'Share & Export'}
                    </span>
                  </div>
                  <ChevronDown
                    className={`text-muted-foreground size-3.5 transition-transform duration-150 ${
                      openOverviewSections.export ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {openOverviewSections.export && (
                  <div className="border-border/40 flex flex-wrap items-center gap-1.5 border-t p-3">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={handleExportDomainsCsv}
                      className="h-6 cursor-pointer gap-1 px-2 text-[10px] active:scale-[0.97]"
                      title="Download domains as CSV"
                    >
                      <FileSpreadsheet className="size-3 text-emerald-500" />
                      <span>{t('exportDomainsCsv') || 'Domains (CSV)'}</span>
                    </Button>

                    <Button
                      size="xs"
                      variant="outline"
                      onClick={handleExportFullJson}
                      className="h-6 cursor-pointer gap-1 px-2 text-[10px] active:scale-[0.97]"
                      title="Download full library backup as JSON"
                    >
                      <FileCode className="size-3 text-sky-500" />
                      <span>{t('exportJson') || 'Full Data (JSON)'}</span>
                    </Button>

                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={handleCopySummary}
                      className="h-6 cursor-pointer gap-1 px-2 text-[10px] active:scale-[0.97]"
                      title="Copy text summary to clipboard"
                    >
                      {copiedSummary ? (
                        <>
                          <Check className="size-3 text-emerald-500" />
                          <span>{t('summaryCopied') || 'Copied!'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>{t('copySummary') || 'Copy Summary'}</span>
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 1: DUPLICATES ===================== */}
      {visitedSubTabs.has('duplicates') && (
        <div className={subTab === 'duplicates' ? 'space-y-3' : 'hidden'}>
          {/* Header & Scope Selector */}
          <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  {totalDuplicateBookmarks}{' '}
                  {t('duplicateItemsFound') || 'duplicate bookmarks found'}
                </span>
                <p className="mt-0.5 text-[11px] text-amber-600/85 dark:text-amber-400/85">
                  {lang === 'tr'
                    ? 'Her grupta tutulacak kopyayı seçin; fazlalıklar Çöp Kutusuna gider.'
                    : 'Choose which copy to keep per group; extra copies move to Trash.'}
                </p>
              </div>

              {activeDuplicates.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {confirmCleanDuplicates ? (
                    <div className="animate-in fade-in flex items-center gap-1.5 duration-150">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleCleanAllDuplicates}
                        className="h-7 px-2.5 text-xs font-medium active:scale-[0.97]"
                      >
                        {lang === 'tr'
                          ? `Onayla (${totalDuplicateBookmarks} sil)`
                          : `Confirm (${totalDuplicateBookmarks})`}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmCleanDuplicates(false)}
                        className="h-7 px-2 text-xs"
                      >
                        {t('cancelBtn') || 'Cancel'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmCleanDuplicates(true)}
                      className="h-7 cursor-pointer border-amber-500/40 text-xs font-medium text-amber-700 hover:bg-amber-500/20 active:scale-[0.97] dark:text-amber-300"
                    >
                      <Sparkles className="mr-1 size-3" />
                      {lang === 'tr'
                        ? `Tümünü Temizle (${totalDuplicateBookmarks})`
                        : `Clean All (${totalDuplicateBookmarks})`}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Clean All Impact Preview */}
            {confirmCleanDuplicates && activeDuplicates.length > 0 && (
              <div className="bg-background/70 flex flex-wrap items-center gap-1.5 rounded-md border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {lang === 'tr'
                    ? `${totalDuplicateBookmarks} silinecek, ${activeDuplicates.length} kalacak, Çöp Kutusuna gider`
                    : `${totalDuplicateBookmarks} will be deleted, ${activeDuplicates.length} will be kept, moved to Trash`}
                </span>
                {separatorGroups.length > 0 && (
                  <span className="text-muted-foreground text-[10px]">
                    • {lang === 'tr' ? 'Ayırıcılar hariç' : 'Separators excluded'}
                  </span>
                )}
              </div>
            )}

            {/* Scope Toggle + Ignored Reset */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-500/15 pt-2">
              <div className="bg-background/60 border-border/50 inline-flex items-center rounded-md border p-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => handleDuplicateScopeChange('library')}
                  className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                    duplicateScope === 'library'
                      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lang === 'tr' ? 'Tüm kütüphanede' : 'Entire library'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicateScopeChange('folder')}
                  className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                    duplicateScope === 'folder'
                      ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lang === 'tr' ? 'Aynı klasör içinde' : 'Same folder'}
                </button>
              </div>

              {ignoredDuplicateCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetIgnoredDuplicates}
                  className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] underline-offset-2 hover:underline"
                >
                  {lang === 'tr'
                    ? `${ignoredDuplicateCount} gizlenen grubu göster`
                    : `Show ${ignoredDuplicateCount} ignored group(s)`}
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
              <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
            </div>
          ) : activeDuplicates.length === 0 ? (
            <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-12 text-center">
              <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="size-5 text-emerald-500" />
              </div>
              <h3 className="text-foreground text-xs font-semibold">
                {t('noDuplicatesTitle') || 'No Duplicates Found'}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {duplicateScope === 'folder'
                  ? lang === 'tr'
                    ? 'Hiçbir klasör içinde mükerrer yer imi bulunamadı.'
                    : 'No duplicate bookmarks found inside the same folder.'
                  : t('noDuplicatesDesc') || 'All your bookmark URLs are unique and clean.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeDuplicates.map((group) => {
                const keepId = getGroupKeepId(group);
                const clusters = clusterDuplicateItems(group);
                const isExpanded = expandedGroups[group.normalizedUrl] ?? false;
                const visibleClusters =
                  isExpanded || clusters.length <= 4 ? clusters : clusters.slice(0, 4);
                const hasMore = clusters.length > 4;

                const distinctTitles = new Set(
                  clusters.map((c) => (c.primaryItem.title || '').trim())
                );
                const distinctDates = new Set(
                  clusters.map((c) => formatItemDate(c.primaryItem.dateAdded))
                );
                const hasTitleDiff = distinctTitles.size > 1;
                const hasDateDiff = distinctDates.size > 1;

                return (
                  <div
                    key={group.normalizedUrl}
                    className="border-border/60 bg-card overflow-hidden rounded-lg border shadow-2xs transition-[border-color,background-color,box-shadow] duration-150"
                  >
                    {/* Group Header (URL shown once cleanly here) */}
                    <div className="bg-muted/20 border-border/40 space-y-1 border-b px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
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
                            className="h-4 shrink-0 px-1.5 py-0 text-[9.5px] font-medium"
                          >
                            {lang === 'tr'
                              ? `${group.items.length} kopya`
                              : `${group.items.length} copies`}
                          </Badge>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => handleIgnoreDuplicateGroup(group.normalizedUrl)}
                            className="text-muted-foreground hover:text-foreground h-6 cursor-pointer px-2 text-[10.5px]"
                            title={lang === 'tr' ? 'Bu grubu yoksay' : 'Ignore this group'}
                          >
                            {lang === 'tr' ? 'Yoksay' : 'Ignore'}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleResolveGroup(group, keepId)}
                            className="h-6 cursor-pointer border-amber-400/50 px-2 text-[10.5px] font-medium text-amber-700 hover:bg-amber-500/10 active:scale-[0.97] dark:text-amber-300"
                          >
                            {lang === 'tr'
                              ? `Temizle (-${group.items.length - 1})`
                              : `Keep Selected (-${group.items.length - 1})`}
                          </Button>
                        </div>
                      </div>

                      <div
                        className="text-muted-foreground/80 truncate font-mono text-[10px]"
                        title={group.displayUrl}
                      >
                        {group.displayUrl}
                      </div>
                    </div>

                    {/* Clustered 2-Line Rows with Radio Selection & Differing Fields Only */}
                    <div className="divide-border/30 divide-y text-xs">
                      {visibleClusters.map((cluster) => {
                        const item = cluster.primaryItem;
                        const isKeptCluster = cluster.items.some((it) => it.id === keepId);
                        const radioTargetId = isKeptCluster ? keepId : item.id;
                        const extraItems = isKeptCluster
                          ? cluster.items.filter((it) => it.id !== keepId)
                          : cluster.items;
                        const urlDiff = getDuplicateUrlDiffBadge(item.url, group.displayUrl);
                        const dateLabel = formatItemDate(item.dateAdded);

                        return (
                          <div
                            key={cluster.key}
                            onClick={() => handleSelectKeepId(group.normalizedUrl, radioTargetId)}
                            className={`group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 transition-colors ${
                              isKeptCluster ? 'bg-emerald-500/5' : 'hover:bg-muted/30'
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <input
                                type="radio"
                                name={`dup-keep-${group.normalizedUrl}`}
                                checked={isKeptCluster}
                                onChange={() =>
                                  handleSelectKeepId(group.normalizedUrl, radioTargetId)
                                }
                                onClick={(e) => e.stopPropagation()}
                                className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-amber-600"
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                {/* Line 1: Keep badge + Title + Identical cluster count */}
                                <div className="flex min-w-0 items-center gap-1.5">
                                  {isKeptCluster && (
                                    <Badge
                                      variant="outline"
                                      className="h-3.5 shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1 py-0 text-[8.5px] font-medium text-emerald-600 dark:text-emerald-400"
                                    >
                                      {lang === 'tr' ? 'Kalacak' : 'Keep'}
                                    </Badge>
                                  )}
                                  <span
                                    className={`truncate text-[11px] font-medium ${
                                      hasTitleDiff || isKeptCluster
                                        ? 'text-foreground'
                                        : 'text-muted-foreground'
                                    }`}
                                    title={item.title || item.url}
                                  >
                                    {item.title || item.domain}
                                  </span>
                                  {cluster.count > 1 && (
                                    <Badge
                                      variant="secondary"
                                      className="h-3.5 shrink-0 bg-amber-500/15 px-1.5 py-0 text-[8.5px] font-semibold text-amber-700 dark:text-amber-300"
                                    >
                                      {isKeptCluster
                                        ? lang === 'tr'
                                          ? `×${cluster.count} birebir aynı, ${cluster.count - 1}'i silinecek`
                                          : `×${cluster.count} identical, ${cluster.count - 1} to delete`
                                        : lang === 'tr'
                                          ? `×${cluster.count} birebir aynı, silinecek`
                                          : `×${cluster.count} identical, delete all`}
                                    </Badge>
                                  )}
                                </div>

                                {/* Line 2: Differing context only (Folder, Date if differs/needed, URL diff tag) */}
                                <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[10px]">
                                  <span className="truncate" title={item.path}>
                                    📁 {formatShortFolderPath(item.path, lang)}
                                  </span>
                                  {dateLabel && (hasDateDiff || clusters.length === 1) && (
                                    <>
                                      <span className="shrink-0">•</span>
                                      <span className="shrink-0">{dateLabel}</span>
                                    </>
                                  )}
                                  {urlDiff && (
                                    <>
                                      <span className="shrink-0">•</span>
                                      <span className="bg-muted truncate rounded px-1 font-mono text-[9px]">
                                        {urlDiff}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex shrink-0 items-center gap-1 opacity-75 transition-opacity group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-muted-foreground hover:text-foreground cursor-pointer p-1 transition-[transform,color] duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
                                title={t('openInTabTooltip') || 'Open in new tab'}
                              >
                                <ExternalLink className="size-3" />
                              </a>
                              {extraItems.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDuplicateItems(group, extraItems)}
                                  className="text-muted-foreground cursor-pointer p-1 transition-[color,transform] duration-150 ease-[var(--ease-out)] hover:text-rose-500 active:scale-[0.96]"
                                  title={
                                    extraItems.length > 1
                                      ? lang === 'tr'
                                        ? `${extraItems.length} fazlalık kopyayı sil`
                                        : `Delete ${extraItems.length} extra copies`
                                      : lang === 'tr'
                                        ? 'Bu kopyayı sil'
                                        : 'Delete this copy'
                                  }
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expand/Collapse Footer if > 4 distinct clusters */}
                    {hasMore && (
                      <div className="bg-muted/10 border-border/30 border-t px-3 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => toggleGroupExpanded(group.normalizedUrl)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] font-medium transition-colors"
                        >
                          {isExpanded
                            ? lang === 'tr'
                              ? 'Daha az göster'
                              : 'Show less'
                            : lang === 'tr'
                              ? `+ ${clusters.length - 4} farklı satır daha göster`
                              : `+ Show ${clusters.length - 4} more variations`}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Separate Collapsible Separators Group (Excluded by Default) */}
          {separatorGroups.length > 0 && (
            <div className="border-border/50 bg-muted/15 overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setShowSeparatorsSection((prev) => !prev)}
                className="hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {showSeparatorsSection ? (
                    <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                  )}
                  <span className="text-foreground font-semibold">
                    {lang === 'tr' ? 'Ayırıcılar (Separators)' : 'Separators'}
                  </span>
                  <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[9px]">
                    {separatorGroups.length} {lang === 'tr' ? 'grup' : 'groups'}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-border/60 text-muted-foreground h-4 px-1.5 py-0 text-[8.5px]"
                  >
                    {lang === 'tr' ? 'Varsayılan olarak hariç' : 'Excluded by default'}
                  </Badge>
                </div>
              </button>

              {showSeparatorsSection && (
                <div className="border-border/40 divide-border/30 divide-y border-t px-3 py-2 text-[11px]">
                  <p className="text-muted-foreground pb-2 text-[10.5px]">
                    {lang === 'tr'
                      ? 'Klasör ayırıcıları (ör. bookmarkseparators.com veya çizgi başlıklı ayırıcılar) düzeninizi korumak için Clean All kapsamı dışında tutulur.'
                      : 'Folder dividers (such as bookmarkseparators.com or line-titled separators) are excluded from duplicate cleanup to preserve folder layout.'}
                  </p>
                  {separatorGroups.map((sepGroup) => (
                    <div
                      key={sepGroup.normalizedUrl}
                      className="flex items-center justify-between gap-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-foreground truncate font-medium">
                          {sepGroup.domain || sepGroup.items[0]?.title || 'Separator'}
                        </div>
                        <div className="text-muted-foreground truncate font-mono text-[9.5px]">
                          {sepGroup.displayUrl}
                        </div>
                      </div>
                      <Badge variant="outline" className="h-4 shrink-0 px-1.5 py-0 text-[9px]">
                        {sepGroup.items.length} {lang === 'tr' ? 'klasörde' : 'items'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: SIMILAR BOOKMARKS ===================== */}
      {visitedSubTabs.has('similar') && (
        <div className={subTab === 'similar' ? 'space-y-3' : 'hidden'}>
          {/* Header Hero Banner */}
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="flex items-center gap-2">
              <Layers className="size-4 shrink-0 text-cyan-500" />
              <h3 className="text-foreground text-sm font-bold">
                {t('similarTitle') || 'Similar Bookmarks'}
              </h3>
              <span className="text-muted-foreground text-xs font-medium">
                {lang === 'tr'
                  ? `${similarGroups.length} grup`
                  : t('similarFound', { count: similarGroups.length }) ||
                    `${similarGroups.length} groups`}
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5 text-[11px]">
              {t('similarSubtitle') || 'Bookmarks sharing the same base URL or page path.'}
            </p>
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
                  {isAllSimilarSelected
                    ? lang === 'tr'
                      ? 'Tüm seçimi kaldır'
                      : 'Deselect All'
                    : lang === 'tr'
                      ? 'Tüm yer imlerini seç'
                      : 'Select All Bookmarks'}
                </span>
              </label>
              <span className="text-muted-foreground text-[10px]">
                {similarGroups.reduce((acc, g) => acc + g.items.length, 0)}{' '}
                {lang === 'tr' ? 'toplam link' : 'total links'}
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
            <div className="space-y-3 pb-4">
              {similarGroups.map((group) => {
                const isGroupAllSelected = group.items.every((it) => selectedSimilarIds.has(it.id));
                const groupUrls = group.items.map((it) => it.url);
                return (
                  <div
                    key={group.id}
                    className="border-border/60 bg-card overflow-hidden rounded-lg border shadow-2xs"
                  >
                    {/* Group Header (clean domain + select-except-newest + links count) */}
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
                          className="text-foreground truncate text-xs font-semibold"
                          title={group.baseUrl}
                        >
                          {group.domain || group.baseUrl}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => selectExceptNewestInGroup(group)}
                          className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                          title={
                            lang === 'tr'
                              ? 'En yeni kayıt hariç gruptaki tümünü seç'
                              : 'Select all items in this group except the newest'
                          }
                        >
                          {lang === 'tr' ? 'En yenisi hariç seç' : 'Except newest'}
                        </button>
                        <Badge variant="outline" className="h-4 shrink-0 px-1.5 py-0 text-[9px]">
                          {group.items.length} {lang === 'tr' ? 'link' : 'links'}
                        </Badge>
                      </div>
                    </div>

                    {/* Group Items with Highlighted URL Differences */}
                    <div className="divide-border/30 divide-y">
                      {group.items.map((item) => {
                        const isSelected = selectedSimilarIds.has(item.id);
                        const { prefix, diff } = splitUrlDiff(item.url, groupUrls);

                        return (
                          <div
                            key={item.id}
                            className={`group hover:bg-muted/40 flex items-start justify-between gap-2.5 px-3 py-2 transition-colors ${
                              isSelected ? 'bg-cyan-500/5' : ''
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectSimilar(item.id)}
                                className="border-border mt-0.5 size-3.5 shrink-0 cursor-pointer rounded accent-cyan-600"
                              />
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span className="text-foreground truncate text-xs font-medium">
                                    {item.title || item.domain}
                                  </span>
                                  {item.path && (
                                    <Badge
                                      variant="outline"
                                      className="text-muted-foreground border-border/50 ml-auto h-3.5 max-w-[120px] shrink-0 truncate px-1 py-0 text-[8.5px]"
                                      title={item.path}
                                    >
                                      📁 {formatShortFolderPath(item.path, lang)}
                                    </Badge>
                                  )}
                                </div>
                                <div
                                  className="font-mono text-[10px] leading-snug break-all"
                                  title={item.url}
                                >
                                  <span className="text-muted-foreground/70">{prefix}</span>
                                  {diff ? (
                                    <span className="rounded-xs bg-cyan-500/15 px-1 font-semibold text-cyan-700 dark:text-cyan-300">
                                      {diff}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/70 ml-1 font-sans text-[9.5px] italic">
                                      ({lang === 'tr' ? 'temel URL' : 'base URL'})
                                    </span>
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
                                className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-[transform,color] duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
                                title={t('openInTabTooltip') || 'Open in new tab'}
                              >
                                <ExternalLink className="size-3" />
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteSingleSimilar(item)}
                                className="text-muted-foreground cursor-pointer rounded p-1 transition-[color,transform] duration-150 ease-[var(--ease-out)] hover:text-rose-500 active:scale-[0.96]"
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

          {/* Sticky Bottom Action Bar (Delete, Merge, Move) */}
          {selectedSimilarIds.size > 0 && (
            <div className="bg-card/95 sticky bottom-2 z-20 space-y-2 rounded-xl border border-cyan-500/35 p-2.5 shadow-lg backdrop-blur-md">
              {/* Inline Merge Panel */}
              {similarActionPanel === 'merge' && selectedSimilarItems.length >= 2 && (
                <div className="border-border/50 bg-muted/30 space-y-2 rounded-lg border p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {lang === 'tr'
                        ? 'Birleştir: Hangisi kalsın?'
                        : 'Merge: Choose bookmark to keep'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSimilarActionPanel(null)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {selectedSimilarItems.map((it) => (
                      <label
                        key={it.id}
                        className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1"
                      >
                        <input
                          type="radio"
                          name="similar-merge-keep"
                          checked={mergeKeepId === it.id}
                          onChange={() => {
                            setMergeKeepId(it.id);
                            setMergeTitle(it.title || it.domain);
                          }}
                          className="size-3.5 shrink-0 cursor-pointer accent-cyan-600"
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                          {it.title || it.url}
                        </span>
                        <span className="text-muted-foreground max-w-[90px] shrink-0 truncate text-[9.5px]">
                          {formatShortFolderPath(it.path, lang)}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={mergeTitle}
                      onChange={(e) => setMergeTitle(e.target.value)}
                      placeholder={lang === 'tr' ? 'Son başlık...' : 'Final title...'}
                      className="h-7 flex-1 text-xs"
                    />
                    <Button
                      size="xs"
                      disabled={isMergingSimilar}
                      onClick={handleConfirmMergeSimilar}
                      className="h-7 cursor-pointer bg-cyan-600 px-2.5 text-[11px] font-semibold text-white hover:bg-cyan-700"
                    >
                      {isMergingSimilar ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <GitMerge className="mr-1 size-3" />
                      )}
                      {lang === 'tr'
                        ? `Birleştir (${selectedSimilarItems.length - 1} sil)`
                        : `Merge (-${selectedSimilarItems.length - 1})`}
                    </Button>
                  </div>
                </div>
              )}

              {/* Inline Move Folder Picker */}
              {similarActionPanel === 'move' && (
                <div className="border-border/50 bg-muted/30 space-y-2 rounded-lg border p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {lang === 'tr'
                        ? `${selectedSimilarIds.size} yer imini taşı:`
                        : `Move ${selectedSimilarIds.size} bookmark(s) to:`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSimilarActionPanel(null)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <Input
                    value={moveFolderSearch}
                    onChange={(e) => setMoveFolderSearch(e.target.value)}
                    placeholder={lang === 'tr' ? 'Klasör ara...' : 'Filter folders...'}
                    className="h-7 text-xs"
                  />
                  <div className="divide-border/30 bg-background/80 max-h-36 divide-y overflow-y-auto rounded border">
                    {filteredMoveFolders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        disabled={isMovingSimilar}
                        onClick={() => handleMoveSelectedSimilar(folder.id, folder.title)}
                        className="hover:bg-muted/50 flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <Folder className="size-3 shrink-0 text-amber-500" />
                          <span className="truncate font-medium">
                            {formatFolderTitle(folder.title, lang)}
                          </span>
                        </span>
                        <span className="text-muted-foreground max-w-[140px] shrink-0 truncate text-[9.5px]">
                          {formatShortFolderPath(folder.path, lang)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Controls Row */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="h-6 border-cyan-500/30 px-2 text-[10.5px] font-semibold text-cyan-600 dark:text-cyan-400"
                  >
                    {selectedSimilarIds.size} {lang === 'tr' ? 'seçili' : 'selected'}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSimilarIds(new Set());
                      setSimilarActionPanel(null);
                      setConfirmDeleteSimilar(false);
                    }}
                    className="text-muted-foreground hover:text-foreground cursor-pointer p-1 text-[10.5px]"
                    title={lang === 'tr' ? 'Seçimi temizle' : 'Clear selection'}
                  >
                    <X className="size-3.5" />
                  </button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={handleOpenSelectedSimilar}
                    className="text-muted-foreground hover:text-foreground h-7 cursor-pointer px-2 text-[11px]"
                    title={t('openInTabs') || 'Open in Tabs'}
                  >
                    <ExternalLink className="mr-1 size-3" />
                    {lang === 'tr' ? 'Aç' : 'Open'}
                  </Button>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={selectedSimilarIds.size < 2 || isMergingSimilar}
                    onClick={handleOpenMergeSimilar}
                    className={`h-7 cursor-pointer px-2.5 text-[11px] font-medium ${
                      similarActionPanel === 'merge' ? 'border-cyan-500 bg-cyan-500/10' : ''
                    }`}
                    title={
                      selectedSimilarIds.size < 2
                        ? lang === 'tr'
                          ? 'Birleştirmek için en az 2 kayıt seçin'
                          : 'Select at least 2 items to merge'
                        : lang === 'tr'
                          ? 'Seçilenleri birleştir'
                          : 'Merge selected bookmarks'
                    }
                  >
                    <GitMerge className="mr-1 size-3" />
                    {lang === 'tr' ? 'Birleştir' : 'Merge'}
                  </Button>

                  <Button
                    size="xs"
                    variant="outline"
                    disabled={isMovingSimilar}
                    onClick={() => {
                      setConfirmDeleteSimilar(false);
                      setSimilarActionPanel((prev) => (prev === 'move' ? null : 'move'));
                    }}
                    className={`h-7 cursor-pointer px-2.5 text-[11px] font-medium ${
                      similarActionPanel === 'move' ? 'border-cyan-500 bg-cyan-500/10' : ''
                    }`}
                  >
                    <FolderInput className="mr-1 size-3" />
                    {lang === 'tr' ? 'Taşı' : 'Move'}
                  </Button>

                  {confirmDeleteSimilar ? (
                    <>
                      <Button
                        size="xs"
                        variant="destructive"
                        onClick={handleDeleteSelectedSimilar}
                        disabled={isDeletingSimilar}
                        className="h-7 cursor-pointer px-2.5 text-[11px] active:scale-[0.97]"
                      >
                        {isDeletingSimilar ? (
                          <Loader2 className="mr-1 size-3 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1 size-3" />
                        )}
                        {lang === 'tr'
                          ? `Onayla (${selectedSimilarIds.size})`
                          : `Confirm (${selectedSimilarIds.size})`}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setConfirmDeleteSimilar(false)}
                        className="h-7 px-2 text-[11px]"
                      >
                        {t('cancelBtn') || 'Cancel'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => {
                        setSimilarActionPanel(null);
                        setConfirmDeleteSimilar(true);
                      }}
                      disabled={isDeletingSimilar}
                      className="h-7 cursor-pointer px-2.5 text-[11px] font-semibold active:scale-[0.97]"
                    >
                      <Trash2 className="mr-1 size-3" />
                      {lang === 'tr'
                        ? `Sil (${selectedSimilarIds.size})`
                        : `Delete (${selectedSimilarIds.size})`}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 3: TRACKING PARAMETERS ===================== */}
      {visitedSubTabs.has('trackers') && (
        <div className={subTab === 'trackers' ? 'space-y-3' : 'hidden'}>
          {/* Header Hero Banner */}
          <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-teal-500" />
                  <h3 className="text-foreground text-sm font-bold">
                    {t('trackersTitle') || 'Tracking Parameters'}
                  </h3>
                  <span className="text-muted-foreground text-xs font-medium">
                    {t('trackersFound', { count: trackingItems.length }) ||
                      `${trackingItems.length} bookmarks will be cleaned`}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {t('trackersSubtitle') ||
                    (lang === 'tr'
                      ? 'Kaydedilen adreslerdeki utm_, fbclid, gclid ve takip kodlarını temizler.'
                      : 'Strips utm_, fbclid, gclid, and analytics tracking parameters from saved URLs.')}
                </p>
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
                      <span>
                        {lang === 'tr'
                          ? `Tümünü Temizle (${trackingItems.length})`
                          : `Clean All (${trackingItems.length})`}
                      </span>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Options Toggles — Consistent checkboxes & clear names */}
            <div className="mt-2.5 flex flex-wrap items-center gap-4 border-t border-teal-500/15 pt-2.5 text-xs select-none">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={trackingOptions.includeSiteSpecific}
                  onChange={() => handleToggleTrackingOption('includeSiteSpecific')}
                  className="border-border size-3.5 cursor-pointer rounded accent-teal-600"
                />
                <span className="text-foreground text-[11px] font-medium">
                  {lang === 'tr'
                    ? 'Platform izleme kodları (YouTube, Amazon, X)'
                    : 'Platform trackers (YouTube, Amazon, X)'}
                </span>
                {siteSpecificCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 bg-teal-500/15 px-1.5 py-0 text-[9px] font-semibold text-teal-700 dark:text-teal-300"
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
                  className="border-border size-3.5 cursor-pointer rounded accent-teal-600"
                />
                <span className="text-foreground text-[11px] font-medium">
                  {lang === 'tr'
                    ? 'Satış ortaklığı etiketleri (ref, tag)'
                    : 'Affiliate referral tags (ref, tag)'}
                </span>
                {affiliateCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="h-4 bg-teal-500/15 px-1.5 py-0 text-[9px] font-semibold text-teal-700 dark:text-teal-300"
                  >
                    {affiliateCount}
                  </Badge>
                )}
              </label>
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
                    className="group border-border/50 bg-card hover:border-border space-y-1.5 rounded-lg border p-2.5 shadow-2xs transition-[border-color,background-color] duration-120"
                  >
                    {/* Header Row: Favicon + Title + Folder + Clean button */}
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${item.bookmark.domain}&sz=32`}
                          alt=""
                          className="size-3.5 shrink-0 rounded-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="text-foreground min-w-0 truncate text-xs font-semibold">
                          {item.bookmark.title || item.bookmark.domain}
                        </span>
                        {item.bookmark.path && (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground border-border/50 h-4 max-w-[125px] shrink-0 truncate px-1.5 py-0 text-[9px]"
                            title={item.bookmark.path}
                          >
                            📁 {formatShortFolderPath(item.bookmark.path, lang)}
                          </Badge>
                        )}
                      </div>

                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isCleaningThis || isCleaningTrackers}
                        onClick={() => handleCleanSingleTracker(item)}
                        className="h-6 shrink-0 cursor-pointer border-teal-500/30 px-2 text-[10.5px] text-teal-700 hover:bg-teal-500/10 active:scale-[0.97] dark:text-teal-300"
                        title="Clean tracking parameters from this URL"
                      >
                        {isCleaningThis ? (
                          <Loader2 className="mr-1 size-2.5 animate-spin" />
                        ) : (
                          <Sparkles className="mr-1 size-2.5" />
                        )}
                        <span>{lang === 'tr' ? 'Temizle' : 'Clean'}</span>
                      </Button>
                    </div>

                    {/* Single-Line Compact Before -> After Full URL Preview */}
                    <div className="bg-muted/25 border-border/30 space-y-0.5 rounded border px-2 py-1 font-mono text-[9.5px] leading-tight">
                      <div
                        className="text-muted-foreground/85 overflow-x-auto whitespace-nowrap"
                        title={item.originalUrl}
                      >
                        {item.segments.map((seg, idx) =>
                          seg.isRemoved ? (
                            <span
                              key={idx}
                              className="rounded-xs bg-rose-500/15 px-0.5 font-semibold text-rose-600 line-through dark:text-rose-400"
                            >
                              {seg.text}
                            </span>
                          ) : (
                            <span key={idx}>{seg.text}</span>
                          )
                        )}
                      </div>
                      <div
                        className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-emerald-600 dark:text-emerald-400"
                        title={item.cleanUrl}
                      >
                        <span className="shrink-0 font-sans font-bold">→</span>
                        <span className="font-medium">{item.cleanUrl}</span>
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
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 shrink-0 text-amber-500" />
                  <h3 className="text-foreground text-sm font-bold">
                    {t('insecureTitle') || 'Insecure HTTP Bookmarks'}
                  </h3>
                  <span className="text-muted-foreground text-xs font-medium">
                    {t('insecureFound', { count: insecureBookmarks.length }) ||
                      `${insecureBookmarks.length} insecure links`}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[11px]">
                  <Info className="size-3 shrink-0 text-amber-500" />
                  <span>
                    {lang === 'tr'
                      ? 'Şifresiz (http://) bağlantılar. Toplu yükseltme yalnızca doğrulanan HTTPS sitelerine uygulanır.'
                      : 'Unencrypted (http://) links. Bulk upgrade only modifies verified HTTPS sites.'}
                  </span>
                </p>
              </div>

              {/* Verify & Upgrade Buttons */}
              {insecureBookmarks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleVerifyHttpsClick}
                    disabled={isVerifyingHttps || isUpgradingHttps}
                    className="h-7 cursor-pointer border-amber-500/30 px-2.5 text-xs font-medium text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
                    title={
                      lang === 'tr'
                        ? 'Sitelerin HTTPS destekleyip desteklemediğini test et'
                        : 'Test which sites support encrypted HTTPS'
                    }
                  >
                    {isVerifyingHttps ? (
                      <>
                        <Loader2 className="mr-1 size-3 animate-spin" />
                        <span>
                          {verifyHttpsProgress
                            ? `${verifyHttpsProgress.current}/${verifyHttpsProgress.total}`
                            : lang === 'tr'
                              ? 'Test ediliyor...'
                              : 'Verifying...'}
                        </span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-1 size-3" />
                        <span>
                          {hasCompletedHttpsVerify
                            ? lang === 'tr'
                              ? 'Yeniden Doğrula'
                              : 'Re-Verify'
                            : lang === 'tr'
                              ? 'HTTPS Doğrula'
                              : 'Verify HTTPS'}
                        </span>
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleUpgradeAllHttpsClick}
                    disabled={
                      !hasCompletedHttpsVerify ||
                      verifiedHttpItems.length === 0 ||
                      isUpgradingHttps ||
                      isVerifyingHttps
                    }
                    title={
                      !hasCompletedHttpsVerify
                        ? lang === 'tr'
                          ? 'Önce "HTTPS Doğrula" taramasını tamamlayın'
                          : 'Complete "Verify HTTPS" scan first'
                        : undefined
                    }
                    className="h-7 cursor-pointer border border-amber-500/40 bg-amber-600 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
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
                        <span>
                          {lang === 'tr'
                            ? `${verifiedHttpItems.length} doğrulanmışı yükselt`
                            : `Upgrade ${verifiedHttpItems.length} verified`}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Live HTTPS Verification Progress Bar (e.g. 45/159) */}
            {isVerifyingHttps && verifyHttpsProgress && (
              <div className="animate-in fade-in mt-2.5 space-y-1 border-t border-amber-500/15 pt-2 duration-150">
                <div className="text-muted-foreground flex items-center justify-between text-[10.5px]">
                  <span className="max-w-[210px] truncate font-mono">
                    {verifyHttpsProgress.currentDomain ||
                      (lang === 'tr' ? 'Test ediliyor...' : 'Checking...')}
                  </span>
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {verifyHttpsProgress.current}/{verifyHttpsProgress.total} (
                    {Math.round(
                      (verifyHttpsProgress.current / (verifyHttpsProgress.total || 1)) * 100
                    )}
                    %)
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-amber-500/15">
                  <div
                    className="h-full w-full origin-left bg-amber-500 transition-transform duration-150 ease-[var(--ease-out)]"
                    style={{
                      transform: `scaleX(${Math.max(
                        0,
                        Math.min(1, verifyHttpsProgress.current / (verifyHttpsProgress.total || 1))
                      )})`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Notice banner when dead links found during verification were routed to 404 tab */}
            {deadMovedCount > 0 && !isVerifyingHttps && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10.5px] text-rose-700 dark:text-rose-300">
                <div className="flex items-center gap-1.5">
                  <Link2Off className="size-3.5 shrink-0" />
                  <span>
                    {lang === 'tr'
                      ? `${deadMovedCount} ölü/ulaşılamayan site doğrulama sırasında 404 sekmesine yönlendirildi.`
                      : `${deadMovedCount} dead/unreachable site(s) were routed to the 404 Links tab.`}
                  </span>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => handleSubTabChange('broken')}
                  className="h-6 shrink-0 cursor-pointer px-2 text-[10.5px] font-semibold text-rose-700 hover:bg-rose-500/15 dark:text-rose-300"
                >
                  {lang === 'tr' ? "404'e Git" : 'Open 404'}
                  <ArrowRight className="ml-1 size-3" />
                </Button>
              </div>
            )}

            {/* Brief Permission Explanation / Denied Warning for HTTP verification */}
            {!hasScanPermission && insecureBookmarks.length > 0 && (
              <div
                className={`mt-2.5 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[10.5px] ${
                  scanPermissionDenied
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : 'bg-background/60 text-muted-foreground border-amber-500/25'
                }`}
              >
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                <span>
                  {scanPermissionDenied
                    ? lang === 'tr'
                      ? 'İzin gerekli: HTTPS doğrulaması için site erişim izni verilmedi. Satır menüsünden tekil işlem yapabilirsiniz.'
                      : 'Permission required: Site access was denied for HTTPS verification. Single-row actions remain available.'
                    : lang === 'tr'
                      ? 'HTTPS desteğini test etmek için siteleri ziyaret etmemiz gerekiyor, sayfa içeriği saklanmaz.'
                      : 'To verify HTTPS support, we need permission to visit bookmarked sites. Page content is never stored.'}
                </span>
              </div>
            )}

            {/* Search + Domain Grouping Toggle */}
            {insecureBookmarks.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3 -translate-y-1/2" />
                  <Input
                    value={httpSearchQuery}
                    onChange={(e) => {
                      setHttpSearchQuery(e.target.value);
                      setVisibleHttpCount(30);
                    }}
                    placeholder={
                      lang === 'tr'
                        ? 'HTTP yer imlerinde ara (başlık, domain veya klasör)...'
                        : 'Filter HTTP bookmarks by title, domain, or folder...'
                    }
                    className="bg-background/70 border-border/60 h-7 pr-7 pl-7 text-xs"
                  />
                  {httpSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setHttpSearchQuery('')}
                      className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-0.5"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                <div className="bg-background/60 border-border/50 inline-flex shrink-0 items-center rounded-md border p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setGroupHttpByDomain(true)}
                    className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                      groupHttpByDomain
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lang === 'tr' ? "Domain'e göre grupla" : 'Group by domain'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupHttpByDomain(false)}
                    className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                      !groupHttpByDomain
                        ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lang === 'tr' ? 'Düz liste' : 'Flat list'}
                  </button>
                </div>
              </div>
            )}
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
          ) : groupHttpByDomain ? (
            <div className="space-y-2">
              {groupedInsecureDomains.slice(0, visibleHttpCount).map((domainGroup) => {
                const isCollapsed = collapsedHttpDomains.has(domainGroup.domain);
                return (
                  <div
                    key={domainGroup.domain}
                    className="border-border/60 bg-card overflow-hidden rounded-lg border shadow-2xs"
                  >
                    <div
                      onClick={() => toggleHttpDomainCollapsed(domainGroup.domain)}
                      className="bg-muted/25 border-border/40 hover:bg-muted/40 flex cursor-pointer items-center justify-between gap-2 border-b px-3 py-1.5 transition-colors"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                        )}
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domainGroup.domain}&sz=32`}
                          alt=""
                          className="size-3.5 shrink-0 rounded-xs"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="text-foreground truncate text-xs font-semibold">
                          {domainGroup.domain}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {domainGroup.supportedCount > 0 && (
                          <Badge
                            variant="outline"
                            className="h-4 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[8.5px] font-medium text-emerald-700 dark:text-emerald-300"
                          >
                            {domainGroup.supportedCount} HTTPS ✓
                          </Badge>
                        )}
                        <Badge variant="outline" className="h-4 px-1.5 py-0 text-[9px]">
                          {domainGroup.items.length}
                        </Badge>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="divide-border/30 divide-y">
                        {domainGroup.items.map((item) => renderHttpRowCard(item, true))}
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleHttpCount < groupedInsecureDomains.length && (
                <div className="pt-1 text-center">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setVisibleHttpCount((prev) => prev + 30)}
                    className="h-7 cursor-pointer px-3 text-xs"
                  >
                    {lang === 'tr'
                      ? `Daha fazla domain göster (${groupedInsecureDomains.length - visibleHttpCount} kaldı)`
                      : `Show more domains (${groupedInsecureDomains.length - visibleHttpCount} remaining)`}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleInsecureBookmarks.map((item) => renderHttpRowCard(item, false))}

              {visibleInsecureBookmarks.length < filteredInsecureBookmarks.length && (
                <div className="pt-1 text-center">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setVisibleHttpCount((prev) => prev + 40)}
                    className="h-7 cursor-pointer px-3 text-xs"
                  >
                    {lang === 'tr'
                      ? `Daha fazla göster (${filteredInsecureBookmarks.length - visibleInsecureBookmarks.length} kaldı)`
                      : `Show more (${filteredInsecureBookmarks.length - visibleInsecureBookmarks.length} remaining)`}
                  </Button>
                </div>
              )}
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
                <div className="flex items-center gap-2">
                  <h3 className="text-foreground text-xs font-semibold">
                    {t('brokenLinkScannerTitle') || 'Link Health Checker'}
                  </h3>
                  {lastScannedAt && (
                    <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                      <Clock className="size-2.5" />
                      {lang === 'tr' ? 'Son tarama:' : 'Last scanned:'}{' '}
                      {new Date(lastScannedAt).toLocaleTimeString(
                        lang === 'tr' ? 'tr-TR' : 'en-US',
                        { hour: '2-digit', minute: '2-digit' }
                      )}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-[10.5px]">
                  {lang === 'tr'
                    ? 'Silinmiş (404/5xx) sayfaları tespit eder. CORS/bot korumalı siteler "Doğrulanamadı" olarak ayrılır.'
                    : 'Detects dead (404/5xx) pages. CORS/bot-protected sites are separated as "Unverified".'}
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
                  variant={hasScannedBroken ? 'outline' : 'default'}
                  onClick={handleScanLinksClick}
                  className="h-7 cursor-pointer px-2.5 text-xs font-medium active:scale-[0.97]"
                >
                  <Play className="mr-1 size-3 fill-current" />
                  {!hasScanPermission
                    ? lang === 'tr'
                      ? 'İzin Ver ve Tara'
                      : 'Allow & Scan'
                    : hasScannedBroken
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
                  <span>
                    {scanProgress.current} / {scanProgress.total} (
                    {Math.round((scanProgress.current / (scanProgress.total || 1)) * 100)}%)
                  </span>
                </div>
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full w-full origin-left transition-transform duration-150 ease-[var(--ease-out)]"
                    style={{
                      transform: `scaleX(${Math.max(
                        0,
                        Math.min(1, scanProgress.current / (scanProgress.total || 1))
                      )})`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results Banner & Filters */}
          {brokenLinks.length > 0 && (
            <div className="space-y-2">
              <div className="space-y-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="flex items-center gap-1.5">
                      {isRemovingBroken ? (
                        <Loader2 className="size-3.5 animate-spin text-rose-600 dark:text-rose-400" />
                      ) : (
                        <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400" />
                      )}
                      <span className="font-semibold text-rose-800 dark:text-rose-200">
                        {isRemovingBroken
                          ? `Removing broken links (${removingBrokenProgress?.current || 0}/${
                              removingBrokenProgress?.total || 0
                            })...`
                          : lang === 'tr'
                            ? `${confirmedBrokenLinks.length} doğrulanmış kırık link (${countUnverified} doğrulanamadı)`
                            : `${confirmedBrokenLinks.length} confirmed broken (${countUnverified} unverified)`}
                      </span>
                    </div>
                    <p className="mt-0.5 pl-5 text-[10px] text-rose-700/85 dark:text-rose-300/85">
                      {lang === 'tr'
                        ? 'Doğrulanamayan (CORS/engel) siteler yanlış pozitifleri önlemek için toplu silmeye dahil edilmez.'
                        : 'Unverified (CORS/blocked) sites are excluded from Remove All to prevent false positives.'}
                    </p>
                  </div>

                  {confirmedBrokenLinks.length > 0 && brokenFilter !== 'unverified' && (
                    <div className="flex items-center gap-1.5">
                      {confirmRemoveBroken ? (
                        <>
                          <Button
                            size="xs"
                            onClick={handleRemoveBrokenBatch}
                            disabled={isRemovingBroken}
                            className="h-7 cursor-pointer bg-rose-600 px-2.5 text-[11px] font-semibold text-white shadow-xs hover:bg-rose-700 active:scale-[0.97]"
                          >
                            {lang === 'tr'
                              ? `Onayla (${
                                  brokenFilter === 'all'
                                    ? confirmedBrokenLinks.length
                                    : activeBrokenLinks.length
                                } sil)`
                              : `Confirm (${
                                  brokenFilter === 'all'
                                    ? confirmedBrokenLinks.length
                                    : activeBrokenLinks.length
                                })`}
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setConfirmRemoveBroken(false)}
                            className="h-7 px-2 text-[11px]"
                          >
                            {t('cancelBtn') || 'Cancel'}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="xs"
                          disabled={isRemovingBroken}
                          onClick={() => setConfirmRemoveBroken(true)}
                          className="h-7 cursor-pointer gap-1 bg-rose-600 px-3 text-[11px] font-semibold text-white shadow-xs hover:bg-rose-700 active:scale-[0.97] dark:bg-rose-600 dark:hover:bg-rose-500"
                        >
                          <Trash2 className="size-3" />
                          <span>
                            {brokenFilter !== 'all'
                              ? `Remove ${activeBrokenLinks.length} Filtered`
                              : `Remove All (${confirmedBrokenLinks.length})`}
                          </span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Real-time Animated Deletion Progress Bar */}
                {isRemovingBroken && removingBrokenProgress && (
                  <div className="animate-in fade-in h-1.5 w-full overflow-hidden rounded-full bg-rose-500/20 duration-150 ease-[var(--ease-out)]">
                    <div
                      className="h-full w-full origin-left bg-rose-500 transition-transform duration-120 ease-[var(--ease-out)]"
                      style={{
                        transform: `scaleX(${Math.max(
                          0,
                          Math.min(
                            1,
                            removingBrokenProgress.current / (removingBrokenProgress.total || 1)
                          )
                        )})`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Filter Pills — Unified "Unverified" / "Doğrulanamadı" label */}
              <div className="flex flex-wrap items-center gap-1 text-[10.5px]">
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
                {countUnverified > 0 && (
                  <button
                    type="button"
                    onClick={() => setBrokenFilter('unverified')}
                    className={`cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors ${
                      brokenFilter === 'unverified'
                        ? 'border border-amber-500/30 bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title={
                      lang === 'tr'
                        ? 'Tarayıcı CORS/bot engeli veya zaman aşımı nedeniyle doğrulanamayan siteler'
                        : 'Sites that could not be verified due to browser CORS/bot protection or timeout'
                    }
                  >
                    {lang === 'tr' ? 'Doğrulanamadı' : 'Unverified'} ({countUnverified})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* State 1: Permission Prompt or Initial Prompt to Scan */}
          {!hasScanPermission ? (
            <div
              className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-9 text-center ${
                scanPermissionDenied
                  ? 'border-rose-500/40 bg-rose-500/5'
                  : 'border-border/60 bg-muted/10'
              }`}
            >
              <ShieldAlert
                className={`mb-2 size-7 ${
                  scanPermissionDenied ? 'text-rose-500' : 'text-amber-500'
                }`}
              />
              <h4 className="text-foreground text-xs font-semibold">
                {scanPermissionDenied
                  ? lang === 'tr'
                    ? 'İzin gerekli — tarama başlatılamadı'
                    : 'Permission required — scan could not start'
                  : lang === 'tr'
                    ? 'Link taraması için izin gerekiyor'
                    : 'Permission required for link checks'}
              </h4>
              <p className="text-muted-foreground mt-1 max-w-xs text-[11px] leading-relaxed">
                {lang === 'tr'
                  ? 'Linkleri kontrol etmek için siteleri ziyaret etmemiz gerekiyor, sayfa içeriği saklanmaz. Mükerrer, takipçi, benzer ve boş klasör araçları izinsiz çalışmaya devam eder.'
                  : 'To check links, we need permission to visit bookmarked sites. Page content is never stored. Duplicates, trackers, similar, and empty folders still work without this permission.'}
              </p>
              <Button
                size="sm"
                onClick={handleScanLinksClick}
                className="mt-3 h-7 cursor-pointer gap-1.5 px-3 text-xs font-medium active:scale-[0.97]"
              >
                <ShieldCheck className="size-3.5" />
                <span>
                  {lang === 'tr' ? 'İzin Ver ve Linkleri Tara' : 'Grant Access & Scan Links'}
                </span>
              </Button>
            </div>
          ) : !hasScannedBroken && brokenLinks.length === 0 ? (
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
                const is404 = item.statusCode === 404 || item.statusCode === 410;
                const is5xx = Boolean(item.statusCode && item.statusCode >= 500);
                const isDeletingThis = deletingBrokenId === item.bookmark.id;
                const unifiedUnverifiedLabel = lang === 'tr' ? 'Doğrulanamadı' : 'Unverified';

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
                            className={`h-4 shrink-0 px-1.5 py-0 text-[8.5px] font-medium ${
                              is404
                                ? 'border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                : is5xx
                                  ? 'border-orange-400/40 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                  : 'border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            }`}
                            title={
                              is404
                                ? `HTTP ${item.statusCode} Not Found`
                                : is5xx
                                  ? `HTTP ${item.statusCode} Server Error`
                                  : lang === 'tr'
                                    ? 'CORS / Bot koruması veya zaman aşımı nedeniyle doğrulanamadı (muhtemelen çalışıyor)'
                                    : 'Could not verify due to CORS / bot protection or timeout (likely alive)'
                            }
                          >
                            {is404
                              ? `HTTP ${item.statusCode}`
                              : is5xx
                                ? `HTTP ${item.statusCode}`
                                : unifiedUnverifiedLabel}
                          </Badge>
                        </div>

                        {/* Clean Subtitle with truncated folder path */}
                        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
                          <span
                            className="text-muted-foreground/80 max-w-[160px] truncate"
                            title={item.bookmark.path}
                          >
                            📁 {formatShortFolderPath(item.bookmark.path, lang)}
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
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-[transform,color] duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
                        title={t('openInTabTooltip') || 'Open in new tab'}
                      >
                        <ExternalLink className="size-3" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleDismissBroken(item.bookmark.id)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-[transform,color] duration-150 ease-[var(--ease-out)] active:scale-[0.96]"
                        title={
                          lang === 'tr'
                            ? 'Yoksay (Yer imini koru ve listeden gizle)'
                            : 'Ignore (Keep bookmark and hide from list)'
                        }
                        aria-label="Ignore broken link warning"
                      >
                        <EyeOff className="size-3" />
                      </button>

                      <button
                        type="button"
                        disabled={isDeletingThis || isRemovingBroken}
                        onClick={() => handleRemoveBroken(item)}
                        className="text-muted-foreground cursor-pointer rounded p-1 transition-[color,transform] duration-150 ease-[var(--ease-out)] hover:text-rose-500 active:scale-[0.96] disabled:opacity-50"
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
              <div className="text-xs">
                <span className="font-semibold text-blue-700 dark:text-blue-300">
                  {emptyFolders.length} {t('emptyFoldersDetected') || 'empty folder(s) found'}
                </span>
                <p className="mt-0.5 text-[11px] text-blue-600/80 dark:text-blue-400/80">
                  {t('emptyFoldersNotice') ||
                    'These folders contain no bookmarks or active subfolders.'}
                </p>
              </div>

              {confirmCleanEmpty ? (
                <div className="animate-in fade-in flex items-center gap-1.5 duration-150">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCleanAllEmptyFolders}
                    className="h-7 px-2.5 text-xs font-medium active:scale-[0.97]"
                  >
                    {lang === 'tr'
                      ? `Onayla (${emptyFolders.length} sil)`
                      : `Confirm (${emptyFolders.length})`}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmCleanEmpty(false)}
                    className="h-7 px-2 text-xs"
                  >
                    {t('cancelBtn') || 'Cancel'}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmCleanEmpty(true)}
                  className="h-7 border-blue-500/40 text-xs font-medium text-blue-700 hover:bg-blue-500/20 active:scale-[0.97] dark:text-blue-300"
                >
                  <Trash2 className="mr-1 size-3" />
                  {t('cleanAllEmptyFoldersBtn') || 'Clean All Empty'}
                </Button>
              )}
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
                      <span
                        className="text-foreground block truncate text-xs font-medium"
                        title={folder.path}
                      >
                        {formatFolderTitle(folder.title, folder.path, lang)}
                      </span>
                      <span
                        className="text-muted-foreground mt-0.5 block truncate text-[10px]"
                        title={folder.path}
                      >
                        📁 {formatShortFolderPath(folder.path, lang)}
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
