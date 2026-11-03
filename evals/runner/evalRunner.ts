import fs from 'node:fs';
import path from 'node:path';

import { runMultiStepAgentHarness } from '@/services/agentHarness';
import { flattenBookmarks, getAllFolders } from '@/services/bookmarks';
import { setCliSettings, hasConfiguredKey } from '@/services/storage';
import type { AppSettings, BookmarkTreeNode } from '@/types';

import { evaluateReorgPlan } from '../invariants';
import type { EvalScorecard } from '../invariants/types';
import { printScorecard } from './reporter';

const DATASETS_DIR = path.resolve(import.meta.dirname, '../datasets');
const RUNS_DIR = path.resolve(import.meta.dirname, '../runs');

export interface RunEvalOptions {
  datasetName: string; // 'canary' or 'poweruser-full'
  prompt?: string;
  saveRun?: boolean;
  mockMode?: 'broken' | 'clean' | 'none';
}

export async function runEvaluation(options: RunEvalOptions): Promise<EvalScorecard> {
  const { datasetName, saveRun = true, mockMode = 'none' } = options;
  const prompt =
    options.prompt ||
    'Analyze all bookmarks and reorganize the entire library into cohesive thematic folders.';

  const datasetPath = path.join(DATASETS_DIR, `${datasetName}.json`);
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset file not found: ${datasetPath}. Run 'bun run eval:prepare' first.`);
  }

  const rawTree: BookmarkTreeNode[] = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));

  let plan;
  let durationMs = 0;

  if (mockMode !== 'none') {
    console.log(`\n🧪 Running in MOCK mode: [${mockMode.toUpperCase()}]`);
    console.log(`   Dataset: ${datasetName}`);
    console.log(`   Prompt:  "${prompt}"\n`);
    const startTime = Date.now();
    plan = generateMockPlan(rawTree, mockMode);
    durationMs = Date.now() - startTime + 120;
  } else {
    // Load settings from eval-settings.json or process.env
    const settings = loadCliSettings();
    setCliSettings(settings);

    if (!hasConfiguredKey(settings)) {
      console.error(
        '\n❌ No AI API Key found! Please set GEMINI_API_KEY / OPENAI_API_KEY in process.env, or create eval-settings.json, or test with --mock.'
      );
      console.log('Example eval-settings.json:');
      console.log(
        JSON.stringify(
          {
            aiProvider: 'google',
            geminiApiKey: 'AIzaSy...',
            modelName: 'gemini-2.5-flash',
            language: 'en',
          },
          null,
          2
        )
      );
      console.log('\nTip: You can test the invariant scorecard immediately using:');
      console.log('  bun run eval --mock=broken   (Simulates the Utilities & Bar Favicon bug)');
      console.log('  bun run eval --mock=clean    (Simulates a balanced, healthy reorganization)');
      process.exit(1);
    }

    console.log(`\n🚀 Starting Evaluation: ${datasetName}`);
    console.log(`   Model: ${settings.aiProvider} (${settings.modelName})`);
    console.log(`   Prompt: "${prompt}"\n`);

    const startTime = Date.now();

    plan = await runMultiStepAgentHarness({
      userPrompt: prompt,
      tree: rawTree,
      onProgress: (p) => {
        process.stdout.write(
          `\r   [${p.phase.toUpperCase()}] ${p.message} (${p.percentage || 0}%)     `
        );
      },
    });

    durationMs = Date.now() - startTime;
    console.log('\n');
  }

  // Evaluate against invariants
  const scorecard = evaluateReorgPlan({
    datasetName,
    userPrompt: prompt,
    tree: rawTree,
    plan,
    durationMs,
  });

  // Print scorecard
  printScorecard(scorecard);

  // Save run history for versioning
  if (saveRun) {
    if (!fs.existsSync(RUNS_DIR)) {
      fs.mkdirSync(RUNS_DIR, { recursive: true });
    }
    const runFileName = `run_${Date.now()}_${datasetName}.json`;
    const runPath = path.join(RUNS_DIR, runFileName);
    fs.writeFileSync(
      runPath,
      JSON.stringify(
        {
          scorecard,
          planSummary: plan.summary,
          actionsCount: plan.actions.length,
          actions: plan.actions,
        },
        null,
        2
      ),
      'utf-8'
    );
    console.log(`📁 Run details recorded to: evals/runs/${runFileName}`);
  }

  return scorecard;
}

function loadCliSettings(): AppSettings {
  const settingsPath = path.resolve(process.cwd(), 'eval-settings.json');
  let fileSettings: Partial<AppSettings> = {};

  if (fs.existsSync(settingsPath)) {
    try {
      fileSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch (err) {
      console.warn('Failed parsing eval-settings.json:', err);
    }
  }

  return {
    aiProvider: (process.env.AI_PROVIDER as any) || fileSettings.aiProvider || 'google',
    geminiApiKey: process.env.GEMINI_API_KEY || fileSettings.geminiApiKey || '',
    openaiApiKey: process.env.OPENAI_API_KEY || fileSettings.openaiApiKey || '',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || fileSettings.anthropicApiKey || '',
    xaiApiKey: process.env.XAI_API_KEY || fileSettings.xaiApiKey || '',
    groqApiKey: process.env.GROQ_API_KEY || fileSettings.groqApiKey || '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || fileSettings.deepseekApiKey || '',
    modelName: process.env.MODEL_NAME || fileSettings.modelName || 'gemini-2.5-flash',
    language: (process.env.APP_LANG as any) || fileSettings.language || 'en',
  };
}

function generateMockPlan(
  tree: BookmarkTreeNode[],
  mode: 'broken' | 'clean'
): { summary: string; actions: any[] } {
  const bookmarks = flattenBookmarks(tree);
  const folders = getAllFolders(tree);

  if (mode === 'broken') {
    // Recreates the bug: Moves pinned bar bookmarks into "Utilities & Tools" and dumps 250+ items into it
    const actions: any[] = [
      {
        action: 'CREATE_FOLDER',
        tmpId: 'tmp_tools',
        parentId: '1',
        title: '🛠️ Utilities & Tools',
        reason: 'Dump for all miscellaneous and loose items',
      },
    ];

    // Move ALL items on bar (including pinned icons) into Utilities
    const rootItems = bookmarks.filter((b: any) => b.parentId === '1');
    for (const b of rootItems) {
      actions.push({
        action: 'MOVE',
        bookmarkId: b.id,
        bookmarkTitle: b.title || b.domain,
        targetFolderId: 'tmp_tools',
        targetFolderTitle: '🛠️ Utilities & Tools',
        reason: 'Move to general utilities',
      });
    }

    // Dump another 180 random items into Utilities to create the 200+ gravity sink
    const otherItems = bookmarks.filter((b: any) => b.parentId !== '1').slice(0, 180);
    for (const b of otherItems) {
      actions.push({
        action: 'MOVE',
        bookmarkId: b.id,
        bookmarkTitle: b.title || b.domain,
        targetFolderId: 'tmp_tools',
        targetFolderTitle: '🛠️ Utilities & Tools',
        reason: 'Move to general utilities',
      });
    }

    return {
      summary: 'Reorganized entire archive by dumping loose items into Utilities & Tools.',
      actions,
    };
  }

  // mode === 'clean': Balanced reorganization that protects pinned icons
  const actions: any[] = [
    {
      action: 'CREATE_FOLDER',
      tmpId: 'tmp_dev',
      parentId: '1',
      title: '💻 Development',
      reason: 'Tech & code repositories',
    },
    {
      action: 'CREATE_FOLDER',
      tmpId: 'tmp_design',
      parentId: '1',
      title: '🎨 Design & UI',
      reason: 'Creative assets & tools',
    },
    {
      action: 'CREATE_FOLDER',
      tmpId: 'tmp_crypto',
      parentId: '1',
      title: '📈 Crypto & Web3',
      reason: 'Trading & blockchain',
    },
  ];

  // Protect pinned items on bar: only move truly loose NON-pinned items
  const nonPinnedItems = bookmarks.filter(
    (b: any) =>
      b.parentId === '1' &&
      b.title &&
      b.title.trim().length > 3 &&
      !['github.com', 'mail.google.com', 'youtube.com', 'figma.com'].includes(b.domain)
  );

  let i = 0;
  const cats = ['tmp_dev', 'tmp_design', 'tmp_crypto'];
  const titles = ['💻 Development', '🎨 Design & UI', '📈 Crypto & Web3'];

  for (const b of nonPinnedItems.slice(0, 30)) {
    const catIdx = i % cats.length;
    actions.push({
      action: 'MOVE',
      bookmarkId: b.id,
      bookmarkTitle: b.title,
      targetFolderId: cats[catIdx],
      targetFolderTitle: titles[catIdx],
      reason: `Categorized into ${titles[catIdx]}`,
    });
    i++;
  }

  // Remove dump folders
  const dumpFolders = folders.filter((f: any) => /^(other|needfix|temp|imported)/i.test(f.title));
  for (const df of dumpFolders) {
    actions.push({
      action: 'REMOVE',
      id: df.id,
      isFolder: true,
      title: df.path,
      reason: 'Dismantle evacuated dump folder',
    });
  }

  return {
    summary:
      'Balanced reorganization: preserved pinned bar bookmarks and distributed loose items across 3 focused categories.',
    actions,
  };
}
