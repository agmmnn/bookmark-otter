import { Trash2, RotateCcw, Folder, Globe, Clock, CheckCircle2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import {
  getTrashItems,
  restoreFromTrash,
  permanentlyDelete,
  emptyTrash,
  getDaysRemaining,
} from '@/services/trash';
import type { TrashItem } from '@/types';

interface RecycleBinProps {
  onRestored?: () => void;
}

export const RecycleBin: React.FC<RecycleBinProps> = React.memo(function RecycleBin({
  onRestored,
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showConfirmEmpty, setShowConfirmEmpty] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const trash = await getTrashItems();
      setItems(trash);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleRestore = async (item: TrashItem) => {
    setRestoringId(item.id);
    try {
      const ok = await restoreFromTrash(item.id);
      if (ok) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setSuccessToast(t('restoredSuccess') || `Restored "${item.title}"`);
        setTimeout(() => setSuccessToast(null), 3000);
        if (onRestored) onRestored();
      }
    } catch (err) {
      console.error('Failed to restore:', err);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeletePermanent = async (item: TrashItem) => {
    await permanentlyDelete(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const handleEmptyAll = async () => {
    await emptyTrash();
    setItems([]);
    setShowConfirmEmpty(false);
    setSuccessToast(t('trashEmptiedSuccess') || 'Recycle bin emptied');
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const formatDeletedAgo = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return t('justNow');
    const mins = Math.floor(diff / 60);
    if (mins < 60) return t('minutesAgo', { m: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('hoursAgo', { h: hours });
    const days = Math.floor(hours / 24);
    return t('daysAgo', { d: days });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col space-y-4 p-4">
      {/* Header Info */}
      <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              {t('recycleBinTitle') || 'Recycle Bin'}
            </h2>
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-medium">
              {items.length} {t('itemsLabel') || 'items'}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('recycleBinDesc') || 'Deleted items are kept for 30 days before permanent removal.'}
          </p>
        </div>

        {items.length > 0 && (
          <div>
            {showConfirmEmpty ? (
              <div className="animate-in fade-in flex items-center gap-1.5 duration-150">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleEmptyAll}
                  className="h-7 px-2.5 text-xs active:scale-[0.97]"
                >
                  {t('confirmEmpty') || 'Confirm Empty'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowConfirmEmpty(false)}
                  className="h-7 px-2 text-xs"
                >
                  {t('cancelBtn') || 'Cancel'}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowConfirmEmpty(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive border-border/60 h-7 text-xs active:scale-[0.97]"
              >
                <Trash2 className="mr-1 size-3" />
                {t('emptyTrashBtn') || 'Empty Trash'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Success Toast banner */}
      {successToast && (
        <div className="animate-in fade-in slide-in-from-top-1 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 duration-150 dark:text-emerald-400">
          <CheckCircle2 className="size-3.5 shrink-0" />
          <span className="truncate">{successToast}</span>
        </div>
      )}

      {/* Items list */}
      {isLoading ? (
        <div className="text-muted-foreground flex flex-col items-center justify-center space-y-2 py-16">
          <div className="border-primary size-5 animate-spin rounded-full border-2 border-t-transparent duration-500" />
          <p className="text-xs">{t('loadingLabel') || 'Loading trash...'}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="border-border/60 bg-muted/10 flex flex-col items-center justify-center rounded-xl border border-dashed p-6 py-16 text-center">
          <div className="bg-muted/40 mb-3 flex size-10 items-center justify-center rounded-full">
            <Trash2 className="text-muted-foreground/60 size-5" />
          </div>
          <h3 className="text-foreground text-sm font-medium">
            {t('trashEmptyTitle') || 'Recycle Bin is empty'}
          </h3>
          <p className="text-muted-foreground mt-1 max-w-xs text-xs">
            {t('trashEmptyDesc') ||
              'When you delete bookmarks or clean folders, they are safely backed up here for 30 days.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const daysLeft = getDaysRemaining(item.deletedAt);
            const isFolder = item.isFolder;

            return (
              <div
                key={item.id}
                className="group border-border/50 bg-card hover:border-border flex items-center justify-between gap-3 rounded-lg border p-3 transition-all duration-150 hover:shadow-2xs"
              >
                {/* Left: Icon + Info */}
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <div className="bg-muted/50 border-border/40 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border">
                    {isFolder ? (
                      <Folder className="size-4 fill-amber-500/20 text-amber-500" />
                    ) : item.url ? (
                      <img
                        src={`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
                          item.url
                        )}&sz=32`}
                        alt=""
                        className="size-4 shrink-0 rounded-xs"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Globe className="text-muted-foreground size-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-foreground max-w-[280px] truncate text-xs font-medium">
                        {item.title}
                      </span>
                      {isFolder && (
                        <Badge
                          variant="secondary"
                          className="h-4 border-amber-500/20 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-600 dark:text-amber-400"
                        >
                          {t('folderBadge') || 'Folder'}
                        </Badge>
                      )}
                    </div>

                    <div className="text-muted-foreground mt-1 flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground/80 max-w-[160px] truncate">
                        📁 {item.parentPath || 'Bookmarks Bar'}
                      </span>
                      <span>•</span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <Clock className="size-2.5" />
                        {formatDeletedAgo(item.deletedAt)}
                      </span>
                      <span>•</span>
                      <span
                        className={`shrink-0 font-medium ${
                          daysLeft <= 3
                            ? 'text-destructive font-semibold'
                            : 'text-muted-foreground/70'
                        }`}
                      >
                        {daysLeft} {t('daysLeftLabel') || 'days left'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoringId === item.id}
                    onClick={() => handleRestore(item)}
                    className="border-border/70 hover:bg-primary/10 hover:text-primary h-7 px-2.5 text-xs font-medium transition-transform duration-100 active:scale-[0.97]"
                  >
                    <RotateCcw
                      className={`mr-1 size-3 ${restoringId === item.id ? 'animate-spin' : ''}`}
                    />
                    {t('restoreBtn') || 'Restore'}
                  </Button>

                  <button
                    onClick={() => handleDeletePermanent(item)}
                    title={t('permanentDeleteTooltip') || 'Delete permanently'}
                    className="text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded-md p-1.5 transition-colors active:scale-90"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
