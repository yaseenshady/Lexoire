import { spawn, spawnSync, type ChildProcess } from 'child_process';
import type { CopilotCommand, CopilotResponse } from '../types';

export interface CopilotRuntimeStatus {
  command: string;
  available: boolean;
  version?: string;
}

class CopilotService {
  private currentProcess: ChildProcess | null = null;

  constructor(private readonly commandBinary: string = process.env.COPILOT_COMMAND?.trim() || 'copilot') {}

  getCommandBinary(): string {
    return this.commandBinary;
  }

  getRuntimeStatus(): CopilotRuntimeStatus {
    const result = spawnSync(this.commandBinary, ['--version'], {
      encoding: 'utf8',
      env: { ...process.env }
    });

    const versionOutput = [result.stdout, result.stderr]
      .filter((value): value is string => typeof value === 'string')
      .join('\n')
      .trim();

    return {
      command: this.commandBinary,
      available: !result.error && result.status === 0,
      version: versionOutput || undefined
    };
  }

  execute(
    command: CopilotCommand,
    onOutput: (chunk: string, type: 'stdout' | 'stderr') => void
  ): Promise<CopilotResponse> {
    return new Promise((resolve) => {
      const workingDirectory = command.workingDirectory || process.cwd();
      const args = [
        command.yolo ? '--allow-all' : '--allow-all-tools',
        '--add-dir',
        workingDirectory,
        '--output-format',
        'json',
        '--prompt',
        command.prompt
      ];

      if (command.sessionId) {
        args.push('--resume', command.sessionId);
      }

      this.currentProcess = spawn(this.commandBinary, args, {
        cwd: workingDirectory,
        env: { ...process.env }
      });

      let output = '';
      let errorOutput = '';
      let stdoutBuffer = '';
      let sessionId: string | undefined;
      let streamedAssistantOutput = false;

      const handleJsonLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        try {
          const parsed = JSON.parse(trimmed) as {
            type?: string;
            data?: { deltaContent?: string; content?: string };
            sessionId?: string;
          };

          if (parsed.type === 'assistant.message_delta' && parsed.data?.deltaContent) {
            streamedAssistantOutput = true;
            output += parsed.data.deltaContent;
            onOutput(parsed.data.deltaContent, 'stdout');
            return;
          }

          if (parsed.type === 'assistant.message' && parsed.data?.content && !streamedAssistantOutput) {
            output += parsed.data.content;
            onOutput(parsed.data.content, 'stdout');
            return;
          }

          if (parsed.type === 'result' && parsed.sessionId) {
            sessionId = parsed.sessionId;
          }
        } catch {
          output += `${trimmed}\n`;
          onOutput(`${trimmed}\n`, 'stdout');
        }
      };

      this.currentProcess.stdout?.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString();

        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
          handleJsonLine(line);
        }
      });

      this.currentProcess.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        errorOutput += chunk;
        onOutput(chunk, 'stderr');
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;

        if (stdoutBuffer.trim()) {
          handleJsonLine(stdoutBuffer);
        }

        resolve({
          success: code === 0,
          output: output.trim(),
          error: errorOutput || undefined,
          exitCode: code ?? 0,
          sessionId
        });
      });

      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;

        resolve({
          success: false,
          output,
          error: error.message,
          exitCode: 1,
          sessionId
        });
      });
    });
  }

  abort(): boolean {
    if (!this.currentProcess) {
      return false;
    }

    this.currentProcess.kill('SIGTERM');
    this.currentProcess = null;
    return true;
  }

  isRunning(): boolean {
    return this.currentProcess !== null;
  }
}

export default CopilotService;
