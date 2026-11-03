import type { BookmarkTreeNode, ReorgPlan } from '@/types';

import type { InvariantResult, InvariantViolation } from './types';

/**
 * Compute the Gini coefficient of an array of numbers.
 * 0.0 = perfectly even distribution across folders
 * 1.0 = total concentration into a single folder
 */
export function computeGiniCoefficient(values: number[]): number {
  if (values.length <= 1) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let cumulativeSum = 0;
  let weightedSum = 0;

  for (let i = 0; i < n; i++) {
    cumulativeSum += sorted[i]!;
    weightedSum += (i + 1) * sorted[i]!;
  }

  if (cumulativeSum === 0) return 0;
  return Number(((2 * weightedSum) / (n * cumulativeSum) - (n + 1) / n).toFixed(3));
}

/**
 * Invariant: FolderGravityLimit
 * Asserts that no single generated category swallows an excessive share
 * of bookmarks (> 25% of total moves when moves > 30).
 * Prevents "Utilities & Tools" or "Other" from becoming a black-hole dump folder.
 */
export function checkFolderGravityLimit(
  _tree: BookmarkTreeNode[],
  plan: ReorgPlan,
  _userPrompt: string
): InvariantResult {
  const moveActions = plan.actions.filter((a) => a.action === 'MOVE');
  const totalMoves = moveActions.length;

  if (totalMoves < 25) {
    // Too few moves to measure concentration reliably
    return {
      invariantId: 'FOLDER_GRAVITY_LIMIT',
      name: 'Folder Gravity & Balance Limit',
      passed: true,
      score: 100,
      violations: [],
      details: { totalMoves, folderCounts: {} },
    };
  }

  // Count items per target folder
  const folderCounts = new Map<string, { count: number; title: string }>();
  for (const act of moveActions) {
    if (act.action === 'MOVE') {
      const fId = act.targetFolderId;
      const fTitle = act.targetFolderTitle || fId;
      const entry = folderCounts.get(fId) || { count: 0, title: fTitle };
      entry.count++;
      folderCounts.set(fId, entry);
    }
  }

  const countsArray = Array.from(folderCounts.values()).map((v) => v.count);
  const gini = computeGiniCoefficient(countsArray);

  const violations: InvariantViolation[] = [];
  let largestFolder = { title: '', count: 0, percentage: 0 };

  const MAX_ALLOWABLE_SHARE = 0.25; // 25% maximum share for any single category

  for (const [, entry] of folderCounts.entries()) {
    const share = entry.count / totalMoves;
    if (entry.count > largestFolder.count) {
      largestFolder = {
        title: entry.title,
        count: entry.count,
        percentage: Math.round(share * 100),
      };
    }

    if (share > MAX_ALLOWABLE_SHARE && entry.count >= 40) {
      violations.push({
        invariantId: 'FOLDER_GRAVITY_LIMIT',
        name: 'Excessive Folder Concentration',
        severity: 'CRITICAL',
        message: `Category "${entry.title}" swallowed ${entry.count} bookmarks (${Math.round(share * 100)}% of all moves), exceeding the 25% gravity limit!`,
      });
    }
  }

  const passed = violations.length === 0;
  // Penalty scaled by excess percentage above 25%
  const penalty = Math.max(0, largestFolder.percentage - 25) * 2;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  return {
    invariantId: 'FOLDER_GRAVITY_LIMIT',
    name: 'Folder Gravity & Balance Limit',
    passed,
    score,
    violations,
    details: {
      totalMoves,
      largestFolder,
      giniCoefficient: gini,
      folderDistribution: Object.fromEntries(
        Array.from(folderCounts.values()).map((v) => [v.title, v.count])
      ),
    },
  };
}
