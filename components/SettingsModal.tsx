import {
  Eye,
  EyeOff,
  ExternalLink,
  Save,
  Check,
  Globe,
  Sparkles,
  Cpu,
  Sun,
  Moon,
  Monitor,
  ArrowLeft,
  ShieldCheck,
  Database,
  Upload,
  Download,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  List,
  Palette,
} from 'lucide-react';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { useTheme, type Theme } from '@/lib/theme';
import { testApiConnectionViaBackground } from '@/services/aiClient';
import { clearAllLocalData, getSettings, saveSettings } from '@/services/storage';
import type { AIProvider, AppSettings } from '@/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

interface ProviderConfig {
  value: AIProvider;
  label: string;
  badge: string;
  keyUrl: string;
  keyPrefix: string;
  defaultModel: string;
  isFree?: boolean;
}

const PROVIDER_OPTIONS: ProviderConfig[] = [
  {
    value: 'google',
    label: 'Google Gemini',
    badge: 'Gemini 3.5 / 4',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefix: 'AIzaSy...',
    defaultModel: 'gemini-3.8-flash',
    isFree: true,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    badge: 'GPT-5.6 / 6',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-proj-...',
    defaultModel: 'gpt-5.6',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    badge: 'Claude 4.8 / 5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-...',
    defaultModel: 'claude-sonnet-5',
  },
  {
    value: 'xai',
    label: 'xAI Grok',
    badge: 'Grok 4 / 4.7',
    keyUrl: 'https://console.x.ai/',
    keyPrefix: 'xai-...',
    defaultModel: 'grok-4.5',
  },
  {
    value: 'groq',
    label: 'Groq',
    badge: 'Llama 4 / 3.3',
    keyUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_...',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    isFree: true,
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    badge: 'V4 Flash / Pro',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-...',
    defaultModel: 'deepseek-v4-flash',
  },
];

// Models synchronized with official Vercel AI SDK specification (latest generations only)
// https://ai-sdk.dev/docs/foundations/providers-and-models.md
const PROVIDER_MODELS: Record<AIProvider, string[]> = {
  google: [
    'gemini-3.8-flash',
    'gemini-4-argon',
    'gemini-4-carbon',
    'gemini-4-hydrogen',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
  ],
  openai: [
    'gpt-5.6',
    'gpt-6.1-sol',
    'gpt-6.1-terra',
    'gpt-6-astra',
    'gpt-6-luna',
    'gpt-6-sol',
    'gpt-5.6-luna',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
  ],
  anthropic: [
    'claude-sonnet-5',
    'claude-sonnet-5-5',
    'claude-opus-5-5',
    'claude-opus-5',
    'claude-haiku-5-5',
    'claude-fable-5-2',
    'claude-fable-5-1',
    'claude-fable-5',
    'claude-opus-4-8',
  ],
  xai: [
    'grok-4.5',
    'grok-4.7',
    'grok-4.6',
    'grok-4.20-reasoning',
    'grok-4.20-non-reasoning',
    'grok-4-1-fast-reasoning',
    'grok-4-1-fast-non-reasoning',
    'grok-4-1',
    'grok-4-fast-reasoning',
    'grok-4-fast-non-reasoning',
    'grok-code-fast-1',
    'grok-4',
  ],
  groq: [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
};

const INTERFACE_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English', flag: '🇺🇸' },
  { value: 'tr', label: 'Türkçe', flag: '🇹🇷' },
];

const CUSTOM_MODEL_SENTINEL = '__custom__';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const [provider, setProvider] = useState<AIProvider>('google');
  const [geminiKey, setGeminiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [xaiKey, setXaiKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [modelName, setModelName] = useState('gemini-3.8-flash');
  const [isManualModel, setIsManualModel] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [aiLanguage, setAiLanguage] = useState<'auto' | 'en' | 'tr'>('auto');
  const [trashRetentionDays, setTrashRetentionDays] = useState<number>(30);
  const [isSaved, setIsSaved] = useState(false);

  // API key test state
  const [testState, setTestState] = useState<{
    status: 'idle' | 'testing' | 'ok' | 'error';
    message?: string;
  }>({ status: 'idle' });

  // Clear local data confirmation
  const [confirmClearData, setConfirmClearData] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getSettings().then((s) => {
        const activeProvider = s.aiProvider || 'google';
        const defaultForProvider =
          PROVIDER_OPTIONS.find((p) => p.value === activeProvider)?.defaultModel ||
          'gemini-3.8-flash';
        const resolvedModel = s.modelName || defaultForProvider;
        const resolvedAiLang = s.aiLanguage || 'auto';
        const resolvedRetention = s.trashRetentionDays || 30;

        setProvider(activeProvider);
        setGeminiKey(s.geminiApiKey || '');
        setOpenaiKey(s.openaiApiKey || '');
        setAnthropicKey(s.anthropicApiKey || '');
        setXaiKey(s.xaiApiKey || '');
        setGroqKey(s.groqApiKey || '');
        setDeepseekKey(s.deepseekApiKey || '');
        setModelName(resolvedModel);
        setAiLanguage(resolvedAiLang);
        setTrashRetentionDays(resolvedRetention);

        const knownModels = PROVIDER_MODELS[activeProvider] || [];
        setIsManualModel(Boolean(resolvedModel && !knownModels.includes(resolvedModel)));

        setInitialSnapshot(
          JSON.stringify({
            aiProvider: activeProvider,
            geminiApiKey: s.geminiApiKey || '',
            openaiApiKey: s.openaiApiKey || '',
            anthropicApiKey: s.anthropicApiKey || '',
            xaiApiKey: s.xaiApiKey || '',
            groqApiKey: s.groqApiKey || '',
            deepseekApiKey: s.deepseekApiKey || '',
            modelName: resolvedModel,
            aiLanguage: resolvedAiLang,
            trashRetentionDays: resolvedRetention,
          })
        );
      });
      setIsSaved(false);
      setTestState({ status: 'idle' });
      setConfirmClearData(false);
    }
  }, [isOpen]);

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        aiProvider: provider,
        geminiApiKey: geminiKey.trim(),
        openaiApiKey: openaiKey.trim(),
        anthropicApiKey: anthropicKey.trim(),
        xaiApiKey: xaiKey.trim(),
        groqApiKey: groqKey.trim(),
        deepseekApiKey: deepseekKey.trim(),
        modelName: modelName.trim(),
        aiLanguage,
        trashRetentionDays,
      }),
    [
      provider,
      geminiKey,
      openaiKey,
      anthropicKey,
      xaiKey,
      groqKey,
      deepseekKey,
      modelName,
      aiLanguage,
      trashRetentionDays,
    ]
  );

  const hasChanges = Boolean(initialSnapshot) && currentSnapshot !== initialSnapshot;

  const currentProviderConfig: ProviderConfig = useMemo(() => {
    return PROVIDER_OPTIONS.find((p) => p.value === provider) ?? PROVIDER_OPTIONS[0]!;
  }, [provider]);

  const rawModelList = useMemo(() => {
    return PROVIDER_MODELS[provider] || [];
  }, [provider]);

  const modelSelectItems = useMemo(() => {
    return [
      ...rawModelList.map((id) => ({ value: id, label: id })),
      {
        value: CUSTOM_MODEL_SENTINEL,
        label: lang === 'tr' ? 'Özel model gir…' : 'Custom model…',
      },
    ];
  }, [rawModelList, lang]);

  const aiLanguageOptions = useMemo(
    () => [
      {
        value: 'auto',
        label: lang === 'tr' ? 'Otomatik (istek diliyle aynı)' : 'Auto (same as request)',
      },
      { value: 'en', label: 'English' },
      { value: 'tr', label: 'Türkçe' },
    ],
    [lang]
  );

  const retentionOptions = useMemo(
    () => [
      { value: '7', label: lang === 'tr' ? '7 gün' : '7 days' },
      { value: '14', label: lang === 'tr' ? '14 gün' : '14 days' },
      { value: '30', label: lang === 'tr' ? '30 gün' : '30 days' },
      { value: '90', label: lang === 'tr' ? '90 gün' : '90 days' },
    ],
    [lang]
  );

  if (!isOpen) return null;

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    setTestState({ status: 'idle' });
    const cfg = PROVIDER_OPTIONS.find((opt) => opt.value === p);
    const modelsForNewProvider = PROVIDER_MODELS[p] || [];
    if (!modelsForNewProvider.includes(modelName)) {
      setModelName(cfg?.defaultModel || modelsForNewProvider[0] || '');
      setIsManualModel(false);
    }
  };

  const getActiveKey = () => {
    switch (provider) {
      case 'google':
        return geminiKey;
      case 'openai':
        return openaiKey;
      case 'anthropic':
        return anthropicKey;
      case 'xai':
        return xaiKey;
      case 'groq':
        return groqKey;
      case 'deepseek':
        return deepseekKey;
      default:
        return '';
    }
  };

  const setActiveKey = (val: string) => {
    setTestState({ status: 'idle' });
    switch (provider) {
      case 'google':
        setGeminiKey(val);
        break;
      case 'openai':
        setOpenaiKey(val);
        break;
      case 'anthropic':
        setAnthropicKey(val);
        break;
      case 'xai':
        setXaiKey(val);
        break;
      case 'groq':
        setGroqKey(val);
        break;
      case 'deepseek':
        setDeepseekKey(val);
        break;
    }
  };

  const handleTestKey = async () => {
    const key = getActiveKey().trim();
    if (!key) {
      setTestState({
        status: 'error',
        message: lang === 'tr' ? 'Lütfen önce bir API anahtarı girin.' : 'Enter an API key first.',
      });
      return;
    }

    setTestState({ status: 'testing' });
    try {
      await testApiConnectionViaBackground({
        provider,
        apiKey: key,
        modelName: modelName.trim() || currentProviderConfig.defaultModel,
      });
      setTestState({
        status: 'ok',
        message:
          lang === 'tr'
            ? `${currentProviderConfig.label} bağlantısı doğrulandı`
            : `Connected to ${currentProviderConfig.label}`,
      });
    } catch (err: any) {
      setTestState({
        status: 'error',
        message:
          err?.message || (lang === 'tr' ? 'Bağlantı testi başarısız.' : 'Connection failed.'),
      });
    }
  };

  const handleSave = async () => {
    const nextSettings: AppSettings = {
      aiProvider: provider,
      geminiApiKey: geminiKey.trim(),
      openaiApiKey: openaiKey.trim(),
      anthropicApiKey: anthropicKey.trim(),
      xaiApiKey: xaiKey.trim(),
      groqApiKey: groqKey.trim(),
      deepseekApiKey: deepseekKey.trim(),
      modelName: modelName.trim() || currentProviderConfig.defaultModel,
      language: lang,
      aiLanguage,
      trashRetentionDays,
    };

    await saveSettings(nextSettings);
    setInitialSnapshot(currentSnapshot);
    setIsSaved(true);
    toast.success(t('savedToast') || (lang === 'tr' ? 'Ayarlar kaydedildi!' : 'Saved!'));
    onSettingsSaved?.();
    setTimeout(() => {
      setIsSaved(false);
    }, 1500);
  };

  const handleExportSettings = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: {
        aiProvider: provider,
        modelName: modelName.trim(),
        language: lang,
        aiLanguage,
        trashRetentionDays,
        theme,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmark-otter-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(lang === 'tr' ? 'Ayarlar dışa aktarıldı' : 'Settings exported');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const s = parsed?.settings || parsed;
      if (s.aiProvider && PROVIDER_MODELS[s.aiProvider as AIProvider]) {
        setProvider(s.aiProvider);
      }
      if (typeof s.modelName === 'string' && s.modelName.trim()) {
        setModelName(s.modelName.trim());
      }
      if (s.language === 'en' || s.language === 'tr') {
        await setLang(s.language);
      }
      if (s.aiLanguage === 'auto' || s.aiLanguage === 'en' || s.aiLanguage === 'tr') {
        setAiLanguage(s.aiLanguage);
      }
      if (typeof s.trashRetentionDays === 'number' && s.trashRetentionDays > 0) {
        setTrashRetentionDays(s.trashRetentionDays);
      }
      if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') {
        await setTheme(s.theme);
      }
      toast.success(
        lang === 'tr'
          ? 'Ayarlar içe aktarıldı — kaydetmeyi unutmayın'
          : 'Settings imported — click Save to apply'
      );
    } catch {
      toast.error(lang === 'tr' ? 'Geçersiz ayar dosyası' : 'Invalid settings JSON file');
    }
  };

  const handleClearLocalData = async () => {
    await clearAllLocalData();
    try {
      localStorage.removeItem('last_broken_scan');
      localStorage.removeItem('theme');
    } catch {}
    setGeminiKey('');
    setOpenaiKey('');
    setAnthropicKey('');
    setXaiKey('');
    setGroqKey('');
    setDeepseekKey('');
    setProvider('google');
    setModelName('gemini-3.8-flash');
    setIsManualModel(false);
    setAiLanguage('auto');
    setTrashRetentionDays(30);
    await setTheme('system');
    setConfirmClearData(false);
    setTestState({ status: 'idle' });
    setInitialSnapshot(
      JSON.stringify({
        aiProvider: 'google',
        geminiApiKey: '',
        openaiApiKey: '',
        anthropicApiKey: '',
        xaiApiKey: '',
        groqApiKey: '',
        deepseekApiKey: '',
        modelName: 'gemini-3.8-flash',
        aiLanguage: 'auto',
        trashRetentionDays: 30,
      })
    );
    onSettingsSaved?.();
    toast.success(lang === 'tr' ? 'Tüm yerel veriler silindi' : 'All local data cleared');
  };

  return (
    <div className="animate-in fade-in slide-in-from-top-1 mx-auto flex w-full max-w-4xl flex-1 flex-col space-y-3 p-3 duration-150">
      {/* Top Bar with Back Button (same pattern as Recycle Bin) */}
      <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            title={t('backBtn') || 'Back'}
            aria-label={t('backBtn') || 'Back'}
            className="border-border/60 h-7 cursor-pointer gap-1 px-2 text-xs font-medium active:scale-[0.97]"
          >
            <ArrowLeft className="size-3.5" />
            <span>{t('backBtn') || 'Back'}</span>
          </Button>
          <div>
            <h2 className="text-foreground text-sm font-semibold tracking-tight">
              {t('settingsTitle') || 'Settings'}
            </h2>
          </div>
        </div>
        <Badge variant="outline" className="text-muted-foreground h-4.5 text-[9.5px] font-normal">
          {t('byokBadge')}
        </Badge>
      </div>

      {/* ===================== GROUP 1: AI ===================== */}
      <section className="border-border/60 bg-card space-y-3 rounded-xl border p-3 shadow-2xs">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-amber-500" />
          <h3 className="text-foreground text-xs font-semibold tracking-tight">AI</h3>
        </div>

        {/* Provider */}
        <div className="space-y-1">
          <label className="text-muted-foreground flex items-center gap-1 text-[10.5px] font-medium">
            <Cpu className="text-muted-foreground/80 h-3 w-3" />
            <span>{t('providerLabel')}</span>
          </label>
          <Select
            items={PROVIDER_OPTIONS.map((p) => ({
              value: p.value,
              label: p.label,
            }))}
            value={provider}
            onValueChange={(val) => handleProviderChange(val as AIProvider)}
          >
            <SelectTrigger className="bg-muted/20 border-border/70 hover:bg-muted/30 h-8 w-full cursor-pointer text-xs focus-visible:ring-1">
              <SelectValue placeholder="Select AI Provider" />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-medium">{p.label}</span>
                    <span className="text-muted-foreground text-[10px]">{p.badge}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* API Key + Test Button */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground text-[10.5px] font-medium">
              {currentProviderConfig.label} {t('apiKeyLabel') || 'API Key'}
            </label>
            <a
              href={currentProviderConfig.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary flex items-center gap-0.5 text-[10px] hover:underline"
            >
              {currentProviderConfig.isFree
                ? t('getKeyLink') || 'Get Free Key'
                : lang === 'tr'
                  ? 'API Anahtarı Al'
                  : 'Get API Key'}{' '}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={getActiveKey()}
                onChange={(e) => setActiveKey(e.target.value)}
                placeholder={currentProviderConfig.keyPrefix}
                className="h-8 pr-8 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer transition-transform active:scale-95"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleTestKey}
              disabled={testState.status === 'testing' || !getActiveKey().trim()}
              className="border-border/70 h-8 shrink-0 cursor-pointer gap-1 px-2.5 text-[11px] font-medium active:scale-[0.97]"
            >
              {testState.status === 'testing' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : testState.status === 'ok' ? (
                <CheckCircle2 className="size-3 text-emerald-500" />
              ) : null}
              <span>{lang === 'tr' ? 'Test Et' : 'Test'}</span>
            </Button>
          </div>

          {testState.status === 'ok' && (
            <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3 shrink-0" />
              <span>{testState.message}</span>
            </div>
          )}
          {testState.status === 'error' && (
            <div className="text-destructive flex items-start gap-1.5 text-[10.5px]">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              <span className="break-words">{testState.message}</span>
            </div>
          )}
        </div>

        {/* Model Selection (Custom model option inside dropdown) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground text-[10.5px] font-medium">
              {t('modelLabel')}
            </label>
            {isManualModel && (
              <button
                type="button"
                onClick={() => {
                  setIsManualModel(false);
                  if (!rawModelList.includes(modelName)) {
                    setModelName(currentProviderConfig.defaultModel || rawModelList[0] || '');
                  }
                }}
                className="text-primary flex cursor-pointer items-center gap-1 text-[10px] hover:underline"
              >
                <List className="h-2.5 w-2.5" />
                <span>{lang === 'tr' ? 'Listeden seç' : 'Back to list'}</span>
              </button>
            )}
          </div>

          {isManualModel ? (
            <Input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder={currentProviderConfig.defaultModel}
              className="h-8 font-mono text-[11px]"
            />
          ) : (
            <Select
              items={modelSelectItems}
              value={modelName}
              onValueChange={(val) => {
                if (val === CUSTOM_MODEL_SENTINEL) {
                  setIsManualModel(true);
                } else if (val) {
                  setModelName(val);
                }
              }}
            >
              <SelectTrigger className="bg-muted/20 border-border/70 hover:bg-muted/30 h-8 w-full cursor-pointer font-mono text-xs focus-visible:ring-1">
                <SelectValue placeholder="Select model..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {rawModelList.map((id) => (
                  <SelectItem key={id} value={id}>
                    <span className="font-mono text-[11px] font-medium">{id}</span>
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_MODEL_SENTINEL}>
                  <span className="text-primary text-[11px] font-medium">
                    ✏️ {lang === 'tr' ? 'Özel model gir…' : 'Custom model…'}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* AI Response Language */}
        <div className="space-y-1">
          <label className="text-muted-foreground text-[10.5px] font-medium">
            {lang === 'tr' ? 'AI yanıt dili' : 'AI response language'}
          </label>
          <Select
            items={aiLanguageOptions}
            value={aiLanguage}
            onValueChange={(val) => {
              if (val === 'auto' || val === 'en' || val === 'tr') {
                setAiLanguage(val);
              }
            }}
          >
            <SelectTrigger className="bg-muted/20 border-border/70 hover:bg-muted/30 h-8 w-full cursor-pointer text-xs focus-visible:ring-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aiLanguageOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="text-xs font-medium">{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Accurate, Web Store-compliant Privacy & Data Notice */}
        <div className="bg-muted/20 border-border/50 text-muted-foreground flex items-start gap-2 rounded-lg border p-2.5 text-[10px] leading-relaxed">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
          <div className="space-y-0.5">
            <p>
              {lang === 'tr'
                ? `API anahtarınız yalnızca bu cihazda saklanır ve AI özelliklerini kullandığınızda sadece ${currentProviderConfig.label} API'sine gönderilir.`
                : `Stored only on this device. Sent only to ${currentProviderConfig.label} when you use AI features.`}
            </p>
            <p className="text-muted-foreground/80">
              {lang === 'tr'
                ? 'AI isteklerinde yalnızca yer imi başlığı, URL ve klasör adları paylaşılır — tam sayfa içeriği gönderilmez.'
                : 'Only bookmark titles, URLs, and folder names are shared — full web page content is never sent.'}
            </p>
          </div>
        </div>
      </section>

      {/* ===================== GROUP 2: APPEARANCE ===================== */}
      <section className="border-border/60 bg-card space-y-3 rounded-xl border p-3 shadow-2xs">
        <div className="flex items-center gap-1.5">
          <Palette className="size-3.5 text-sky-500" />
          <h3 className="text-foreground text-xs font-semibold tracking-tight">
            {lang === 'tr' ? 'Görünüm' : 'Appearance'}
          </h3>
        </div>

        {/* Interface Language */}
        <div className="space-y-1">
          <label className="text-muted-foreground flex items-center gap-1 text-[10.5px] font-medium">
            <Globe className="text-muted-foreground/80 h-3 w-3" />
            <span>{lang === 'tr' ? 'Arayüz dili' : 'Interface language'}</span>
          </label>
          <Select
            items={INTERFACE_LANGUAGE_OPTIONS}
            value={lang}
            onValueChange={(val) => {
              if (val === 'en' || val === 'tr') {
                setLang(val);
              }
            }}
          >
            <SelectTrigger className="bg-muted/20 border-border/70 hover:bg-muted/30 h-8 w-full cursor-pointer text-xs focus-visible:ring-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERFACE_LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="mr-1.5">{opt.flag}</span>
                  <span className="text-xs font-medium">{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Theme: System / Light / Dark */}
        <div className="space-y-1">
          <label className="text-muted-foreground text-[10.5px] font-medium">
            {lang === 'tr' ? 'Tema' : 'Theme'}
          </label>
          <div className="bg-muted/30 border-border/60 grid grid-cols-3 gap-1 rounded-lg border p-1">
            {(
              [
                {
                  value: 'system' as Theme,
                  label: lang === 'tr' ? 'Sistem' : 'System',
                  icon: Monitor,
                },
                {
                  value: 'light' as Theme,
                  label: lang === 'tr' ? 'Açık' : 'Light',
                  icon: Sun,
                },
                {
                  value: 'dark' as Theme,
                  label: lang === 'tr' ? 'Koyu' : 'Dark',
                  icon: Moon,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const isSelected = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-all ${
                    isSelected
                      ? 'bg-card text-foreground border-border/70 border font-semibold shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="size-3" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===================== GROUP 3: DATA ===================== */}
      <section className="border-border/60 bg-card space-y-3 rounded-xl border p-3 shadow-2xs">
        <div className="flex items-center gap-1.5">
          <Database className="size-3.5 text-emerald-500" />
          <h3 className="text-foreground text-xs font-semibold tracking-tight">
            {lang === 'tr' ? 'Veri' : 'Data'}
          </h3>
        </div>

        {/* Trash Retention */}
        <div className="space-y-1">
          <label className="text-muted-foreground text-[10.5px] font-medium">
            {lang === 'tr' ? 'Çöp kutusu saklama süresi' : 'Trash retention period'}
          </label>
          <Select
            items={retentionOptions}
            value={String(trashRetentionDays)}
            onValueChange={(val) => {
              const num = Number(val);
              if (num > 0) setTrashRetentionDays(num);
            }}
          >
            <SelectTrigger className="bg-muted/20 border-border/70 hover:bg-muted/30 h-8 w-full cursor-pointer text-xs focus-visible:ring-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {retentionOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="text-xs font-medium">{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Import / Export Settings */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={handleExportSettings}
            className="h-7 cursor-pointer gap-1 px-2.5 text-[11px]"
          >
            <Download className="size-3" />
            <span>{lang === 'tr' ? 'Ayarları dışa aktar' : 'Export settings'}</span>
          </Button>

          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            className="h-7 cursor-pointer gap-1 px-2.5 text-[11px]"
          >
            <Upload className="size-3" />
            <span>{lang === 'tr' ? 'Ayarları içe aktar' : 'Import settings'}</span>
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {/* Clear All Local Data */}
        <div className="border-border/40 border-t pt-2">
          {confirmClearData ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2">
              <span className="text-[10.5px] font-medium text-rose-700 dark:text-rose-300">
                {lang === 'tr'
                  ? 'API anahtarları, çöp kutusu ve yedekler silinsin mi?'
                  : 'Erase API keys, trash, and snapshots?'}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  onClick={handleClearLocalData}
                  className="h-6 cursor-pointer px-2 text-[10px]"
                >
                  {lang === 'tr' ? 'Evet, sil' : 'Confirm'}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setConfirmClearData(false)}
                  className="h-6 cursor-pointer px-2 text-[10px]"
                >
                  {t('cancelBtn')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setConfirmClearData(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 cursor-pointer gap-1 px-2 text-[11px]"
            >
              <Trash2 className="size-3" />
              <span>{lang === 'tr' ? 'Tüm yerel verileri sil' : 'Clear all local data'}</span>
            </Button>
          )}
        </div>
      </section>

      {/* Footer Save / Cancel */}
      <div className="flex items-center justify-end gap-2 pt-1 pb-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7.5 cursor-pointer px-3 text-xs active:scale-95"
        >
          {t('cancelBtn')}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!hasChanges}
          onClick={handleSave}
          className="bg-primary h-7.5 cursor-pointer gap-1.5 px-3.5 text-xs font-medium shadow-xs active:scale-97 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {isSaved ? t('savedToast') : t('saveBtn')}
        </Button>
      </div>
    </div>
  );
};
