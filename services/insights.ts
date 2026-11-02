import type { InsightsData } from '@/types';

import { flattenBookmarks, getAllFolders } from './bookmarks';
import { findDuplicates, findEmptyFolders } from './cleaner';

/**
 * Compute health metrics, domain breakdown, protocol stats, and overall health score
 */
export function calculateInsights(
  tree: chrome.bookmarks.BookmarkTreeNode[],
  knownBrokenCount = 0
): InsightsData {
  const bookmarks = flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'));
  const folders = getAllFolders(tree).filter((f) => f.id !== '0');
  const duplicates = findDuplicates(tree);
  const emptyFolders = findEmptyFolders(tree);

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
    } else if (b.url.startsWith('http://')) {
      httpCount++;
    }
  }

  const uniqueDomains = domainCounts.size;
  const httpsRatio = totalBookmarks > 0 ? Math.round((httpsCount / totalBookmarks) * 100) : 100;

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
    topDomains: sortedDomains,
    depthAverage,
  };
}
