import { spawn, type ChildProcess } from 'child_process';
import os from 'os';
import { getCommandLookupEnv, resolveCommandBinary } from '../utils/command-resolution';

const HOME = os.homedir();

function resolveCodexBinary(): string {
  return resolveCommandBinary([
    process.env.CODEX_COMMAND?.trim(),
    process.platform !== 'win32' ? `${HOME}/.npm-global/bin/codex` : undefined,
    process.platform !== 'win32' ? `${HOME}/.local/bin/codex` : undefined,
    'codex',
  ], 'codex');
}

const CODEX_CLI = resolveCodexBinary();

type Message = { role: 'user' | 'assistant'; content: string };
type PromptResult = { text: string; aborted?: boolean };
type PersistCliSessionId = (workspaceSessionId: string, cliSessionId: string) => void;
type ClearCliSessionId = (workspaceSessionId: string) => void;
const conversationHistory = new Map<string, Message[]>();
const sessionIds = new Map<string, string>(); // workspaceSessionId → codex session UUID

class CodexService {
  private processes = new Map<string, ChildProcess>();
  private processWorkspaceIds = new Map<string, string>();
  private abortRequested = new Set<string>();
  private nextRunId = 0;
  private persistCliSessionId?: PersistCliSessionId;
  private clearCliSessionIdFn?: ClearCliSessionId;

  setPersistence(persist: PersistCliSessionId, clear: ClearCliSessionId): void {
    this.persistCliSessionId = persist;
    this.clearCliSessionIdFn = clear;
  }

  initFromSessions(sessions: Array<{ id: string; metadata?: Record<string, unknown> }>): void {
    for (const s of sessions) {
      const cliId = s.metadata?.codexCliSessionId as string | undefined;
      if (cliId) {
        sessionIds.set(s.id, cliId);
        console.log(`[CodexService] Restored CLI session for workspace ${s.id}: ${cliId}`);
      }
    }
  }

  isRunning(sessionId?: string) {
    if (!sessionId) return this.processes.size > 0;
    for (const workspaceSessionId of this.processWorkspaceIds.values()) {
      if (workspaceSessionId === sessionId) return true;
    }
    return false;
  }

  getHistory(sessionId: string): Message[] {
    return conversationHistory.get(sessionId) ?? [];
  }

  clearHistory(sessionId: string) {
    conversationHistory.delete(sessionId);
    sessionIds.delete(sessionId);
    this.clearCliSessionIdFn?.(sessionId);
  }

  abort() {
    return this.abortSession();
  }

  abortSession(sessionId?: string) {
    if (sessionId) {
      let aborted = false;
      for (const [runId, process] of this.processes) {
        if (this.processWorkspaceIds.get(runId) !== sessionId) continue;
        this.abortRequested.add(runId);
        process.kill('SIGTERM');
        aborted = true;
      }
      return aborted;
    }

    if (this.processes.size === 0) return false;
    for (const [runId, process] of this.processes) {
      this.abortRequested.add(runId);
      process.kill('SIGTERM');
    }
    return true;
  }

  getContextSummary(sessionId: string): string {
    const history = conversationHistory.get(sessionId) ?? [];
    return history
      .slice(-10)
      .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');
  }

  async prompt(
    text: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<PromptResult> {
    const runId = `${sessionId}:${Date.now()}:${++this.nextRunId}`;
    const hasConcurrentRunForSession = this.isRunning(sessionId);
    this.abortRequested.delete(runId);
    const history = conversationHistory.get(sessionId) ?? [];
    history.push({ role: 'user', content: text });

    let result: PromptResult = { text: '' };
    try {
      const cliSession = sessionIds.get(sessionId);
      if (cliSession && !hasConcurrentRunForSession) {
        result = await this.execResume(cliSession, text, sessionId, runId, onChunk);
      } else {
        result = await this.execNew(text, sessionId, runId, onChunk);
      }
      if (!result.aborted) {
        history.push({ role: 'assistant', content: result.text });
        conversationHistory.set(sessionId, history.slice(-40));
      }
    } catch (err) {
      throw err;
    } finally {
      this.abortRequested.delete(runId);
    }
    return result;
  }

  private execNew(
    text: string,
    sessionId: string,
    runId: string,
    onChunk: (chunk: string) => void
  ): Promise<PromptResult> {
    const args = [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--json',
      text,
    ];
    return this.runCli(args, sessionId, runId, onChunk);
  }

  private execResume(
    cliSessionId: string,
    text: string,
    sessionId: string,
    runId: string,
    onChunk: (chunk: string) => void
  ): Promise<PromptResult> {
    const args = [
      'exec', 'resume',
      cliSessionId,
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--json',
      text,
    ];
    return this.runCli(args, sessionId, runId, onChunk);
  }

  private runCli(
    args: string[],
    sessionId: string,
    runId: string,
    onChunk: (chunk: string) => void
  ): Promise<PromptResult> {
    return new Promise((resolve, reject) => {
      console.log(`[Codex CLI] ${CODEX_CLI} ${args.slice(0, -1).join(' ')} [prompt]`);

      const childProcess = spawn(CODEX_CLI, args, {
        cwd: process.cwd(),
        env: getCommandLookupEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.processes.set(runId, childProcess);
      this.processWorkspaceIds.set(runId, sessionId);

      let full = '';
      let buf = '';
      let errorBuffer = '';
      let streamedTextUsed = false;

      const emitText = (textValue: unknown) => {
        if (typeof textValue !== 'string' || !textValue) return;
        onChunk(textValue);
        full += textValue;
        streamedTextUsed = true;
      };

      const emitTextInUiChunks = (textValue: unknown) => {
        if (typeof textValue !== 'string' || !textValue) return;
        const chunkSize = 32;
        for (let index = 0; index < textValue.length; index += chunkSize) {
          emitText(textValue.slice(index, index + chunkSize));
        }
      };

      const emitContentBlocks = (content: unknown) => {
        if (typeof content === 'string') {
          emitText(content);
          return;
        }
        if (!Array.isArray(content)) return;
        for (const block of content) {
          if (typeof block === 'string') {
            emitText(block);
          } else if (block && typeof block === 'object') {
            const typedBlock = block as { type?: string; text?: string; content?: string };
            if ((typedBlock.type === 'text' || typedBlock.type === 'output_text') && typedBlock.text) {
              emitText(typedBlock.text);
            } else if (typedBlock.content) {
              emitText(typedBlock.content);
            }
          }
        }
      };

      const handleLine = (line: string) => {
        const t = line.trim();
        if (!t) return;
        try {
          const ev = JSON.parse(t);

          // Text delta streaming
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            emitText(ev.delta.text);
            return;
          }
          // Codex message event with content array
          if (ev.type === 'message' && ev.message?.role === 'assistant') {
            emitContentBlocks(ev.message.content);
          }
          // Generic assistant/output text event
          if ((ev.type === 'output_text' || ev.type === 'assistant') && ev.text) {
            emitText(ev.text);
          }
          // Current Codex CLI JSONL emits final assistant text as:
          // { type: "item.completed", item: { type: "agent_message", text: "..." } }
          if (ev.type === 'item.completed' && ev.item?.type === 'agent_message') {
            emitTextInUiChunks(ev.item.text);
          }
          if (ev.type === 'item.completed' && ev.item?.type === 'message' && ev.item?.role === 'assistant') {
            emitContentBlocks(ev.item.content);
          }
          if (ev.type === 'item.updated' && ev.item?.type === 'agent_message' && ev.item?.text_delta) {
            emitText(ev.item.text_delta);
          }
          // Session ID capture
          if (ev.session_id && typeof ev.session_id === 'string') {
            sessionIds.set(sessionId, ev.session_id);
            this.persistCliSessionId?.(sessionId, ev.session_id);
          }
          if (ev.type === 'session_started' && ev.id) {
            sessionIds.set(sessionId, ev.id);
            this.persistCliSessionId?.(sessionId, ev.id);
          }
          if (ev.type === 'thread.started' && ev.thread_id) {
            sessionIds.set(sessionId, ev.thread_id);
            this.persistCliSessionId?.(sessionId, ev.thread_id);
          }
          // Final result fallback
          if (ev.type === 'result' && !streamedTextUsed) {
            const r = ev.result ?? ev.text ?? '';
            if (r) emitText(r);
            if (ev.session_id) {
              sessionIds.set(sessionId, ev.session_id);
              this.persistCliSessionId?.(sessionId, ev.session_id);
            }
          }
        } catch {
          // non-JSON stderr-like lines — ignore silently
        }
      };

      childProcess.stdout?.on('data', (data: Buffer) => {
        buf += data.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorBuffer += chunk;
        console.warn('[Codex CLI stderr]', chunk.trim());
      });

      childProcess.on('close', (code) => {
        this.processes.delete(runId);
        this.processWorkspaceIds.delete(runId);
        if (buf.trim()) handleLine(buf);
        const wasAborted = this.abortRequested.has(runId);
        this.abortRequested.delete(runId);
        if (wasAborted) {
          resolve({ text: full.trim(), aborted: true });
          return;
        }
        if (code !== 0 && !full) {
          const message = errorBuffer.trim() || `codex exited with code ${code}`;
          reject(new Error(message));
        } else {
          resolve({ text: full.trim() });
        }
      });

      childProcess.on('error', (err) => {
        this.processes.delete(runId);
        this.processWorkspaceIds.delete(runId);
        const wasAborted = this.abortRequested.has(runId);
        this.abortRequested.delete(runId);
        if (wasAborted) {
          resolve({ text: full.trim(), aborted: true });
          return;
        }
        reject(err);
      });
    });
  }

}

export default CodexService;
