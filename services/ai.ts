import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import type {
  AIProvider,
  AppSettings,
  FlatFolder,
  PendingSuggestion,
  ReorgPlan,
  BookmarkTreeNode,
} from '@/types';

import { hydrateReorgPlan } from './bookmarks';
import { getSettings } from './storage';

function buildProviderModel(provider: AIProvider, apiKey: string, modelName?: string) {
  switch (provider) {
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelName || 'gemini-3.8-flash');
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(modelName || 'gpt-5.6');
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelName || 'claude-sonnet-5');
    }
    case 'xai': {
      const xai = createXai({ apiKey });
      return xai(modelName || 'grok-4.5');
    }
    case 'groq': {
      const groq = createGroq({ apiKey });
      return groq(modelName || 'meta-llama/llama-4-scout-17b-16e-instruct');
    }
    case 'deepseek': {
      const deepseek = createDeepSeek({ apiKey });
      return deepseek(modelName || 'deepseek-v4-flash');
    }
    default: {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelName || 'gemini-3.8-flash');
    }
  }
}

export async function testProviderConnection(params: {
  provider: AIProvider;
  apiKey: string;
  modelName?: string;
}): Promise<void> {
  const key = params.apiKey.trim();
  if (!key) {
    throw new Error('API key is empty.');
  }
  const model = buildProviderModel(params.provider, key, params.modelName?.trim());
  await generateText({
    model,
    prompt: 'Reply with OK',
    maxOutputTokens: 5,
  });
}

function resolveAiTargetLanguage(settings: AppSettings, mode: 'request' | 'page'): string {
  if (settings.aiLanguage === 'en') return 'English';
  if (settings.aiLanguage === 'tr') return 'Turkish';
  return mode === 'request'
    ? "same language as the user's request (defaulting to the bookmark titles' language)"
    : "same language as the bookmark title/page content (defaulting to the user's interface language)";
}

export function getModel() {
  return async () => {
    const settings = await getSettings();
    const isTr = settings.language === 'tr';

    const keyMap: Record<AIProvider, string | undefined> = {
      google: settings.geminiApiKey,
      openai: settings.openaiApiKey,
      anthropic: settings.anthropicApiKey,
      xai: settings.xaiApiKey,
      groq: settings.groqApiKey,
      deepseek: settings.deepseekApiKey,
    };

    const apiKey = keyMap[settings.aiProvider]?.trim();
    if (!apiKey) {
      throw new Error(
        isTr
          ? 'Lütfen Ayarlar bölümünden API anahtarınızı girin.'
          : 'Please enter your API Key in Settings.'
      );
    }

    return buildProviderModel(settings.aiProvider, apiKey, settings.modelName);
  };
}

export async function getLanguageModel() {
  const modelFn = getModel();
  return await modelFn();
}

/**
 * 1. AI Suggestion for a newly starred bookmark (onCreated event)
 * Uses a single canonical English system prompt.
 */
export async function suggestForNewBookmark(params: {
  bookmarkId: string;
  originalTitle: string;
  url: string;
  pageMeta?: { description?: string; h1?: string };
  folders: FlatFolder[];
}): Promise<PendingSuggestion> {
  const modelFn = getModel();
  const model = await modelFn();
  const settings = await getSettings();
  const targetLang = resolveAiTargetLanguage(settings, 'page');

  const folderList = params.folders
    .filter((f) => f.id !== '0')
    .map((f) => `ID:${f.id} => ${f.path}`)
    .join('\n');

  const system = `You are "Bookmark Otter", an intelligent, design-conscious bookmark assistant.
Your mission is to analyze a newly starred web page and propose a concise, human-friendly title and the best target folder.

[TITLE CLEANUP HEURISTICS]
1. Strip notifications like "(3) ", unread badges, and SEO clutter ("Home | ", "Official Site", "- GitHub", "Twitter / X").
2. Retain only the clean product/tool name and an essential 2-4 word descriptor.
3. Respect the original language of the page content.

[FOLDER SELECTION RULES]
1. Prioritize choosing the most relevant folder from [EXISTING FOLDERS] (return its exact ID in suggestedFolderId).
2. Only suggest a new folder if no existing folder is suitable (isNewFolder: true, suggestedFolderId: "NEW").
3. When suggesting a new folder, mirror the user's existing naming and emoji style (e.g. "🎨 Design & UI", "💻 Engineering").
4. Output language: ${targetLang}.`;

  const prompt = `[PAGE INFORMATION]
URL: ${params.url}
Original Title: ${params.originalTitle}
H1: ${params.pageMeta?.h1 || 'N/A'}
Description: ${params.pageMeta?.description || 'N/A'}

[EXISTING FOLDERS]
${folderList}`;

  const schema = z.object({
    suggestedTitle: z.string().describe('Clean, human-friendly bookmark title'),
    suggestedFolderId: z.string().describe('Existing folder ID or "NEW" if creating a new one'),
    suggestedFolderPath: z.string().describe('Path of selected or proposed folder'),
    isNewFolder: z.boolean().describe('True if a new folder should be created'),
    newFolderName: z.string().optional().describe('Proposed folder name if new folder is needed'),
  });

  const { object } = await generateObject({
    model,
    schema,
    system,
    prompt,
  });

  return {
    bookmarkId: params.bookmarkId,
    originalTitle: params.originalTitle,
    url: params.url,
    suggestedTitle: object.suggestedTitle,
    suggestedFolderId: object.suggestedFolderId,
    suggestedFolderPath: object.suggestedFolderPath,
    isNewFolder: object.isNewFolder,
    newFolderName: object.newFolderName,
    timestamp: Date.now(),
  };
}

/**
 * 2. Natural Language Bulk Reorganization Plan Generator
 * Uses a single canonical English system prompt.
 */
export async function generateReorganizationPlan(params: {
  userPrompt: string;
  compactTreeDSL: string;
  tree?: BookmarkTreeNode[];
}): Promise<ReorgPlan> {
  const modelFn = getModel();
  const model = await modelFn();
  const settings = await getSettings();
  const targetLang = resolveAiTargetLanguage(settings, 'request');

  const system = `You are "Bookmark Otter", an elite, design-conscious bookmark organization engine.
Your mission is to take the user's natural language reorganization request and construct a safe, pragmatic, and executable Action Plan.

[SAFETY & INTEGRITY RULES - STRICTLY ENFORCED]
1. ROOT SHIELD:
   - Root folders (ID '0', '1' Bookmarks Bar, '2' Other Bookmarks) can NEVER be modified, moved, or deleted.

2. TARGETED DIRECTIVES & FOLDER FOCUS (CRITICAL):
   - If the user prompt or prompt header contains "# TARGET DIRECTIVE" focusing on a specific folder (e.g. "B" or "Dev"):
     * Your PRIMARY duty is to clean, cluster, and organize the bookmarks inside THAT target folder!
     * Group related items into clean subfolders (using CREATE_FOLDER with tmpId).
     * If an item clearly does not belong in this topic, move it out to an appropriate existing folder from # EXISTING FOLDERS.
     * Do NOT be conservative; actively organize and group the items inside the targeted folder!

3. DOMAIN-AWARE & ARCHIVE-WIDE REORGANIZATION:
   - When asked to organize all, edit all, or when given # MAJOR DOMAIN CLUSTERS:
     * Focus on organizing LOOSE UNORGANIZED BOOKMARKS into thematic folders matching domain clusters (e.g. GitHub/DevTools into "💻 Development", Crypto into "📈 Crypto & Trading", Design into "🎨 Design & Media").
     * Dismantle and empty temporary DUMP FOLDERS (e.g. "other", "needfix", "temp", "imported").
     * Provide a concise 2-5 word "reason" for every action (e.g. "Move to Development folder", "Dismantle temp folder").

4. ID INTEGRITY:
   - "bookmarkId" must strictly be an exact ID from the [BOOKMARKS] table. Never hallucinate or invent IDs.

5. DEPENDENCY ORDER:
   - When creating a new folder, assign a unique temporary ID (e.g. "tmp_folder_1").
   - When moving bookmarks into that new folder, set targetFolderId to that exact tmpId.

6. PRAGMATIC DEPTH:
   - Keep folder hierarchies max 2-3 levels deep.
   - Do NOT create single-item micro-folders; group related items logically.

7. AESTHETICS:
   - Mirror the user's existing naming and emoji conventions (e.g. "💻 Development", "📚 Languages & Dictionaries", "🌐 Web & Tools").

8. SUMMARY & LANGUAGE:
   - Write the "summary" and action "reason" fields in ${targetLang}.
   - The summary must be a concise, clear 1-2 sentence overview of planned actions.`;

  const prompt = `[USER REQUEST]
"${params.userPrompt}"

[BOOKMARK TREE]
${params.compactTreeDSL}`;

  const actionSchema = z.discriminatedUnion('action', [
    z.object({
      action: z.literal('CREATE_FOLDER'),
      tmpId: z.string().describe('Temporary ID (e.g. tmp_folder_1)'),
      parentId: z.string().describe('Parent folder ID (usually "1" for Bookmarks Bar)'),
      title: z.string().describe('Folder title'),
      reason: z.string().optional(),
    }),
    z.object({
      action: z.literal('MOVE'),
      bookmarkId: z.string().describe('ID of bookmark to move'),
      bookmarkTitle: z.string().optional().describe('Bookmark title'),
      targetFolderId: z.string().describe('Target folder real ID or tmpId'),
      targetFolderTitle: z.string().optional().describe('Target folder path/title'),
      reason: z.string().optional(),
    }),
    z.object({
      action: z.literal('RENAME'),
      id: z.string().describe('Bookmark ID to rename'),
      oldTitle: z.string().optional(),
      newTitle: z.string().describe('New title'),
      reason: z.string().optional(),
    }),
    z.object({
      action: z.literal('REMOVE'),
      id: z.string().describe('Bookmark or folder ID to remove'),
      title: z.string().optional(),
      isFolder: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  ]);

  const planSchema = z.object({
    summary: z.string().describe('Summary of the action plan'),
    actions: z.array(actionSchema).describe('List of sequential actions'),
  });

  const { object } = await generateObject({
    model,
    schema: planSchema,
    system,
    prompt,
  });

  const rawPlan: ReorgPlan = {
    summary: object.summary,
    actions: object.actions as any,
    rawDsl: params.compactTreeDSL,
    rawJson: JSON.stringify(object, null, 2),
  };

  // 100% Local Hydration Guarantee: Resolve all bookmark titles, URLs, domains, and folder paths
  const hydratedPlan = params.tree ? hydrateReorgPlan(rawPlan, params.tree) : rawPlan;

  // Log full debug payload for developer inspection
  console.group('🦦 [Bookmark Otter] AI Reorganization Debug Info');
  console.log('%c1. USER PROMPT:', 'color: #3b82f6; font-weight: bold;', params.userPrompt);
  console.log(
    '%c2. TREE DSL SENT TO AI:\n',
    'color: #10b981; font-weight: bold;\n',
    params.compactTreeDSL
  );
  console.log('%c3. HYDRATED ACTION PLAN:', 'color: #f59e0b; font-weight: bold;', hydratedPlan);
  console.groupEnd();

  return hydratedPlan;
}
