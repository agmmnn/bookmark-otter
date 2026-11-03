import {
  Send,
  Loader2,
  Wand2,
  CheckCircle2,
  AlertCircle,
  CornerDownLeft,
  Edit2,
  AtSign,
  Sparkles,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import {
  runMultiStepAgentHarness,
  shouldUseAgentHarness,
  type AgentProgress,
} from '@/services/agentHarness';
import { generateReorganizationPlan } from '@/services/ai';
import {
  getBookmarkTree,
  getSmartTreeDSL,
  flattenBookmarks,
  getAllFolders,
  executePlan,
} from '@/services/bookmarks';
import { getSettings, hasConfiguredKey } from '@/services/storage';
import type { FlatBookmark, FlatFolder, ReorgAction, ReorgPlan } from '@/types';

import { DiffPreview } from './DiffPreview';
import { MentionMenu, type MentionItem } from './MentionMenu';

interface AICopilotProps {
  onPlanApplied: () => void;
  onOpenSettings: () => void;
}

export const AICopilot: React.FC<AICopilotProps> = React.memo(function AICopilot({
  onPlanApplied,
  onOpenSettings,
}) {
  const { t, lang } = useI18n();
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<ReorgPlan | null>(null);
  const [bookmarkMap, setBookmarkMap] = useState<Map<string, FlatBookmark>>(new Map());
  const [folderMap, setFolderMap] = useState<Map<string, FlatFolder>>(new Map());
  const [analyzedCount, setAnalyzedCount] = useState<number>(0);
  const [scopeType, setScopeType] = useState<'targeted' | 'clustered' | 'full'>('full');
  const [targetedNames, setTargetedNames] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState<{
    count: number;
    snapshotId: string;
  } | null>(null);

  // Mention State (@ target specification)
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [availableFolders, setAvailableFolders] = useState<FlatFolder[]>([]);
  const [availableBookmarks, setAvailableBookmarks] = useState<FlatBookmark[]>([]);
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  // Load user's folders and bookmarks for @ mentions
  const loadMentionTargets = async () => {
    try {
      const tree = await getBookmarkTree();
      setAvailableFolders(getAllFolders(tree).filter((f) => f.id !== '0'));
      setAvailableBookmarks(
        flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'))
      );
    } catch (err) {
      console.warn('Could not load mention targets:', err);
    }
  };

  useEffect(() => {
    loadMentionTargets();
  }, []);

  // Filter mention targets dynamically
  const filteredMentions = useMemo((): MentionItem[] => {
    const q = mentionQuery.toLowerCase().trim();

    const folderItems: MentionItem[] = availableFolders
      .filter((f) => !q || f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .map((f) => ({
        id: f.id,
        type: 'folder',
        title: f.title,
        path: f.path,
      }));

    const bookmarkItems: MentionItem[] = availableBookmarks
      .filter((b) => !q || b.title.toLowerCase().includes(q) || b.domain.toLowerCase().includes(q))
      .map((b) => ({
        id: b.id,
        type: 'bookmark',
        title: b.title,
        path: b.path,
        url: b.url,
        domain: b.domain,
      }));

    // Folders first, then bookmarks (up to 8 total for quick browsing)
    return [...folderItems, ...bookmarkItems].slice(0, 8);
  }, [availableFolders, availableBookmarks, mentionQuery]);

  // Handle typing & @ trigger in Textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setPromptText(val);

    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const atMatch = textBefore.match(/@([^\s@"']*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1] || '');
      setIsMentionOpen(true);
      setMentionSelectedIndex(0);
    } else {
      setIsMentionOpen(false);
    }
  };

  // Select a mention item and insert @"Name"
  const handleSelectMention = (item: MentionItem) => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart;
    const textBefore = promptText.slice(0, cursor);
    const textAfter = promptText.slice(cursor);

    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex !== -1) {
      const replacement = `@"${item.title}" `;
      const newTextBefore = textBefore.slice(0, atIndex) + replacement;
      const newPrompt = newTextBefore + textAfter;
      setPromptText(newPrompt);
      setIsMentionOpen(false);

      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = newTextBefore.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 10);
    }
  };

  // Keyboard navigation for mentions & Cmd+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMentionOpen && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex(
          (prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const target = filteredMentions[mentionSelectedIndex];
        if (target) handleSelectMention(target);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsMentionOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleGeneratePlan(promptText);
    }
  };

  // Clickable @ button helper
  const handleTriggerMentionClick = () => {
    if (!textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart || promptText.length;
    const textBefore = promptText.slice(0, cursor);
    const textAfter = promptText.slice(cursor);
    const newPrompt = textBefore + '@' + textAfter;
    setPromptText(newPrompt);
    setMentionQuery('');
    setIsMentionOpen(true);
    setMentionSelectedIndex(0);

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = cursor + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 10);
  };

  const handleGeneratePlan = async (userPrompt: string) => {
    if (!userPrompt.trim()) return;
    setIsLoading(true);
    setError(null);
    setAppliedSuccess(null);
    setCurrentPlan(null);

    try {
      const settings = await getSettings();
      const hasKey = hasConfiguredKey(settings);

      if (!hasKey) {
        setError(t('enterKeyPrompt'));
        setIsLoading(false);
        return;
      }

      // 1. Get smart tree DSL with @mention scoping & domain pre-clustering
      const tree = await getBookmarkTree();
      const flats = flattenBookmarks(tree);
      const folders = getAllFolders(tree);

      const bMap = new Map<string, FlatBookmark>();
      for (const b of flats) {
        bMap.set(b.id, b);
      }
      setBookmarkMap(bMap);

      const fMap = new Map<string, FlatFolder>();
      for (const f of folders) {
        fMap.set(f.id, f);
      }
      setFolderMap(fMap);

      const smartDsl = getSmartTreeDSL(tree, userPrompt);
      setAnalyzedCount(smartDsl.analyzedCount);
      setScopeType(smartDsl.scopeType);
      setTargetedNames(smartDsl.targetFolderNames || []);

      // 2. Select execution mode: Multi-Step Agent Harness (for global library) or Scoped Single-Shot
      const useHarness = shouldUseAgentHarness(userPrompt, flats.length, smartDsl.scopeType);
      let plan: ReorgPlan;

      if (useHarness) {
        setAgentProgress({
          phase: 'architect',
          message:
            lang === 'tr'
              ? 'Mimar: Kütüphane analizi yapılıyor ve taksonomi tasarlanıyor...'
              : 'Architect: Analyzing library structure and designing taxonomy...',
          percentage: 10,
        });

        plan = await runMultiStepAgentHarness({
          userPrompt,
          tree,
          onProgress: (p) => setAgentProgress(p),
        });
      } else {
        plan = await generateReorganizationPlan({
          userPrompt,
          compactTreeDSL: smartDsl.dsl,
          tree,
        });
      }

      setCurrentPlan(plan);
    } catch (err: any) {
      console.error('Plan generation failed:', err);
      setError(err?.message || 'Plan generation failed.');
    } finally {
      setIsLoading(false);
      setAgentProgress(null);
    }
  };

  const handleApplyPlan = async (selectedActions: ReorgAction[]) => {
    if (!currentPlan) return;
    setIsApplying(true);
    try {
      const result = await executePlan(currentPlan, selectedActions);
      setAppliedSuccess({
        count: result.appliedCount,
        snapshotId: result.snapshotId,
      });
      setCurrentPlan(null);
      setPromptText('');
      await loadMentionTargets(); // Refresh folders for future mentions
      onPlanApplied();
    } catch (err: any) {
      console.error('Plan execution failed:', err);
      setError('An error occurred while executing plan actions.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-3 p-3">
      {/* 1. Header: Shows Greeting Card when no plan, or Compact Query Chip when plan is generated */}
      {!currentPlan ? (
        <div className="border-border/60 from-card via-card to-muted/20 rounded-lg border bg-gradient-to-br px-3 py-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary shrink-0 rounded-md p-1">
              <Wand2 className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-foreground text-[11.5px] font-semibold tracking-tight">
                {t('reorganizeCardTitle')}
              </h3>
              <p className="text-muted-foreground/80 truncate text-[10px]">
                {t('reorganizeCardDesc')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Compact Query Chip - saves 110px of vertical space */
        <div className="bg-muted/30 border-border/60 animate-in fade-in flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs duration-150">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Wand2 className="text-primary size-3.5 shrink-0" />
            <span className="text-foreground truncate text-xs font-medium">"{promptText}"</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCurrentPlan(null)}
            className="text-muted-foreground hover:text-foreground h-6 cursor-pointer px-2 text-[11px] active:scale-[0.97]"
          >
            <Edit2 className="mr-1 size-3" />
            {t('editPromptBtn') || 'Edit'}
          </Button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="bg-destructive/10 border-destructive/20 text-destructive animate-in fade-in-0 flex items-center justify-between gap-2 rounded-lg border p-2 text-[11px] duration-150">
          <div className="flex min-w-0 items-center gap-1.5">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
          {(error.includes('API') || error.includes('Key')) && (
            <Button
              size="xs"
              variant="outline"
              onClick={onOpenSettings}
              className="h-5 shrink-0 cursor-pointer px-1.5 text-[9.5px] active:scale-95"
            >
              {t('enterKeyBtn')}
            </Button>
          )}
        </div>
      )}

      {/* Success Alert */}
      {appliedSuccess && (
        <div className="animate-in fade-in-0 flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-700 duration-150 dark:text-emerald-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            <span className="leading-tight">
              {t('actionsAppliedSuccess', { count: appliedSuccess.count })}
            </span>
          </div>
        </div>
      )}

      {/* Plan Preview Section */}
      {currentPlan && (
        <DiffPreview
          plan={currentPlan}
          bookmarkMap={bookmarkMap}
          folderMap={folderMap}
          totalBookmarksCount={analyzedCount || availableBookmarks.length}
          scopeType={scopeType}
          targetedNames={targetedNames}
          onApply={handleApplyPlan}
          onCancel={() => setCurrentPlan(null)}
          isApplying={isApplying}
        />
      )}

      {/* Real-time Agent Harness Progress Card */}
      {isLoading && (
        <div className="border-border/70 from-card via-card to-primary/5 animate-in fade-in-0 zoom-in-95 space-y-2 rounded-xl border bg-gradient-to-br p-3 shadow-xs duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg">
                <Sparkles className="size-4 animate-spin duration-1000" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground text-xs font-semibold">
                    {agentProgress ? t('agentHarnessBadge') : t('copilotBadge')}
                  </span>
                  {agentProgress && (
                    <span className="bg-primary/10 text-primary border-primary/20 py-0.2 rounded border px-1.5 font-mono text-[9px] font-medium">
                      {agentProgress.phase === 'architect'
                        ? t('agentPhaseArchitect')
                        : agentProgress.phase === 'routing'
                          ? t('agentPhaseRouting')
                          : agentProgress.phase === 'synthesizing'
                            ? t('agentPhaseSynthesizing')
                            : t('agentPhaseDone')}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground truncate text-[11px] leading-tight">
                  {agentProgress?.message ||
                    (lang === 'tr'
                      ? 'Eylem planı hazırlanıyor...'
                      : 'Generating reorganization plan...')}
                </p>
              </div>
            </div>
            {agentProgress?.percentage !== undefined && (
              <span className="text-primary font-mono text-xs font-bold">
                %{agentProgress.percentage}
              </span>
            )}
          </div>

          {/* Animated Progress Bar */}
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${agentProgress?.percentage ?? 45}%` }}
            />
          </div>
        </div>
      )}

      {/* Prompt Input Form */}
      {!currentPlan && (
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="text-muted-foreground/90 flex items-center justify-between text-[10.5px]">
              <span className="text-foreground/80 font-medium">{t('requestLabel')}</span>
              <span className="font-mono text-[9.5px] opacity-75">{t('languageHint')}</span>
            </div>

            {/* Relative container for Textarea + @ Mention Popup */}
            <div className="group relative">
              {/* @ Mention Autocomplete Menu */}
              {isMentionOpen && (
                <MentionMenu
                  items={filteredMentions}
                  selectedIndex={mentionSelectedIndex}
                  onSelect={handleSelectMention}
                  onClose={() => setIsMentionOpen(false)}
                />
              )}

              <Textarea
                ref={textareaRef}
                value={promptText}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  lang === 'tr'
                    ? "Örn: @IPA klasörüne dokunma, @needfix içindekileri dağıt, @antfu/taze'yi @Development'a taşı..."
                    : 'e.g. Do not touch @"needfix", merge @"other" into @"Development", move @"antfu/taze"...'
                }
                className="border-border/80 focus-visible:border-ring min-h-[90px] resize-none pr-16 pb-7 text-xs transition-shadow duration-150 focus-visible:ring-1"
                disabled={isLoading}
              />

              {/* Bottom Right Actions inside Textarea */}
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {/* Clickable @ Mention pill */}
                <button
                  type="button"
                  onClick={handleTriggerMentionClick}
                  title="Mention target folder or bookmark (@)"
                  className="bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border-border/50 flex cursor-pointer items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors active:scale-95"
                >
                  <AtSign className="text-primary size-2.5" />
                  <span>Target</span>
                </button>

                <span className="text-muted-foreground/60 hidden items-center gap-0.5 font-mono text-[9px] select-none group-focus-within:inline-flex">
                  ⌘<CornerDownLeft className="size-2.5" />
                </span>

                <Button
                  size="sm"
                  variant="default"
                  disabled={isLoading || !promptText.trim()}
                  onClick={() => handleGeneratePlan(promptText)}
                  className="bg-primary text-primary-foreground size-6 cursor-pointer p-0 transition-transform duration-120 active:scale-95"
                  title={t('generatePlanTooltip')}
                >
                  {isLoading ? (
                    <Loader2 className="size-3 animate-spin duration-500" />
                  ) : (
                    <Send className="size-2.5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Helpful Mention Tip */}
            <p className="text-muted-foreground/75 flex items-center gap-1 px-1 text-[10px]">
              <span>💡</span>
              <span>
                {lang === 'tr'
                  ? 'İpucu: Klasör veya yer imi hedeflemek için @ yazın (Örn: @"IPA" dokunma)'
                  : 'Tip: Type @ to mention a folder or bookmark (e.g. do not touch @"needfix")'}
              </span>
            </p>

            {/* Quick Prompt Recipe Chips */}
            <div className="space-y-1.5 pt-2">
              <span className="text-muted-foreground/80 block px-1 text-[9.5px] font-semibold tracking-wider uppercase">
                {lang === 'tr' ? 'Hızlı Komut Reçeteleri' : 'Quick Recipes'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(lang === 'tr'
                  ? [
                      {
                        icon: '⚡',
                        label: 'Tümünü Düzenle',
                        prompt:
                          'Tüm yer imlerimi analiz et ve 6-8 ana tematik klasör altında baştan sona düzenle.',
                      },
                      {
                        icon: '🧹',
                        label: 'Dağınıkları toparla',
                        prompt:
                          'Yer İmleri Çubuğundaki dağınık tüm yer imlerini kategorik klasörlere taşı.',
                      },
                      {
                        icon: '🏷️',
                        label: 'Başlıkları sadeleştir',
                        prompt:
                          'Gereksiz uzun veya URL şeklindeki yer imi başlıklarını temiz ve tanınabilir yap.',
                      },
                      {
                        icon: '📁',
                        label: 'Klasörleri birleştir',
                        prompt:
                          'Benzer konudaki dağınık alt klasörleri ana başlıklar altında birleştir.',
                      },
                      {
                        icon: '🚫',
                        label: 'Özel klasörü koru',
                        prompt: 'Dağınıkları düzenle ama @"needfix" klasörüne asla dokunma.',
                      },
                    ]
                  : [
                      {
                        icon: '⚡',
                        label: 'Edit All',
                        prompt:
                          'Analyze all bookmarks and reorganize the entire library into cohesive thematic folders.',
                      },
                      {
                        icon: '🧹',
                        label: 'Triage loose bookmarks',
                        prompt:
                          'Organize unfiled and loose bookmarks on the Bookmarks Bar into structured folders.',
                      },
                      {
                        icon: '🏷️',
                        label: 'Clean up titles',
                        prompt:
                          'Simplify and shorten verbose or raw URL bookmark titles into clean, recognizable names.',
                      },
                      {
                        icon: '📁',
                        label: 'Merge redundant folders',
                        prompt:
                          'Merge scattered single-topic folders into cohesive thematic parent folders.',
                      },
                      {
                        icon: '🚫',
                        label: 'Immune specific folder',
                        prompt: 'Organize loose bookmarks but do not touch @"needfix".',
                      },
                    ]
                ).map((recipe, rIdx) => (
                  <button
                    key={rIdx}
                    type="button"
                    onClick={() => {
                      setPromptText(recipe.prompt);
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                      }
                    }}
                    className="bg-muted/30 hover:bg-muted/70 text-muted-foreground hover:text-foreground border-border/50 flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] transition-all duration-120 active:scale-[0.96]"
                  >
                    <span>{recipe.icon}</span>
                    <span>{recipe.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
