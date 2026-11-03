import { browser } from 'wxt/browser';

import type {
  AppSettings,
  PendingSuggestion,
  TreeSnapshot,
  UndoOperation,
  BookmarkTreeNode,
} from '@/types';

const DEFAULT_SETTINGS: AppSettings = {
  aiProvider: 'google',
  geminiApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  xaiApiKey: '',
  groqApiKey: '',
  deepseekApiKey: '',
  modelName: 'gemini-2.5-flash',
  language: 'en',
};

export async function getSettings(): Promise<AppSettings> {
  const data = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(data.settings as AppSettings) };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await browser.storage.local.set({ settings: { ...current, ...settings } });
}

export function hasConfiguredKey(settings: AppSettings): boolean {
  switch (settings.aiProvider) {
    case 'google':
      return Boolean(settings.geminiApiKey?.trim());
    case 'openai':
      return Boolean(settings.openaiApiKey?.trim());
    case 'anthropic':
      return Boolean(settings.anthropicApiKey?.trim());
    case 'xai':
      return Boolean(settings.xaiApiKey?.trim());
    case 'groq':
      return Boolean(settings.groqApiKey?.trim());
    case 'deepseek':
      return Boolean(settings.deepseekApiKey?.trim());
    default:
      return false;
  }
}

export async function getPendingSuggestions(): Promise<PendingSuggestion[]> {
  const data = await browser.storage.local.get(['pendingSuggestions', 'pendingSuggestion']);
  if (Array.isArray(data.pendingSuggestions)) {
    return data.pendingSuggestions as PendingSuggestion[];
  }
  // Migration fallback from single item
  if (data.pendingSuggestion) {
    const single = data.pendingSuggestion as PendingSuggestion;
    await browser.storage.local.set({ pendingSuggestions: [single] });
    await browser.storage.local.remove('pendingSuggestion');
    return [single];
  }
  return [];
}

export async function setPendingSuggestions(suggestions: PendingSuggestion[]): Promise<void> {
  if (suggestions && suggestions.length > 0) {
    await browser.storage.local.set({ pendingSuggestions: suggestions });
  } else {
    await browser.storage.local.remove(['pendingSuggestions', 'pendingSuggestion']);
  }
}

export async function addPendingSuggestion(
  suggestion: PendingSuggestion
): Promise<PendingSuggestion[]> {
  // Verify bookmark still exists in browser before saving
  if (browser.bookmarks?.get) {
    try {
      const [node] = await browser.bookmarks.get(suggestion.bookmarkId);
      if (!node) return await getPendingSuggestions();
    } catch {
      // Bookmark was already deleted/unstarred!
      return await getPendingSuggestions();
    }
  }

  const current = await getPendingSuggestions();
  const filtered = current.filter((item) => item.bookmarkId !== suggestion.bookmarkId);
  const updated = [...filtered, suggestion];
  await setPendingSuggestions(updated);
  return updated;
}

export async function removePendingSuggestion(
  bookmarkId: string,
  url?: string
): Promise<PendingSuggestion[]> {
  const current = await getPendingSuggestions();
  const updated = current.filter((item) => {
    if (item.bookmarkId === bookmarkId) return false;
    if (url && item.url === url) return false;
    return true;
  });
  await setPendingSuggestions(updated);
  return updated;
}

export async function validateAndCleanPendingSuggestions(): Promise<PendingSuggestion[]> {
  const current = await getPendingSuggestions();
  if (current.length === 0) {
    await updateBadgeCount(0);
    return [];
  }

  if (!browser.bookmarks?.get) {
    return current;
  }

  const valid: PendingSuggestion[] = [];
  for (const item of current) {
    try {
      const [node] = await browser.bookmarks.get(item.bookmarkId);
      if (node) {
        valid.push(item);
      }
    } catch {
      // Bookmark was deleted or unstarred in browser
    }
  }

  if (valid.length !== current.length) {
    await setPendingSuggestions(valid);
    await updateBadgeCount(valid.length);
  }
  return valid;
}

export async function clearPendingSuggestions(): Promise<void> {
  await browser.storage.local.remove(['pendingSuggestions', 'pendingSuggestion']);
}

export async function updateBadgeCount(count: number): Promise<void> {
  try {
    const action = browser.action ?? (browser as any).browserAction;
    if (action) {
      if (count > 0) {
        await action.setBadgeText({ text: String(count) });
        await action.setBadgeBackgroundColor({ color: '#f59e0b' });
      } else {
        await action.setBadgeText({ text: '' });
      }
    }
  } catch (err) {
    console.warn('Could not update badge:', err);
  }
}

export async function getPendingSuggestion(): Promise<PendingSuggestion | null> {
  const list = await getPendingSuggestions();
  return list[0] ?? null;
}

export async function setPendingSuggestion(suggestion: PendingSuggestion | null): Promise<void> {
  if (suggestion) {
    await setPendingSuggestions([suggestion]);
  } else {
    await clearPendingSuggestions();
  }
}

export async function saveSnapshot(
  description: string,
  tree?: BookmarkTreeNode[],
  inverseOperations?: UndoOperation[]
): Promise<string> {
  const snapshot: TreeSnapshot = {
    id: `snap_${Date.now()}`,
    timestamp: Date.now(),
    description,
    tree,
    inverseOperations,
  };
  const data = await browser.storage.local.get('snapshots');
  const snapshots: TreeSnapshot[] = (data.snapshots as TreeSnapshot[]) || [];
  // Keep last 10 snapshots
  snapshots.unshift(snapshot);
  if (snapshots.length > 10) snapshots.pop();
  await browser.storage.local.set({ snapshots });
  return snapshot.id;
}

export async function getSnapshots(): Promise<TreeSnapshot[]> {
  const data = await browser.storage.local.get('snapshots');
  return (data.snapshots as TreeSnapshot[]) || [];
}

export async function getLatestSnapshot(): Promise<TreeSnapshot | null> {
  const list = await getSnapshots();
  return list[0] ?? null;
}

export async function popLatestSnapshot(): Promise<TreeSnapshot | null> {
  const data = await browser.storage.local.get('snapshots');
  const snapshots: TreeSnapshot[] = (data.snapshots as TreeSnapshot[]) || [];
  if (snapshots.length === 0) return null;
  const latest = snapshots.shift()!;
  await browser.storage.local.set({ snapshots });
  return latest;
}
