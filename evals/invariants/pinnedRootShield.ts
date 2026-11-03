import { flattenBookmarks } from '@/services/bookmarks';
import type { BookmarkTreeNode, ReorgPlan } from '@/types';

import type { InvariantResult, InvariantViolation } from './types';

/**
 * Invariant: PinnedRootShield
 * Root bookmarks directly on the Bookmarks Bar that serve as intentional visual
 * 1-click launchpad pins (empty title, favicon-only, or browser utilities) must NOT be moved
 * into folders during automated bulk reorganization.
 */
export function checkPinnedRootShield(
  tree: BookmarkTreeNode[],
  plan: ReorgPlan,
  _userPrompt: string
): InvariantResult {
  const allBookmarks = flattenBookmarks(tree);
  const rootBarBookmarks = allBookmarks.filter((b) => b.parentId === '1');

  // Identify intentional icon-only launchpad bookmarks (empty or ultra-short title, or browser tools)
  const pinnedBookmarks = rootBarBookmarks.filter((b) => {
    // 1. Icon-only bookmark (empty title or whitespace)
    if (!b.title || b.title.trim().length <= 1) return true;
    // 2. Extension or browser pages placed on bar
    if (b.url.startsWith('chrome://') || b.url.startsWith('chrome-extension://')) return true;
    return false;
  });

  const pinnedIds = new Set(pinnedBookmarks.map((b) => b.id));
  const violations: InvariantViolation[] = [];

  // Check if any pinned bookmark was targeted by a MOVE action
  for (const act of plan.actions) {
    if (act.action === 'MOVE' && pinnedIds.has(act.bookmarkId)) {
      const b = pinnedBookmarks.find((p) => p.id === act.bookmarkId);
      violations.push({
        invariantId: 'PINNED_ROOT_SHIELD',
        name: 'Pinned Root Shield Violation',
        severity: 'CRITICAL',
        message: `Pinned bar launchpad bookmark "${b?.title || b?.domain || b?.id}" was moved to "${act.targetFolderTitle || act.targetFolderId}"`,
        culpritItems: b ? [{ id: b.id, title: b.title, domain: b.domain, path: b.path }] : [],
      });
    }
  }

  const totalPinned = pinnedBookmarks.length;
  const displacedCount = violations.length;
  const preservedCount = totalPinned - displacedCount;

  const score = totalPinned > 0 ? Math.round((preservedCount / totalPinned) * 100) : 100;
  const passed = violations.length === 0;

  return {
    invariantId: 'PINNED_ROOT_SHIELD',
    name: 'Pinned Bar Favicon Shield',
    passed,
    score,
    violations,
    details: {
      totalPinned,
      preservedCount,
      displacedCount,
    },
  };
}
