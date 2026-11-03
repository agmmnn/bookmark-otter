import { generateObject } from 'ai';
import { z } from 'zod';

import type { BookmarkTreeNode, FlatBookmark, ReorgAction, ReorgPlan } from '@/types';

import { getLanguageModel } from './ai';
import { flattenBookmarks, getAllFolders, hydrateReorgPlan } from './bookmarks';
import { getSettings } from './storage';

export interface AgentProgress {
  phase: 'architect' | 'routing' | 'synthesizing' | 'done';
  message: string;
  current?: number;
  total?: number;
  percentage?: number;
}

export interface AgentHarnessParams {
  userPrompt: string;
  tree: BookmarkTreeNode[];
  onProgress?: (progress: AgentProgress) => void;
}

/**
 * Domain matching helper: checks exact domain or subdomain match
 * e.g. "gist.github.com" matches "github.com"
 */
function matchesDomain(bookmarkDomain: string, targetDomains: string[]): boolean {
  if (!bookmarkDomain) return false;
  const bDom = bookmarkDomain.toLowerCase().trim();
  for (const td of targetDomains) {
    const cleanTd = td
      .toLowerCase()
      .trim()
      .replace(/^www\./, '');
    if (!cleanTd) continue;
    if (bDom === cleanTd || bDom.endsWith('.' + cleanTd)) {
      return true;
    }
  }
  return false;
}

/**
 * Keyword matching helper: checks title contains keyword
 */
function matchesKeywords(title: string, keywords: string[]): boolean {
  if (!title) return false;
  const tLower = title.toLowerCase();
  for (const kw of keywords) {
    const cleanKw = kw.toLowerCase().trim();
    if (cleanKw.length >= 3 && tLower.includes(cleanKw)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes folder titles to match without emoji differences or casing
 */
function normalizeFolderTitle(str: string): string {
  return str
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Helper to split an array into chunks
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Multi-Step Agent Harness for Large-Scale Bookmark Reorganization (1,000+ items).
 * Inspired by Vercel Eve durable multi-phase workflow patterns:
 * - Phase 1: Taxonomy Architect (Global Blueprint generation)
 * - Phase 2: High-Speed Hybrid Router (Deterministic local matching + concurrent LLM chunks)
 * - Phase 3: Plan Aggregator & Local Hydrator (Full local metadata resolution)
 */
export async function runMultiStepAgentHarness(params: AgentHarnessParams): Promise<ReorgPlan> {
  const { userPrompt, tree, onProgress } = params;
  const settings = await getSettings();
  const isTr = settings.language === 'tr';
  const targetLang = isTr ? 'Turkish' : 'English';

  const bookmarks = flattenBookmarks(tree);
  const folders = getAllFolders(tree);
  const totalCount = bookmarks.length;

  console.group('🦦 [Agent Harness] Starting Eve-Style Multi-Step Organization');
  console.log(`Total bookmarks: ${totalCount}, Total folders: ${folders.length}`);

  // -------------------------------------------------------------
  // PHASE 1: TAXONOMY ARCHITECT (Blueprint Generation)
  // -------------------------------------------------------------
  onProgress?.({
    phase: 'architect',
    message: isTr
      ? 'Mimar: Kütüphane genel yapısı ve domain dağılımı analiz ediliyor...'
      : 'Architect: Analyzing library structure and domain frequencies...',
    percentage: 10,
  });

  const barBookmarks = bookmarks.filter((b) => b.parentId === '1');
  const barBookmarkLines = barBookmarks.slice(0, 50).map((b) => {
    const titleLabel =
      b.title && b.title.trim().length > 0 ? `"${b.title}"` : '(icon-only favicon pin)';
    return `- ID: "${b.id}" | Title: ${titleLabel} | Domain: ${b.domain || 'N/A'}`;
  });

  // Compute domain frequencies
  const domainMap = new Map<string, { count: number; sampleFolders: Set<string> }>();
  for (const b of bookmarks) {
    if (!b.domain) continue;
    const entry = domainMap.get(b.domain) || { count: 0, sampleFolders: new Set() };
    entry.count++;
    entry.sampleFolders.add(b.path.split('/').pop() || b.path);
    domainMap.set(b.domain, entry);
  }

  const sortedDomains = Array.from(domainMap.entries())
    .filter(([, data]) => data.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 35);

  const domainFrequencyLines = sortedDomains.map(
    ([domain, data]) =>
      `- ${domain} (${data.count} items) -> Existing: [${Array.from(data.sampleFolders).slice(0, 3).join(', ')}]`
  );

  const nonRootFolders = folders.filter((f) => f.id !== '0' && f.id !== '1' && f.id !== '2');
  const sortedFoldersForOverview = [...nonRootFolders].sort((a, b) => {
    // Top-level bar folders first
    if (a.parentId === '1' && b.parentId !== '1') return -1;
    if (b.parentId === '1' && a.parentId !== '1') return 1;
    return 0;
  });

  const folderOverviewLines = sortedFoldersForOverview.slice(0, 50).map((f) => {
    const count = bookmarks.filter((b) => b.parentId === f.id).length;
    return `${f.id}|${f.parentId || '1'}|${f.path} (${count} items)`;
  });

  const model = await getLanguageModel();

  const architectSystem = `You are "Bookmark Otter Architecture Agent", a world-class, multilingual information architect.
Your job is to design a clean, cohesive, top-level Taxonomy Blueprint for the user's bookmarks library.

[GOAL]
Organize the entire bookmark collection into 6-10 master categories on the Bookmarks Bar (parentId: "1").

[RULES & INTELLIGENCE - FULLY DYNAMIC & MULTILINGUAL]
1. REUSE EXISTING FOLDERS:
   - If an existing folder is already cohesive and well-structured, reuse it (isNew: false, id: existing folder ID).
   - In preservedFolderIds, list any existing folders that should remain intact as-is (e.g. specialized personal archives, projects).

2. CATCH-ALL & DUMP FOLDERS (ANY LANGUAGE):
   - Analyze the folder list dynamically. Identify folders that serve as temporary holding pens, unfiled dumps, scratchpads, or imports in ANY language (e.g. "Inbox", "Unsorted", "Dumping ground", "Müll", "整理中", "needfix", "other", "imported", "misc", "temp", etc.).
   - Return their IDs in dumpFolderIdsToDismantle. Their contents will be redistributed to proper thematic categories and the empty folder removed.

3. PINNED QUICK-ACCESS LAUNCHPAD ON BAR:
   - Inspect [BOOKMARKS BAR DIRECT ITEMS]. Users frequently place intentional 1-click launchpad bookmarks directly on the Bookmarks Bar (daily web apps, productivity dashboards, search tools, or icon-only bookmarks).
   - In pinnedBarBookmarkIdsToKeep, return the IDs of bookmarks that serve as quick launchpins and SHOULD NOT be moved into subfolders.
   - Only leave unlisted any bookmarks that are clearly unfiled clutter that belong in an archive folder.

4. CATEGORIES:
   - Each category MUST specify:
     * title: Aesthetic title with 1 emoji (e.g. "💻 Development", "📈 Crypto & Web3", "🎨 Design & Creative", "📚 Reading & Docs", "🛠️ Utilities & Tools").
     * targetDomains: High-confidence domains that belong in this folder.
     * keywords: Core topic keywords for title matching.
     * reason: Short explanation.

5. RESPECT USER DIRECTIVES:
   - Respect any explicit user constraints (e.g. "don't touch X").
   - Output summary in ${targetLang}.`;

  const architectPrompt = `[USER REQUEST]
"${userPrompt}"

[LIBRARY STATS]
Total Bookmarks: ${totalCount}
Total Folders: ${folders.length}
Direct Bookmarks on Bar: ${barBookmarks.length}

[BOOKMARKS BAR DIRECT ITEMS (Examine for intentional quick-launch pins vs unfiled clutter)]
${barBookmarkLines.join('\n')}

[TOP DOMAIN CLUSTERS]
${domainFrequencyLines.join('\n')}

[EXISTING FOLDERS (id | parentId | path | count)]
${folderOverviewLines.join('\n')}`;

  const CategorySchema = z.object({
    id: z
      .string()
      .describe('Existing folder ID if reusing, or unique temp ID like "tmp_cat_dev" if new'),
    title: z.string().describe('Category title with 1 emoji'),
    parentId: z.string().default('1').describe('Parent folder ID (usually "1" for Bookmarks Bar)'),
    isNew: z
      .boolean()
      .describe('True if creating a new folder, false if reusing an existing folder'),
    targetDomains: z.array(z.string()).describe('Domains associated with this category'),
    keywords: z.array(z.string()).describe('Keywords in titles associated with this category'),
    reason: z.string().describe('Short explanation for this category'),
  });

  const BlueprintSchema = z.object({
    categories: z
      .array(CategorySchema)
      .describe('6-10 master categories covering the entire library'),
    dumpFolderIdsToDismantle: z
      .array(z.string())
      .describe(
        'IDs of generic catch-all, dump, or temporary holding folders in any language to dismantle and remove'
      ),
    preservedFolderIds: z
      .array(z.string())
      .optional()
      .describe('IDs of cohesive existing folders to preserve as-is'),
    pinnedBarBookmarkIdsToKeep: z
      .array(z.string())
      .optional()
      .describe(
        'IDs of intentional quick-access launchpad bookmarks on Bookmarks Bar that should remain pinned on the bar'
      ),
    summary: z.string().describe('High-level architectural summary of the reorganization plan'),
  });

  const { object: blueprint } = await generateObject({
    model,
    schema: BlueprintSchema,
    system: architectSystem,
    prompt: architectPrompt,
  });

  console.log('📐 [Agent Harness] Taxonomy Blueprint Generated:', blueprint);

  // -------------------------------------------------------------
  // PHASE 2: HYBRID BATCH ROUTER (Local Fast-Path + LLM Chunks)
  // -------------------------------------------------------------
  onProgress?.({
    phase: 'routing',
    message: isTr
      ? 'Yönlendirici: Yer imleri kategorilere atanıyor (Hızlı Eşleştirme)...'
      : 'Router: Assigning bookmarks to categories (Fast-Path Match)...',
    percentage: 30,
  });

  const dismantleFolderIds = new Set(blueprint.dumpFolderIdsToDismantle);
  const preservedFolderIds = new Set(blueprint.preservedFolderIds || []);
  const pinnedBarIds = new Set(blueprint.pinnedBarBookmarkIdsToKeep || []);
  const categories = blueprint.categories;

  // DEDUPLICATION: Check if any master category title already exists on Bookmarks Bar ('1')
  // This guarantees idempotency: never create duplicate folders on re-runs!
  for (const cat of categories) {
    const existingMatch = folders.find(
      (f) => f.parentId === '1' && normalizeFolderTitle(f.title) === normalizeFolderTitle(cat.title)
    );

    if (existingMatch) {
      cat.id = existingMatch.id;
      cat.isNew = false;
      cat.title = existingMatch.title;
    }
  }

  // Detect whether this is a full archive reorganization (e.g. "entire library", "all bookmarks")
  // vs selective triage (e.g. only loose items and dump folders)
  const pLower = userPrompt.toLowerCase();
  const isFullArchiveReorg =
    pLower.includes('entire library') ||
    pLower.includes('all bookmarks') ||
    pLower.includes('reorganize all') ||
    pLower.includes('edit all') ||
    pLower.includes('tüm arşivi') ||
    pLower.includes('bütün yer imleri') ||
    pLower.includes('baştan sona') ||
    pLower.includes('tümünü düzenle');

  const candidatesToRoute: FlatBookmark[] = [];
  const candidateIds = new Set<string>();

  for (const b of bookmarks) {
    // 0. Pinned Launchpad Shield:
    // If the LLM identified it as a pinned launchpad OR if user made it icon-only (empty title), preserve on bar!
    if (b.parentId === '1' && (pinnedBarIds.has(b.id) || !b.title || b.title.trim().length <= 1)) {
      continue;
    }

    // 1. Loose bookmarks directly on Bookmarks Bar ('1') or Other Bookmarks ('2')
    if (b.parentId === '0' || b.parentId === '1' || b.parentId === '2') {
      candidatesToRoute.push(b);
      candidateIds.add(b.id);
      continue;
    }

    // 2. Bookmarks inside dump folders scheduled for dismantling
    if (dismantleFolderIds.has(b.parentId)) {
      candidatesToRoute.push(b);
      candidateIds.add(b.id);
      continue;
    }

    // 3. Folders marked to be preserved as-is
    if (preservedFolderIds.has(b.parentId)) {
      continue;
    }

    // 4. Check if bookmark is already inside one of the master categories
    const currentMasterCat = categories.find(
      (cat) =>
        b.parentId === cat.id ||
        b.path.toLowerCase().includes(cat.title.toLowerCase()) ||
        (!cat.isNew && b.path.toLowerCase().includes(cat.id.toLowerCase()))
    );

    if (currentMasterCat) {
      // It's already in a master category!
      // Only move if its domain strongly matches a DIFFERENT master category
      const betterMatch = categories.find(
        (cat) => cat.id !== currentMasterCat.id && matchesDomain(b.domain, cat.targetDomains)
      );
      if (betterMatch) {
        candidatesToRoute.push(b);
        candidateIds.add(b.id);
      }
      continue;
    }

    // 5. Bookmark is in a scattered/external folder
    if (isFullArchiveReorg) {
      // In Full Archive mode, all external/scattered bookmarks are consolidated!
      candidatesToRoute.push(b);
      candidateIds.add(b.id);
    } else {
      // In Selective mode, only route if domain matches a master category
      for (const cat of categories) {
        if (matchesDomain(b.domain, cat.targetDomains)) {
          candidatesToRoute.push(b);
          candidateIds.add(b.id);
          break;
        }
      }
    }
  }

  console.log(
    `🎯 [Agent Harness] Mode: ${isFullArchiveReorg ? 'Full Archive' : 'Selective Triage'}. Candidates to route: ${candidatesToRoute.length}`
  );

  // Routing destination map: bookmarkId -> { targetFolderId, reason }
  const routedDestinations = new Map<
    string,
    { targetFolderId: string; targetFolderTitle: string; reason: string }
  >();
  const ambiguousBookmarks: FlatBookmark[] = [];

  // Step 2A: Instant Local Fast-Path Matching
  for (const b of candidatesToRoute) {
    let matchedCategory = categories.find((cat) => matchesDomain(b.domain, cat.targetDomains));

    if (!matchedCategory) {
      matchedCategory = categories.find((cat) => matchesKeywords(b.title, cat.keywords));
    }

    if (matchedCategory) {
      // If already in target category, skip
      if (b.parentId === matchedCategory.id) continue;

      routedDestinations.set(b.id, {
        targetFolderId: matchedCategory.id,
        targetFolderTitle: matchedCategory.title,
        reason: `${matchedCategory.title}`,
      });
    } else {
      ambiguousBookmarks.push(b);
    }
  }

  console.log(
    `⚡ [Agent Harness] Fast-Path classified ${routedDestinations.size} bookmarks instantly. Ambiguous remaining: ${ambiguousBookmarks.length}`
  );

  // Step 2B: LLM Chunked Classification for Ambiguous Bookmarks
  if (ambiguousBookmarks.length > 0) {
    const CHUNK_SIZE = 40;
    const chunks = chunkArray(ambiguousBookmarks, CHUNK_SIZE);
    let processedChunks = 0;

    const categoryChoices = categories
      .map(
        (c) =>
          `- ID: "${c.id}" => Title: "${c.title}" (Keywords: ${c.keywords.slice(0, 4).join(', ')})`
      )
      .join('\n');

    const BatchRouteSchema = z.object({
      routes: z.array(
        z.object({
          id: z.string().describe('Bookmark ID'),
          categoryId: z.string().describe('Selected target category ID from the list'),
          reason: z.string().optional().describe('Brief 2-3 word reason'),
        })
      ),
    });

    for (const chunk of chunks) {
      processedChunks++;
      const currentProcessed = routedDestinations.size + (processedChunks - 1) * CHUNK_SIZE;
      const progressPercent = Math.min(85, Math.round(35 + (50 * processedChunks) / chunks.length));

      onProgress?.({
        phase: 'routing',
        message: isTr
          ? `Yönlendirici: Belirsiz linkler sınıflandırılıyor (${currentProcessed} / ${candidatesToRoute.length})...`
          : `Router: Classifying remaining links (${currentProcessed} / ${candidatesToRoute.length})...`,
        current: currentProcessed,
        total: candidatesToRoute.length,
        percentage: progressPercent,
      });

      const batchItems = chunk
        .map(
          (b) =>
            `${b.id}|${(b.title || 'Untitled').slice(0, 50)}|${b.domain}|${b.path.slice(0, 30)}`
        )
        .join('\n');

      const batchSystem = `You are a precision bookmark router. Assign each bookmark to the best fitting category ID from the AVAILABLE CATEGORIES. If no category fits well, use the most general utility or reading category.`;

      const batchPrompt = `[AVAILABLE CATEGORIES]
${categoryChoices}

[BOOKMARKS TO ROUTE (id|title|domain|currentFolder)]
${batchItems}`;

      try {
        const { object: batchResult } = await generateObject({
          model,
          schema: BatchRouteSchema,
          system: batchSystem,
          prompt: batchPrompt,
        });

        for (const r of batchResult.routes) {
          const matchedCat = categories.find((c) => c.id === r.categoryId) || categories[0];
          if (matchedCat) {
            routedDestinations.set(r.id, {
              targetFolderId: matchedCat.id,
              targetFolderTitle: matchedCat.title,
              reason: r.reason || matchedCat.title,
            });
          }
        }
      } catch (chunkErr) {
        console.warn('Batch routing chunk failed, falling back to default category:', chunkErr);
        // Fallback: assign to first category
        const fallbackCat = categories[0];
        if (fallbackCat) {
          for (const item of chunk) {
            routedDestinations.set(item.id, {
              targetFolderId: fallbackCat.id,
              targetFolderTitle: fallbackCat.title,
              reason: fallbackCat.title,
            });
          }
        }
      }
    }
  }

  // -------------------------------------------------------------
  // PHASE 3: PLAN AGGREGATOR & HYDRATOR
  // -------------------------------------------------------------
  onProgress?.({
    phase: 'synthesizing',
    message: isTr
      ? 'Toplayıcı: Eylem planı birleştiriliyor ve doğrulanıyor...'
      : 'Synthesizer: Aggregating action plan and validating integrity...',
    percentage: 90,
  });

  const actions: ReorgAction[] = [];
  const usedCategoryIds = new Set<string>();

  // Count moves per category
  for (const dest of routedDestinations.values()) {
    usedCategoryIds.add(dest.targetFolderId);
  }

  // 1. CREATE_FOLDER actions for new categories that received bookmarks
  for (const cat of categories) {
    if (cat.isNew && usedCategoryIds.has(cat.id)) {
      actions.push({
        action: 'CREATE_FOLDER',
        tmpId: cat.id,
        parentId: cat.parentId || '1',
        title: cat.title,
        reason: cat.reason,
      });
    }
  }

  // 2. MOVE actions
  for (const [bId, dest] of routedDestinations.entries()) {
    const origBookmark = bookmarks.find((b) => b.id === bId);
    if (!origBookmark) continue;

    // Avoid moving if it's already in that folder
    if (origBookmark.parentId === dest.targetFolderId) continue;

    actions.push({
      action: 'MOVE',
      bookmarkId: bId,
      bookmarkTitle: origBookmark.title,
      targetFolderId: dest.targetFolderId,
      targetFolderTitle: dest.targetFolderTitle,
      reason: dest.reason,
    });
  }

  // 3. REMOVE actions for emptied old folders
  // Calculate which folders become 100% empty after all planned moves
  const folderBookmarkCounts = new Map<string, number>();
  for (const b of bookmarks) {
    folderBookmarkCounts.set(b.parentId, (folderBookmarkCounts.get(b.parentId) || 0) + 1);
  }

  for (const act of actions) {
    if (act.action === 'MOVE') {
      const orig = bookmarks.find((b) => b.id === act.bookmarkId);
      if (orig && orig.parentId) {
        const count = folderBookmarkCounts.get(orig.parentId) || 1;
        folderBookmarkCounts.set(orig.parentId, Math.max(0, count - 1));
      }
    }
  }

  const emptiedFolderIds = new Set<string>(dismantleFolderIds);
  const sortedFoldersByDepth = [...folders].sort(
    (a, b) => b.path.split('/').length - a.path.split('/').length
  );

  const PROTECTED_ROOTS = new Set(['0', '1', '2']);

  for (const f of sortedFoldersByDepth) {
    if (PROTECTED_ROOTS.has(f.id)) continue;
    if (preservedFolderIds.has(f.id)) continue;

    // Do NOT delete top-level folders directly on the Bookmarks Bar unless explicitly designated as a dump folder to dismantle
    if (f.parentId === '1' && !dismantleFolderIds.has(f.id)) {
      continue;
    }

    // Do NOT delete any folder that is a designated master category
    if (categories.some((c) => c.id === f.id)) continue;

    const remainingBookmarks = folderBookmarkCounts.get(f.id) || 0;
    const childFolders = folders.filter((cf) => cf.parentId === f.id);
    const hasActiveChildFolders = childFolders.some((cf) => !emptiedFolderIds.has(cf.id));

    if (remainingBookmarks <= 0 && !hasActiveChildFolders) {
      emptiedFolderIds.add(f.id);
    }
  }

  for (const fId of emptiedFolderIds) {
    if (PROTECTED_ROOTS.has(fId)) continue;
    if (preservedFolderIds.has(fId)) continue;
    const f = folders.find((item) => item.id === fId);
    if (!f) continue;

    actions.push({
      action: 'REMOVE',
      id: f.id,
      isFolder: true,
      title: f.path,
      reason: isTr ? 'Boşaltılan eski klasör temizlendi' : 'Dismantled emptied folder',
    });
  }

  // Generate localized comprehensive summary
  const moveCount = actions.filter((a) => a.action === 'MOVE').length;
  const newFolderCount = actions.filter((a) => a.action === 'CREATE_FOLDER').length;
  const removeCount = actions.filter((a) => a.action === 'REMOVE').length;

  const summary = isTr
    ? `${totalCount} yer imi tarandı. ${moveCount} yer imi ${newFolderCount} tematik klasöre düzenlendi, ${removeCount} geçici klasör temizlendi.`
    : `Scanned ${totalCount} bookmarks. Organized ${moveCount} bookmarks across ${newFolderCount} thematic folders, cleaned up ${removeCount} dump folders.`;

  const rawPlan: ReorgPlan = {
    summary: blueprint.summary || summary,
    actions,
    rawDsl: `Eve Harness: ${candidatesToRoute.length} candidates routed across ${categories.length} categories`,
    rawJson: JSON.stringify({ blueprint, actionsCount: actions.length }, null, 2),
  };

  // Full 100% Local Hydration (titles, domains, paths, icons)
  const hydratedPlan = hydrateReorgPlan(rawPlan, tree);

  onProgress?.({
    phase: 'done',
    message: isTr ? 'Plan hazır!' : 'Plan ready!',
    percentage: 100,
  });

  console.log('✅ [Agent Harness] Plan successfully generated and hydrated:', hydratedPlan);
  console.groupEnd();

  return hydratedPlan;
}

/**
 * Determine if a user request should be handled by the Multi-Step Agent Harness
 * versus standard single-shot Scoped Mode.
 */
export function shouldUseAgentHarness(
  userPrompt: string,
  totalBookmarksCount: number,
  scopeType: 'targeted' | 'clustered' | 'full'
): boolean {
  // If user explicitly scoped to a folder via @mention, stay in fast Scoped Mode
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

  // Trigger harness if global keywords present OR clustered scope with > 60 bookmarks
  return hasGlobalKeywords || (scopeType === 'clustered' && totalBookmarksCount > 60);
}
