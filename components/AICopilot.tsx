import {
  Send,
  Loader2,
  Wand2,
  CheckCircle2,
  AlertCircle,
  Edit2,
  AtSign,
  Sparkles,
  RotateCcw,
  History,
  Folder,
  Compass,
  Search,
  X,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import { METHODOLOGY_PRESETS } from '@/lib/methodologies';
import { formatFolderTitle, isEmojiOnlyTitle } from '@/lib/utils';
import { generatePlanViaBackground, shouldUseAgentHarness } from '@/services/aiClient';
import {
  getBookmarkTree,
  getSmartTreeDSL,
  flattenBookmarks,
  getAllFolders,
  executePlan,
  restoreSnapshot,
} from '@/services/bookmarks';
import { getSettings, hasConfiguredKey, getSnapshots, popLatestSnapshot } from '@/services/storage';
import type {
  AgentProgress,
  FlatBookmark,
  FlatFolder,
  ReorgAction,
  ReorgPlan,
  TreeSnapshot,
} from '@/types';

import { DiffPreview } from './DiffPreview';
import { MentionMenu, type MentionItem } from './MentionMenu';
import { MethodologySelector } from './MethodologySelector';

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
  const [activeMethodologyId, setActiveMethodologyId] = useState<string | null>(null);
  const [isMethodologiesOpen, setIsMethodologiesOpen] = useState(false);
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  const [showAllMentionFolders, setShowAllMentionFolders] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState<{
    count: number;
    snapshotId: string;
  } | null>(null);

  // Mention State (@ target specification)
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [availableFolders, setAvailableFolders] = useState<FlatFolder[]>([]);
  const [availableBookmarks, setAvailableBookmarks] = useState<FlatBookmark[]>([]);
  const [recentSnapshots, setRecentSnapshots] = useState<TreeSnapshot[]>([]);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  // Load user's folders and bookmarks for @ mentions
  const loadMentionTargets = async () => {
    try {
      const [tree, snaps] = await Promise.all([getBookmarkTree(), getSnapshots()]);
      setAvailableFolders(getAllFolders(tree).filter((f) => f.id !== '0'));
      setAvailableBookmarks(
        flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'))
      );
      setRecentSnapshots(snaps);
    } catch (err) {
      console.warn('Could not load mention targets:', err);
    }
  };

  const handleUndoLatestSnapshot = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    try {
      const snap = await popLatestSnapshot();
      if (snap) {
        await restoreSnapshot(snap);
        await loadMentionTargets();
        onPlanApplied();
        setAppliedSuccess(null);
        toast.success(
          t('undoSuccess') ||
            (lang === 'tr' ? 'Değişiklikler geri alındı!' : 'Changes reverted successfully!')
        );
      }
    } catch (err) {
      console.error('Failed to undo snapshot:', err);
    } finally {
      setIsUndoing(false);
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

  const activeMethodology = useMemo(
    () => METHODOLOGY_PRESETS.find((p) => p.id === activeMethodologyId) || null,
    [activeMethodologyId]
  );

  const canSubmit = Boolean(promptText.trim() || activeMethodology);

  const handleGeneratePlan = async (rawPrompt: string) => {
    const trimmed = rawPrompt.trim();
    const methodologyRule = activeMethodology
      ? lang === 'tr'
        ? activeMethodology.prompt.tr
        : activeMethodology.prompt.en
      : '';

    const effectivePrompt = trimmed
      ? methodologyRule
        ? `${trimmed}\n\n[Architecture Preset: ${
            lang === 'tr' ? activeMethodology!.name.tr : activeMethodology!.name.en
          }] ${methodologyRule}`
        : trimmed
      : methodologyRule;

    if (!effectivePrompt.trim()) return;
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

      const smartDsl = getSmartTreeDSL(tree, effectivePrompt);
      setAnalyzedCount(smartDsl.analyzedCount);
      setScopeType(smartDsl.scopeType);
      setTargetedNames(smartDsl.targetFolderNames || []);

      // 2. Select execution mode: Multi-Step Agent Harness (for global library) or Scoped Single-Shot
      const useHarness = shouldUseAgentHarness(effectivePrompt, flats.length, smartDsl.scopeType);
      if (useHarness) {
        setAgentProgress({
          phase: 'architect',
          message:
            lang === 'tr'
              ? 'Mimar: Kütüphane analizi yapılıyor ve taksonomi tasarlanıyor...'
              : 'Architect: Analyzing library structure and designing taxonomy...',
          percentage: 10,
        });
      }

      const plan = await generatePlanViaBackground({
        userPrompt: effectivePrompt,
        tree,
        compactTreeDSL: smartDsl.dsl,
        useHarness,
        onProgress: useHarness ? (p) => setAgentProgress(p) : undefined,
      });

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
      toast.success(t('actionsAppliedSuccess', { count: result.appliedCount }), {
        action: {
          label: t('undoBtn') || (lang === 'tr' ? 'Geri Al' : 'Undo'),
          onClick: () => handleUndoLatestSnapshot(),
        },
      });
    } catch (err: any) {
      console.error('Plan execution failed:', err);
      setError('An error occurred while executing plan actions.');
    } finally {
      setIsApplying(false);
    }
  };

  const recipes = useMemo(
    () =>
      lang === 'tr'
        ? [
            {
              icon: '⚡',
              label: 'Kütüphaneyi düzenle',
              prompt:
                'Tüm yer imlerimi analiz et ve 6-8 ana tematik klasör altında baştan sona düzenle.',
            },
            {
              icon: '🎯',
              label: 'Favicon Launchpad',
              prompt:
                'Yer İmleri Çubuğundaki doğrudan web araçlarının başlıklarını temizle, yalnızca favicon ikonları bırak.',
            },
            {
              icon: '🧹',
              label: 'Dağınıkları toparla',
              prompt: 'Yer İmleri Çubuğundaki dağınık tüm yer imlerini kategorik klasörlere taşı.',
            },
            {
              icon: '🛡️',
              label: 'Klasörü koru',
              prompt: 'Dağınıkları düzenle ama @"needfix" klasörüne asla dokunma.',
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
              prompt: 'Benzer konudaki dağınık alt klasörleri ana başlıklar altında birleştir.',
            },
          ]
        : [
            {
              icon: '⚡',
              label: 'Organize library',
              prompt:
                'Analyze all bookmarks and reorganize the entire library into cohesive thematic folders.',
            },
            {
              icon: '🎯',
              label: 'Favicon Launchpad',
              prompt:
                'Strip text titles of direct bookmarks bar web apps, leaving only clean favicon icons.',
            },
            {
              icon: '🧹',
              label: 'Triage loose',
              prompt:
                'Organize unfiled and loose bookmarks on the Bookmarks Bar into structured folders.',
            },
            {
              icon: '🛡️',
              label: 'Protect folder',
              prompt: 'Organize loose bookmarks but do not touch @"needfix".',
            },
            {
              icon: '🏷️',
              label: 'Clean titles',
              prompt:
                'Simplify and shorten verbose or raw URL bookmark titles into clean, recognizable names.',
            },
            {
              icon: '📁',
              label: 'Merge folders',
              prompt: 'Merge scattered single-topic folders into cohesive thematic parent folders.',
            },
          ],
    [lang]
  );

  const mentionableFolders = useMemo(() => {
    const q = folderSearchQuery.trim().toLowerCase();
    return availableFolders.filter((f) => {
      if (f.id === '1' || f.id === '2') return false;
      if (!q) return true;
      return f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
    });
  }, [availableFolders, folderSearchQuery]);

  const visibleMentionFolders = useMemo(
    () => (showAllMentionFolders ? mentionableFolders : mentionableFolders.slice(0, 10)),
    [mentionableFolders, showAllMentionFolders]
  );

  const remainingFolderCount = Math.max(
    0,
    mentionableFolders.length - visibleMentionFolders.length
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col space-y-3 p-3">
      {/* 1. Compact 1-line Header */}
      {!currentPlan ? (
        <div className="flex items-center gap-1.5 px-0.5">
          <Wand2 className="text-primary size-3.5 shrink-0" />
          <h2 className="text-foreground truncate text-xs font-semibold tracking-tight">
            {t('reorganizeCardTitle')}
          </h2>
        </div>
      ) : (
        /* Compact Query Chip - saves vertical space when plan preview is active */
        <div className="bg-muted/30 border-border/60 animate-in fade-in flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs duration-150">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Wand2 className="text-primary size-3.5 shrink-0" />
            <span className="text-foreground truncate text-xs font-medium">
              &quot;
              {promptText.trim() ||
                (activeMethodology
                  ? lang === 'tr'
                    ? activeMethodology.name.tr
                    : activeMethodology.name.en
                  : '')}
              &quot;
            </span>
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

      {/* Main Flow: Prompt Input → Quick Recipes → Methodologies → Mention a folder */}
      {!currentPlan && (
        <div className="flex flex-1 flex-col space-y-3">
          {/* 1. Prompt Input Box */}
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
                  ? 'Doğal Türkçe veya İngilizce yazın — hedeflemek için @ kullanın (ör. @"needfix" dokunma, @"dev" düzenle)...'
                  : 'Write in English or Turkish — type @ to target folders or links (e.g. protect @"needfix", group into @"Dev")...'
              }
              className="border-border/80 focus-visible:border-ring min-h-[92px] resize-none pr-12 pb-9 text-xs transition-shadow duration-150 focus-visible:ring-1"
              disabled={isLoading}
            />

            {/* Bottom Toolbar inside Textarea */}
            <div className="absolute right-2 bottom-2 left-2 flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1">
                {/* Clickable @ Target pill */}
                <button
                  type="button"
                  onClick={handleTriggerMentionClick}
                  title={
                    lang === 'tr'
                      ? 'Klasör veya yer imi hedefle (@)'
                      : 'Mention target folder or bookmark (@)'
                  }
                  className="bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border-border/50 flex shrink-0 cursor-pointer items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] transition-colors active:scale-95"
                >
                  <AtSign className="text-primary size-2.5" />
                  <span>Target</span>
                </button>

                {/* Preset selector pill */}
                {activeMethodology ? (
                  <span className="border-primary/40 bg-primary/10 text-primary flex max-w-[140px] items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium">
                    <span className="shrink-0">{activeMethodology.icon}</span>
                    <span className="truncate">
                      {lang === 'tr' ? activeMethodology.name.tr : activeMethodology.name.en}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveMethodologyId(null)}
                      className="hover:text-foreground ml-0.5 cursor-pointer"
                      title={lang === 'tr' ? 'Preseti kaldır' : 'Clear preset'}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsMethodologiesOpen((prev) => !prev)}
                    title={
                      lang === 'tr'
                        ? 'Yapısal metodoloji şablonu (Preset) seç'
                        : 'Select architecture methodology preset'
                    }
                    className="bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border-border/50 flex shrink-0 cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors active:scale-95"
                  >
                    <Compass className="size-2.5" />
                    <span>Preset</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                disabled={isLoading || !canSubmit}
                onClick={() => handleGeneratePlan(promptText)}
                title={t('generatePlanTooltip')}
                aria-label={t('generatePlanTooltip')}
                className={`flex size-6.5 shrink-0 items-center justify-center rounded-md transition-all duration-120 ${
                  canSubmit && !isLoading
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-2xs active:scale-95'
                    : 'bg-muted text-muted-foreground border-border/70 cursor-not-allowed border opacity-90'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="size-3 animate-spin duration-500" />
                ) : (
                  <Send className="size-3" />
                )}
              </button>
            </div>
          </div>

          {/* 2. Quick Recipes (4 primary + More toggle) */}
          <div className="space-y-1.5">
            <span className="text-muted-foreground/80 block px-0.5 text-[9.5px] font-semibold tracking-wider uppercase">
              {lang === 'tr' ? 'Hızlı Tarifler' : 'Quick Recipes'}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(showAllRecipes ? recipes : recipes.slice(0, 4)).map((recipe, rIdx) => (
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
              {recipes.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllRecipes((prev) => !prev)}
                  className="border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer rounded-md border border-dashed px-2 py-1 text-[10px] font-medium transition-colors"
                >
                  {showAllRecipes
                    ? lang === 'tr'
                      ? 'Daha az'
                      : 'Less'
                    : lang === 'tr'
                      ? `+${recipes.length - 4} daha`
                      : 'More'}
                </button>
              )}
            </div>
          </div>

          {/* 3. Architecture Methodologies (Collapsed by default, acts as Style Preset) */}
          <MethodologySelector
            lang={lang}
            activeMethodologyId={activeMethodologyId}
            isOpen={isMethodologiesOpen}
            onToggleOpen={() => setIsMethodologiesOpen((prev) => !prev)}
            onSelectMethodology={(preset) => {
              setActiveMethodologyId(preset ? preset.id : null);
              textareaRef.current?.focus();
            }}
          />

          {/* 4. Mention a Folder (Searchable @mention source without unnecessary library stats) */}
          <div className="border-border/60 bg-muted/15 space-y-2 rounded-lg border p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="text-foreground/90 flex items-center gap-1.5 text-[11px] font-semibold">
                <AtSign className="text-primary size-3.5" />
                <span>{lang === 'tr' ? 'Klasör hedefle' : 'Mention a folder'}</span>
              </div>
              <div className="relative w-32 sm:w-40">
                <Search className="text-muted-foreground pointer-events-none absolute top-1.5 left-2 size-3" />
                <Input
                  value={folderSearchQuery}
                  onChange={(e) => {
                    setFolderSearchQuery(e.target.value);
                    setShowAllMentionFolders(false);
                  }}
                  placeholder={lang === 'tr' ? 'Klasör ara...' : 'Filter folders...'}
                  className="bg-background/70 h-6 pr-5 pl-6 text-[10px]"
                />
                {folderSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setFolderSearchQuery('')}
                    className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1.5 cursor-pointer"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>

            {mentionableFolders.length === 0 ? (
              <p className="text-muted-foreground py-1 text-[10.5px]">
                {lang === 'tr' ? 'Eşleşen klasör bulunamadı.' : 'No matching folders.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {visibleMentionFolders.map((folder) => {
                  const emojiOnly = isEmojiOnlyTitle(folder.title);
                  const formattedLabel = formatFolderTitle(folder.title, folder.path, lang);

                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        const mentionText = `@"${folder.title}" `;
                        setPromptText((prev) =>
                          prev ? `${prev.trim()} ${mentionText}` : mentionText
                        );
                        textareaRef.current?.focus();
                      }}
                      title={
                        lang === 'tr'
                          ? `@"${folder.title}" eklemek için tıklayın (${folder.path})`
                          : `Click to insert @"${folder.title}" (${folder.path})`
                      }
                      className="border-border/50 bg-background/70 hover:bg-muted text-muted-foreground hover:text-foreground flex max-w-[165px] cursor-pointer items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10px] transition-colors"
                    >
                      {!emojiOnly && <Folder className="size-2.5 shrink-0 text-amber-500" />}
                      <span className="truncate">{formattedLabel}</span>
                    </button>
                  );
                })}

                {remainingFolderCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMentionFolders(true)}
                    className="border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                  >
                    +{remainingFolderCount} {lang === 'tr' ? 'daha' : 'more'}
                  </button>
                )}

                {showAllMentionFolders && mentionableFolders.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setShowAllMentionFolders(false)}
                    className="border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer rounded border border-dashed px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                  >
                    {lang === 'tr' ? 'Daha az' : 'Show less'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 5. Recent Backups (Undo strip shown only when snapshots exist) */}
          {recentSnapshots.length > 0 && (
            <div className="border-border/50 bg-muted/10 space-y-1 rounded-lg border px-2.5 py-2 text-xs">
              <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-semibold">
                <History className="text-primary size-3" />
                <span>{lang === 'tr' ? 'Son Yedekler' : 'Recent Backups'}</span>
              </div>
              <div className="divide-border/30 divide-y">
                {recentSnapshots.slice(0, 2).map((snap, idx) => (
                  <div
                    key={snap.id}
                    className="flex items-center justify-between gap-2 py-1 text-[10.5px]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate font-medium">{snap.description}</p>
                      <span className="text-muted-foreground text-[9.5px]">
                        {new Date(snap.timestamp).toLocaleTimeString(
                          lang === 'tr' ? 'tr-TR' : 'en-US',
                          { hour: '2-digit', minute: '2-digit' }
                        )}
                      </span>
                    </div>
                    {idx === 0 && (
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isUndoing}
                        onClick={handleUndoLatestSnapshot}
                        className="h-5.5 shrink-0 cursor-pointer gap-1 px-2 text-[9.5px]"
                      >
                        <RotateCcw className={`size-2.5 ${isUndoing ? 'animate-spin' : ''}`} />
                        <span>{t('undoBtn') || (lang === 'tr' ? 'Geri Al' : 'Undo')}</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
