import type {
  BrokenLinkResult,
  DuplicateGroup,
  EmptyFolder,
  FlatBookmark,
  SimilarGroup,
  TrackingCleanItem,
  TrackingCleanOptions,
  TrackingCleanSegment,
} from '@/types';

import { flattenBookmarks } from './bookmarks';
import { addToTrash, addMultipleToTrash } from './trash';

// Tracking parameters to strip when detecting duplicate bookmarks
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'ref',
  'ref_src',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'twclid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'igshid',
]);

/**
 * Normalizes a URL for comparison:
 * - standardizes protocol (treats http & https as equivalent for duplication)
 * - lowercases hostname and strips www.
 * - removes tracking parameters (utm_*, ref, fbclid)
 * - removes trailing slashes and hash anchors
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // Ignore protocol differences (treat http and https as equivalent duplicate)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Filter tracking params
    const cleanParams: [string, string][] = [];
    parsed.searchParams.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (!TRACKING_PARAMS.has(lowerKey) && !lowerKey.startsWith('utm_')) {
        cleanParams.push([lowerKey, val]);
      }
    });
    cleanParams.sort((a, b) => a[0].localeCompare(b[0]));

    const queryString =
      cleanParams.length > 0
        ? '?' + cleanParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
        : '';

    return `${hostname}${pathname}${queryString}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Find all duplicate bookmark groups across the entire bookmark tree
 */
export function findDuplicates(tree: chrome.bookmarks.BookmarkTreeNode[]): DuplicateGroup[] {
  const bookmarks = flattenBookmarks(tree);
  const groupsMap = new Map<string, FlatBookmark[]>();

  for (const b of bookmarks) {
    if (!b.url || b.url.startsWith('chrome://')) continue;
    const key = normalizeUrl(b.url);
    const existing = groupsMap.get(key) || [];
    existing.push(b);
    groupsMap.set(key, existing);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  for (const [normUrl, items] of groupsMap.entries()) {
    if (items.length >= 2) {
      // Sort items by dateAdded descending (newest first)
      items.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      const firstItem = items[0];
      if (!firstItem) continue;

      duplicateGroups.push({
        normalizedUrl: normUrl,
        displayUrl: firstItem.url,
        domain: firstItem.domain,
        items,
      });
    }
  }

  // Sort groups by count of duplicates (largest groups first)
  return duplicateGroups.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Detect empty folders in the bookmark tree (excluding protected roots)
 */
export function findEmptyFolders(tree: chrome.bookmarks.BookmarkTreeNode[]): EmptyFolder[] {
  const PROTECTED_ROOTS = new Set(['0', '1', '2', '3']);
  const emptyFolders: EmptyFolder[] = [];

  function checkFolder(node: chrome.bookmarks.BookmarkTreeNode, parentPath = ''): boolean {
    const isFolder = !node.url;
    if (!isFolder) return false;

    const currentPath = parentPath ? `${parentPath} / ${node.title}` : node.title;

    if (!node.children || node.children.length === 0) {
      if (!PROTECTED_ROOTS.has(node.id)) {
        emptyFolders.push({
          id: node.id,
          parentId: node.parentId,
          title: node.title || 'Untitled Folder',
          path: currentPath,
        });
      }
      return true; // Is empty
    }

    // Check all sub-nodes
    let allSubChildrenEmpty = true;
    for (const child of node.children) {
      if (child.url) {
        allSubChildrenEmpty = false;
      } else {
        const subIsEmpty = checkFolder(child, currentPath);
        if (!subIsEmpty) {
          allSubChildrenEmpty = false;
        }
      }
    }

    if (allSubChildrenEmpty && !PROTECTED_ROOTS.has(node.id)) {
      // If all subchildren were empty folders and got added, this folder itself is also empty
      emptyFolders.push({
        id: node.id,
        parentId: node.parentId,
        title: node.title || 'Untitled Folder',
        path: currentPath,
      });
      return true;
    }

    return false;
  }

  for (const root of tree) {
    if (root.children) {
      for (const child of root.children) {
        checkFolder(child, root.title);
      }
    }
  }

  return emptyFolders;
}

/**
 * Test a single URL's HTTP reachability from the sidepanel
 */
export async function testUrlHealth(
  url: string,
  timeoutMs = 6000,
  signal?: AbortSignal
): Promise<{ status: 'healthy' | 'broken' | 'protected'; statusCode?: number; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    // Attempt HEAD request first for speed and bandwidth efficiency
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'HEAD',
        signal: combinedSignal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
    } catch (headErr: any) {
      // Some servers reject HEAD with 405 or cors, try lightweight GET
      if (combinedSignal.aborted) throw headErr;
      res = await fetch(url, {
        method: 'GET',
        signal: combinedSignal,
        headers: {
          Range: 'bytes=0-1024', // Request first 1KB only
        },
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const code = res.status;
    if (code >= 200 && code < 400) {
      return { status: 'healthy', statusCode: code };
    }
    if (code === 401 || code === 403) {
      // Protected/Authentication required (e.g. private dashboard, Google Docs) - NOT a dead link!
      return { status: 'protected', statusCode: code };
    }
    if (code === 404 || code === 410) {
      return { status: 'broken', statusCode: code, error: `HTTP ${code} Not Found` };
    }
    if (code >= 500) {
      return { status: 'broken', statusCode: code, error: `HTTP ${code} Server Error` };
    }

    return { status: 'healthy', statusCode: code };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (signal?.aborted) {
      throw err;
    }
    const message =
      err.name === 'AbortError'
        ? 'Connection Timeout (6s)'
        : err.message || 'Network / DNS Unreachable';
    return { status: 'broken', error: message };
  }
}

/**
 * Scan a list of bookmarks with concurrency limit (e.g. 6 parallel workers)
 */
export async function scanBrokenLinks(
  bookmarks: FlatBookmark[],
  onProgress: (scanned: number, total: number, current?: FlatBookmark) => void,
  signal?: AbortSignal,
  concurrency = 6
): Promise<BrokenLinkResult[]> {
  const brokenResults: BrokenLinkResult[] = [];
  let index = 0;
  let completed = 0;
  const total = bookmarks.length;

  async function worker() {
    while (index < total) {
      if (signal?.aborted) break;
      const currentIndex = index++;
      const item = bookmarks[currentIndex];
      if (!item) continue;

      try {
        const result = await testUrlHealth(item.url, 6000, signal);
        completed++;
        onProgress(completed, total, item);

        if (result.status === 'broken') {
          brokenResults.push({
            bookmark: item,
            status: 'broken',
            statusCode: result.statusCode,
            error: result.error,
            checkedAt: Date.now(),
          });
        }
      } catch {
        if (signal?.aborted) break;
        completed++;
        onProgress(completed, total, item);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return brokenResults;
}

/**
 * Batch resolve duplicate group: keep one (newest or oldest) and trash the others
 */
export async function resolveDuplicateGroup(
  group: DuplicateGroup,
  keepMode: 'newest' | 'oldest' = 'newest'
): Promise<number> {
  const items = [...group.items];
  // Sort items
  items.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

  const toKeep = keepMode === 'newest' ? items[0] : items[items.length - 1];
  if (!toKeep) return 0;
  const toDelete = items.filter((b) => b.id !== toKeep.id);

  let removedCount = 0;
  for (const item of toDelete) {
    try {
      // 1. Add to Recycle Bin for 30-day safety
      await addToTrash({
        originalId: item.id,
        title: item.title,
        url: item.url,
        isFolder: false,
        parentId: item.parentId,
        parentPath: item.path,
      });

      // 2. Remove from Chrome
      await chrome.bookmarks.remove(item.id);
      removedCount++;
    } catch (err) {
      console.error(`Failed to remove duplicate bookmark ${item.id}:`, err);
    }
  }

  return removedCount;
}

/**
 * Remove an empty folder and save to Recycle Bin
 */
export async function removeEmptyFolder(folder: EmptyFolder): Promise<boolean> {
  const PROTECTED_ROOTS = new Set(['0', '1', '2', '3']);
  if (PROTECTED_ROOTS.has(folder.id)) return false;

  try {
    // 1. Add to Recycle Bin
    await addToTrash({
      originalId: folder.id,
      title: folder.title,
      isFolder: true,
      parentId: folder.parentId || '1',
      parentPath: folder.path,
    });

    // 2. Remove folder
    await chrome.bookmarks.remove(folder.id);
    return true;
  } catch (err) {
    console.error(`Failed to remove empty folder ${folder.id}:`, err);
    return false;
  }
}

/**
 * Remove a broken link bookmark and save to Recycle Bin
 */
export async function removeBookmarkWithTrash(bookmark: FlatBookmark): Promise<boolean> {
  try {
    // 1. Add to Recycle Bin
    await addToTrash({
      originalId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      isFolder: false,
      parentId: bookmark.parentId,
      parentPath: bookmark.path,
    });

    // 2. Remove from Chrome
    await chrome.bookmarks.remove(bookmark.id);
    return true;
  } catch (err) {
    console.error(`Failed to delete bookmark ${bookmark.id}:`, err);
    return false;
  }
}

/**
 * Remove multiple broken links in an optimized batch:
 * 1. Single storage batch write to Recycle Bin
 * 2. Sequential Chrome removals with real-time onProgress callback
 */
export async function removeMultipleBookmarksWithTrash(
  bookmarks: FlatBookmark[],
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  if (bookmarks.length === 0) return 0;

  // 1. Single atomic batch write to Recycle Bin
  await addMultipleToTrash(
    bookmarks.map((b) => ({
      originalId: b.id,
      title: b.title,
      url: b.url,
      isFolder: false,
      parentId: b.parentId,
      parentPath: b.path,
    }))
  );

  // 2. Remove each from Chrome with live progress
  let count = 0;
  for (const b of bookmarks) {
    try {
      await chrome.bookmarks.remove(b.id);
      count++;
      onProgress?.(count, bookmarks.length);
    } catch (err) {
      console.warn(`Failed to remove bookmark ${b.id}:`, err);
    }
  }

  return count;
}

/**
 * Find similar bookmarks grouped by their common base URL / origin and path endpoint
 */
export function findSimilarBookmarks(tree: chrome.bookmarks.BookmarkTreeNode[]): SimilarGroup[] {
  const bookmarks = flattenBookmarks(tree);
  const baseMap = new Map<string, FlatBookmark[]>();

  for (const b of bookmarks) {
    if (!b.url || b.url.startsWith('chrome://')) continue;

    try {
      const parsed = new URL(b.url);
      let pathname = parsed.pathname;
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }
      const baseUrl = `${parsed.origin}${pathname}`;

      const existing = baseMap.get(baseUrl) || [];
      existing.push(b);
      baseMap.set(baseUrl, existing);
    } catch {
      // Ignore invalid URLs
    }
  }

  const groups: SimilarGroup[] = [];
  for (const [baseUrl, items] of baseMap.entries()) {
    if (items.length >= 2) {
      let domain = '';
      try {
        domain = new URL(baseUrl).hostname.replace(/^www\./, '');
      } catch {}

      groups.push({
        id: baseUrl,
        baseUrl,
        domain,
        items,
      });
    }
  }

  return groups.sort((a, b) => b.items.length - a.items.length);
}

const UNIVERSAL_KEYS = new Set([
  'fbclid',
  'fbadid',
  'gclid',
  'gclsrc',
  'dclid',
  'wbraid',
  'gbraid',
  'twclid',
  'tw_source',
  'tw_campaign',
  'msclkid',
  'yclid',
  'ym_debug',
  'mc_cid',
  'mc_eid',
  'igshid',
  '_hsenc',
  '_hsmi',
  'hsctatracking',
  '_ga',
  '_gl',
  'si',
]);

/**
 * Scan bookmarks for tracking parameters (universal, site-specific, and affiliate)
 */
export function findTrackingParameters(
  tree: chrome.bookmarks.BookmarkTreeNode[],
  options: TrackingCleanOptions = { includeSiteSpecific: true, includeAffiliate: false }
): TrackingCleanItem[] {
  const bookmarks = flattenBookmarks(tree);
  const results: TrackingCleanItem[] = [];

  for (const b of bookmarks) {
    if (!b.url || b.url.startsWith('chrome://')) continue;

    try {
      const parsed = new URL(b.url);
      const host = parsed.hostname.toLowerCase();
      const removedParams: string[] = [];
      const segments: TrackingCleanSegment[] = [];

      // 1. Amazon path check: /ref=...
      let pathname = parsed.pathname;
      let pathRemoved = '';
      if (options.includeSiteSpecific && host.includes('amazon.')) {
        const refIdx = pathname.indexOf('/ref=');
        if (refIdx !== -1) {
          pathRemoved = pathname.slice(refIdx);
          pathname = pathname.slice(0, refIdx + 1);
        }
      }

      // Collect all query parameters
      const pairs: [string, string][] = [];
      parsed.searchParams.forEach((val, key) => {
        pairs.push([key, val]);
      });

      const keptPairs: [string, string][] = [];
      const removedParamTypes = new Map<string, 'universal' | 'site-specific' | 'affiliate'>();

      for (const [key, val] of pairs) {
        const lower = key.toLowerCase();
        const isUniversal = lower.startsWith('utm_') || UNIVERSAL_KEYS.has(lower);
        let isSiteSpecific = false;
        const isAffiliate =
          options.includeAffiliate &&
          (lower === 'tag' || lower === 'ref' || lower.startsWith('aff') || lower === 'referrer');

        if (options.includeSiteSpecific) {
          if (host.includes('youtube.') || host === 'youtu.be') {
            if (lower === 'feature' || lower === 'si' || lower === 'ab_channel') {
              isSiteSpecific = true;
            }
          } else if (host.includes('amazon.')) {
            if (
              [
                'ref',
                'ref_',
                'crid',
                'dib',
                'dib_tag',
                'keywords',
                'sprefix',
                'qid',
                'sr',
                'th',
                'psc',
              ].includes(lower)
            ) {
              isSiteSpecific = true;
            }
          } else if (host.includes('twitter.') || host.includes('x.com')) {
            if (lower === 's' || lower === 't') {
              isSiteSpecific = true;
            }
          } else if (host.includes('aliexpress.')) {
            if (['spm', 'scm', 'pdp_npi', 'btsid', 'ws_ab_test'].includes(lower)) {
              isSiteSpecific = true;
            }
          } else if (host.includes('medium.') || host.includes('substack.')) {
            if (['source', 'postpublishedtype', 'publication_id'].includes(lower)) {
              isSiteSpecific = true;
            }
          }
        }

        if (isUniversal || isSiteSpecific || isAffiliate) {
          const type = isUniversal ? 'universal' : isSiteSpecific ? 'site-specific' : 'affiliate';
          removedParams.push(key);
          removedParamTypes.set(key, type);
        } else {
          keptPairs.push([key, val]);
        }
      }

      if (removedParams.length === 0 && !pathRemoved) {
        continue;
      }

      // Build clean URL
      const cleanParsed = new URL(b.url);
      cleanParsed.pathname = pathname;
      cleanParsed.search =
        keptPairs.length > 0
          ? '?' +
            keptPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
          : '';
      const cleanUrl = cleanParsed.toString();

      // Build visual segments for display
      const baseUrlPart = `${parsed.origin}${pathname}`;
      segments.push({ text: baseUrlPart, isRemoved: false });

      if (pathRemoved) {
        segments.push({ text: pathRemoved, isRemoved: true, type: 'site-specific' });
      }

      if (pairs.length > 0) {
        let firstParam = true;
        for (const [key, val] of pairs) {
          const prefix = firstParam ? '?' : '&';
          firstParam = false;
          const paramStr = `${prefix}${key}=${val}`;
          const isRem = removedParamTypes.has(key);
          segments.push({
            text: paramStr,
            isRemoved: isRem,
            type: removedParamTypes.get(key),
          });
        }
      }

      results.push({
        bookmark: b,
        originalUrl: b.url,
        cleanUrl,
        removedParams,
        segments,
      });
    } catch {
      // Ignore invalid URLs
    }
  }

  return results;
}

/**
 * Clean tracking parameters from a single bookmark URL
 */
export async function cleanBookmarkUrl(bookmarkId: string, cleanUrl: string): Promise<boolean> {
  try {
    await chrome.bookmarks.update(bookmarkId, { url: cleanUrl });
    return true;
  } catch (err) {
    console.error(`Failed to update bookmark ${bookmarkId} URL:`, err);
    return false;
  }
}

/**
 * Clean tracking parameters from multiple bookmarks in batch with progress
 */
export async function cleanMultipleBookmarkUrls(
  items: { id: string; cleanUrl: string }[],
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  let count = 0;
  for (const item of items) {
    try {
      await chrome.bookmarks.update(item.id, { url: item.cleanUrl });
      count++;
      onProgress?.(count, items.length);
    } catch (err) {
      console.warn(`Failed to clean URL for bookmark ${item.id}:`, err);
    }
  }
  return count;
}

/**
 * Checks if a hostname belongs to localhost, a private LAN IP, or a reserved local development domain
 */
export function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host) return false;

  // 1. localhost & special local domains
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.test') ||
    host.endsWith('.example') ||
    host.endsWith('.invalid') ||
    host.endsWith('.lan') ||
    host.endsWith('.home') ||
    host.endsWith('.home.arpa')
  ) {
    return true;
  }

  // 2. Loopback IPv4 (127.0.0.0/8) & IPv6 (::1)
  if (
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host === '::1' ||
    host === '[::1]' ||
    host === '0.0.0.0'
  ) {
    return true;
  }

  // 3. Private IPv4 (RFC 1918)
  // 10.0.0.0 - 10.255.255.255
  if (host.startsWith('10.')) {
    return true;
  }
  // 172.16.0.0 - 172.31.255.255
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172 && match172[1]) {
    const secondOctet = parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }
  // 192.168.0.0 - 192.168.255.255
  if (host.startsWith('192.168.')) {
    return true;
  }

  // 4. Link-local IPv4 (169.254.0.0/16)
  if (host.startsWith('169.254.')) {
    return true;
  }

  // 5. Router standard hostnames
  if (
    host === 'router.asus.com' ||
    host === 'tplinkwifi.net' ||
    host === 'tplinkrepeater.net' ||
    host === 'fritz.box' ||
    host === 'miwifi.com' ||
    host === 'openwrt.lan'
  ) {
    return true;
  }

  return false;
}

/**
 * Tests if a URL is unencrypted HTTP and NOT a local/private development host
 */
export function isInsecureHttp(url: string): boolean {
  if (!url || !url.startsWith('http://')) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:') return false;
    return !isLocalOrPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Find all bookmarks saved over unencrypted HTTP (excluding localhost & private IP addresses)
 */
export function findInsecureHttpBookmarks(
  tree: chrome.bookmarks.BookmarkTreeNode[]
): FlatBookmark[] {
  const bookmarks = flattenBookmarks(tree);
  return bookmarks.filter((b) => b.url && isInsecureHttp(b.url));
}

/**
 * Upgrade a single bookmark URL from http:// to https://
 */
export async function upgradeBookmarkToHttps(
  bookmarkId: string,
  currentUrl: string
): Promise<boolean> {
  try {
    const httpsUrl = currentUrl.replace(/^http:\/\//i, 'https://');
    await chrome.bookmarks.update(bookmarkId, { url: httpsUrl });
    return true;
  } catch (err) {
    console.error(`Failed to upgrade bookmark ${bookmarkId} to HTTPS:`, err);
    return false;
  }
}

/**
 * Upgrade multiple bookmarks to HTTPS in batch with progress
 */
export async function upgradeMultipleBookmarksToHttps(
  items: { id: string; url: string }[],
  onProgress?: (current: number, total: number) => void
): Promise<number> {
  let count = 0;
  for (const item of items) {
    try {
      const httpsUrl = item.url.replace(/^http:\/\//i, 'https://');
      await chrome.bookmarks.update(item.id, { url: httpsUrl });
      count++;
      onProgress?.(count, items.length);
    } catch (err) {
      console.warn(`Failed to upgrade bookmark ${item.id} to HTTPS:`, err);
    }
  }
  return count;
}
