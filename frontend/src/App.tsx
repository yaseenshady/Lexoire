import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { VoiceOrb } from './components/VoiceOrb';
import { VoiceStatus } from './components/VoiceStatus';
import { ConversationPanel } from './components/ConversationPanel';
import { TerminalOutput } from './components/TerminalOutput';
import { StatusBar } from './components/StatusBar';
import { SettingsPanel } from './components/SettingsPanel';
import { MemoryPanel } from './components/MemoryPanel';
import { ProjectPlanViewer } from './components/ProjectPlanViewer';
import { NotificationManager } from './components/Notification';
import { ParticleBackground } from './components/ParticleBackground';
import { useVoiceRecognition } from './hooks/useVoiceRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { useSocket } from './hooks/useSocket';
import { useHotkey } from './hooks/useHotkey';
import { DEFAULT_APP_ENDPOINT, fetchAppState } from './services/api';
import type {
  Conversation,
  CopilotResponse,
  FrontendSettings,
  Memory,
  Message,
  ProjectPlan,
  RuntimeSummary
} from './types';
import './styles/index.css';

const STORAGE_KEYS = {
  settings: 'jarvis.frontend.settings',
  messages: 'jarvis.frontend.messages',
  view: 'jarvis.frontend.view',
  draft: 'jarvis.frontend.draft',
  conversationId: 'jarvis.frontend.conversationId',
  conversationCreatedAt: 'jarvis.frontend.conversationCreatedAt',
  sessionId: 'jarvis.frontend.copilotSessionId'
} as const;

const DEFAULT_SETTINGS: FrontendSettings = {
  voiceLang: 'en-US',
  voiceStyle: 'natural',
  speechRate: 0.92,
  speechPitch: 1.0,
  speechVolume: 1.0,
  autoSave: true,
  continuousListening: true,
  apiEndpoint: DEFAULT_APP_ENDPOINT,
  speakResponses: true
};

const QUICK_PROMPTS = [
  'Summarize the current repository status',
  'Explain how I can start this project locally',
  'List the key frontend files and what they do',
  'Give me a safe demo walkthrough for this app'
];

const readStoredValue = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const createId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

const buildCompletionMessage = (command: string, response: CopilotResponse) => {
  if (!response.success) {
    return `I hit an error while handling "${command}": ${response.error || 'Unknown error'}`;
  }

  const summary = response.output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return summary || 'Response ready.';
};

const buildConversationTitle = (messages: Message[]) => {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  return firstUserMessage ? truncateText(firstUserMessage.content, 72) : 'JARVIS session';
};

function App() {
  const [messages, setMessages] = useState<Message[]>(() => readStoredValue(STORAGE_KEYS.messages, []));
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [inputText, setInputText] = useState(() => readStoredValue(STORAGE_KEYS.draft, ''));
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState<'conversation' | 'memory' | 'plan'>(() =>
    readStoredValue(STORAGE_KEYS.view, 'conversation')
  );
  const [memories, setMemories] = useState<Memory[]>([]);
  const [projectPlan, setProjectPlan] = useState<ProjectPlan | null>(null);
  const [runtimeSummary, setRuntimeSummary] = useState<RuntimeSummary | null>(null);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; message: string; type?: 'info' | 'success' | 'error' | 'warning' }>
  >([]);
  const [settings, setSettings] = useState<FrontendSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readStoredValue<Partial<FrontendSettings>>(STORAGE_KEYS.settings, {})
  }));
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [copilotSessionId, setCopilotSessionId] = useState<string | null>(() =>
    readStoredValue<string | null>(STORAGE_KEYS.sessionId, null)
  );
  const [conversationId, setConversationId] = useState(() =>
    readStoredValue(STORAGE_KEYS.conversationId, createId('conversation'))
  );
  const [conversationCreatedAt, setConversationCreatedAt] = useState(() =>
    readStoredValue(STORAGE_KEYS.conversationCreatedAt, Date.now())
  );
  const connectionStateRef = useRef<string | null>(null);
  const hasHydratedRef = useRef(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');

  const {
    isListening,
    transcript,
    interimTranscript,
    confidence,
    hasSpokenText,
    isSilent,
    startListening,
    stopListening,
    resetTranscript,
    error: voiceError,
    isSupported
  } = useVoiceRecognition({
    continuous: settings.continuousListening,
    lang: settings.voiceLang,
    silenceTimeoutMs: 1400,
    onSilenceTranscript: (spokenCommand) => {
      void executeCommand(spokenCommand, {
        source: 'voice',
        acknowledgedSilence: true
      });
    }
  });

  const { socket, isConnected, connectionState, lastError, endpoint } = useSocket(settings.apiEndpoint);
  const { isSupported: canSpeak, isSpeaking, speak, stop } = useSpeechSynthesis({
    enabled: settings.speakResponses,
    lang: settings.voiceLang,
    voiceStyle: settings.voiceStyle,
    rate: settings.speechRate,
    pitch: settings.speechPitch,
    volume: settings.speechVolume,
    fallbackEndpoint: settings.apiEndpoint
  });

  const addNotification = useCallback((message: string, type?: 'info' | 'success' | 'error' | 'warning') => {
    setNotifications((prev) => {
      const alreadyVisible = prev.some((notification) => notification.message === message && notification.type === type);
      if (alreadyVisible) {
        return prev;
      }

      return [...prev.slice(-2), { id: createId('notif'), message, type }];
    });
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  const updateSetting = useCallback(<K extends keyof FrontendSettings>(key: K, value: FrontendSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const emptyStatePrompts = useMemo(() => QUICK_PROMPTS, []);

  const hydrateFromBackend = useCallback(async (allowConversationHydration: boolean) => {
    try {
      const appState = await fetchAppState(settings.apiEndpoint);

      setMemories(appState.memories);
      setProjectPlan(appState.activePlan);
      setRuntimeSummary(appState.runtime);

      if (allowConversationHydration && appState.conversations.length > 0) {
        const latestConversation = appState.conversations[0];

        setConversationId(latestConversation.id);
        setConversationCreatedAt(latestConversation.createdAt);
        setMessages((currentMessages) => (currentMessages.length === 0 ? latestConversation.messages : currentMessages));
      }
    } catch (error: unknown) {
      if (!hasHydratedRef.current) {
        addNotification('Backend state is unavailable until the JARVIS server starts.', 'warning');
      }

      setRuntimeSummary(null);
    } finally {
      hasHydratedRef.current = true;
    }
  }, [addNotification, settings.apiEndpoint]);

  useHotkey({
    key: ' ',
    ctrl: true,
    callback: () => {
      if (!isExecuting) {
        handleVoiceCommand();
      }
    }
  });

  useHotkey({
    key: ',',
    ctrl: true,
    callback: () => setShowSettings(true)
  });

  useHotkey({
    key: 'Escape',
    callback: () => {
      if (isExecuting) {
        handleAbort();
      }
      if (showSettings) {
        setShowSettings(false);
      }
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (settings.autoSave) {
      window.localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
      window.localStorage.setItem(STORAGE_KEYS.conversationId, JSON.stringify(conversationId));
      window.localStorage.setItem(STORAGE_KEYS.conversationCreatedAt, JSON.stringify(conversationCreatedAt));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.messages);
      window.localStorage.removeItem(STORAGE_KEYS.conversationId);
      window.localStorage.removeItem(STORAGE_KEYS.conversationCreatedAt);
    }
  }, [conversationCreatedAt, conversationId, messages, settings.autoSave]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.view, JSON.stringify(currentView));
  }, [currentView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(inputText));
  }, [inputText]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (copilotSessionId) {
      window.localStorage.setItem(STORAGE_KEYS.sessionId, JSON.stringify(copilotSessionId));
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.sessionId);
    }
  }, [copilotSessionId]);

  useEffect(() => {
    void hydrateFromBackend(messages.length === 0);
  }, [hydrateFromBackend]);

  useEffect(() => {
    if (isSpeaking) {
      setVoiceState('speaking');
    } else if (isExecuting) {
      setVoiceState('processing');
    } else if (isListening) {
      setVoiceState('listening');
    } else {
      setVoiceState('idle');
    }
  }, [isListening, isExecuting, isSpeaking]);

  useEffect(() => {
    if (!socket) return;

    const handleOutput = (data: { chunk: string; type: 'stdout' | 'stderr' }) => {
      setTerminalOutput((prev) => [...prev, data.chunk]);
    };

    const handleComplete = (response: CopilotResponse) => {
      setIsExecuting(false);

      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        content: buildCompletionMessage(lastCommand || 'latest command', response),
        timestamp: Date.now(),
        metadata: { success: response.success, exitCode: response.exitCode }
      };

      setMessages((prev) => [...prev, assistantMessage]);
      addNotification(
        response.success ? '✅ Response ready. Speaking now…' : '❌ Command failed. Check terminal output.',
        response.success ? 'success' : 'error'
      );

      if (response.sessionId) {
        setCopilotSessionId(response.sessionId);
      }

      void (async () => {
        await speak(assistantMessage.content);
      })();
      void hydrateFromBackend(false);
    };

    const handleError = (error: string) => {
      setIsExecuting(false);
      setTerminalOutput((prev) => [...prev, `Error: ${error}`]);
      addNotification(error, 'error');

      void (async () => {
        await speak(error);
      })();
    };

    const handleMemoryResults = (results: Memory[]) => {
      setMemories(results);
    };

    const handlePlanUpdate = (plan: ProjectPlan | null) => {
      setProjectPlan(plan);
    };

    const handleConversationLoaded = (conversation: Conversation) => {
      setConversationId(conversation.id);
      setConversationCreatedAt(conversation.createdAt);
      setMessages(conversation.messages);
      setCurrentView('conversation');
    };

    socket.on('copilot:output', handleOutput);
    socket.on('copilot:complete', handleComplete);
    socket.on('copilot:error', handleError);
    socket.on('memory:results', handleMemoryResults);
    socket.on('plan:update', handlePlanUpdate);
    socket.on('conversation:loaded', handleConversationLoaded);

    return () => {
      socket.off('copilot:output', handleOutput);
      socket.off('copilot:complete', handleComplete);
      socket.off('copilot:error', handleError);
      socket.off('memory:results', handleMemoryResults);
      socket.off('plan:update', handlePlanUpdate);
      socket.off('conversation:loaded', handleConversationLoaded);
    };
  }, [addNotification, hydrateFromBackend, lastCommand, socket, speak]);

  useEffect(() => {
    if (!settings.autoSave || !socket || !isConnected || messages.length === 0) {
      return;
    }

    const conversation: Conversation = {
      id: conversationId,
      title: buildConversationTitle(messages),
      messages,
      createdAt: conversationCreatedAt,
      updatedAt: Date.now()
    };

    socket.emit('conversation:save', conversation);
  }, [conversationCreatedAt, conversationId, isConnected, messages, settings.autoSave, socket]);

  useEffect(() => {
    if (!settings.speakResponses) {
      stop();
    }
  }, [settings.speakResponses, stop]);

  useEffect(() => {
    if (!settings.speakResponses || canSpeak) {
      return;
    }

    addNotification('Speech output is not supported in this browser.', 'warning');
  }, [addNotification, canSpeak, settings.speakResponses]);

  useEffect(() => {
    if (!voiceError) return;
    addNotification(voiceError, 'warning');
  }, [addNotification, voiceError]);

  useEffect(() => {
    const previousState = connectionStateRef.current;
    connectionStateRef.current = connectionState;

    if (!previousState || previousState === connectionState) {
      return;
    }

    if (connectionState === 'connected') {
      addNotification('Connected to JARVIS backend.', 'success');
      void hydrateFromBackend(messages.length === 0);
    }

    if (connectionState === 'reconnecting') {
      addNotification('Connection lost. Attempting to reconnect…', 'warning');
    }

    if (connectionState === 'error' || connectionState === 'disconnected') {
      addNotification(lastError || 'Backend unavailable. Start the local server to enable commands.', 'error');
    }
  }, [addNotification, connectionState, hydrateFromBackend, lastError, messages.length]);

  useEffect(() => {
    if (!runtimeSummary || runtimeSummary.copilotAvailable) {
      return;
    }

    addNotification(
      `The configured CLI command "${runtimeSummary.copilotCommand}" is not currently available on the backend.`,
      'warning'
    );
  }, [addNotification, runtimeSummary]);

  const handleVoiceCommand = () => {
    if (!isSupported) {
      addNotification('🎤 Voice recognition not supported.', 'warning');
      return;
    }

    if (!isConnected) {
      addNotification('🚫 Backend offline. Start the backend to enable voice.', 'warning');
      return;
    }

    if (isExecuting && !isListening) {
      addNotification('⏳ JARVIS is still processing. Try again in a moment.', 'warning');
      return;
    }

    if (isListening) {
      stopListening();
      const spokenCommand = transcript.trim();

      if (spokenCommand) {
        void executeCommand(spokenCommand, {
          source: 'voice',
          acknowledgedSilence: false
        });
      } else {
        addNotification('🔇 No speech detected. Try again or use text input.', 'warning');
      }

      return;
    }

    stop();
    resetTranscript();
    startListening();
    addNotification('🎤 Listening… speak your command.', 'info');
  };

  const executeCommand = async (
    command: string,
    options: { source?: 'voice' | 'text'; acknowledgedSilence?: boolean } = {}
  ) => {
    const trimmedCommand = command.trim();

    if (!trimmedCommand) {
      return;
    }

    if (isExecuting) {
      addNotification('JARVIS is already processing a command.', 'warning');
      return;
    }

    if (!socket || !isConnected) {
      addNotification('Backend is not connected. Start the backend to run commands.', 'error');
      return;
    }

    const userMessage: Message = {
      id: createId('msg'),
      role: 'user',
      content: trimmedCommand,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMessage]);
    setTerminalOutput([`$ ${trimmedCommand}`, '']);
    setIsExecuting(true);
    setLastCommand(trimmedCommand);
    setCurrentView('conversation');

    socket.emit('copilot:execute', {
      prompt: trimmedCommand,
      yolo: true,
      sessionId: copilotSessionId || undefined
    });

    resetTranscript();
    setInputText('');
    
    if (options.acknowledgedSilence) {
      addNotification('🔇 Silence detected. Sending your request…', 'success');
    } else if (options.source === 'voice') {
      addNotification('🎤 Voice command received. Processing…', 'info');
    } else {
      addNotification('📝 Command submitted. Processing…', 'info');
    }

    if (options.source === 'voice') {
      await speak(options.acknowledgedSilence ? 'Request sent. Waiting for reply.' : 'Waiting for reply.');
    }
  };

  const handleTextSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    executeCommand(inputText);
  };

  const handleAbort = () => {
    if (socket && isExecuting) {
      socket.emit('copilot:abort');
      setIsExecuting(false);
      addNotification('Command aborted.', 'warning');
    }
  };

  const handleMemorySearch = (query: string) => {
    if (!socket || !isConnected) {
      addNotification('Connect to the backend before searching memories.', 'warning');
      return;
    }

    socket.emit('memory:search', query);
  };

  const handlePromptSelection = (prompt: string) => {
    if (isConnected) {
      executeCommand(prompt);
      return;
    }

    setInputText(prompt);
    addNotification('Quick prompt copied into the input. Start the backend to run it.', 'info');
  };

  const handleClearConversation = () => {
    const nextConversationId = createId('conversation');
    const nextCreatedAt = Date.now();

    setMessages([]);
    setConversationId(nextConversationId);
    setConversationCreatedAt(nextCreatedAt);
    setCopilotSessionId(null);

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.messages);
      window.localStorage.removeItem(STORAGE_KEYS.conversationId);
      window.localStorage.removeItem(STORAGE_KEYS.conversationCreatedAt);
      window.localStorage.removeItem(STORAGE_KEYS.sessionId);
    }

    addNotification('Conversation history and Copilot session cleared for this browser.', 'info');
  };

  return (
    <div className="min-h-screen flex flex-col p-6 gap-6 relative">
      <ParticleBackground />
      <NotificationManager notifications={notifications} onRemove={removeNotification} />
      <SettingsPanel
        isOpen={showSettings}
        settings={settings}
        onChange={updateSetting}
        onClose={() => setShowSettings(false)}
      />

      <StatusBar
        isConnected={isConnected}
        isListening={isListening}
        connectionState={connectionState}
        endpoint={endpoint}
        runtime={runtimeSummary}
      />

      {!isConnected && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass border-2 border-orange-500/50 bg-gradient-to-r from-orange-500/10 to-orange-500/5 px-6 py-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <p className="font-semibold text-orange-200">Backend connection needed for the live demo</p>
            <p className="text-sm text-white/70 mt-1">
              Start the backend behind <span className="text-neon-cyan font-mono">{endpoint}</span> to enable voice commands, memories,
              project plans, and streamed terminal output.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={() => setShowSettings(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            className="self-start lg:self-auto px-4 py-2 rounded-lg border-2 border-orange-500/60 bg-orange-500/15 text-sm text-orange-200 font-medium hover:border-orange-400 hover:bg-orange-500/25 transition-all shadow-lg shadow-orange-500/20"
          >
            Review settings
          </motion.button>
        </motion.div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="glass-panel p-8 flex flex-col items-center border-2 border-neon-cyan/20"
          >
            <div className="flex items-center justify-between w-full mb-6 gap-4">
              <div>
                <h1 className="text-5xl font-bold neon-text tracking-tight">JARVIS</h1>
                <p className="text-sm text-white/60 mt-3 leading-relaxed">One control surface for the local voice + Copilot workflow.</p>
              </div>
              <motion.button
                onClick={() => setShowSettings(true)}
                whileHover={{ scale: 1.2, rotate: 90 }}
                whileTap={{ scale: 0.95 }}
                className="text-white/70 hover:text-neon-cyan transition-colors text-3xl flex-shrink-0"
                title="Settings (Ctrl+,)"
              >
                ⚙️
              </motion.button>
            </div>

            <VoiceOrb 
              state={voiceState}
              confidence={confidence}
              hasSpokenText={hasSpokenText}
              isSilent={isSilent}
              amplitude={0.5}
            />

            <div className="mt-6 w-full">
              <VoiceStatus
                state={voiceState}
                transcript={transcript}
                interimTranscript={interimTranscript}
                confidence={confidence}
                hasSpokenText={hasSpokenText}
              />
            </div>

            <div className="mt-8 w-full space-y-3">
              <motion.button
                onClick={handleVoiceCommand}
                disabled={!isSupported || !isConnected || (isExecuting && !isListening)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all border-2 ${
                  isListening
                    ? 'bg-red-500/20 border-red-500 text-red-300 shadow-lg shadow-red-500/40 hover:bg-red-500/30'
                    : 'bg-gradient-to-r from-neon-cyan/20 to-neon-purple/10 border-neon-cyan shadow-lg shadow-neon-cyan/40 hover:from-neon-cyan/30 hover:to-neon-purple/15'
                } disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none`}
              >
                {isListening ? '🛑 Stop Listening' : isExecuting ? '⏳ Processing Reply…' : '🎤 Start Voice Command'}
              </motion.button>

              {isExecuting && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={handleAbort}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-orange-500/20 to-orange-600/10 border-2 border-orange-500 text-orange-300 hover:from-orange-500/30 hover:to-orange-600/15 transition-all shadow-lg shadow-orange-500/30"
                >
                  ⏹️ Abort Execution
                </motion.button>
              )}
            </div>

            {(transcript || interimTranscript) && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 w-full glass-panel p-4 border-neon-cyan/20"
              >
                <p className="text-xs uppercase tracking-widest text-neon-cyan/70 mb-3 font-semibold">Transcript</p>
                <p className="text-white/85 whitespace-pre-wrap break-words leading-relaxed">
                  {transcript}
                  <span className="text-white/40 italic">{interimTranscript}</span>
                </p>
              </motion.div>
            )}

            <form onSubmit={handleTextSubmit} className="mt-6 w-full space-y-3">
              <motion.input
                type="text"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder={isConnected ? 'Type a command for the backend…' : 'Backend offline — type a command to queue your demo idea'}
                className="w-full px-4 py-3 rounded-lg bg-white/5 border-2 border-white/15 text-white placeholder-white/40 focus:outline-none focus:border-neon-cyan focus:bg-neon-cyan/5 transition-all"
                whileFocus={{ borderColor: 'rgb(0, 255, 255)' }}
              />
              <div className="grid grid-cols-2 gap-3">
                <motion.button
                  type="submit"
                  disabled={!inputText.trim() || !isConnected || isExecuting}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="py-3 rounded-lg bg-gradient-to-r from-neon-cyan/25 to-neon-cyan/10 border-2 border-neon-cyan/50 text-neon-cyan font-semibold hover:from-neon-cyan/35 hover:to-neon-cyan/20 hover:border-neon-cyan transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-neon-cyan/20"
                >
                  Run command
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleClearConversation}
                  disabled={messages.length === 0}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="py-3 rounded-lg border-2 border-white/20 text-white/80 font-semibold hover:text-white hover:border-white/40 hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Clear history
                </motion.button>
              </div>
            </form>

            <div className="mt-6 w-full">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3 font-semibold">Quick prompts</p>
              <div className="flex flex-wrap gap-2">
                {emptyStatePrompts.map((prompt, idx) => (
                  <motion.button
                    key={prompt}
                    type="button"
                    onClick={() => handlePromptSelection(prompt)}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-3 py-2 rounded-full text-xs border-2 border-neon-cyan/40 bg-neon-cyan/8 text-neon-cyan/90 hover:border-neon-cyan/70 hover:bg-neon-cyan/15 transition-all shadow-lg shadow-neon-cyan/10"
                  >
                    {prompt}
                  </motion.button>
                ))}
              </div>
            </div>

            {!isSupported && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 p-4 w-full bg-red-500/20 border-2 border-red-500/40 rounded-lg"
              >
                <p className="text-sm text-red-300">
                  Voice recognition is not supported in this browser. Use the text command box instead.
                </p>
              </motion.div>
            )}

            <div className="mt-6 text-xs text-white/50 text-center space-y-1 leading-relaxed">
              <p className="font-semibold text-white/60">Hotkeys: <span className="text-neon-cyan">Ctrl/Cmd+Space</span> (Voice) • <span className="text-neon-cyan">Ctrl/Cmd+,</span> (Settings) • <span className="text-neon-cyan">Esc</span> (Abort)</p>
              <p>
                {settings.autoSave
                  ? '✓ Conversation sync enabled — backend memories stay current.'
                  : '⚠ Conversation sync disabled — this session stays local-only.'}
              </p>
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-2 grid grid-rows-[minmax(0,1fr)_minmax(280px,0.9fr)] gap-6 min-h-0">
          <div className="min-h-0">
            <div className="flex gap-2 mb-4 flex-wrap">
              {['conversation', 'memory', 'plan'].map((view, idx) => (
                <motion.button
                  key={view}
                  onClick={() => setCurrentView(view as 'conversation' | 'memory' | 'plan')}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className={`px-4 py-2 rounded-lg font-bold text-sm transition-all border-2 ${
                    currentView === view
                      ? 'bg-gradient-to-r from-neon-cyan/30 to-neon-purple/10 border-neon-cyan shadow-lg shadow-neon-cyan/30'
                      : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10 hover:border-white/40'
                  }`}
                >
                  {view === 'conversation' && '💬 Conversation'}
                  {view === 'memory' && '🧠 Memories'}
                  {view === 'plan' && '📋 Project Plan'}
                </motion.button>
              ))}
            </div>

            <div className="h-[calc(100%-3.5rem)] min-h-[340px]">
              {currentView === 'conversation' && (
                <ConversationPanel
                  messages={messages}
                  isConnected={isConnected}
                  suggestedPrompts={emptyStatePrompts}
                  onSelectPrompt={handlePromptSelection}
                />
              )}
              {currentView === 'memory' && <MemoryPanel memories={memories} onSearch={handleMemorySearch} />}
              {currentView === 'plan' && <ProjectPlanViewer plan={projectPlan} />}
            </div>
          </div>

          <TerminalOutput
            output={terminalOutput}
            isRunning={isExecuting}
            lastCommand={lastCommand}
            connectionState={connectionState}
            onClear={() => setTerminalOutput([])}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
