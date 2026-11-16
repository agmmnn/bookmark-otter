import { browser } from 'wxt/browser';

import type {
  BrokenLinkResult,
  DuplicateGroup,
  DuplicateScanResult,
  DuplicateScope,
  EmptyFolder,
  FlatBookmark,
  HttpsVerifyInfo,
  SimilarGroup,
  TrackingCleanItem,
  TrackingCleanOptions,
  TrackingCleanSegment,
  BookmarkTreeNode,
} from '@/types';

import { flattenBookmarks } from './bookmarks';
import { addToTrash, addMultipleToTrash } from './trash';

const SEPARATOR_DOMAINS = [
  'bookmarkseparators.com',
  'separator.mayastudios.com',
  'bookmarks-separator.com',
];

const LOOSE_FOLDER_NAMES = new Set([
  'Bookmarks Bar',
  'Other Bookmarks',
  'Mobile Bookmarks',
  'Yer İşaretleri Çubuğu',
  'Diğer Yer İşaretleri',
  'Mobil Yer İşaretleri',
  'Root',
]);

/**
 * Returns true when a bookmark is a visual folder separator/divider
 * (e.g. bookmarkseparators.com or line-drawn titles like "──── Vector ────")
 * rather than an ordinary duplicate bookmark.
 */
export function isBookmarkSeparator(bookmark: {
  title?: string;
  url?: string;
  domain?: string;
}): boolean {
  const url = (bookmark.url || '').trim();
  const title = (bookmark.title || '').trim();

  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (SEPARATOR_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) {
        return true;
      }
      if (
        (parsed.protocol === 'data:' || parsed.protocol === 'javascript:') &&
        (title === '' || /[─━═⎯▬\-_=*~]{2,}/.test(title))
      ) {
        return true;
      }
    } catch {
      const domainLower = (bookmark.domain || '').toLowerCase().replace(/^www\./, '');
      if (SEPARATOR_DOMAINS.some((d) => domainLower === d || domainLower.endsWith(`.${d}`))) {
        return true;
      }
    }
  }

  if (title.length > 0) {
    if (/[─━═⎯▬┄┅┈┉╌╍]{2,}/.test(title)) return true;
    if (/(?:-{4,}|_{4,}|={4,}|~{4,})/.test(title)) return true;
    if (/^[\s\-_=*~·•|─━═⎯▬┄┅┈┉╌╍]+$/.test(title)) return true;
  }

  return false;
}

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
 * - removes trailing slashes, while preserving meaningful hash routes (e.g. SPA #inbox/...)
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

    const rawHash = parsed.hash || '';
    const hash = rawHash && rawHash !== '#' && rawHash.toLowerCase() !== '#top' ? rawHash : '';

    return `${hostname}${pathname}${queryString}${hash}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Picks the smartest default copy to keep inside a duplicate group:
 * prefers items with real titles, placed inside organized subfolders, using HTTPS, then newest.
 */
export function pickDefaultKeepBookmark(items: FlatBookmark[]): FlatBookmark {
  if (items.length === 0) {
    throw new Error('Cannot pick default bookmark from empty array');
  }

  const scoreItem = (b: FlatBookmark): number => {
    let score = 0;
    const trimmedTitle = (b.title || '').trim();
    const hasRealTitle =
      trimmedTitle.length > 0 &&
      trimmedTitle.toLowerCase() !== (b.domain || '').toLowerCase() &&
      !/^https?:\/\//i.test(trimmedTitle);
    if (hasRealTitle) score += 100;

    const isRootLoose =
      LOOSE_FOLDER_NAMES.has(b.path) ||
      b.parentId === '1' ||
      b.parentId === '2' ||
      b.parentId === '3';
    if (!isRootLoose) score += 60;

    const depth = b.path ? b.path.split(' / ').length : 1;
    score += Math.min(20, depth * 5);

    if (b.url.startsWith('https://')) score += 10;
    return score;
  };

  let best = items[0]!;
  let bestScore = scoreItem(best);

  for (let i = 1; i < items.length; i++) {
    const candidate = items[i]!;
    const candScore = scoreItem(candidate);
    if (
      candScore > bestScore ||
      (candScore === bestScore && (candidate.dateAdded || 0) > (best.dateAdded || 0))
    ) {
      best = candidate;
      bestScore = candScore;
    }
  }

  return best;
}

/**
 * Resolves either raw bookmark tree nodes or pre-flattened bookmarks into FlatBookmark[]
 * to prevent redundant multi-pass tree flattening across algorithms.
 */
function resolveFlatBookmarks(input: BookmarkTreeNode[] | FlatBookmark[]): FlatBookmark[] {
  if (input.length === 0) return [];
  const first = input[0] as any;
  if (first && 'domain' in first && 'path' in first) {
    return input as FlatBookmark[];
  }
  return flattenBookmarks(input as BookmarkTreeNode[]);
}

function buildDuplicateGroupsFromMap(
  groupsMap: Map<string, FlatBookmark[]>,
  isSeparator = false
): DuplicateGroup[] {
  const result: DuplicateGroup[] = [];
  for (const [groupKey, items] of groupsMap.entries()) {
    if (items.length >= 2) {
      // Sort items by dateAdded descending (newest first)
      items.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      const firstItem = items[0];
      if (!firstItem) continue;

      result.push({
        normalizedUrl: groupKey,
        displayUrl: firstItem.url,
        domain: firstItem.domain,
        items,
        isSeparator,
      });
    }
  }
  return result.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Find duplicate bookmark groups AND separate folder separator/divider bookmarks.
 */
export function findDuplicatesWithSeparators(
  treeOrFlats: BookmarkTreeNode[] | FlatBookmark[],
  options: { scope?: DuplicateScope } = {}
): DuplicateScanResult {
  const scope = options.scope ?? 'library';
  const bookmarks = resolveFlatBookmarks(treeOrFlats);
  const regularMap = new Map<string, FlatBookmark[]>();
  const separatorMap = new Map<string, FlatBookmark[]>();

  for (const b of bookmarks) {
    if (!b.url || b.url.startsWith('chrome://')) continue;
    const norm = normalizeUrl(b.url);
    const key = scope === 'folder' ? `${b.parentId || b.path}::${norm}` : norm;
    const targetMap = isBookmarkSeparator(b) ? separatorMap : regularMap;
    const existing = targetMap.get(key) || [];
    existing.push(b);
    targetMap.set(key, existing);
  }

  return {
    duplicates: buildDuplicateGroupsFromMap(regularMap, false),
    separators: buildDuplicateGroupsFromMap(separatorMap, true),
  };
}

/**
 * Find duplicate bookmark groups (excluding bookmark separators/dividers).
 */
export function findDuplicates(
  treeOrFlats: BookmarkTreeNode[] | FlatBookmark[],
  options: { scope?: DuplicateScope } = {}
): DuplicateGroup[] {
  return findDuplicatesWithSeparators(treeOrFlats, options).duplicates;
}

/**
 * Detect empty folders in the bookmark tree (excluding protected roots)
 */
export function findEmptyFolders(tree: BookmarkTreeNode[]): EmptyFolder[] {
  const PROTECTED_ROOTS = new Set(['0', '1', '2', '3']);
  const emptyFolders: EmptyFolder[] = [];

  function checkFolder(node: BookmarkTreeNode, parentPath = ''): boolean {
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
 * Performs the actual HTTP HEAD (with GET fallback) health check in the current context.
 */
export async function checkUrlDirect(
  url: string,
  timeoutMs = 6000,
  signal?: AbortSignal
): Promise<{
  status: 'healthy' | 'broken' | 'protected';
  statusCode?: number;
  error?: string;
  finalUrl?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

  try {
    let res: Response | null = null;
    try {
      const headRes = await fetch(url, {
        method: 'HEAD',
        signal: combinedSignal,
        redirect: 'follow',
      });
      // Many servers return 400/403/405/501 for HEAD while allowing normal GET
      if (
        headRes.status !== 400 &&
        headRes.status !== 403 &&
        headRes.status !== 405 &&
        headRes.status !== 501
      ) {
        res = headRes;
      }
    } catch (headErr: any) {
      if (combinedSignal.aborted) throw headErr;
    }

    if (!res) {
      res = await fetch(url, {
        method: 'GET',
        signal: combinedSignal,
        redirect: 'follow',
        headers: {
          Range: 'bytes=0-1024',
        },
      });
    }

    clearTimeout(timeoutId);

    const code = res.status;
    const finalUrl = res.url || url;
    if (code >= 200 && code < 400) {
      return { status: 'healthy', statusCode: code, finalUrl };
    }
    if (code === 401 || code === 403) {
      // Protected/Authentication required (e.g. private dashboard, Google Docs) - NOT a dead link!
      return { status: 'protected', statusCode: code, finalUrl };
    }
    if (code === 404 || code === 410) {
      return { status: 'broken', statusCode: code, error: `HTTP ${code} Not Found`, finalUrl };
    }
    if (code >= 500) {
      return { status: 'broken', statusCode: code, error: `HTTP ${code} Server Error`, finalUrl };
    }

    return { status: 'healthy', statusCode: code, finalUrl };
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
 * Test a single URL's HTTP reachability, preferring background service-worker fetch
 * so granted optional host permissions bypass sidepanel CORS restrictions.
 */
export async function testUrlHealth(
  url: string,
  timeoutMs = 6000,
  signal?: AbortSignal
): Promise<{
  status: 'healthy' | 'broken' | 'protected';
  statusCode?: number;
  error?: string;
  finalUrl?: string;
}> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'CHECK_URL_HEALTH',
        payload: { url, timeoutMs },
      })) as
        | {
            ok: true;
            result: {
              status: 'healthy' | 'broken' | 'protected';
              statusCode?: number;
              error?: string;
              finalUrl?: string;
            };
          }
        | { ok: false }
        | undefined;
      if (response && response.ok) {
        return response.result;
      }
    } catch {
      // Fall back to direct fetch if background messaging isn't available
    }
  }

  return checkUrlDirect(url, timeoutMs, signal);
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
 * Batch resolve duplicate group: keep a specific item ID (or newest/oldest) and trash the others
 */
export async function resolveDuplicateGroup(
  group: DuplicateGroup,
  keepModeOrId: 'newest' | 'oldest' | { keepId: string } = 'newest'
): Promise<number> {
  const items = [...group.items];
  items.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));

  let toKeep: FlatBookmark | undefined;
  if (typeof keepModeOrId === 'object' && keepModeOrId.keepId) {
    toKeep = items.find((b) => b.id === keepModeOrId.keepId);
  }
  if (!toKeep) {
    toKeep = keepModeOrId === 'oldest' ? items[items.length - 1] : pickDefaultKeepBookmark(items);
  }
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
      await browser.bookmarks.remove(item.id);
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
    await browser.bookmarks.remove(folder.id);
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
    await browser.bookmarks.remove(bookmark.id);
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
      await browser.bookmarks.remove(b.id);
      count++;
      onProgress?.(count, bookmarks.length);
    } catch (err) {
      console.warn(`Failed to remove bookmark ${b.id}:`, err);
    }
  }

  return count;
}

const IDENTITY_QUERY_KEYS = new Set([
  'v',
  'video',
  'vid',
  'list',
  'playlist',
  'watch',
  'q',
  'query',
  'search',
  'search_query',
  'k',
  'keywords',
  'field-keywords',
  'text',
  'wd',
  'p',
  'id',
  'item',
  'item_id',
  'post',
  'post_id',
  'page_id',
  'article',
  'story',
  'topic',
  'thread',
  'doc',
  'docid',
  'document',
  'slug',
  'sku',
  'asin',
  'pid',
  'product',
  'product_id',
  'channel',
  'user',
  'username',
  'u',
  'url',
  'target',
  'dest',
  'course',
  'lesson',
  'module',
  'section',
  'issue',
  'pr',
  'commit',
  'ticket',
  'code',
  'i',
  'cat',
  'category',
  'tag',
  'tab',
  'name',
  'type',
  'file',
  'path',
  'page',
]);

const SPA_HASH_HOSTS = new Set([
  'mail.google.com',
  'calendar.google.com',
  'drive.google.com',
  'docs.google.com',
  'keep.google.com',
  'contacts.google.com',
  'photos.google.com',
  'app.slack.com',
  'discord.com',
  'figma.com',
  'notion.so',
  'trello.com',
  'linear.app',
  'airtable.com',
  'web.whatsapp.com',
  'web.telegram.org',
]);

function isSpaRouteHash(hostname: string, hash: string): boolean {
  if (!hash || hash === '#' || hash.toLowerCase() === '#top') return false;
  if (SPA_HASH_HOSTS.has(hostname)) return true;
  if (hash.startsWith('#/') || hash.startsWith('#!') || hash.includes('/') || hash.includes('=')) {
    return true;
  }
  return /^#(inbox|sent|drafts|trash|spam|starred|all|settings|compose|label|category|search)\b/i.test(
    hash
  );
}

/**
 * Find similar bookmarks grouped by their common canonical base URL
 * (preserving identity query params such as YouTube watch?v= / Google search?q= and SPA hashes like Gmail #inbox/...).
 * Bookmarks already belonging to Duplicate groups or visual separators are automatically excluded.
 */
export function findSimilarBookmarks(
  treeOrFlats: BookmarkTreeNode[] | FlatBookmark[],
  excludeDuplicateIds?: Set<string>
): SimilarGroup[] {
  const bookmarks = resolveFlatBookmarks(treeOrFlats);
  const autoExcludeIds =
    excludeDuplicateIds ??
    new Set(findDuplicates(bookmarks).flatMap((g) => g.items.map((item) => item.id)));
  const baseMap = new Map<string, FlatBookmark[]>();

  for (const b of bookmarks) {
    if (!b.url || b.url.startsWith('chrome://')) continue;
    if (isBookmarkSeparator(b)) continue;
    if (autoExcludeIds.has(b.id)) continue;

    try {
      const parsed = new URL(b.url);
      const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      let pathname = parsed.pathname;
      if (pathname.length > 1 && pathname.endsWith('/')) {
        pathname = pathname.slice(0, -1);
      }

      const isTwitterHost = hostname.includes('twitter.') || hostname === 'x.com';
      const identityParams: [string, string][] = [];
      parsed.searchParams.forEach((val, key) => {
        const lowerKey = key.toLowerCase();
        if (TRACKING_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) return;
        const isIdentity =
          IDENTITY_QUERY_KEYS.has(lowerKey) || (lowerKey === 's' && !isTwitterHost);
        if (isIdentity) {
          identityParams.push([lowerKey, val]);
        }
      });
      identityParams.sort((a, b) => a[0].localeCompare(b[0]));

      const identityQuery =
        identityParams.length > 0
          ? '?' + identityParams.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
          : '';

      const spaHash = isSpaRouteHash(hostname, parsed.hash) ? parsed.hash : '';
      const baseUrl = `${parsed.protocol}//${hostname}${pathname}${identityQuery}${spaHash}`;

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
      items.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
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
  treeOrFlats: BookmarkTreeNode[] | FlatBookmark[],
  options: TrackingCleanOptions = { includeSiteSpecific: true, includeAffiliate: false }
): TrackingCleanItem[] {
  const bookmarks = resolveFlatBookmarks(treeOrFlats);
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

      if (parsed.hash) {
        segments.push({ text: parsed.hash, isRemoved: false });
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
    await browser.bookmarks.update(bookmarkId, { url: cleanUrl });
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
      await browser.bookmarks.update(item.id, { url: item.cleanUrl });
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
  treeOrFlats: BookmarkTreeNode[] | FlatBookmark[]
): FlatBookmark[] {
  const bookmarks = resolveFlatBookmarks(treeOrFlats);
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
    await browser.bookmarks.update(bookmarkId, { url: httpsUrl });
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
      await browser.bookmarks.update(item.id, { url: httpsUrl });
      count++;
      onProgress?.(count, items.length);
    } catch (err) {
      console.warn(`Failed to upgrade bookmark ${item.id} to HTTPS:`, err);
    }
  }
  return count;
}

/**
 * Restore original URLs for a list of bookmarks (used by 1-click Undo on URL clean / HTTPS upgrade)
 */
export async function restoreBookmarkUrls(
  items: { id: string; originalUrl: string }[]
): Promise<number> {
  let count = 0;
  for (const item of items) {
    try {
      await browser.bookmarks.update(item.id, { url: item.originalUrl });
      count++;
    } catch (err) {
      console.warn(`Failed to restore URL for bookmark ${item.id}:`, err);
    }
  }
  return count;
}

function normalizeHostForRedirectCheck(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isSameSiteDomain(origUrl: string, finalUrl?: string): boolean {
  if (!finalUrl) return true;
  const origHost = normalizeHostForRedirectCheck(origUrl);
  const finalHost = normalizeHostForRedirectCheck(finalUrl);
  if (!origHost || !finalHost) return true;
  return (
    origHost === finalHost ||
    finalHost.endsWith(`.${origHost}`) ||
    origHost.endsWith(`.${finalHost}`)
  );
}

/**
 * Verifies whether the HTTPS version of each HTTP bookmark works on the same domain,
 * redirects to another domain, is unsupported over HTTPS (HTTP works), or is dead (moves to 404 tab).
 */
export async function verifyHttpsSupportBatch(
  bookmarks: FlatBookmark[],
  onProgress?: (checked: number, total: number, id: string, info: HttpsVerifyInfo) => void,
  signal?: AbortSignal,
  concurrency = 8
): Promise<Map<string, HttpsVerifyInfo>> {
  const results = new Map<string, HttpsVerifyInfo>();
  let index = 0;
  let completed = 0;
  const total = bookmarks.length;

  async function verifySingle(item: FlatBookmark): Promise<HttpsVerifyInfo> {
    const httpsUrl = item.url.replace(/^http:\/\//i, 'https://');
    const httpsRes = await testUrlHealth(httpsUrl, 5000, signal);

    if (httpsRes.status === 'healthy' || httpsRes.status === 'protected') {
      if (httpsRes.finalUrl && !isSameSiteDomain(item.url, httpsRes.finalUrl)) {
        return {
          status: 'redirect',
          finalUrl: httpsRes.finalUrl,
          redirectDomain: normalizeHostForRedirectCheck(httpsRes.finalUrl),
          statusCode: httpsRes.statusCode,
        };
      }
      return {
        status: 'supported',
        finalUrl: httpsRes.finalUrl,
        statusCode: httpsRes.statusCode,
      };
    }

    // HTTPS failed or returned 4xx/5xx; test original http:// URL to distinguish HTTP-only vs dead link
    const httpRes = await testUrlHealth(item.url, 4500, signal);
    if (httpRes.status === 'healthy' || httpRes.status === 'protected') {
      if (httpRes.finalUrl && !isSameSiteDomain(item.url, httpRes.finalUrl)) {
        return {
          status: 'redirect',
          finalUrl: httpRes.finalUrl,
          redirectDomain: normalizeHostForRedirectCheck(httpRes.finalUrl),
          statusCode: httpRes.statusCode,
        };
      }
      return {
        status: 'unsupported',
        statusCode: httpsRes.statusCode,
        error: httpsRes.error,
      };
    }

    return {
      status: 'dead',
      statusCode: httpRes.statusCode ?? httpsRes.statusCode,
      error: httpRes.error ?? httpsRes.error,
      finalUrl: httpRes.finalUrl ?? httpsRes.finalUrl,
    };
  }

  async function worker() {
    while (index < total) {
      if (signal?.aborted) break;
      const currentIndex = index++;
      const item = bookmarks[currentIndex];
      if (!item) continue;

      try {
        const info = await verifySingle(item);
        results.set(item.id, info);
        completed++;
        onProgress?.(completed, total, item.id, info);
      } catch {
        if (signal?.aborted) break;
        const fallbackInfo: HttpsVerifyInfo = { status: 'unverified' };
        results.set(item.id, fallbackInfo);
        completed++;
        onProgress?.(completed, total, item.id, fallbackInfo);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return results;
}
