import { runEvaluation } from '../runner/evalRunner';

async function main() {
  const args = process.argv.slice(2);
  let dataset = 'canary';
  let prompt: string | undefined;
  let mockMode: 'broken' | 'clean' | 'none' = 'none';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dataset' && args[i + 1]) {
      dataset = args[i + 1]!;
      i++;
    } else if (args[i] === '--full') {
      dataset = 'poweruser-full';
    } else if (args[i] === '--prompt' && args[i + 1]) {
      prompt = args[i + 1];
      i++;
    } else if (args[i] === '--mock') {
      mockMode = 'clean';
    } else if (args[i]?.startsWith('--mock=')) {
      const mode = args[i]!.split('=')[1];
      if (mode === 'broken' || mode === 'clean') {
        mockMode = mode;
      }
    }
  }

  try {
    await runEvaluation({
      datasetName: dataset,
      prompt,
      saveRun: true,
      mockMode,
    });
  } catch (err: any) {
    console.error('\n❌ Evaluation failed:', err.message);
    process.exit(1);
  }
}

main();
