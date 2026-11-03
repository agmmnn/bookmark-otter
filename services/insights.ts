import type { InsightsData, BookmarkTreeNode } from '@/types';

import { flattenBookmarks, getAllFolders } from './bookmarks';
import {
  findDuplicates,
  findEmptyFolders,
  findSimilarBookmarks,
  findTrackingParameters,
  isInsecureHttp,
} from './cleaner';

/**
 * Compute health metrics, domain breakdown, protocol stats, and overall health score
 */
export function calculateInsights(tree: BookmarkTreeNode[], knownBrokenCount = 0): InsightsData {
  const bookmarks = flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'));
  const folders = getAllFolders(tree).filter((f) => f.id !== '0');
  // Pass pre-flattened bookmarks directly to avoid redundant tree traversals
  const duplicates = findDuplicates(bookmarks);
  const emptyFolders = findEmptyFolders(tree);
  const similar = findSimilarBookmarks(bookmarks);
  const trackings = findTrackingParameters(bookmarks);

  const totalBookmarks = bookmarks.length;
  const totalFolders = folders.length;

  // Domain analysis
  const domainCounts = new Map<string, number>();
  let httpsCount = 0;
  let httpCount = 0;

  for (const b of bookmarks) {
    if (b.domain) {
      domainCounts.set(b.domain, (domainCounts.get(b.domain) || 0) + 1);
    }
    if (b.url.startsWith('https://')) {
      httpsCount++;
    } else if (isInsecureHttp(b.url)) {
      httpCount++;
    }
  }

  const uniqueDomains = domainCounts.size;
  const publicWebCount = httpsCount + httpCount;
  const httpsRatio = publicWebCount > 0 ? Math.round((httpsCount / publicWebCount) * 100) : 100;

  // Top domains ranked
  const sortedDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([domain, count]) => ({
      domain,
      count,
      percentage: totalBookmarks > 0 ? Math.round((count / totalBookmarks) * 100) : 0,
    }));

  // Duplicate penalty
  const duplicateExtraCount = duplicates.reduce((acc, g) => acc + (g.items.length - 1), 0);
  const dupPenalty = Math.min(25, duplicateExtraCount * 3);

  // Empty folders penalty
  const emptyPenalty = Math.min(15, emptyFolders.length * 2);

  // Insecure HTTP penalty
  const httpPenalty = Math.min(15, httpCount * 2);

  // Broken links penalty (if scanned)
  const brokenPenalty = Math.min(35, knownBrokenCount * 5);

  // Raw score calculation
  const rawScore = 100 - dupPenalty - emptyPenalty - httpPenalty - brokenPenalty;
  const healthScore = Math.max(10, Math.min(100, Math.round(rawScore)));

  // Rating badge classification
  let rating: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';
  if (healthScore >= 90) {
    rating = 'excellent';
  } else if (healthScore >= 75) {
    rating = 'good';
  } else if (healthScore >= 50) {
    rating = 'warning';
  } else {
    rating = 'critical';
  }

  // Folder depth calculation
  const depthTotal = folders.reduce((acc, f) => acc + f.path.split(' / ').length, 0);
  const depthAverage = folders.length > 0 ? Number((depthTotal / folders.length).toFixed(1)) : 1;

  // 1. Deepest folder nesting
  let deepestNesting = 1;
  let deepestFolderPath = '';
  for (const f of folders) {
    const levels = f.path.split(' / ').length;
    if (levels > deepestNesting) {
      deepestNesting = levels;
      deepestFolderPath = f.path;
    }
  }

  // 2. Loose bookmarks (sitting directly in root without a dedicated subfolder)
  const looseBookmarks = bookmarks.filter(
    (b) =>
      b.path === 'Bookmarks Bar' ||
      b.path === 'Other Bookmarks' ||
      b.path === 'Yer İşaretleri Çubuğu' ||
      b.path === 'Diğer Yer İşaretleri' ||
      b.parentId === '1' ||
      b.parentId === '2'
  );
  const looseBookmarksCount = looseBookmarks.length;

  // 3. Average bookmarks per folder
  const avgBookmarksPerFolder =
    totalFolders > 0 ? Number((totalBookmarks / totalFolders).toFixed(1)) : 0;

  // 4. Domains saved only once
  let singleUseDomainsCount = 0;
  for (const count of domainCounts.values()) {
    if (count === 1) singleUseDomainsCount++;
  }

  // 5. Oldest bookmark & Busiest month
  let oldestBookmark: InsightsData['oldestBookmark'] = null;
  const monthCounts = new Map<string, { year: number; month: number; count: number }>();

  for (const b of bookmarks) {
    if (b.dateAdded && b.dateAdded > 0) {
      if (!oldestBookmark || (oldestBookmark.dateAdded && b.dateAdded < oldestBookmark.dateAdded)) {
        oldestBookmark = {
          title: b.title || b.domain || b.url,
          url: b.url,
          dateAdded: b.dateAdded,
          domain: b.domain,
        };
      }

      const d = new Date(b.dateAdded);
      const y = d.getFullYear();
      const m = d.getMonth();
      const key = `${y}-${m}`;
      const existing = monthCounts.get(key) || { year: y, month: m, count: 0 };
      existing.count++;
      monthCounts.set(key, existing);
    }
  }

  let busiestMonth: InsightsData['busiestMonth'] = null;
  for (const item of monthCounts.values()) {
    if (!busiestMonth || item.count > busiestMonth.count) {
      busiestMonth = item;
    }
  }

  // 6. Top 5 Largest Folders
  const folderCounts = new Map<string, number>();
  for (const b of bookmarks) {
    if (b.path) {
      folderCounts.set(b.path, (folderCounts.get(b.path) || 0) + 1);
    }
  }

  const topFolders = Array.from(folderCounts.entries())
    .filter(
      ([path]) =>
        ![
          'Bookmarks Bar',
          'Other Bookmarks',
          'Yer İşaretleri Çubuğu',
          'Diğer Yer İşaretleri',
        ].includes(path)
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => {
      const parts = path.split(' / ');
      const title = parts[parts.length - 1] || path;
      return {
        id: path,
        title,
        path,
        count,
        percentage: totalBookmarks > 0 ? Math.round((count / totalBookmarks) * 100) : 0,
      };
    });

  // 7. Age distribution (< 6mo, 6-12mo, 1-3yr, 3+yr)
  const now = Date.now();
  const MS_IN_DAY = 24 * 60 * 60 * 1000;
  let under6Months = 0;
  let sixTo12Months = 0;
  let oneTo3Years = 0;
  let over3Years = 0;

  for (const b of bookmarks) {
    if (!b.dateAdded || b.dateAdded <= 0) {
      over3Years++;
      continue;
    }
    const days = (now - b.dateAdded) / MS_IN_DAY;
    if (days < 182) {
      under6Months++;
    } else if (days < 365) {
      sixTo12Months++;
    } else if (days < 365 * 3) {
      oneTo3Years++;
    } else {
      over3Years++;
    }
  }

  const safePct = (c: number) => (totalBookmarks > 0 ? Math.round((c / totalBookmarks) * 100) : 0);

  return {
    healthScore,
    rating,
    totalBookmarks,
    totalFolders,
    uniqueDomains,
    httpsCount,
    httpCount,
    httpsRatio,
    duplicateCount: duplicateExtraCount,
    emptyFolderCount: emptyFolders.length,
    brokenCount: knownBrokenCount,
    similarCount: similar.length,
    trackingCount: trackings.length,
    topDomains: sortedDomains,
    depthAverage,
    penalties: {
      duplicates: dupPenalty,
      emptyFolders: emptyPenalty,
      insecureHttp: httpPenalty,
      brokenLinks: brokenPenalty,
    },
    oldestBookmark,
    busiestMonth,
    deepestNesting,
    deepestFolderPath,
    looseBookmarksCount,
    avgBookmarksPerFolder,
    singleUseDomainsCount,
    topFolders,
    ageDistribution: {
      under6Months: { count: under6Months, percentage: safePct(under6Months) },
      sixTo12Months: { count: sixTo12Months, percentage: safePct(sixTo12Months) },
      oneTo3Years: { count: oneTo3Years, percentage: safePct(oneTo3Years) },
      over3Years: { count: over3Years, percentage: safePct(over3Years) },
    },
  };
}
