import type { TrashItem } from '@/types';

const STORAGE_KEY = 'recycle_bin_items';
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

/**
 * Fetch all items in the recycle bin, automatically pruning items older than 30 days
 */
export async function getTrashItems(): Promise<TrashItem[]> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const rawItems: TrashItem[] = (data[STORAGE_KEY] as TrashItem[]) || [];
    const now = Date.now();

    // Auto-prune items older than 30 days
    const validItems = rawItems.filter((item) => now - item.deletedAt <= THIRTY_DAYS_MS);

    // If any items were pruned, update storage
    if (validItems.length !== rawItems.length) {
      await chrome.storage.local.set({ [STORAGE_KEY]: validItems });
    }

    // Sort newest deletions first
    return validItems.sort((a, b) => b.deletedAt - a.deletedAt);
  } catch (err) {
    console.error('Error fetching trash items:', err);
    return [];
  }
}

/**
 * Add a deleted bookmark or folder to the recycle bin
 */
export async function addToTrash(item: Omit<TrashItem, 'id' | 'deletedAt'>): Promise<TrashItem> {
  const currentTrash = await getTrashItems();
  const trashItem: TrashItem = {
    ...item,
    id: `trash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    deletedAt: Date.now(),
  };

  currentTrash.unshift(trashItem);
  // Cap at 250 items to avoid storage explosion
  if (currentTrash.length > 250) {
    currentTrash.pop();
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: currentTrash });
  return trashItem;
}

/**
 * Add multiple deleted items to the recycle bin in a single atomic batch write
 */
export async function addMultipleToTrash(
  items: Array<Omit<TrashItem, 'id' | 'deletedAt'>>
): Promise<void> {
  if (items.length === 0) return;
  try {
    const currentTrash = await getTrashItems();
    const now = Date.now();

    const newEntries: TrashItem[] = items.map((item, idx) => ({
      ...item,
      id: `trash_${now}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      deletedAt: now,
    }));

    const updated = [...newEntries, ...currentTrash].slice(0, 250);
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  } catch (err) {
    console.error('Error adding multiple items to trash:', err);
  }
}

/**
 * Add a Chrome BookmarkTreeNode to the recycle bin recursively
 */
export async function addNodeToTrash(
  node: chrome.bookmarks.BookmarkTreeNode,
  parentPath = 'Bookmarks Bar'
): Promise<TrashItem> {
  const isFolder = !node.url;

  let children: TrashItem[] | undefined;
  if (node.children && node.children.length > 0) {
    children = [];
    const folderPath = `${parentPath} / ${node.title}`;
    for (const child of node.children) {
      const childTrash = await addNodeToTrash(child, folderPath);
      children.push(childTrash);
    }
  }

  return await addToTrash({
    originalId: node.id,
    title: node.title || (isFolder ? 'Untitled Folder' : 'Untitled Bookmark'),
    url: node.url,
    isFolder,
    parentId: node.parentId || '1',
    parentPath,
    children,
  });
}

/**
 * Restore an item from the recycle bin back to Chrome bookmarks
 */
export async function restoreFromTrash(trashId: string): Promise<boolean> {
  try {
    const items = await getTrashItems();
    const item = items.find((t) => t.id === trashId);
    if (!item) return false;

    // Verify if original parent folder still exists in Chrome
    let targetParentId = item.parentId || '1';
    try {
      const existing = await chrome.bookmarks.get(targetParentId);
      if (!existing || existing.length === 0) {
        targetParentId = '1'; // Fallback to Bookmarks Bar
      }
    } catch {
      targetParentId = '1'; // Fallback
    }

    // Helper to recursively restore
    async function restoreNode(node: TrashItem, parentId: string) {
      if (node.url) {
        await chrome.bookmarks.create({
          parentId,
          title: node.title,
          url: node.url,
        });
      } else {
        const folder = await chrome.bookmarks.create({
          parentId,
          title: node.title,
        });
        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            await restoreNode(child, folder.id);
          }
        }
      }
    }

    await restoreNode(item, targetParentId);

    // Remove from recycle bin storage
    const updated = items.filter((t) => t.id !== trashId);
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    return true;
  } catch (err) {
    console.error(`Failed to restore item ${trashId}:`, err);
    return false;
  }
}

/**
 * Permanently delete a single item from the recycle bin
 */
export async function permanentlyDelete(trashId: string): Promise<void> {
  const items = await getTrashItems();
  const updated = items.filter((t) => t.id !== trashId);
  await chrome.storage.local.set({ [STORAGE_KEY]: updated });
}

/**
 * Empty the entire recycle bin
 */
export async function emptyTrash(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: [] });
}

/**
 * Get count of active items in recycle bin
 */
export async function getTrashCount(): Promise<number> {
  const items = await getTrashItems();
  return items.length;
}

/**
 * Calculate remaining days until permanent deletion
 */
export function getDaysRemaining(deletedAt: number): number {
  const elapsed = Date.now() - deletedAt;
  const remainingMs = THIRTY_DAYS_MS - elapsed;
  return Math.max(0, Math.ceil(remainingMs / (1000 * 60 * 60 * 24)));
}
