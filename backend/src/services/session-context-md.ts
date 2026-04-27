import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { Session } from '../types';

export type ProviderName = 'copilot' | 'claude' | 'codex';

function getRootDir(session: Session) {
  return path.join(session.repoPath || process.cwd(), '.github', 'lexoire-sessions');
}

function getIndexFile(session: Session) {
  return path.join(getRootDir(session), 'INDEX.md');
}

function ensureDir(session: Session) {
  const rootDir = getRootDir(session);
  if (!existsSync(rootDir)) mkdirSync(rootDir, { recursive: true });
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'session';
}

function sessionFileName(session: Session): string {
  return `${sanitize(session.name)}--${sanitize(session.id)}.md`;
}

export function getSessionContextPath(session: Session): string {
  ensureDir(session);
  return path.join(getRootDir(session), sessionFileName(session));
}

function upsertIndex(session: Session, contextPath: string) {
  ensureDir(session);
  const indexFile = getIndexFile(session);
  const relativePath = path.relative(process.cwd(), contextPath);
  const entry = `- [${session.name}](${relativePath}) - \`${session.id}\` - ${session.status}`;
  const existing = existsSync(indexFile)
    ? readFileSync(indexFile, 'utf8')
    : '# LEXOIRE Session Context Index\n\n';
  const lines = existing.split('\n').filter((line) => !line.includes(`\`${session.id}\``));
  lines.push(entry);
  writeFileSync(indexFile, `${lines.join('\n').trim()}\n`);
}

export function ensureSessionContext(session: Session): string {
  const contextPath = getSessionContextPath(session);
  if (!existsSync(contextPath)) {
    writeFileSync(contextPath, [
      `# ${session.name}`,
      '',
      `LEXOIRE session id: \`${session.id}\``,
      `Repository: \`${session.repoPath}\``,
      `Branch: \`${session.branch || 'unknown'}\``,
      `Status: \`${session.status}\``,
      '',
      '## Objective',
      session.objective || 'Not set.',
      '',
      '## Provider Session IDs',
      `- Copilot: \`${session.copilotSessionId || 'pending'}\``,
      '- Claude: `pending`',
      '- Codex: `pending`',
      '',
      '## Plan',
      '- Define the next concrete task before editing.',
      '',
      '## Progress Log',
      '- Created central context file.',
      '',
      '## Handoff Context',
      '- Keep this section current so switching providers preserves intent, decisions, files touched, blockers, and next steps.',
      '',
    ].join('\n'));
  }
  upsertIndex(session, contextPath);
  return contextPath;
}

export function buildProviderPrompt(session: Session, provider: ProviderName, prompt: string): string {
  const contextPath = ensureSessionContext(session);
  return [
    `LEXOIRE workspace session id: ${session.id}`,
    `Active provider: ${provider}`,
    `Repository path: ${session.repoPath}`,
    `Central context markdown: ${contextPath}`,
    '',
    'Before making changes, read the central context markdown.',
    'As you work, keep that markdown updated with: current objective, plan, progress log, files touched, decisions, blockers, and next steps.',
    'If you switch providers later, that markdown must contain enough context for the next provider to continue without asking what happened.',
    '',
    'User request:',
    prompt,
  ].join('\n');
}

export function appendSessionProgress(session: Session, provider: ProviderName, prompt: string, result: string) {
  const contextPath = ensureSessionContext(session);
  const existing = readFileSync(contextPath, 'utf8');
  const entry = [
    '',
    `### ${new Date().toISOString()} - ${provider}`,
    `- Prompt: ${prompt.replace(/\s+/g, ' ').trim().slice(0, 300)}`,
    `- Result: ${result.replace(/\s+/g, ' ').trim().slice(0, 500) || '(no output)'}`,
  ].join('\n');
  writeFileSync(contextPath, `${existing.trimEnd()}\n${entry}\n`);
}
