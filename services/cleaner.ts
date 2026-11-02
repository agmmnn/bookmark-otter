import type { BrokenLinkResult, DuplicateGroup, EmptyFolder, FlatBookmark } from '@/types';

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
