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
  private formatTime(): string {
    return new Date().toLocaleTimeString();
  }

  info(message: string, ...args: any[]) {
    console.log(
      `${colors.cyan}[${this.formatTime()}] ℹ️  INFO:${colors.reset}`,
      message,
      ...args
    );
  }

  success(message: string, ...args: any[]) {
    console.log(
      `${colors.green}[${this.formatTime()}] ✅ SUCCESS:${colors.reset}`,
      message,
      ...args
    );
  }

  warning(message: string, ...args: any[]) {
    console.log(
      `${colors.yellow}[${this.formatTime()}] ⚠️  WARNING:${colors.reset}`,
      message,
      ...args
    );
  }

  error(message: string, ...args: any[]) {
    console.error(
      `${colors.red}[${this.formatTime()}] ❌ ERROR:${colors.reset}`,
      message,
      ...args
    );
  }

  debug(message: string, ...args: any[]) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `${colors.magenta}[${this.formatTime()}] 🐛 DEBUG:${colors.reset}`,
        message,
        ...args
      );
    }
  }

  copilot(message: string, ...args: any[]) {
    console.log(
      `${colors.bright}${colors.cyan}[${this.formatTime()}] 🤖 COPILOT:${colors.reset}`,
      message,
      ...args
    );
  }
}

export default new Logger();
