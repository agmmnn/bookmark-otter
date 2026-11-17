import {
  Send,
  Loader2,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  Edit2,
  AtSign,
  Sparkles,
  RotateCcw,
  History,
  Folder,
  Compass,
  Search,
  X,
  Square,
  ChevronDown,
  ChevronRight,
  Cpu,
  Shield,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { browser } from 'wxt/browser';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PROVIDER_MODELS, PROVIDER_OPTIONS, formatModelDisplayName } from '@/lib/aiConstants';
import { useI18n } from '@/lib/i18n';
import {
  buildCustomMethodologyPrompt,
  CUSTOM_METHODOLOGY_ID,
  METHODOLOGY_PRESETS,
} from '@/lib/methodologies';
import { formatFolderTitle, isEmojiOnlyTitle } from '@/lib/utils';
import { generatePlanViaBackground, shouldUseAgentHarness } from '@/services/aiClient';
import {
  extractMentions,
  getBookmarkTree,
  getSmartTreeDSL,
  flattenBookmarks,
  getAllFolders,
  executePlan,
  restoreSnapshot,
} from '@/services/bookmarks';
import {
  getSettings,
  saveSettings,
  hasConfiguredKey,
  getSnapshots,
  popLatestSnapshot,
} from '@/services/storage';
import type {
  AgentCheckpoint,
  AgentProgress,
  AIProvider,
  CopilotScopePreset,
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

type CopilotErrorKind = 'quota' | 'overload' | 'auth' | 'network' | 'validation' | 'other';

interface CopilotErrorState {
  kind: CopilotErrorKind;
  title: string;
  description?: string;
  rawMessage: string;
  checkpoint?: { completed: number; total: number };
}

const CUSTOM_FOLDERS_STORAGE_KEY = 'custom_methodology_folders';
const HARNESS_CHECKPOINT_KEY = 'agentHarnessCheckpoint';

export const AICopilot: React.FC<AICopilotProps> = React.memo(function AICopilot({
  onPlanApplied,
  onOpenSettings,
}) {
  const { t, lang } = useI18n();
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentProgress, setAgentProgress] = useState<AgentProgress | null>(null);
  const [errorState, setErrorState] = useState<CopilotErrorState | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [savedCheckpoint, setSavedCheckpoint] = useState<AgentCheckpoint | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string>('');

  // Provider & model quick switcher state
  const [activeProvider, setActiveProvider] = useState<AIProvider>('google');
  const [activeModelName, setActiveModelName] = useState<string>('gemini-3.8-flash');
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);

  const [currentPlan, setCurrentPlan] = useState<ReorgPlan | null>(null);
  const [bookmarkMap, setBookmarkMap] = useState<Map<string, FlatBookmark>>(new Map());
  const [folderMap, setFolderMap] = useState<Map<string, FlatFolder>>(new Map());
  const [analyzedCount, setAnalyzedCount] = useState<number>(0);
  const [scopeType, setScopeType] = useState<'targeted' | 'clustered' | 'full'>('full');
  const [targetedNames, setTargetedNames] = useState<string[]>([]);

  // Presets & Custom Methodology
  const [activeMethodologyId, setActiveMethodologyId] = useState<string | null>(null);
  const [customFolders, setCustomFolders] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_FOLDERS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return lang === 'tr'
      ? ['İş', 'Projeler', 'Okuma', 'Araçlar']
      : ['Work', 'Projects', 'Reading', 'Tools'];
  });
  const [isMethodologiesOpen, setIsMethodologiesOpen] = useState(false);

  // Scope & trial transparency before submit
  const [scopePreset, setScopePreset] = useState<CopilotScopePreset>('library');
  const [tryFirst50, setTryFirst50] = useState(false);

  const [showAllRecipes, setShowAllRecipes] = useState(false);

  // Mention a folder (collapsed by default, search box always visible)
  const [isMentionSectionOpen, setIsMentionSectionOpen] = useState(false);
  const [mentionInsertMode, setMentionInsertMode] = useState<'target' | 'protect'>('target');
  const [folderSearchQuery, setFolderSearchQuery] = useState('');
  const [showAllMentionFolders, setShowAllMentionFolders] = useState(false);

  const [isApplying, setIsApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState<{
    count: number;
    snapshotId: string;
  } | null>(null);

  // Mention State (@ target specification)
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const planAbortRef = useRef<AbortController | null>(null);
  const [availableFolders, setAvailableFolders] = useState<FlatFolder[]>([]);
  const [availableBookmarks, setAvailableBookmarks] = useState<FlatBookmark[]>([]);
  const [recentSnapshots, setRecentSnapshots] = useState<TreeSnapshot[]>([]);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);

  const activeProviderConfig = useMemo(
    () => PROVIDER_OPTIONS.find((p) => p.value === activeProvider) || PROVIDER_OPTIONS[0]!,
    [activeProvider]
  );

  const loadSettingsState = async () => {
    try {
      const s = await getSettings();
      setActiveProvider(s.aiProvider || 'google');
      const fallbackModel =
        PROVIDER_OPTIONS.find((p) => p.value === s.aiProvider)?.defaultModel || 'gemini-3.8-flash';
      setActiveModelName(s.modelName || fallbackModel);
    } catch {}
  };

  // Load user's folders, bookmarks, snapshots, settings & checkpoint
  const loadMentionTargets = async () => {
    try {
      const [tree, snaps] = await Promise.all([getBookmarkTree(), getSnapshots()]);
      setAvailableFolders(getAllFolders(tree).filter((f) => f.id !== '0'));
      setAvailableBookmarks(
        flattenBookmarks(tree).filter((b) => b.url && !b.url.startsWith('chrome://'))
      );
      setRecentSnapshots(snaps);

      if (typeof browser !== 'undefined' && browser.storage?.local) {
        const cpData = await browser.storage.local.get(HARNESS_CHECKPOINT_KEY);
        const cp = cpData[HARNESS_CHECKPOINT_KEY] as AgentCheckpoint | undefined;
        setSavedCheckpoint(cp || null);
      }
    } catch (err) {
      console.warn('Could not load mention targets:', err);
    }
  };

  useEffect(() => {
    loadMentionTargets();
    loadSettingsState();

    const onStorageChange = (changes: Record<string, any>, areaName: string) => {
      if (areaName === 'local' && changes.settings) {
        loadSettingsState();
      }
    };
    browser.storage?.onChanged?.addListener?.(onStorageChange);
    return () => {
      browser.storage?.onChanged?.removeListener?.(onStorageChange);
    };
  }, []);

  const handleQuickModelSwitch = async (nextModel: string) => {
    try {
      await saveSettings({ modelName: nextModel });
      setActiveModelName(nextModel);
      setIsModelMenuOpen(false);
      toast.success(
        lang === 'tr'
          ? `Model güncellendi: ${formatModelDisplayName(nextModel)}`
          : `Switched model: ${formatModelDisplayName(nextModel)}`
      );
    } catch (err) {
      console.error('Failed to switch model:', err);
    }
  };

  const classifyCopilotError = (
    rawMessage: string,
    checkpoint?: { completed: number; total: number }
  ): CopilotErrorState => {
    const msg = rawMessage || 'Plan generation failed.';
    const lower = msg.toLowerCase();

    if (
      /quota|rate.?limit|429|resource_exhausted|insufficient_quota|exceeded.*quota|billing/i.test(
        lower
      )
    ) {
      return {
        kind: 'quota',
        title:
          lang === 'tr'
            ? `${activeProviderConfig.shortLabel} kotan doldu`
            : `${activeProviderConfig.shortLabel} quota exceeded`,
        description:
          lang === 'tr'
            ? 'Kullanım sınırına ulaşıldı. Başka bir model seçebilir, sağlayıcı değiştirebilir veya birazdan tekrar deneyebilirsin.'
            : 'API usage limit reached. Switch model, change provider, or retry shortly.',
        rawMessage: msg,
        checkpoint,
      };
    }

    if (
      /high demand|spikes in demand|overloaded|capacity|temporarily unavailable|too many requests|503/i.test(
        lower
      )
    ) {
      return {
        kind: 'overload',
        title: lang === 'tr' ? 'Model şu anda çok yoğun' : 'Model experiencing high demand',
        description:
          lang === 'tr'
            ? 'Yoğunluk genellikle geçicidir. Tekrar deneyebilir veya daha hızlı yanıt için başka bir model seçebilirsiniz.'
            : 'Traffic spikes are temporary. Retry shortly or switch to another model.',
        rawMessage: msg,
        checkpoint,
      };
    }

    if (
      /api.?key|invalid.*key|unauthorized|authentication|401|403|permission_denied|incorrect api key|ayarlar bölümünden api/i.test(
        lower
      )
    ) {
      return {
        kind: 'auth',
        title: lang === 'tr' ? 'API anahtarı geçersiz veya eksik' : 'Invalid or missing API key',
        description:
          lang === 'tr'
            ? 'Seçili sağlayıcı için geçerli bir API anahtarı girin.'
            : 'Please enter a valid API key for the selected provider.',
        rawMessage: msg,
        checkpoint,
      };
    }

    if (
      /network|timeout|timed out|failed to fetch|econn|offline|disconnected|502|503|504/i.test(
        lower
      )
    ) {
      return {
        kind: 'network',
        title: lang === 'tr' ? 'Bağlantı veya zaman aşımı hatası' : 'Network or timeout error',
        description:
          lang === 'tr'
            ? 'Sunucuya ulaşılamadı veya yanıt zaman aşımına uğradı.'
            : 'Could not reach the provider or the request timed out.',
        rawMessage: msg,
        checkpoint,
      };
    }

    return {
      kind: 'other',
      title: lang === 'tr' ? 'Plan oluşturulamadı' : 'Could not generate plan',
      rawMessage: msg,
      checkpoint,
    };
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

  // Compute bookmark counts per folder to rank frequent folders first
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of availableBookmarks) {
      if (b.parentId) {
        counts.set(b.parentId, (counts.get(b.parentId) || 0) + 1);
      }
    }
    return counts;
  }, [availableBookmarks]);

  // Filter mention targets dynamically (for inline @ autocomplete)
  const filteredMentions = useMemo((): MentionItem[] => {
    const q = mentionQuery.toLowerCase().trim();

    const folderItems: MentionItem[] = [...availableFolders]
      .filter((f) => !q || f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
      .sort((a, b) => (folderCounts.get(b.id) || 0) - (folderCounts.get(a.id) || 0))
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

    return [...folderItems, ...bookmarkItems].slice(0, 8);
  }, [availableFolders, availableBookmarks, folderCounts, mentionQuery]);

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
      if (scopePreset === 'library') {
        setScopePreset('selected');
      }

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

  const activeMethodology = useMemo(() => {
    if (activeMethodologyId === CUSTOM_METHODOLOGY_ID) {
      const built = buildCustomMethodologyPrompt(customFolders, lang);
      return {
        id: CUSTOM_METHODOLOGY_ID,
        icon: '✨',
        shortLabel: built.name,
        promptText: built.prompt,
      };
    }
    const found = METHODOLOGY_PRESETS.find((p) => p.id === activeMethodologyId);
    if (!found) return null;
    return {
      id: found.id,
      icon: found.icon,
      shortLabel: lang === 'tr' ? found.shortName.tr : found.shortName.en,
      promptText: lang === 'tr' ? found.prompt.tr : found.prompt.en,
    };
  }, [activeMethodologyId, customFolders, lang]);

  // Estimate link count, API calls, and approximate duration before submit
  const scopeEstimate = useMemo(() => {
    const totalAll = availableBookmarks.length;
    const mentions = extractMentions(promptText);
    const dumpFolderRegex =
      /^(inbox|unsorted|other|needfix|temp|yeni|misc|çöp|cop|dump|imported|di[gğ]er)/i;
    const inboxDumpIds = new Set(
      availableFolders.filter((f) => dumpFolderRegex.test(f.title.trim())).map((f) => f.id)
    );

    const inboxCount = availableBookmarks.filter(
      (b) => b.parentId === '1' || b.parentId === '2' || inboxDumpIds.has(b.parentId)
    ).length;

    let selectedCount = 0;
    if (mentions.length > 0) {
      const lowerMentions = new Set(mentions.map((m) => m.toLowerCase()));
      const matchedFolders = availableFolders.filter(
        (f) => lowerMentions.has(f.title.toLowerCase()) || lowerMentions.has(f.path.toLowerCase())
      );
      const matchedFolderIds = new Set(matchedFolders.map((f) => f.id));
      const matchedFolderPaths = matchedFolders.map((f) => f.path);
      selectedCount = availableBookmarks.filter(
        (b) =>
          matchedFolderIds.has(b.parentId) ||
          matchedFolderPaths.some((p) => b.path === p || b.path.startsWith(p + ' / ')) ||
          lowerMentions.has(b.title.trim().toLowerCase())
      ).length;
    }

    const baseCount =
      scopePreset === 'inbox' ? inboxCount : scopePreset === 'selected' ? selectedCount : totalAll;

    const effectiveCount = tryFirst50 ? Math.min(50, baseCount) : baseCount;
    const isSingleShot =
      scopePreset === 'inbox' || scopePreset === 'selected' || effectiveCount <= 60;
    const estRequests =
      effectiveCount === 0
        ? 0
        : isSingleShot
          ? 1
          : 1 + Math.max(1, Math.ceil((effectiveCount * 0.25) / 40));
    const estSeconds = estRequests === 0 ? 0 : estRequests === 1 ? 10 : estRequests * 12;
    const estDuration =
      estSeconds >= 60
        ? lang === 'tr'
          ? `~${Math.max(1, Math.round(estSeconds / 60))} dk`
          : `~${Math.max(1, Math.round(estSeconds / 60))}m`
        : lang === 'tr'
          ? `~${Math.max(5, estSeconds)} sn`
          : `~${Math.max(5, estSeconds)}s`;

    return {
      baseCount,
      effectiveCount,
      estRequests,
      estDuration,
      hasMentions: mentions.length > 0,
    };
  }, [availableBookmarks, availableFolders, promptText, scopePreset, tryFirst50, lang]);

  const canSubmit = Boolean(promptText.trim() || activeMethodology);

  const buildEffectivePrompt = (rawPrompt: string) => {
    const trimmed = rawPrompt.trim();
    const methodologyRule = activeMethodology ? activeMethodology.promptText : '';

    if (trimmed) {
      return methodologyRule
        ? `${trimmed}\n\n[Architecture Preset: ${activeMethodology!.shortLabel}] ${methodologyRule}`
        : trimmed;
    }
    return methodologyRule;
  };

  const handleGeneratePlan = async (
    rawPrompt: string,
    options: { resumeFromCheckpoint?: boolean } = {}
  ) => {
    const effectivePrompt = buildEffectivePrompt(rawPrompt);
    if (!effectivePrompt.trim()) return;

    if (scopePreset === 'selected' && !scopeEstimate.hasMentions) {
      setErrorState({
        kind: 'validation',
        title:
          lang === 'tr'
            ? 'Seçili klasör kapsamı için en az bir klasör hedefleyin'
            : 'Mention at least one folder for Selected scope',
        description:
          lang === 'tr'
            ? 'Aşağıdaki "Klasör hedefle" alanından bir klasör seçin veya kapsamı "Tüm kütüphane" olarak değiştirin.'
            : 'Pick a folder from "Mention a folder" below or switch scope to "Entire library".',
        rawMessage: 'Selected scope requires at least one @folder mention.',
      });
      setIsMentionSectionOpen(true);
      return;
    }

    setIsLoading(true);
    setErrorState(null);
    setShowErrorDetails(false);
    setAppliedSuccess(null);
    setCurrentPlan(null);
    setLastSubmittedPrompt(rawPrompt);

    try {
      const settings = await getSettings();
      const hasKey = hasConfiguredKey(settings);

      if (!hasKey) {
        setErrorState(classifyCopilotError(t('enterKeyPrompt')));
        setIsLoading(false);
        return;
      }

      const maxBookmarks = tryFirst50 ? 50 : undefined;

      // 1. Get smart tree DSL with @mention scoping & optional scopePreset/maxBookmarks
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

      const smartDsl = getSmartTreeDSL(tree, effectivePrompt, {
        scopePreset,
        maxBookmarks,
      });
      if (smartDsl.unmatchedMentions && smartDsl.unmatchedMentions.length > 0) {
        const missingList = smartDsl.unmatchedMentions.map((m) => `@"${m}"`).join(', ');
        setErrorState({
          kind: 'validation',
          title:
            lang === 'tr' ? `Hedef bulunamadı: ${missingList}` : `Target not found: ${missingList}`,
          description:
            lang === 'tr'
              ? 'Tüm kütüphane yanlışlıkla düzenlenmedi — lütfen geçerli bir klasör veya yer imi seçin.'
              : 'Aborted to avoid modifying your entire library — please pick a valid folder or bookmark.',
          rawMessage: `Unmatched mentions: ${missingList}`,
        });
        setIsLoading(false);
        return;
      }

      setAnalyzedCount(smartDsl.analyzedCount);
      setScopeType(smartDsl.scopeType);
      setTargetedNames(smartDsl.targetFolderNames || []);

      // 2. Select execution mode: Multi-Step Agent Harness or Scoped Single-Shot
      const useHarness =
        scopePreset === 'library' &&
        !tryFirst50 &&
        shouldUseAgentHarness(effectivePrompt, flats.length, smartDsl.scopeType);

      if (useHarness) {
        setAgentProgress({
          phase: 'architect',
          message: options.resumeFromCheckpoint
            ? lang === 'tr'
              ? 'Kaldığı yerden devam ediliyor...'
              : 'Resuming from saved checkpoint...'
            : lang === 'tr'
              ? 'Mimar: Kütüphane analizi yapılıyor ve taksonomi tasarlanıyor...'
              : 'Architect: Analyzing library structure and designing taxonomy...',
          percentage: 10,
        });
      }

      const controller = new AbortController();
      planAbortRef.current = controller;

      const plan = await generatePlanViaBackground({
        userPrompt: effectivePrompt,
        tree,
        compactTreeDSL: smartDsl.dsl,
        useHarness,
        scopePreset,
        maxBookmarks,
        resumeFromCheckpoint: options.resumeFromCheckpoint,
        signal: controller.signal,
        onProgress: useHarness ? (p) => setAgentProgress(p) : undefined,
      });

      setCurrentPlan(plan);
      setSavedCheckpoint(null);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.info(lang === 'tr' ? 'Plan oluşturma durduruldu' : 'Plan generation stopped');
      } else {
        // Expected external API/network responses should not trigger chrome://extensions > Errors
        console.warn('Plan generation did not complete:', err?.message || err);
        let cpInfo = err?.checkpoint as { completed: number; total: number } | undefined;
        if (typeof browser !== 'undefined' && browser.storage?.local) {
          try {
            const cpData = await browser.storage.local.get(HARNESS_CHECKPOINT_KEY);
            const cp = cpData[HARNESS_CHECKPOINT_KEY] as AgentCheckpoint | undefined;
            setSavedCheckpoint(cp || null);
            if (!cpInfo && cp) {
              cpInfo = { completed: cp.completedCount, total: cp.totalCount };
            }
          } catch {}
        }
        setErrorState(classifyCopilotError(err?.message || 'Plan generation failed.', cpInfo));
      }
    } finally {
      planAbortRef.current = null;
      setIsLoading(false);
      setAgentProgress(null);
    }
  };

  const handleStopGeneration = () => {
    planAbortRef.current?.abort();
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
      await loadMentionTargets();
      onPlanApplied();
      toast.success(t('actionsAppliedSuccess', { count: result.appliedCount }), {
        action: {
          label: t('undoBtn') || (lang === 'tr' ? 'Geri Al' : 'Undo'),
          onClick: () => handleUndoLatestSnapshot(),
        },
      });
    } catch (err: any) {
      console.error('Plan execution failed:', err);
      setErrorState(classifyCopilotError(err?.message || 'Error executing plan actions.'));
    } finally {
      setIsApplying(false);
    }
  };

  const sampleProtectFolder = useMemo(
    () => availableFolders.find((f) => f.id !== '1' && f.id !== '2')?.title || 'Bookmarks Bar',
    [availableFolders]
  );

  const recipes = useMemo(
    () =>
      lang === 'tr'
        ? [
            {
              icon: '⚡',
              label: 'Kütüphaneyi düzenle',
              scope: 'library' as CopilotScopePreset,
              prompt:
                'Tüm yer imlerimi analiz et ve 6-8 ana tematik klasör altında baştan sona düzenle.',
            },
            {
              icon: '🎯',
              label: 'Favicon Launchpad',
              scope: 'inbox' as CopilotScopePreset,
              prompt:
                'Yer İmleri Çubuğundaki doğrudan web araçlarının başlıklarını temizle, yalnızca favicon ikonları bırak.',
            },
            {
              icon: '🧹',
              label: 'Inbox düzenle',
              scope: 'inbox' as CopilotScopePreset,
              prompt: 'Yer İmleri Çubuğundaki dağınık tüm yer imlerini kategorik klasörlere taşı.',
            },
            {
              icon: '🛡️',
              label: 'Klasörü koru',
              scope: 'library' as CopilotScopePreset,
              prompt: `Dağınıkları düzenle ama @"${sampleProtectFolder}" klasörüne dokunma.`,
            },
            {
              icon: '🏷️',
              label: 'Başlıkları sadeleştir',
              scope: 'library' as CopilotScopePreset,
              prompt:
                'Gereksiz uzun veya URL şeklindeki yer imi başlıklarını temiz ve tanınabilir yap.',
            },
            {
              icon: '📁',
              label: 'Klasörleri birleştir',
              scope: 'library' as CopilotScopePreset,
              prompt: 'Benzer konudaki dağınık alt klasörleri ana başlıklar altında birleştir.',
            },
          ]
        : [
            {
              icon: '⚡',
              label: 'Organize library',
              scope: 'library' as CopilotScopePreset,
              prompt:
                'Analyze all bookmarks and reorganize the entire library into cohesive thematic folders.',
            },
            {
              icon: '🎯',
              label: 'Favicon Launchpad',
              scope: 'inbox' as CopilotScopePreset,
              prompt:
                'Strip text titles of direct bookmarks bar web apps, leaving only clean favicon icons.',
            },
            {
              icon: '🧹',
              label: 'Triage inbox',
              scope: 'inbox' as CopilotScopePreset,
              prompt:
                'Organize unfiled and loose bookmarks on the Bookmarks Bar into structured folders.',
            },
            {
              icon: '🛡️',
              label: 'Protect folder',
              scope: 'library' as CopilotScopePreset,
              prompt: `Organize loose bookmarks but do not touch @"${sampleProtectFolder}".`,
            },
            {
              icon: '🏷️',
              label: 'Clean titles',
              scope: 'library' as CopilotScopePreset,
              prompt:
                'Simplify and shorten verbose or raw URL bookmark titles into clean, recognizable names.',
            },
            {
              icon: '📁',
              label: 'Merge folders',
              scope: 'library' as CopilotScopePreset,
              prompt: 'Merge scattered single-topic folders into cohesive thematic parent folders.',
            },
          ],
    [lang, sampleProtectFolder]
  );

  // Frequent folders first, searchable cleanly
  const mentionableFolders = useMemo(() => {
    const q = folderSearchQuery.trim().toLowerCase();
    return availableFolders
      .filter((f) => {
        if (f.id === '1' || f.id === '2' || f.id === '3') return false;
        if (!q) return true;
        return f.title.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const countDiff = (folderCounts.get(b.id) || 0) - (folderCounts.get(a.id) || 0);
        if (countDiff !== 0) return countDiff;
        if (a.parentId === '1' && b.parentId !== '1') return -1;
        if (b.parentId === '1' && a.parentId !== '1') return 1;
        return a.title.localeCompare(b.title);
      });
  }, [availableFolders, folderCounts, folderSearchQuery]);

  const showMentionChips = isMentionSectionOpen || folderSearchQuery.trim().length > 0;

  const visibleMentionFolders = useMemo(
    () => (showAllMentionFolders ? mentionableFolders : mentionableFolders.slice(0, 12)),
    [mentionableFolders, showAllMentionFolders]
  );

  const remainingFolderCount = Math.max(
    0,
    mentionableFolders.length - visibleMentionFolders.length
  );

  const providerModels = PROVIDER_MODELS[activeProvider] || PROVIDER_MODELS.google;

  const hasMatchingCheckpoint = Boolean(
    savedCheckpoint &&
    savedCheckpoint.completedCount > 0 &&
    savedCheckpoint.completedCount < savedCheckpoint.totalCount &&
    (!lastSubmittedPrompt ||
      savedCheckpoint.userPrompt === buildEffectivePrompt(lastSubmittedPrompt))
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col space-y-2.5 p-3">
      {/* 1. Compact 1-line Header */}
      {!currentPlan ? (
        <div className="flex items-center gap-1.5 px-0.5">
          <Wand2 className="text-primary size-3.5 shrink-0" />
          <h2 className="text-foreground truncate text-xs font-semibold tracking-tight">
            {t('reorganizeCardTitle')}
          </h2>
        </div>
      ) : (
        <div className="bg-muted/30 border-border/60 animate-in fade-in flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs duration-150">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Wand2 className="text-primary size-3.5 shrink-0" />
            <span className="text-foreground truncate text-xs font-medium">
              {promptText.trim() || (activeMethodology ? activeMethodology.shortLabel : '')}
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

      {/* Categorized Neutral/Amber Error Alert + Checkpoint Resume */}
      {errorState && (
        <div className="animate-in fade-in-0 space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-xs text-amber-900 duration-150 dark:text-amber-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-semibold">{errorState.title}</p>
                {errorState.description && (
                  <p className="text-[11px] leading-snug opacity-85">{errorState.description}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorState(null)}
              className="cursor-pointer rounded p-0.5 opacity-60 hover:opacity-100"
              aria-label={lang === 'tr' ? 'Kapat' : 'Dismiss'}
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Action Buttons by Error Kind */}
          <div className="flex flex-wrap items-center gap-1.5 pl-6">
            {(errorState.checkpoint || hasMatchingCheckpoint) && (
              <Button
                size="xs"
                onClick={() => {
                  const cp = errorState.checkpoint || {
                    completed: savedCheckpoint!.completedCount,
                    total: savedCheckpoint!.totalCount,
                  };
                  toast.info(
                    lang === 'tr'
                      ? `${cp.completed}/${cp.total} konumundan devam ediliyor`
                      : `Resuming from ${cp.completed}/${cp.total}`
                  );
                  handleGeneratePlan(lastSubmittedPrompt || promptText, {
                    resumeFromCheckpoint: true,
                  });
                }}
                className="h-6.5 cursor-pointer bg-amber-600 px-2.5 text-[10.5px] font-semibold text-white hover:bg-amber-700"
              >
                <RotateCcw className="mr-1 size-3" />
                {lang === 'tr'
                  ? `Kaldığı yerden devam et (${(errorState.checkpoint?.completed ?? savedCheckpoint?.completedCount) || 0}/${(errorState.checkpoint?.total ?? savedCheckpoint?.totalCount) || 0})`
                  : `Resume (${(errorState.checkpoint?.completed ?? savedCheckpoint?.completedCount) || 0}/${(errorState.checkpoint?.total ?? savedCheckpoint?.totalCount) || 0})`}
              </Button>
            )}

            {(errorState.kind === 'quota' ||
              errorState.kind === 'overload' ||
              errorState.kind === 'network' ||
              errorState.kind === 'other') && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => handleGeneratePlan(lastSubmittedPrompt || promptText)}
                className="bg-background/60 hover:bg-background h-6.5 cursor-pointer border-amber-500/40 px-2 text-[10.5px]"
              >
                <RotateCcw className="mr-1 size-3" />
                {lang === 'tr' ? 'Tekrar dene' : 'Retry'}
              </Button>
            )}

            {(errorState.kind === 'quota' || errorState.kind === 'overload') && (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setIsModelMenuOpen(true)}
                  className="bg-background/60 hover:bg-background h-6.5 cursor-pointer border-amber-500/40 px-2 text-[10.5px]"
                >
                  <Cpu className="mr-1 size-3" />
                  {lang === 'tr' ? 'Başka model seç' : 'Switch model'}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={onOpenSettings}
                  className="bg-background/60 hover:bg-background h-6.5 cursor-pointer border-amber-500/40 px-2 text-[10.5px]"
                >
                  {lang === 'tr' ? 'Sağlayıcıyı değiştir' : 'Change provider'}
                </Button>
              </>
            )}

            {errorState.kind === 'auth' && (
              <Button
                size="xs"
                variant="outline"
                onClick={onOpenSettings}
                className="bg-background/60 hover:bg-background h-6.5 cursor-pointer border-amber-500/40 px-2.5 text-[10.5px] font-medium"
              >
                {t('enterKeyBtn') || (lang === 'tr' ? 'Anahtar Gir' : 'Enter Key')}
              </Button>
            )}

            <button
              type="button"
              onClick={() => setShowErrorDetails((prev) => !prev)}
              className="ml-auto cursor-pointer text-[10px] underline-offset-2 opacity-75 hover:underline hover:opacity-100"
            >
              {showErrorDetails
                ? lang === 'tr'
                  ? 'Detayları gizle'
                  : 'Hide details'
                : lang === 'tr'
                  ? 'Detaylar'
                  : 'Details'}
            </button>
          </div>

          {showErrorDetails && (
            <div className="bg-background/70 border-border/50 ml-6 max-h-24 overflow-y-auto rounded border p-2 font-mono text-[9.5px] break-all opacity-90">
              {errorState.rawMessage}
            </div>
          )}
        </div>
      )}

      {/* Standalone Resume Banner when checkpoint exists without active error */}
      {!errorState &&
        !isLoading &&
        !currentPlan &&
        savedCheckpoint &&
        savedCheckpoint.completedCount > 0 &&
        savedCheckpoint.completedCount < savedCheckpoint.totalCount && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-200">
            <span>
              {lang === 'tr'
                ? `Yarım kalan bir işlem bulundu (${savedCheckpoint.completedCount}/${savedCheckpoint.totalCount}).`
                : `Incomplete run saved (${savedCheckpoint.completedCount}/${savedCheckpoint.totalCount}).`}
            </span>
            <Button
              size="xs"
              onClick={() =>
                handleGeneratePlan(promptText || savedCheckpoint.userPrompt, {
                  resumeFromCheckpoint: true,
                })
              }
              className="h-6 cursor-pointer bg-amber-600 px-2 text-[10px] text-white hover:bg-amber-700"
            >
              <RotateCcw className="mr-1 size-2.5" />
              {lang === 'tr'
                ? `Devam et (${savedCheckpoint.completedCount}/${savedCheckpoint.totalCount})`
                : `Resume (${savedCheckpoint.completedCount}/${savedCheckpoint.totalCount})`}
            </Button>
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
                <Sparkles className="size-4 animate-spin duration-1000" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground text-xs font-semibold">
                    {agentProgress ? t('agentHarnessBadge') : t('copilotBadge')}
                  </span>
                  {agentProgress && (
                    <span className="bg-primary/10 text-primary border-primary/20 py-0.2 truncate rounded border px-1.5 font-mono text-[9px] font-medium">
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

            <div className="flex shrink-0 items-center gap-2">
              {agentProgress?.percentage !== undefined && (
                <span className="text-primary font-mono text-xs font-bold">
                  {lang === 'tr' ? `%${agentProgress.percentage}` : `${agentProgress.percentage}%`}
                </span>
              )}
              <Button
                size="xs"
                variant="outline"
                onClick={handleStopGeneration}
                className="border-border/70 text-muted-foreground hover:text-destructive hover:border-destructive/40 h-6 cursor-pointer gap-1 px-2 text-[10px] active:scale-95"
                title={t('stopScanBtn') || (lang === 'tr' ? 'Durdur' : 'Stop')}
              >
                <Square className="size-2.5 fill-current" />
                <span>{t('stopScanBtn') || (lang === 'tr' ? 'Durdur' : 'Stop')}</span>
              </Button>
            </div>
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

      {/* Main Flow */}
      {!currentPlan && (
        <div className="flex flex-1 flex-col space-y-2.5">
          {/* 1. Prompt Input Box + Attached Preset Popover + Under-Box Model/Privacy Bar */}
          <div className="space-y-1">
            <div className="group relative">
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
                    ? 'İstediğiniz dilde yazın — hedeflemek için @ kullanın (ör. @"İş" dokunma, @"Okuma Listesi" düzenle)...'
                    : 'Write in any language — type @ to target folders or links (e.g. keep @"Work", organize @"Reading List")...'
                }
                className="border-border/80 focus-visible:border-ring min-h-[88px] resize-none pr-12 pb-9 text-xs transition-shadow duration-150 focus-visible:ring-1"
                disabled={isLoading}
              />

              {/* Bottom Toolbar inside Textarea */}
              <div className="absolute right-2 bottom-2 left-2 flex items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
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

                  {/* Preset selector chip (no parentheses clipping, single representation) */}
                  {activeMethodology ? (
                    <span className="border-primary/40 bg-primary/10 text-primary flex max-w-[180px] items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium">
                      <button
                        type="button"
                        onClick={() => setIsMethodologiesOpen((prev) => !prev)}
                        className="flex min-w-0 cursor-pointer items-center gap-1"
                        title={
                          lang === 'tr'
                            ? 'Şablonu değiştirmek için tıkla'
                            : 'Click to switch preset'
                        }
                      >
                        <span className="shrink-0">{activeMethodology.icon}</span>
                        <span className="truncate">{activeMethodology.shortLabel}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveMethodologyId(null)}
                        className="hover:text-foreground ml-0.5 shrink-0 cursor-pointer"
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

                {/* Brand Send Button */}
                <button
                  type="button"
                  disabled={isLoading || !canSubmit}
                  onClick={() => handleGeneratePlan(promptText)}
                  title={t('generatePlanTooltip')}
                  aria-label={t('generatePlanTooltip')}
                  className={`bg-primary text-primary-foreground flex size-6.5 shrink-0 items-center justify-center rounded-md shadow-2xs transition-all duration-120 ${
                    canSubmit && !isLoading
                      ? 'hover:bg-primary/90 cursor-pointer active:scale-95'
                      : 'cursor-not-allowed opacity-45'
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

            {/* Under-box Footer: Quick Model Switcher + Privacy line */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-[10px]">
              <DropdownMenu open={isModelMenuOpen} onOpenChange={setIsModelMenuOpen}>
                <DropdownMenuTrigger
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/50 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors"
                  title={lang === 'tr' ? 'Hızlı model değiştir' : 'Quick switch model'}
                >
                  <Cpu className="text-primary size-2.5" />
                  <span>{formatModelDisplayName(activeModelName)}</span>
                  <ChevronDown className="size-2.5 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-auto min-w-52 text-xs">
                  <div className="text-muted-foreground px-2 py-1 text-[10px] font-semibold">
                    {activeProviderConfig.label}
                  </div>
                  {providerModels.map((model) => {
                    const isActive = model === activeModelName;
                    return (
                      <DropdownMenuItem
                        key={model}
                        onClick={() => handleQuickModelSwitch(model)}
                        className="flex cursor-pointer items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate">{formatModelDisplayName(model)}</span>
                        {isActive && <Check className="text-primary size-3.5 shrink-0" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setIsModelMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="cursor-pointer text-xs"
                  >
                    <SlidersHorizontal className="size-3" />
                    <span>
                      {lang === 'tr'
                        ? 'Sağlayıcıyı değiştir / Ayarlar...'
                        : 'Change provider / Settings...'}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <span className="text-muted-foreground/80 truncate text-[9.5px]">
                {lang === 'tr'
                  ? 'Başlık, URL ve klasör adı gönderilir'
                  : 'Titles, URLs & folder names are sent'}
              </span>
            </div>

            {/* Methodology Preset Popover (collapsed by default, closes on select) */}
            <MethodologySelector
              lang={lang}
              activeMethodologyId={activeMethodologyId}
              customFolders={customFolders}
              isOpen={isMethodologiesOpen}
              onClose={() => setIsMethodologiesOpen(false)}
              onSelectMethodology={(preset) => {
                setActiveMethodologyId(preset ? preset.id : null);
                textareaRef.current?.focus();
              }}
              onSelectCustomFolders={(folders) => {
                setCustomFolders(folders);
                try {
                  localStorage.setItem(CUSTOM_FOLDERS_STORAGE_KEY, JSON.stringify(folders));
                } catch {}
                setActiveMethodologyId(CUSTOM_METHODOLOGY_ID);
                textareaRef.current?.focus();
              }}
            />
          </div>

          {/* 2. Pre-submit Transparency Bar: Scope + Cost Estimate + Try 50 First */}
          <div className="border-border/60 bg-muted/15 space-y-1.5 rounded-lg border p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Scope Selector Pills */}
              <div className="bg-background/70 border-border/50 inline-flex items-center rounded-md border p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setScopePreset('library')}
                  className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                    scopePreset === 'library'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lang === 'tr' ? 'Tüm kütüphane' : 'Entire library'}
                </button>
                <button
                  type="button"
                  onClick={() => setScopePreset('inbox')}
                  className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                    scopePreset === 'inbox'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lang === 'tr' ? 'Sadece Inbox' : 'Inbox only'}
                </button>
                <button
                  type="button"
                  onClick={() => setScopePreset('selected')}
                  className={`cursor-pointer rounded px-2 py-0.5 font-medium transition-colors ${
                    scopePreset === 'selected'
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lang === 'tr' ? 'Seçili klasörler' : 'Selected folders'}
                </button>
              </div>

              {/* Estimated Cost / Duration Badge */}
              <span className="text-muted-foreground font-mono text-[10px]">
                {scopeEstimate.effectiveCount} link · ~{scopeEstimate.estRequests}{' '}
                {lang === 'tr' ? 'istek' : 'reqs'} · {scopeEstimate.estDuration}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <label className="flex cursor-pointer items-center gap-1.5 select-none">
                <input
                  type="checkbox"
                  checked={tryFirst50}
                  onChange={(e) => setTryFirst50(e.target.checked)}
                  className="border-border accent-primary size-3.5 cursor-pointer rounded"
                />
                <span className="text-foreground text-[10.5px] font-medium">
                  {lang === 'tr' ? 'Önce 50 linkle dene' : 'Try 50 links first'}
                </span>
              </label>
              <span className="text-muted-foreground/80 text-[9.5px]">
                {lang === 'tr' ? 'Kota dostu hızlı önizleme' : 'Fast quota-safe preview'}
              </span>
            </div>
          </div>

          {/* 3. Quick Recipes */}
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
                    setScopePreset(recipe.scope);
                    textareaRef.current?.focus();
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

          {/* 4. Mention a Folder (Collapsed by default, Search + Target/Protect always accessible) */}
          <div className="border-border/60 bg-muted/15 space-y-2 rounded-lg border p-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsMentionSectionOpen((prev) => !prev)}
                aria-expanded={showMentionChips}
                className="text-foreground/90 flex cursor-pointer items-center gap-1 text-[11px] font-semibold"
              >
                {showMentionChips ? (
                  <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                )}
                <AtSign className="text-primary size-3.5 shrink-0" />
                <span>{lang === 'tr' ? 'Klasör hedefle' : 'Mention a folder'}</span>
                <Badge variant="outline" className="ml-0.5 h-4 px-1.5 py-0 text-[9px]">
                  {mentionableFolders.length}
                </Badge>
              </button>

              <div className="flex items-center gap-1.5">
                {/* Target vs Protect Insert Mode */}
                <div
                  className="bg-background/70 border-border/50 inline-flex items-center rounded border p-0.5 text-[9.5px]"
                  title={
                    lang === 'tr'
                      ? 'Klasöre tıklanınca hedefle veya koru'
                      : 'Insert mode when clicking a folder chip'
                  }
                >
                  <button
                    type="button"
                    onClick={() => setMentionInsertMode('target')}
                    className={`cursor-pointer rounded px-1.5 py-0.5 font-medium transition-colors ${
                      mentionInsertMode === 'target'
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lang === 'tr' ? 'Hedef' : 'Target'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentionInsertMode('protect')}
                    className={`flex cursor-pointer items-center gap-0.5 rounded px-1.5 py-0.5 font-medium transition-colors ${
                      mentionInsertMode === 'protect'
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Shield className="size-2.5" />
                    <span>{lang === 'tr' ? 'Dokunma' : 'Protect'}</span>
                  </button>
                </div>

                {/* Search Input stays visible even when collapsed */}
                <div className="relative w-28 sm:w-36">
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
            </div>

            {showMentionChips && (
              <>
                {mentionableFolders.length === 0 ? (
                  <p className="text-muted-foreground py-1 text-[10.5px]">
                    {lang === 'tr' ? 'Eşleşen klasör bulunamadı.' : 'No matching folders.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {visibleMentionFolders.map((folder) => {
                      const emojiOnly = isEmojiOnlyTitle(folder.title);
                      const chipLabel = emojiOnly
                        ? folder.title.trim()
                        : folder.title.trim() || formatFolderTitle(folder.title, folder.path, lang);

                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() => {
                            const mentionText =
                              mentionInsertMode === 'protect'
                                ? lang === 'tr'
                                  ? `@"${folder.title}" dokunma `
                                  : `do not touch @"${folder.title}" `
                                : `@"${folder.title}" `;
                            setPromptText((prev) =>
                              prev ? `${prev.trim()} ${mentionText}` : mentionText
                            );
                            if (mentionInsertMode === 'target' && scopePreset === 'library') {
                              setScopePreset('selected');
                            }
                            textareaRef.current?.focus();
                          }}
                          title={folder.path}
                          className={`flex max-w-[165px] cursor-pointer items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                            mentionInsertMode === 'protect'
                              ? 'border-amber-500/35 bg-amber-500/5 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300'
                              : 'border-border/50 bg-background/70 hover:bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {!emojiOnly && <Folder className="size-2.5 shrink-0 text-amber-500" />}
                          <span className="truncate">{chipLabel}</span>
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

                    {showAllMentionFolders && mentionableFolders.length > 12 && (
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
              </>
            )}
          </div>

          {/* 5. Recent Backups (shown at bottom only when snapshots exist) */}
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
