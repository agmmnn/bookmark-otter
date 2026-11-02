import { createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import { generateObject } from 'ai';
import { z } from 'zod';

import type { FlatFolder, PendingSuggestion, ReorgPlan } from '@/types';

import { getSettings } from './storage';

function getModel() {
  return async () => {
    const settings = await getSettings();
    const isTr = settings.language === 'tr';

    switch (settings.aiProvider) {
      case 'google': {
        if (!settings.geminiApiKey) {
          throw new Error(
            isTr
              ? 'Lütfen Ayarlar bölümünden Gemini API anahtarınızı girin.'
              : 'Please enter your Gemini API Key in Settings.'
          );
        }
        const google = createGoogleGenerativeAI({ apiKey: settings.geminiApiKey });
        return google(settings.modelName || 'gemini-2.5-flash');
      }
      case 'openai': {
        if (!settings.openaiApiKey) {
          throw new Error(
            isTr
              ? 'Lütfen Ayarlar bölümünden OpenAI API anahtarınızı girin.'
              : 'Please enter your OpenAI API Key in Settings.'
          );
        }
        const openai = createOpenAI({ apiKey: settings.openaiApiKey });
        return openai(settings.modelName || 'gpt-4o-mini');
      }
      case 'anthropic': {
        if (!settings.anthropicApiKey) {
          throw new Error(
            isTr
              ? 'Lütfen Ayarlar bölümünden Anthropic API anahtarınızı girin.'
              : 'Please enter your Anthropic API Key in Settings.'
          );
        }
        const anthropic = createAnthropic({ apiKey: settings.anthropicApiKey });
        return anthropic(settings.modelName || 'claude-3-7-sonnet-latest');
      }
      case 'xai': {
        if (!settings.xaiApiKey) {
          throw new Error(
            isTr
              ? 'Lütfen Ayarlar bölümünden xAI API anahtarınızı girin.'
              : 'Please enter your xAI API Key in Settings.'
          );
        }
        const xai = createXai({ apiKey: settings.xaiApiKey });
        return xai(settings.modelName || 'grok-4');
      }
      case 'groq': {
        if (!settings.groqApiKey) {
          throw new Error(
            isTr
              ? 'Lütfen Ayarlar bölümünden Groq API anahtarınızı girin.'
              : 'Please enter your Groq API Key in Settings.'
          );
        }
        const groq = createGroq({ apiKey: settings.groqApiKey });
        return groq(settings.modelName || 'llama-3.3-70b-versatile');
      }
      case 'deepseek': {
        if (!settings.deepseekApiKey) {
          throw new Error(
            isTr
              ? 'Lütfen Ayarlar bölümünden DeepSeek API anahtarınızı girin.'
              : 'Please enter your DeepSeek API Key in Settings.'
          );
        }
        const deepseek = createDeepSeek({ apiKey: settings.deepseekApiKey });
        return deepseek(settings.modelName || 'deepseek-chat');
      }
      default: {
        const google = createGoogleGenerativeAI({ apiKey: settings.geminiApiKey });
        return google(settings.modelName || 'gemini-2.5-flash');
      }
    }
  };
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
  const targetLang = settings.language === 'tr' ? 'Turkish' : 'English';

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
}): Promise<ReorgPlan> {
  const modelFn = getModel();
  const model = await modelFn();
  const settings = await getSettings();
  const targetLang = settings.language === 'tr' ? 'Turkish' : 'English';

  const system = `You are "Bookmark Otter", an elite, design-conscious bookmark organization engine.
Your mission is to take the user's natural language reorganization request and construct a safe, pragmatic, and executable Action Plan.

[SAFETY & INTEGRITY RULES - STRICTLY ENFORCED]
1. ROOT SHIELD:
   - Root folders (ID '0', '1' Bookmarks Bar, '2' Other Bookmarks) can NEVER be modified, moved, or deleted.

2. EXHAUSTIVE TREE-WIDE REORGANIZATION (CRITICAL):
   - When the user asks to "organize all", "all bookmarks", "hepsini", "edit all", or general restructuring:
     Your scope is the ENTIRE BOOKMARK TREE, NOT just loose bookmarks on the Bookmarks Bar!
   - DEEP INSPECTION OF EXISTING FOLDERS:
     Analyze the "currentFolder" column for each bookmark in the # BOOKMARKS table.
     a) Catch Misplaced Bookmarks: If a bookmark inside an existing folder does not belong to that folder's theme (for example, a GitHub developer tool like "antfu/taze" or an article inside a phonetic/language folder like "IPA"), MOVE it to its rightful topical folder (e.g. "💻 Development").
     b) Dismantle Catch-All / Dump Folders: Folders with names like "other", "needfix", "temp", "yeni klasör", "misc" are temporary dumping grounds. Distribute their bookmarks into proper thematic folders and remove the empty folder using REMOVE action.
     c) Respect Cohesive Specialized Folders: If an existing folder has a clear, specialized focus (e.g. "IPA" for phonetic charts, "Nis" for a specific project), keep it, but evacuate any foreign bookmarks that were accidentally saved there.
   - ICON-ONLY & UNNAMED SHORTCUTS:
     Give clean, recognizable titles to any bookmark with an empty or icon-only title (e.g. "Google", "GitHub", "Twitter / X").
   - ZERO ABANDONED LOOSE ITEMS:
     Ensure EVERY loose bookmark on the Bookmarks Bar is moved into an appropriate folder.

3. ID INTEGRITY:
   - "bookmarkId" must strictly be an exact ID from the [BOOKMARKS] table. Never hallucinate or invent IDs.

4. DEPENDENCY ORDER:
   - When creating a new folder, assign a unique temporary ID (e.g. "tmp_folder_1").
   - When moving bookmarks into that new folder, set targetFolderId to that exact tmpId.

5. PRAGMATIC DEPTH:
   - Keep folder hierarchies max 2-3 levels deep.
   - Do NOT create single-item micro-folders; group related items logically.

6. AESTHETICS:
   - Mirror the user's existing naming and emoji conventions (e.g. "💻 Development", "📚 Languages & Dictionaries", "🌐 Web & Tools").

7. SUMMARY & LANGUAGE:
   - Write the "summary" in ${targetLang} (matching the user's interface language).
   - The summary must be a concise, clear 1-2 sentence overview of planned actions.

8. TARGET MENTIONS (@"target"):
   - When the user explicitly mentions folders or bookmarks with @ or @"name" (e.g. @"IPA", @"needfix", @"antfu/taze"):
     a) IMMUNITY / EXCLUSION DIRECTIVES ("dokunma", "don't touch", "leave alone", "skip", "exclude", "ignore"):
        You MUST NEVER move, rename, or delete the mentioned folder or any bookmarks currently inside it! Leave them 100% untouched.
     b) TARGETED DIRECTIVES ("move to", "taşı", "put inside", "clean", "sil / delete"):
        Prioritize and strictly execute the user's specific instruction for that mentioned folder or bookmark.`;

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

  // Log full debug payload for developer inspection
  console.group('🦦 [Bookmark Otter] AI Reorganization Debug Info');
  console.log('%c1. USER PROMPT:', 'color: #3b82f6; font-weight: bold;', params.userPrompt);
  console.log(
    '%c2. COMPACT TREE DSL SENT TO AI:\n',
    'color: #10b981; font-weight: bold;\n',
    params.compactTreeDSL
  );
  console.log('%c3. RAW AI RESPONSE OBJECT:', 'color: #f59e0b; font-weight: bold;', object);
  console.groupEnd();

  return {
    ...object,
    rawDsl: params.compactTreeDSL,
    rawJson: JSON.stringify(object, null, 2),
  };
}
