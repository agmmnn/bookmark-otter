import type { AIProvider } from '@/types';

export interface ProviderConfig {
  value: AIProvider;
  label: string;
  shortLabel: string;
  badge: string;
  keyUrl: string;
  keyPrefix: string;
  defaultModel: string;
  isFree?: boolean;
}

export const PROVIDER_OPTIONS: ProviderConfig[] = [
  {
    value: 'google',
    label: 'Google Gemini',
    shortLabel: 'Gemini',
    badge: 'Gemini 3.5 / 4',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyPrefix: 'AIzaSy...',
    defaultModel: 'gemini-3.8-flash',
    isFree: true,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    shortLabel: 'OpenAI',
    badge: 'GPT-5.6 / 6',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-proj-...',
    defaultModel: 'gpt-5.6',
  },
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    shortLabel: 'Claude',
    badge: 'Claude 4.8 / 5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-...',
    defaultModel: 'claude-sonnet-5',
  },
  {
    value: 'xai',
    label: 'xAI Grok',
    shortLabel: 'Grok',
    badge: 'Grok 4 / 4.7',
    keyUrl: 'https://console.x.ai/',
    keyPrefix: 'xai-...',
    defaultModel: 'grok-4.5',
  },
  {
    value: 'groq',
    label: 'Groq',
    shortLabel: 'Groq',
    badge: 'Llama 4 / 3.3',
    keyUrl: 'https://console.groq.com/keys',
    keyPrefix: 'gsk_...',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    isFree: true,
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    shortLabel: 'DeepSeek',
    badge: 'V4 Flash / Pro',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyPrefix: 'sk-...',
    defaultModel: 'deepseek-v4-flash',
  },
];

// Models synchronized with official Vercel AI SDK specification (latest generations only)
export const PROVIDER_MODELS: Record<AIProvider, string[]> = {
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

/**
 * Formats a raw model identifier into a compact, readable label (e.g. "gemini-3.8-flash" -> "Gemini 3.8 Flash").
 */
export function formatModelDisplayName(modelName: string): string {
  const trimmed = (modelName || '').trim();
  if (!trimmed) return 'Model';
  const short = trimmed.includes('/') ? trimmed.split('/').pop() || trimmed : trimmed;
  return short
    .split('-')
    .map((seg) => {
      if (!seg) return '';
      if (/^\d+(\.\d+)?$/.test(seg)) return seg;
      if (seg === 'gpt' || seg === 'ui') return seg.toUpperCase();
      return seg.charAt(0).toUpperCase() + seg.slice(1);
    })
    .filter(Boolean)
    .join(' ');
}
