import { Check, ChevronDown, ChevronRight, Folder, FolderTree, Sliders, X } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CUSTOM_METHODOLOGY_ID,
  METHODOLOGY_PRESETS,
  type MethodologyPreset,
} from '@/lib/methodologies';

interface MethodologySelectorProps {
  lang: 'tr' | 'en';
  onSelectMethodology: (preset: MethodologyPreset | null) => void;
  onSelectCustomFolders: (folders: string[]) => void;
  activeMethodologyId?: string | null;
  customFolders: string[];
  isOpen: boolean;
  onClose: () => void;
}

export const MethodologySelector: React.FC<MethodologySelectorProps> = ({
  lang,
  onSelectMethodology,
  onSelectCustomFolders,
  activeMethodologyId,
  customFolders,
  isOpen,
  onClose,
}) => {
  const isTr = lang === 'tr';
  const [expandedPreviewIds, setExpandedPreviewIds] = useState<Set<string>>(new Set());
  const [customDraft, setCustomDraft] = useState<string>(() => customFolders.join(', '));

  useEffect(() => {
    setCustomDraft(customFolders.join(', '));
  }, [customFolders]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleTreePreview = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPreviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const parsedCustomFolders = customDraft
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const isCustomActive = activeMethodologyId === CUSTOM_METHODOLOGY_ID;

  return (
    <div className="bg-card/98 border-border/80 animate-in fade-in slide-in-from-top-1 relative z-30 mt-1.5 rounded-xl border p-2.5 shadow-lg backdrop-blur-md duration-150">
      {/* Popover Header */}
      <div className="border-border/50 mb-2 flex items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-1.5">
          <FolderTree className="text-primary size-3.5 shrink-0" />
          <span className="text-foreground text-[11px] font-semibold">
            {isTr ? 'Metodoloji Şablonu Seç' : 'Choose Organization Preset'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeMethodologyId && (
            <button
              type="button"
              onClick={() => {
                onSelectMethodology(null);
                onClose();
              }}
              className="text-muted-foreground hover:text-foreground cursor-pointer text-[10px] underline-offset-2 hover:underline"
            >
              {isTr ? 'Temizle' : 'Clear'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-0.5"
            aria-label={isTr ? 'Kapat' : 'Close'}
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Compact Cards List */}
      <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-0.5">
        {METHODOLOGY_PRESETS.map((preset) => {
          const isSelected = activeMethodologyId === preset.id;
          const title = isTr ? preset.shortName.tr : preset.shortName.en;
          const tagline = isTr ? preset.tagline.tr : preset.tagline.en;
          const bestFor = isTr ? preset.bestFor.tr : preset.bestFor.en;
          const previewOpen = expandedPreviewIds.has(preset.id);
          const previewLines = isTr ? preset.treePreview.tr : preset.treePreview.en;

          return (
            <div
              key={preset.id}
              role="button"
              tabIndex={0}
              title={bestFor}
              onClick={() => {
                onSelectMethodology(isSelected ? null : preset);
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectMethodology(isSelected ? null : preset);
                  onClose();
                }
              }}
              className={`group cursor-pointer rounded-lg border p-2 transition-colors duration-150 ${
                isSelected
                  ? 'border-primary/60 bg-primary/8'
                  : 'border-border/50 bg-background/60 hover:border-border hover:bg-muted/40'
              }`}
            >
              {/* Line 1: Icon + Name + Subtle Check + Preview Toggle */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="text-sm">{preset.icon}</span>
                  <span className="text-foreground truncate text-xs font-semibold">{title}</span>
                  {isSelected && <Check className="text-primary size-3.5 shrink-0 stroke-[2.5]" />}
                </div>

                <button
                  type="button"
                  onClick={(e) => toggleTreePreview(preset.id, e)}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex shrink-0 cursor-pointer items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] transition-colors"
                  title={isTr ? 'Örnek klasör ağacını gör' : 'Preview sample folder tree'}
                >
                  <span>{isTr ? 'Örnek ağaç' : 'Tree'}</span>
                  {previewOpen ? (
                    <ChevronDown className="size-2.5" />
                  ) : (
                    <ChevronRight className="size-2.5" />
                  )}
                </button>
              </div>

              {/* Line 2: Tagline */}
              <p className="text-muted-foreground mt-0.5 text-[10.5px] leading-snug">{tagline}</p>

              {/* Line 3: Max 3 Sans Folder Pills */}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {preset.structure.slice(0, 3).map((item, sIdx) => (
                  <span
                    key={sIdx}
                    className="bg-muted/70 text-foreground/85 rounded px-1.5 py-0.5 font-sans text-[10px]"
                  >
                    {item}
                  </span>
                ))}
              </div>

              {/* Expandable Sample Tree Preview */}
              {previewOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="border-border/40 bg-muted/30 text-muted-foreground mt-2 space-y-1 rounded-md border px-2 py-1.5 text-[10px]"
                >
                  <div className="text-foreground/80 flex items-center gap-1 font-medium">
                    <Folder className="size-2.5 text-amber-500" />
                    <span>{isTr ? 'Yer İmleri Çubuğu' : 'Bookmarks Bar'}</span>
                  </div>
                  {previewLines.map((line, lIdx) => (
                    <div key={lIdx} className="flex items-center gap-1.5 pl-2.5">
                      <span className="text-muted-foreground/60">
                        {lIdx === previewLines.length - 1 ? '└─' : '├─'}
                      </span>
                      <span className="truncate">{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Custom Folder Template Card */}
        <div
          className={`rounded-lg border p-2 transition-colors ${
            isCustomActive ? 'border-primary/60 bg-primary/8' : 'border-border/50 bg-background/60'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sliders className="text-primary size-3.5 shrink-0" />
              <span className="text-foreground text-xs font-semibold">
                {isTr ? 'Özel Klasör Şablonu (Custom)' : 'Custom Template'}
              </span>
              {isCustomActive && <Check className="text-primary size-3.5 shrink-0 stroke-[2.5]" />}
            </div>
          </div>
          <p className="text-muted-foreground mt-0.5 text-[10px]">
            {isTr
              ? 'Kendi ana klasör adlarını virgülle ayırarak tanımla:'
              : 'Define your own top-level folder names (comma-separated):'}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Input
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder={isTr ? 'İş, Projeler, Okuma, Araçlar' : 'Work, Projects, Reading, Tools'}
              className="bg-background/80 h-6.5 flex-1 text-[10.5px]"
            />
            <Button
              type="button"
              size="xs"
              disabled={parsedCustomFolders.length === 0}
              onClick={() => {
                onSelectCustomFolders(parsedCustomFolders);
                onClose();
              }}
              className="h-6.5 shrink-0 cursor-pointer px-2.5 text-[10px]"
            >
              {isTr ? 'Uygula' : 'Apply'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
