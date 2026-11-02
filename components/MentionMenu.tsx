import { Folder, Globe, AtSign } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

import { Badge } from '@/components/ui/badge';

export interface MentionItem {
  id: string;
  type: 'folder' | 'bookmark';
  title: string;
  path?: string;
  url?: string;
  domain?: string;
}

interface MentionMenuProps {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
  onClose: () => void;
}

export const MentionMenu: React.FC<MentionMenuProps> = ({
  items,
  selectedIndex,
  onSelect,
  onClose: _onClose,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep selected item scrolled into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (items.length === 0) {
    return (
      <div className="border-border/80 bg-popover/95 text-muted-foreground animate-in fade-in-0 zoom-in-95 absolute right-0 bottom-full left-0 z-50 mb-1.5 rounded-lg border p-3 text-center text-xs shadow-lg backdrop-blur-md duration-100">
        No folders or bookmarks match this mention.
      </div>
    );
  }

  return (
    <div className="border-border/80 bg-popover/95 animate-in fade-in-0 zoom-in-95 absolute right-0 bottom-full left-0 z-50 mb-1.5 overflow-hidden rounded-xl border text-xs shadow-xl backdrop-blur-md transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]">
      {/* Menu Header hint */}
      <div className="bg-muted/30 border-border/50 text-muted-foreground flex items-center justify-between border-b px-2.5 py-1.5 text-[10.5px] select-none">
        <span className="text-foreground/80 flex items-center gap-1 font-medium">
          <AtSign className="text-primary size-3" />
          Mention Target
        </span>
        <span className="font-mono text-[9px] opacity-75">
          ↑↓ Navigate · Enter Select · Esc Cancel
        </span>
      </div>

      {/* Items List */}
      <div ref={listRef} className="divide-border/20 max-h-48 divide-y overflow-y-auto p-1">
        {items.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          const isFolder = item.type === 'folder';

          const faviconUrl = item.url
            ? `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(item.url)}&sz=32`
            : null;

          return (
            <div
              key={`${item.type}_${item.id}`}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent textarea blur
                onSelect(item);
              }}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 transition-colors duration-100 select-none ${
                isSelected
                  ? 'bg-primary/15 text-foreground font-medium'
                  : 'hover:bg-muted/40 text-foreground/90'
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {/* Icon */}
                {isFolder ? (
                  <Folder className="size-3.5 shrink-0 fill-amber-500/20 text-amber-500" />
                ) : faviconUrl ? (
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

                {/* Title */}
                <span className="truncate text-xs">{item.title}</span>

                {/* Domain or Path */}
                {item.domain && (
                  <span className="text-muted-foreground max-w-[100px] truncate font-mono text-[10px]">
                    {item.domain}
                  </span>
                )}
              </div>

              {/* Type Badge */}
              <Badge
                variant={isFolder ? 'default' : 'secondary'}
                className={`h-3.5 shrink-0 px-1 py-0 text-[9px] font-normal ${
                  isFolder
                    ? 'border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground'
                }`}
              >
                {isFolder ? 'Folder' : 'Bookmark'}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
};
