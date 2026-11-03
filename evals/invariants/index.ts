import { flattenBookmarks, getAllFolders } from '@/services/bookmarks';
import type { BookmarkTreeNode, ReorgPlan } from '@/types';

import { checkEmptyDumpEvacuation } from './emptyDumpEvacuation';
import { checkFolderGravityLimit, computeGiniCoefficient } from './folderGravityLimit';
import { checkPinnedRootShield } from './pinnedRootShield';
import { checkSacredFolderPreservation } from './sacredFolderPreservation';
import type { EvalScorecard, InvariantResult } from './types';

export * from './types';

export function evaluateReorgPlan(params: {
  datasetName: string;
  userPrompt: string;
  tree: BookmarkTreeNode[];
  plan: ReorgPlan;
  durationMs: number;
}): EvalScorecard {
  const { datasetName, userPrompt, tree, plan, durationMs } = params;

  const bookmarks = flattenBookmarks(tree);
  const folders = getAllFolders(tree);

  // Run all invariants
  const invariants: InvariantResult[] = [
    checkPinnedRootShield(tree, plan, userPrompt),
    checkFolderGravityLimit(tree, plan, userPrompt),
    checkEmptyDumpEvacuation(tree, plan, userPrompt),
    checkSacredFolderPreservation(tree, plan, userPrompt),
  ];

  const allPassed = invariants.every((inv) => inv.passed);

  // Compute metrics
  const moveActions = plan.actions.filter((a) => a.action === 'MOVE');
  const createFolderActions = plan.actions.filter((a) => a.action === 'CREATE_FOLDER');
  const removeFolderActions = plan.actions.filter((a) => a.action === 'REMOVE' && a.isFolder);

  // Folder size distribution
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

  let maxFolderSize = 0;
  let maxFolderTitle = 'N/A';
  for (const entry of folderCounts.values()) {
    if (entry.count > maxFolderSize) {
      maxFolderSize = entry.count;
      maxFolderTitle = entry.title;
    }
  }

  const countsArray = Array.from(folderCounts.values()).map((v) => v.count);
  const folderBalanceGini = computeGiniCoefficient(countsArray);

  // Pinned bar stats
  const pinnedResult = invariants.find((i) => i.invariantId === 'PINNED_ROOT_SHIELD');
  const pinnedBarTotalCount = (pinnedResult?.details?.totalPinned as number) || 0;
  const pinnedBarPreservedCount = (pinnedResult?.details?.preservedCount as number) || 0;

  // Weighted overall score
  const weights: Record<string, number> = {
    PINNED_ROOT_SHIELD: 0.35,
    FOLDER_GRAVITY_LIMIT: 0.35,
    EMPTY_DUMP_EVACUATION: 0.15,
    SACRED_FOLDER_PRESERVATION: 0.15,
  };

  let weightedSum = 0;
  for (const inv of invariants) {
    const w = weights[inv.invariantId] || 0.25;
    weightedSum += inv.score * w;
  }
  const overallScore = Math.round(weightedSum);

  return {
    datasetName,
    prompt: userPrompt,
    timestamp: Date.now(),
    passed: allPassed,
    overallScore,
    invariants,
    metrics: {
      totalBookmarks: bookmarks.length,
      totalFolders: folders.length,
      plannedMoves: moveActions.length,
      newFoldersCreated: createFolderActions.length,
      foldersRemoved: removeFolderActions.length,
      maxFolderSize,
      maxFolderTitle,
      folderBalanceGini,
      pinnedBarPreservedCount,
      pinnedBarTotalCount,
      durationMs,
    },
  };
}
