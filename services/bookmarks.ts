import { browser } from 'wxt/browser';

import type {
  FlatBookmark,
  FlatFolder,
  ReorgAction,
  ReorgPlan,
  TreeSnapshot,
  UndoOperation,
  BookmarkTreeNode,
} from '@/types';

import { saveSnapshot } from './storage';
import { addToTrash } from './trash';

/**
 * Fetch the complete bookmark tree from Browser API (cross-browser WebExtensions)
 */
export async function getBookmarkTree(): Promise<BookmarkTreeNode[]> {
  if (!browser.bookmarks?.getTree) {
    console.warn('browser.bookmarks API is not supported in this browser (e.g. Safari).');
    return [];
  }
  return await browser.bookmarks.getTree();
}

function extractHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Flatten all bookmarks into a searchable list with folder paths.
 * Single O(N) pass using a mutable accumulator to avoid O(N^2) array concatenations.
 */
export function flattenBookmarks(nodes: BookmarkTreeNode[], currentPath = ''): FlatBookmark[] {
  const result: FlatBookmark[] = [];

  function traverse(items: BookmarkTreeNode[], parentPath: string) {
    for (const node of items) {
      const isFolder = !node.url;
      const path = parentPath
        ? isFolder
          ? `${parentPath} / ${node.title}`
          : parentPath
        : node.title;

      if (node.url) {
        result.push({
          id: node.id,
          parentId: node.parentId || '',
          title: node.title,
          url: node.url,
          path: parentPath || 'Root',
          domain: extractHostname(node.url),
          dateAdded: node.dateAdded,
        });
      }

      if (node.children && node.children.length > 0) {
        traverse(node.children, path);
      }
    }
  }

  traverse(nodes, currentPath);
  return result;
}

/**
 * Get all folders with their full hierarchical paths.
 * Single O(N) pass using a mutable accumulator.
 */
export function getAllFolders(nodes: BookmarkTreeNode[], currentPath = ''): FlatFolder[] {
  const result: FlatFolder[] = [];

  function traverse(items: BookmarkTreeNode[], parentPath: string) {
    for (const node of items) {
      if (!node.url) {
        // It's a folder
        const path = parentPath ? `${parentPath} / ${node.title}` : node.title;
        result.push({
          id: node.id,
          parentId: node.parentId,
          title: node.title,
          path,
        });

        if (node.children && node.children.length > 0) {
          traverse(node.children, path);
        }
      }
    }
  }

  traverse(nodes, currentPath);
  return result;
}

/**
 * Fetch recently added bookmarks with resolved folder paths
 */
export async function getRecentBookmarks(limit = 20): Promise<FlatBookmark[]> {
  if (!browser.bookmarks?.getRecent) {
    return [];
  }
  const [recentNodes, tree] = await Promise.all([
    browser.bookmarks.getRecent(limit),
    getBookmarkTree(),
  ]);
  const folders = getAllFolders(tree);
  const folderMap = new Map<string, string>();
  for (const f of folders) {
    folderMap.set(f.id, f.path);
  }

  return recentNodes
    .filter((n) => n.url && !n.url.startsWith('chrome://'))
    .map((n) => {
      let domain = '';
      try {
        domain = new URL(n.url!).hostname.replace(/^www\./, '');
      } catch {
        domain = '';
      }
      return {
        id: n.id,
        parentId: n.parentId || '',
        title: n.title,
        url: n.url!,
        path: folderMap.get(n.parentId || '') || 'Bookmarks Bar',
        domain,
        dateAdded: n.dateAdded,
      };
    });
}

/**
 * Convert bookmarks and folders into a token-optimized Compact DSL string
 * for LLMs. Reduces token usage by ~85% compared to raw JSON.
 */
export function getCompactTreeDSL(nodes: BookmarkTreeNode[]): string {
  const folders = getAllFolders(nodes);
  const bookmarks = flattenBookmarks(nodes);

  const folderLines = folders
    .filter((f) => f.id !== '0') // Skip root
    .map((f) => `${f.id}|${f.parentId || '0'}|${f.path}`);

  const bookmarkLines = bookmarks.map((b) => {
    const safeTitle = (b.title || 'Untitled').replace(/\|/g, '-').slice(0, 50);
    const safePath = (b.path || 'Bookmarks Bar').replace(/\|/g, '-').slice(0, 40);
    return `${b.id}|${b.parentId}|${safePath}|${safeTitle}|${b.domain}`;
  });

  return [
    '# FOLDERS (id|parentId|path)',
    ...folderLines,
    '',
    '# BOOKMARKS (id|parentId|currentFolder|title|domain)',
    ...bookmarkLines,
  ].join('\n');
}

/**
 * Execute an AI Action Plan with tmpId dependency resolution and snapshot creation
 */
export async function executePlan(
  plan: ReorgPlan,
  activeActions?: ReorgAction[]
): Promise<{ success: boolean; appliedCount: number; snapshotId: string }> {
  const tree = await getBookmarkTree();
  const actionsToRun = activeActions || plan.actions;
  const tmpIdMap = new Map<string, string>(); // tmpId -> real Chrome ID
  const inverseOps: UndoOperation[] = [];
  let appliedCount = 0;

  // Protected root IDs in Chrome
  const PROTECTED_IDS = new Set(['0', '1', '2']);

  // Phase 1: CREATE_FOLDER actions
  for (const act of actionsToRun) {
    if (act.action === 'CREATE_FOLDER') {
      const parentId = tmpIdMap.get(act.parentId) || act.parentId || '1'; // Default to Bookmarks Bar ('1')
      try {
        const created = await browser.bookmarks.create({
          parentId,
          title: act.title,
        });
        tmpIdMap.set(act.tmpId, created.id);
        inverseOps.push({
          type: 'CREATE_FOLDER',
          createdFolderId: created.id,
        });
        appliedCount++;
      } catch (err) {
        console.error(`Failed to create folder ${act.title}:`, err);
      }
    }
  }

  // Phase 2: MOVE actions (Record original parentId and index BEFORE moving!)
  for (const act of actionsToRun) {
    if (act.action === 'MOVE') {
      if (PROTECTED_IDS.has(act.bookmarkId)) continue;
      const targetParentId = tmpIdMap.get(act.targetFolderId) || act.targetFolderId;
      try {
        const [orig] = await browser.bookmarks.get(act.bookmarkId);
        if (orig && orig.parentId) {
          inverseOps.push({
            type: 'MOVE',
            bookmarkId: act.bookmarkId,
            originalParentId: orig.parentId,
            originalIndex: orig.index,
          });
        }
        await browser.bookmarks.move(act.bookmarkId, { parentId: targetParentId });
        appliedCount++;
      } catch (err) {
        console.error(`Failed to move bookmark ${act.bookmarkId}:`, err);
      }
    }
  }

  // Phase 3: RENAME actions (Record original title BEFORE renaming!)
  for (const act of actionsToRun) {
    if (act.action === 'RENAME') {
      if (PROTECTED_IDS.has(act.id)) continue;
      try {
        const [orig] = await browser.bookmarks.get(act.id);
        if (orig) {
          inverseOps.push({
            type: 'RENAME',
            id: act.id,
            originalTitle: orig.title,
          });
        }
        await browser.bookmarks.update(act.id, { title: act.newTitle });
        appliedCount++;
      } catch (err) {
        console.error(`Failed to rename bookmark ${act.id}:`, err);
      }
    }
  }

  // Phase 4: REMOVE actions
  for (const act of actionsToRun) {
    if (act.action === 'REMOVE') {
      if (PROTECTED_IDS.has(act.id)) continue;
      try {
        const [orig] = await browser.bookmarks.get(act.id);
        if (orig && orig.parentId) {
          inverseOps.push({
            type: 'REMOVE',
            restoredNode: {
              parentId: orig.parentId,
              title: orig.title,
              url: orig.url,
              index: orig.index,
            },
          });
        }
        await addToTrash({
          originalId: act.id,
          title: act.title || 'Removed Bookmark',
          isFolder: act.isFolder ?? false,
          parentId: '1',
          parentPath: 'AI Plan',
        });
        if (act.isFolder) {
          await browser.bookmarks.removeTree(act.id);
        } else {
          await browser.bookmarks.remove(act.id);
        }
        appliedCount++;
      } catch (err) {
        console.error(`Failed to remove bookmark ${act.id}:`, err);
      }
    }
  }

  // 1. Save snapshot with atomic inverse operations (FAVICON-SAFE!)
  const snapshotId = await saveSnapshot(plan.summary || 'AI Reorganization', tree, inverseOps);

  return { success: true, appliedCount, snapshotId };
}

/**
 * Restore bookmark tree from a snapshot (Favicon-Safe Undo mechanism)
 * Uses atomic inverse operations so Chrome NEVER wipes or clears favicons!
 */
export async function restoreSnapshot(snapshot: TreeSnapshot): Promise<boolean> {
  // 1. Primary: Atomic Inverse Operations
  // This does NOT delete/recreate bookmarks, so Chrome NEVER loses favicons!
  if (snapshot.inverseOperations && snapshot.inverseOperations.length > 0) {
    try {
      const ops = [...snapshot.inverseOperations].reverse();
      for (const op of ops) {
        try {
          if (op.type === 'MOVE') {
            await browser.bookmarks.move(op.bookmarkId, {
              parentId: op.originalParentId,
              index: op.originalIndex,
            });
          } else if (op.type === 'RENAME') {
            await browser.bookmarks.update(op.id, {
              title: op.originalTitle,
            });
          } else if (op.type === 'CREATE_FOLDER') {
            await browser.bookmarks.remove(op.createdFolderId);
          } else if (op.type === 'REMOVE') {
            if (op.restoredNode.url) {
              await browser.bookmarks.create({
                parentId: op.restoredNode.parentId,
                title: op.restoredNode.title,
                url: op.restoredNode.url,
                index: op.restoredNode.index,
              });
            }
          }
        } catch (opErr) {
          console.warn('Failed executing inverse operation during undo:', op, opErr);
        }
      }
      return true;
    } catch (err) {
      console.error('Error during inverse operation undo:', err);
      return false;
    }
  }

  return false;
}
