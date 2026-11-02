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

export interface TreeSnapshot {
  id: string;
  timestamp: number;
  description: string;
  tree?: chrome.bookmarks.BookmarkTreeNode[];
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
  topDomains: { domain: string; count: number; percentage: number }[];
  depthAverage: number;
}
