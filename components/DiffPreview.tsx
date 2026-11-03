import {
  FolderPlus,
  Folder,
  Edit3,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  Check,
  ChevronDown,
  Globe,
  Code2,
  Copy,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import type { ReorgAction, ReorgPlan, FlatBookmark, FlatFolder } from '@/types';

interface DiffPreviewProps {
  plan: ReorgPlan;
  onApply: (selectedActions: ReorgAction[]) => Promise<void>;
  onCancel: () => void;
  isApplying?: boolean;
  bookmarkMap?: Map<string, FlatBookmark>;
  folderMap?: Map<string, FlatFolder>;
  totalBookmarksCount?: number;
  scopeType?: 'targeted' | 'clustered' | 'full';
  targetedNames?: string[];
}

interface MoveItem {
  actionIndex: number;
  bookmarkId: string;
  bookmarkTitle: string;
  url?: string;
  domain?: string;
  sourcePath?: string;
  reason?: string;
}

interface FolderGroup {
  key: string; // tmpId or targetFolderTitle or folderId
  title: string;
  isNewFolder: boolean;
  createActionIndex?: number;
  moves: MoveItem[];
}

export const DiffPreview: React.FC<DiffPreviewProps> = ({
  plan,
  onApply,
  onCancel,
  isApplying = false,
  bookmarkMap = new Map(),
  folderMap = new Map(),
  totalBookmarksCount,
  scopeType,
  targetedNames,
}) => {
  const { t } = useI18n();

  // Initially select all actions
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    new Set(plan.actions.map((_, i) => i))
  );

  // Set of collapsed folder keys (all expanded by default)
  const [collapsedFolderKeys, setCollapsedFolderKeys] = useState<Set<string>>(new Set());

  // Raw Inspector modal state
  const [isRawModalOpen, setIsRawModalOpen] = useState(false);
  const [rawTab, setRawTab] = useState<'json' | 'dsl'>('json');
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyRaw = async () => {
    const content =
      rawTab === 'json' ? plan.rawJson || JSON.stringify(plan, null, 2) : plan.rawDsl || '';
    await navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Group actions hierarchically by folder
  const { folderGroups, renames, removes, newFolderCount, moveCount } = useMemo(() => {
    const groupsMap = new Map<string, FolderGroup>();
    const renameList: {
      actionIndex: number;
      oldTitle?: string;
      newTitle: string;
      reason?: string;
    }[] = [];
    const removeList: {
      actionIndex: number;
      id: string;
      title?: string;
      isFolder?: boolean;
      reason?: string;
    }[] = [];

    let newFolders = 0;
    let moves = 0;

    // 1. First pass: register all CREATE_FOLDER actions
    plan.actions.forEach((act, idx) => {
      if (act.action === 'CREATE_FOLDER') {
        newFolders++;
        groupsMap.set(act.tmpId, {
          key: act.tmpId,
          title: act.title,
          isNewFolder: true,
          createActionIndex: idx,
          moves: [],
        });
      }
    });

    // 2. Second pass: distribute MOVE actions into their respective folder groups
    plan.actions.forEach((act, idx) => {
      if (act.action === 'MOVE') {
        moves++;
        const targetKey = act.targetFolderId || act.targetFolderTitle || 'default';
        let group = groupsMap.get(targetKey);

        // Try lookup by title if tmpId was not directly matched
        if (!group && act.targetFolderTitle) {
          for (const g of groupsMap.values()) {
            if (g.title === act.targetFolderTitle) {
              group = g;
              break;
            }
          }
        }

        // If target folder is existing (not in CREATE_FOLDER)
        if (!group) {
          const folderObj = folderMap.get(targetKey) || folderMap.get(act.targetFolderId);
          const resolvedFolderTitle =
            act.targetFolderTitle && !/^\d+$/.test(act.targetFolderTitle.trim())
              ? act.targetFolderTitle
              : folderObj?.path || folderObj?.title || 'Bookmarks Bar';

          group = {
            key: targetKey,
            title: resolvedFolderTitle,
            isNewFolder: false,
            moves: [],
          };
          groupsMap.set(targetKey, group);
        }

        const resolvedMeta = bookmarkMap.get(act.bookmarkId);
        const resolvedTitle =
          act.bookmarkTitle && !act.bookmarkTitle.startsWith('ID:')
            ? act.bookmarkTitle
            : resolvedMeta?.title || resolvedMeta?.domain || `Bookmark ${act.bookmarkId}`;

        group.moves.push({
          actionIndex: idx,
          bookmarkId: act.bookmarkId,
          bookmarkTitle: resolvedTitle,
          url: resolvedMeta?.url,
          domain: resolvedMeta?.domain,
          sourcePath: resolvedMeta?.path || 'Bookmarks Bar',
          reason: act.reason,
        });
      } else if (act.action === 'RENAME') {
        const origB = bookmarkMap.get(act.id);
        renameList.push({
          actionIndex: idx,
          oldTitle: act.oldTitle || origB?.title,
          newTitle: act.newTitle,
          reason: act.reason,
        });
      } else if (act.action === 'REMOVE') {
        const origB = !act.isFolder ? bookmarkMap.get(act.id) : undefined;
        const origF = act.isFolder ? folderMap.get(act.id) : undefined;
        const resolvedTitle =
          act.title && !/^\d+$/.test(act.title) && !act.title.startsWith('ID:')
            ? act.title
            : origF?.path || origB?.title || `Item ${act.id}`;

        removeList.push({
          actionIndex: idx,
          id: act.id,
          title: resolvedTitle,
          isFolder: act.isFolder,
          reason: act.reason,
        });
      }
    });

    return {
      folderGroups: Array.from(groupsMap.values()),
      renames: renameList,
      removes: removeList,
      newFolderCount: newFolders,
      moveCount: moves,
    };
  }, [plan.actions, bookmarkMap, folderMap]);

  // Toggle individual action selection
  const toggleIndex = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Toggle selection for an entire folder and all its bookmarks
  const toggleFolderSelection = (group: FolderGroup) => {
    const allGroupIndices: number[] = [];
    if (group.createActionIndex !== undefined) {
      allGroupIndices.push(group.createActionIndex);
    }
    group.moves.forEach((m) => allGroupIndices.push(m.actionIndex));

    const isFullySelected = allGroupIndices.every((idx) => selectedIndices.has(idx));

    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (isFullySelected) {
        allGroupIndices.forEach((idx) => next.delete(idx));
      } else {
        allGroupIndices.forEach((idx) => next.add(idx));
      }
      return next;
    });
  };

  // Toggle folder collapse
  const toggleFolderCollapse = (key: string) => {
    setCollapsedFolderKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(plan.actions.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleApply = () => {
    const selected = plan.actions.filter((_, i) => selectedIndices.has(i));
    onApply(selected);
  };

  return (
    <div className="bg-card border-border/80 animate-in fade-in-0 zoom-in-95 flex h-full flex-col overflow-hidden rounded-xl border shadow-xs transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]">
      {/* Plan Header */}
      <div className="bg-muted/30 border-border/70 space-y-1.5 border-b p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-foreground flex items-center gap-1.5 text-xs font-semibold tracking-tight">
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              {t('diffTitle')}
            </span>

            {/* Quick Stat Badges */}
            <div className="flex flex-wrap items-center gap-1">
              {scopeType === 'targeted' && targetedNames && targetedNames.length > 0 && (
                <Badge
                  variant="outline"
                  className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-medium text-amber-600 dark:text-amber-400"
                >
                  🎯 {targetedNames.join(', ')}
                </Badge>
              )}
              {totalBookmarksCount && totalBookmarksCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground border-border h-4 px-1.5 py-0 text-[9px] font-normal"
                >
                  {totalBookmarksCount} {t('itemsLabel') || 'items'} analyzed
                </Badge>
              )}
              <Badge
                variant="secondary"
                className="border-primary/20 bg-primary/10 text-primary h-4 px-1.5 py-0 text-[9px] font-medium"
              >
                {t('planStatsActions', { count: plan.actions.length })}
              </Badge>
              {moveCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 border-blue-500/20 bg-blue-500/10 px-1.5 py-0 text-[9px] font-medium text-blue-600 dark:text-blue-400"
                >
                  {t('planStatsMoves', { count: moveCount })}
                </Badge>
              )}
              {newFolderCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-medium text-emerald-600 dark:text-emerald-400"
                >
                  {t('planStatsFolders', { count: newFolderCount })}
                </Badge>
              )}
              {removes.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 border-rose-500/20 bg-rose-500/10 px-1.5 py-0 text-[9px] font-medium text-rose-600 dark:text-rose-400"
                >
                  {t('planStatsRemoves', { count: removes.length })}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 select-none">
            {/* Raw JSON Debug Inspector Button */}
            <button
              onClick={() => setIsRawModalOpen(true)}
              className="bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60 flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors active:scale-95"
              title="Inspect raw prompt DSL & raw AI response"
            >
              <Code2 className="text-primary size-3" />
              <span>Raw AI</span>
            </button>

            <div className="text-muted-foreground flex items-center gap-1.5 text-[10.5px]">
              <button
                onClick={selectAll}
                className="hover:text-foreground cursor-pointer transition-transform hover:underline active:scale-95"
              >
                {t('selectAll')}
              </button>
              <span className="opacity-40">•</span>
              <button
                onClick={deselectAll}
                className="hover:text-foreground cursor-pointer transition-transform hover:underline active:scale-95"
              >
                {t('clearAll')}
              </button>
            </div>
          </div>
        </div>

        <p className="text-muted-foreground text-[11px] leading-relaxed">{plan.summary}</p>
      </div>

      {/* Hierarchical Action Groups */}
      <div className="max-h-[380px] flex-1 space-y-2 overflow-y-auto p-2.5 text-xs">
        {/* 1. Folder Groups */}
        {folderGroups.map((group) => {
          const isCollapsed = collapsedFolderKeys.has(group.key);
          const allGroupIndices: number[] = [];
          if (group.createActionIndex !== undefined) {
            allGroupIndices.push(group.createActionIndex);
          }
          group.moves.forEach((m) => allGroupIndices.push(m.actionIndex));

          const selectedCount = allGroupIndices.filter((idx) => selectedIndices.has(idx)).length;
          const isFullySelected =
            allGroupIndices.length > 0 && selectedCount === allGroupIndices.length;
          const isPartiallySelected = selectedCount > 0 && selectedCount < allGroupIndices.length;

          return (
            <div
              key={group.key}
              className="border-border/70 bg-card overflow-hidden rounded-xl border shadow-2xs transition-all duration-150"
            >
              {/* Folder Group Header */}
              <div className="bg-muted/25 hover:bg-muted/40 flex items-center justify-between px-2.5 py-2 transition-colors select-none">
                <div
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                  onClick={() => toggleFolderSelection(group)}
                >
                  {/* Folder Checkbox */}
                  <div
                    className={`flex size-3.5 shrink-0 items-center justify-center rounded transition-colors duration-120 ${
                      isFullySelected
                        ? 'bg-primary text-primary-foreground'
                        : isPartiallySelected
                          ? 'bg-primary/50 text-primary-foreground'
                          : 'border-muted-foreground/40 hover:border-muted-foreground border'
                    }`}
                  >
                    {(isFullySelected || isPartiallySelected) && (
                      <Check className="size-2.5 stroke-[3]" />
                    )}
                  </div>

                  {/* Folder Icon */}
                  {group.isNewFolder ? (
                    <FolderPlus className="size-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-amber-500" />
                  )}

                  {/* Folder Title */}
                  <span className="text-foreground truncate text-xs font-semibold">
                    {group.title}
                  </span>

                  {/* Badges */}
                  <Badge
                    variant="outline"
                    className={`h-3.5 shrink-0 px-1 py-0 text-[9px] font-normal ${
                      group.isNewFolder
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {group.isNewFolder ? t('newFolderGroupBadge') : t('existingFolderGroupBadge')}
                  </Badge>

                  {group.moves.length > 0 && (
                    <span className="text-muted-foreground shrink-0 text-[10px]">
                      ({group.moves.length})
                    </span>
                  )}
                </div>

                {/* Collapse / Expand Chevron */}
                {group.moves.length > 0 && (
                  <button
                    onClick={() => toggleFolderCollapse(group.key)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1 transition-transform duration-150 active:scale-90"
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-150 ${
                        isCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    />
                  </button>
                )}
              </div>

              {/* Nested Child Bookmarks */}
              {!isCollapsed && group.moves.length > 0 && (
                <div className="border-border/40 divide-border/25 bg-background/50 divide-y border-t pl-3">
                  {group.moves.map((moveItem) => {
                    const isSelected = selectedIndices.has(moveItem.actionIndex);

                    // Favicon resolution
                    const faviconUrl = moveItem.url
                      ? `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
                          moveItem.url
                        )}&sz=32`
                      : null;

                    return (
                      <div
                        key={moveItem.actionIndex}
                        onClick={() => toggleIndex(moveItem.actionIndex)}
                        className={`flex cursor-pointer items-center gap-2.5 border-l-2 py-1.5 pr-2.5 pl-1.5 transition-colors duration-100 select-none ${
                          isSelected
                            ? 'border-l-primary/60 hover:bg-muted/30'
                            : 'border-l-transparent opacity-40 hover:opacity-75'
                        }`}
                      >
                        {/* Bookmark Checkbox */}
                        <div
                          className={`flex size-3 shrink-0 items-center justify-center rounded transition-colors duration-120 ${
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'border-muted-foreground/40 border'
                          }`}
                        >
                          {isSelected && <Check className="size-2 stroke-[3]" />}
                        </div>

                        {/* Favicon or Globe */}
                        {faviconUrl ? (
                          <img
                            src={faviconUrl}
                            alt=""
                            className="size-3.5 shrink-0 rounded-xs"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <Globe className="text-muted-foreground size-3.5 shrink-0" />
                        )}

                        {/* Title & Domain & Before ➔ After indicator */}
                        <div className="flex min-w-0 flex-1 flex-col py-0.5">
                          <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="text-foreground truncate text-[11.5px] font-medium">
                              {moveItem.bookmarkTitle}
                            </span>
                            {moveItem.domain && (
                              <span className="text-muted-foreground/70 max-w-[120px] truncate font-mono text-[9px]">
                                {moveItem.domain}
                              </span>
                            )}
                          </div>
                          {/* Before ➔ After & Reason */}
                          <div className="text-muted-foreground/80 flex items-center gap-1.5 truncate text-[9.5px]">
                            {moveItem.sourcePath && (
                              <span className="text-muted-foreground/60 max-w-[140px] truncate line-through">
                                {moveItem.sourcePath}
                              </span>
                            )}
                            {moveItem.sourcePath && (
                              <span className="text-muted-foreground/40 shrink-0">➔</span>
                            )}
                            <span className="text-foreground/90 max-w-[140px] truncate font-medium">
                              {group.title}
                            </span>
                            {moveItem.reason && (
                              <span className="text-primary/75 max-w-[180px] shrink-0 truncate italic">
                                • {moveItem.reason}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* 2. Renames Section */}
        {renames.length > 0 && (
          <div className="border-border/70 bg-card overflow-hidden rounded-xl border shadow-2xs">
            <div className="bg-muted/25 text-foreground flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold">
              <Edit3 className="size-3 text-amber-500" />
              <span>{t('renameBadge')}</span>
              <span className="text-muted-foreground text-[10px] font-normal">
                ({renames.length})
              </span>
            </div>
            <div className="divide-border/25 bg-background/50 divide-y">
              {renames.map((r) => {
                const isSelected = selectedIndices.has(r.actionIndex);
                return (
                  <div
                    key={r.actionIndex}
                    onClick={() => toggleIndex(r.actionIndex)}
                    className={`hover:bg-muted/20 flex cursor-pointer items-center gap-2 px-2.5 py-1.5 select-none ${
                      isSelected ? '' : 'opacity-40'
                    }`}
                  >
                    <div
                      className={`flex size-3 shrink-0 items-center justify-center rounded ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40 border'
                      }`}
                    >
                      {isSelected && <Check className="size-2 stroke-[3]" />}
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      {r.oldTitle && (
                        <span className="text-muted-foreground/70 mr-1.5 line-through">
                          {r.oldTitle}
                        </span>
                      )}
                      <span className="text-foreground font-medium">{r.newTitle}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Removes Section */}
        {removes.length > 0 && (
          <div className="border-border/70 bg-card overflow-hidden rounded-xl border shadow-2xs">
            <div className="bg-muted/25 text-destructive flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold">
              <Trash2 className="size-3" />
              <span>{t('removeBadge')}</span>
              <span className="text-muted-foreground text-[10px] font-normal">
                ({removes.length})
              </span>
            </div>
            <div className="divide-border/25 bg-background/50 divide-y">
              {removes.map((rm) => {
                const isSelected = selectedIndices.has(rm.actionIndex);
                return (
                  <div
                    key={rm.actionIndex}
                    onClick={() => toggleIndex(rm.actionIndex)}
                    className={`hover:bg-muted/20 flex cursor-pointer items-center gap-2 px-2.5 py-1.5 select-none ${
                      isSelected ? '' : 'opacity-40'
                    }`}
                  >
                    <div
                      className={`flex size-3 shrink-0 items-center justify-center rounded ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40 border'
                      }`}
                    >
                      {isSelected && <Check className="size-2 stroke-[3]" />}
                    </div>
                    <span className="text-destructive truncate text-[11px] font-medium">
                      {rm.title || `ID: ${rm.id}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Footer with Safety Notice & Action Buttons */}
      <div className="bg-muted/25 border-border/70 space-y-2 border-t p-2.5">
        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px]">
          <ShieldCheck className="size-3.5 shrink-0 text-emerald-500" />
          <span>{t('safetyNotice')}</span>
        </div>

        <div className="flex items-center justify-end gap-1.5 pt-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={isApplying}
            className="h-7 cursor-pointer px-3 text-xs transition-all duration-120 active:scale-[0.97]"
          >
            {t('cancelBtn')}
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={isApplying || selectedIndices.size === 0}
            className="bg-primary text-primary-foreground h-7 cursor-pointer gap-1.5 px-3.5 text-xs font-medium shadow-xs transition-all duration-120 active:scale-[0.97]"
          >
            {isApplying ? (
              <span>{t('applyingBtn')}</span>
            ) : (
              <span>{t('applySelectedBtn', { count: selectedIndices.size })}</span>
            )}
          </Button>
        </div>
      </div>

      {/* Raw AI JSON / DSL Inspector Modal */}
      <Dialog open={isRawModalOpen} onOpenChange={setIsRawModalOpen}>
        <DialogContent className="bg-card border-border/80 flex max-h-[85vh] max-w-lg flex-col border p-4 shadow-xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                <Code2 className="text-primary size-4" />
                <span>Raw AI Inspector</span>
              </DialogTitle>
              <Badge variant="outline" className="font-mono text-[10px]">
                {plan.actions.length} actions
              </Badge>
            </div>
            <DialogDescription className="text-muted-foreground text-xs">
              Inspect the exact prompt DSL sent to the LLM and the raw JSON plan returned.
            </DialogDescription>
          </DialogHeader>

          {/* Sub-tabs: Raw JSON vs Input DSL */}
          <div className="border-border/50 flex items-center justify-between border-b pb-2">
            <div className="bg-muted/40 flex items-center gap-1 rounded-lg p-0.5 select-none">
              <button
                onClick={() => setRawTab('json')}
                className={`cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  rawTab === 'json'
                    ? 'bg-card text-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Raw AI JSON ({plan.actions.length})
              </button>
              <button
                onClick={() => setRawTab('dsl')}
                className={`cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                  rawTab === 'dsl'
                    ? 'bg-card text-foreground font-semibold shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Input Tree DSL
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyRaw}
              className="h-6 cursor-pointer px-2 text-[11px] active:scale-95"
            >
              {isCopied ? (
                <Check className="mr-1 size-3 text-emerald-500" />
              ) : (
                <Copy className="mr-1 size-3" />
              )}
              {isCopied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          {/* Code Block Container */}
          <div className="selection:bg-primary/30 max-h-[50vh] flex-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-200">
            <pre className="break-all whitespace-pre-wrap">
              {rawTab === 'json'
                ? plan.rawJson || JSON.stringify(plan, null, 2)
                : plan.rawDsl || 'No DSL captured'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
