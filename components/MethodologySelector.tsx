import { ChevronDown, ChevronUp, Compass, BookOpen, Check, X } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { METHODOLOGY_PRESETS, type MethodologyPreset } from '@/lib/methodologies';

interface MethodologySelectorProps {
  lang: 'tr' | 'en';
  onSelectMethodology: (preset: MethodologyPreset | null) => void;
  activeMethodologyId?: string | null;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const MethodologySelector: React.FC<MethodologySelectorProps> = ({
  lang,
  onSelectMethodology,
  activeMethodologyId,
  isOpen,
  onToggleOpen,
}) => {
  const isTr = lang === 'tr';
  const activePreset = METHODOLOGY_PRESETS.find((p) => p.id === activeMethodologyId) || null;

  return (
    <div className="border-border/60 bg-muted/15 rounded-lg border p-2">
      {/* Header with expand/collapse toggle — collapsed by default (no chips exposed) */}
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left transition-colors"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <Compass className="text-primary size-3.5 shrink-0" />
          <span className="text-foreground/90 truncate text-[11px] font-semibold">
            {isTr ? 'Metodoloji Şablonları' : 'Architecture Methodologies'}
          </span>
          {activePreset ? (
            <Badge
              variant="secondary"
              className="bg-primary/15 text-primary h-4 shrink-0 gap-1 px-1.5 text-[9px] font-medium"
            >
              <span>{activePreset.icon}</span>
              <span className="max-w-[100px] truncate">
                {isTr ? activePreset.name.tr : activePreset.name.en}
              </span>
            </Badge>
          ) : (
            <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[9px]">
              {METHODOLOGY_PRESETS.length}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-1 text-[10px]">
          <span>{isOpen ? (isTr ? 'Gizle' : 'Hide') : isTr ? 'İncele' : 'Explore'}</span>
          {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </div>
      </button>

      {/* Expanded detailed preset cards (only rendered when opened) */}
      {isOpen && (
        <div className="border-border/40 mt-2 space-y-2 border-t pt-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <p className="text-muted-foreground/85 text-[10px]">
              {isTr
                ? 'İsteğinize uygulanacak klasör mimarisi stilini (Preset) seçin:'
                : 'Choose an architecture style preset to combine with your request:'}
            </p>
            {activePreset && (
              <button
                type="button"
                onClick={() => onSelectMethodology(null)}
                className="text-muted-foreground hover:text-foreground flex shrink-0 cursor-pointer items-center gap-0.5 text-[9.5px] underline"
              >
                <X className="size-2.5" />
                {isTr ? 'Temizle' : 'Clear'}
              </button>
            )}
          </div>

          <div className="grid gap-1.5">
            {METHODOLOGY_PRESETS.map((preset) => {
              const isSelected = activeMethodologyId === preset.id;
              const title = isTr ? preset.name.tr : preset.name.en;
              const tagline = isTr ? preset.tagline.tr : preset.tagline.en;
              const bestFor = isTr ? preset.bestFor.tr : preset.bestFor.en;

              return (
                <div
                  key={preset.id}
                  onClick={() => onSelectMethodology(isSelected ? null : preset)}
                  className={`group relative cursor-pointer rounded-md border p-2 transition-all duration-150 ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'border-border/60 bg-background/60 hover:border-border hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{preset.icon}</span>
                      <span className="text-foreground text-xs font-semibold">{title}</span>
                    </div>

                    <Button
                      size="sm"
                      variant={isSelected ? 'default' : 'secondary'}
                      className="h-5 gap-1 px-2 text-[10px] font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMethodology(isSelected ? null : preset);
                      }}
                    >
                      {isSelected && <Check className="size-2.5" />}
                      {isSelected ? (isTr ? 'Aktif Preset' : 'Active') : isTr ? 'Seç' : 'Use'}
                    </Button>
                  </div>

                  <p className="text-muted-foreground mt-1 text-[10.5px] leading-tight">
                    {tagline}
                  </p>

                  {/* Structure items preview */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {preset.structure.map((item, sIdx) => (
                      <span
                        key={sIdx}
                        className="bg-muted/70 text-foreground/80 rounded px-1.5 py-0.5 font-mono text-[9px]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>

                  {/* Target audience */}
                  <div className="text-muted-foreground/75 mt-1.5 flex items-center gap-1 text-[9.5px]">
                    <BookOpen className="size-2.5 shrink-0" />
                    <span className="truncate">{bestFor}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
