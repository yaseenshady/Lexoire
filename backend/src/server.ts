import express from 'express';
import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createServer } from 'http';
import { createServer as createNetServer } from 'net';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { ElevenLabsClient } from 'elevenlabs';
import DatabaseService from './db/database';
import CopilotService from './copilot/copilot-service';
import ClaudeService from './services/claude-service';
import CodexService from './services/codex-service';
import AcademicPptService from './services/academic-ppt-service';
import LocalTranscriptionService from './services/local-transcription-service';
import SessionManager from './services/session-manager';
import SessionMessaging from './services/session-messaging';
import logger from './services/logger';
import { appendSessionProgress, buildProviderPrompt, ensureSessionContext } from './services/session-context-md';
import { getCommandLookupEnv } from './utils/command-resolution';
import type {
  AppState,
  Conversation,
  CopilotCommand,
  CopilotResponse,
  ProjectPlan,
  RuntimeSummary,
  SocketEvents,
  VoiceCommand,
  Session
} from './types';

dotenv.config();

process.stdout.on('error', (error: any) => {
  if (error?.code !== 'EPIPE') {
    throw error;
  }
});

process.stderr.on('error', (error: any) => {
  if (error?.code !== 'EPIPE') {
    throw error;
  }
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim() || '';
// Default: ElevenLabs "Adam" premade voice (deep, clear AI-assistant voice)
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim() || 'pNInz6obpgDQGcFmaJgB';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL?.trim() || 'eleven_turbo_v2_5';
const MAX_TRANSCRIPTION_AUDIO_BYTES = 10 * 1024 * 1024;
const elevenLabsClient = ELEVENLABS_API_KEY
  ? new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY })
  : null;

const STARTED_AT = Date.now();
const DEFAULT_PORT = 5000;
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000';
const FRONTEND_DIST_PATH = path.resolve(__dirname, '../../frontend/dist');
const DEFAULT_SPEECH_RATE = 210;
const DEFAULT_SPEECH_PITCH = 100;
const DEFAULT_SPEECH_VOLUME = 100;
const FALLBACK_SPEECH_VOICE_BY_LOCALE: Record<string, string[]> = {
  'en-us': ['Samantha', 'Flo (English (US))', 'Eddy (English (US))', 'Allison', 'Ava', 'Alex'],
  'en-gb': ['Flo (English (UK))', 'Eddy (English (UK))', 'Daniel', 'Serena'],
  en: ['Samantha', 'Flo (English (US))', 'Eddy (English (US))', 'Allison', 'Ava', 'Alex', 'Daniel', 'Serena']
};

type InstalledVoice = {
  name: string;
  locale: string;
};

type SystemSpeechRuntime = {
  command: string;
  useStdin: boolean;
  buildArgs: (payload: {
    text: string;
    rate: number;
    pitch: number;
    volume: number;
    voice?: string;
  }) => string[];
};

const PORT = Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10);
const STRICT_PORT = process.env.LEXOIRE_STRICT_PORT === '1';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim() || DEFAULT_FRONTEND_ORIGIN;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../lexoire.db');

const app = express();
const httpServer = createServer(app);

const allowedOrigins = new Set([
  FRONTEND_ORIGIN,
  DEFAULT_FRONTEND_ORIGIN,
  'http://127.0.0.1:3000'
]);

const isAllowedOrigin = (origin?: string) =>
  !origin || allowedOrigins.has(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin);

const io = new Server<SocketEvents>(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST']
  }
});

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin || 'unknown'} is not allowed by LEXOIRE`));
  }
}));
app.use(express.json({ limit: '25mb' }));

const db = new DatabaseService(DB_PATH);
const copilotService = new CopilotService();
const claudeService = new ClaudeService();
const codexService = new CodexService();
const sessionManager = new SessionManager(db);
const sessionMessaging = new SessionMessaging(db);

// Restore Claude CLI session IDs from DB so --resume survives server restarts
claudeService.initFromSessions(sessionManager.listSessions());
claudeService.setPersistence(
  (workspaceId, cliId) => {
    const session = sessionManager.getSession(workspaceId);
    if (session) {
      session.metadata = { ...session.metadata, claudeCliSessionId: cliId };
      db.saveSession(session);
    }
  },
  (workspaceId) => {
    const session = sessionManager.getSession(workspaceId);
    if (session) {
      const { claudeCliSessionId: _, ...rest } = session.metadata ?? {};
      session.metadata = rest;
      db.saveSession(session);
    }
  }
);
const localTranscriptionService = new LocalTranscriptionService();

function getInstalledVoices(): InstalledVoice[] {
  if (process.platform !== 'darwin') {
    return [];
  }

  const result = spawnSync('say', ['-v', '?'], {
    encoding: 'utf8',
    env: { ...process.env }
  });

  if (result.error || result.status !== 0) {
    logger.warning('Unable to inspect installed macOS voices. Falling back to default voice selection.');
    return [];
  }

  return result.stdout
    .split('\n')
    .map((line) => line.match(/^(.*?)\s+([a-z]{2}_[A-Z]{2})\s+#/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      name: match[1].trim(),
      locale: match[2].replace('_', '-').toLowerCase()
    }));
}

const installedVoices = getInstalledVoices();
const installedVoiceNames = new Set(installedVoices.map((voice) => voice.name));

function normalizeLangTag(lang?: string): string | undefined {
  if (!lang) {
    return undefined;
  }

  const normalized = lang.trim().toLowerCase().replace('_', '-');
  return normalized || undefined;
}

function getPreferredVoices(lang?: string): string[] {
  const normalizedLang = normalizeLangTag(lang);

  if (!normalizedLang) {
    return FALLBACK_SPEECH_VOICE_BY_LOCALE.en;
  }

  return [
    ...(FALLBACK_SPEECH_VOICE_BY_LOCALE[normalizedLang] || []),
    ...(FALLBACK_SPEECH_VOICE_BY_LOCALE[normalizedLang.split('-')[0]] || [])
  ];
}

function resolveSpeechVoice(lang?: string, requestedVoice?: string): string | undefined {
  if (requestedVoice && installedVoiceNames.has(requestedVoice)) {
    return requestedVoice;
  }

  const preferredVoice = getPreferredVoices(lang).find((voice) => installedVoiceNames.has(voice));
  if (preferredVoice) {
    return preferredVoice;
  }

  const normalizedLang = normalizeLangTag(lang);
  if (normalizedLang) {
    const localeVoice = installedVoices.find((voice) => voice.locale === normalizedLang);
    if (localeVoice) {
      return localeVoice.name;
    }

    const languageVoice = installedVoices.find((voice) => voice.locale.startsWith(`${normalizedLang.split('-')[0]}-`));
    if (languageVoice) {
      return languageVoice.name;
    }
  }

  return undefined;
}

function commandExists(command: string): boolean {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(locator, [command], {
    stdio: 'ignore',
    env: getCommandLookupEnv()
  });
  return !result.error && result.status === 0;
}

function mapWindowsSpeechRate(rate: number): number {
  return Math.min(10, Math.max(-10, Math.round((rate - DEFAULT_SPEECH_RATE) / 8)));
}

function mapSpeechDispatcherRate(rate: number): number {
  return Math.min(100, Math.max(-100, Math.round((rate - DEFAULT_SPEECH_RATE) * 0.8)));
}

function resolveSystemSpeechRuntime(): SystemSpeechRuntime | null {
  if (process.platform === 'darwin' && commandExists('say')) {
    return {
      command: 'say',
      useStdin: false,
      buildArgs: ({ text, rate, voice }) => [
        ...(voice ? ['-v', voice] : []),
        '-r',
        `${rate}`,
        text
      ]
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
            // Pick best available English voice (Zira > Hazel > David > first English)
            '$voices = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture -match "^en" };',
            '$preferred = ($voices | Where-Object { $_.VoiceInfo.Name -match "Zira|Jenny|Aria|Hazel" } | Select-Object -First 1) ?? ($voices | Select-Object -First 1);',
            'if ($preferred) { $synth.SelectVoice($preferred.VoiceInfo.Name); }',
            '$text = [Console]::In.ReadToEnd();',
            'if (-not [string]::IsNullOrWhiteSpace($text)) { $synth.Speak($text); }',
            '$synth.Dispose();'
          ].join(' ')
        ]
      };
    }
  }

  if (process.platform === 'linux') {
    if (commandExists('spd-say')) {
      return {
        command: 'spd-say',
        useStdin: false,
        buildArgs: ({ text, rate }) => [
          '--wait',
          '--voice-type=FEMALE1',
          `--rate=${mapSpeechDispatcherRate(rate)}`,
          text
        ]
      };
    }

    if (commandExists('espeak-ng')) {
      return {
        command: 'espeak-ng',
        useStdin: true,
        buildArgs: ({ rate, pitch, volume }) => [
          '-v', 'en-us',
          '-s', `${Math.round(rate * 0.85)}`,
          '-p', `${Math.min(99, Math.max(0, Math.round((pitch / 200) * 99)))}`,
          '-a', `${Math.min(200, Math.max(0, Math.round((volume / 100) * 200)))}`,
          '--stdin',
        ]
      };
    }

    if (commandExists('espeak')) {
      return {
        command: 'espeak',
        useStdin: false,
        buildArgs: ({ text, rate, pitch, volume }) => [
          '-v', 'en',
          '-s', `${rate}`,
          '-p', `${Math.min(99, Math.max(0, Math.round((pitch / 200) * 99)))}`,
          '-a', `${Math.min(200, Math.max(0, Math.round((volume / 100) * 200)))}`,
          text
        ]
      };
    }
  }

  return null;
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampSpeechRate(rate?: number): number {
  const normalizedRate = typeof rate === 'number' && Number.isFinite(rate)
    ? rate
    : DEFAULT_SPEECH_RATE;

  return Math.min(240, Math.max(150, Math.round(normalizedRate)));
}

function clampSpeechPitch(pitch?: number): number {
  const normalizedPitch = typeof pitch === 'number' && Number.isFinite(pitch)
    ? pitch
    : DEFAULT_SPEECH_PITCH;

  return Math.min(200, Math.max(50, Math.round(normalizedPitch)));
}

function clampSpeechVolume(volume?: number): number {
  const normalizedVolume = typeof volume === 'number' && Number.isFinite(volume)
    ? volume
    : DEFAULT_SPEECH_VOLUME;

  return Math.min(100, Math.max(1, Math.round(normalizedVolume)));
}

const academicPptService = new AcademicPptService();

function canListenOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer();

    probe.once('error', () => resolve(false));
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });

    probe.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  const candidatePorts = Array.from({ length: 6 }, (_, index) => preferredPort + index);

  for (const candidatePort of candidatePorts) {
    if (await canListenOnPort(candidatePort)) {
      if (candidatePort !== preferredPort) {
        logger.warning(`Port ${preferredPort} is busy. Falling back to ${candidatePort}.`);
      }

      return candidatePort;
    }
  }

  throw new Error(`No available port found in range ${preferredPort}-${preferredPort + 5}.`);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function summarizeOutput(output: string): string | undefined {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return undefined;
  }

  return lines.slice(-5).join('\n');
}

function buildRuntimeSummary(): RuntimeSummary {
  const copilotStatus = copilotService.getRuntimeStatus();
  const academicPptStatus = academicPptService.getRuntimeStatus();

  return {
    startedAt: STARTED_AT,
    databasePath: DB_PATH,
    workingDirectory: process.cwd(),
    copilotCommand: copilotStatus.command,
    copilotAvailable: copilotStatus.available,
    copilotVersion: copilotStatus.version,
    sessionId: copilotStatus.sessionId,
    frontendOrigin: FRONTEND_ORIGIN,
    academicPptBaseUrl: academicPptStatus.baseUrl,
    conversationCount: db.getConversationCount(),
    memoryCount: db.getMemoryCount(),
    projectPlanCount: db.getProjectPlanCount(),
    sessionCount: sessionManager.getSessionCount()
  };
}

async function parseUpstreamResponse(response: globalThis.Response): Promise<{
  contentType: string;
  json?: unknown;
  text?: string;
}> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return {
      contentType,
      json: await response.json()
    };
  }

  return {
    contentType,
    text: await response.text()
  };
}

async function sendUpstreamResponse(res: express.Response, response: globalThis.Response): Promise<void> {
  const payload = await parseUpstreamResponse(response);

  if (payload.json !== undefined) {
    res.status(response.status).json(payload.json);
    return;
  }

  if (typeof payload.text === 'string' && payload.text.length > 0) {
    if (payload.contentType) {
      res.type(payload.contentType);
    }

    res.status(response.status).send(payload.text);
    return;
  }

  res.status(response.status).end();
}

function buildAppState(): AppState {
  return {
    conversations: db.getAllConversations(10),
    memories: db.getRecentMemories(20),
    activePlan: db.getLatestProjectPlan(),
    runtime: buildRuntimeSummary()
  };
}

function buildSessionRestoreState(requestedSessionId?: string) {
  const sessions = sessionManager.getRestorableSessions();
  const requestedSession = requestedSessionId
    ? sessions.find((session) => session.id === requestedSessionId) ?? null
    : null;
  const currentSession = requestedSession ?? sessionManager.getPreferredRestoreSession();
  const conversation = currentSession
    ? db.getLatestConversation(currentSession.id)
    : db.getLatestConversation();

  return {
    sessions,
    current: currentSession?.id,
    session: currentSession ?? null,
    conversation,
  };
}

function createExecutionPlan(command: CopilotCommand, createdAt: number): ProjectPlan {
  const planId = `plan-${createdAt}`;
  const shortPrompt = truncateText(command.prompt.trim(), 72);

  return {
    id: planId,
    title: shortPrompt || 'LEXOIRE execution',
    description: `Execution pipeline for "${shortPrompt || 'untitled command'}"`,
    status: 'in-progress',
    createdAt,
    updatedAt: createdAt,
    steps: [
      {
        id: `${planId}-dispatch`,
        description: 'Dispatch the command to the Copilot CLI runtime',
        status: 'completed',
        output: `Prompt: ${command.prompt.trim()}`
      },
      {
        id: `${planId}-stream`,
        description: 'Stream terminal output back to the dashboard',
        status: 'in-progress'
      },
      {
        id: `${planId}-finalize`,
        description: 'Finalize command status for saved project context',
        status: 'pending'
      }
    ]
  };
}

function completeExecutionPlan(plan: ProjectPlan, response: CopilotResponse, updatedAt: number): ProjectPlan {
  const summarizedOutput = summarizeOutput(response.output);

  return {
    ...plan,
    status: response.success ? 'completed' : 'failed',
    updatedAt,
    steps: [
      plan.steps[0],
      {
        ...plan.steps[1],
        status: 'completed',
        output: summarizedOutput || 'Command produced no terminal output.'
      },
      {
        ...plan.steps[2],
        status: response.success ? 'completed' : 'failed',
        output: response.success ? 'Command completed successfully.' : undefined,
        error: response.success ? undefined : (response.error || 'The Copilot CLI returned a failure exit code.')
      }
    ]
  };
}

function speakWithElevenLabs(text: string): Promise<void> {
  if (!elevenLabsClient) return Promise.reject(new Error('ElevenLabs not configured'));

  return elevenLabsClient.textToSpeech.convertAsStream(ELEVENLABS_VOICE_ID, {
    text,
    model_id: ELEVENLABS_MODEL,
    output_format: 'mp3_44100_128',
  }).then((audioStream) => new Promise<void>((resolve, reject) => {
    const afplay = spawn('afplay', ['-']);
    afplay.on('close', () => resolve());
    afplay.on('error', reject);
    audioStream.pipe(afplay.stdin!);
    audioStream.on('error', reject);
  }));
}

async function speakWithSystemVoice(
  text: string,
  lang?: string,
  requestedVoice?: string,
  requestedRate?: number,
  requestedPitch?: number,
  requestedVolume?: number
): Promise<void> {
  const message = normalizeSpeechText(text);
  if (!message) {
    return Promise.resolve();
  }

  if (elevenLabsClient && process.platform === 'darwin') {
    try {
      await speakWithElevenLabs(message);
      return;
    } catch (err: unknown) {
      logger.warning('ElevenLabs TTS failed, falling back to macOS say:', getErrorMessage(err));
    }
  }

  const runtime = resolveSystemSpeechRuntime();
  if (!runtime) {
    return Promise.reject(new Error(`No supported system speech runtime is available on ${process.platform}.`));
  }

  const voice = resolveSpeechVoice(lang, requestedVoice);
  const rate = clampSpeechRate(requestedRate);
  const pitch = clampSpeechPitch(requestedPitch);
  const volume = clampSpeechVolume(requestedVolume);

  return new Promise((resolve, reject) => {
    const child = spawn(runtime.command, runtime.buildArgs({
      text: message,
      rate,
      pitch,
      volume,
      voice
    }), {
      stdio: runtime.useStdin ? ['pipe', 'ignore', 'pipe'] : ['ignore', 'ignore', 'pipe'],
      env: { ...process.env }
    });
    if (runtime.useStdin) {
      child.stdin?.end(message);
    }
    let errorBuffer = '';
    child.stderr?.on('data', (data: Buffer) => {
      errorBuffer += data.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(errorBuffer.trim() || `Speech command exited with code ${code}`));
    });
  });
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    isExecuting: copilotService.isRunning(),
    runtime: buildRuntimeSummary()
  });
});

app.get('/api/voice-capabilities', (req, res) => {
  res.json(localTranscriptionService.getRuntimeStatus());
});

app.get('/api/app-state', (req, res) => {
  try {
    res.json(buildAppState());
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to build app state:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/session-restore', (req, res) => {
  try {
    const requestedSessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
    res.json(buildSessionRestoreState(requestedSessionId || undefined));
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to build session restore state:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/project-plan', (req, res) => {
  try {
    res.json(db.getLatestProjectPlan());
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to get project plan:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/academic-ppt/health', async (req, res) => {
  const academicPptStatus = academicPptService.getRuntimeStatus();
  const available = await academicPptService.checkHealth();

  res.json({
    ...academicPptStatus,
    available
  });
});

app.post('/api/academic-ppt/analyze', async (req, res) => {
  try {
    const response = await academicPptService.forwardAnalyze(req);
    await sendUpstreamResponse(res, response);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Academic PPT analyze request failed:', message);
    res.status(502).json({ error: `Academic PPT service unavailable: ${message}` });
  }
});

app.post('/api/academic-ppt/generate', async (req, res) => {
  try {
    const response = await academicPptService.forwardGenerate(req.body);
    await sendUpstreamResponse(res, response);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Academic PPT generate request failed:', message);
    res.status(502).json({ error: `Academic PPT service unavailable: ${message}` });
  }
});

app.get('/api/academic-ppt/download/:sessionId', async (req, res) => {
  try {
    const response = await academicPptService.download(req.params.sessionId);

    if (!response.ok) {
      await sendUpstreamResponse(res, response);
      return;
    }

    const contentType = response.headers.get('content-type');
    const contentDisposition = response.headers.get('content-disposition');
    const contentLength = response.headers.get('content-length');
    const fileContents = Buffer.from(await response.arrayBuffer());

    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    if (contentDisposition) {
      res.setHeader('Content-Disposition', contentDisposition);
    }

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    res.status(response.status).send(fileContents);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Academic PPT download request failed:', message);
    res.status(502).json({ error: `Academic PPT service unavailable: ${message}` });
  }
});

app.post('/api/speak', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const lang = typeof req.body?.lang === 'string' ? req.body.lang : undefined;
  const voice = typeof req.body?.voice === 'string' ? req.body.voice.trim() : undefined;
  const rate = typeof req.body?.rate === 'number' ? req.body.rate : undefined;
  const pitch = typeof req.body?.pitch === 'number' ? req.body.pitch : undefined;
  const volume = typeof req.body?.volume === 'number' ? req.body.volume : undefined;

  if (!text.trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }

  try {
    await speakWithSystemVoice(text, lang, voice, rate, pitch, volume);
    res.status(204).end();
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to speak response:', message);
    res.status(500).json({ error: message });
  }
});

app.post('/api/transcribe', async (req, res) => {
  const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64.trim() : '';
  const language = typeof req.body?.language === 'string' ? req.body.language.trim() : undefined;

  if (!audioBase64) {
    res.status(400).json({ error: 'audioBase64 is required' });
    return;
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioBase64, 'base64');
  } catch {
    res.status(400).json({ error: 'audioBase64 is not valid base64 data' });
    return;
  }

  if (audioBuffer.length === 0) {
    res.status(400).json({ error: 'Audio payload is empty' });
    return;
  }

  if (audioBuffer.length > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    res.status(413).json({ error: 'Audio payload is too large for transcription' });
    return;
  }

  try {
    const result = await localTranscriptionService.transcribe(audioBuffer, language);
    res.json(result);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to transcribe speech:', message);
    res.status(/unavailable|missing|rebuild/i.test(message) ? 503 : 500).json({ error: message });
  }
});

app.get('/api/conversations', (req, res) => {
  try {
    const conversations = db.getAllConversations();
    logger.info(`Retrieved ${conversations.length} conversations`);
    res.json(conversations);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to get conversations:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/conversations/:id', (req, res) => {
  try {
    const conversation = db.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    logger.info(`Retrieved conversation: ${req.params.id}`);
    res.json(conversation);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to get conversation:', message);
    res.status(500).json({ error: message });
  }
});

app.get('/api/memories', (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const memories = query
      ? db.searchMemories(query)
      : db.getRecentMemories();

    logger.info(`Retrieved ${memories.length} memories${query ? ` for query: ${query}` : ''}`);
    res.json(memories);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to get memories:', message);
    res.status(500).json({ error: message });
  }
});

// GET /api/sessions - List all active sessions with details
// Response: { sessions: Session[], current?: string }
app.get('/api/sessions', (req, res) => {
  try {
    const sessions = sessionManager.getRestorableSessions();
    logger.info(`Retrieved ${sessions.length} sessions`);
    
    const current = sessionManager.getPreferredRestoreSession()?.id;
    res.json({ sessions, current });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to get sessions:', message);
    res.status(500).json({ error: message });
  }
});

// POST /api/sessions - Create new session
// Body: { name: string, repo_path: string, branch?: string, objective?: string, session_id?: string }
// Response: { id: string, session: Session }
app.post('/api/sessions', (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const repoPath = typeof req.body?.repo_path === 'string' ? req.body.repo_path : '';
    const branch = typeof req.body?.branch === 'string' ? req.body.branch : undefined;
    const objective = typeof req.body?.objective === 'string' ? req.body.objective : undefined;
    const sessionId = typeof req.body?.session_id === 'string' ? req.body.session_id.trim() : '';

    if (!name.trim() || !repoPath.trim()) {
      res.status(400).json({ error: 'name and repo_path are required' });
      return;
    }

    const session = sessionManager.createSession(name, repoPath, branch, sessionId || undefined, objective);
    const contextPath = ensureSessionContext(session);
    
    logger.info(`Created session: ${session.id}`);
    (io as any).emit('session:created', { id: session.id, session, contextPath });
    
    res.status(201).json({ id: session.id, session, contextPath });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to create session:', message);
    res.status(message.includes('already exists') ? 409 : 500).json({ error: message });
  }
});

// GET /api/sessions/:id - Get session details
// Response: Session
app.get('/api/sessions/:id', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    logger.info(`Retrieved session: ${req.params.id}`);
    res.json(session);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to get session:', message);
    res.status(500).json({ error: message });
  }
});

// PUT /api/sessions/:id/switch - Switch to session (make it active)
// Response: Session
app.put('/api/sessions/:id/switch', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const switched = sessionManager.switchSession(req.params.id);
    if (!switched) {
      res.status(500).json({ error: 'Failed to switch session' });
      return;
    }

    logger.info(`Switched to session: ${req.params.id}`);
    io.emit('session:switched', { id: req.params.id, session: switched });
    res.json(switched);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to switch session:', message);
    res.status(500).json({ error: message });
  }
});

// PUT /api/sessions/:id/pause - Pause session
// Response: { status: 'paused' }
app.put('/api/sessions/:id/pause', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status === 'paused') {
      res.status(400).json({ error: 'Session is already paused' });
      return;
    }

    sessionManager.pauseSession(req.params.id);
    logger.info(`Paused session: ${req.params.id}`);
    io.emit('session:status-changed', { id: req.params.id, status: 'paused' });
    
    res.json({ status: 'paused' });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to pause session:', message);
    res.status(500).json({ error: message });
  }
});

// PUT /api/sessions/:id/resume - Resume session
// Response: { status: 'active' }
app.put('/api/sessions/:id/resume', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.status !== 'paused') {
      res.status(400).json({ error: 'Session is not paused' });
      return;
    }

    sessionManager.resumeSession(req.params.id);
    logger.info(`Resumed session: ${req.params.id}`);
    io.emit('session:status-changed', { id: req.params.id, status: 'active' });
    
    res.json({ status: 'active' });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to resume session:', message);
    res.status(500).json({ error: message });
  }
});

// DELETE /api/sessions/:id - Permanently delete session
// Response: { deleted: true }
app.delete('/api/sessions/:id', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    sessionManager.deleteSession(req.params.id);
    logger.info(`Deleted session: ${req.params.id}`);
    (io as any).emit('session:deleted', { id: req.params.id, session });
    
    res.json({ deleted: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to delete session:', message);
    res.status(500).json({ error: message });
  }
});

// PUT /api/sessions/:id/status - Update session status
// Body: { status: 'idle'|'thinking'|'active'|'paused' }
// Response: Session
app.put('/api/sessions/:id/status', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    const validStatuses = ['idle', 'thinking', 'active', 'paused'];
    
    if (!validStatuses.includes(status)) {
      res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
      return;
    }

    sessionManager.updateSessionStatus(req.params.id, status as any);
    const updatedSession = sessionManager.getSession(req.params.id);
    
    logger.info(`Updated session status: ${req.params.id} → ${status}`);
    io.emit('session:status-changed', { id: req.params.id, status });
    
    res.json(updatedSession);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to update session status:', message);
    res.status(500).json({ error: message });
  }
});

// POST /api/sessions/:id/message - Send message to session
// Body: { message: string, broadcast?: boolean }
// Response: { sent: true }
app.post('/api/sessions/:id/message', (req, res) => {
  try {
    const toSessionId = req.params.id;
    const session = sessionManager.getSession(toSessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const message = typeof req.body?.message === 'string' ? req.body.message : '';
    const broadcast = req.body?.broadcast === true;

    if (!message.trim()) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    // Get the first active session as sender if not broadcast
    const fromSession = !broadcast 
      ? sessionManager.listSessions().find(s => s.status === 'active')
      : null;
    
    const fromSessionId = fromSession?.id || 'system';
    
    // Save message using the messaging service
    sessionMessaging.sendMessage(fromSessionId, toSessionId, message.trim());

    logger.info(`Message sent to session ${toSessionId}: "${message.substring(0, 50)}..."`);
    io.emit('session:message', { 
      from: fromSessionId, 
      to: toSessionId, 
      message: message.trim() 
    });
    
    res.json({ sent: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to send message:', message);
    res.status(500).json({ error: message });
  }
});

// GET /api/sessions/:id/messages - Retrieve messages for a session
// Query: limit (optional, default 50)
// Response: { messages: SessionMessage[] }
app.get('/api/sessions/:id/messages', (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 200);
    const messages = sessionMessaging.getMessages(sessionId, limit);

    res.json({ messages });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to retrieve messages:', message);
    res.status(500).json({ error: message });
  }
});

// POST /api/sessions/:id/share-context - Share context with another session
// Body: { toSessionId: string, context: Record<string, unknown>, contextType?: 'objective' | 'summary' | 'metadata' | 'custom' }
// Response: { shared: true }
app.post('/api/sessions/:id/share-context', (req, res) => {
  try {
    const fromSessionId = req.params.id;
    const toSessionId = req.body?.toSessionId;
    const context = req.body?.context;
    const contextType = req.body?.contextType || 'custom';

    const fromSession = sessionManager.getSession(fromSessionId);
    const toSession = sessionManager.getSession(toSessionId);

    if (!fromSession) {
      res.status(404).json({ error: 'Source session not found' });
      return;
    }

    if (!toSession) {
      res.status(404).json({ error: 'Target session not found' });
      return;
    }

    if (!context || typeof context !== 'object') {
      res.status(400).json({ error: 'context is required and must be an object' });
      return;
    }

    if (!['objective', 'summary', 'metadata', 'custom'].includes(contextType)) {
      res.status(400).json({ error: 'Invalid contextType' });
      return;
    }

    // Share context using the messaging service
    sessionMessaging.shareContext(
      fromSessionId,
      toSessionId,
      context as Record<string, unknown>,
      contextType as 'objective' | 'summary' | 'metadata' | 'custom'
    );

    logger.info(`Context shared from session ${fromSessionId} to ${toSessionId} (type: ${contextType})`);
    io.emit('session:context-shared', {
      from: fromSessionId,
      to: toSessionId,
      contextType,
      context
    });

    res.json({ shared: true });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to share context:', message);
    res.status(500).json({ error: message });
  }
});

if (existsSync(FRONTEND_DIST_PATH)) {
  app.use(express.static(FRONTEND_DIST_PATH));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }

    res.sendFile(path.join(FRONTEND_DIST_PATH, 'index.html'));
  });
}

type CopilotPromptJob = {
  socket: any;
  prompt: string;
  sessionId?: string;
};

const copilotPromptQueue: CopilotPromptJob[] = [];
let copilotPromptWorkerRunning = false;
const AGENT_HEARTBEAT_MS = 12000;

function startAgentHeartbeat(socket: any, provider: 'copilot' | 'claude' | 'codex') {
  const interval = setInterval(() => {
    (socket as any).emit('agent:status', {
      provider,
      phase: 'heartbeat',
      detail: 'still working',
    });
  }, AGENT_HEARTBEAT_MS);

  return () => clearInterval(interval);
}

async function processCopilotPromptJob(job: CopilotPromptJob): Promise<void> {
  const { socket, prompt, sessionId: sid } = job;
  logger.copilot(`Starting queued prompt. session=${sid || 'none'} prompt="${prompt.slice(0, 120)}" queueRemaining=${copilotPromptQueue.length}`);
  socket.emit('agent:status', { provider: 'copilot', phase: 'start', detail: prompt.slice(0, 80) });
  let chunkCount = 0;
  const session = sid ? sessionManager.getSession(sid) : null;
  const effectivePrompt = session ? buildProviderPrompt(session, 'copilot', prompt) : prompt;
  const stopHeartbeat = startAgentHeartbeat(socket, 'copilot');
  try {
    if (session) ensureSessionContext(session);
    const response = await copilotService.execute(
      { prompt: effectivePrompt, workingDirectory: session?.repoPath || process.cwd(), sessionId: session?.id } as any,
      (chunk, type) => {
        chunkCount++;
        logger.copilot(`Chunk ${chunkCount} (${type}) ${chunk.length} chars`);
        socket.emit('agent:status', { provider: 'copilot', phase: 'chunk', detail: `${chunk.length} chars` });
        socket.emit('command:chunk', { chunk });
      }
    );
    if (response.aborted) {
      logger.copilot(`Aborted prompt. chunks=${chunkCount}`);
      socket.emit('agent:status', { provider: 'copilot', phase: 'aborted', detail: 'user interrupted' });
      socket.emit('command:response', {
        result: response.output.trim() || '(interrupted)',
        sessionId: session?.id || response.sessionId,
        aborted: true,
        suppressSpeech: true,
      });
      return;
    }
    if (session) {
      appendSessionProgress(session, 'copilot', prompt, response.output);
    }
    logger.copilot(`Completed prompt. chunks=${chunkCount} outputLength=${response.output.length}`);
    socket.emit('agent:status', { provider: 'copilot', phase: 'complete', detail: `${response.output.length} chars` });
    const resultText = response.output.trim() || (response.error ? `Copilot error: ${response.error}` : '(no output)');
    socket.emit('command:response', {
      result: resultText,
      sessionId: session?.id || response.sessionId,
    });
  } catch (err: any) {
    logger.error('Copilot prompt failed:', err.message);
    socket.emit('agent:status', { provider: 'copilot', phase: 'error', detail: err.message });
    socket.emit('command:response', { result: `Error: ${err.message}` });
  } finally {
    stopHeartbeat();
  }
}

async function drainCopilotPromptQueue(): Promise<void> {
  if (copilotPromptWorkerRunning) return;
  copilotPromptWorkerRunning = true;
  try {
    while (copilotPromptQueue.length > 0) {
      const job = copilotPromptQueue.shift();
      if (job) await processCopilotPromptJob(job);
    }
  } finally {
    copilotPromptWorkerRunning = false;
  }
}

io.on('connection', (socket) => {
  logger.success(`Client connected: ${socket.id}`);

  socket.emit('connection:status', 'connected');
  socket.emit('memory:results', db.getRecentMemories());
  socket.emit('plan:update', db.getLatestProjectPlan());

  socket.on('voice:command', (command: VoiceCommand) => {
    logger.info(`Voice command received: "${command.transcript}" (confidence: ${command.confidence})`);
  });

  socket.on('voice:routing', (data: { transcript: string; confidence: number; timestamp: number; sessionId?: string; routing?: any }) => {
    logger.info(`Voice routing received: "${data.transcript}" → ${data.sessionId || 'broadcast'}`);
    if (data.routing) {
      logger.info(`  - Targets: ${data.routing.targetSessions?.join(', ') || 'all'}`);
      logger.info(`  - Command: ${data.routing.command}`);
      logger.info(`  - Broadcast: ${data.routing.broadcast}`);
    }
  });

  socket.on('copilot:execute', async (command: CopilotCommand) => {
    logger.copilot(`Executing command: "${command.prompt}"`);

    if (copilotService.isRunning()) {
      socket.emit('copilot:error', 'Another command is already running. Abort it before starting a new one.');
      return;
    }

    const startedAt = Date.now();
    const activePlan = createExecutionPlan(command, startedAt);
    db.saveProjectPlan(activePlan);
    io.emit('plan:update', activePlan);

    try {
      const response = await copilotService.execute(command, (chunk, type) => {
        socket.emit('copilot:output', { chunk, type });
      });

      const finalizedPlan = completeExecutionPlan(activePlan, response, Date.now());
      db.saveProjectPlan(finalizedPlan);
      io.emit('plan:update', finalizedPlan);

      if (response.success) {
        logger.success('Command completed successfully');
      } else {
        logger.error('Command failed:', response.error);
      }

      socket.emit('copilot:complete', response);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      const failedPlan = completeExecutionPlan(activePlan, {
        success: false,
        output: '',
        error: message,
        exitCode: 1
      }, Date.now());

      db.saveProjectPlan(failedPlan);
      io.emit('plan:update', failedPlan);
      logger.error('Copilot execution error:', message);
      socket.emit('copilot:error', message);
    }
  });

  socket.on('copilot:abort', () => {
    const aborted = copilotService.abort();
    if (aborted) {
      logger.warning('Command aborted by user');
      (socket as any).emit('agent:status', { provider: 'copilot', phase: 'aborted', detail: 'user interrupted' });
    }
  });

  socket.on('conversation:save', (conversation: Conversation) => {
    try {
      db.saveConversation(conversation);
      logger.success(`Conversation saved: ${conversation.id}`);
      socket.emit('memory:results', db.getRecentMemories());
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to save conversation:', message);
      socket.emit('copilot:error', message);
    }
  });

  socket.on('conversation:load', (id: string) => {
    try {
      const conversation = db.getConversation(id);
      if (conversation) {
        logger.info(`Conversation loaded: ${id}`);
        socket.emit('conversation:loaded', conversation);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to load conversation:', message);
      socket.emit('copilot:error', message);
    }
  });

  socket.on('memory:search', (query: string) => {
    try {
      const memories = query.trim()
        ? db.searchMemories(query)
        : db.getRecentMemories();

      logger.info(`Memory search: "${query}" - found ${memories.length} results`);
      socket.emit('memory:results', memories);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Memory search failed:', message);
      socket.emit('copilot:error', message);
    }
  });

  // Socket.IO session management event handlers
  
  // Client emits session:list-request
  socket.on('session:list-request', () => {
    try {
      const sessions = sessionManager.getRestorableSessions();
      const current = sessionManager.getPreferredRestoreSession()?.id;
      logger.info(`Session list requested - ${sessions.length} active sessions`);
      socket.emit('session:list', { sessions, current });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to list sessions:', message);
      socket.emit('copilot:error', message);
    }
  });

  // Client emits session:create
  socket.on('session:create', (data: { name: string; repo_path: string; objective?: string; branch?: string; session_id?: string }) => {
    try {
      const name = typeof data?.name === 'string' ? data.name : '';
      const repo_path = typeof data?.repo_path === 'string' ? data.repo_path : '';
      const branch = typeof data?.branch === 'string' ? data.branch : undefined;
      const objective = typeof data?.objective === 'string' ? data.objective : undefined;
      const sessionId = typeof data?.session_id === 'string' ? data.session_id.trim() : '';

      if (!name.trim() || !repo_path.trim()) {
        socket.emit('copilot:error', 'name and repo_path are required');
        return;
      }

      const session = sessionManager.createSession(name, repo_path, branch, sessionId || undefined, objective);

      logger.info(`Session created via Socket.IO: ${session.id}`);
      io.emit('session:created', { id: session.id, session });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to create session:', message);
      socket.emit('copilot:error', message);
    }
  });

  // Client emits session:switch
  socket.on('session:switch', (data: { id: string }) => {
    try {
      const sessionId = typeof data?.id === 'string' ? data.id : '';
      const session = sessionManager.getSession(sessionId);
      
      if (!session) {
        socket.emit('copilot:error', 'Session not found');
        return;
      }

      const switched = sessionManager.switchSession(sessionId);
      if (!switched) {
        socket.emit('copilot:error', 'Failed to switch session');
        return;
      }
      logger.info(`Session switched via Socket.IO: ${sessionId}`);
      io.emit('session:switched', { id: sessionId, session: switched });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to switch session:', message);
      socket.emit('copilot:error', message);
    }
  });

  // Client emits session:pause
  socket.on('session:pause', (data: { id: string }) => {
    try {
      const sessionId = typeof data?.id === 'string' ? data.id : '';
      const session = sessionManager.getSession(sessionId);
      
      if (!session) {
        socket.emit('copilot:error', 'Session not found');
        return;
      }

      if (session.status === 'paused') {
        socket.emit('copilot:error', 'Session is already paused');
        return;
      }

      sessionManager.pauseSession(sessionId);
      logger.info(`Session paused via Socket.IO: ${sessionId}`);
      io.emit('session:status-changed', { id: sessionId, status: 'paused' });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to pause session:', message);
      socket.emit('copilot:error', message);
    }
  });

  // Client emits session:resume
  socket.on('session:resume', (data: { id: string }) => {
    try {
      const sessionId = typeof data?.id === 'string' ? data.id : '';
      const session = sessionManager.getSession(sessionId);
      
      if (!session) {
        socket.emit('copilot:error', 'Session not found');
        return;
      }

      if (session.status !== 'paused') {
        socket.emit('copilot:error', 'Session is not paused');
        return;
      }

      sessionManager.resumeSession(sessionId);
      logger.info(`Session resumed via Socket.IO: ${sessionId}`);
      io.emit('session:status-changed', { id: sessionId, status: 'active' });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to resume session:', message);
      socket.emit('copilot:error', message);
    }
  });

  // Client emits session:close
  socket.on('session:close', (data: { id: string }) => {
    try {
      const sessionId = typeof data?.id === 'string' ? data.id : '';
      const session = sessionManager.getSession(sessionId);
      
      if (!session) {
        socket.emit('copilot:error', 'Session not found');
        return;
      }

      sessionManager.closeSession(sessionId);
      logger.info(`Session closed via Socket.IO: ${sessionId}`);
      io.emit('session:updated', { id: sessionId, session });
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      logger.error('Failed to close session:', message);
      socket.emit('copilot:error', message);
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    logger.warning(`Client disconnected: ${socket.id}`);
  });

  // ── Simple prompt handler (used by AppClean.tsx) ────────────────────────
  (socket as any).on('copilot:prompt', async ({ prompt, sessionId: sid }: { prompt: string; sessionId?: string }) => {
    logger.copilot(`Prompt received. session=${sid || 'none'} prompt="${prompt.slice(0, 120)}"`);
    copilotPromptQueue.push({ socket, prompt, sessionId: sid });
    if (copilotPromptWorkerRunning || copilotService.isRunning()) {
      logger.copilot(`Prompt queued. pending=${copilotPromptQueue.length}`);
      (socket as any).emit('agent:status', {
        provider: 'copilot',
        phase: 'queued',
        detail: `${copilotPromptQueue.length} pending`,
      });
    }
    void drainCopilotPromptQueue();
  });

  // ── DB / session commands (used by AppClean.tsx) ─────────────────────────
  (socket as any).on('db:command', (data: { type: string; name?: string }) => {
    try {
      switch (data.type) {
        case 'status': {
          const sid = copilotService.getMasterSessionId();
          (socket as any).emit('command:response', {
            result: `Session: ${sid || 'none (will create on next prompt)'}\nFile: .github/LEXOIRE_SESSION.md`,
          });
          break;
        }
        case 'new_session': {
          copilotService.newSession();
          (socket as any).emit('command:response', { result: 'Session cleared. Next prompt starts a fresh session.' });
          break;
        }
        case 'list_sessions': {
          const sid = copilotService.getMasterSessionId();
          (socket as any).emit('command:response', {
            result: `Master session: ${sid || 'none'}\nTracked in: .github/LEXOIRE_SESSION.md`,
          });
          break;
        }
        default:
          (socket as any).emit('command:response', { result: `Unknown command: ${data.type}` });
      }
    } catch (err: any) {
      (socket as any).emit('command:response', { result: `DB error: ${err.message}` });
    }
  });

  // ── New Copilot session ───────────────────────────────────────────────────
  (socket as any).on('copilot:new-session', () => {
    copilotService.newSession();
    (socket as any).emit('command:response', { result: 'New session started. Previous session ID cleared.' });
  });

  // ── Claude prompt handler ────────────────────────────────────────────────
  (socket as any).on('claude:prompt', async ({ prompt, sessionId: sid }: { prompt: string; sessionId?: string }) => {
    const session = sid ? sessionManager.getSession(sid) : null;
    const agentSession = session?.id || sid || socket.id;
    const effectivePrompt = session ? buildProviderPrompt(session, 'claude', prompt) : prompt;
    console.log('[SOCKET] claude:prompt received:', prompt.slice(0, 100));
    if (claudeService.isRunning()) {
      (socket as any).emit('claude:response', {
        status: 'busy',
        result: 'Claude is already processing. Try again when the current run finishes.',
        suppressSpeech: true,
      });
      return;
    }
    let stopHeartbeat: (() => void) | null = null;
    try {
      (socket as any).emit('agent:status', { provider: 'claude', phase: 'start', detail: prompt.slice(0, 80) });
      stopHeartbeat = startAgentHeartbeat(socket, 'claude');
      if (session) ensureSessionContext(session);
      const response = await claudeService.prompt(effectivePrompt, agentSession, (chunk) => {
        (socket as any).emit('agent:status', { provider: 'claude', phase: 'chunk', detail: `${chunk.length} chars` });
        (socket as any).emit('claude:chunk', { chunk });
      });
      if (response.aborted) {
        (socket as any).emit('agent:status', { provider: 'claude', phase: 'aborted', detail: 'user interrupted' });
        (socket as any).emit('claude:response', {
          result: response.text || '(interrupted)',
          sessionId: session?.id,
          aborted: true,
          suppressSpeech: true,
        });
        return;
      }
      if (session) appendSessionProgress(session, 'claude', prompt, response.text);
      (socket as any).emit('agent:status', { provider: 'claude', phase: 'complete', detail: `${response.text.length} chars` });
      (socket as any).emit('claude:response', { result: response.text || '(no output)', sessionId: session?.id });
    } catch (err: any) {
      console.error('[SOCKET] Claude error:', err.message);
      (socket as any).emit('agent:status', { provider: 'claude', phase: 'error', detail: err.message });
      (socket as any).emit('claude:response', { result: `Claude error: ${err.message}` });
    } finally {
      stopHeartbeat?.();
    }
  });

  (socket as any).on('claude:abort', () => {
    if (claudeService.abort()) {
      (socket as any).emit('agent:status', { provider: 'claude', phase: 'aborted', detail: 'user interrupted' });
    }
  });
  (socket as any).on('claude:new-session', ({ sessionId: sid }: { sessionId?: string }) => {
    claudeService.clearHistory(sid || socket.id);
    (socket as any).emit('claude:response', { result: 'Claude session cleared.' });
  });

  // ── Codex prompt handler ─────────────────────────────────────────────────
  (socket as any).on('codex:prompt', async ({ prompt, sessionId: sid }: { prompt: string; sessionId?: string }) => {
    const session = sid ? sessionManager.getSession(sid) : null;
    const agentSession = session?.id || sid || socket.id;
    const effectivePrompt = session ? buildProviderPrompt(session, 'codex', prompt) : prompt;
    console.log('[SOCKET] codex:prompt received:', prompt.slice(0, 100));
    if (codexService.isRunning()) {
      (socket as any).emit('codex:response', {
        status: 'busy',
        result: 'Codex is already processing. Try again when the current run finishes.',
        suppressSpeech: true,
      });
      return;
    }
    let stopHeartbeat: (() => void) | null = null;
    try {
      (socket as any).emit('agent:status', { provider: 'codex', phase: 'start', detail: prompt.slice(0, 80) });
      stopHeartbeat = startAgentHeartbeat(socket, 'codex');
      if (session) ensureSessionContext(session);
      const response = await codexService.prompt(effectivePrompt, agentSession, (chunk) => {
        (socket as any).emit('agent:status', { provider: 'codex', phase: 'chunk', detail: `${chunk.length} chars` });
        (socket as any).emit('codex:chunk', { chunk });
      });
      if (response.aborted) {
        (socket as any).emit('agent:status', { provider: 'codex', phase: 'aborted', detail: 'user interrupted' });
        (socket as any).emit('codex:response', {
          result: response.text || '(interrupted)',
          sessionId: session?.id,
          aborted: true,
          suppressSpeech: true,
        });
        return;
      }
      if (session) appendSessionProgress(session, 'codex', prompt, response.text);
      (socket as any).emit('agent:status', { provider: 'codex', phase: 'complete', detail: `${response.text.length} chars` });
      (socket as any).emit('codex:response', { result: response.text || '(no output)', sessionId: session?.id });
    } catch (err: any) {
      console.error('[SOCKET] Codex error:', err.message);
      (socket as any).emit('agent:status', { provider: 'codex', phase: 'error', detail: err.message });
      (socket as any).emit('codex:response', { result: `Codex error: ${err.message}` });
    } finally {
      stopHeartbeat?.();
    }
  });

  (socket as any).on('codex:abort', () => {
    if (codexService.abort()) {
      (socket as any).emit('agent:status', { provider: 'codex', phase: 'aborted', detail: 'user interrupted' });
    }
  });
  (socket as any).on('codex:new-session', ({ sessionId: sid }: { sessionId?: string }) => {
    codexService.clearHistory(sid || socket.id);
    (socket as any).emit('codex:response', { result: 'Codex session cleared.' });
  });

  // ── Context sharing: inject context from one agent into another ──────────
  (socket as any).on('context:share', ({ from, to, sessionId: sid }: { from: string; to: string; sessionId?: string }) => {
    const agentSession = sid || socket.id;
    const sources: Record<string, { summary: string }> = {
      copilot: { summary: `Copilot session: ${copilotService.getMasterSessionId() || 'none'}` },
      claude:  { summary: claudeService.getContextSummary(agentSession) },
      codex:   { summary: codexService.getContextSummary(agentSession) },
    };
    const ctx = sources[from]?.summary || '';
    (socket as any).emit('context:shared', { from, to, context: ctx });
  });
});

async function startServer() {
  const activePort = STRICT_PORT ? PORT : await findAvailablePort(PORT);

  httpServer.listen(activePort, '0.0.0.0', () => {
    logger.success(`LEXOIRE Backend running on port ${activePort}`);
    logger.info(`Database path: ${DB_PATH}`);
    logger.info(`Frontend origin: ${FRONTEND_ORIGIN}`);

    if (existsSync(FRONTEND_DIST_PATH)) {
      logger.info(`Serving frontend bundle from ${FRONTEND_DIST_PATH}`);
    } else {
      logger.warning('Frontend build not found. Run the root build to enable single-origin production mode.');
    }
  });

  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(
        STRICT_PORT
          ? `Unable to bind backend on required port ${PORT}.`
          : `Unable to bind backend after fallback attempts starting from port ${PORT}.`
      );
      process.exit(1);
    }

    logger.error('Server failed to start:', error.message);
    process.exit(1);
  });
}

function shutdown(exitCode: number) {
  logger.warning('Shutting down gracefully...');
  db.close();
  process.exit(exitCode);
}

void startServer().catch((error) => {
  logger.error('Server failed to start:', getErrorMessage(error));
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

process.on('uncaughtException', (error) => {
  if ((error as NodeJS.ErrnoException)?.code === 'EPIPE') {
    logger.warning('Ignoring broken stdout/stderr pipe.');
    return;
  }

  logger.error('Uncaught Exception:', error);
  shutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
