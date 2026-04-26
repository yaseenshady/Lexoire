import { appendFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

class Logger {
  private logFile = path.join(process.cwd(), 'logs', 'jarvis-backend.log');

  private formatTime(): string {
    return new Date().toLocaleTimeString();
  }

  private writeFile(level: string, message: string, args: any[]) {
    try {
      const dir = path.dirname(this.logFile);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const renderedArgs = args.map((arg) => {
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }).join(' ');
      appendFileSync(this.logFile, `[${new Date().toISOString()}] ${level} ${message}${renderedArgs ? ` ${renderedArgs}` : ''}\n`);
    } catch {}
  }

  info(message: string, ...args: any[]) {
    this.writeFile('INFO', message, args);
    console.log(
      `${colors.cyan}[${this.formatTime()}] ℹ️  INFO:${colors.reset}`,
      message,
      ...args
    );
  }

  success(message: string, ...args: any[]) {
    this.writeFile('SUCCESS', message, args);
    console.log(
      `${colors.green}[${this.formatTime()}] ✅ SUCCESS:${colors.reset}`,
      message,
      ...args
    );
  }

  warning(message: string, ...args: any[]) {
    this.writeFile('WARNING', message, args);
    console.log(
      `${colors.yellow}[${this.formatTime()}] ⚠️  WARNING:${colors.reset}`,
      message,
      ...args
    );
  }

  error(message: string, ...args: any[]) {
    this.writeFile('ERROR', message, args);
    console.error(
      `${colors.red}[${this.formatTime()}] ❌ ERROR:${colors.reset}`,
      message,
      ...args
    );
  }

  debug(message: string, ...args: any[]) {
    this.writeFile('DEBUG', message, args);
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `${colors.magenta}[${this.formatTime()}] 🐛 DEBUG:${colors.reset}`,
        message,
        ...args
      );
    }
  }

  copilot(message: string, ...args: any[]) {
    this.writeFile('COPILOT', message, args);
    console.log(
      `${colors.bright}${colors.cyan}[${this.formatTime()}] 🤖 COPILOT:${colors.reset}`,
      message,
      ...args
    );
  }
}

export default new Logger();
