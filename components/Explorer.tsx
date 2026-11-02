import {
  FolderTree,
  Table as TableIcon,
  Search,
  ChevronRight,
  Folder,
  FolderOpen,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ChevronsUpDown,
  ChevronsDownUp,
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { getBookmarkTree, flattenBookmarks } from '@/services/bookmarks';
import { removeBookmarkWithTrash } from '@/services/cleaner';
import type { FlatBookmark } from '@/types';

type ViewMode = 'tree' | 'table';
type SortField = 'date' | 'title' | 'domain';

interface ExplorerProps {
  onBookmarkChanged?: () => void;
  initialSearchQuery?: string;
}

export const Explorer: React.FC<ExplorerProps> = ({
  onBookmarkChanged,
  initialSearchQuery = '',
}) => {
  const { t, lang } = useI18n();
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [treeData, setTreeData] = useState<chrome.bookmarks.BookmarkTreeNode[]>([]);
  const [flatBookmarks, setFlatBookmarks] = useState<FlatBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Tree state: set of expanded folder IDs
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['1', '2']));

  // Table sort state
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortAsc, setSortAsc] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadBookmarks = async () => {
    setIsLoading(true);
    try {
      const tree = await getBookmarkTree();
      setTreeData(tree);
      const flats = flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'));
      setFlatBookmarks(flats);
    } catch (err) {
      console.error('Failed to load explorer bookmarks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBookmarks();
  }, []);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allFolderIds = new Set<string>();
    function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
      for (const n of nodes) {
        if (!n.url) {
          allFolderIds.add(n.id);
          if (n.children) traverse(n.children);
        }
      }
    }
    traverse(treeData);
    setExpandedFolders(allFolderIds);
  };

  const collapseAll = () => {
    setExpandedFolders(new Set(['1', '2']));
  };

  const handleCopyUrl = async (bookmark: FlatBookmark) => {
    try {
      await navigator.clipboard.writeText(bookmark.url);
      setCopiedId(bookmark.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const handleDeleteBookmark = async (bookmark: FlatBookmark) => {
    await removeBookmarkWithTrash(bookmark);
    setFlatBookmarks((prev) => prev.filter((b) => b.id !== bookmark.id));
    await loadBookmarks();
    if (onBookmarkChanged) onBookmarkChanged();
  };

  // Filtered bookmarks for Table View & Search
  const filteredBookmarks = useMemo(() => {
    let result = flatBookmarks;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q) ||
          b.domain.toLowerCase().includes(q) ||
          b.path.toLowerCase().includes(q)
      );
    }

    return [...result].sort((a, b) => {
      if (sortField === 'title') {
        const cmp = a.title.localeCompare(b.title);
        return sortAsc ? cmp : -cmp;
      }
      if (sortField === 'domain') {
        const cmp = a.domain.localeCompare(b.domain);
        return sortAsc ? cmp : -cmp;
      }
      // Date added
      const timeA = a.dateAdded || 0;
      const timeB = b.dateAdded || 0;
      return sortAsc ? timeA - timeB : timeB - timeA;
    });
  }, [flatBookmarks, searchQuery, sortField, sortAsc]);

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const formatBookmarkDate = (timestamp?: number) => {
    if (!timestamp) return '—';
    const now = Date.now();
    const diffSec = Math.floor((now - timestamp) / 1000);
    if (diffSec < 60) return t('justNow') || 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d`;
    const d = new Date(timestamp);
    return d.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (
    node: chrome.bookmarks.BookmarkTreeNode,
    depth = 0,
    currentPath = ''
  ): React.ReactNode => {
    const isFolder = !node.url;
    const thisPath = currentPath
      ? isFolder
        ? `${currentPath} / ${node.title}`
        : currentPath
      : node.title;

    // Filter check if search query is active
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const nodeMatches =
        node.title.toLowerCase().includes(q) || (node.url && node.url.toLowerCase().includes(q));

      // For folders, check if any descendant matches
      if (isFolder) {
        const hasMatchingChild = (children?: chrome.bookmarks.BookmarkTreeNode[]): boolean => {
          if (!children) return false;
          return children.some((c) => {
            if (c.title.toLowerCase().includes(q) || (c.url && c.url.toLowerCase().includes(q)))
              return true;
            return hasMatchingChild(c.children);
          });
        };

        if (!nodeMatches && !hasMatchingChild(node.children)) {
          return null; // Skip folder if nothing inside matches search
        }
      } else if (!nodeMatches) {
        return null;
      }
    }

    if (isFolder) {
      // Skip top-level root '0' container
      if (node.id === '0') {
        return (
          <div key={node.id} className="space-y-0.5">
            {node.children?.map((child) => renderTreeNode(child, depth, thisPath))}
          </div>
        );
      }

      const isExpanded = expandedFolders.has(node.id) || searchQuery.trim().length > 0;
      const childCount = node.children?.length || 0;

      return (
        <div key={node.id} className="select-none">
          <div
            onClick={() => toggleFolder(node.id)}
            style={{ paddingLeft: `${Math.max(4, depth * 14)}px` }}
            className="group hover:bg-muted/40 text-foreground flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-120"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <ChevronRight
                className={`text-muted-foreground size-3 shrink-0 transition-transform duration-150 ${
                  isExpanded ? 'text-foreground rotate-90' : ''
                }`}
              />
              {isExpanded ? (
                <FolderOpen className="size-3.5 shrink-0 fill-amber-500/20 text-amber-500" />
              ) : (
                <Folder className="size-3.5 shrink-0 fill-amber-500/20 text-amber-500" />
              )}
              <span className="truncate">{node.title || 'Untitled Folder'}</span>
            </div>

            <Badge
              variant="secondary"
              className="text-muted-foreground h-4 shrink-0 px-1 py-0 font-mono text-[10px]"
            >
              {childCount}
            </Badge>
          </div>

          {/* Subchildren */}
          {isExpanded && node.children && node.children.length > 0 && (
            <div className="border-border/40 my-0.5 ml-3.5 space-y-0.5 border-l pl-1">
              {node.children.map((child) => renderTreeNode(child, depth + 1, thisPath))}
            </div>
          )}
        </div>
      );
    }

    // Bookmark Node
    const flatItem: FlatBookmark = {
      id: node.id,
      parentId: node.parentId || '',
      title: node.title,
      url: node.url || '',
      path: currentPath,
      domain: (() => {
        try {
          return new URL(node.url || '').hostname.replace(/^www\./, '');
        } catch {
          return '';
        }
      })(),
      dateAdded: node.dateAdded,
    };

    return (
      <div
        key={node.id}
        style={{ paddingLeft: `${Math.max(6, depth * 14)}px` }}
        className="group hover:bg-muted/30 flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors duration-100"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img
            src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
              node.url || ''
            )}&sz=32`}
            alt=""
            className="size-3.5 shrink-0 rounded-xs"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          {node.title && !node.title.startsWith('http://') && !node.title.startsWith('https://') ? (
            <a
              href={node.url}
              target="_blank"
              rel="noreferrer"
              className="text-foreground hover:text-primary cursor-pointer truncate font-medium transition-colors"
              title={node.title}
            >
              {node.title}
            </a>
          ) : (
            <a
              href={node.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground cursor-pointer truncate font-mono text-[11px] transition-colors"
              title={node.url}
            >
              {flatItem.domain ? `${flatItem.domain} ↗` : node.url}
            </a>
          )}
          {flatItem.domain && (
            <span className="text-muted-foreground/70 max-w-[120px] shrink-0 truncate text-[10px]">
              {flatItem.domain}
            </span>
          )}
        </div>

        {/* Hover Action Buttons */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
          <button
            onClick={() => handleCopyUrl(flatItem)}
            title={t('copyUrl') || 'Copy URL'}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer rounded p-1 active:scale-90"
          >
            {copiedId === node.id ? (
              <Check className="size-3 text-emerald-500" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
          <a
            href={node.url}
            target="_blank"
            rel="noreferrer"
            title={t('openInTabTooltip')}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer rounded p-1 active:scale-90"
          >
            <ExternalLink className="size-3" />
          </a>
          <button
            onClick={() => handleDeleteBookmark(flatItem)}
            title={t('deleteBookmarkTooltip') || 'Move to Recycle Bin'}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded p-1 active:scale-90"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col space-y-3 p-4">
      {/* Top Toolbar */}
      <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              {t('explorerTitle') || 'Bookmark Explorer'}
            </h2>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
              {filteredBookmarks.length} {t('itemsLabel') || 'items'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('explorerDesc') ||
              'Browse your folder tree or inspect as a Notion-style flat table.'}
          </p>
        </div>

        {/* View Switcher: Tree vs Table */}
        <div className="bg-muted/30 border-border/60 flex items-center gap-1 rounded-lg border p-0.5 select-none">
          <button
            onClick={() => setViewMode('tree')}
            title={t('treeViewTooltip') || 'Tree View'}
            className={`flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-120 active:scale-[0.97] ${
              viewMode === 'tree'
                ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderTree className="size-3.5 text-amber-500" />
            <span className="hidden sm:inline">{t('treeView') || 'Tree'}</span>
          </button>

          <button
            onClick={() => setViewMode('table')}
            title={t('tableViewTooltip') || 'Notion Flat Table'}
            className={`flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-120 active:scale-[0.97] ${
              viewMode === 'table'
                ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <TableIcon className="size-3.5 text-blue-500" />
            <span className="hidden sm:inline">{t('tableView') || 'Table'}</span>
          </button>
        </div>
      </div>

      {/* Search Input Bar + Tree controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder') || 'Search by title, domain, or folder...'}
            className="bg-muted/20 border-border/60 h-8 pr-7 pl-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-0.5"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {viewMode === 'tree' && (
          <div className="bg-muted/30 border-border/60 flex shrink-0 items-center gap-0.5 rounded-md border p-0.5">
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={expandAll}
              title={t('expandAll') || 'Expand All'}
              className="text-muted-foreground hover:text-foreground size-7 cursor-pointer active:scale-[0.95]"
            >
              <ChevronsUpDown className="size-3.5" />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={collapseAll}
              title={t('collapseAll') || 'Collapse All'}
              className="text-muted-foreground hover:text-foreground size-7 cursor-pointer active:scale-[0.95]"
            >
              <ChevronsDownUp className="size-3.5" />
            </Button>
          </div>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={loadBookmarks}
          disabled={isLoading}
          className="text-muted-foreground hover:text-foreground h-8 px-2 text-xs active:scale-[0.97]"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center space-y-2 py-20">
          <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
          <p className="text-xs">{t('loadingBookmarks') || 'Loading bookmarks...'}</p>
        </div>
      ) : filteredBookmarks.length === 0 ? (
        <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-16 text-center">
          <Search className="text-muted-foreground/50 mb-2 size-8" />
          <h3 className="text-foreground text-xs font-semibold">
            {t('noResultsFound') || 'No Bookmarks Found'}
          </h3>
          <p className="text-muted-foreground mt-0.5 text-[11px]">
            {searchQuery
              ? t('tryDifferentSearch') || 'Try searching for something else.'
              : t('noBookmarksYet') || 'No bookmarks available.'}
          </p>
        </div>
      ) : viewMode === 'tree' ? (
        /* ==================== VIEW 1: FOLDER TREE ==================== */
        <div className="border-border/50 bg-card/60 divide-border/20 max-h-[calc(100vh-210px)] divide-y overflow-y-auto rounded-lg border p-2 shadow-2xs">
          {treeData.map((rootNode) => renderTreeNode(rootNode))}
        </div>
      ) : (
        /* ==================== VIEW 2: NOTION-STYLE FLAT TABLE ==================== */
        <div className="border-border/60 bg-card overflow-hidden rounded-lg border shadow-2xs">
          {/* Table Header */}
          <div className="bg-muted/30 border-border/50 text-muted-foreground grid grid-cols-12 gap-2 border-b px-3 py-2 text-[11px] font-semibold select-none">
            <div
              onClick={() => handleToggleSort('title')}
              className="hover:text-foreground col-span-5 flex cursor-pointer items-center gap-1 transition-colors"
            >
              <span>{t('colName') || 'Name'}</span>
              {sortField === 'title' ? (
                sortAsc ? (
                  <ArrowUp className="text-primary size-3" />
                ) : (
                  <ArrowDown className="text-primary size-3" />
                )
              ) : (
                <ArrowUpDown className="size-3 opacity-40 hover:opacity-100" />
              )}
            </div>

            <div
              onClick={() => handleToggleSort('domain')}
              className="hover:text-foreground col-span-3 flex cursor-pointer items-center gap-1 transition-colors"
            >
              <span>{t('colDomain') || 'Domain'}</span>
              {sortField === 'domain' ? (
                sortAsc ? (
                  <ArrowUp className="text-primary size-3" />
                ) : (
                  <ArrowDown className="text-primary size-3" />
                )
              ) : (
                <ArrowUpDown className="size-3 opacity-40 hover:opacity-100" />
              )}
            </div>

            <div
              onClick={() => handleToggleSort('date')}
              className="hover:text-foreground col-span-2 flex cursor-pointer items-center gap-1 transition-colors"
            >
              <span>{t('colDate') || 'Date'}</span>
              {sortField === 'date' ? (
                sortAsc ? (
                  <ArrowUp className="text-primary size-3" />
                ) : (
                  <ArrowDown className="text-primary size-3" />
                )
              ) : (
                <ArrowUpDown className="size-3 opacity-40 hover:opacity-100" />
              )}
            </div>

            <div className="col-span-2 flex items-center justify-end">
              <span>{t('colActions') || 'Actions'}</span>
            </div>
          </div>

          {/* Table Rows */}
          <div className="divide-border/30 max-h-[calc(100vh-250px)] divide-y overflow-y-auto">
            {filteredBookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className="group hover:bg-muted/20 grid grid-cols-12 items-center gap-2 px-3 py-2 text-xs transition-colors duration-100"
              >
                {/* Column 1: Title + Favicon */}
                <div className="col-span-5 flex min-w-0 items-center gap-2">
                  <img
                    src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
                      bookmark.url
                    )}&sz=32`}
                    alt=""
                    className="size-3.5 shrink-0 rounded-xs"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground hover:text-primary cursor-pointer truncate font-medium transition-colors"
                    title={bookmark.title || bookmark.url}
                  >
                    {bookmark.title || bookmark.domain || bookmark.url}
                  </a>
                </div>

                {/* Column 2: Domain */}
                <div className="col-span-3 flex min-w-0 items-center">
                  <span
                    className="text-muted-foreground truncate font-mono text-[11px]"
                    title={bookmark.domain}
                  >
                    {bookmark.domain}
                  </span>
                </div>

                {/* Column 3: Date */}
                <div className="col-span-2 flex min-w-0 items-center">
                  <span
                    className="text-muted-foreground/80 truncate font-mono text-[11px]"
                    title={
                      bookmark.dateAdded
                        ? new Date(bookmark.dateAdded).toLocaleString(
                            lang === 'tr' ? 'tr-TR' : 'en-US'
                          )
                        : undefined
                    }
                  >
                    {formatBookmarkDate(bookmark.dateAdded)}
                  </span>
                </div>

                {/* Column 4: Actions */}
                <div className="col-span-2 flex shrink-0 items-center justify-end gap-1">
                  <button
                    onClick={() => handleCopyUrl(bookmark)}
                    title={t('copyUrl') || 'Copy URL'}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer rounded p-1 active:scale-[0.97]"
                  >
                    {copiedId === bookmark.id ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>

                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noreferrer"
                    title={t('openInTabTooltip') || 'Open in new tab'}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer rounded p-1 active:scale-[0.97]"
                  >
                    <ExternalLink className="size-3" />
                  </a>

                  <button
                    onClick={() => handleDeleteBookmark(bookmark)}
                    title={t('deleteBookmarkTooltip') || 'Move to Recycle Bin'}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded p-1 active:scale-[0.97]"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
