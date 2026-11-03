import type { EvalScorecard } from '../invariants';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  white: '\x1b[37m',
};

export function printScorecard(card: EvalScorecard): void {
  const line = '─'.repeat(70);
  console.log(
    `\n${COLORS.bold}${COLORS.cyan}🦦 Bookmark Otter — Agent Evaluation Scorecard${COLORS.reset}`
  );
  console.log(line);
  console.log(`${COLORS.bold}Dataset:${COLORS.reset} ${card.datasetName}`);
  console.log(`${COLORS.bold}Prompt:${COLORS.reset}  "${card.prompt}"`);
  console.log(
    `${COLORS.bold}Runtime:${COLORS.reset} ${(card.metrics.durationMs / 1000).toFixed(2)}s`
  );
  console.log(line);

  console.log(`\n${COLORS.bold}📌 INVARIANT ASSERTIONS:${COLORS.reset}`);
  for (const inv of card.invariants) {
    const icon = inv.passed
      ? `${COLORS.green}✔ PASS${COLORS.reset}`
      : `${COLORS.red}✖ FAIL${COLORS.reset}`;
    const scoreColor =
      inv.score >= 80 ? COLORS.green : inv.score >= 50 ? COLORS.yellow : COLORS.red;
    console.log(
      `  ${icon}  ${COLORS.bold}${inv.name}${COLORS.reset} [${scoreColor}${inv.score}/100${COLORS.reset}]`
    );

    if (inv.violations.length > 0) {
      for (const v of inv.violations) {
        const badge =
          v.severity === 'CRITICAL'
            ? `${COLORS.red}[CRITICAL]${COLORS.reset}`
            : `${COLORS.yellow}[WARNING]${COLORS.reset}`;
        console.log(`       ${badge} ${v.message}`);
      }
    }
  }

  console.log(`\n${COLORS.bold}📊 EXECUTION & BALANCE METRICS:${COLORS.reset}`);
  console.log(
    `  • Total Bookmarks Analyzed:   ${COLORS.cyan}${card.metrics.totalBookmarks}${COLORS.reset}`
  );
  console.log(
    `  • Planned Moves:              ${COLORS.cyan}${card.metrics.plannedMoves}${COLORS.reset}`
  );
  console.log(
    `  • New Categories Created:     ${COLORS.cyan}${card.metrics.newFoldersCreated}${COLORS.reset}`
  );
  console.log(
    `  • Dump Folders Dismantled:    ${COLORS.cyan}${card.metrics.foldersRemoved}${COLORS.reset}`
  );
  console.log(
    `  • Pinned Bar Favicons:        ${card.metrics.pinnedBarPreservedCount === card.metrics.pinnedBarTotalCount ? COLORS.green : COLORS.red}${card.metrics.pinnedBarPreservedCount} / ${card.metrics.pinnedBarTotalCount} preserved${COLORS.reset}`
  );
  console.log(
    `  • Largest Category:           ${card.metrics.maxFolderSize > 50 ? COLORS.yellow : COLORS.green}"${card.metrics.maxFolderTitle}" (${card.metrics.maxFolderSize} items)${COLORS.reset}`
  );
  console.log(
    `  • Category Gini Imbalance:    ${card.metrics.folderBalanceGini > 0.4 ? COLORS.yellow : COLORS.green}${card.metrics.folderBalanceGini} (0.0 = even, 1.0 = concentrated)${COLORS.reset}`
  );

  console.log(line);
  const statusBadge = card.passed
    ? `${COLORS.bgGreen}${COLORS.white}${COLORS.bold} PASS ${COLORS.reset}`
    : `${COLORS.bgRed}${COLORS.white}${COLORS.bold} FAIL ${COLORS.reset}`;
  const finalScoreColor =
    card.overallScore >= 80 ? COLORS.green : card.overallScore >= 50 ? COLORS.yellow : COLORS.red;

  console.log(
    `RESULT: ${statusBadge}  Overall Health Score: ${finalScoreColor}${COLORS.bold}${card.overallScore} / 100${COLORS.reset}\n`
  );
}
