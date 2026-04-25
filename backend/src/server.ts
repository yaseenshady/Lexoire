import express from 'express';
import { execFile, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createServer } from 'http';
import { createServer as createNetServer } from 'net';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import DatabaseService from './db/database';
import CopilotService from './copilot/copilot-service';
import AcademicPptService from './services/academic-ppt-service';
import SessionManager from './services/session-manager';
import logger from './services/logger';
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

const STARTED_AT = Date.now();
const DEFAULT_PORT = 5000;
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000';
const FRONTEND_DIST_PATH = path.resolve(__dirname, '../../frontend/dist');
const DEFAULT_SPEECH_RATE = 185;
const DEFAULT_SPEECH_PITCH = 100;
const DEFAULT_SPEECH_VOLUME = 100;
const FALLBACK_SPEECH_VOICE_BY_LOCALE: Record<string, string[]> = {
  'en-us': ['Flo (English (US))', 'Eddy (English (US))', 'Samantha', 'Allison', 'Ava', 'Alex'],
  'en-gb': ['Flo (English (UK))', 'Eddy (English (UK))', 'Daniel', 'Serena'],
  en: ['Flo (English (US))', 'Eddy (English (US))', 'Samantha', 'Allison', 'Ava', 'Alex', 'Daniel', 'Serena']
};

type InstalledVoice = {
  name: string;
  locale: string;
};

const PORT = Number.parseInt(process.env.PORT || `${DEFAULT_PORT}`, 10);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN?.trim() || DEFAULT_FRONTEND_ORIGIN;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../jarvis.db');

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

    callback(new Error(`Origin ${origin || 'unknown'} is not allowed by JARVIS`));
  }
}));
app.use(express.json());

const db = new DatabaseService(DB_PATH);
const copilotService = new CopilotService();
const sessionManager = new SessionManager(db);

function getInstalledVoices(): InstalledVoice[] {
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
    copilotCommand: copilotStatus.command,
    copilotAvailable: copilotStatus.available,
    copilotVersion: copilotStatus.version,
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

function createExecutionPlan(command: CopilotCommand, createdAt: number): ProjectPlan {
  const planId = `plan-${createdAt}`;
  const shortPrompt = truncateText(command.prompt.trim(), 72);

  return {
    id: planId,
    title: shortPrompt || 'JARVIS execution',
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

function speakWithSystemVoice(
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

  const voice = resolveSpeechVoice(lang, requestedVoice);
  const rate = clampSpeechRate(requestedRate);
  const volume = clampSpeechVolume(requestedVolume);
  const args = [
    ...(voice ? ['-v', voice] : []),
    '-r',
    `${rate}`,
    message
  ];

  return new Promise((resolve, reject) => {
    execFile('say', args, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
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

app.get('/api/app-state', (req, res) => {
  try {
    res.json(buildAppState());
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to build app state:', message);
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

app.get('/api/sessions', (req, res) => {
  try {
    const sessions = sessionManager.listSessions();
    logger.info(`Retrieved ${sessions.length} sessions`);
    res.json(sessions);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to get sessions:', message);
    res.status(500).json({ error: message });
  }
});

app.post('/api/sessions', (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name : '';
    const repoPath = typeof req.body?.repoPath === 'string' ? req.body.repoPath : '';
    const branch = typeof req.body?.branch === 'string' ? req.body.branch : undefined;

    if (!name.trim() || !repoPath.trim()) {
      res.status(400).json({ error: 'name and repoPath are required' });
      return;
    }

    const session = sessionManager.createSession(name, repoPath, branch);
    logger.info(`Created session: ${session.id}`);
    
    io.emit('session:created', session);
    res.status(201).json(session);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to create session:', message);
    res.status(500).json({ error: message });
  }
});

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

app.put('/api/sessions/:id', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    
    if (action === 'switch') {
      const switched = sessionManager.switchSession(req.params.id);
      if (switched) {
        logger.info(`Switched to session: ${req.params.id}`);
        io.emit('session:switched', switched);
        res.json(switched);
        return;
      }
    } else if (action === 'pause') {
      sessionManager.pauseSession(req.params.id);
      session.status = 'paused';
      session.updatedAt = Date.now();
      logger.info(`Paused session: ${req.params.id}`);
      io.emit('session:status-changed', { sessionId: req.params.id, status: 'paused' });
      res.json(session);
      return;
    } else if (action === 'resume') {
      sessionManager.resumeSession(req.params.id);
      session.status = 'active';
      session.updatedAt = Date.now();
      logger.info(`Resumed session: ${req.params.id}`);
      io.emit('session:status-changed', { sessionId: req.params.id, status: 'active' });
      res.json(session);
      return;
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to update session:', message);
    res.status(500).json({ error: message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  try {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    sessionManager.closeSession(req.params.id);
    logger.info(`Closed session: ${req.params.id}`);
    
    res.status(204).end();
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    logger.error('Failed to close session:', message);
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
      socket.emit('copilot:output', {
        chunk: '\n[Command aborted by user]\n',
        type: 'stderr'
      });
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

  // Session event handlers
  socket.on('disconnect', () => {
    logger.warning(`Client disconnected: ${socket.id}`);
  });
});

async function startServer() {
  const activePort = await findAvailablePort(PORT);

  httpServer.listen(activePort, () => {
    logger.success(`JARVIS Backend running on port ${activePort}`);
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
      logger.error(`Unable to bind backend after fallback attempts starting from port ${PORT}.`);
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
  logger.error('Uncaught Exception:', error);
  shutdown(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
