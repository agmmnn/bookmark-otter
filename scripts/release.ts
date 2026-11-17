import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type BumpKind = 'patch' | 'minor' | 'major';

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function computeNextVersion(current: string, arg: string): string {
  if (/^\d+\.\d+\.\d+$/.test(arg)) {
    return arg;
  }

  const parts = current.split('.').map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid current version in package.json: "${current}"`);
  }

  const [major, minor, patch] = parts as [number, number, number];
  switch (arg as BumpKind) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unsupported version argument "${arg}". Use patch, minor, major, or x.y.z.`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const bumpArg = args.find((a) => !a.startsWith('--')) || 'patch';
  const shouldPush = args.includes('--push');
  const allowDirty = args.includes('--allow-dirty');

  if (!allowDirty) {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      throw new Error(
        'Working tree is not clean. Commit or stash changes before running release (or pass --allow-dirty).'
      );
    }
  }

  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version: string };
  const prevVersion = pkg.version;
  const nextVersion = computeNextVersion(prevVersion, bumpArg);

  if (nextVersion === prevVersion) {
    throw new Error(`Target version matches current version (${prevVersion}).`);
  }

  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`Updated package.json version: ${prevVersion} -> ${nextVersion}`);

  run('bun run fmt');
  run('bun run compile');
  run('bun run lint');
  run('bun run zip');
  run('bun run zip:firefox');

  run(`git add package.json`);
  run(`git commit -m "chore(release): v${nextVersion}"`);
  run(`git tag -a v${nextVersion} -m "Release v${nextVersion}"`);

  if (shouldPush) {
    run('git push origin HEAD --follow-tags');
  } else {
    console.log('');
    console.log(`Release v${nextVersion} prepared cleanly!`);
    console.log(`Built package: .output/bookmark-otter-${nextVersion}-chrome.zip`);
    console.log('Run the following to trigger GitHub Actions Release + Chrome Web Store deploy:');
    console.log('  git push origin HEAD --follow-tags');
  }
}

main();
