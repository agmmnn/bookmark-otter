import { ChevronDown, ChevronUp, Sparkles, BookOpen } from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { METHODOLOGY_PRESETS, type MethodologyPreset } from '@/lib/methodologies';

interface MethodologySelectorProps {
  lang: 'tr' | 'en';
  onSelectMethodology: (preset: MethodologyPreset) => void;
  activeMethodologyId?: string | null;
}

export const MethodologySelector: React.FC<MethodologySelectorProps> = ({
  lang,
  onSelectMethodology,
  activeMethodologyId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const isTr = lang === 'tr';

  return (
    <div className="border-border/60 bg-muted/20 rounded-lg border p-2">
      {/* Header with expand/collapse toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full cursor-pointer items-center justify-between text-left transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="text-primary size-3.5" />
          <span className="text-foreground/90 text-xs font-semibold">
            {isTr ? 'Organizasyon Metotları & Stiller' : 'Architecture Methodologies'}
          </span>
          <Badge variant="outline" className="h-4 px-1.5 font-mono text-[9px]">
            {METHODOLOGY_PRESETS.length}
          </Badge>
        </div>
        <div className="text-muted-foreground flex items-center gap-1 text-[10px]">
          <span>{isOpen ? (isTr ? 'Daralt' : 'Collapse') : isTr ? 'İncele' : 'Explore'}</span>
          {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </div>
      </button>

      {/* Quick horizontal scroll pills when collapsed */}
      {!isOpen && (
        <div className="-mx-1 mt-1.5 flex scrollbar-none gap-1 overflow-x-auto px-1 pt-0.5 pb-0.5">
          {METHODOLOGY_PRESETS.map((preset) => {
            const isSelected = activeMethodologyId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectMethodology(preset)}
                className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] transition-all duration-120 active:scale-95 ${
                  isSelected
                    ? 'border-primary/60 bg-primary/10 text-primary font-medium'
                    : 'border-border/60 bg-background/80 text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <span>{preset.icon}</span>
                <span>{isTr ? preset.name.tr : preset.name.en}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Expanded detailed cards */}
      {isOpen && (
        <div className="border-border/40 mt-2 space-y-2 border-t pt-2">
          <p className="text-muted-foreground/80 px-0.5 text-[10.5px]">
            {isTr
              ? 'Yer imi kütüphanenizi dünyaca kabul görmüş bilgi mimarisi felsefelerinden biriyle yapılandırın:'
              : 'Structure your bookmark library using battle-tested personal knowledge management (PKM) frameworks:'}
          </p>

          <div className="grid gap-1.5">
            {METHODOLOGY_PRESETS.map((preset) => {
              const isSelected = activeMethodologyId === preset.id;
              const title = isTr ? preset.name.tr : preset.name.en;
              const tagline = isTr ? preset.tagline.tr : preset.tagline.en;
              const bestFor = isTr ? preset.bestFor.tr : preset.bestFor.en;

              return (
                <div
                  key={preset.id}
                  onClick={() => onSelectMethodology(preset)}
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
                      className="h-5 px-2 text-[10px] font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMethodology(preset);
                      }}
                    >
                      {isSelected ? (isTr ? 'Seçildi' : 'Selected') : isTr ? 'Kullan' : 'Use'}
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
