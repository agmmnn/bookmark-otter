import fs from 'node:fs';
import path from 'node:path';

import {
  parseNetscapeBookmarkFile,
  getTreeStats,
} from '../parsers/netscapeBookmarkParser';

const CANARY_PATH = '/Users/agm/Documents/canary-bookmarks.html';
const FULL_PATH = '/Users/agm/Documents/bookmarks_11_2_26.html';

const DATASETS_DIR = path.resolve(import.meta.dirname, '../datasets');

function main() {
  if (!fs.existsSync(DATASETS_DIR)) {
    fs.mkdirSync(DATASETS_DIR, { recursive: true });
  }

  console.log('📦 [Dataset Preparer] Reading bookmark HTML exports...\n');

  // 1. Canary Dataset
  if (fs.existsSync(CANARY_PATH)) {
    console.log(`Parsing Canary: ${CANARY_PATH}`);
    const canaryTree = parseNetscapeBookmarkFile(CANARY_PATH);
    const stats = getTreeStats(canaryTree);
    const canaryOut = path.join(DATASETS_DIR, 'canary.json');
    fs.writeFileSync(canaryOut, JSON.stringify(canaryTree, null, 2), 'utf-8');
    console.log(`  -> Wrote ${canaryOut}`);
    console.log(`  -> Bookmarks: ${stats.totalBookmarks}, Folders: ${stats.totalFolders}`);
    console.log(`  -> Directly on Bar: ${stats.barBookmarks} links, ${stats.barFolders} folders\n`);
  } else {
    console.warn(`⚠️ Canary file not found at ${CANARY_PATH}`);
  }

  // 2. Full Power-User Dataset
  if (fs.existsSync(FULL_PATH)) {
    console.log(`Parsing Full Library: ${FULL_PATH}`);
    const fullTree = parseNetscapeBookmarkFile(FULL_PATH);
    const stats = getTreeStats(fullTree);
    const fullOut = path.join(DATASETS_DIR, 'poweruser-full.json');
    fs.writeFileSync(fullOut, JSON.stringify(fullTree, null, 2), 'utf-8');
    console.log(`  -> Wrote ${fullOut}`);
    console.log(`  -> Bookmarks: ${stats.totalBookmarks}, Folders: ${stats.totalFolders}`);
    console.log(`  -> Directly on Bar: ${stats.barBookmarks} links, ${stats.barFolders} folders\n`);
  } else {
    console.warn(`⚠️ Full bookmark file not found at ${FULL_PATH}`);
  }

  console.log('✅ [Dataset Preparer] Datasets successfully prepared in evals/datasets/');
}

main();
