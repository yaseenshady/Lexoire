import Anthropic from '@anthropic-ai/sdk';
import { spawn, type ChildProcess } from 'child_process';
import os from 'os';
import { getCommandLookupEnv, resolveCommandBinary } from '../utils/command-resolution';

const SYSTEM_PROMPT = `You are Lexoire, an elite AI assistant integrated into a voice-driven automation system. You have full access to tools and the filesystem. Be concise, direct, and action-oriented. When given a task, do it - don't just describe it.`;

const HOME = os.homedir();

function resolveClaudeBinary(): string {
  return resolveCommandBinary([
    process.env.CLAUDE_COMMAND?.trim(),
    process.platform !== 'win32' ? `${HOME}/.local/bin/claude` : undefined,
    process.platform !== 'win32' ? `${HOME}/.npm-global/bin/claude` : undefined,
    'claude',
  ], '');
}

const CLAUDE_CLI = resolveClaudeBinary();

type Message = { role: 'user' | 'assistant'; content: string };
type PromptResult = { text: string; aborted?: boolean };
const conversationHistory = new Map<string, Message[]>();
const sessionIds = new Map<string, string>(); // workspaceSessionId → claude CLI session ID

class ClaudeService {
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
      if (CLAUDE_CLI) {
        result = await this.promptViaCli(text, sessionId, onChunk);
      } else {
        result = { text: await this.promptViaApi(history, onChunk) };
      }
      if (!result.aborted) {
        history.push({ role: 'assistant', content: result.text });
        conversationHistory.set(sessionId, history.slice(-40));
      }
    } finally {
      this.running = false;
      this.abortRequested = false;
    }
    return result;
  }

  private promptViaCli(
    text: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<PromptResult> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        '--dangerously-skip-permissions',
        '--verbose',
        '--output-format', 'stream-json',
        '--include-partial-messages',
        '--system-prompt', SYSTEM_PROMPT,
        '--print', text,
      ];

      // Resume existing CLI session if we have one
      const cliSession = sessionIds.get(sessionId);
      if (cliSession) {
        args.splice(args.indexOf('--print'), 0, '--resume', cliSession);
      }

      console.log(`[Claude CLI] ${CLAUDE_CLI} ${args.slice(0, -1).join(' ')} [prompt]`);

      this.currentProcess = spawn(CLAUDE_CLI, args, {
        cwd: process.cwd(),
        env: getCommandLookupEnv(),
      });

      let full = '';
      let buf = '';
      let stderrBuf = '';
      let newSessionId = '';
      // Track which path delivered text so we don't double-emit when both
      // content_block_delta (streaming) AND the final assistant event fire.
      let streamingTextUsed = false;

      const handleLine = (line: string) => {
        const t = line.trim();
        if (!t) return;
        try {
          const ev = JSON.parse(t);

          // --include-partial-messages wraps events: { type: 'stream_event', event: { type: 'content_block_delta', ... } }
          const inner = ev.type === 'stream_event' ? ev.event : null;
          if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
            streamingTextUsed = true;
            onChunk(inner.delta.text);
            full += inner.delta.text;
          }

          // Fallback for plain content_block_delta (non-wrapped, future-proof)
          if (!streamingTextUsed && ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            streamingTextUsed = true;
            onChunk(ev.delta.text);
            full += ev.delta.text;
          }

          // --verbose assistant event: full text at end. Skip if streaming already delivered it.
          if (!streamingTextUsed && ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
            for (const block of ev.message.content) {
              if (block.type === 'text' && block.text) {
                onChunk(block.text);
                full += block.text;
              }
            }
          }

          // Capture session ID from result event
          if (ev.type === 'result' && ev.session_id) {
            newSessionId = ev.session_id;
          }
          // Fallback: result.result text if nothing else fired (e.g. pure tool-use responses)
          if (ev.type === 'result' && typeof ev.result === 'string' && ev.result && !full) {
            onChunk(ev.result);
            full = ev.result;
          }
        } catch {
          // Non-JSON lines: ignore
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
        stderrBuf += chunk;
        console.warn('[Claude CLI stderr]', chunk.trim());
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

        if (code !== 0 && !full.trim()) {
          // Clear stale session so next prompt starts fresh
          sessionIds.delete(sessionId);
          const errMsg = stderrBuf.trim() || `Claude CLI exited with code ${code}`;
          console.error(`[Claude CLI] Failed (exit ${code}): ${errMsg.slice(0, 200)}`);
          resolve({ text: `[Claude error] ${errMsg.slice(0, 300)}` });
          return;
        }

        if (newSessionId) {
          sessionIds.set(sessionId, newSessionId);
        }
        resolve({ text: full.trim() });
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

  private async promptViaApi(
    history: Message[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: history as any,
    });

    let full = '';
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        onChunk(event.delta.text);
        full += event.delta.text;
      }
    }
    return full;
  }
}

export default ClaudeService;
