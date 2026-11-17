import { browser } from 'wxt/browser';

import type {
  AgentProgress,
  AIProvider,
  BookmarkTreeNode,
  CopilotScopePreset,
  FlatFolder,
  PendingSuggestion,
  ReorgPlan,
} from '@/types';

export interface SuggestBookmarkRequest {
  bookmarkId: string;
  originalTitle: string;
  url: string;
  pageMeta?: { description?: string; h1?: string };
  folders: FlatFolder[];
}

export interface GeneratePlanRequest {
  userPrompt: string;
  tree: BookmarkTreeNode[];
  compactTreeDSL: string;
  useHarness: boolean;
  scopePreset?: CopilotScopePreset;
  maxBookmarks?: number;
  resumeFromCheckpoint?: boolean;
}

export type AiPortMessage =
  | { type: 'KEEPALIVE' }
  | { type: 'PROGRESS'; progress: AgentProgress }
  | { type: 'RESULT'; plan: ReorgPlan }
  | { type: 'ERROR'; error: string; checkpoint?: { completed: number; total: number } };

/**
 * Determines whether the user's request should trigger the full Multi-Step Agent Harness
 * rather than the single-shot scoped call.
 */
export function shouldUseAgentHarness(
  userPrompt: string,
  totalBookmarksCount: number,
  scopeType: 'targeted' | 'clustered' | 'full'
): boolean {
  if (scopeType === 'targeted') {
    return false;
  }

  const p = userPrompt.toLowerCase();
  const hasGlobalKeywords =
    p.includes('all') ||
    p.includes('tüm') ||
    p.includes('hepsi') ||
    p.includes('bütün') ||
    p.includes('everything') ||
    p.includes('edit all') ||
    p.includes('organize all') ||
    p.includes('tümünü düzenle') ||
    p.includes('kütüphane');

  return hasGlobalKeywords || (scopeType === 'clustered' && totalBookmarksCount > 60);
}

/**
 * Requests a single-bookmark AI suggestion via the background service worker.
 * Keeps the AI SDK & provider bundles out of the sidepanel chunk.
 */
export async function suggestForNewBookmarkViaBackground(
  params: SuggestBookmarkRequest
): Promise<PendingSuggestion> {
  const response = (await browser.runtime.sendMessage({
    type: 'AI_SUGGEST_BOOKMARK',
    payload: params,
  })) as { ok: true; suggestion: PendingSuggestion } | { ok: false; error: string } | undefined;

  if (!response) {
    throw new Error('No response from background AI service.');
  }
  if (!response.ok) {
    throw new Error(response.error || 'Could not generate suggestion.');
  }
  return response.suggestion;
}

/**
 * Tests the provider API key + selected model directly via the background service worker.
 */
export async function testApiConnectionViaBackground(params: {
  provider: AIProvider;
  apiKey: string;
  modelName?: string;
}): Promise<void> {
  const response = (await browser.runtime.sendMessage({
    type: 'AI_TEST_CONNECTION',
    payload: params,
  })) as { ok: true } | { ok: false; error: string } | undefined;

  if (!response) {
    throw new Error('No response from background AI service.');
  }
  if (!response.ok) {
    throw new Error(response.error || 'API key validation failed.');
  }
}

/**
 * Runs reorganization plan generation (either Multi-Step Agent Harness or single-shot)
 * inside the background worker over a long-lived Port, streaming progress updates back.
 */
export function generatePlanViaBackground(
  params: GeneratePlanRequest & {
    onProgress?: (progress: AgentProgress) => void;
    signal?: AbortSignal;
  }
): Promise<ReorgPlan> {
  const { onProgress, signal, ...payload } = params;

  return new Promise<ReorgPlan>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Plan generation aborted by user.', 'AbortError'));
      return;
    }

    const port = browser.runtime.connect({ name: 'ai-copilot-plan' });
    let settled = false;

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
      try {
        port.disconnect();
      } catch {
        // Ignore if already disconnected
      }
    };

    const handleAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Plan generation aborted by user.', 'AbortError'));
    };

    signal?.addEventListener('abort', handleAbort);

    port.onMessage.addListener((rawMsg: unknown) => {
      const msg = rawMsg as AiPortMessage;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'KEEPALIVE') return;

      if (msg.type === 'PROGRESS') {
        onProgress?.(msg.progress);
      } else if (msg.type === 'RESULT') {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(msg.plan);
      } else if (msg.type === 'ERROR') {
        if (settled) return;
        settled = true;
        cleanup();
        const err = new Error(msg.error || 'Plan generation failed.') as Error & {
          checkpoint?: { completed: number; total: number };
        };
        if (msg.checkpoint) {
          err.checkpoint = msg.checkpoint;
        }
        reject(err);
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', handleAbort);
      const errMsg =
        (browser.runtime as any)?.lastError?.message ||
        'Background AI worker disconnected before plan completed.';
      reject(new Error(errMsg));
    });

    port.postMessage({ type: 'START_PLAN', payload });
  });
}
