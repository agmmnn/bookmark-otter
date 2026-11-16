import {
  Eye,
  EyeOff,
  Key,
  ExternalLink,
  Save,
  Check,
  Globe,
  Sparkles,
  Cpu,
  Sun,
  Moon,
  Pencil,
  List,
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';

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
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { getSettings, saveSettings } from '@/services/storage';
import type { AIProvider } from '@/types';

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

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English', flag: '🇺🇸', desc: 'English (US / Global)' },
  { value: 'tr', label: 'Türkçe', flag: '🇹🇷', desc: 'Türkçe (TR)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const { lang, setLang, t } = useI18n();
  const { theme, isDark, setTheme } = useTheme();
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
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getSettings().then((s) => {
        const activeProvider = s.aiProvider || 'google';
        setProvider(activeProvider);
        setGeminiKey(s.geminiApiKey || '');
        setOpenaiKey(s.openaiApiKey || '');
        setAnthropicKey(s.anthropicApiKey || '');
        setXaiKey(s.xaiApiKey || '');
        setGroqKey(s.groqApiKey || '');
        setDeepseekKey(s.deepseekApiKey || '');
        const defaultForProvider =
          PROVIDER_OPTIONS.find((p) => p.value === activeProvider)?.defaultModel ||
          'gemini-3.8-flash';
        const resolvedModel = s.modelName || defaultForProvider;
        setModelName(resolvedModel);
        const knownModels = PROVIDER_MODELS[activeProvider] || [];
        setIsManualModel(Boolean(resolvedModel && !knownModels.includes(resolvedModel)));
      });
      setIsSaved(false);
    }
  }, [isOpen]);

  const currentProviderConfig: ProviderConfig = useMemo(() => {
    return PROVIDER_OPTIONS.find((p) => p.value === provider) ?? PROVIDER_OPTIONS[0]!;
  }, [provider]);

  const rawModelList = useMemo(() => {
    return PROVIDER_MODELS[provider] || [];
  }, [provider]);

  const modelSelectItems = useMemo(() => {
    return rawModelList.map((id) => ({
      value: id,
      label: id,
    }));
  }, [rawModelList]);

  if (!isOpen) return null;

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    const cfg = PROVIDER_OPTIONS.find((opt) => opt.value === p);
    const modelsForNewProvider = PROVIDER_MODELS[p] || [];
    const isCurrentModelValid = modelsForNewProvider.includes(modelName);
    if (!isCurrentModelValid) {
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

  const handleSave = async () => {
    await saveSettings({
      aiProvider: provider,
      geminiApiKey: geminiKey.trim(),
      openaiApiKey: openaiKey.trim(),
      anthropicApiKey: anthropicKey.trim(),
      xaiApiKey: xaiKey.trim(),
      groqApiKey: groqKey.trim(),
      deepseekApiKey: deepseekKey.trim(),
      modelName: modelName.trim(),
      language: lang,
    });
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onSettingsSaved?.();
      onClose();
    }, 450);
  };

  return (
    <div className="animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-xs transition-opacity duration-150">
      <div className="border-border/80 bg-card animate-in zoom-in-95 w-full max-w-sm origin-center space-y-3.5 rounded-xl border p-3.5 text-xs shadow-xl transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]">
        {/* Modal Header */}
        <div className="border-border/70 flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-1.5">
            <Key className="text-primary h-3.5 w-3.5" />
            <h2 className="text-foreground text-xs font-semibold tracking-tight">
              {t('settingsTitle')}
            </h2>
          </div>
          <Badge variant="outline" className="text-muted-foreground h-4 text-[9px] font-normal">
            {t('byokBadge')}
          </Badge>
        </div>

        {/* 1. Language Selection (shadcn Select dropdown) */}
        <div className="space-y-1">
          <label className="text-muted-foreground flex items-center gap-1 text-[10.5px] font-medium">
            <Globe className="text-muted-foreground/80 h-3 w-3" />
            <span>{t('languageLabel')}</span>
          </label>
          <Select
            items={LANGUAGE_OPTIONS}
            value={lang}
            onValueChange={(val) => {
              if (val === 'en' || val === 'tr') {
                setLang(val);
              }
            }}
          >
            <SelectTrigger className="bg-muted/20 border-border/70 hover:bg-muted/30 h-8 w-full cursor-pointer text-xs focus-visible:ring-1">
              <SelectValue placeholder="Select Language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="mr-1.5">{opt.flag}</span>
                  <span className="text-xs font-medium">{opt.label}</span>
                  <span className="text-muted-foreground ml-2 font-mono text-[10px]">
                    ({opt.desc})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 2. Provider Selection (shadcn Select dropdown) */}
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
                    <span className="text-muted-foreground font-mono text-[10px]">{p.badge}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. API Key Input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground text-[10.5px] font-medium">
              {currentProviderConfig.label} {t('apiKeyLabel') || 'API Key'}
            </label>
            <a
              href={currentProviderConfig.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary flex items-center gap-0.5 text-[9.5px] hover:underline"
            >
              {currentProviderConfig.isFree
                ? t('getKeyLink') || 'Get Free Key'
                : lang === 'tr'
                  ? 'API Anahtarı Al'
                  : 'Get API Key'}{' '}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
          <div className="relative">
            <Input
              type={showKey ? 'text' : 'password'}
              value={getActiveKey()}
              onChange={(e) => setActiveKey(e.target.value)}
              placeholder={currentProviderConfig.keyPrefix}
              className="h-7.5 pr-7 font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer transition-transform active:scale-95"
            >
              {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* 4. Model Selection (Curated dropdown or Manual entry) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground flex items-center gap-1 text-[10.5px] font-medium">
              <Sparkles className="h-3 w-3 fill-amber-500/20 text-amber-500" />
              <span>{t('modelLabel')}</span>
            </label>
            <button
              type="button"
              onClick={() => {
                if (isManualModel) {
                  setIsManualModel(false);
                  if (!rawModelList.includes(modelName)) {
                    setModelName(currentProviderConfig.defaultModel || rawModelList[0] || '');
                  }
                } else {
                  setIsManualModel(true);
                }
              }}
              className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 font-mono text-[9.5px] transition-colors"
            >
              {isManualModel ? (
                <>
                  <List className="h-2.5 w-2.5" />
                  <span>{lang === 'tr' ? 'Liste' : 'Presets'}</span>
                </>
              ) : (
                <>
                  <Pencil className="h-2.5 w-2.5" />
                  <span>{lang === 'tr' ? 'Manuel' : 'Custom'}</span>
                </>
              )}
            </button>
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
                if (val) setModelName(val);
              }}
            >
              <SelectTrigger className="bg-muted/20 border-border/70 hover:bg-muted/30 h-8 w-full cursor-pointer font-mono text-xs focus-visible:ring-1">
                <SelectValue placeholder="Select model..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {modelSelectItems.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="font-mono text-[11px] font-medium">{m.value}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* 5. Dark Mode Switch (shadcn Switch) */}
        <div className="border-border/50 bg-muted/20 flex items-center justify-between rounded-lg border p-2">
          <div className="space-y-0.5">
            <label className="text-foreground flex items-center gap-1.5 text-[10.5px] font-medium">
              {isDark ? (
                <Moon className="size-3 text-sky-400" />
              ) : (
                <Sun className="size-3 text-amber-500" />
              )}
              <span>{t('darkModeLabel')}</span>
            </label>
            <p className="text-muted-foreground text-[9.5px]">
              {theme === 'system'
                ? t('themeSystemDesc')
                : isDark
                  ? t('themeDarkDesc')
                  : t('themeLightDesc')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[10px]">
              {isDark ? 'Dark' : 'Light'}
            </span>
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              aria-label="Toggle dark mode"
              className="cursor-pointer"
            />
          </div>
        </div>

        {/* Privacy Note */}
        <p className="text-muted-foreground/80 bg-muted/20 border-border/40 rounded-md border p-2 text-[9.5px] leading-normal">
          {t('privacyNotice')}
        </p>

        {/* Footer Buttons */}
        <div className="border-border/60 flex items-center justify-end gap-1.5 border-t pt-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            className="h-6.5 cursor-pointer px-2.5 text-[11px] active:scale-95"
          >
            {t('cancelBtn')}
          </Button>
          <Button
            size="xs"
            onClick={handleSave}
            className="bg-primary h-6.5 cursor-pointer gap-1 px-3 text-[11px] font-medium shadow-xs active:scale-97"
          >
            {isSaved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {isSaved ? t('savedToast') : t('saveBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
};
