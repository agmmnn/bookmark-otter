import { browser } from 'wxt/browser';

import type {
  FlatBookmark,
  FlatFolder,
  ReorgAction,
  ReorgPlan,
  TreeSnapshot,
  UndoOperation,
  BookmarkTreeNode,
} from '@/types';

import { saveSnapshot } from './storage';
import { addToTrash } from './trash';

/**
 * Fetch the complete bookmark tree from Browser API (cross-browser WebExtensions)
 */
export async function getBookmarkTree(): Promise<BookmarkTreeNode[]> {
  if (!browser.bookmarks?.getTree) {
    console.warn('browser.bookmarks API is not supported in this browser (e.g. Safari).');
    return [];
  }
  return await browser.bookmarks.getTree();
}

function extractHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Flatten all bookmarks into a searchable list with folder paths.
 * Single O(N) pass using a mutable accumulator to avoid O(N^2) array concatenations.
 */
export function flattenBookmarks(nodes: BookmarkTreeNode[], currentPath = ''): FlatBookmark[] {
  const result: FlatBookmark[] = [];

  function traverse(items: BookmarkTreeNode[], parentPath: string) {
    for (const node of items) {
      const isFolder = !node.url;
      const path = parentPath
        ? isFolder
          ? `${parentPath} / ${node.title}`
          : parentPath
        : node.title;

      if (node.url) {
        result.push({
          id: node.id,
          parentId: node.parentId || '',
          title: node.title,
          url: node.url,
          path: parentPath || 'Root',
          domain: extractHostname(node.url),
          dateAdded: node.dateAdded,
        });
      }

      if (node.children && node.children.length > 0) {
        traverse(node.children, path);
      }
    }
  }

  traverse(nodes, currentPath);
  return result;
}

/**
 * Get all folders with their full hierarchical paths.
 * Single O(N) pass using a mutable accumulator.
 */
export function getAllFolders(nodes: BookmarkTreeNode[], currentPath = ''): FlatFolder[] {
  const result: FlatFolder[] = [];

  function traverse(items: BookmarkTreeNode[], parentPath: string) {
    for (const node of items) {
      if (!node.url) {
        // It's a folder
        const path = parentPath ? `${parentPath} / ${node.title}` : node.title;
        result.push({
          id: node.id,
          parentId: node.parentId,
          title: node.title,
          path,
        });

        if (node.children && node.children.length > 0) {
          traverse(node.children, path);
        }
      }
    }
  }

  traverse(nodes, currentPath);
  return result;
}

/**
 * Fetch recently added bookmarks with resolved folder paths
 */
export async function getRecentBookmarks(limit = 20): Promise<FlatBookmark[]> {
  if (!browser.bookmarks?.getRecent) {
    return [];
  }
  const [recentNodes, tree] = await Promise.all([
    browser.bookmarks.getRecent(limit),
    getBookmarkTree(),
  ]);
  const folders = getAllFolders(tree);
  const folderMap = new Map<string, string>();
  for (const f of folders) {
    folderMap.set(f.id, f.path);
  }

  return recentNodes
    .filter((n) => n.url && !n.url.startsWith('chrome://'))
    .map((n) => {
      let domain = '';
      try {
        domain = new URL(n.url!).hostname.replace(/^www\./, '');
      } catch {
        domain = '';
      }
      return {
        id: n.id,
        parentId: n.parentId || '',
        title: n.title,
        url: n.url!,
        path: folderMap.get(n.parentId || '') || 'Bookmarks Bar',
        domain,
        dateAdded: n.dateAdded,
      };
    });
}

/**
 * Extract @mentions from user prompt (e.g. @"Folder Name" or @FolderName)
 */
export function extractMentions(prompt: string): string[] {
  const matches: string[] = [];
  const regex = /@"([^"]+)"|@(\S+)/g;
  let match;
  while ((match = regex.exec(prompt)) !== null) {
    const raw = match[1] || match[2];
    if (raw && raw.trim()) {
      matches.push(raw.trim());
    }
  }
  return matches;
}

export interface SmartTreeDSLResult {
  dsl: string;
  analyzedCount: number;
  scopeType: 'targeted' | 'clustered' | 'full';
  targetFolderNames?: string[];
}

/**
 * Smart Tree DSL Generator with @mention scoping, domain pre-clustering,
 * and delta/loose item prioritization for large bookmark libraries.
 */
export function getSmartTreeDSL(nodes: BookmarkTreeNode[], userPrompt = ''): SmartTreeDSLResult {
  const folders = getAllFolders(nodes);
  const bookmarks = flattenBookmarks(nodes);
  const mentions = extractMentions(userPrompt);

  // 1. Check if any mentioned name matches a folder
  const targetedFolders: FlatFolder[] = [];
  if (mentions.length > 0) {
    for (const m of mentions) {
      const lower = m.toLowerCase();
      const matched = folders.find(
        (f) =>
          f.title.toLowerCase() === lower ||
          f.path.toLowerCase().endsWith('/' + lower) ||
          f.path.toLowerCase() === lower ||
          f.id === m
      );
      if (matched && !targetedFolders.some((tf) => tf.id === matched.id)) {
        targetedFolders.push(matched);
      }
    }
  }

  // --- CASE A: TARGETED FOLDER MENTION (@"B", @Dev, etc.) ---
  if (targetedFolders.length > 0) {
    const targetFolderIds = new Set(targetedFolders.map((tf) => tf.id));
    const targetFolderPaths = targetedFolders.map((tf) => tf.path);

    // Bookmarks strictly inside the targeted folders (or subfolders)
    const targetBookmarks = bookmarks.filter((b) => {
      if (targetFolderIds.has(b.parentId)) return true;
      return targetFolderPaths.some((tp) => b.path === tp || b.path.startsWith(tp + '/'));
    });

    const folderLines = folders
      .filter((f) => f.id !== '0')
      .map((f) => `${f.id}|${f.parentId || '0'}|${f.path}`);

    const targetBookmarkLines = targetBookmarks.map((b) => {
      const safeTitle = (b.title || 'Untitled').replace(/\|/g, '-').slice(0, 60);
      const safePath = (b.path || 'Bookmarks Bar').replace(/\|/g, '-').slice(0, 45);
      return `${b.id}|${b.parentId}|${safePath}|${safeTitle}|${b.domain}`;
    });

    const targetNames = targetedFolders.map((f) => `"${f.title}" (ID: ${f.id})`).join(', ');

    const dsl = [
      `# TARGET DIRECTIVE: The user explicitly targeted folder(s): ${targetNames}.`,
      `# USER GOAL: Deeply inspect and organize the bookmarks inside this folder. Create subcategories, rename, or clean up clutter.`,
      `# TOTAL TARGET BOOKMARKS TO ORGANIZE: ${targetBookmarks.length}`,
      '',
      '# EXISTING FOLDER PATHS FOR REFERENCE (id|parentId|path)',
      ...folderLines,
      '',
      `# BOOKMARKS INSIDE TARGETED FOLDER(S) (id|parentId|currentFolder|title|domain)`,
      ...targetBookmarkLines,
    ].join('\n');

    return {
      dsl,
      analyzedCount: targetBookmarks.length,
      scopeType: 'targeted',
      targetFolderNames: targetedFolders.map((f) => f.title),
    };
  }

  // --- CASE B: LARGE REPOSITORY DOMAIN PRE-CLUSTERING (Bookmarks > 100) ---
  if (bookmarks.length > 100) {
    // 1. Identify Loose Bookmarks (Bookmarks Bar root '1' or Other Bookmarks root '2')
    const looseBookmarks = bookmarks.filter(
      (b) => (b.parentId === '1' || b.parentId === '2') && b.url && !b.url.startsWith('chrome://')
    );

    // 2. Identify Catch-all / Dump folders (e.g. other, needfix, temp, yeni, misc, imported)
    const dumpFolderRegex = /^(other|needfix|temp|yeni|misc|çöp|cop|dump|imported|di[gğ]er)/i;
    const dumpFolders = folders.filter((f) => dumpFolderRegex.test(f.title.trim()));
    const dumpFolderIds = new Set(dumpFolders.map((f) => f.id));
    const dumpFolderBookmarks = bookmarks.filter((b) => dumpFolderIds.has(b.parentId));

    // 3. Domain clustering across all bookmarks
    const domainMap = new Map<string, { count: number; sampleFolders: Set<string> }>();
    for (const b of bookmarks) {
      if (!b.domain) continue;
      const entry = domainMap.get(b.domain) || { count: 0, sampleFolders: new Set() };
      entry.count++;
      entry.sampleFolders.add(b.path.split('/').pop() || b.path);
      domainMap.set(b.domain, entry);
    }

    const majorDomainLines = Array.from(domainMap.entries())
      .filter(([, data]) => data.count >= 4)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([domain, data]) => {
        const foldersList = Array.from(data.sampleFolders).slice(0, 3).join(', ');
        return `- ${domain} (${data.count} items) -> Found in: [${foldersList}]`;
      });

    // 4. Existing cohesive folders summary
    const cohesiveFolders = folders
      .filter((f) => f.id !== '0' && f.id !== '1' && f.id !== '2' && !dumpFolderIds.has(f.id))
      .map((f) => {
        const count = bookmarks.filter((b) => b.parentId === f.id).length;
        return `${f.id}|${f.parentId || '1'}|${f.path} (${count} items)`;
      });

    // 5. High-priority actionable bookmarks: all loose + all dump bookmarks (up to 150 items)
    const actionableBookmarks = [...looseBookmarks, ...dumpFolderBookmarks].slice(0, 150);

    const actionableBookmarkLines = actionableBookmarks.map((b) => {
      const safeTitle = (b.title || 'Untitled').replace(/\|/g, '-').slice(0, 50);
      const safePath = (b.path || 'Bookmarks Bar').replace(/\|/g, '-').slice(0, 40);
      return `${b.id}|${b.parentId}|${safePath}|${safeTitle}|${b.domain}`;
    });

    const dsl = [
      `# ARCHIVE OVERVIEW (${bookmarks.length} total bookmarks across ${folders.length} folders)`,
      `# LOOSE UNORGANIZED BOOKMARKS ON BAR: ${looseBookmarks.length}`,
      `# DUMP/TEMP FOLDERS IDENTIFIED: ${dumpFolders.map((f) => f.title).join(', ') || 'None'} (${dumpFolderBookmarks.length} items)`,
      '',
      '# MAJOR DOMAIN CLUSTERS (Use for thematic folder classification):',
      ...majorDomainLines,
      '',
      '# EXISTING COHESIVE FOLDERS (Preserve existing topics, relocate foreign items here) (id|parentId|path)',
      ...cohesiveFolders,
      '',
      `# HIGH-PRIORITY ACTIONABLE BOOKMARKS TO CLASSIFY & DISMANTLE (${actionableBookmarks.length} items) (id|parentId|currentFolder|title|domain)`,
      ...actionableBookmarkLines,
    ].join('\n');

    return {
      dsl,
      analyzedCount: bookmarks.length,
      scopeType: 'clustered',
    };
  }

  // --- CASE C: FULL TREE DSL (Default for smaller collections <= 100 bookmarks) ---
  const folderLines = folders
    .filter((f) => f.id !== '0')
    .map((f) => `${f.id}|${f.parentId || '0'}|${f.path}`);

  const bookmarkLines = bookmarks.map((b) => {
    const safeTitle = (b.title || 'Untitled').replace(/\|/g, '-').slice(0, 50);
    const safePath = (b.path || 'Bookmarks Bar').replace(/\|/g, '-').slice(0, 40);
    return `${b.id}|${b.parentId}|${safePath}|${safeTitle}|${b.domain}`;
  });

  const dsl = [
    '# FOLDERS (id|parentId|path)',
    ...folderLines,
    '',
    '# BOOKMARKS (id|parentId|currentFolder|title|domain)',
    ...bookmarkLines,
  ].join('\n');

  return {
    dsl,
    analyzedCount: bookmarks.length,
    scopeType: 'full',
  };
}

/**
 * Convert bookmarks and folders into a token-optimized Compact DSL string
 * for LLMs. Reduces token usage by ~85% compared to raw JSON.
 */
export function getCompactTreeDSL(nodes: BookmarkTreeNode[]): string {
  return getSmartTreeDSL(nodes).dsl;
}

/**
 * Fully hydrate an AI Reorganization Plan with local bookmark and folder metadata.
 * Guarantees that bookmark titles, URLs, domains, and folder paths are 100% resolved
 * from local storage, eliminating raw IDs like "ID: 158" or "172".
 */
export function hydrateReorgPlan(plan: ReorgPlan, tree: BookmarkTreeNode[]): ReorgPlan {
  const flats = flattenBookmarks(tree);
  const folders = getAllFolders(tree);

  const bookmarkMap = new Map<string, FlatBookmark>();
  for (const b of flats) {
    bookmarkMap.set(b.id, b);
  }

  const folderMap = new Map<string, FlatFolder>();
  for (const f of folders) {
    folderMap.set(f.id, f);
  }

  // Also collect temporary created folders in this plan
  const tmpFolderTitles = new Map<string, string>();
  for (const act of plan.actions) {
    if (act.action === 'CREATE_FOLDER') {
      tmpFolderTitles.set(act.tmpId, act.title);
    }
  }

  const hydratedActions = plan.actions.map((act): ReorgAction => {
    if (act.action === 'MOVE') {
      const orig = bookmarkMap.get(act.bookmarkId);
      const targetFolder = folderMap.get(act.targetFolderId);
      const tmpTitle = tmpFolderTitles.get(act.targetFolderId);

      // Clean bookmark title (never allow "ID: 158" or empty)
      let resolvedBookmarkTitle = orig?.title;
      if (!resolvedBookmarkTitle || resolvedBookmarkTitle.trim() === '') {
        resolvedBookmarkTitle = orig?.domain || `Bookmark ${act.bookmarkId}`;
      }
      if (
        act.bookmarkTitle &&
        !act.bookmarkTitle.startsWith('ID:') &&
        act.bookmarkTitle.trim() !== ''
      ) {
        resolvedBookmarkTitle = act.bookmarkTitle;
      }

      // Clean folder title (never allow raw ID "172")
      let resolvedFolderTitle = targetFolder?.path || targetFolder?.title;
      if (tmpTitle) {
        resolvedFolderTitle = `${tmpTitle} (New Folder)`;
      } else if (
        act.targetFolderTitle &&
        !/^\d+$/.test(act.targetFolderTitle.trim()) &&
        act.targetFolderTitle.trim() !== ''
      ) {
        resolvedFolderTitle = act.targetFolderTitle;
      } else if (!resolvedFolderTitle) {
        resolvedFolderTitle = 'Bookmarks Bar';
      }

      return {
        ...act,
        bookmarkTitle: resolvedBookmarkTitle,
        targetFolderTitle: resolvedFolderTitle,
      };
    }

    if (act.action === 'REMOVE') {
      if (act.isFolder) {
        const f = folderMap.get(act.id);
        const resolvedTitle =
          f?.path ||
          f?.title ||
          (act.title && !/^\d+$/.test(act.title) ? act.title : `Folder ${act.id}`);
        return {
          ...act,
          title: resolvedTitle,
          isFolder: true,
        };
      } else {
        const b = bookmarkMap.get(act.id);
        const resolvedTitle =
          b?.title ||
          (act.title && !act.title.startsWith('ID:') ? act.title : `Bookmark ${act.id}`);
        return {
          ...act,
          title: resolvedTitle,
        };
      }
    }

    if (act.action === 'RENAME') {
      const b = bookmarkMap.get(act.id);
      return {
        ...act,
        oldTitle: b?.title || act.oldTitle || `Bookmark ${act.id}`,
      };
    }

    return act;
  });

  return {
    ...plan,
    actions: hydratedActions,
  };
}

/**
 * Execute an AI Action Plan with tmpId dependency resolution and snapshot creation
 */
export async function executePlan(
  plan: ReorgPlan,
  activeActions?: ReorgAction[]
): Promise<{ success: boolean; appliedCount: number; snapshotId: string }> {
  const tree = await getBookmarkTree();
  const actionsToRun = activeActions || plan.actions;
  const tmpIdMap = new Map<string, string>(); // tmpId -> real Chrome ID
  const inverseOps: UndoOperation[] = [];
  let appliedCount = 0;

  // Protected root IDs in Chrome
  const PROTECTED_IDS = new Set(['0', '1', '2']);

  // Phase 1: CREATE_FOLDER actions
  for (const act of actionsToRun) {
    if (act.action === 'CREATE_FOLDER') {
      const parentId = tmpIdMap.get(act.parentId) || act.parentId || '1'; // Default to Bookmarks Bar ('1')
      try {
        const created = await browser.bookmarks.create({
          parentId,
          title: act.title,
        });
        tmpIdMap.set(act.tmpId, created.id);
        inverseOps.push({
          type: 'CREATE_FOLDER',
          createdFolderId: created.id,
        });
        appliedCount++;
      } catch (err) {
        console.error(`Failed to create folder ${act.title}:`, err);
      }
    }
  }

  // Phase 2: MOVE actions (Record original parentId and index BEFORE moving!)
  for (const act of actionsToRun) {
    if (act.action === 'MOVE') {
      if (PROTECTED_IDS.has(act.bookmarkId)) continue;
      const targetParentId = tmpIdMap.get(act.targetFolderId) || act.targetFolderId;
      try {
        const [orig] = await browser.bookmarks.get(act.bookmarkId);
        if (orig && orig.parentId) {
          inverseOps.push({
            type: 'MOVE',
            bookmarkId: act.bookmarkId,
            originalParentId: orig.parentId,
            originalIndex: orig.index,
          });
        }
        await browser.bookmarks.move(act.bookmarkId, { parentId: targetParentId });
        appliedCount++;
      } catch (err) {
        console.error(`Failed to move bookmark ${act.bookmarkId}:`, err);
      }
    }
  }

  // Phase 3: RENAME actions (Record original title BEFORE renaming!)
  for (const act of actionsToRun) {
    if (act.action === 'RENAME') {
      if (PROTECTED_IDS.has(act.id)) continue;
      try {
        const [orig] = await browser.bookmarks.get(act.id);
        if (orig) {
          inverseOps.push({
            type: 'RENAME',
            id: act.id,
            originalTitle: orig.title,
          });
        }
        await browser.bookmarks.update(act.id, { title: act.newTitle });
        appliedCount++;
      } catch (err) {
        console.error(`Failed to rename bookmark ${act.id}:`, err);
      }
    }
  }

  // Phase 4: REMOVE actions
  for (const act of actionsToRun) {
    if (act.action === 'REMOVE') {
      if (PROTECTED_IDS.has(act.id)) continue;
      try {
        const [orig] = await browser.bookmarks.get(act.id);
        if (orig && orig.parentId) {
          inverseOps.push({
            type: 'REMOVE',
            restoredNode: {
              parentId: orig.parentId,
              title: orig.title,
              url: orig.url,
              index: orig.index,
            },
          });
        }
        await addToTrash({
          originalId: act.id,
          title: act.title || 'Removed Bookmark',
          isFolder: act.isFolder ?? false,
          parentId: '1',
          parentPath: 'AI Plan',
        });
        if (act.isFolder) {
          await browser.bookmarks.removeTree(act.id);
        } else {
          await browser.bookmarks.remove(act.id);
        }
        appliedCount++;
      } catch (err) {
        console.error(`Failed to remove bookmark ${act.id}:`, err);
      }
    }
  }

  // 1. Save snapshot with atomic inverse operations (FAVICON-SAFE!)
  const snapshotId = await saveSnapshot(plan.summary || 'AI Reorganization', tree, inverseOps);

  return { success: true, appliedCount, snapshotId };
}

/**
 * Restore bookmark tree from a snapshot (Favicon-Safe Undo mechanism)
 * Uses atomic inverse operations so Chrome NEVER wipes or clears favicons!
 */
export async function restoreSnapshot(snapshot: TreeSnapshot): Promise<boolean> {
  // 1. Primary: Atomic Inverse Operations
  // This does NOT delete/recreate bookmarks, so Chrome NEVER loses favicons!
  if (snapshot.inverseOperations && snapshot.inverseOperations.length > 0) {
    try {
      const ops = [...snapshot.inverseOperations].reverse();
      for (const op of ops) {
        try {
          if (op.type === 'MOVE') {
            await browser.bookmarks.move(op.bookmarkId, {
              parentId: op.originalParentId,
              index: op.originalIndex,
            });
          } else if (op.type === 'RENAME') {
            await browser.bookmarks.update(op.id, {
              title: op.originalTitle,
            });
          } else if (op.type === 'CREATE_FOLDER') {
            await browser.bookmarks.remove(op.createdFolderId);
          } else if (op.type === 'REMOVE') {
            if (op.restoredNode.url) {
              await browser.bookmarks.create({
                parentId: op.restoredNode.parentId,
                title: op.restoredNode.title,
                url: op.restoredNode.url,
                index: op.restoredNode.index,
              });
            }
          }
        } catch (opErr) {
          console.warn('Failed executing inverse operation during undo:', op, opErr);
        }
      }
      return true;
    } catch (err) {
      console.error('Error during inverse operation undo:', err);
      return false;
    }
  }

  return false;
}
