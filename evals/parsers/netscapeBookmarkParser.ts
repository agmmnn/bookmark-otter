import fs from 'node:fs';

import type { BookmarkTreeNode } from '@/types';

/**
 * Robust Netscape Bookmark HTML parser.
 * Converts standard Chrome / Firefox exported bookmark HTML files
 * into a standard BookmarkTreeNode hierarchy.
 */
export function parseNetscapeBookmarkHtml(html: string): BookmarkTreeNode[] {
  let idCounter = 100;
  const barNode = {
    id: '1',
    parentId: '0',
    title: 'Bookmarks Bar',
    children: [] as BookmarkTreeNode[],
  } as BookmarkTreeNode;

  const otherNode = {
    id: '2',
    parentId: '0',
    title: 'Other Bookmarks',
    children: [] as BookmarkTreeNode[],
  } as BookmarkTreeNode;

  const root: BookmarkTreeNode = {
    id: '0',
    title: 'Root',
    children: [barNode, otherNode],
  } as BookmarkTreeNode;

  let currentParent: BookmarkTreeNode = barNode;
  const stack: BookmarkTreeNode[] = [root];

  const lines = html.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Check for folder header: <DT><H3 ...>Title</H3>
    const h3Match = line.match(/<DT><H3([^>]*)>(.*?)<\/H3>/i);
    if (h3Match) {
      const attrs = h3Match[1] || '';
      let title = h3Match[2] || '';
      title = unescapeHtml(title).trim();

      const isBar = attrs.includes('PERSONAL_TOOLBAR_FOLDER="true"') || title === 'Bookmarks Bar';

      let folder: BookmarkTreeNode;
      if (isBar) {
        folder = barNode;
      } else if (title === 'Other Bookmarks') {
        folder = otherNode;
      } else {
        folder = {
          id: String(idCounter++),
          parentId: currentParent.id,
          title,
          children: [] as BookmarkTreeNode[],
        } as BookmarkTreeNode;
        currentParent.children = currentParent.children || [];
        currentParent.children.push(folder);
      }
      stack.push(folder);
      currentParent = folder;
      continue;
    }

    // Check for folder close: </DL>
    if (line.includes('</DL>')) {
      if (stack.length > 1) {
        stack.pop();
        currentParent = stack[stack.length - 1]!;
      }
      continue;
    }

    // Check for bookmark: <DT><A HREF="url" ...>Title</A>
    const aMatch = line.match(/<DT><A\s+HREF="([^"]*)"[^>]*>(.*?)<\/A>/i);
    if (aMatch) {
      const url = aMatch[1] || '';
      let title = aMatch[2] || '';
      title = unescapeHtml(title);

      const bookmark = {
        id: String(idCounter++),
        parentId: currentParent.id,
        title,
        url,
      } as BookmarkTreeNode;

      currentParent.children = currentParent.children || [];
      currentParent.children.push(bookmark);
    }
  }

  return [root];
}

export function parseNetscapeBookmarkFile(filePath: string): BookmarkTreeNode[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseNetscapeBookmarkHtml(content);
}

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function getTreeStats(nodes: BookmarkTreeNode[]): {
  totalBookmarks: number;
  totalFolders: number;
  barBookmarks: number;
  barFolders: number;
} {
  let totalBookmarks = 0;
  let totalFolders = 0;

  function traverse(list: BookmarkTreeNode[]) {
    for (const n of list) {
      if (n.url) {
        totalBookmarks++;
      } else {
        totalFolders++;
        if (n.children && n.children.length > 0) {
          traverse(n.children);
        }
      }
    }
  }

  traverse(nodes);

  const bar = nodes[0]?.children?.[0];
  let barBookmarks = 0;
  let barFolders = 0;

  if (bar && bar.children) {
    for (const n of bar.children) {
      if (n.url) barBookmarks++;
      else barFolders++;
    }
  }

  return { totalBookmarks, totalFolders, barBookmarks, barFolders };
}
