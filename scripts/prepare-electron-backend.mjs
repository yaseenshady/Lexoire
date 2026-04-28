import { rmSync, cpSync, writeFileSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'backend', 'node_modules');
const targetDir = path.join(rootDir, 'electron', 'node_modules');
const rootPackage = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const electronVersion = rootPackage.devDependencies?.electron?.replace(/^[^\d]*/, '');

if (!electronVersion) {
  console.error('Unable to determine Electron version from package.json devDependencies.');
  process.exit(1);
}

rmSync(targetDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
cpSync(sourceDir, targetDir, { recursive: true, verbatimSymlinks: true });
writeFileSync(
  path.join(rootDir, 'electron', 'package.json'),
  `${JSON.stringify({
    name: 'lexoire-electron-backend',
    private: true,
    dependencies: {
      'better-sqlite3': '*',
      'onnxruntime-node': '*',
    },
  }, null, 2)}\n`,
);

const rebuild = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'electron-rebuild',
    '--version',
    electronVersion,
    '--module-dir',
    'electron',
    '--force',
    '--only',
    'better-sqlite3,onnxruntime-node',
  ],
  { stdio: 'inherit' },
);

process.exit(rebuild.status ?? 1);
