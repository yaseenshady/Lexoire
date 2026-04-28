import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import type { CopilotCommand, CopilotResponse } from '../types';
import { getCommandLookupEnv, resolveCommandBinary } from '../utils/command-resolution';

function resolveCopilotBinary(): string {
  return resolveCommandBinary([
    process.env.COPILOT_COMMAND?.trim(),
    process.platform === 'darwin' ? '/opt/homebrew/bin/copilot' : undefined,
    process.platform !== 'win32' ? '/usr/local/bin/copilot' : undefined,
    'copilot',
  ], 'copilot');
}

const SESSION_FILE = resolve(process.cwd(), '.github', 'LEXOIRE_SESSION.md');

function ensureDir(file: string) {
  const dir = dirname(file);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadSessionId(): string | undefined {
  try {
    if (!existsSync(SESSION_FILE)) return undefined;
    const content = readFileSync(SESSION_FILE, 'utf8');
    const match = content.match(/^session-id:\s*([a-f0-9-]{7,36})/m);
    if (match?.[1]) return match[1];
    return undefined;
  } catch {
    return undefined;
  }
}

function saveSessionId(sessionId: string, prompt?: string) {
  ensureDir(SESSION_FILE);
  const ts = new Date().toISOString();
  const existing = existsSync(SESSION_FILE)
    ? readFileSync(SESSION_FILE, 'utf8')
    : '';
  
  // Extract history section
  const historyStart = existing.indexOf('\n## History');
  const history = historyStart >= 0 ? existing.slice(historyStart) : '\n\n## History\n';
  const newEntry = prompt ? `\n- \`${ts}\` — ${prompt.slice(0, 80)}` : '';
  
  writeFileSync(SESSION_FILE, [
    '# LEXOIRE Master Session',
    '',
    `session-id: ${sessionId}`,
    `updated: ${ts}`,
    '',
    '> This file tracks the active Copilot session.',
    '> LEXOIRE uses `--resume` with this ID on every prompt.',
    history.trimEnd() + newEntry,
    '',
  ].join('\n'));
}

type PersistCliSessionId = (workspaceSessionId: string, cliSessionId: string) => void;
type ClearCliSessionId = (workspaceSessionId: string) => void;

export interface CopilotRuntimeStatus {
  command: string;
  available: boolean;
  version?: string;
  sessionId?: string;
}

class CopilotService {
  private currentProcess: ChildProcess | null = null;
  private masterSessionId: string | undefined;
  private sessionIdsByWorkspaceSession = new Map<string, string>();
  private abortRequested = false;
  private persistCliSessionId?: PersistCliSessionId;
  private clearCliSessionIdFn?: ClearCliSessionId;

  constructor(private readonly commandBinary: string = resolveCopilotBinary()) {
    this.masterSessionId = loadSessionId();
    if (this.masterSessionId) {
      console.log(`[CopilotService] Loaded master session: ${this.masterSessionId}`);
    } else {
      console.log('[CopilotService] No existing session — will create on first prompt');
    }
  }

  getCommandBinary(): string { return this.commandBinary; }
  getMasterSessionId(): string | undefined { return this.masterSessionId; }

  setPersistence(persist: PersistCliSessionId, clear: ClearCliSessionId): void {
    this.persistCliSessionId = persist;
    this.clearCliSessionIdFn = clear;
  }

  initFromSessions(sessions: Array<{ id: string; metadata?: Record<string, unknown> }>): void {
    for (const s of sessions) {
      const cliId = s.metadata?.copilotCliSessionId as string | undefined;
      if (cliId) {
        this.sessionIdsByWorkspaceSession.set(s.id, cliId);
        console.log(`[CopilotService] Restored CLI session for workspace ${s.id}: ${cliId}`);
      }
    }
  }

  getRuntimeStatus(): CopilotRuntimeStatus {
    const result = spawnSync(this.commandBinary, ['--version'], {
      encoding: 'utf8',
      env: getCommandLookupEnv(),
    });
    return {
      command: this.commandBinary,
      available: !result.error && result.status === 0,
      version: [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || undefined,
      sessionId: this.masterSessionId,
    };
  }

  execute(
    command: CopilotCommand,
    onOutput: (chunk: string, type: 'stdout' | 'stderr') => void
  ): Promise<CopilotResponse> {
    return new Promise((resolve) => {
      this.abortRequested = false;
      const workingDirectory = command.workingDirectory || process.cwd();
      const workspaceSessionId = command.sessionId || 'master';

      // Core flags: always yolo + JSON output (no --acp, it disables stdout!)
      const args: string[] = [
        '--yolo',
        '--output-format', 'json',
        '--add-dir', workingDirectory,
      ];

      // Resume master session if we have one
      const sessionId = this.sessionIdsByWorkspaceSession.get(workspaceSessionId)
        || (workspaceSessionId === 'master' ? this.masterSessionId : undefined);
      if (sessionId) {
        args.push(`--resume=${sessionId}`);
      }

      // The prompt
      args.push('-p', command.prompt);

      console.log(`[Copilot] ${this.commandBinary} ${args.filter((a, i) => args[i-1] !== '-p').join(' ')}`);
      console.log(`[Copilot] prompt: "${command.prompt.slice(0, 100)}"`);

      this.currentProcess = spawn(this.commandBinary, args, {
        cwd: workingDirectory,
        env: getCommandLookupEnv(),
      });
      console.log(`[CopilotService] Process spawned with PID ${this.currentProcess.pid}`);

      let output = '';
      let errorOutput = '';
      let stdoutBuffer = '';
      let newSessionId: string | undefined;
      let streamedDelta = false;

      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed) as {
            type?: string;
            data?: { deltaContent?: string; content?: string; message?: string; errorType?: string };
            sessionId?: string;
            exitCode?: number;
          };
          if (parsed.type === 'assistant.message_delta' && parsed.data?.deltaContent) {
            streamedDelta = true;
            output += parsed.data.deltaContent;
            onOutput(parsed.data.deltaContent, 'stdout');
            return;
          }
          if (parsed.type === 'assistant.message' && parsed.data?.content && !streamedDelta) {
            output += parsed.data.content;
            onOutput(parsed.data.content, 'stdout');
            return;
          }
          if (parsed.type === 'session.error' && parsed.data?.message) {
            const errMsg = `[Copilot error] ${parsed.data.message}`;
            console.error(`[CopilotService] ${errMsg}`);
            errorOutput += errMsg + '\n';
            return;
          }
          if (parsed.sessionId) {
            newSessionId = parsed.sessionId;
          }
        } catch (err) {
          console.log(`[CopilotService] Non-JSON line: ${trimmed.slice(0, 80)}`);
        }
      };

      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        console.log(`[CopilotService] Received ${data.length} bytes from stdout`);
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';
        console.log(`[CopilotService] Processing ${lines.length} lines`);
        for (const line of lines) handleLine(line);
      });

      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        onOutput(chunk, 'stderr');
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
        const wasAborted = this.abortRequested;
        this.abortRequested = false;

        if (wasAborted) {
          resolve({
            success: false,
            output: output.trim(),
            error: 'Command aborted by user',
            exitCode: 130,
            sessionId: this.masterSessionId,
            aborted: true,
          });
          return;
        }

        if (code !== 0 || (errorOutput && !output.trim())) {
          // Preserve known session IDs on transient provider failures such as rate limits.
          // Clearing here loses otherwise resumable provider sessions.
          console.warn(`[CopilotService] Prompt failed (exit ${code}). Preserving session. Error: ${errorOutput.slice(0, 200)}`);
        } else if (newSessionId) {
          this.masterSessionId = newSessionId;
          this.sessionIdsByWorkspaceSession.set(workspaceSessionId, newSessionId);
          if (workspaceSessionId !== 'master') this.persistCliSessionId?.(workspaceSessionId, newSessionId);
          saveSessionId(newSessionId, command.prompt);
          console.log(`[CopilotService] Session saved: ${newSessionId}`);
        } else if (sessionId && output.trim()) {
          this.sessionIdsByWorkspaceSession.set(workspaceSessionId, sessionId);
          if (workspaceSessionId !== 'master') this.persistCliSessionId?.(workspaceSessionId, sessionId);
          saveSessionId(sessionId, command.prompt);
        }

        resolve({
          success: code === 0,
          output: output.trim(),
          error: errorOutput || undefined,
          exitCode: code ?? 0,
          sessionId: this.masterSessionId,
        });
      });

      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;
        const wasAborted = this.abortRequested;
        this.abortRequested = false;
        if (wasAborted) {
          resolve({
            success: false,
            output: output.trim(),
            error: 'Command aborted by user',
            exitCode: 130,
            sessionId: this.masterSessionId,
            aborted: true,
          });
          return;
        }
        resolve({ success: false, output, error: error.message, exitCode: 1, sessionId: this.masterSessionId });
      });
    });
  }

  newSession() {
    this.masterSessionId = undefined;
    for (const workspaceSessionId of this.sessionIdsByWorkspaceSession.keys()) {
      this.clearCliSessionIdFn?.(workspaceSessionId);
    }
    this.sessionIdsByWorkspaceSession.clear();
    ensureDir(SESSION_FILE);
    writeFileSync(SESSION_FILE, '# LEXOIRE Master Session\n\nsession-id: (none — will be set on next prompt)\n');
    console.log('[CopilotService] Session cleared — next prompt starts fresh');
  }

  abort(): boolean {
    if (!this.currentProcess) return false;
    this.abortRequested = true;
    this.currentProcess.kill('SIGTERM');
    return true;
  }

  isRunning(): boolean { return this.currentProcess !== null; }
}

export default CopilotService;
