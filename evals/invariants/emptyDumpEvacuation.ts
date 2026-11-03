import { flattenBookmarks, getAllFolders } from '@/services/bookmarks';
import type { BookmarkTreeNode, ReorgPlan } from '@/types';

import type { InvariantResult, InvariantViolation } from './types';

/**
 * Invariant: EmptyDumpEvacuation
 * Asserts two critical folder lifecycle invariants without any hardcoded language regexes:
 * 1. Safe Dismantling: Any folder marked for REMOVE must have all its bookmarks evacuated
 *    (prevents catastrophic data loss).
 * 2. Empty Shell Sweeping: Any nested subfolder emptied by moves must be marked for REMOVE
 *    (prevents zombie empty folders from cluttering the browser).
 */
export function checkEmptyDumpEvacuation(
  tree: BookmarkTreeNode[],
  plan: ReorgPlan,
  _userPrompt: string
): InvariantResult {
  const folders = getAllFolders(tree);
  const bookmarks = flattenBookmarks(tree);

  const movedBookmarkIds = new Set(
    plan.actions.filter((a) => a.action === 'MOVE').map((a: any) => a.bookmarkId)
  );
  const removedFolderIds = new Set(
    plan.actions.filter((a) => a.action === 'REMOVE' && a.isFolder).map((a: any) => a.id)
  );

  const violations: InvariantViolation[] = [];

  // 1. SAFE DISMANTLING CHECK:
  // If a folder is marked for REMOVE, verify that ALL of its bookmarks are moved away
  for (const removedFolderId of removedFolderIds) {
    const originalFolder = folders.find((f) => f.id === removedFolderId);
    const bookmarksInFolder = bookmarks.filter((b) => b.parentId === removedFolderId);

    const unevacuated = bookmarksInFolder.filter((b) => !movedBookmarkIds.has(b.id));
    if (unevacuated.length > 0) {
      violations.push({
        invariantId: 'EMPTY_DUMP_EVACUATION',
        name: 'Unsafe Folder Dismantling',
        severity: 'CRITICAL',
        message: `Folder "${originalFolder?.path || removedFolderId}" marked for removal still contains ${unevacuated.length} unevacuated bookmark(s)!`,
      });
    }
  }

  // 2. EMPTY SHELL CLEANUP CHECK:
  // Calculate remaining bookmarks per folder after all planned moves
  const folderBookmarkCounts = new Map<string, number>();
  for (const b of bookmarks) {
    folderBookmarkCounts.set(b.parentId, (folderBookmarkCounts.get(b.parentId) || 0) + 1);
  }

  for (const act of plan.actions) {
    if (act.action === 'MOVE') {
      const orig = bookmarks.find((b) => b.id === (act as any).bookmarkId);
      if (orig && orig.parentId) {
        const count = folderBookmarkCounts.get(orig.parentId) || 1;
        folderBookmarkCounts.set(orig.parentId, Math.max(0, count - 1));
      }
    }
  }

  // Check nested subfolders that became completely empty (excluding root bar folders)
  const emptiedNestedFolders = folders.filter((f) => {
    // Only check subfolders (not root '0', '1', '2' and not direct Bookmarks Bar folders)
    if (f.id === '0' || f.id === '1' || f.id === '2' || f.parentId === '1') return false;

    const remainingCount = folderBookmarkCounts.get(f.id) || 0;
    const childFolders = folders.filter((cf) => cf.parentId === f.id);
    const hasActiveChildFolders = childFolders.some(
      (cf) => (folderBookmarkCounts.get(cf.id) || 0) > 0 || !removedFolderIds.has(cf.id)
    );

    return remainingCount === 0 && !hasActiveChildFolders;
  });

  let unsweptCount = 0;
  for (const ef of emptiedNestedFolders) {
    if (!removedFolderIds.has(ef.id)) {
      unsweptCount++;
    }
  }

  if (unsweptCount > 0) {
    violations.push({
      invariantId: 'EMPTY_DUMP_EVACUATION',
      name: 'Unswept Empty Shell Folders',
      severity: 'WARNING',
      message: `${unsweptCount} nested subfolder(s) were emptied by moves but not marked for removal.`,
    });
  }

  const passed = violations.length === 0;
  const criticalViolations = violations.filter((v) => v.severity === 'CRITICAL').length;
  const score = criticalViolations > 0 ? 0 : Math.max(0, 100 - unsweptCount * 10);

  return {
    invariantId: 'EMPTY_DUMP_EVACUATION',
    name: 'Safe Dismantling & Empty Shell Cleanup',
    passed,
    score,
    violations,
    details: {
      removedFolderCount: removedFolderIds.size,
      emptiedNestedFoldersCount: emptiedNestedFolders.length,
      unsweptCount,
    },
  };
}
