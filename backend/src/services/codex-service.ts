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
const conversationHistory = new Map<string, Message[]>();
const sessionIds = new Map<string, string>(); // workspaceSessionId → codex session UUID

class CodexService {
  private currentProcess: ChildProcess | null = null;
  private running = false;
  private abortRequested = false;

  isRunning() { return this.running; }

  getHistory(sessionId: string): Message[] {
    return conversationHistory.get(sessionId) ?? [];
  }

  clearHistory(sessionId: string) {
    conversationHistory.delete(sessionId);
    sessionIds.delete(sessionId);
  }

  abort() {
    if (!this.currentProcess) return false;
    this.abortRequested = true;
    this.currentProcess.kill('SIGTERM');
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
    this.running = true;
    this.abortRequested = false;
    const history = conversationHistory.get(sessionId) ?? [];
    history.push({ role: 'user', content: text });

    let result: PromptResult = { text: '' };
    try {
      const cliSession = sessionIds.get(sessionId);
      if (cliSession) {
        result = await this.execResume(cliSession, text, sessionId, onChunk);
      } else {
        result = await this.execNew(text, sessionId, onChunk);
      }
      if (!result.aborted) {
        history.push({ role: 'assistant', content: result.text });
        conversationHistory.set(sessionId, history.slice(-40));
      }
    } catch (err) {
      throw err;
    } finally {
      this.running = false;
      this.abortRequested = false;
    }
    return result;
  }

  private execNew(
    text: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<PromptResult> {
    const args = [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--json',
      text,
    ];
    return this.runCli(args, sessionId, onChunk);
  }

  private execResume(
    cliSessionId: string,
    text: string,
    sessionId: string,
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
    return this.runCli(args, sessionId, onChunk);
  }

  private runCli(
    args: string[],
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<PromptResult> {
    return new Promise((resolve, reject) => {
      console.log(`[Codex CLI] ${CODEX_CLI} ${args.slice(0, -1).join(' ')} [prompt]`);

      this.currentProcess = spawn(CODEX_CLI, args, {
        cwd: process.cwd(),
        env: getCommandLookupEnv(),
      });

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
            emitText(ev.item.text);
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
          }
          if (ev.type === 'session_started' && ev.id) {
            sessionIds.set(sessionId, ev.id);
          }
          if (ev.type === 'thread.started' && ev.thread_id) {
            sessionIds.set(sessionId, ev.thread_id);
          }
          // Final result fallback
          if (ev.type === 'result' && !streamedTextUsed) {
            const r = ev.result ?? ev.text ?? '';
            if (r) emitText(r);
            if (ev.session_id) sessionIds.set(sessionId, ev.session_id);
          }
        } catch {
          // non-JSON stderr-like lines — ignore silently
        }
      };

      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        buf += data.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) handleLine(line);
      });

      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorBuffer += chunk;
        console.warn('[Codex CLI stderr]', chunk.trim());
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        if (buf.trim()) handleLine(buf);
        const wasAborted = this.abortRequested;
        this.abortRequested = false;
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

      this.currentProcess.on('error', (err) => {
        this.currentProcess = null;
        const wasAborted = this.abortRequested;
        this.abortRequested = false;
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
