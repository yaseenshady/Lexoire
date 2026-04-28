import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';

const HOME = os.homedir();

const DEFAULT_LOOKUP_PATHS = (process.platform === 'win32'
  ? [
      process.env.APPDATA ? path.join(process.env.APPDATA, 'npm') : '',
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm') : '',
      process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'scoop', 'shims') : '',
    ]
  : [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      path.join(HOME, '.npm-global', 'bin'),
      path.join(HOME, '.local', 'bin'),
      path.join(HOME, '.nvm', 'versions', 'node', 'current', 'bin'),
    ]).filter(Boolean);

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function expandWindowsCommandVariants(candidate: string): string[] {
  if (process.platform !== 'win32' || path.extname(candidate)) {
    return [candidate];
  }

  return [candidate, `${candidate}.cmd`, `${candidate}.exe`, `${candidate}.bat`];
}

function isPathCandidate(candidate: string): boolean {
  return path.isAbsolute(candidate) || candidate.includes('/') || candidate.includes('\\');
}

export function getCommandLookupEnv(extraPathEntries: string[] = []): NodeJS.ProcessEnv {
  const currentPathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return {
    ...process.env,
    PATH: dedupe([...currentPathEntries, ...DEFAULT_LOOKUP_PATHS, ...extraPathEntries]).join(path.delimiter),
  };
}

export function resolveCommandBinary(
  candidates: Array<string | undefined | null>,
  fallbackCommand = ''
): string {
  const env = getCommandLookupEnv();
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';

  for (const rawCandidate of candidates) {
    const candidate = rawCandidate?.trim();
    if (!candidate) {
      continue;
    }

    for (const variant of expandWindowsCommandVariants(candidate)) {
      if (isPathCandidate(variant)) {
        if (existsSync(variant)) {
          return variant;
        }
        continue;
      }

      const result = spawnSync(locator, [variant], {
        encoding: 'utf8',
        env,
      });

      if (result.error || result.status !== 0) {
        continue;
      }

      const resolved = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const directExecutable = process.platform === 'win32'
        ? resolved.find((line) => /\.exe$/i.test(line))
        : resolved[0];

      if (directExecutable) {
        return directExecutable;
      }
    }
  }

  return fallbackCommand;
}
