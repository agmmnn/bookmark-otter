export type AIProvider = 'google' | 'openai' | 'anthropic' | 'xai' | 'groq' | 'deepseek';

export interface AppSettings {
  aiProvider: AIProvider;
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey?: string;
  xaiApiKey?: string;
  groqApiKey?: string;
  deepseekApiKey?: string;
  modelName: string;
  language: 'en' | 'tr';
}

export interface CompactBookmark {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: CompactBookmark[];
}

export interface FlatBookmark {
  id: string;
  parentId: string;
  title: string;
  url: string;
  path: string;
  domain: string;
  dateAdded?: number;
}

export interface FlatFolder {
  id: string;
  parentId?: string;
  title: string;
  path: string;
}

// Action Plan for AI Reorganization
export type ReorgAction =
  | {
      action: 'CREATE_FOLDER';
      tmpId: string;
      parentId: string;
      title: string;
      reason?: string;
    }
  | {
      action: 'MOVE';
      bookmarkId: string;
      bookmarkTitle?: string;
      targetFolderId: string; // can be a tmpId or real Chrome folder ID
      targetFolderTitle?: string;
      reason?: string;
    }
  | {
      action: 'RENAME';
      id: string;
      oldTitle?: string;
      newTitle: string;
      reason?: string;
    }
  | {
      action: 'REMOVE';
      id: string;
      title?: string;
      isFolder?: boolean;
      reason?: string;
    };

export interface ReorgPlan {
  summary: string;
  actions: ReorgAction[];
  rawDsl?: string;
  rawJson?: string;
}

export type UndoOperation =
  | {
      type: 'MOVE';
      bookmarkId: string;
      originalParentId: string;
      originalIndex?: number;
    }
  | {
      type: 'RENAME';
      id: string;
      originalTitle: string;
    }
  | {
      type: 'CREATE_FOLDER';
      createdFolderId: string;
    }
  | {
      type: 'REMOVE';
      restoredNode: {
        parentId: string;
        title: string;
        url?: string;
        index?: number;
      };
    };

import type { Browser } from 'wxt/browser';

export type BookmarkTreeNode = Browser.bookmarks.BookmarkTreeNode;

export interface TreeSnapshot {
  id: string;
  timestamp: number;
  description: string;
  tree?: BookmarkTreeNode[];
  inverseOperations?: UndoOperation[];
}

export interface PendingSuggestion {
  bookmarkId: string;
  originalTitle: string;
  url: string;
  suggestedTitle: string;
  suggestedFolderId: string;
  suggestedFolderPath: string;
  isNewFolder: boolean;
  newFolderName?: string;
  timestamp: number;
}

// Recycle Bin Item (30-day retention)
export interface TrashItem {
  id: string; // Unique trash id: trash_{timestamp}_{random}
  originalId: string;
  title: string;
  url?: string; // Present for bookmarks, undefined for folders
  isFolder: boolean;
  parentId: string;
  parentPath: string;
  deletedAt: number;
  children?: TrashItem[];
}

// Doctor: Duplicate link group
export interface DuplicateGroup {
  normalizedUrl: string;
  displayUrl: string;
  domain: string;
  items: FlatBookmark[];
}

// Doctor: Similar bookmark group
export interface SimilarGroup {
  id: string;
  baseUrl: string;
  domain: string;
  items: FlatBookmark[];
}

// Doctor: Tracking Parameter Cleaner
export interface TrackingCleanSegment {
  text: string;
  isRemoved: boolean;
  type?: 'universal' | 'site-specific' | 'affiliate';
}

export interface TrackingCleanItem {
  bookmark: FlatBookmark;
  originalUrl: string;
  cleanUrl: string;
  removedParams: string[];
  segments: TrackingCleanSegment[];
}

export interface TrackingCleanOptions {
  includeSiteSpecific: boolean;
  includeAffiliate: boolean;
}

// Doctor: Broken link result
export type LinkHealthStatus = 'healthy' | 'broken' | 'protected';

export interface BrokenLinkResult {
  bookmark: FlatBookmark;
  status: LinkHealthStatus;
  statusCode?: number;
  error?: string;
  checkedAt: number;
}

// Doctor: Empty folder
export interface EmptyFolder {
  id: string;
  parentId?: string;
  title: string;
  path: string;
}

// Insights data summary
export interface InsightsData {
  healthScore: number; // 0-100
  rating: 'excellent' | 'good' | 'warning' | 'critical';
  totalBookmarks: number;
  totalFolders: number;
  uniqueDomains: number;
  httpsCount: number;
  httpCount: number;
  httpsRatio: number; // 0 - 100%
  duplicateCount: number;
  emptyFolderCount: number;
  brokenCount?: number;
  similarCount?: number;
  trackingCount?: number;
  topDomains: { domain: string; count: number; percentage: number }[];
  depthAverage: number;

  // Health Score Deductions / Penalties
  penalties: {
    duplicates: number;
    emptyFolders: number;
    insecureHttp: number;
    brokenLinks: number;
  };

  // Library Facts & Trivia
  oldestBookmark?: {
    title: string;
    url: string;
    dateAdded: number;
    domain: string;
  } | null;
  busiestMonth?: {
    year: number;
    month: number; // 0-11
    count: number;
  } | null;
  deepestNesting: number;
  deepestFolderPath?: string;
  looseBookmarksCount: number;
  avgBookmarksPerFolder: number;
  singleUseDomainsCount: number;

  // Top Largest Folders
  topFolders: {
    id: string;
    title: string;
    path: string;
    count: number;
    percentage: number;
  }[];

  // Age Distribution
  ageDistribution: {
    under6Months: { count: number; percentage: number };
    sixTo12Months: { count: number; percentage: number };
    oneTo3Years: { count: number; percentage: number };
    over3Years: { count: number; percentage: number };
  };
}
