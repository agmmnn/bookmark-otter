import { browser } from 'wxt/browser';

import type { TrashItem, BookmarkTreeNode } from '@/types';

import { getSettings } from './storage';

const STORAGE_KEY = 'recycle_bin_items';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_MS = 30 * MS_PER_DAY;

async function getRetentionMs(): Promise<number> {
  try {
    const s = await getSettings();
    const days = s.trashRetentionDays && s.trashRetentionDays > 0 ? s.trashRetentionDays : 30;
    return days * MS_PER_DAY;
  } catch {
    return THIRTY_DAYS_MS;
  }
}

/**
 * Fetch all items in the recycle bin, automatically pruning items older than retention days
 */
export async function getTrashItems(): Promise<TrashItem[]> {
  try {
    const [data, retentionMs] = await Promise.all([
      browser.storage.local.get(STORAGE_KEY),
      getRetentionMs(),
    ]);
    const rawItems: TrashItem[] = (data[STORAGE_KEY] as TrashItem[]) || [];
    const now = Date.now();

    // Auto-prune items older than configured retention period
    const validItems = rawItems.filter((item) => now - item.deletedAt <= retentionMs);

    // If any items were pruned, update storage
    if (validItems.length !== rawItems.length) {
      await browser.storage.local.set({ [STORAGE_KEY]: validItems });
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

  await browser.storage.local.set({ [STORAGE_KEY]: currentTrash });
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
    await browser.storage.local.set({ [STORAGE_KEY]: updated });
  } catch (err) {
    console.error('Error adding multiple items to trash:', err);
  }
}

/**
 * Add a Chrome BookmarkTreeNode to the recycle bin recursively
 */
export async function addNodeToTrash(
  node: BookmarkTreeNode,
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
      const existing = await browser.bookmarks.get(targetParentId);
      if (!existing || existing.length === 0) {
        targetParentId = '1'; // Fallback to Bookmarks Bar
      }
    } catch {
      targetParentId = '1'; // Fallback
    }

    // Helper to recursively restore
    async function restoreNode(node: TrashItem, parentId: string) {
      if (node.url) {
        await browser.bookmarks.create({
          parentId,
          title: node.title,
          url: node.url,
        });
      } else {
        const folder = await browser.bookmarks.create({
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
    await browser.storage.local.set({ [STORAGE_KEY]: updated });
    return true;
  } catch (err) {
    console.error(`Failed to restore item ${trashId}:`, err);
    return false;
  }
}

/**
 * Restore the N most recently trashed items (for 1-click Undo toast on batch/single deletes)
 */
export async function restoreRecentTrashItems(count: number): Promise<number> {
  if (count <= 0) return 0;
  const items = await getTrashItems();
  const toRestore = items.slice(0, count);
  let restored = 0;
  for (const item of toRestore) {
    const ok = await restoreFromTrash(item.id);
    if (ok) restored++;
  }
  return restored;
}

/**
 * Permanently delete a single item from the recycle bin
 */
export async function permanentlyDelete(trashId: string): Promise<void> {
  const items = await getTrashItems();
  const updated = items.filter((t) => t.id !== trashId);
  await browser.storage.local.set({ [STORAGE_KEY]: updated });
}

/**
 * Empty the entire recycle bin
 */
export async function emptyTrash(): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: [] });
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
export function getDaysRemaining(deletedAt: number, retentionDays = 30): number {
  const elapsed = Date.now() - deletedAt;
  const remainingMs = retentionDays * MS_PER_DAY - elapsed;
  return Math.max(0, Math.ceil(remainingMs / MS_PER_DAY));
}
