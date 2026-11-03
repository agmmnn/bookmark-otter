import { getAllFolders } from '@/services/bookmarks';
import type { BookmarkTreeNode, ReorgPlan } from '@/types';

import type { InvariantResult, InvariantViolation } from './types';

/**
 * Invariant: SacredFolderPreservation
 * Asserts that personal emoji folders or curated top-level folders on Bookmarks Bar
 * (e.g. "🏠", "🤖", "👨‍🍳", "B") are not destroyed or deleted by bulk organization.
 */
export function checkSacredFolderPreservation(
  tree: BookmarkTreeNode[],
  plan: ReorgPlan,
  _userPrompt: string
): InvariantResult {
  const folders = getAllFolders(tree);
  // Top-level folders directly under Bookmarks Bar ('1') with 1-3 chars or emojis
  const barFolders = folders.filter((f) => f.parentId === '1');
  const sacredFolders = barFolders.filter((f) => {
    const t = f.title.trim();
    // 1-3 chars (emoji, single letter like "B")
    return t.length <= 4 && !/^(tmp|temp|misc|dump)/i.test(t);
  });

  if (sacredFolders.length === 0) {
    return {
      invariantId: 'SACRED_FOLDER_PRESERVATION',
      name: 'Sacred Emoji Folder Preservation',
      passed: true,
      score: 100,
      violations: [],
      details: { sacredFolderCount: 0 },
    };
  }

  const removedFolderIds = new Set(
    plan.actions.filter((a) => a.action === 'REMOVE' && a.isFolder).map((a: any) => a.id)
  );

  const violations: InvariantViolation[] = [];

  for (const sf of sacredFolders) {
    if (removedFolderIds.has(sf.id)) {
      violations.push({
        invariantId: 'SACRED_FOLDER_PRESERVATION',
        name: 'Sacred Folder Deleted',
        severity: 'CRITICAL',
        message: `Personal folder "${sf.title}" on Bookmarks Bar was marked for removal!`,
      });
    }
  }

  const passed = violations.length === 0;
  const score = passed ? 100 : Math.max(0, 100 - violations.length * 35);

  return {
    invariantId: 'SACRED_FOLDER_PRESERVATION',
    name: 'Sacred Emoji Folder Preservation',
    passed,
    score,
    violations,
    details: {
      sacredFolders: sacredFolders.map((f) => f.title),
      preserved: sacredFolders.length - violations.length,
    },
  };
}
