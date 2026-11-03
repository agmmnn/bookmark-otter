import { getAllFolders } from '@/services/bookmarks';
import type { BookmarkTreeNode, ReorgPlan } from '@/types';

import type { InvariantResult, InvariantViolation } from './types';

/**
 * Invariant: PreservedFolderProtection (SacredFolderPreservation)
 * Asserts that curated folders (such as specialized collections or folders marked to be preserved)
 * are NOT deleted or destroyed during bulk reorganization.
 * Generic catch-all dump folders (which were fully evacuated and dismantled) are permitted.
 */
export function checkSacredFolderPreservation(
  tree: BookmarkTreeNode[],
  plan: ReorgPlan,
  _userPrompt: string
): InvariantResult {
  const folders = getAllFolders(tree);

  // Extract blueprint preservedFolderIds if available
  let preservedFolderIds = new Set<string>();
  try {
    if (plan.rawJson) {
      const parsed = JSON.parse(plan.rawJson);
      if (parsed.blueprint?.preservedFolderIds) {
        preservedFolderIds = new Set(parsed.blueprint.preservedFolderIds);
      }
    }
  } catch {}

  const removedFolderIds = new Set(
    plan.actions.filter((a) => a.action === 'REMOVE' && a.isFolder).map((a: any) => a.id)
  );

  const violations: InvariantViolation[] = [];

  // Check 1: Any folder designated as preserved must NEVER be in removedFolderIds
  for (const pId of preservedFolderIds) {
    if (removedFolderIds.has(pId)) {
      const f = folders.find((item) => item.id === pId);
      violations.push({
        invariantId: 'SACRED_FOLDER_PRESERVATION',
        name: 'Preserved Folder Deleted',
        severity: 'CRITICAL',
        message: `Designated preserved folder "${f?.title || pId}" was marked for removal!`,
      });
    }
  }

  // Check 2: Top-level folders on Bookmarks Bar containing subfolders (curated tree hierarchy) must not be destroyed
  const barFolders = folders.filter((f) => f.parentId === '1');
  for (const bf of barFolders) {
    if (removedFolderIds.has(bf.id)) {
      const hasSubfolders = folders.some((cf) => cf.parentId === bf.id);
      if (hasSubfolders) {
        violations.push({
          invariantId: 'SACRED_FOLDER_PRESERVATION',
          name: 'Top-Level Hierarchy Deleted',
          severity: 'CRITICAL',
          message: `Top-level folder "${bf.title}" containing subfolders was marked for removal!`,
        });
      }
    }
  }

  const passed = violations.length === 0;
  const score = passed ? 100 : Math.max(0, 100 - violations.length * 35);

  return {
    invariantId: 'SACRED_FOLDER_PRESERVATION',
    name: 'Preserved & Curated Folder Integrity',
    passed,
    score,
    violations,
    details: {
      preservedFolderCount: preservedFolderIds.size,
      removedFolderCount: removedFolderIds.size,
    },
  };
}
