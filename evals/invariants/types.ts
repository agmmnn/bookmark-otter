export interface InvariantViolation {
  invariantId: string;
  name: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  culpritItems?: { id: string; title: string; domain?: string; path?: string }[];
}

export interface InvariantResult {
  invariantId: string;
  name: string;
  passed: boolean;
  score: number; // 0 - 100
  violations: InvariantViolation[];
  details?: Record<string, unknown>;
}

export interface EvalScorecard {
  datasetName: string;
  prompt: string;
  timestamp: number;
  passed: boolean;
  overallScore: number; // 0 - 100
  invariants: InvariantResult[];
  metrics: {
    totalBookmarks: number;
    totalFolders: number;
    plannedMoves: number;
    newFoldersCreated: number;
    foldersRemoved: number;
    maxFolderSize: number;
    maxFolderTitle: string;
    folderBalanceGini: number; // 0.0 (even) to 1.0 (imbalanced)
    pinnedBarPreservedCount: number;
    pinnedBarTotalCount: number;
    durationMs: number;
  };
}
