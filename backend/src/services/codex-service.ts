import OpenAI from 'openai';
import { spawn, type ChildProcess } from 'child_process';

const CODEX_CLI = process.env.CODEX_COMMAND?.trim() ||
  '/Users/yshady/.npm-global/bin/codex';

type Message = { role: 'user' | 'assistant'; content: string };
const conversationHistory = new Map<string, Message[]>();
const sessionIds = new Map<string, string>(); // jarvisSessionId → codex session UUID

class CodexService {
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
      const cliSession = sessionIds.get(sessionId);
      if (cliSession) {
        full = await this.execResume(cliSession, text, sessionId, onChunk);
      } else {
        full = await this.execNew(text, sessionId, onChunk);
      }
      history.push({ role: 'assistant', content: full });
      conversationHistory.set(sessionId, history.slice(-40));
    } catch (err) {
      // API fallback
      try {
        full = await this.promptViaApi(history, onChunk);
        history.push({ role: 'assistant', content: full });
        conversationHistory.set(sessionId, history.slice(-40));
      } catch (apiErr: any) {
        throw apiErr;
      }
    } finally {
      this.running = false;
    }
    return full;
  }

  private execNew(
    text: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
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
  ): Promise<string> {
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
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`[Codex CLI] ${CODEX_CLI} ${args.slice(0, -1).join(' ')} [prompt]`);

      this.currentProcess = spawn(CODEX_CLI, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: `${process.env.PATH}:/Users/yshady/.npm-global/bin`,
        },
      });

      let full = '';
      let buf = '';

      const handleLine = (line: string) => {
        const t = line.trim();
        if (!t) return;
        try {
          const ev = JSON.parse(t);

          // Text delta streaming
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            onChunk(ev.delta.text); full += ev.delta.text; return;
          }
          // Codex message event with content array
          if (ev.type === 'message' && ev.message?.role === 'assistant') {
            const content = ev.message.content;
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text') { onChunk(block.text); full += block.text; }
              }
            } else if (typeof content === 'string') {
              onChunk(content); full += content;
            }
          }
          // Generic assistant/output text event
          if ((ev.type === 'output_text' || ev.type === 'assistant') && ev.text) {
            onChunk(ev.text); full += ev.text;
          }
          // Session ID capture
          if (ev.session_id && typeof ev.session_id === 'string') {
            sessionIds.set(sessionId, ev.session_id);
          }
          if (ev.type === 'session_started' && ev.id) {
            sessionIds.set(sessionId, ev.id);
          }
          // Final result fallback
          if (ev.type === 'result' && !full) {
            const r = ev.result ?? ev.text ?? '';
            if (r) { onChunk(r); full = r; }
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
        console.warn('[Codex CLI stderr]', data.toString().trim());
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        if (buf.trim()) handleLine(buf);
        if (code !== 0 && !full) {
          reject(new Error(`codex exited with code ${code}`));
        } else {
          resolve(full.trim());
        }
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
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await client.chat.completions.create({
      model: process.env.CODEX_MODEL?.trim() || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are JARVIS Codex, an AI coding assistant. Be concise and direct.' },
        ...history,
      ],
      stream: true,
    });

    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (delta) { onChunk(delta); full += delta; }
    }
    return full;
  }
}

export default CodexService;
