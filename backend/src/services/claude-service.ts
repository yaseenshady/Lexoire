import Anthropic from '@anthropic-ai/sdk';
import { spawn, spawnSync, type ChildProcess } from 'child_process';

const SYSTEM_PROMPT = `You are JARVIS, an elite AI assistant integrated into a voice-driven automation system. You have full access to tools and the filesystem. Be concise, direct, and action-oriented. When given a task, do it — don't just describe it.`;

function resolveClaudeBinary(): string {
  const candidates = [
    process.env.CLAUDE_COMMAND?.trim(),
    '/Users/yshady/.local/bin/claude',
    'claude',
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    const res = spawnSync('which', [bin === '/Users/yshady/.local/bin/claude' ? bin : bin], {
      encoding: 'utf8',
    });
    if (!res.error && (res.status === 0 || bin.startsWith('/'))) return bin;
  }
  return '';
}

const CLAUDE_CLI = resolveClaudeBinary();

type Message = { role: 'user' | 'assistant'; content: string };
const conversationHistory = new Map<string, Message[]>();
const sessionIds = new Map<string, string>(); // jarvisSessionId → claude CLI session ID

class ClaudeService {
  private currentProcess: ChildProcess | null = null;
  private running = false;

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
    this.currentProcess.kill('SIGTERM');
    this.currentProcess = null;
    this.running = false;
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
  ): Promise<string> {
    this.running = true;
    const history = conversationHistory.get(sessionId) ?? [];
    history.push({ role: 'user', content: text });

    let full = '';
    try {
      if (CLAUDE_CLI) {
        full = await this.promptViaCli(text, sessionId, onChunk);
      } else {
        full = await this.promptViaApi(history, onChunk);
      }
      history.push({ role: 'assistant', content: full });
      conversationHistory.set(sessionId, history.slice(-40));
    } finally {
      this.running = false;
    }
    return full;
  }

  private promptViaCli(
    text: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        '--print',
        '--verbose',
        '--dangerously-skip-permissions',
        '--output-format', 'stream-json',
        '--system-prompt', SYSTEM_PROMPT,
      ];

      // Resume existing CLI session if we have one
      const cliSession = sessionIds.get(sessionId);
      if (cliSession) {
        args.push('--resume', cliSession);
      }

      args.push(text);

      console.log(`[Claude CLI] ${CLAUDE_CLI} ${args.slice(0, -1).join(' ')} [prompt]`);

      this.currentProcess = spawn(CLAUDE_CLI, args, {
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let full = '';
      let buf = '';
      let newSessionId = '';

      const handleLine = (line: string) => {
        const t = line.trim();
        if (!t) return;
        try {
          const ev = JSON.parse(t);
          // --print --verbose mode: text in assistant.message.content[]
          if (ev.type === 'assistant' && Array.isArray(ev.message?.content)) {
            for (const block of ev.message.content) {
              if (block.type === 'text' && block.text) {
                onChunk(block.text);
                full += block.text;
              }
            }
          }
          // Streaming mode (non-print): content_block_delta
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            onChunk(ev.delta.text);
            full += ev.delta.text;
          }
          // Capture session ID
          if (ev.type === 'result' && ev.session_id) {
            newSessionId = ev.session_id;
          }
          // Fallback: result.result text if nothing else fired
          if (ev.type === 'result' && ev.result && !full) {
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
        console.warn('[Claude CLI stderr]', data.toString().trim());
      });

      this.currentProcess.on('close', () => {
        this.currentProcess = null;
        if (buf.trim()) handleLine(buf);
        if (newSessionId) {
          sessionIds.set(sessionId, newSessionId);
        }
        resolve(full.trim());
      });

      this.currentProcess.on('error', (err) => {
        this.currentProcess = null;
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
