import type { AppSettings, PendingSuggestion, TreeSnapshot, UndoOperation } from '@/types';

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
  const data = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(data.settings as AppSettings) };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({ settings: { ...current, ...settings } });
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
  const data = await chrome.storage.local.get(['pendingSuggestions', 'pendingSuggestion']);
  if (Array.isArray(data.pendingSuggestions)) {
    return data.pendingSuggestions;
  }
  // Migration fallback from single item
  if (data.pendingSuggestion) {
    const single = data.pendingSuggestion as PendingSuggestion;
    await chrome.storage.local.set({ pendingSuggestions: [single] });
    await chrome.storage.local.remove('pendingSuggestion');
    return [single];
  }
  return [];
}

export async function setPendingSuggestions(suggestions: PendingSuggestion[]): Promise<void> {
  if (suggestions && suggestions.length > 0) {
    await chrome.storage.local.set({ pendingSuggestions: suggestions });
  } else {
    await chrome.storage.local.remove(['pendingSuggestions', 'pendingSuggestion']);
  }
}

export async function addPendingSuggestion(
  suggestion: PendingSuggestion
): Promise<PendingSuggestion[]> {
  const current = await getPendingSuggestions();
  const filtered = current.filter((item) => item.bookmarkId !== suggestion.bookmarkId);
  const updated = [...filtered, suggestion];
  await setPendingSuggestions(updated);
  return updated;
}

export async function removePendingSuggestion(bookmarkId: string): Promise<PendingSuggestion[]> {
  const current = await getPendingSuggestions();
  const updated = current.filter((item) => item.bookmarkId !== bookmarkId);
  await setPendingSuggestions(updated);
  return updated;
}

export async function clearPendingSuggestions(): Promise<void> {
  await chrome.storage.local.remove(['pendingSuggestions', 'pendingSuggestion']);
}

export async function updateBadgeCount(count: number): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.action) {
      if (count > 0) {
        await chrome.action.setBadgeText({ text: String(count) });
        await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      } else {
        await chrome.action.setBadgeText({ text: '' });
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
  tree?: chrome.bookmarks.BookmarkTreeNode[],
  inverseOperations?: UndoOperation[]
): Promise<string> {
  const snapshot: TreeSnapshot = {
    id: `snap_${Date.now()}`,
    timestamp: Date.now(),
    description,
    tree,
    inverseOperations,
  };
  const data = await chrome.storage.local.get('snapshots');
  const snapshots: TreeSnapshot[] = (data.snapshots as TreeSnapshot[]) || [];
  // Keep last 10 snapshots
  snapshots.unshift(snapshot);
  if (snapshots.length > 10) snapshots.pop();
  await chrome.storage.local.set({ snapshots });
  return snapshot.id;
}

export async function getSnapshots(): Promise<TreeSnapshot[]> {
  const data = await chrome.storage.local.get('snapshots');
  return (data.snapshots as TreeSnapshot[]) || [];
}

export async function getLatestSnapshot(): Promise<TreeSnapshot | null> {
  const list = await getSnapshots();
  return list[0] ?? null;
}

export async function popLatestSnapshot(): Promise<TreeSnapshot | null> {
  const data = await chrome.storage.local.get('snapshots');
  const snapshots: TreeSnapshot[] = (data.snapshots as TreeSnapshot[]) || [];
  if (snapshots.length === 0) return null;
  const latest = snapshots.shift()!;
  await chrome.storage.local.set({ snapshots });
  return latest;
}
