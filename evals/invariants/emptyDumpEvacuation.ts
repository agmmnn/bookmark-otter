import { flattenBookmarks, getAllFolders } from '@/services/bookmarks';
import type { BookmarkTreeNode, ReorgPlan } from '@/types';

import type { InvariantResult, InvariantViolation } from './types';

const DUMP_FOLDER_REGEX =
  /^(other|needfix|temp|yeni|misc|çöp|cop|dump|imported|di[gğ]er|bookmarks\s*bar\s*\/\s*imported)/i;

/**
 * Invariant: EmptyDumpEvacuation
 * Asserts that messy temporary and dump folders (e.g. "needfix", "other", "imported")
 * have all their contents evacuated into appropriate categories and the folder is dismantled.
 */
export function checkEmptyDumpEvacuation(
  tree: BookmarkTreeNode[],
  plan: ReorgPlan,
  _userPrompt: string
): InvariantResult {
  const folders = getAllFolders(tree);
  const bookmarks = flattenBookmarks(tree);

  const dumpFolders = folders.filter(
    (f) => f.id !== '0' && f.id !== '1' && f.id !== '2' && DUMP_FOLDER_REGEX.test(f.title.trim())
  );

  if (dumpFolders.length === 0) {
    return {
      invariantId: 'EMPTY_DUMP_EVACUATION',
      name: 'Dump & Clutter Folder Evacuation',
      passed: true,
      score: 100,
      violations: [],
      details: { dumpFolderCount: 0 },
    };
  }

  const dumpFolderIds = new Set(dumpFolders.map((f) => f.id));
  const dumpBookmarks = bookmarks.filter((b) => dumpFolderIds.has(b.parentId));
  const movedBookmarkIds = new Set(
    plan.actions.filter((a) => a.action === 'MOVE').map((a: any) => a.bookmarkId)
  );
  const removedFolderIds = new Set(
    plan.actions.filter((a) => a.action === 'REMOVE' && a.isFolder).map((a: any) => a.id)
  );

  const violations: InvariantViolation[] = [];
  let unevacuatedCount = 0;

  for (const b of dumpBookmarks) {
    if (!movedBookmarkIds.has(b.id)) {
      unevacuatedCount++;
    }
  }

  if (unevacuatedCount > 0) {
    violations.push({
      invariantId: 'EMPTY_DUMP_EVACUATION',
      name: 'Unevacuated Dump Items',
      severity: 'WARNING',
      message: `${unevacuatedCount} of ${dumpBookmarks.length} items in dump folders were not evacuated.`,
    });
  }

  let undismantledFolders = 0;
  for (const df of dumpFolders) {
    if (!removedFolderIds.has(df.id)) {
      undismantledFolders++;
    }
  }

  const evacuationRate =
    dumpBookmarks.length > 0 ? (dumpBookmarks.length - unevacuatedCount) / dumpBookmarks.length : 1;
  const removalRate =
    dumpFolders.length > 0 ? (dumpFolders.length - undismantledFolders) / dumpFolders.length : 1;

  const score = Math.round((evacuationRate * 0.7 + removalRate * 0.3) * 100);
  const passed = violations.length === 0;

  return {
    invariantId: 'EMPTY_DUMP_EVACUATION',
    name: 'Dump & Clutter Folder Evacuation',
    passed,
    score,
    violations,
    details: {
      dumpFolders: dumpFolders.map((f) => f.title),
      totalDumpItems: dumpBookmarks.length,
      evacuatedCount: dumpBookmarks.length - unevacuatedCount,
      undismantledFolders,
    },
  };
}
