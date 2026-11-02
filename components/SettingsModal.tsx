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
    badge: 'Gemini 2.5 / 3.8',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefix: 'AIzaSy...',
    defaultModel: 'gemini-2.5-flash',
    isFree: true,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    badge: 'GPT-4o / GPT-5',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-proj-...',
    defaultModel: 'gpt-4o-mini',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    badge: 'Claude 3.7 / 3.5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-...',
    defaultModel: 'claude-3-7-sonnet-latest',
  },
  {
    value: 'xai',
    label: 'xAI Grok',
    badge: 'Grok 4 / 3',
    keyUrl: 'https://console.x.ai/',
    keyPrefix: 'xai-...',
    defaultModel: 'grok-4',
  },
  {
    value: 'groq',
    label: 'Groq (Ultra-Fast)',
    badge: 'Llama 3.3 70B',
    keyUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_...',
    defaultModel: 'llama-3.3-70b-versatile',
    isFree: true,
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    badge: 'V3 / R1 Reasoner',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-...',
    defaultModel: 'deepseek-chat',
  },
];

// Models strictly synchronized with official Vercel AI SDK specification
// https://ai-sdk.dev/docs/foundations/providers-and-models
const PROVIDER_MODELS: Record<AIProvider, { id: string; label: string; badge: string }[]> = {
  google: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Recommended · Fast & Agentic' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', badge: 'Deep Multimodal Reasoning' },
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash Lite',
      badge: 'Ultra-fast & Cost-Efficient',
    },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: 'Real-time & Multimodal' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', badge: 'Agentic Preview' },
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', badge: 'Flash Hybrid Reasoning' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', badge: 'Fast & Versatile' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', badge: 'Cost-Efficient' },
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', badge: 'Next-Gen Reasoning' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', badge: 'Next-Gen Flash' },
    { id: 'gemini-4-argon', label: 'Gemini 4 Argon', badge: 'Frontier Experimental' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', badge: 'Recommended · Fast & Smart' },
    { id: 'gpt-4o', label: 'GPT-4o', badge: 'Omni Flagship' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', badge: 'High-Efficiency Reasoning' },
    { id: 'gpt-4.1', label: 'GPT-4.1', badge: 'Next-Gen Frontier Flagship' },
    { id: 'o3-mini', label: 'o3-mini', badge: 'Math & Coding Reasoning' },
    { id: 'o1', label: 'o1', badge: 'Deep Reasoning Flagship' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', badge: 'Agentic Frontier Mini' },
    { id: 'gpt-5', label: 'GPT-5', badge: 'Frontier Model' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', badge: 'Compact Frontier' },
    { id: 'gpt-5.4', label: 'GPT-5.4', badge: 'Advanced Frontier' },
    { id: 'gpt-5.6', label: 'GPT-5.6', badge: 'Frontier Flagship' },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', badge: 'Frontier Flagship' },
  ],
  anthropic: [
    {
      id: 'claude-3-7-sonnet-latest',
      label: 'Claude 3.7 Sonnet',
      badge: 'Recommended · Hybrid Reasoning',
    },
    {
      id: 'claude-3-5-sonnet-latest',
      label: 'Claude 3.5 Sonnet',
      badge: 'Deep Intelligence & Code',
    },
    { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku', badge: 'Ultra-fast & Responsive' },
    { id: 'claude-3-opus-latest', label: 'Claude 3 Opus', badge: 'Deep Nuance & Logic' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', badge: 'Next-Gen Reasoning' },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', badge: 'Frontier Deep Reasoning' },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', badge: 'Future Frontier' },
  ],
  xai: [
    { id: 'grok-4', label: 'Grok 4', badge: 'Recommended · High Performance' },
    { id: 'grok-4-fast-reasoning', label: 'Grok 4 Fast Reasoning', badge: 'Real-time Reasoning' },
    { id: 'grok-3', label: 'Grok 3', badge: 'Deep Reasoning Flagship' },
    { id: 'grok-3-mini', label: 'Grok 3 Mini', badge: 'Fast & Efficient' },
    { id: 'grok-4.5', label: 'Grok 4.5', badge: 'Frontier Preview' },
  ],
  groq: [
    {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B',
      badge: 'Recommended · Ultra-Low Latency',
    },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', badge: 'Lightning Fast' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (32k)', badge: 'Fast MoE' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)', badge: 'Recommended · Fast & Smart' },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek Reasoner (R1)',
      badge: 'Deep Math & Code Reasoning',
    },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', badge: 'High-speed Next-Gen' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', badge: 'Frontier Reasoning' },
  ],
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
  const [modelName, setModelName] = useState('gemini-2.5-flash');
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getSettings().then((s) => {
        setProvider(s.aiProvider || 'google');
        setGeminiKey(s.geminiApiKey || '');
        setOpenaiKey(s.openaiApiKey || '');
        setAnthropicKey(s.anthropicApiKey || '');
        setXaiKey(s.xaiApiKey || '');
        setGroqKey(s.groqApiKey || '');
        setDeepseekKey(s.deepseekApiKey || '');
        const defaultForProvider =
          PROVIDER_OPTIONS.find((p) => p.value === s.aiProvider)?.defaultModel ||
          'gemini-2.5-flash';
        setModelName(s.modelName || defaultForProvider);
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

  // Build items array for shadcn Select with fallback for existing custom values
  const modelSelectItems = useMemo(() => {
    const isKnown = rawModelList.some((m) => m.id === modelName);
    const list = rawModelList.map((m) => ({
      value: m.id,
      label: `${m.label} (${m.badge})`,
      displayId: m.id,
      badge: m.badge,
    }));

    if (!isKnown && modelName) {
      list.unshift({
        value: modelName,
        label: modelName,
        displayId: modelName,
        badge: 'Custom',
      });
    }
    return list;
  }, [rawModelList, modelName]);

  if (!isOpen) return null;

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    const cfg = PROVIDER_OPTIONS.find((opt) => opt.value === p);
    const modelsForNewProvider = PROVIDER_MODELS[p] || [];
    const isCurrentModelValid = modelsForNewProvider.some((m) => m.id === modelName);
    if (!isCurrentModelValid) {
      setModelName(cfg?.defaultModel || modelsForNewProvider[0]?.id || '');
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

        {/* 4. Model Selection (shadcn Select dropdown with Vercel AI SDK curated models) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground flex items-center gap-1 text-[10.5px] font-medium">
              <Sparkles className="h-3 w-3 fill-amber-500/20 text-amber-500" />
              <span>{t('modelLabel')}</span>
            </label>
            <span className="text-muted-foreground font-mono text-[9.5px]">
              {rawModelList.length} models
            </span>
          </div>

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
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-medium">{m.displayId}</span>
                    <span className="text-muted-foreground truncate font-sans text-[9.5px]">
                      {m.badge}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
