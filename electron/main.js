const { app, BrowserWindow, Menu, session, systemPreferences, ipcMain, shell: electronShell } = require('electron');
const { existsSync } = require('fs');
const path = require('path');
const http = require('http');
const { spawn, exec, execFileSync, spawnSync } = require('child_process');

// Suppress EPIPE crashes (happens when terminal pipe closes while backend logs)
process.on('uncaughtException', (err) => { if (err.code !== 'EPIPE') throw err; });
app.commandLine.appendSwitch('disable-http-cache');

const LEXOIRE_PORT = 7337;
const APP_PROFILE_CANDIDATES = ['lexoire-voice-automation', 'LEXOIRE'];
const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.exit(0);
}

function configureProfilePaths() {
  if (!app.isPackaged) return;

  const appDataPath = app.getPath('appData');
  const userDataPath = APP_PROFILE_CANDIDATES
    .map((name) => path.join(appDataPath, name))
    .find((candidatePath) => existsSync(candidatePath))
    || path.join(appDataPath, APP_PROFILE_CANDIDATES[0]);

  app.setPath('userData', userDataPath);
  app.setPath('sessionData', userDataPath);
}

configureProfilePaths();

let mainWindow;
let backendProcess;

const resourcesPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar')
  : path.join(__dirname, '..');

function waitForBackend(port, maxWaitMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const retry = (message) => {
      if (Date.now() - start < maxWaitMs) {
        setTimeout(attempt, 400);
        return;
      }

      reject(new Error(message));
    };

    const attempt = () => {
      const req = http.get({
        host: '127.0.0.1',
        port,
        path: '/api/health',
        timeout: 1000,
      }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            retry(`Backend health probe returned ${res.statusCode}`);
            return;
          }

          try {
            const payload = JSON.parse(body);
            if (payload?.status === 'ok') {
              resolve();
              return;
            }
          } catch (_) {}

          retry('Backend health probe did not return a valid LEXOIRE response');
        });
      });

      req.on('error', () => retry('Backend not ready after ' + maxWaitMs + 'ms'));
      req.on('timeout', () => {
        req.destroy();
        retry('Backend timeout');
      });
    };
    setTimeout(attempt, 500);
  });
}

function listListeningPids(port) {
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
      const pidMatches = output
        .split(/\r?\n/)
        .map((line) => {
          const match = line.match(new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`, 'i'));
          return match ? Number.parseInt(match[1], 10) : NaN;
        })
        .filter((value) => Number.isInteger(value));
      return [...new Set(pidMatches)];
    } catch (_) {
      return [];
    }
  }

  if (!commandExists('lsof')) {
    return [];
  }
  try {
    const output = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    return output
      .split('\n')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value));
  } catch (_) {
    return [];
  }
}

function getProcessCommand(pid) {
  if (process.platform === 'win32') {
    return runPowerShell(`$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object -First 1; if ($process) { $process.CommandLine }`);
  }

  if (!commandExists('ps')) {
    return '';
  }
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim();
  } catch (_) {
    return '';
  }
}

function waitMs(durationMs) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
  } catch (_) {}
}

function runPowerShell(script) {
  if (process.platform !== 'win32') {
    return '';
  }

  const shell = commandExists('powershell.exe')
    ? 'powershell.exe'
    : (commandExists('pwsh.exe') ? 'pwsh.exe' : null);
  if (!shell) {
    return '';
  }

  try {
    const result = spawnSync(shell, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    if (result.error || result.status !== 0) {
      return '';
    }
    return result.stdout.trim();
  } catch (_) {
    return '';
  }
}

function cleanupStaleBackend(port) {
  const pids = listListeningPids(port);

  for (const pid of pids) {
    if (!pid || pid === process.pid) continue;
    const command = getProcessCommand(pid);
    const isLexoireBackend =
      command.includes('backend/dist/server.js') ||
      command.includes(' dist/server.js') ||
      (command.includes('LEXOIRE.app') && command.includes('server.js'));
    if (!isLexoireBackend) continue;
    console.log('Stopping stale LEXOIRE backend on port', port, 'pid', pid);
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_) {}
  }

  if (pids.length > 0) {
    waitMs(1000);
  }
}

function listManagedSpeechProcesses() {
  if (process.platform !== 'darwin' || !commandExists('ps')) {
    return [];
  }

  try {
    const output = execFileSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' });
    return output
      .split('\n')
      .map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
      .filter((match) => Boolean(match))
      .map((match) => ({
        pid: Number.parseInt(match[1], 10),
        command: match[2],
      }))
      .filter(({ pid, command }) =>
        Number.isInteger(pid)
        && command.includes('LexoireSpeech')
        && (
          command.includes('LEXOIRE.app')
          || command.includes(path.join('swift', 'LexoireSpeech'))
        ));
  } catch (_) {
    return [];
  }
}

function cleanupStaleSpeechProcesses(exceptPid) {
  const speechProcesses = listManagedSpeechProcesses();
  let stoppedAny = false;

  for (const { pid, command } of speechProcesses) {
    if (!pid || pid === exceptPid) continue;
    console.log('Stopping stale speech recognizer pid', pid, command);
    try {
      process.kill(pid, 'SIGTERM');
      stoppedAny = true;
    } catch (_) {}
  }

  if (stoppedAny) {
    waitMs(1000);
  }
}

function getBackendRuntime() {
  const env = {
    ...process.env,
    PORT: String(LEXOIRE_PORT),
    LEXOIRE_STRICT_PORT: '1',
    NODE_ENV: 'production',
    DB_PATH: app.isPackaged
      ? path.join(app.getPath('userData'), 'lexoire.db')
      : (process.env.DB_PATH || ''),
  };

  if (app.isPackaged) {
    env.LEXOIRE_LOCAL_STT_CACHE_DIR = path.join(process.resourcesPath, 'models', 'transformers');
    env.LEXOIRE_LOCAL_STT_OFFLINE_ONLY = '1';
  }

  if (process.versions?.electron) {
    return {
      command: process.execPath,
      args: [],
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  return {
    command: process.execPath,
    args: [],
    env,
  };
}

function startBackend() {
  const backendPath = path.join(resourcesPath, 'backend', 'dist', 'server.js');
  const backendCwd = app.isPackaged ? app.getPath('userData') : path.join(resourcesPath, 'backend');
  const runtime = getBackendRuntime();
  cleanupStaleBackend(LEXOIRE_PORT);
  console.log('Starting backend:', backendPath, 'on port', LEXOIRE_PORT);

  backendProcess = spawn(runtime.command, [...runtime.args, backendPath], {
    env: runtime.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: backendCwd,
  });

  const safeLog = (...args) => { try { console.log(...args); } catch (_) {} };
  const safeErr = (...args) => { try { console.error(...args); } catch (_) {} };
  backendProcess.stdout.on('data', (d) => safeLog('[B]', d.toString().trim()));
  backendProcess.stderr.on('data', (d) => safeErr('[BE]', d.toString().trim()));
  backendProcess.on('error', (err) => safeErr('Backend error:', err));
  backendProcess.on('exit', (code) => safeLog('Backend exited:', code));
  process.stdout.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  process.stderr.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });

  return waitForBackend(LEXOIRE_PORT);
}

function createWindow(initialUrl) {
  const windowOptions = {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#060808',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'LEXOIRE',
    show: false,
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
  }

  mainWindow = new BrowserWindow({
    ...windowOptions,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  const url = initialUrl || ('http://127.0.0.1:' + LEXOIRE_PORT);
  console.log('Loading:', url);
  mainWindow.loadURL(url);

  if (!initialUrl) {
    mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('Load failed:', code, desc);
      setTimeout(() => mainWindow && mainWindow.loadURL(url), 2000);
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'LEXOIRE',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        { label: 'Quit LEXOIRE', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]));
}

// ── TTS fallback queue ───────────────────────────────────────────────────────
let sayProcess = null;
const sayQueue = [];
let activeUtterance = null;
let stoppingSpeech = false;
const DEFAULT_HIFI_TTS_RATE = 168;
const DEFAULT_CLASSIC_TTS_RATE = 150;

function commandExists(command) {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(locator, [command], {
    stdio: 'ignore',
    env: { ...process.env },
  });
  return !result.error && result.status === 0;
}

function mapWindowsSpeechRate(rate) {
  return Math.min(10, Math.max(-10, Math.round((rate - DEFAULT_HIFI_TTS_RATE) / 8)));
}

function mapSpeechDispatcherRate(rate) {
  return Math.min(100, Math.max(-100, Math.round((rate - DEFAULT_HIFI_TTS_RATE) * 0.8)));
}

function resolveTtsRuntime() {
  if (process.platform === 'darwin' && commandExists('say')) {
    return {
      command: 'say',
      useStdin: false,
      buildArgs: ({ rate, voice, text }) => [
        ...(voice ? ['-v', voice] : []),
        '-r',
        String(rate),
        text,
      ],
    };
  }

  if (process.platform === 'win32') {
    const shell = commandExists('powershell.exe')
      ? 'powershell.exe'
      : (commandExists('pwsh.exe') ? 'pwsh.exe' : null);
    if (shell) {
      return {
        command: shell,
        useStdin: true,
        buildArgs: ({ rate }) => [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          [
            'Add-Type -AssemblyName System.Speech;',
            '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
            `$synth.Rate = ${mapWindowsSpeechRate(rate)};`,
            '$text = [Console]::In.ReadToEnd();',
            'if (-not [string]::IsNullOrWhiteSpace($text)) { $synth.Speak($text); }',
            '$synth.Dispose();',
          ].join(' '),
        ],
      };
    }
  }

  if (process.platform === 'linux') {
    if (commandExists('spd-say')) {
      return {
        command: 'spd-say',
        useStdin: false,
        buildArgs: ({ rate, text }) => [
          '--wait',
          `--rate=${mapSpeechDispatcherRate(rate)}`,
          text,
        ],
      };
    }

    if (commandExists('espeak')) {
      return {
        command: 'espeak',
        useStdin: false,
        buildArgs: ({ rate, text }) => [
          '-s',
          String(rate),
          text,
        ],
      };
    }
  }

  return null;
}

function stopSpeechOutput() {
  while (sayQueue.length > 0) {
    const queued = sayQueue.shift();
    queued?.resolve(false);
  }
  if (sayProcess) {
    stoppingSpeech = true;
    try { sayProcess.kill('SIGTERM'); } catch (_) {}
  }
}

function getVoiceCapabilities() {
  return {
    platform: process.platform,
    nativeSpeechRecognition: process.platform === 'darwin',
    nativeTtsFallback: Boolean(resolveTtsRuntime()),
  };
}

function listDarwinVoices() {
  if (process.platform !== 'darwin') return null;
  try {
    return execFileSync('say', ['-v', '?'], { encoding: 'utf8' })
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s{2,}/)[0]?.trim())
      .filter(Boolean);
  } catch (_) {
    return null;
  }
}

const darwinAutoVoiceCache = {
  hifi: null,
  classic: null,
};

function findDarwinVoice(installedVoices, requestedVoice) {
  const normalizedRequestedVoice = typeof requestedVoice === 'string' ? requestedVoice.trim().toLowerCase() : '';
  if (!normalizedRequestedVoice) {
    return null;
  }

  return installedVoices.find((voice) => voice.toLowerCase() === normalizedRequestedVoice)
    || installedVoices.find((voice) => voice.toLowerCase().includes(normalizedRequestedVoice) || normalizedRequestedVoice.includes(voice.toLowerCase()))
    || null;
}

function pickVoice(mode = 'hifi', preferredVoiceName) {
  const explicitVoice = typeof preferredVoiceName === 'string' ? preferredVoiceName.trim() : '';
  if (process.platform !== 'darwin') {
    return null;
  }

  const envVoice = process.env.LEXOIRE_VOICE?.trim();
  const preferred = envVoice
    ? [envVoice]
    : mode === 'classic'
      ? ['Fred', 'Ralph', 'Albert']
      : ['Eddy (English (US))', 'Reed (English (US))', 'Flo (English (US))', 'Samantha', 'Ava', 'Allison'];

  const installed = listDarwinVoices();
  if (explicitVoice) {
    if (!installed) {
      return explicitVoice;
    }
    return findDarwinVoice(installed, explicitVoice);
  }

  if (installed) {
    const cachedVoice = darwinAutoVoiceCache[mode];
    const matchedCachedVoice = cachedVoice ? findDarwinVoice(installed, cachedVoice) : null;
    if (matchedCachedVoice) {
      return matchedCachedVoice;
    }

    for (const name of preferred) {
      const matchedVoice = findDarwinVoice(installed, name);
      if (matchedVoice) {
        darwinAutoVoiceCache[mode] = matchedVoice;
        return matchedVoice;
      }
    }

    if (installed[0]) {
      darwinAutoVoiceCache[mode] = installed[0];
      return installed[0];
    }
  }

  const fallbackVoice = mode === 'classic' ? 'Fred' : 'Eddy (English (US))';
  darwinAutoVoiceCache[mode] = fallbackVoice;
  return fallbackVoice;
}

function speakNextQueuedUtterance() {
  const next = sayQueue.shift();
  if (!next) {
    sayProcess = null;
    activeUtterance = null;
    return;
  }

  activeUtterance = next;
  stoppingSpeech = false;
  const rate = next.mode === 'classic' ? DEFAULT_CLASSIC_TTS_RATE : DEFAULT_HIFI_TTS_RATE;
  const runtime = resolveTtsRuntime();
  const voice = pickVoice(next.mode, next.voiceName);
  const requiresVoiceSelection = process.platform === 'darwin' || Boolean(next.voiceName);
  if (!runtime || (requiresVoiceSelection && !voice)) {
    activeUtterance = null;
    next.resolve(false);
    speakNextQueuedUtterance();
    return;
  }

  sayProcess = spawn(runtime.command, runtime.buildArgs({ text: next.text, rate, voice }), {
    stdio: runtime.useStdin ? ['pipe', 'ignore', 'pipe'] : ['ignore', 'ignore', 'pipe'],
    env: { ...process.env },
  });
  if (runtime.useStdin) {
    sayProcess.stdin?.end(next.text);
  }
  sayProcess.stderr?.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      console.warn('[TTS]', message);
    }
  });
  sayProcess.once('error', (error) => {
    sayProcess = null;
    const current = activeUtterance;
    activeUtterance = null;
    current?.reject(error);
    speakNextQueuedUtterance();
  });
  sayProcess.once('exit', (code) => {
    sayProcess = null;
    const current = activeUtterance;
    const aborted = stoppingSpeech;
    activeUtterance = null;
    stoppingSpeech = false;
    if (aborted || code === 0 || code === null) {
      current?.resolve(!aborted);
    } else {
      current?.reject(new Error(`say exited with code ${code}`));
    }
    speakNextQueuedUtterance();
  });
}

ipcMain.handle('tts:speak', async (_, payload) => {
  const text = typeof payload === 'object' && payload !== null ? payload.text : payload;
  const mode = typeof payload === 'object' && payload !== null && payload.mode === 'classic' ? 'classic' : 'hifi';
  const voiceName = typeof payload === 'object' && payload !== null && typeof payload.voiceName === 'string'
    ? payload.voiceName.trim()
    : '';
  const clean = String(text).replace(/["`$\\]/g, ' ').trim().substring(0, 400);
  if (!clean) return false;
  return new Promise((resolve, reject) => {
    sayQueue.push({ text: clean, mode, voiceName, resolve, reject });
    if (!sayProcess && !activeUtterance) speakNextQueuedUtterance();
  });
});

ipcMain.handle('tts:stop', async () => {
  stopSpeechOutput();
});

ipcMain.handle('mic:request', async () => {
  if (process.platform !== 'darwin') return true;
  if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true;
  return systemPreferences.askForMediaAccess('microphone');
});

ipcMain.handle('mic:status', async () => {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('microphone');
});

ipcMain.handle('mic:open-settings', async () => {
  if (process.platform === 'darwin') {
    await electronShell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    return true;
  }

  if (process.platform === 'win32') {
    await electronShell.openExternal('ms-settings:privacy-microphone');
    return true;
  }

  return false;
});

ipcMain.handle('voice:capabilities', async () => getVoiceCapabilities());

// ── Native speech recognition via Swift SFSpeechRecognizer ───────────────
let speechProcess = null;
let speechEnabled = false;

function getSpeechBinaryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'swift', 'LexoireSpeech');
  }

  return path.join(__dirname, '..', 'swift', 'LexoireSpeech');
}

function startSpeechProcess() {
  if (process.platform !== 'darwin') {
    mainWindow?.webContents.send('speech:event', {
      type: 'error',
      text: 'Native speech recognition is currently available on macOS only.',
    });
    return;
  }

  if (speechProcess) return;
  cleanupStaleSpeechProcesses();
  try {
    const speechBinaryPath = getSpeechBinaryPath();
    speechProcess = spawn(speechBinaryPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.warn('[Speech] Failed to start:', e.message);
    mainWindow?.webContents.send('speech:event', {
      type: 'error',
      text: `Failed to start native speech recognition: ${e.message}`,
    });
    return;
  }
  let buf = '';
  speechProcess.stdout.on('data', (data) => {
    buf += data.toString();
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t === 'LEXOIRE_READY') {
        mainWindow?.webContents.send('speech:event', { type: 'ready' });
      } else if (t.startsWith('LEXOIRE_INTERIM:')) {
        mainWindow?.webContents.send('speech:event', { type: 'interim', text: t.slice(16) });
      } else if (t.startsWith('LEXOIRE_FINAL:')) {
        mainWindow?.webContents.send('speech:event', { type: 'final', text: t.slice(14) });
      } else if (t.startsWith('LEXOIRE_ERROR:')) {
        const errorText = t.slice(14);
        if (/denied|notDetermined|restricted|permission|privacy|siri|dictation|disabled/i.test(errorText)) {
          speechEnabled = false;
        }
        mainWindow?.webContents.send('speech:event', { type: 'error', text: errorText });
      }
    }
  });
  speechProcess.stderr.on('data', (d) => console.warn('[Speech]', d.toString().trim()));
  speechProcess.on('error', (error) => {
    speechProcess = null;
    mainWindow?.webContents.send('speech:event', {
      type: 'error',
      text: `Failed to start native speech recognition: ${error.message}`,
    });
  });
  speechProcess.on('exit', (code) => {
    speechProcess = null;
    if (speechEnabled) setTimeout(() => { if (speechEnabled) startSpeechProcess(); }, 1200);
  });
}

function stopSpeechProcess() {
  speechEnabled = false;
  if (speechProcess) {
    try { speechProcess.kill('SIGTERM'); } catch (_) {}
    speechProcess = null;
  }
}

function shutdownChildProcesses() {
  stopSpeechProcess();
  stopSpeechOutput();
  if (backendProcess) {
    try { backendProcess.kill('SIGTERM'); } catch (_) {}
    backendProcess = null;
  }
}

ipcMain.handle('speech:start', () => {
  speechEnabled = true;
  startSpeechProcess();
});

ipcMain.handle('speech:stop', () => {
  stopSpeechProcess();
});

app.on('ready', async () => {
  // Grant microphone permission unconditionally (local app, trusted)
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone');
    } catch (e) {
      console.warn('Mic access request failed (non-fatal):', e.message);
    }
  }

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'microphone', 'audioCapture', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'microphone', 'audioCapture'];
    return allowed.includes(permission);
  });

  try {
    await session.defaultSession.clearCache();
    await startBackend();
    console.log('Backend ready');
    createWindow();
  } catch (err) {
    console.error('Backend warning:', err.message);
    createWindow(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <html><body style="margin:0;background:#050807;color:#d4ffe0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
        <div style="max-width:560px;padding:32px;border:1px solid rgba(16,255,80,.2);border-radius:18px;background:rgba(6,18,10,.88);box-shadow:0 20px 60px rgba(0,0,0,.35)">
          <h1 style="margin:0 0 12px;font-size:28px;color:#10ff50">LEXOIRE backend unavailable</h1>
          <p style="margin:0 0 10px;line-height:1.5">The local backend could not claim port ${LEXOIRE_PORT}, so voice commands and Copilot orchestration are unavailable.</p>
          <pre style="white-space:pre-wrap;color:#9fe7b0;background:#031108;padding:12px;border-radius:10px">${String(err.message || err)}</pre>
        </div>
      </body></html>
    `)}`);
  }
});

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on('before-quit', () => {
  shutdownChildProcesses();
});

app.on('window-all-closed', () => {
  shutdownChildProcesses();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    // Backend is already running; just open the window
    createWindow('http://127.0.0.1:' + LEXOIRE_PORT);
  }
});
