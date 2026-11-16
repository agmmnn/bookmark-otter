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
  Radio,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { formatFolderTitle, formatShortFolderPath, useResponsiveTabStage } from '@/lib/utils';
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
  restoreBookmarkUrls,
  verifyHttpsSupportBatch,
} from '@/services/cleaner';
import { calculateInsights } from '@/services/insights';
import { restoreRecentTrashItems } from '@/services/trash';
import type {
  DuplicateGroup,
  EmptyFolder,
  BrokenLinkResult,
  FlatBookmark,
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
  const [confirmCleanDuplicates, setConfirmCleanDuplicates] = useState(false);
  const [emptyFolders, setEmptyFolders] = useState<EmptyFolder[]>([]);
  const [confirmCleanEmpty, setConfirmCleanEmpty] = useState(false);
  const [allBookmarks, setAllBookmarks] = useState<FlatBookmark[]>([]);

  // Similar bookmarks state
  const [similarGroups, setSimilarGroups] = useState<SimilarGroup[]>([]);
  const [selectedSimilarIds, setSelectedSimilarIds] = useState<Set<string>>(new Set());
  const [isDeletingSimilar, setIsDeletingSimilar] = useState(false);
  const [confirmDeleteSimilar, setConfirmDeleteSimilar] = useState(false);

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
  const [httpsVerifyMap, setHttpsVerifyMap] = useState<Map<string, boolean>>(new Map());
  const [isVerifyingHttps, setIsVerifyingHttps] = useState(false);
  const [verifyHttpsProgress, setVerifyHttpsProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [httpSearchQuery, setHttpSearchQuery] = useState('');
  const [visibleHttpCount, setVisibleHttpCount] = useState(30);

  // Broken link scanner state
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

  const showToast = (msg: string, onUndo?: () => Promise<void>) => {
    if (onUndo) {
      toast.success(msg, {
        action: {
          label: t('undoBtn') || (lang === 'tr' ? 'Geri Al' : 'Undo'),
          onClick: () => {
            onUndo();
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
      const dups = findDuplicates(flats);
      const empties = findEmptyFolders(tree);
      const similar = findSimilarBookmarks(flats);
      const trackers = findTrackingParameters(flats, trackingOptions);
      const insecures = findInsecureHttpBookmarks(flats);
      const baseInsights = calculateInsights(tree, cachedBrokenCount);

      setDuplicates(dups);
      setEmptyFolders(empties);
      setAllBookmarks(flats);
      setSimilarGroups(similar);
      setTrackingItems(trackers);
      setInsecureBookmarks(insecures);
      setInsightsBase(baseInsights);
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
        `Removed ${removedCount} duplicate(s) (kept ${keepMode}). Moved to Recycle Bin.`,
      async () => {
        await restoreRecentTrashItems(removedCount);
        await loadData();
        onFixed?.();
      }
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
    showToast(t('brokenLinkRemoved') || 'Removed duplicate to Recycle Bin', async () => {
      await restoreRecentTrashItems(1);
      await loadData();
      onFixed?.();
    });
    if (onFixed) onFixed();
  };

  const handleCleanAllDuplicates = async () => {
    let totalRemoved = 0;
    for (const group of duplicates) {
      const count = await resolveDuplicateGroup(group, 'newest');
      totalRemoved += count;
    }
    setDuplicates([]);
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
      setConfirmDeleteSimilar(false);
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
  const filteredInsecureBookmarks = useMemo(() => {
    const q = httpSearchQuery.trim().toLowerCase();
    if (!q) return insecureBookmarks;
    return insecureBookmarks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        b.domain.toLowerCase().includes(q) ||
        b.path.toLowerCase().includes(q)
    );
  }, [insecureBookmarks, httpSearchQuery]);

  const visibleInsecureBookmarks = useMemo(
    () => filteredInsecureBookmarks.slice(0, visibleHttpCount),
    [filteredInsecureBookmarks, visibleHttpCount]
  );

  const verifiedHttpItems = useMemo(
    () => insecureBookmarks.filter((b) => httpsVerifyMap.get(b.id) === true),
    [insecureBookmarks, httpsVerifyMap]
  );

  const handleVerifyHttpsSupport = async () => {
    if (insecureBookmarks.length === 0 || isVerifyingHttps) return;
    setIsVerifyingHttps(true);
    setVerifyHttpsProgress({ current: 0, total: insecureBookmarks.length });
    try {
      const map = await verifyHttpsSupportBatch(insecureBookmarks, (checked, total) => {
        setVerifyHttpsProgress({ current: checked, total });
      });
      setHttpsVerifyMap(map);
      const okCount = Array.from(map.values()).filter(Boolean).length;
      showToast(
        lang === 'tr'
          ? `${okCount} / ${insecureBookmarks.length} sitede HTTPS desteği doğrulandı.`
          : `Verified HTTPS support on ${okCount} of ${insecureBookmarks.length} sites.`
      );
    } catch (err) {
      console.error('Failed to verify HTTPS support:', err);
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
    if (insecureBookmarks.length === 0 || isUpgradingHttps || isVerifyingHttps) return;

    let currentMap = httpsVerifyMap;
    if (currentMap.size === 0) {
      setIsVerifyingHttps(true);
      setVerifyHttpsProgress({ current: 0, total: insecureBookmarks.length });
      try {
        currentMap = await verifyHttpsSupportBatch(insecureBookmarks, (checked, total) => {
          setVerifyHttpsProgress({ current: checked, total });
        });
        setHttpsVerifyMap(currentMap);
      } finally {
        setIsVerifyingHttps(false);
        setVerifyHttpsProgress(null);
      }
    }

    const targets = insecureBookmarks.filter((b) => currentMap.get(b.id) === true);
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

  const totalDuplicateBookmarks = duplicates.reduce((acc, g) => acc + (g.items.length - 1), 0);

  const hasEverScanned404 = hasScannedBroken || lastScannedAt !== null;

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
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
          {effectiveBrokenCount > 0 && (
            <Badge
              variant="destructive"
              className="ml-1 h-3.5 shrink-0 px-1 py-0 text-[8.5px] font-semibold"
            >
              {effectiveBrokenCount}
            </Badge>
          )}
        </button>

        <button
          role="tab"
          aria-selected={subTab === 'empty'}
          aria-label={t('tabEmptyFolders') || 'Empty Folders'}
          data-active={subTab === 'empty'}
          onClick={() => handleSubTabChange('empty')}
          className={`flex min-w-0 cursor-pointer items-center justify-center rounded-md py-1.5 text-xs font-medium transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
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
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-all duration-120 active:scale-[0.98] ${
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
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-all duration-120 active:scale-[0.98] ${
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
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-all duration-120 active:scale-[0.98] ${
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
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-all duration-120 active:scale-[0.98] ${
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
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-all duration-120 active:scale-[0.98] ${
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
                  className={`hover:border-border cursor-pointer space-y-1 rounded-lg border p-2.5 text-left transition-all duration-120 active:scale-[0.98] ${
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
                        className="bg-emerald-500 transition-[width] duration-300"
                        style={{
                          width: `${liveInsights.ageDistribution.under6Months.percentage}%`,
                        }}
                      />
                      <div
                        className="bg-sky-500 transition-[width] duration-300"
                        style={{
                          width: `${liveInsights.ageDistribution.sixTo12Months.percentage}%`,
                        }}
                      />
                      <div
                        className="bg-amber-500 transition-[width] duration-300"
                        style={{
                          width: `${liveInsights.ageDistribution.oneTo3Years.percentage}%`,
                        }}
                      />
                      <div
                        className="bg-purple-500 transition-[width] duration-300"
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
                                  className="h-full rounded-full bg-amber-500 transition-[width] duration-300 ease-out"
                                  style={{ width: `${barWidth}%` }}
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
                                  className="bg-foreground/60 h-full rounded-full transition-[width] duration-300 ease-out"
                                  style={{ width: `${barWidth}%` }}
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
          {duplicates.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
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
                  className="h-7 border-amber-500/40 text-xs font-medium text-amber-700 hover:bg-amber-500/20 active:scale-[0.97] dark:text-amber-300"
                >
                  <Sparkles className="mr-1 size-3" />
                  {t('cleanAllDuplicatesBtn') || 'Clean All (Keep Newest)'}
                </Button>
              )}
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
                          className="h-4 shrink-0 px-1.5 py-0 text-[9.5px] font-medium"
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

                    {/* Detailed List of copies (Title, Folder Path, Date Added, Full URL) */}
                    <div className="divide-border/30 divide-y text-xs">
                      {visibleItems.map((item, itemIdx) => (
                        <div
                          key={item.id}
                          className={`group flex items-start justify-between gap-2 px-3 py-2 transition-colors ${
                            itemIdx === 0 ? 'bg-emerald-500/5' : 'hover:bg-muted/30'
                          }`}
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {itemIdx === 0 ? (
                                <Badge
                                  variant="outline"
                                  className="h-3.5 shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1 py-0 text-[8.5px] font-medium text-emerald-600 dark:text-emerald-400"
                                >
                                  {t('newestBadge') || 'Newest'}
                                </Badge>
                              ) : (
                                <span className="bg-muted-foreground/40 ml-1 size-1.5 shrink-0 rounded-full" />
                              )}
                              <span
                                className="text-foreground truncate text-[11px] font-medium"
                                title={item.title || item.url}
                              >
                                {item.title || item.domain}
                              </span>
                            </div>

                            <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="max-w-[140px] truncate" title={item.path}>
                                📁 {formatShortFolderPath(item.path, lang)}
                              </span>
                              {item.dateAdded && (
                                <>
                                  <span>•</span>
                                  <span className="shrink-0">{formatItemDate(item.dateAdded)}</span>
                                </>
                              )}
                            </div>

                            <div
                              className="text-muted-foreground/75 truncate font-mono text-[10px]"
                              title={item.url}
                            >
                              {item.url}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1 pt-0.5 opacity-75 transition-opacity group-hover:opacity-100">
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
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Layers className="size-4 shrink-0 text-cyan-500" />
                  <h3 className="text-foreground text-sm font-bold">
                    {t('similarTitle') || 'Similar Bookmarks'}
                  </h3>
                  <span className="text-muted-foreground text-xs">
                    {t('similarFound', { count: similarGroups.length }) ||
                      `${similarGroups.length} similarities in total`}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {t('similarSubtitle') || 'Bookmarks sharing the same base URL or page path.'}
                </p>
              </div>

              {/* Batch actions when bookmarks are selected */}
              {selectedSimilarIds.size > 0 && (
                <div className="animate-in fade-in flex items-center gap-1.5 duration-150">
                  <Badge
                    variant="outline"
                    className="h-6 border-cyan-500/30 px-2 text-[10px] text-cyan-600 dark:text-cyan-400"
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
                  {confirmDeleteSimilar ? (
                    <>
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
                        {lang === 'tr'
                          ? `Onayla (${selectedSimilarIds.size})`
                          : `Confirm (${selectedSimilarIds.size})`}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteSimilar(false)}
                        className="h-7 px-2 text-xs"
                      >
                        {t('cancelBtn') || 'Cancel'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmDeleteSimilar(true)}
                      disabled={isDeletingSimilar}
                      className="h-7 px-2 text-xs active:scale-[0.97]"
                    >
                      <Trash2 className="mr-1 size-3" />
                      {t('deleteSelected') || 'Delete Selected'}
                    </Button>
                  )}
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
              <span className="text-muted-foreground text-[10px]">
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
                      <Badge variant="outline" className="h-4 shrink-0 px-1.5 py-0 text-[9px]">
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
                                    className="text-muted-foreground/75 max-w-[210px] truncate font-mono text-[10px]"
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
                                      📁 {formatShortFolderPath(item.path, lang)}
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
                      <span>{t('cleanAllUrlsBtn') || 'Clean All URLs'}</span>
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
                    className="group border-border/50 bg-card hover:border-border rounded-lg border p-3 shadow-2xs transition-[border-color,background-color] duration-120"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1.5">
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
                              📁 {formatShortFolderPath(item.bookmark.path, lang)}
                            </Badge>
                          )}
                        </div>

                        {/* Before -> After URL Preview */}
                        <div className="bg-muted/25 border-border/30 space-y-1 rounded border p-2 font-mono text-[10px] leading-relaxed break-all">
                          <div className="text-muted-foreground/85">
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
                          <div className="flex items-start gap-1 text-emerald-600 dark:text-emerald-400">
                            <span className="shrink-0 font-sans font-bold">→</span>
                            <span className="font-medium break-all">{item.cleanUrl}</span>
                          </div>
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
                      ? 'Şifresiz (http://) bağlantılar. Toplu yükseltme yalnızca HTTPS yanıtı doğrulanan sitelere uygulanır.'
                      : 'Unencrypted (http://) links. Bulk upgrade only modifies sites verified to support HTTPS.'}
                  </span>
                </p>
              </div>

              {/* Verify & Upgrade Buttons */}
              {insecureBookmarks.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleVerifyHttpsSupport}
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
                          {httpsVerifyMap.size > 0
                            ? lang === 'tr'
                              ? `Yeniden Doğrula (${verifiedHttpItems.length} hazır)`
                              : `Re-Verify (${verifiedHttpItems.length} ready)`
                            : lang === 'tr'
                              ? 'HTTPS Doğrula'
                              : 'Verify HTTPS'}
                        </span>
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleUpgradeAllHttps}
                    disabled={
                      isUpgradingHttps ||
                      isVerifyingHttps ||
                      (httpsVerifyMap.size > 0 && verifiedHttpItems.length === 0)
                    }
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
                        <span>
                          {httpsVerifyMap.size > 0
                            ? lang === 'tr'
                              ? `Doğrulananları Yükselt (${verifiedHttpItems.length})`
                              : `Upgrade Verified (${verifiedHttpItems.length})`
                            : t('upgradeAllHttpsBtn') || 'Verify & Upgrade All'}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Search / Filter input for long HTTP lists */}
            {insecureBookmarks.length > 8 && (
              <div className="relative mt-2.5">
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
          ) : (
            <div className="space-y-2">
              {visibleInsecureBookmarks.map((item) => {
                const isUpgradingThis = upgradingSingleId === item.id;
                const pathPart = item.url.slice(7);
                const verifyStatus = httpsVerifyMap.get(item.id);
                return (
                  <div
                    key={item.id}
                    className="group border-border/50 bg-card hover:border-border rounded-lg border p-2.5 shadow-2xs transition-[border-color,background-color] duration-120"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1 space-y-1">
                        {/* Title & Domain & HTTPS Verification Badge */}
                        <div className="flex flex-wrap items-center gap-1.5">
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
                          {verifyStatus === true && (
                            <Badge
                              variant="outline"
                              className="h-4 shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[8.5px] font-medium text-emerald-600 dark:text-emerald-400"
                            >
                              {lang === 'tr' ? '✓ HTTPS çalışıyor' : '✓ HTTPS works'}
                            </Badge>
                          )}
                          {verifyStatus === false && (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground border-border/60 h-4 shrink-0 px-1.5 py-0 text-[8.5px]"
                            >
                              {lang === 'tr' ? 'HTTPS yanıt vermedi' : 'HTTPS unavailable'}
                            </Badge>
                          )}
                          {item.path && (
                            <Badge
                              variant="outline"
                              className="text-muted-foreground border-border/50 h-4 max-w-[130px] shrink-0 truncate px-1.5 py-0 text-[9px]"
                              title={item.path}
                            >
                              📁 {formatShortFolderPath(item.path, lang)}
                            </Badge>
                          )}
                        </div>

                        {/* URL comparison with protocol highlight */}
                        <div className="bg-muted/25 border-border/30 flex items-center gap-1.5 rounded border p-1.5 font-mono text-[10px] leading-relaxed break-all">
                          <span className="rounded-xs bg-amber-500/10 px-0.5 font-semibold text-amber-600 line-through dark:text-amber-400">
                            http://
                          </span>
                          <span className="text-muted-foreground truncate">{pathPart}</span>
                          <span className="text-muted-foreground/60 shrink-0 font-sans">→</span>
                          <span className="shrink-0 rounded-xs bg-emerald-500/10 px-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
                            https://
                          </span>
                        </div>
                      </div>

                      {/* Subtle Row Actions — Primary emphasis stays on top bulk button */}
                      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={isUpgradingThis || isUpgradingHttps}
                          onClick={() => handleUpgradeSingleHttps(item)}
                          className="border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 h-6 cursor-pointer gap-1 rounded border px-1.5 text-[10px] font-medium active:scale-[0.97]"
                          title="Upgrade this bookmark to HTTPS"
                        >
                          {isUpgradingThis ? (
                            <Loader2 className="size-2.5 animate-spin" />
                          ) : (
                            <Lock className="size-2.5" />
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
                          title={
                            lang === 'tr'
                              ? 'Yoksay (HTTP olarak bırak ve listeden gizle)'
                              : 'Ignore (Keep as HTTP and hide from list)'
                          }
                          aria-label="Ignore HTTP warning"
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
                  <span>
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
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
                        title={t('openInTabTooltip') || 'Open in new tab'}
                      >
                        <ExternalLink className="size-3" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleDismissBroken(item.bookmark.id)}
                        className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform active:scale-90"
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
