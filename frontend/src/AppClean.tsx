import { useState, useEffect, useRef, memo } from 'react';
import { io } from 'socket.io-client';
import RealisticSphere from './components/RealisticSphere';

const SILENCE_MS = 2000; // 2.0 seconds without new words triggers auto-send

type Agent = 'copilot' | 'claude' | 'codex';
type VoiceMode = 'hifi' | 'classic';
type VoiceCapabilities = {
  platform: string;
  nativeSpeechRecognition: boolean;
  nativeTtsFallback: boolean;
};
type VoiceBackendCapabilities = {
  backendSpeechRecognition: boolean;
  transcriptionModels?: string[];
};
interface Msg { id: number; role: 'user' | 'assistant'; text: string; agent?: Agent; createdAt: number; }
interface SavedConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
interface SavedConversation {
  id: string;
  title: string;
  messages: SavedConversationMessage[];
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}
interface WorkspaceSession {
  id: string;
  name: string;
  repoPath: string;
  status: 'idle' | 'thinking' | 'active' | 'paused' | 'completed';
  createdAt: number;
  updatedAt: number;
}
interface CommandResponsePayload {
  result?: string;
  sessionId?: string;
  status?: 'busy' | 'ok' | 'error';
  suppressSpeech?: boolean;
  cue?: 'bubble';
  aborted?: boolean;
}
interface SessionDraft {
  name: string;
  repoPath: string;
  branch: string;
  objective: string;
  agent: Agent;
  sessionId: string;
}

interface QueuedPrompt {
  id: number;
  prompt: string;
  agent: Agent;
  sessionId?: string;
  createdAt: number;
}

const AUDIO_INPUT_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
};
const SERVER_SPEECH_START_LEVEL = 0.05;
const SERVER_SPEECH_CONTINUE_LEVEL = 0.028;
const SERVER_SPEECH_SEGMENT_SILENCE_MS = 850;
const SERVER_SPEECH_MIN_RECORDING_MS = 350;
const SERVER_SPEECH_MAX_RECORDING_MS = 15000;

const ECHO_FILLER_WORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'for', 'from', 'get', 'got', 'had', 'has', 'have',
  'i', 'if', 'in', 'is', 'it', 'just', 'know', 'like', 'me', 'my', 'not', 'of', 'oh',
  'ok', 'okay', 'on', 'or', 'so', 'that', 'the', 'their', 'there', 'they', 'this',
  'to', 'uh', 'um', 'was', 'we', 'what', 'with', 'would', 'yeah', 'you', 'your',
]);

function BlinkCursor() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn(v => !v), 500); return () => clearInterval(t); }, []);
  return <span style={{ opacity: on ? 1 : 0, color: '#10ff50' }}>▌</span>;
}

function StandbyBlink() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn(v => !v), 1400); return () => clearInterval(t); }, []);
  return <span style={{ opacity: on ? 0.45 : 0.12, color: '#10ff50', transition: 'opacity 0.6s ease' }}>▌</span>;
}

function SpeakPulse() {
  const [p, setP] = useState(0);
  useEffect(() => { const t = setInterval(() => setP(v => (v + 1) % 3), 400); return () => clearInterval(t); }, []);
  return <span style={{ letterSpacing: 2 }}>{['·','·','·'].map((d, i) => <span key={i} style={{ opacity: i === p ? 1 : 0.2, color: '#7ad7ff', transition: 'opacity 0.2s' }}>{d}</span>)}</span>;
}

function ThinkingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => { const t = setInterval(() => setFrame(f => (f + 1) % 8), 120); return () => clearInterval(t); }, []);
  const bars = ['▁','▂','▃','▄','▅','▆','▇','▆'];
  return <span style={{ letterSpacing: 2, opacity: 0.7 }}>{bars.map((b, i) => <span key={i} style={{ opacity: i === frame ? 1 : 0.3 }}>{b}</span>)}</span>;
}

const Sphere = memo(({ listening, muted, audioLevel, audioFrequencies, speechVelocity }: { listening: boolean; muted: boolean; audioLevel: number; audioFrequencies?: Uint8Array; speechVelocity: number }) => (
  <RealisticSphere listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocity} />
));

function CountdownRing({ pct }: { pct: number }) {
  const r = 18; const c = 2 * Math.PI * r;
  return (
    <svg width={42} height={42} style={{ position: 'absolute', top: -3, left: -3, pointerEvents: 'none' }}>
      <circle cx={21} cy={21} r={r} fill="none" stroke="#10ff5022" strokeWidth={2} />
      <circle cx={21} cy={21} r={r} fill="none" stroke="#10ff50" strokeWidth={2}
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '21px 21px', transition: 'stroke-dashoffset 0.1s linear' }} />
    </svg>
  );
}

function renderMessageText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} style={{ fontWeight: 800 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 4, padding: '1px 4px' }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function stripSpeechMarkup(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[_#>*~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatStreamStatus(phase?: string, detail?: string) {
  const label = phase === 'start'
    ? 'Starting'
    : phase === 'chunk'
      ? 'Streaming'
      : phase === 'heartbeat'
        ? 'Working'
      : phase === 'complete'
        ? 'Finishing'
        : phase === 'error'
          ? 'Error'
          : 'Working';

  return detail ? `${label} · ${detail}` : label;
}

const AGENT_COLORS: Record<Agent, { border: string; bg: string; text: string; label: string }> = {
  copilot: { border: '#10ff4430', bg: 'linear-gradient(135deg, #0a1a0e 0%, #061008 100%)', text: '#a8e0b8', label: 'COPILOT' },
  claude:  { border: '#f5c842aa', bg: 'linear-gradient(135deg, #1a1400 0%, #100d00 100%)', text: '#f5e07a', label: 'CLAUDE'  },
  codex:   { border: '#4fa3ffaa', bg: 'linear-gradient(135deg, #001230 0%, #000c20 100%)', text: '#80c8ff', label: 'CODEX'   },
};

export default function App() {
  const [agent, setAgent] = useState<Agent>('copilot');
  const agentRef = useRef<Agent>('copilot');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'assistant', text: 'Lexoire online. Awaiting input.', agent: 'copilot', createdAt: Date.now() }]);
  const [interim, setInterim] = useState('');
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('hifi');
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [silencePct, setSilencePct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [queuedPromptCount, setQueuedPromptCount] = useState(0);
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [editingQueuedPromptId, setEditingQueuedPromptId] = useState<number | null>(null);
  const [editingQueuedPromptText, setEditingQueuedPromptText] = useState('');
  const [speechQueueCount, setSpeechQueueCount] = useState(0);
  const [activeStreamMsgId, setActiveStreamMsgId] = useState<number | null>(null);
  const [streamStatus, setStreamStatus] = useState<{ provider: Agent; phase: string; detail?: string } | null>(null);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [workspaceSessions, setWorkspaceSessions] = useState<WorkspaceSession[]>([]);
  const [activeWorkspaceSessionId, setActiveWorkspaceSessionId] = useState('');
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>({
    name: '',
    repoPath: '',
    branch: '',
    objective: '',
    agent: 'copilot',
    sessionId: '',
  });
  const [sessionNotice, setSessionNotice] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioFrequencies, setAudioFrequencies] = useState<Uint8Array | undefined>(undefined);
  const [warnDismissed, setWarnDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const selectedVoiceNameRef = useRef('');
  const [speechRate, setSpeechRate] = useState(0.92);
  const speechRateRef = useRef(0.92);

  const socketRef = useRef<any>(null);
  const busyRef = useRef(false);
  const listeningRef = useRef(false);
  const mutedRef = useRef(false);
  const voiceRepliesRef = useRef(true);
  const voiceModeRef = useRef<VoiceMode>('hifi');
  const micPermissionRef = useRef<'unknown' | 'granted' | 'denied'>('unknown');
  const micPermissionNoticeRef = useRef(false);
  const speechUnavailableNoticeRef = useRef(false);
  const draftRef = useRef('');
  const interimRef = useRef('');
  const silenceTimer = useRef<any>(null);
  const silenceTick = useRef<any>(null);
  const listeningRestartTimer = useRef<number | null>(null);
  const swiftStartTimeoutRef = useRef<number | null>(null);
  const responseTimer = useRef<any>(null);
  const responseTimerProviderRef = useRef<Agent>('copilot');
  const activeResponseAgentRef = useRef<Agent | null>(null);
  const promptQueueRef = useRef<QueuedPrompt[]>([]);
  const speechQueueRef = useRef<string[]>([]);
  const streamedResponseRef = useRef('');
  const activeStreamMsgIdRef = useRef<number | null>(null);
  const speechStreamBufferRef = useRef('');
  const hasSpeechStreamedRef = useRef(false);
  const speechActiveRef = useRef(false);
  const suppressCurrentResponseSpeechRef = useRef(false);
  const currentSpokenTextRef = useRef('');
  const recentSpokenTextRef = useRef<string[]>([]);
  // Timestamp (ms) until which transcripts should be checked for TTS echo even after speech ends
  const postSpeechEchoGuardRef = useRef<number>(0);
  const browserRecognitionRef = useRef<any>(null);
  const browserSpeechFinalRef = useRef('');
  const suppressRecognitionResumeRef = useRef(false);
  const conversationIdRef = useRef(`conv-${Date.now()}`);
  const conversationCreatedAtRef = useRef(Date.now());
  const conversationSaveTimerRef = useRef<number | null>(null);
  const queuedPromptDispatchTimerRef = useRef<number | null>(null);
  const interruptionCandidateRef = useRef<{ text: string; firstSeenAt: number; lastSeenAt: number; hits: number } | null>(null);
  const backendSpeechCapabilitiesRef = useRef<VoiceBackendCapabilities | null>(null);
  const backendSpeechCapabilitiesPromiseRef = useRef<Promise<VoiceBackendCapabilities> | null>(null);
  const serverSpeechModeRef = useRef(false);
  const serverSpeechMonitorRef = useRef<number | null>(null);
  const serverSpeechRecorderRef = useRef<MediaRecorder | null>(null);
  const serverSpeechChunksRef = useRef<Blob[]>([]);
  const serverSpeechSilenceStartedAtRef = useRef<number | null>(null);
  const serverSpeechCaptureStartedAtRef = useRef<number | null>(null);
  const serverSpeechDiscardSegmentRef = useRef(false);
  const serverSpeechSessionRef = useRef(0);
  const serverSpeechErrorNoticeRef = useRef(false);
  const serverSpeechMimeTypeRef = useRef('');
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const microphone = useRef<MediaStreamAudioSourceNode | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const animationId = useRef<number | null>(null);
  const lastFrequenciesRef = useRef<Uint8Array | null>(null);
  const audioLevelHistoryRef = useRef<number[]>([]);
  const audioLevelRef = useRef(0);
  const speechVelocityRef = useRef<number>(0);

  const logDebug = (message: string) => {
    console.log('[LEXOIRE]', message);
  };

  const clearComposer = () => {
    setDraft('');
    draftRef.current = '';
    setInterim('');
    interimRef.current = '';
    interruptionCandidateRef.current = null;
  };

  const syncQueuedPromptState = () => {
    setQueuedPrompts([...promptQueueRef.current]);
    setQueuedPromptCount(promptQueueRef.current.length);
  };

  const clearQueuedPromptEditor = () => {
    setEditingQueuedPromptId(null);
    setEditingQueuedPromptText('');
  };

  const clearQueuedPromptDispatchTimer = () => {
    if (queuedPromptDispatchTimerRef.current !== null) {
      window.clearTimeout(queuedPromptDispatchTimerRef.current);
      queuedPromptDispatchTimerRef.current = null;
    }
  };

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  useEffect(() => { agentRef.current = agent; }, [agent]);
  useEffect(() => { voiceRepliesRef.current = voiceReplies; }, [voiceReplies]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { micPermissionRef.current = micPermission; }, [micPermission]);
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, interim]);
  useEffect(() => {
    const persistedMessages = msgs.filter((msg) => msg.text.trim());
    if (persistedMessages.length === 0) {
      return;
    }
    if (conversationSaveTimerRef.current !== null) {
      window.clearTimeout(conversationSaveTimerRef.current);
    }
    conversationSaveTimerRef.current = window.setTimeout(() => {
      conversationSaveTimerRef.current = null;
      if (!socketRef.current?.connected) return;
      const firstUserMessage = persistedMessages.find((msg) => msg.role === 'user' && msg.text.trim());
      const title = (firstUserMessage?.text || `Lexoire session ${currentSessionId || 'new'}`)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 72) || 'Lexoire session';
      const conversation: SavedConversation = {
        id: conversationIdRef.current,
        title,
        projectId: activeWorkspaceSessionId || undefined,
        createdAt: conversationCreatedAtRef.current,
        updatedAt: Date.now(),
        messages: persistedMessages.map((msg) => ({
          id: `msg-${msg.id}`,
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.text,
          timestamp: msg.createdAt,
          metadata: msg.agent ? { agent: msg.agent } : undefined,
        })),
      };
      socketRef.current.emit('conversation:save', conversation);
    }, 700);
    return () => {
      if (conversationSaveTimerRef.current !== null) {
        window.clearTimeout(conversationSaveTimerRef.current);
        conversationSaveTimerRef.current = null;
      }
    };
  }, [msgs, currentSessionId, activeWorkspaceSessionId]);
  useEffect(() => {
    if (sessionDropdownOpen) {
      refreshWorkspaceSessions();
    }
  }, [sessionDropdownOpen]);
  useEffect(() => () => {
    if (listeningRestartTimer.current !== null) {
      window.clearTimeout(listeningRestartTimer.current);
    }
    if (conversationSaveTimerRef.current !== null) {
      window.clearTimeout(conversationSaveTimerRef.current);
    }
    if (queuedPromptDispatchTimerRef.current !== null) {
      window.clearTimeout(queuedPromptDispatchTimerRef.current);
    }
    if (serverSpeechMonitorRef.current !== null) {
      window.clearInterval(serverSpeechMonitorRef.current);
    }
    const activeRecorder = serverSpeechRecorderRef.current;
    if (activeRecorder && activeRecorder.state !== 'inactive') {
      try { activeRecorder.stop(); } catch {}
    }
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => { selectedVoiceNameRef.current = selectedVoiceName; }, [selectedVoiceName]);
  useEffect(() => { speechRateRef.current = speechRate; }, [speechRate]);

  const setActiveStreamingMessage = (id: number | null) => {
    activeStreamMsgIdRef.current = id;
    setActiveStreamMsgId(id);
  };
  // Load available speech voices
  useEffect(() => {
    const load = () => {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      if (voices.length > 0) setAvailableVoices(voices);
    };
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  // ── Audio Level Analysis with Adaptive Noise Filtering ─────────────────────
  useEffect(() => {
    const analyzeAudio = () => {
      if (!analyzerRef.current) {
        animationId.current = requestAnimationFrame(analyzeAudio);
        return;
      }
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      
      // Moderate noise gate: allow background noise but filter out silence
      const NOISE_THRESHOLD = 25; // Lower = more sensitive to speech over background noise
      const filteredArray = new Uint8Array(dataArray.length);
      for (let i = 0; i < dataArray.length; i++) {
        // Soft gate: gradual curve instead of hard cutoff
        if (dataArray[i] < NOISE_THRESHOLD) {
          filteredArray[i] = 0;
        } else {
          filteredArray[i] = Math.min(255, dataArray[i] * 1.1);
        }
      }
      
      // Aggressive exponential smoothing for buttery motion
      if (lastFrequenciesRef.current) {
        const SMOOTH = 0.85;
        for (let i = 0; i < filteredArray.length; i++) {
          filteredArray[i] = Math.round(filteredArray[i] * SMOOTH + lastFrequenciesRef.current[i] * (1 - SMOOTH));
        }
      }
      lastFrequenciesRef.current = new Uint8Array(filteredArray);
      
      const average = filteredArray.reduce((a, b) => a + b) / filteredArray.length;
      const level = Math.min(1.0, average / 150);
      audioLevelRef.current = level;
      setAudioLevel(level);
      setAudioFrequencies(filteredArray);
      
      // Track speech velocity (rate of change in audio level)
      // Detect slowdown/pauses as indicator of end of speech
      audioLevelHistoryRef.current.push(level);
      if (audioLevelHistoryRef.current.length > 30) {
        audioLevelHistoryRef.current.shift();
      }
      
      if (audioLevelHistoryRef.current.length >= 10) {
        const recent = audioLevelHistoryRef.current.slice(-5).reduce((a, b) => a + b) / 5;
        const previous = audioLevelHistoryRef.current.slice(-10, -5).reduce((a, b) => a + b) / 5;
        // Velocity = how fast audio is dropping
        speechVelocityRef.current = previous - recent;
      }
      
      animationId.current = requestAnimationFrame(analyzeAudio);
    };
    animationId.current = requestAnimationFrame(analyzeAudio);
    return () => { if (animationId.current) cancelAnimationFrame(animationId.current); };
  }, []);

  // ── Initialize Audio Context on First Speech Event ───────────────────────
  const initAudioContext = async () => {
    if (audioContextRef.current && analyzerRef.current && microphone.current) return;
    try {
      const stream = microphoneStreamRef.current ?? await navigator.mediaDevices.getUserMedia(AUDIO_INPUT_CONSTRAINTS);
      microphoneStreamRef.current = stream;
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      microphone.current = ctx.createMediaStreamSource(stream);
      const analyzer = ctx.createAnalyser();
      analyzer.fftSize = 256;
      analyzerRef.current = analyzer;
      microphone.current.connect(analyzer);
    } catch (err) {
      console.error('Audio context init failed:', err);
      const errorName = err instanceof DOMException ? err.name : '';
      if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
        micPermissionRef.current = 'denied';
        setMicPermission('denied');
        listeningRef.current = false;
        setListening(false);
        clearListeningRestartTimer();
        if (!micPermissionNoticeRef.current) {
          micPermissionNoticeRef.current = true;
          addMsg('assistant', '[ERROR] Microphone permission is blocked. Enable Microphone and Speech Recognition in System Settings > Privacy & Security, then restart Lexoire.');
        }
      }
    }
  };

  const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Recorded audio could not be encoded.'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(blob);
  });

  const resampleAudio = (samples: Float32Array, sourceRate: number, targetRate: number) => {
    if (sourceRate === targetRate) {
      return samples;
    }

    const outputLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
    const output = new Float32Array(outputLength);

    for (let index = 0; index < outputLength; index += 1) {
      const position = index * (sourceRate / targetRate);
      const leftIndex = Math.floor(position);
      const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
      const weight = position - leftIndex;
      output[index] = samples[leftIndex] * (1 - weight) + samples[rightIndex] * weight;
    }

    return output;
  };

  const encodePcm16Wav = (samples: Float32Array, sampleRate: number) => {
    const bytesPerSample = 2;
    const blockAlign = bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);
    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * bytesPerSample, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }

    return buffer;
  };

  const convertBlobToWav = async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      throw new Error('Audio context is unavailable for offline speech processing.');
    }

    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const mono = new Float32Array(decoded.length);
    const channelCount = decoded.numberOfChannels;

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const channelData = decoded.getChannelData(channelIndex);
      for (let sampleIndex = 0; sampleIndex < decoded.length; sampleIndex += 1) {
        mono[sampleIndex] += channelData[sampleIndex] / channelCount;
      }
    }

    const resampled = resampleAudio(mono, decoded.sampleRate, 16000);
    return new Blob([encodePcm16Wav(resampled, 16000)], { type: 'audio/wav' });
  };

  const pickServerSpeechMimeType = () => {
    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    if (typeof MediaRecorder.isTypeSupported !== 'function') {
      return preferredTypes[0];
    }

    return preferredTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
  };

  const clearServerSpeechMonitor = () => {
    if (serverSpeechMonitorRef.current !== null) {
      window.clearInterval(serverSpeechMonitorRef.current);
      serverSpeechMonitorRef.current = null;
    }
  };

  const stopServerSpeechRecognition = (discardCurrentSegment = true) => {
    clearServerSpeechMonitor();
    serverSpeechModeRef.current = false;
    serverSpeechSessionRef.current += 1;
    serverSpeechSilenceStartedAtRef.current = null;
    serverSpeechCaptureStartedAtRef.current = null;
    serverSpeechChunksRef.current = [];
    if (discardCurrentSegment) {
      serverSpeechDiscardSegmentRef.current = true;
    }

    const recorder = serverSpeechRecorderRef.current;
    serverSpeechRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
  };

  const fetchBackendSpeechCapabilities = async () => {
    if (backendSpeechCapabilitiesRef.current) {
      return backendSpeechCapabilitiesRef.current;
    }

    if (!backendSpeechCapabilitiesPromiseRef.current) {
      backendSpeechCapabilitiesPromiseRef.current = fetch('/api/voice-capabilities')
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Voice capability request failed (${response.status})`);
          }

          const payload = await response.json() as VoiceBackendCapabilities;
          backendSpeechCapabilitiesRef.current = payload;
          return payload;
        })
        .finally(() => {
          backendSpeechCapabilitiesPromiseRef.current = null;
        });
    }

    return backendSpeechCapabilitiesPromiseRef.current;
  };

  // ── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
    console.log('[SOCKET] Connecting to:', url);
    const sock = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = sock;
    const syncSessions = () => {
      refreshSessionStatus();
      refreshWorkspaceSessions();
    };
    
    sock.on('connect', () => {
      logDebug('socket connected');
      clearResponseTimer();
      syncSessions();
      if (!busyRef.current) setBusy(false);
    });
    
    sock.on('error', (err) => {
      console.error('[SOCKET] Connection error:', err);
      addMsg('assistant', `[ERROR] Socket connection failed: ${err}`);
    });
    
    sock.on('disconnect', (reason) => {
      logDebug(`socket disconnected: ${reason}`);
      clearResponseTimer();
      busyRef.current = false;
      setBusy(false);
      setActiveStreamingMessage(null);
      setStreamStatus(null);
      activeResponseAgentRef.current = null;
    });
    
    sock.on('connect_error', (err) => {
      console.error('[SOCKET] Connection error:', err);
      clearResponseTimer();
      setBusy(false);
      setActiveStreamingMessage(null);
      setStreamStatus(null);
      activeResponseAgentRef.current = null;
    });
    
    const speakStreamedWords = (chunk: string) => {
      if (!voiceRepliesRef.current || suppressCurrentResponseSpeechRef.current) return;
      speechStreamBufferRef.current += chunk;
      let buf = speechStreamBufferRef.current;
      let spokeSomething = false;

      // Drain ALL complete sentences from the buffer (not just the first one)
      let sentenceMatch: RegExpMatchArray | null;
      while ((sentenceMatch = buf.match(/^([\s\S]*?[.!?])(\s+|$)/))) {
        if (sentenceMatch[1].trim().split(/\s+/).length >= 2) {
          const toSpeak = stripSpeechMarkup(sentenceMatch[1]).trim();
          buf = buf.slice(sentenceMatch[0].length);
          if (toSpeak) { hasSpeechStreamedRef.current = true; _speak(toSpeak); spokeSomething = true; }
        } else {
          break; // Sentence too short — leave it in the buffer
        }
      }

      if (!spokeSomething) {
        // No complete sentences yet — try comma/colon pause with enough words
        const pauseMatch = buf.match(/^([\s\S]*?[,:])\s+/);
        if (pauseMatch && pauseMatch[1].trim().split(/\s+/).length >= 5) {
          const toSpeak = stripSpeechMarkup(pauseMatch[1]).trim();
          buf = buf.slice(pauseMatch[0].length);
          if (toSpeak) { hasSpeechStreamedRef.current = true; _speak(toSpeak); spokeSomething = true; }
        }

        // Or flush at word boundary when buffer is getting long (10+ words)
        if (!spokeSomething) {
          const words = buf.split(/\s+/);
          if (words.length > 10) {
            const lastSpace = buf.lastIndexOf(' ');
            if (lastSpace > 0) {
              const toSpeak = stripSpeechMarkup(buf.slice(0, lastSpace)).trim();
              buf = buf.slice(lastSpace + 1);
              if (toSpeak) { hasSpeechStreamedRef.current = true; _speak(toSpeak); }
            }
          }
        }
      }

      speechStreamBufferRef.current = buf;
    };

    const appendChunk = (provider: Agent, chunk: string) => {
      if (activeStreamMsgIdRef.current === null || activeResponseAgentRef.current !== provider) {
        return;
      }
      busyRef.current = true;
      setBusy(true);
      startResponseTimer(provider);
      streamedResponseRef.current += chunk;
      const activeMessageId = activeStreamMsgIdRef.current;
      const streamedChars = streamedResponseRef.current.length;
      setStreamStatus(prev => ({
        provider: prev?.provider ?? provider,
        phase: 'chunk',
        detail: `${streamedChars} chars`,
      }));
      setMsgs(prev => {
        if (activeMessageId === null) return prev;
        let found = false;
        const next = prev.map(msg => {
          if (msg.id !== activeMessageId) return msg;
          found = true;
          return { ...msg, text: msg.text + chunk };
        });
        if (found) {
          return next;
        }
        return prev;
      });
      speakStreamedWords(chunk);
    };

    const handleResponse = (data: CommandResponsePayload, ag?: Agent) => {
      const provider = ag ?? agentRef.current;
      if (activeResponseAgentRef.current && activeResponseAgentRef.current !== provider) {
        return;
      }
      logDebug(`${(ag || agentRef.current).toUpperCase()} response complete`);
      clearResponseTimer();
      if (data.sessionId) setCurrentSessionId(data.sessionId);
      const activeMessageId = activeStreamMsgIdRef.current;
      if (data.aborted) {
        busyRef.current = false;
        setBusy(false);
        streamedResponseRef.current = '';
        speechStreamBufferRef.current = '';
        hasSpeechStreamedRef.current = false;
        suppressCurrentResponseSpeechRef.current = false;
        setActiveStreamingMessage(null);
        setStreamStatus(null);
        activeResponseAgentRef.current = null;
        if (!speechActiveRef.current) scheduleListeningResume(120);
        processNextQueuedPrompt();
        return;
      }
      const responseSpeechSuppressed = suppressCurrentResponseSpeechRef.current || Boolean(data.suppressSpeech);

      // Flush any remaining streamed speech buffer
      const streamRemainder = stripSpeechMarkup(speechStreamBufferRef.current).trim();
      const usedStreamSpeech = hasSpeechStreamedRef.current;
      speechStreamBufferRef.current = '';
      hasSpeechStreamedRef.current = false;

      const fallbackText = data.result?.trim() || '';
      const safeFallback = fallbackText === '(no output)' ? '[No output from agent]' : fallbackText;
      const finalFallback = safeFallback;
      let spokenText = streamedResponseRef.current.trim() || finalFallback;
      setMsgs(prev => {
        const targetIndex = activeMessageId !== null
          ? prev.findIndex(msg => msg.id === activeMessageId)
          : prev.length - 1;
        const target = targetIndex >= 0 ? prev[targetIndex] : undefined;
        const finalText = target?.role === 'assistant'
          ? target.text.trim() || finalFallback
          : finalFallback;
        spokenText = finalText || spokenText;

        if (target?.role === 'assistant' && targetIndex >= 0) {
          if (!finalText) return prev.filter((_, index) => index !== targetIndex);
          const next = [...prev];
          next[targetIndex] = { ...target, text: finalText, agent: ag ?? target.agent };
          return next;
        }
        return finalText ? [...prev, { id: nextId.current++, role: 'assistant', text: finalText, agent: ag, createdAt: Date.now() }] : prev;
      });

      if (data.cue === 'bubble') {
        playBubbleCue();
      } else if (!responseSpeechSuppressed && (usedStreamSpeech || streamRemainder)) {
        // Already streaming TTS — just flush the last fragment
        if (streamRemainder) _speak(streamRemainder);
        else if (!speechActiveRef.current && speechQueueRef.current.length === 0) scheduleListeningResume();
      } else if (!responseSpeechSuppressed && spokenText) {
        _speak(spokenText);
      } else if (!speechActiveRef.current) {
        scheduleListeningResume();
      }

      busyRef.current = false;
      setBusy(false);
      streamedResponseRef.current = '';
      suppressCurrentResponseSpeechRef.current = false;
      setActiveStreamingMessage(null);
      setStreamStatus(null);
      activeResponseAgentRef.current = null;
      processNextQueuedPrompt();
    };

    sock.on('command:chunk', (data: any) => { if (data.chunk) appendChunk('copilot', data.chunk); });
    sock.on('command:response', (data: CommandResponsePayload) => handleResponse(data, 'copilot'));
    sock.on('claude:chunk',    (data: any) => { if (data.chunk) appendChunk('claude', data.chunk); });
    sock.on('claude:response', (data: CommandResponsePayload) => handleResponse(data, 'claude'));
    sock.on('codex:chunk',     (data: any) => { if (data.chunk) appendChunk('codex', data.chunk); });
    sock.on('codex:response',  (data: CommandResponsePayload) => handleResponse(data, 'codex'));
    sock.on('agent:status', (data: any) => {
      const providerKey = String(data?.provider || 'copilot').toLowerCase() as Agent;
      const provider = providerKey.toUpperCase();
      const phase = String(data?.phase || 'status');
      const detail = data?.detail ? ` ${data.detail}` : '';
      logDebug(`${provider} ${phase}${detail}`);
      if (phase === 'start' || phase === 'chunk' || phase === 'heartbeat' || phase === 'complete' || phase === 'error') {
        setStreamStatus({
          provider: providerKey,
          phase,
          detail: typeof data?.detail === 'string' ? data.detail : undefined,
        });
      }
      if (phase === 'start' || phase === 'chunk' || phase === 'heartbeat') {
        startResponseTimer(providerKey);
        busyRef.current = true;
        setBusy(true);
      }
    });

    sock.on('session:created', syncSessions);
    sock.on('session:deleted', syncSessions);
    sock.on('session:switched', syncSessions);
    sock.on('session:updated', syncSessions);
    sock.on('session:status-changed', syncSessions);
    
    return () => {
      sock.off('session:created', syncSessions);
      sock.off('session:deleted', syncSessions);
      sock.off('session:switched', syncSessions);
      sock.off('session:updated', syncSessions);
      sock.off('session:status-changed', syncSessions);
      sock.off('agent:status');
      sock.disconnect();
      clearSilenceTimer();
      clearResponseTimer();
      clearListeningRestartTimer();
    };
  }, []);

  // ── Speech recognition: browser first, native fallback when available ─────
  useEffect(() => {
    const lexoire = window.lexoire;
    lexoire?.onSpeech?.((ev: { type: string; text?: string }) => {
      console.log('[SPEECH]', ev.type, ev.text?.slice(0, 50));
      if (mutedRef.current && ev.type !== 'error') return;
      if (ev.type === 'ready') {
        console.log('[SPEECH] Listening started (Swift confirmed)');
        clearSwiftTimeout();
        listeningRef.current = true;
        setListening(true);
        initAudioContext();
      } else if (ev.type === 'interim' && ev.text) {
        const txt = ev.text.trim();
        if (!txt) return;
        if (speechActiveRef.current || speechQueueRef.current.length > 0) {
          return;
        }
        // Post-TTS echo guard: suppress interim echo from the app's own voice
        if (Date.now() < postSpeechEchoGuardRef.current && isLikelySpeechEcho(txt)) {
          return;
        }
        setInterim(txt);
        interimRef.current = txt;
        console.log('[SPEECH] Interim:', txt.slice(0, 30));
        startSilenceTimer();
      } else if (ev.type === 'final' && ev.text) {
        console.log('[SPEECH] Final event fired with:', ev.text);
        const txt = ev.text.trim();
        if (!txt) {
          console.log('[SPEECH] Final text empty, still triggering timer');
          return;
        }
        if (speechActiveRef.current || speechQueueRef.current.length > 0) {
          return;
        }
        // Post-TTS echo guard: discard if the mic picked up the app's own voice after it finished speaking
        if (Date.now() < postSpeechEchoGuardRef.current && isLikelySpeechEcho(txt)) {
          console.log('[SPEECH] Post-TTS echo suppressed (native):', txt.slice(0, 40));
          return;
        }
        const n = draftRef.current ? draftRef.current + ' ' + txt : txt;
        setDraft(n);
        draftRef.current = n;
        setInterim('');
        interimRef.current = '';
        console.log('[SPEECH] Updated draft to:', n.slice(0, 50));
        // Stop listening and start auto-send countdown
        stopListening();
        startSilenceTimer();
      } else if (ev.type === 'error') {
        clearSwiftTimeout();
        console.error('[SPEECH] Error:', ev.text);
        const errorText = ev.text || 'Speech recognition failed';
        const permissionDenied = /denied|notdetermined|restricted|permission|privacy/i.test(errorText);
        if (permissionDenied) {
          micPermissionRef.current = 'denied';
          setMicPermission('denied');
          listeningRef.current = false;
          setListening(false);
          clearListeningRestartTimer();
          if (!micPermissionNoticeRef.current) {
            micPermissionNoticeRef.current = true;
            addMsg('assistant', '[ERROR] Microphone or Speech Recognition permission is blocked. Enable both in System Settings > Privacy & Security, then restart Lexoire.');
          }
          return;
        }
        addMsg('assistant', `[ERROR] ${errorText}`);
        scheduleListeningResume(600);
      }
    });
    startListening();
    return () => { stopListening(); };
  }, []);

  const addMsg = (role: 'user' | 'assistant', text: string, ag?: Agent) => {
    setMsgs(prev => [...prev, { id: nextId.current++, role, text, agent: ag ?? agentRef.current, createdAt: Date.now() }]);
  };

  const normalizeComparableSpeech = (text: string) => text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const analyzeTranscriptAgainstSpeech = (text: string) => {
    const normalized = normalizeComparableSpeech(text);
    const transcriptWords = normalized.split(' ').filter(Boolean);
    const spokenWindow = [currentSpokenTextRef.current, ...recentSpokenTextRef.current]
      .filter(Boolean)
      .join(' ')
      .trim();
    const spokenWords = spokenWindow.split(' ').filter(Boolean);
    const spokenWordSet = new Set(spokenWords);
    const overlapCount = transcriptWords.filter((word) => spokenWordSet.has(word)).length;
    const overlap = transcriptWords.length > 0 ? overlapCount / transcriptWords.length : 0;
    const novelWords = transcriptWords.filter((word) => !spokenWordSet.has(word));
    const novelSignificantWords = novelWords.filter(
      (word) => word.length >= 3 && !ECHO_FILLER_WORDS.has(word),
    );

    return {
      normalized,
      transcriptWords,
      spokenWindow,
      spokenWords,
      overlap,
      novelWords,
      novelSignificantWords,
    };
  };

  const rememberSpokenText = (text: string) => {
    const normalized = normalizeComparableSpeech(text);
    if (!normalized) return;
    currentSpokenTextRef.current = normalized;
    recentSpokenTextRef.current = [...recentSpokenTextRef.current, normalized].slice(-12);
  };

  const resetSpokenTextMemory = () => {
    currentSpokenTextRef.current = '';
    recentSpokenTextRef.current = [];
  };

  const resetInterruptionCandidate = () => {
    interruptionCandidateRef.current = null;
  };

  const advanceInterruptionCandidate = (normalized: string) => {
    const now = Date.now();
    const current = interruptionCandidateRef.current;
    const overlapsCurrent = current
      ? normalized.startsWith(current.text) || current.text.startsWith(normalized)
      : false;

    if (!current || !overlapsCurrent) {
      interruptionCandidateRef.current = {
        text: normalized,
        firstSeenAt: now,
        lastSeenAt: now,
        hits: 1,
      };
      return interruptionCandidateRef.current;
    }

    interruptionCandidateRef.current = {
      text: normalized.length >= current.text.length ? normalized : current.text,
      firstSeenAt: current.firstSeenAt,
      lastSeenAt: now,
      hits: current.hits + 1,
    };
    return interruptionCandidateRef.current;
  };

  const isLikelySpeechEcho = (text: string) => {
    const {
      normalized,
      transcriptWords,
      spokenWindow,
      spokenWords,
      overlap,
      novelSignificantWords,
    } = analyzeTranscriptAgainstSpeech(text);
    if (!normalized) return false;

    if (!spokenWindow) return false;

    // Exact substring match
    if (spokenWindow.includes(normalized)) return true;

    // Single word: echo if that word appears in what was spoken
    if (transcriptWords.length === 1) {
      return spokenWords.includes(transcriptWords[0]);
    }

    if (novelSignificantWords.length === 0 && overlap >= 0.45) {
      return true;
    }

    // Lower threshold for short phrases (partial echo capture more likely)
    const threshold = transcriptWords.length <= 4 ? 0.5 : 0.68;
    return overlap >= threshold;
  };

  const interruptSpeechPlayback = (suppressCurrentResponseVoice = false) => {
    if (suppressCurrentResponseVoice) {
      suppressCurrentResponseSpeechRef.current = true;
    }
    resetInterruptionCandidate();
    speechQueueRef.current = [];
    setSpeechQueueCount(0);
    speechStreamBufferRef.current = '';
    hasSpeechStreamedRef.current = false;
    currentSpokenTextRef.current = '';
    speechActiveRef.current = false;
    setIsSpeaking(false);
    // Clear echo guard so mic restarts promptly after user barge-in
    postSpeechEchoGuardRef.current = 0;
    window.speechSynthesis?.cancel?.();
    window.lexoire?.stopSpeech?.();
  };

  const markActiveResponseStopped = (messageId: number | null, provider: Agent | null) => {
    if (messageId === null) return;
    setMsgs(prev => {
      const targetIndex = prev.findIndex(msg => msg.id === messageId);
      if (targetIndex < 0) return prev;
      const target = prev[targetIndex];
      const label = '[Stopped]';
      const nextText = target.text.trim();
      if (nextText.endsWith(label)) return prev;
      const updated = nextText ? `${nextText}\n\n${label}` : label;
      const next = [...prev];
      next[targetIndex] = { ...target, text: updated, agent: provider ?? target.agent };
      return next;
    });
  };

  const abortActiveResponse = () => {
    const provider = activeResponseAgentRef.current ?? streamStatus?.provider ?? agentRef.current;
    const activeMessageId = activeStreamMsgIdRef.current;
    if (!busyRef.current && activeMessageId === null) {
      return false;
    }
    markActiveResponseStopped(activeMessageId, provider);
    interruptSpeechPlayback(true);
    clearResponseTimer();
    busyRef.current = false;
    setBusy(false);
    streamedResponseRef.current = '';
    speechStreamBufferRef.current = '';
    hasSpeechStreamedRef.current = false;
    setActiveStreamingMessage(null);
    setStreamStatus(null);
    activeResponseAgentRef.current = null;
    socketRef.current?.emit(`${provider}:abort`);
    return true;
  };

  const confirmAbortActiveResponse = () => {
    return abortActiveResponse();
  };

  const shouldInterruptCurrentSpeech = (text: string, isFinal: boolean) => {
    if (!(speechActiveRef.current || speechQueueRef.current.length > 0 || isSpeaking)) {
      resetInterruptionCandidate();
      return false;
    }

    if (!isSpeechInterruptCommand(text)) {
      resetInterruptionCandidate();
      return false;
    }

    if (isLikelySpeechEcho(text)) {
      resetInterruptionCandidate();
      return false;
    }

    if (isFinal) {
      resetInterruptionCandidate();
      return true;
    }

    const normalized = normalizeComparableSpeech(text);
    if (normalized.length < 4 || audioLevelRef.current < 0.045) {
      return false;
    }

    const candidate = advanceInterruptionCandidate(normalized);
    const sustained = candidate.hits >= 2 && (candidate.lastSeenAt - candidate.firstSeenAt >= 120 || normalized.length >= 8);
    if (!sustained) {
      return false;
    }

    resetInterruptionCandidate();
    return true;
  };

  const shouldTreatAsBargeIn = (text: string, isFinal: boolean) => {
    if (!speechActiveRef.current) {
      resetInterruptionCandidate();
      return false;
    }

    const analysis = analyzeTranscriptAgainstSpeech(text);
    const { normalized, transcriptWords, overlap, novelWords, novelSignificantWords } = analysis;
    if (!normalized || isLikelySpeechEcho(normalized)) {
      resetInterruptionCandidate();
      return false;
    }

    const wordCount = transcriptWords.length;
    const hasEnoughTranscript = isFinal
      ? wordCount >= 1 || normalized.length >= 4
      : wordCount >= 2 || normalized.length >= 6;
    if (!hasEnoughTranscript) {
      if (isFinal) resetInterruptionCandidate();
      return false;
    }

    const hasEnoughNovelSpeech = novelSignificantWords.length >= 1
      || novelWords.join(' ').length >= 6;
    if (!hasEnoughNovelSpeech) {
      if (isFinal) resetInterruptionCandidate();
      return false;
    }

    if (overlap >= (isFinal ? 0.62 : 0.52)) {
      resetInterruptionCandidate();
      return false;
    }

    if (!isFinal) {
      if (audioLevelRef.current < 0.045) {
        return false;
      }
      const candidate = advanceInterruptionCandidate(normalized);
      const sustained = candidate.hits >= 2 && (candidate.lastSeenAt - candidate.firstSeenAt >= 90 || normalized.length >= 10);
      if (!sustained) {
        return false;
      }
    }

    resetInterruptionCandidate();
    interruptSpeechPlayback(true);
    return true;
  };

  const clearSilenceTimer = () => {
    clearTimeout(silenceTimer.current);
    clearInterval(silenceTick.current);
    setSilencePct(0);
  };

  const clearResponseTimer = () => {
    clearTimeout(responseTimer.current);
    responseTimer.current = null;
  };

  const startResponseTimer = (provider?: Agent) => {
    const timerProvider = provider ?? responseTimerProviderRef.current;
    responseTimerProviderRef.current = timerProvider;
    clearResponseTimer();
    responseTimer.current = window.setTimeout(() => {
      const timeoutProvider = responseTimerProviderRef.current;
      const activeMessageId = activeStreamMsgIdRef.current;
      if (activeMessageId === null && !busyRef.current) {
        responseTimer.current = null;
        return;
      }
      responseTimer.current = null;
      setStreamStatus({
        provider: timeoutProvider,
        phase: 'heartbeat',
        detail: streamedResponseRef.current.trim() ? 'still working' : 'waiting for output',
      });
      busyRef.current = true;
      setBusy(true);
      startResponseTimer(timeoutProvider);
    }, 45000);
  };

  const clearListeningRestartTimer = () => {
    if (listeningRestartTimer.current !== null) {
      window.clearTimeout(listeningRestartTimer.current);
      listeningRestartTimer.current = null;
    }
  };

  const stopListening = () => {
    clearSwiftTimeout();
    clearListeningRestartTimer();
    suppressRecognitionResumeRef.current = true;
    stopServerSpeechRecognition(true);
    if (browserRecognitionRef.current) {
      try { browserRecognitionRef.current.stop(); } catch {}
    }
    const lexoire = window.lexoire;
    lexoire?.stopSpeechRecognition?.();
    listeningRef.current = false;
    setListening(false);
  };

  const startBrowserSpeech = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || browserRecognitionRef.current) return false;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    browserSpeechFinalRef.current = '';

    recognition.onstart = () => {
      speechUnavailableNoticeRef.current = false;
      micPermissionRef.current = 'granted';
      setMicPermission('granted');
      listeningRef.current = true;
      setListening(true);
      initAudioContext();
    };

    recognition.onresult = (event: any) => {
      let interimText = '';
      let finalText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';
        if (event.results[index].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      const trimmedFinal = finalText.trim();
      const trimmedInterim = interimText.trim();

      if (trimmedFinal) {
        if (speechActiveRef.current || speechQueueRef.current.length > 0) {
          browserSpeechFinalRef.current = '';
          return;
        }
        // Post-TTS echo guard: discard transcript if it looks like the mic picked up the app's own voice
        if (Date.now() < postSpeechEchoGuardRef.current && isLikelySpeechEcho(trimmedFinal)) {
          console.log('[SPEECH] Post-TTS echo suppressed (browser):', trimmedFinal.slice(0, 40));
          return;
        }
        browserSpeechFinalRef.current = [browserSpeechFinalRef.current, trimmedFinal].filter(Boolean).join(' ');
        const nextDraft = draftRef.current ? `${draftRef.current} ${trimmedFinal}` : trimmedFinal;
        setDraft(nextDraft);
        draftRef.current = nextDraft;
        setInterim('');
        interimRef.current = '';
      } else if (trimmedInterim) {
        if (speechActiveRef.current || speechQueueRef.current.length > 0) {
          return;
        }
        // Post-TTS echo guard: suppress interim echo
        if (Date.now() < postSpeechEchoGuardRef.current && isLikelySpeechEcho(trimmedInterim)) {
          return;
        }
        setInterim(trimmedInterim);
        interimRef.current = trimmedInterim;
      }
      if (trimmedFinal || trimmedInterim) startSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      const error = String(event?.error || 'speech recognition failed');
      if (browserRecognitionRef.current === recognition) {
        browserRecognitionRef.current = null;
      }
      listeningRef.current = false;
      setListening(false);
      if (/not-allowed|service-not-allowed|permission|denied/i.test(error)) {
        micPermissionRef.current = 'denied';
        setMicPermission('denied');
        clearListeningRestartTimer();
        if (!micPermissionNoticeRef.current) {
          micPermissionNoticeRef.current = true;
          addMsg('assistant', '[ERROR] Microphone permission is blocked. Enable microphone access for Lexoire, then restart the app.');
        }
      }
    };

    recognition.onend = () => {
      const shouldResume = !suppressRecognitionResumeRef.current;
      suppressRecognitionResumeRef.current = false;
      if (browserRecognitionRef.current === recognition) {
        browserRecognitionRef.current = null;
      }
      listeningRef.current = false;
      setListening(false);
      if (shouldResume && !mutedRef.current && micPermissionRef.current !== 'denied') {
        scheduleListeningResume(300);
      }
    };

    browserRecognitionRef.current = recognition;
    recognition.start();
    return true;
  };

  const clearSwiftTimeout = () => {
    if (swiftStartTimeoutRef.current !== null) {
      window.clearTimeout(swiftStartTimeoutRef.current);
      swiftStartTimeoutRef.current = null;
    }
  };

  const startBrowserSpeechFallback = async (reason?: string) => {
    if (reason) {
      console.warn('[SPEECH]', reason);
    }
    await initAudioContext();
    const started = startBrowserSpeech();
    if (!started && !speechUnavailableNoticeRef.current) {
      speechUnavailableNoticeRef.current = true;
      addMsg('assistant', '[ERROR] Speech recognition is unavailable on this platform right now. Browser speech APIs are not available in this runtime yet.');
    }
  };

  const startServerSpeechFallback = async (reason?: string) => {
    if (reason) {
      console.warn('[SPEECH]', reason);
    }

    if (typeof MediaRecorder === 'undefined') {
      return startBrowserSpeechFallback('Backend speech capture is unavailable because MediaRecorder is not supported in this runtime.');
    }

    await initAudioContext();
    const stream = microphoneStreamRef.current;
    if (!stream) {
      return startBrowserSpeechFallback('Backend speech capture could not initialize the microphone stream.');
    }

    stopServerSpeechRecognition(true);
    const sessionId = serverSpeechSessionRef.current + 1;
    serverSpeechSessionRef.current = sessionId;
    serverSpeechModeRef.current = true;
    serverSpeechErrorNoticeRef.current = false;
    speechUnavailableNoticeRef.current = false;
    micPermissionRef.current = 'granted';
    setMicPermission('granted');
    listeningRef.current = true;
    setListening(true);
    serverSpeechMimeTypeRef.current = pickServerSpeechMimeType();

    const fallbackToBrowserSpeech = async (message: string) => {
      if (sessionId !== serverSpeechSessionRef.current) {
        return;
      }
      backendSpeechCapabilitiesRef.current = {
        backendSpeechRecognition: false,
        transcriptionModels: backendSpeechCapabilitiesRef.current?.transcriptionModels,
      };
      stopServerSpeechRecognition(true);
      listeningRef.current = false;
      setListening(false);
      await startBrowserSpeechFallback(message);
    };

    const transcribeServerSpeechBlob = async (blob: Blob) => {
      try {
        const wavBlob = await convertBlobToWav(blob);
        const audioBase64 = await blobToBase64(wavBlob);
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audioBase64,
            mimeType: 'audio/wav',
            language: 'en-US',
          }),
        });

        if (!response.ok) {
          let errorMessage = `Transcription request failed (${response.status})`;
          try {
            const payload = await response.json() as { error?: string };
            if (payload?.error) {
              errorMessage = payload.error;
            }
          } catch {}

          if (response.status === 503 || response.status === 501 || /speech model|local speech|offline|cache/i.test(errorMessage)) {
            await fallbackToBrowserSpeech(errorMessage);
            return;
          }

          throw new Error(errorMessage);
        }

        const payload = await response.json() as { text?: string };
        if (sessionId !== serverSpeechSessionRef.current || !serverSpeechModeRef.current || mutedRef.current) {
          return;
        }

        const transcript = typeof payload.text === 'string' ? payload.text.trim() : '';
        serverSpeechErrorNoticeRef.current = false;
        if (!transcript) {
          return;
        }
        if (speechActiveRef.current || speechQueueRef.current.length > 0) {
          return;
        }
        if (Date.now() < postSpeechEchoGuardRef.current && isLikelySpeechEcho(transcript)) {
          console.log('[SPEECH] Post-TTS echo suppressed (backend):', transcript.slice(0, 40));
          return;
        }

        const nextDraft = draftRef.current ? `${draftRef.current} ${transcript}` : transcript;
        setDraft(nextDraft);
        draftRef.current = nextDraft;
        setInterim('');
        interimRef.current = '';
        startSilenceTimer();
      } catch (error: unknown) {
        if (sessionId !== serverSpeechSessionRef.current || !serverSpeechModeRef.current) {
          return;
        }

        if (!serverSpeechErrorNoticeRef.current) {
          serverSpeechErrorNoticeRef.current = true;
          addMsg('assistant', `[ERROR] ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };

    const finalizeSegment = (discard = false) => {
      const recorder = serverSpeechRecorderRef.current;
      if (!recorder || recorder.state !== 'recording') {
        return;
      }

      if (discard) {
        serverSpeechDiscardSegmentRef.current = true;
      }

      try {
        recorder.stop();
      } catch (error: unknown) {
        void fallbackToBrowserSpeech(`Backend speech capture failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    const startSegment = () => {
      if (!serverSpeechModeRef.current || sessionId !== serverSpeechSessionRef.current || serverSpeechRecorderRef.current) {
        return;
      }

      serverSpeechChunksRef.current = [];
      serverSpeechDiscardSegmentRef.current = false;
      serverSpeechSilenceStartedAtRef.current = null;
      serverSpeechCaptureStartedAtRef.current = Date.now();

      let recorder: MediaRecorder;
      try {
        recorder = serverSpeechMimeTypeRef.current
          ? new MediaRecorder(stream, { mimeType: serverSpeechMimeTypeRef.current })
          : new MediaRecorder(stream);
      } catch (error: unknown) {
        void fallbackToBrowserSpeech(`Backend speech capture failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          serverSpeechChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event: Event) => {
        const recorderError = (event as Event & { error?: { message?: string } }).error;
        void fallbackToBrowserSpeech(`Backend speech capture failed: ${recorderError?.message || 'recording error'}`);
      };

      recorder.onstop = () => {
        const recordedChunks = [...serverSpeechChunksRef.current];
        const shouldDiscard = serverSpeechDiscardSegmentRef.current;
        const startedAt = serverSpeechCaptureStartedAtRef.current;
        serverSpeechChunksRef.current = [];
        serverSpeechDiscardSegmentRef.current = false;
        serverSpeechSilenceStartedAtRef.current = null;
        serverSpeechCaptureStartedAtRef.current = null;
        serverSpeechRecorderRef.current = null;

        if (shouldDiscard || sessionId !== serverSpeechSessionRef.current) {
          return;
        }

        const durationMs = startedAt ? Date.now() - startedAt : 0;
        const blob = new Blob(recordedChunks, {
          type: recorder.mimeType || serverSpeechMimeTypeRef.current || 'audio/webm',
        });
        if (durationMs < SERVER_SPEECH_MIN_RECORDING_MS || blob.size < 2048) {
          return;
        }

        void transcribeServerSpeechBlob(blob);
      };

      serverSpeechRecorderRef.current = recorder;
      recorder.start();
    };

    clearServerSpeechMonitor();
    serverSpeechMonitorRef.current = window.setInterval(() => {
      if (!serverSpeechModeRef.current || sessionId !== serverSpeechSessionRef.current) {
        return;
      }

      if (
        mutedRef.current
        || micPermissionRef.current === 'denied'
        || busyRef.current
        || speechActiveRef.current
        || speechQueueRef.current.length > 0
      ) {
        finalizeSegment(true);
        return;
      }

      const level = audioLevelRef.current;
      const recorder = serverSpeechRecorderRef.current;

      if (!recorder || recorder.state !== 'recording') {
        if (level >= SERVER_SPEECH_START_LEVEL) {
          startSegment();
        }
        return;
      }

      const captureStartedAt = serverSpeechCaptureStartedAtRef.current ?? Date.now();
      const elapsed = Date.now() - captureStartedAt;
      if (elapsed >= SERVER_SPEECH_MAX_RECORDING_MS) {
        finalizeSegment(false);
        return;
      }

      if (level >= SERVER_SPEECH_CONTINUE_LEVEL) {
        serverSpeechSilenceStartedAtRef.current = null;
        return;
      }

      if (serverSpeechSilenceStartedAtRef.current === null) {
        serverSpeechSilenceStartedAtRef.current = Date.now();
        return;
      }

      if (
        Date.now() - serverSpeechSilenceStartedAtRef.current >= SERVER_SPEECH_SEGMENT_SILENCE_MS
        && elapsed >= SERVER_SPEECH_MIN_RECORDING_MS
      ) {
        finalizeSegment(false);
      }
    }, 90);
  };

  const startPreferredSpeechFallback = async (reason?: string) => {
    try {
      const backendCapabilities = await fetchBackendSpeechCapabilities();
      if (backendCapabilities.backendSpeechRecognition) {
        await startServerSpeechFallback(reason);
        return;
      }
    } catch (error: unknown) {
      console.warn('[SPEECH] Failed to load backend voice capabilities:', error);
    }

    await startBrowserSpeechFallback(reason ? `${reason} Using browser fallback.` : undefined);
  };

  const startListening = () => {
    if (
      mutedRef.current
      || micPermissionRef.current === 'denied'
      || listeningRef.current
      || browserRecognitionRef.current
      || serverSpeechModeRef.current
    ) return;
    suppressRecognitionResumeRef.current = false;

    const lexoire = window.lexoire;

    Promise.resolve(lexoire?.getVoiceCapabilities?.())
      .catch(() => null)
      .then((capabilities: VoiceCapabilities | null | undefined) => {
        const startNativeSpeech = lexoire?.startSpeech;
        const nativeSpeechSupported = capabilities?.nativeSpeechRecognition ?? (lexoire?.platform === 'darwin' && Boolean(startNativeSpeech));

        if (!nativeSpeechSupported || !startNativeSpeech) {
          return startPreferredSpeechFallback('Native speech recognition unavailable.');
        }

        return lexoire.requestMic?.()
          .then((allowed: boolean) => {
            if (!allowed) {
              micPermissionRef.current = 'denied';
              setMicPermission('denied');
              setListening(false);
              clearListeningRestartTimer();
              if (!micPermissionNoticeRef.current) {
                micPermissionNoticeRef.current = true;
                addMsg('assistant', '[ERROR] Microphone permission is blocked. Enable Microphone and Speech Recognition in System Settings > Privacy & Security, then restart Lexoire.');
              }
              return;
            }

            micPermissionRef.current = 'granted';
            setMicPermission('granted');
            // Optimistically show listening — confirmed by LEXOIRE_READY, reverted on error
            listeningRef.current = true;
            setListening(true);
            // Safety timeout: if LEXOIRE_READY hasn't fired after 5s, fall back to browser speech
            clearSwiftTimeout();
            swiftStartTimeoutRef.current = window.setTimeout(() => {
              swiftStartTimeoutRef.current = null;
              console.warn('[SPEECH] Swift LEXOIRE_READY timeout — falling back to backend/browser speech');
              listeningRef.current = false;
              setListening(false);
              void startPreferredSpeechFallback();
            }, 5000);
            startNativeSpeech().catch((err: unknown) => {
              clearSwiftTimeout();
              listeningRef.current = false;
              setListening(false);
              void startPreferredSpeechFallback(`Native speech start failed: ${err instanceof Error ? err.message : String(err)}`);
            });
          })
          .catch((err: unknown) => {
            micPermissionRef.current = 'denied';
            setMicPermission('denied');
            listeningRef.current = false;
            setListening(false);
            clearListeningRestartTimer();
            if (!micPermissionNoticeRef.current) {
              micPermissionNoticeRef.current = true;
              addMsg('assistant', `[ERROR] Unable to request microphone permission: ${err instanceof Error ? err.message : String(err)}`);
            }
          });
      });
  };

  const scheduleListeningResume = (delay = 220) => {
    clearListeningRestartTimer();
    if (mutedRef.current || micPermissionRef.current === 'denied') return;
    // Don't start mic before the echo guard expires — prevents speaker pickup
    const guardRemaining = Math.max(0, postSpeechEchoGuardRef.current - Date.now());
    const actualDelay = guardRemaining > 0 ? Math.max(delay, guardRemaining + 150) : delay;
    listeningRestartTimer.current = window.setTimeout(() => {
      listeningRestartTimer.current = null;
      if (
        !mutedRef.current
        && micPermissionRef.current !== 'denied'
        && !busyRef.current
        && !speechActiveRef.current
        && speechQueueRef.current.length === 0
        && !listeningRef.current
        && !browserRecognitionRef.current
      ) {
        startListening();
      }
    }, actualDelay);
  };

  const getSoundContext = async () => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!soundContextRef.current) {
      soundContextRef.current = new AudioCtx();
    }
    if (soundContextRef.current.state === 'suspended') {
      await soundContextRef.current.resume();
    }
    return soundContextRef.current;
  };

  const playBubbleCue = async () => {
    speechActiveRef.current = true;
    setIsSpeaking(true);
    setInterim('');
    interimRef.current = '';
    stopListening();

    try {
      const ctx = await getSoundContext();
      if (!ctx) {
        return;
      }

      const startedAt = ctx.currentTime + 0.01;
      const master = ctx.createGain();
      master.connect(ctx.destination);
      master.gain.setValueAtTime(0.0001, startedAt);
      master.gain.exponentialRampToValueAtTime(0.16, startedAt + 0.04);
      master.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.42);

      [
        { delay: 0, from: 460, to: 780, duration: 0.16 },
        { delay: 0.09, from: 560, to: 940, duration: 0.14 },
        { delay: 0.17, from: 680, to: 1120, duration: 0.12 },
      ].forEach(({ delay, from, to, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(from, startedAt + delay);
        osc.frequency.exponentialRampToValueAtTime(to, startedAt + delay + duration);
        gain.gain.setValueAtTime(0.0001, startedAt + delay);
        gain.gain.exponentialRampToValueAtTime(0.18, startedAt + delay + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + delay + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(startedAt + delay);
        osc.stop(startedAt + delay + duration + 0.02);
      });
    } catch (err) {
      console.warn('[SPEECH] Bubble cue failed:', err);
    } finally {
      window.setTimeout(() => {
        speechActiveRef.current = false;
        setIsSpeaking(false);
        scheduleListeningResume(1800);
      }, 460);
    }
  };

  const playSendCue = async () => {
    try {
      const ctx = await getSoundContext();
      if (!ctx) return;
      const now = ctx.currentTime + 0.01;
      // Short descending two-tone "whoosh" to signal dispatch
      [{ f: 900, t: 0 }, { f: 620, t: 0.06 }].forEach(({ f, t }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.7, now + t + 0.08);
        g.gain.setValueAtTime(0.0001, now + t);
        g.gain.exponentialRampToValueAtTime(0.09, now + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.1);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(now + t); osc.stop(now + t + 0.12);
      });
    } catch {}
  };

  const refreshSessionStatus = async () => {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) return;
      const payload = await response.json();
      setCurrentSessionId(payload?.runtime?.sessionId || '');
      const workingDirectory = typeof payload?.runtime?.workingDirectory === 'string'
        ? payload.runtime.workingDirectory
        : '';
      if (workingDirectory) {
        setSessionDraft((prev) => prev.repoPath.trim() ? prev : { ...prev, repoPath: workingDirectory });
      }
    } catch {}
  };

  const refreshWorkspaceSessions = async () => {
    try {
      const response = await fetch('/api/sessions');
      if (!response.ok) return;
      const payload = await response.json();
      setWorkspaceSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
      setActiveWorkspaceSessionId(typeof payload?.current === 'string' ? payload.current : '');
    } catch {}
  };

  const createWorkspaceSession = async () => {
    const name = sessionDraft.name.trim();
    const repoPath = sessionDraft.repoPath.trim();
    const branch = sessionDraft.branch.trim();
    const objective = sessionDraft.objective.trim();
    const sessionId = sessionDraft.sessionId.trim();
    const selectedAgent = sessionDraft.agent;
    if (!name || !repoPath) {
      setSessionNotice('Name and repo path are required.');
      return;
    }
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          repo_path: repoPath,
          branch: branch || undefined,
          objective: objective || undefined,
          session_id: sessionId || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setSessionNotice(payload?.error || 'Unable to create session.');
        return;
      }

      const payload = await response.json();
      const createdId = payload?.session?.id || payload?.id;
      if (createdId) {
        await fetch(`/api/sessions/${createdId}/switch`, { method: 'PUT' });
      }
      // Switch global agent to match the session's agent
      setAgent(selectedAgent);
      agentRef.current = selectedAgent;
      setSessionDraft((prev) => ({
        ...prev,
        name: '',
        branch: '',
        objective: '',
        repoPath,
        sessionId: '',
      }));
      setSessionNotice(sessionId ? `Session "${name}" is ready as ${sessionId}.` : `Session "${name}" is ready.`);
      await refreshWorkspaceSessions();
    } catch {
      setSessionNotice('Unable to create session.');
    }
  };

  const switchWorkspaceSession = async (id: string) => {
    try {
      const response = await fetch(`/api/sessions/${id}/switch`, { method: 'PUT' });
      if (!response.ok) return;
      setSessionNotice('Session focus updated.');
      await refreshWorkspaceSessions();
    } catch {}
  };

  const transferWorkspaceSession = async (id: string, nextAgent: Agent) => {
    await switchWorkspaceSession(id);
    setAgent(nextAgent);
    agentRef.current = nextAgent;
    const session = workspaceSessions.find((item) => item.id === id);
    setSessionNotice(`Session "${session?.name || id}" is now routed to ${AGENT_COLORS[nextAgent].label}.`);
  };

  const deleteWorkspaceSession = async (id: string) => {
    const session = workspaceSessions.find((item) => item.id === id);
    if (!window.confirm(`Delete session "${session?.name || id}"? This removes it from Lexoire session management.`)) return;
    try {
      const response = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setSessionNotice(payload?.error || 'Unable to delete session.');
        return;
      }
      if (id === activeWorkspaceSessionId) {
        setActiveWorkspaceSessionId('');
      }
      setSessionNotice('Session deleted.');
      await refreshWorkspaceSessions();
    } catch {}
  };

  const enqueueQueuedPrompt = (prompt: string, queuedAgent: Agent, sessionId?: string) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;
    const lastQueued = promptQueueRef.current[promptQueueRef.current.length - 1];
    if (lastQueued && lastQueued.agent === queuedAgent && lastQueued.sessionId === sessionId) {
      const mergedPrompt = `${lastQueued.prompt.trim()}\n\n${normalizedPrompt}`.trim();
      lastQueued.prompt = mergedPrompt;
      lastQueued.createdAt = Date.now();
      if (editingQueuedPromptId === lastQueued.id) {
        setEditingQueuedPromptText(mergedPrompt);
      }
      syncQueuedPromptState();
      return;
    }
    promptQueueRef.current.push({
      id: nextId.current++,
      prompt: normalizedPrompt,
      agent: queuedAgent,
      sessionId,
      createdAt: Date.now(),
    });
    syncQueuedPromptState();
  };

  const takeQueuedPrompt = (id: number) => {
    const targetIndex = promptQueueRef.current.findIndex((item) => item.id === id);
    if (targetIndex === -1) return null;
    const [queuedPrompt] = promptQueueRef.current.splice(targetIndex, 1);
    if (editingQueuedPromptId === id) {
      clearQueuedPromptEditor();
    }
    syncQueuedPromptState();
    return queuedPrompt ?? null;
  };

  const beginQueuedPromptEdit = (id: number) => {
    const queuedPrompt = promptQueueRef.current.find((item) => item.id === id);
    if (!queuedPrompt) return;
    setEditingQueuedPromptId(id);
    setEditingQueuedPromptText(queuedPrompt.prompt);
  };

  const saveQueuedPromptEdit = () => {
    if (editingQueuedPromptId === null) return;
    const nextPrompt = editingQueuedPromptText.trim();
    if (!nextPrompt) return;
    promptQueueRef.current = promptQueueRef.current.map((item) =>
      item.id === editingQueuedPromptId
        ? { ...item, prompt: nextPrompt }
        : item
    );
    syncQueuedPromptState();
    clearQueuedPromptEditor();
  };

  const removeQueuedPrompt = (id: number) => {
    void takeQueuedPrompt(id);
  };

  const clearQueuedPrompts = () => {
    clearQueuedPromptDispatchTimer();
    promptQueueRef.current = [];
    clearQueuedPromptEditor();
    syncQueuedPromptState();
  };

  const sendQueuedPromptNow = (id: number) => {
    clearQueuedPromptDispatchTimer();
    const queuedPrompt = takeQueuedPrompt(id);
    if (!queuedPrompt) return;
    if (busyRef.current) {
      promptQueueRef.current.unshift(queuedPrompt);
      syncQueuedPromptState();
      return;
    }
    dispatchPrompt(queuedPrompt.prompt, false, queuedPrompt.agent, queuedPrompt.sessionId);
  };

  const processNextQueuedPrompt = () => {
    if (busyRef.current || queuedPromptDispatchTimerRef.current !== null) return;
    const nextPrompt = promptQueueRef.current[0];
    if (!nextPrompt) return;
    queuedPromptDispatchTimerRef.current = window.setTimeout(() => {
      queuedPromptDispatchTimerRef.current = null;
      if (busyRef.current) return;
      const queuedNow = promptQueueRef.current[0];
      if (!queuedNow || queuedNow.id !== nextPrompt.id) return;
      promptQueueRef.current.shift();
      syncQueuedPromptState();
      dispatchPrompt(queuedNow.prompt, false, queuedNow.agent, queuedNow.sessionId);
    }, 120);
  };

  const getLocalResponse = (cmd: string) => {
    const normalized = cmd
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (/^(yo|hey|hi|hello|sup|what's up|whats up|lexoire|hey lexoire|yo lexoire)$/.test(normalized)) {
      return 'I hear you.';
    }

    return '';
  };

  const isSpeechInterruptCommand = (text: string) => /^(stop|stop talking|stop speaking|interrupt|be quiet|shut up|cancel speech|silence)$/.test(
    text
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const stopCurrentSpeech = () => {
    interruptSpeechPlayback(true);
    resetSpokenTextMemory();
    setInterim('');
    interimRef.current = '';
    scheduleListeningResume(80);
  };

  const handleLocalControlCommand = (cmd: string) => {
    const normalized = cmd
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (/^(clear queue|clear pending|cancel queue|cancel pending|unsend pending|drop queue|drop pending)$/.test(normalized)) {
      if (promptQueueRef.current.length === 0) {
        return false;
      }
      clearQueuedPrompts();
      scheduleListeningResume(80);
      return true;
    }

    return false;
  };

  const startSilenceTimer = () => {
    clearSilenceTimer();
    const start = Date.now();
    
    console.log('[SILENCE] Timer started, will send after', SILENCE_MS, 'ms if no speech resumes');
    
    silenceTick.current = setInterval(() => {
      setSilencePct(Math.min(100, ((Date.now() - start) / SILENCE_MS) * 100));
    }, 50);
    
    // Simple: send after SILENCE_MS of no new speech
    silenceTimer.current = setTimeout(() => {
      clearInterval(silenceTick.current);
      setSilencePct(0);
      const text = draftRef.current.trim() || interimRef.current.trim();
      console.log('[SILENCE] Timeout fired, text:', text);
      if (text) {
        stopListening();
        console.log('[SILENCE] Calling send()');
        send(text);
      }
    }, SILENCE_MS);
  };

  const dispatchPrompt = (
    cmd: string,
    userBubbleAlreadyExists = false,
    targetAgent?: Agent,
    targetSessionId?: string
  ) => {
    clearQueuedPromptDispatchTimer();
    if (!socketRef.current?.connected) {
      console.warn('[SEND] Skipping: socket disconnected');
      if (!userBubbleAlreadyExists) addMsg('user', cmd);
      setMsgs(prev => [...prev, { id: nextId.current++, role: 'assistant', text: '[ERROR] Backend disconnected. Relaunch Lexoire.', createdAt: Date.now() }]);
      socketRef.current?.connect?.();
      return;
    }

    console.log('[SEND] Proceeding with command:', cmd.slice(0, 50));
    const provider = targetAgent ?? agentRef.current;
    responseTimerProviderRef.current = provider;
    const routedSessionId = targetSessionId ?? (activeWorkspaceSessionId || undefined);
    logDebug(`send ${provider.toUpperCase()}: ${cmd.slice(0, 80)}`);
    if (!userBubbleAlreadyExists) addMsg('user', cmd);
    busyRef.current = true;
    setBusy(true);
    streamedResponseRef.current = '';
    speechStreamBufferRef.current = '';
    hasSpeechStreamedRef.current = false;
    suppressCurrentResponseSpeechRef.current = false;
    resetSpokenTextMemory();
    resetInterruptionCandidate();
    activeResponseAgentRef.current = provider;
    const streamingMessageId = nextId.current++;
    setActiveStreamingMessage(streamingMessageId);
    setStreamStatus({ provider, phase: 'start', detail: 'awaiting response' });
    // Add placeholder bubble tagged with current agent
    setMsgs(prev => [...prev, { id: streamingMessageId, role: 'assistant', text: '', agent: provider, createdAt: Date.now() }]);
    playSendCue();

    const lower = cmd.toLowerCase();
    if (lower.includes('list sessions')) {
      socketRef.current?.emit('db:command', { type: 'list_sessions' });
    } else if (lower.includes('new session')) {
      setCurrentSessionId('');
      socketRef.current?.emit('db:command', { type: 'new_session' });
    } else if (lower.includes('status')) {
      socketRef.current?.emit('db:command', { type: 'status' });
    } else {
      const ev = provider === 'claude' ? 'claude:prompt'
               : provider === 'codex'  ? 'codex:prompt'
                : 'copilot:prompt';
      socketRef.current?.emit(ev, { prompt: cmd, sessionId: routedSessionId });
    }

    startResponseTimer(provider);
    scheduleListeningResume(260);
  };

  const send = (text?: string) => {
    clearSilenceTimer();
    const cmd = (text ?? draftRef.current).trim();
    console.log('[SEND] Called with text:', text, 'busy:', busy, 'cmd:', cmd);
    if (!cmd) {
      console.log('[SEND] Skipping: no command text');
      return;
    }

    if (handleLocalControlCommand(cmd)) {
      clearComposer();
      return;
    }

    stopListening();
    clearComposer();

    const localResponse = getLocalResponse(cmd);
    if (localResponse) {
      addMsg('user', cmd);
      addMsg('assistant', localResponse);
      _speak(localResponse);
      return;
    }

    if (busyRef.current) {
      console.log('[SEND] Queueing: already busy');
      enqueueQueuedPrompt(cmd, agentRef.current, activeWorkspaceSessionId || undefined);
      scheduleListeningResume(180);
      return;
    }

    dispatchPrompt(cmd);
  };

  const broadcast = (text?: string) => {
    clearSilenceTimer();
    const cmd = (text ?? draftRef.current).trim();
    if (!cmd || busy) return;
    stopListening();
    setDraft('');
    draftRef.current = '';
    setInterim('');
    addMsg('user', `BROADCAST: ${cmd}`);
    setBusy(true);
    // Broadcast to all agent sessions
    socketRef.current?.emit('broadcast:prompt', { prompt: cmd });
    scheduleListeningResume();
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      stopListening();
      return;
    }
    scheduleListeningResume(120);
  };

  const clearChat = () => {
    conversationIdRef.current = `conv-${Date.now()}`;
    conversationCreatedAtRef.current = Date.now();
    setMsgs([{ id: nextId.current++, role: 'assistant', text: 'Chat cleared.', createdAt: Date.now() }]);
  };

  const playNextSpeech = () => {
    const next = speechQueueRef.current.shift();
    setSpeechQueueCount(speechQueueRef.current.length);
    if (!next) {
      currentSpokenTextRef.current = '';
      speechActiveRef.current = false;
      setIsSpeaking(false);
      scheduleListeningResume();
      return;
    }

    speechActiveRef.current = true;
    setIsSpeaking(true);
    rememberSpokenText(next);
    setInterim('');
    interimRef.current = '';
    stopListening();

    const finish = () => {
      // 3 s echo guard — browser speechSynthesis.onend fires early on macOS,
      // so audio can still be playing when this callback runs.
      postSpeechEchoGuardRef.current = Date.now() + 3000;

      if (!speechActiveRef.current && speechQueueRef.current.length === 0) {
        window.setTimeout(() => { currentSpokenTextRef.current = ''; }, 3000);
        setIsSpeaking(false);
        scheduleListeningResume(1800);
        return;
      }
      speechActiveRef.current = false;
      setIsSpeaking(false);
      if (speechQueueRef.current.length > 0) {
        playNextSpeech();
        return;
      }
      window.setTimeout(() => { currentSpokenTextRef.current = ''; }, 3000);
      scheduleListeningResume(1800);
    };

    const speakWithBrowserSpeech = () => {
      if (!window.speechSynthesis) {
        return false;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(next);
      utterance.rate = speechRateRef.current;
      utterance.pitch = voiceModeRef.current === 'classic' ? 0.72 : 0.98;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      // User-selected voice takes priority
      const selectedVoice = selectedVoiceNameRef.current
        ? voices.find(v => v.name === selectedVoiceNameRef.current)
        : undefined;
      const preferredVoiceNames = voiceModeRef.current === 'classic'
        ? ['Fred', 'Ralph', 'Albert', 'Microsoft David', 'Microsoft Mark']
        : ['Microsoft Aria', 'Microsoft Jenny', 'Google US English', 'Google UK English Female', 'Samantha', 'Eddy', 'Reed', 'Flo', 'Ava', 'Allison'];
      const preferredVoice = selectedVoice ?? preferredVoiceNames
        .map((name) => voices.find((voice) => voice.name.includes(name)))
        .find(Boolean);

      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
      return true;
    };

    const lexoire = window.lexoire;
    if (lexoire?.speak) {
      Promise.resolve(lexoire.speak({ text: next, mode: voiceModeRef.current }))
        .then((usedNative) => {
          if (usedNative === false && speakWithBrowserSpeech()) {
            return;
          }
          finish();
        })
        .catch(() => {
          if (speakWithBrowserSpeech()) {
            return;
          }
          finish();
        });
      return;
    }

    if (speakWithBrowserSpeech()) {
      return;
    }

    finish();
  };

  const _speak = (text: string) => {
    if (!voiceRepliesRef.current) return;
    const clean = stripSpeechMarkup(text).replace(/[▶◀◉⚠]/g, '').trim();
    if (!clean) return;
    // Split into sentence segments so long responses are fully spoken, not truncated.
    // Cap total spoken content at ~1500 chars to avoid reading enormous outputs forever.
    const capped = clean.length > 1500 ? clean.substring(0, 1500) : clean;
    const segments = capped.match(/[^.!?\n]+[.!?\n]+/g) ?? [capped];
    let queued = 0;
    for (const seg of segments) {
      const s = seg.trim();
      if (s && queued < 8) {
        speechQueueRef.current.push(s);
        queued++;
      }
    }
    // Handle trailing text with no sentence terminator
    if (queued === 0 && capped.trim()) {
      speechQueueRef.current.push(capped);
    }
    setSpeechQueueCount(speechQueueRef.current.length);
    if (!speechActiveRef.current) playNextSpeech();
  };

  const shortSessionId = currentSessionId ? `${currentSessionId.slice(0, 8)}…${currentSessionId.slice(-4)}` : 'NEW';
  const hasDraft = draft.trim().length > 0 || interim.trim().length > 0;
  const autoSendActive = silencePct > 0;
  const autoSendSeconds = ((SILENCE_MS * (1 - silencePct / 100)) / 1000).toFixed(1);
  const liveLabel = micPermission === 'denied' ? 'NO MIC' : muted ? 'MUTED' : isSpeaking ? 'SPEAKING' : listening ? 'LIVE' : 'IDLE';
  const liveColor = micPermission === 'denied' ? '#ff9650' : muted ? '#ff4444' : isSpeaking ? '#7ad7ff' : listening ? '#10ff50' : '#10ff5040';
  const activeResponseAgent = activeResponseAgentRef.current ?? streamStatus?.provider ?? null;
  const processingAgent = activeResponseAgent ?? agent;
  const liveResponseGlow = 0.25 + audioLevel * 0.85;
  const sphereGlow = 0.18 + audioLevel * 0.9;

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #071a0e 0%, #040a06 55%, #020504 100%)',
      color: '#c8ffd4', fontFamily: '"SF Mono", "Fira Code", "Courier New", monospace',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* ── Danger Warning Banner ── */}
      {!warnDismissed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 16px',
          background: 'linear-gradient(90deg, #3a0000 0%, #1a0000 100%)',
          borderBottom: '1px solid #ff2222',
          boxShadow: '0 2px 18px #ff000035',
          zIndex: 20,
          animation: 'fadeIn 0.3s ease',
        }}>
          <span style={{ fontSize: 14, color: '#ff4444', flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 10, color: '#ff8888', letterSpacing: 0.5, lineHeight: 1.5, flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#ff4444', letterSpacing: 1 }}>DANGER — UNRESTRICTED PERMISSIONS: </span>
            AI agents run with <code style={{ background: '#2a0000', padding: '1px 5px', borderRadius: 3, color: '#ff9999' }}>--dangerously-skip-permissions</code> and <code style={{ background: '#2a0000', padding: '1px 5px', borderRadius: 3, color: '#ff9999' }}>--dangerously-bypass-approvals-and-sandbox</code> by default. Agents have full filesystem access, can execute arbitrary code, and modify or delete files without confirmation.
          </span>
          <button onClick={() => setWarnDismissed(true)} style={{
            background: 'transparent', border: '1px solid #ff222250', color: '#ff6666',
            fontFamily: 'inherit', fontSize: 9, letterSpacing: 1, cursor: 'pointer',
            padding: '3px 10px', borderRadius: 4, flexShrink: 0,
            textTransform: 'uppercase',
          }}>Dismiss</button>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        padding: '12px 80px 12px 20px',
        borderBottom: '1px solid #10ff5015',
        background: 'linear-gradient(135deg, rgba(1, 30, 12, 0.8), rgba(5, 20, 8, 0.6))',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      } as any}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 8, color: '#10ff50', textTransform: 'uppercase' }}>LEXOIRE</span>
        <span style={{ fontSize: 10, letterSpacing: 4, color: '#10ff5060', textTransform: 'uppercase' }}>AI ORCHESTRATOR</span>

        {/* ── Agent selector ── */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 20, background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 3, border: '1px solid #ffffff10', flexWrap: 'wrap' }}>
          {(['copilot', 'claude', 'codex'] as Agent[]).map(ag => {
            const c = AGENT_COLORS[ag];
            const active = agent === ag;
            return (
              <button key={ag} onClick={() => { setAgent(ag); agentRef.current = ag; }}
                style={{
                  background: active ? c.bg : 'transparent',
                  border: `1.5px solid ${active ? c.border : 'transparent'}`,
                  color: active ? c.text : '#ffffff50',
                  fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 1.8,
                  padding: '6px 14px', cursor: 'pointer', borderRadius: 6,
                  textTransform: 'uppercase',
                  transition: 'all 0.18s',
                  boxShadow: active ? `0 0 14px ${c.border}` : 'none',
                  whiteSpace: 'nowrap',
                }}>
                {active ? '● ' : '○ '}{c.label}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, position: 'relative', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 360px' }}>
          <button onClick={() => setSessionDropdownOpen(v => !v)} style={{
            background: 'linear-gradient(135deg, rgba(16, 255, 80, 0.12), rgba(0, 204, 120, 0.05))',
            border: '1px solid #10ff5030',
            color: '#afffc5',
            fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
            padding: '7px 12px', cursor: 'pointer', borderRadius: 6,
            textTransform: 'uppercase',
          }}>
            Sessions {shortSessionId} {sessionDropdownOpen ? 'Close' : 'Open'}
          </button>
          {queuedPromptCount > 0 && <span style={{ fontSize: 10, letterSpacing: 1.6, color: '#ffd36a', textTransform: 'uppercase' }}>Queue {queuedPromptCount}</span>}
          {speechQueueCount > 0 && <span style={{ fontSize: 10, letterSpacing: 1.6, color: '#7ad7ff', textTransform: 'uppercase' }}>Voice {speechQueueCount}</span>}
          {(isSpeaking || speechQueueCount > 0) && (
            <button
              onClick={() => {
                stopCurrentSpeech();
              }}
              style={{
                background: 'linear-gradient(135deg, rgba(255, 150, 80, 0.14), rgba(255, 80, 40, 0.08))',
                border: '1.5px solid #ff965055',
                color: '#ffbf97',
                fontFamily: 'inherit',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.2,
                padding: '7px 12px',
                cursor: 'pointer',
                borderRadius: 6,
                textTransform: 'uppercase',
              }}
            >
              Silence
            </button>
          )}
          {busy && <span style={{ fontSize: 10, letterSpacing: 2, color: AGENT_COLORS[processingAgent].text, animation: 'pulse 1s infinite', textTransform: 'uppercase' }}>{AGENT_COLORS[processingAgent].label} PROCESSING</span>}
          <span style={{ fontSize: 10, letterSpacing: 2, color: liveColor, textTransform: 'uppercase', animation: (listening || isSpeaking) ? 'pulse 1.2s ease-in-out infinite' : 'none' }}>
            {liveLabel}
          </span>
          
          {/* Mic Button */}
          <button onClick={toggleMute} style={{
            background: muted 
              ? 'linear-gradient(135deg, rgba(255, 68, 68, 0.15), rgba(204, 0, 0, 0.08))'
              : 'linear-gradient(135deg, rgba(16, 255, 80, 0.15), rgba(0, 204, 80, 0.08))',
            border: `1.5px solid ${muted ? '#ff4444' : '#10ff5060'}`,
            color: muted ? '#ff4444' : '#10ff50',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 600, letterSpacing: 1,
            padding: '7px 14px', cursor: 'pointer', borderRadius: 6,
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            backdropFilter: 'blur(12px)',
            boxShadow: muted ? '0 0 16px rgba(255, 68, 68, 0.2)' : '0 0 16px rgba(16, 255, 80, 0.15)',
            textTransform: 'uppercase',
          }}>
            MIC
          </button>

          <button onClick={() => {
            const next = !voiceRepliesRef.current;
            voiceRepliesRef.current = next;
            setVoiceReplies(next);
            if (!next) {
              interruptSpeechPlayback();
              suppressCurrentResponseSpeechRef.current = false;
              resetSpokenTextMemory();
              scheduleListeningResume(120);
            }
          }} style={{
            background: voiceReplies
              ? 'linear-gradient(135deg, rgba(122, 215, 255, 0.14), rgba(0, 90, 160, 0.08))'
              : 'linear-gradient(135deg, rgba(255, 150, 80, 0.12), rgba(120, 50, 20, 0.08))',
            border: `1.5px solid ${voiceReplies ? '#7ad7ff55' : '#ff965055'}`,
            color: voiceReplies ? '#7ad7ff' : '#ffbf97',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 600, letterSpacing: 1,
            padding: '7px 14px', cursor: 'pointer', borderRadius: 6,
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            backdropFilter: 'blur(12px)',
            boxShadow: voiceReplies ? '0 0 16px rgba(122, 215, 255, 0.15)' : 'none',
            textTransform: 'uppercase',
          }}>
            READ {voiceReplies ? 'ON' : 'OFF'}
          </button>

          <button onClick={() => {
            const next = voiceModeRef.current === 'hifi' ? 'classic' : 'hifi';
            voiceModeRef.current = next;
            setVoiceMode(next);
            const defaultRate = next === 'classic' ? 0.78 : 0.92;
            speechRateRef.current = defaultRate;
            setSpeechRate(defaultRate);
            window.speechSynthesis?.cancel?.();
            window.lexoire?.stopSpeech?.();
          }} style={{
            background: voiceMode === 'hifi'
              ? 'linear-gradient(135deg, rgba(16, 255, 80, 0.10), rgba(122, 215, 255, 0.08))'
              : 'linear-gradient(135deg, rgba(16, 255, 80, 0.14), rgba(0, 0, 0, 0.20))',
            border: `1.5px solid ${voiceMode === 'hifi' ? '#7ad7ff40' : '#10ff5060'}`,
            color: voiceMode === 'hifi' ? '#b9ecff' : '#10ff50',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 600, letterSpacing: 1,
            padding: '7px 14px', cursor: 'pointer', borderRadius: 6,
            textTransform: 'uppercase',
          }}>
            VOICE {voiceMode === 'hifi' ? 'HIFI' : 'CLASSIC'}
          </button>
          
          {/* Settings Button */}
          <button onClick={() => setSettingsOpen(v => !v)} style={{
            background: settingsOpen ? 'linear-gradient(135deg, rgba(255,200,50,0.14), rgba(255,150,0,0.08))' : 'transparent',
            border: `1.5px solid ${settingsOpen ? '#ffcc3260' : '#ffffff18'}`,
            color: settingsOpen ? '#ffd060' : '#ffffff55',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
            padding: '7px 10px', cursor: 'pointer', borderRadius: 6,
          }}>⚙</button>

          {/* Clear Button */}
          <button onClick={clearChat} style={{
            background: 'linear-gradient(135deg, rgba(0, 136, 255, 0.12), rgba(0, 102, 255, 0.06))',
            border: '1.5px solid #0088ff40',
            color: '#00aaff',
            fontFamily: 'inherit', fontSize: 11, fontWeight: 600, letterSpacing: 1,
            padding: '7px 14px', cursor: 'pointer', borderRadius: 6,
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 0 16px rgba(0, 136, 255, 0.15)',
            textTransform: 'uppercase',
          }}>
            CLEAR
          </button>
          {settingsOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 360,
              maxWidth: 'calc(100vw - 28px)',
              padding: 16,
              borderRadius: 12,
              border: '1px solid #ffcc3222',
              background: 'linear-gradient(180deg, rgba(18, 14, 4, 0.97), rgba(10, 8, 2, 0.97))',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(20px)',
              zIndex: 20,
            }}>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#ffcc3280', textTransform: 'uppercase', marginBottom: 14 }}>Voice Settings</div>

              {/* Voice mode */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#ffffff40', textTransform: 'uppercase', marginBottom: 6 }}>Mode</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['hifi', 'classic'] as VoiceMode[]).map(m => (
                    <button key={m} onClick={() => {
                      voiceModeRef.current = m; setVoiceMode(m);
                      const r = m === 'classic' ? 0.78 : 0.92;
                      speechRateRef.current = r; setSpeechRate(r);
                    }} style={{
                      flex: 1,
                      background: voiceMode === m ? 'rgba(16,255,80,0.12)' : 'transparent',
                      border: `1px solid ${voiceMode === m ? '#10ff5050' : '#ffffff15'}`,
                      color: voiceMode === m ? '#10ff50' : '#ffffff45',
                      fontFamily: 'inherit', fontSize: 10, fontWeight: 600, letterSpacing: 1,
                      padding: '6px 0', cursor: 'pointer', borderRadius: 5, textTransform: 'uppercase',
                    }}>{m}</button>
                  ))}
                </div>
              </div>

              {/* Voice selector */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#ffffff40', textTransform: 'uppercase', marginBottom: 6 }}>Voice</div>
                <select
                  value={selectedVoiceName}
                  onChange={e => { setSelectedVoiceName(e.target.value); selectedVoiceNameRef.current = e.target.value; }}
                  style={{
                    width: '100%',
                    background: '#0a0d06',
                    border: '1px solid #ffcc3230',
                    color: '#d4ffe0',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    padding: '7px 10px',
                    borderRadius: 6,
                    outline: 'none',
                  }}>
                  <option value="">Auto (use mode default)</option>
                  {availableVoices.map(v => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>

              {/* Speed control */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 9, letterSpacing: 1.5, color: '#ffffff40', textTransform: 'uppercase' }}>Speed</div>
                  <div style={{ fontSize: 9, color: '#ffd060' }}>{speechRate.toFixed(2)}x</div>
                </div>
                <input
                  type="range" min="0.4" max="1.6" step="0.05"
                  value={speechRate}
                  onChange={e => { const v = parseFloat(e.target.value); setSpeechRate(v); speechRateRef.current = v; }}
                  style={{ width: '100%', accentColor: '#ffcc32', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#ffffff25', marginTop: 2 }}>
                  <span>0.4x slow</span><span>1.0x normal</span><span>1.6x fast</span>
                </div>
              </div>

              {/* Test voice */}
              <button onClick={() => _speak('Lexoire online. Voice synthesis active.')} style={{
                width: '100%',
                background: 'rgba(255,200,50,0.08)',
                border: '1px solid #ffcc3230',
                color: '#ffd060',
                fontFamily: 'inherit', fontSize: 10, fontWeight: 600, letterSpacing: 1,
                padding: '7px 0', cursor: 'pointer', borderRadius: 6, textTransform: 'uppercase',
              }}>▶ Test Voice</button>
            </div>
          )}
          {sessionDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              left: 'auto',
              bottom: 'auto',
              width: 460,
              maxWidth: 'calc(100vw - 24px)',
              maxHeight: '72vh',
              padding: 16,
              borderRadius: 12,
              border: '1px solid #10ff5022',
              background: 'linear-gradient(180deg, rgba(4, 18, 9, 0.98), rgba(3, 10, 6, 0.98))',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.48)',
              backdropFilter: 'blur(18px)',
              overflow: 'auto',
              zIndex: 40,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: '#10ff5080', textTransform: 'uppercase' }}>Session Router</div>
                <button
                  onClick={() => setSessionDropdownOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ffffff18',
                    color: '#d4ffe0',
                    borderRadius: 6,
                    padding: '5px 8px',
                    fontSize: 9,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  Close
                </button>
              </div>
              <div style={{ fontSize: 9, letterSpacing: 1.4, color: AGENT_COLORS[agent].text, textTransform: 'uppercase', marginBottom: 8 }}>Provider: {AGENT_COLORS[agent].label}</div>
              <div style={{ fontSize: 11, color: '#c9ffd6', marginBottom: 12, lineHeight: 1.5 }}>
                {activeWorkspaceSessionId || currentSessionId || 'No session selected. Create or use a session to preserve provider context.'}
              </div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#10ff5080', textTransform: 'uppercase', marginBottom: 8 }}>Create Session</div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                {/* Agent selector for new session */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['copilot', 'claude', 'codex'] as Agent[]).map(ag => {
                    const c = AGENT_COLORS[ag];
                    const active = sessionDraft.agent === ag;
                    return (
                      <button key={ag} onClick={() => setSessionDraft(p => ({ ...p, agent: ag }))}
                        style={{
                          flex: 1,
                          background: active ? c.bg : 'transparent',
                          border: `1px solid ${active ? c.border : '#ffffff15'}`,
                          color: active ? c.text : '#ffffff35',
                          fontFamily: 'inherit', fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
                          padding: '6px 4px', cursor: 'pointer', borderRadius: 5,
                          textTransform: 'uppercase', transition: 'all 0.15s',
                        }}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  value={sessionDraft.name}
                  onChange={(e) => setSessionDraft((prev) => ({ ...prev, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') createWorkspaceSession(); }}
                  placeholder="Session name"
                  style={{
                    flex: 1,
                    background: '#08140c',
                    border: '1px solid #10ff5022',
                    color: '#d4ffe0',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                />
                <input
                  value={sessionDraft.repoPath}
                  onChange={(e) => setSessionDraft((prev) => ({ ...prev, repoPath: e.target.value }))}
                  placeholder="Repo path"
                  style={{
                    flex: 1,
                    background: '#08140c',
                    border: '1px solid #10ff5022',
                    color: '#d4ffe0',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={sessionDraft.branch}
                    onChange={(e) => setSessionDraft((prev) => ({ ...prev, branch: e.target.value }))}
                    placeholder="Branch (optional)"
                    style={{
                      flex: 1,
                      background: '#08140c',
                      border: '1px solid #10ff5022',
                      color: '#d4ffe0',
                      fontFamily: 'inherit',
                      fontSize: 11,
                      padding: '8px 10px',
                      borderRadius: 6,
                    }}
                  />
                  <button onClick={createWorkspaceSession} style={{ background: '#10321b', border: '1px solid #10ff5030', color: '#afffc5', borderRadius: 6, padding: '7px 12px', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase' }}>Add</button>
                </div>
                <input
                  value={sessionDraft.sessionId}
                  onChange={(e) => setSessionDraft((prev) => ({ ...prev, sessionId: e.target.value }))}
                  placeholder="Custom session ID (optional)"
                  style={{
                    flex: 1,
                    background: '#08140c',
                    border: '1px solid #10ff5022',
                    color: '#d4ffe0',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                />
                <textarea
                  value={sessionDraft.objective}
                  onChange={(e) => setSessionDraft((prev) => ({ ...prev, objective: e.target.value }))}
                  placeholder="Objective (optional)"
                  rows={3}
                  style={{
                    resize: 'vertical',
                    minHeight: 64,
                    background: '#08140c',
                    border: '1px solid #10ff5022',
                    color: '#d4ffe0',
                    fontFamily: 'inherit',
                    fontSize: 11,
                    padding: '8px 10px',
                    borderRadius: 6,
                  }}
                />
              </div>
              {sessionNotice && (
                <div style={{ fontSize: 10, color: '#9fd7ac', marginBottom: 12, lineHeight: 1.5 }}>
                  {sessionNotice}
                </div>
              )}
              <div style={{ fontSize: 10, letterSpacing: 2, color: '#10ff5080', textTransform: 'uppercase', marginBottom: 8 }}>Named Sessions</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, maxHeight: '36vh', overflow: 'auto', marginBottom: 12 }}>
                {workspaceSessions.length === 0 && (
                  <div style={{ fontSize: 11, color: '#89b897' }}>No named sessions yet.</div>
                )}
                {workspaceSessions.map((session) => (
                  <div key={session.id} style={{
                    padding: 10,
                    borderRadius: 8,
                    border: `1px solid ${session.id === activeWorkspaceSessionId ? '#10ff5060' : '#10ff5018'}`,
                    background: session.id === activeWorkspaceSessionId ? 'rgba(16,255,80,0.10)' : 'rgba(255,255,255,0.03)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: '#d4ffe0', fontWeight: 700 }}>{session.name}</div>
                      <div style={{ fontSize: 9, color: '#10ff50aa', textTransform: 'uppercase', letterSpacing: 1.2 }}>{session.status}</div>
                    </div>
                    <div style={{ fontSize: 9, color: '#5f9f70', marginBottom: 6, lineHeight: 1.4, wordBreak: 'break-all' }}>
                      {session.id}
                    </div>
                    <div style={{ fontSize: 10, color: '#7fb78d', marginBottom: 8, lineHeight: 1.4, wordBreak: 'break-word' }}>
                      {session.repoPath}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                      <button onClick={() => switchWorkspaceSession(session.id)} style={{ background: '#0a2132', border: '1px solid #3aa9ff30', color: '#8fd3ff', borderRadius: 6, padding: '6px 8px', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase' }}>
                        {session.id === activeWorkspaceSessionId ? 'Active' : 'Use'}
                      </button>
                      <button onClick={() => deleteWorkspaceSession(session.id)} style={{ background: '#2f160f', border: '1px solid #ff965030', color: '#ffbf97', borderRadius: 6, padding: '6px 8px', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase' }}>Delete</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
                      {(['copilot', 'claude', 'codex'] as Agent[]).map((targetAgent) => {
                        const c = AGENT_COLORS[targetAgent];
                        const activeRoute = session.id === activeWorkspaceSessionId && agent === targetAgent;
                        return (
                          <button key={targetAgent} onClick={() => transferWorkspaceSession(session.id, targetAgent)} style={{
                            background: activeRoute ? c.bg : 'rgba(255,255,255,0.025)',
                            border: `1px solid ${activeRoute ? c.border : '#ffffff12'}`,
                            color: activeRoute ? c.text : '#ffffff66',
                            borderRadius: 6,
                            padding: '6px 4px',
                            fontSize: 9,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                          }}>{c.label}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setSessionDropdownOpen(false); send('new session'); }} style={{ background: '#2f160f', border: '1px solid #ff965030', color: '#ffbf97', borderRadius: 6, padding: '7px 10px', fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase' }}>Restart Copilot Session</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Body: sphere on top, chat below ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ── Sphere (top center, fixed height) ── */}
        <div style={{
          flexShrink: 0, height: 380,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 35%, rgba(28, 255, 163, 0.14), rgba(4, 12, 6, 0.96) 42%, #030806 100%)',
          borderBottom: '1px solid #10ff5012',
          position: 'relative',
          boxShadow: `inset 0 0 ${24 + audioLevel * 90}px rgba(24, 255, 170, ${0.08 + sphereGlow * 0.18})`,
        }}>
          <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
            <Sphere listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocityRef.current} />
          </div>

          {/* Transcription overlay at bottom of sphere ── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '12px 24px', textAlign: 'center',
            background: 'linear-gradient(180deg, transparent 0%, rgba(3, 8, 6, 0.85) 100%)',
            pointerEvents: 'none',
          }}>
            {draft && (
              <div style={{ fontSize: 13, color: '#10ff50', marginBottom: 4, fontWeight: 600, letterSpacing: 0.8, maxWidth: 600, margin: '0 auto 4px' }}>
                {draft}
              </div>
            )}
            <div style={{ fontSize: 11, color: micPermission === 'denied' ? '#ff9650' : muted ? '#ff444466' : '#10ff4499', fontStyle: 'italic', letterSpacing: 0.5 }}>
              {micPermission === 'denied' ? '[ microphone permission needed ]' : muted ? '[ muted ]' : isSpeaking ? <span>[ speaking <SpeakPulse /> ]</span> : interim ? interim : listening ? <span>[ <BlinkCursor /> ]</span> : <span>[ standby <StandbyBlink /> ]</span>}
            </div>
          </div>
        </div>

        {/* ── Chat + input ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(180deg, #030806, #05140a)' }}>
          {/* Messages ── */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
            scrollbarWidth: 'thin',
          }}>
            {msgs.filter(m => m.text.trim() || (busy && m.role === 'assistant')).map(m => {
              const ac = m.agent ? AGENT_COLORS[m.agent] : AGENT_COLORS.copilot;
              const isStreamingBubble = m.role === 'assistant' && m.id === activeStreamMsgId && busy;
              const streamStatusText = isStreamingBubble ? formatStreamStatus(streamStatus?.phase, streamStatus?.detail) : '';
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 3 }}>
                  {m.role === 'assistant' && m.agent && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 4 }}>
                      <span style={{ fontSize: 8, letterSpacing: 2, color: ac.text + '99', textTransform: 'uppercase' }}>{ac.label}</span>
                      {streamStatusText && (
                        <span style={{ fontSize: 8, letterSpacing: 1.4, color: '#10ff80aa', textTransform: 'uppercase' }}>
                          {streamStatusText}
                        </span>
                      )}
                      {isStreamingBubble && (
                        <button
                          onClick={() => {
                            confirmAbortActiveResponse();
                          }}
                          style={{
                            background: 'linear-gradient(135deg, rgba(255, 68, 68, 0.95), rgba(180, 18, 18, 0.92))',
                            border: '1px solid #ff8888aa',
                            color: '#fff4f4',
                            fontFamily: 'inherit',
                            fontSize: 8,
                            fontWeight: 800,
                            letterSpacing: 1.1,
                            padding: '2px 7px',
                            cursor: 'pointer',
                            borderRadius: 999,
                            textTransform: 'uppercase',
                            boxShadow: '0 0 14px rgba(255, 68, 68, 0.28)',
                          }}
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{
                    maxWidth: '85%',
                    padding: isStreamingBubble ? '13px 15px' : '12px 14px',
                    borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: m.role === 'user'
                      ? 'linear-gradient(135deg, #10ff2222 0%, #10cc5514 100%)'
                      : isStreamingBubble
                        ? `linear-gradient(135deg, rgba(18, 255, 152, 0.14), rgba(8, 26, 18, 0.96))`
                        : ac.bg,
                    border: m.role === 'user' ? '1px solid #10ff4430' : `1.5px solid ${isStreamingBubble ? '#66f7ffaa' : ac.border}`,
                    color: m.role === 'user' ? '#d4ffe0' : ac.text,
                    fontSize: 12, lineHeight: 1.6, letterSpacing: 0.2,
                    boxShadow: m.role === 'user'
                      ? '0 2px 10px #10ff2210'
                      : isStreamingBubble
                        ? `0 0 ${12 + liveResponseGlow * 22}px rgba(102, 247, 255, ${0.12 + liveResponseGlow * 0.16}), 0 8px 18px rgba(0,0,0,0.28)`
                        : '0 2px 6px #00000040',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.text.trim() ? (
                      <>
                        {renderMessageText(m.text)}
                        {isStreamingBubble ? <BlinkCursor /> : null}
                      </>
                    ) : isStreamingBubble ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ThinkingDots />
                        <StandbyBlink />
                      </span>
                    ) : <ThinkingDots />}
                  </div>
                </div>
              );
            })}
            <div ref={msgsEndRef} />
          </div>

          {/* Input bar ── */}
          <div style={{ padding: '12px 12px', borderTop: '1px solid #10ff5015', background: 'linear-gradient(0deg, #030806 0%, transparent 100%)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <div style={{ height: 2, background: '#10ff2215', borderRadius: 1, overflow: 'hidden', margin: '0 -12px 0 -12px', width: 'calc(100% + 24px)' }}>
              <div style={{
                height: '100%',
                width: `${silencePct}%`,
                background: 'linear-gradient(90deg, #10ff50, #10ffaa)',
                transition: autoSendActive ? 'width 0.1s linear, opacity 0.12s ease' : 'opacity 0.18s ease',
                boxShadow: autoSendActive ? '0 0 6px #10ff50' : 'none',
                opacity: autoSendActive ? 1 : 0,
              }} />
            </div>
            {queuedPrompts.length > 0 && (
              <div style={{
                border: '1px solid #ffd36a22',
                borderRadius: 10,
                background: 'linear-gradient(180deg, rgba(32, 21, 3, 0.92), rgba(16, 11, 2, 0.92))',
                padding: 10,
                display: 'grid',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: '#ffd36ab0', textTransform: 'uppercase' }}>
                    Pending queue · {queuedPrompts.length}
                  </div>
                  <button
                    onClick={clearQueuedPrompts}
                    style={{
                      background: 'transparent',
                      border: '1px solid #ff965030',
                      color: '#ffbf97',
                      fontFamily: 'inherit',
                      fontSize: 9,
                      letterSpacing: 1,
                      padding: '4px 8px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    Clear all
                  </button>
                </div>
                <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflow: 'auto' }}>
                  {queuedPrompts.map((queuedPrompt, index) => {
                    const queuedAgent = AGENT_COLORS[queuedPrompt.agent];
                    const isEditing = editingQueuedPromptId === queuedPrompt.id;
                    return (
                      <div
                        key={queuedPrompt.id}
                        style={{
                          border: `1px solid ${queuedAgent.border}`,
                          borderRadius: 8,
                          background: 'rgba(255,255,255,0.03)',
                          padding: 10,
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 9, letterSpacing: 1.4, color: '#ffd36a', textTransform: 'uppercase' }}>
                              #{index + 1}
                            </span>
                            <span style={{ fontSize: 9, letterSpacing: 1.4, color: queuedAgent.text, textTransform: 'uppercase' }}>
                              {queuedAgent.label}
                            </span>
                            {queuedPrompt.sessionId && (
                              <span style={{ fontSize: 9, color: '#89b897' }}>
                                {queuedPrompt.sessionId.slice(0, 8)}…{queuedPrompt.sessionId.slice(-4)}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 9, color: '#7c8f7e' }}>
                            {new Date(queuedPrompt.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        {isEditing ? (
                          <textarea
                            value={editingQueuedPromptText}
                            onChange={(event) => setEditingQueuedPromptText(event.target.value)}
                            rows={3}
                            style={{
                              resize: 'vertical',
                              minHeight: 66,
                              background: '#0a150c',
                              border: '1px solid #ffd36a30',
                              color: '#f7f0cf',
                              fontFamily: 'inherit',
                              fontSize: 11,
                              lineHeight: 1.5,
                              padding: '8px 10px',
                              borderRadius: 6,
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <div style={{ color: '#f7f0cf', fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {queuedPrompt.prompt}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {isEditing ? (
                            <>
                              <button
                                onClick={saveQueuedPromptEdit}
                                disabled={!editingQueuedPromptText.trim()}
                                style={{
                                  background: 'rgba(16,255,80,0.10)',
                                  border: '1px solid #10ff5030',
                                  color: '#afffc5',
                                  fontFamily: 'inherit',
                                  fontSize: 9,
                                  letterSpacing: 1,
                                  padding: '5px 9px',
                                  borderRadius: 999,
                                  cursor: editingQueuedPromptText.trim() ? 'pointer' : 'default',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Save
                              </button>
                              <button
                                onClick={clearQueuedPromptEditor}
                                style={{
                                  background: 'transparent',
                                  border: '1px solid #ffffff18',
                                  color: '#d4ffe0',
                                  fontFamily: 'inherit',
                                  fontSize: 9,
                                  letterSpacing: 1,
                                  padding: '5px 9px',
                                  borderRadius: 999,
                                  cursor: 'pointer',
                                  textTransform: 'uppercase',
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => beginQueuedPromptEdit(queuedPrompt.id)}
                              style={{
                                background: 'transparent',
                                border: '1px solid #ffffff18',
                                color: '#d4ffe0',
                                fontFamily: 'inherit',
                                fontSize: 9,
                                letterSpacing: 1,
                                padding: '5px 9px',
                                borderRadius: 999,
                                cursor: 'pointer',
                                textTransform: 'uppercase',
                              }}
                            >
                              Edit pending
                            </button>
                          )}
                          <button
                            onClick={() => sendQueuedPromptNow(queuedPrompt.id)}
                            style={{
                              background: queuedAgent.bg,
                              border: `1px solid ${queuedAgent.border}`,
                              color: queuedAgent.text,
                              fontFamily: 'inherit',
                              fontSize: 9,
                              letterSpacing: 1,
                              padding: '5px 9px',
                              borderRadius: 999,
                              cursor: 'pointer',
                              textTransform: 'uppercase',
                            }}
                          >
                            {busy ? 'Send next' : 'Send now'}
                          </button>
                          <button
                            onClick={() => removeQueuedPrompt(queuedPrompt.id)}
                            style={{
                              background: 'transparent',
                              border: '1px solid #ff965030',
                              color: '#ffbf97',
                              fontFamily: 'inherit',
                              fontSize: 9,
                              letterSpacing: 1,
                              padding: '5px 9px',
                              borderRadius: 999,
                              cursor: 'pointer',
                              textTransform: 'uppercase',
                            }}
                          >
                            Unsend
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={draft}
                onChange={e => { 
                  setDraft(e.target.value); 
                  draftRef.current = e.target.value; 
                  // Only clear timer if user is actively typing (not during silence countdown)
                  if (!listening) clearSilenceTimer();
                }}
                onKeyDown={e => { 
                  console.log('[INPUT] Key pressed:', e.key, 'busy:', busy, 'draft:', draftRef.current);
                  if (e.key === 'Enter') {
                    console.log('[INPUT] Enter key detected, calling send()');
                    send();
                  }
                }}
                placeholder={muted ? 'Type…' : isSpeaking ? 'Lexoire is speaking…' : listening ? 'Listening…' : 'Speak…'}
                style={{
                  flex: 1, background: '#0a150c',
                  border: `1px solid ${hasDraft ? '#10ff4440' : '#10ff2220'}`,
                  color: '#d4ffe0', fontFamily: 'inherit', fontSize: 12,
                  padding: '10px 12px', outline: 'none', borderRadius: 6,
                  transition: 'all 0.2s',
                  boxShadow: hasDraft ? '0 0 10px #10ff2212' : 'none',
                  letterSpacing: 0.2,
                }}
              />
              
              {/* Send Button ── */}
              <div style={{ position: 'relative', width: 40, height: 40 }}>
                <div style={{ opacity: autoSendActive ? 1 : 0, transition: 'opacity 0.16s ease' }}>
                  <CountdownRing pct={silencePct} />
                </div>
                <button
                  onClick={() => send()}
                  disabled={!hasDraft}
                  title={`Send to ${AGENT_COLORS[agent].label}`}
                  style={{
                    width: 40, height: 40,
                    background: hasDraft ? AGENT_COLORS[agent].bg : 'transparent',
                    border: `1.5px solid ${hasDraft ? AGENT_COLORS[agent].border : '#10ff2220'}`,
                    color: hasDraft ? AGENT_COLORS[agent].text : '#10ff2240',
                    borderRadius: 6, cursor: hasDraft ? 'pointer' : 'default',
                    fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: hasDraft ? `0 0 10px ${AGENT_COLORS[agent].border}` : 'none',
                  }}
                >→</button>
              </div>

              {busy && (
                <button
                  onClick={() => {
                    confirmAbortActiveResponse();
                  }}
                  title={`Stop ${AGENT_COLORS[processingAgent].label}`}
                  style={{
                    width: 40,
                    height: 40,
                    background: 'linear-gradient(135deg, rgba(255, 68, 68, 0.18), rgba(140, 12, 12, 0.10))',
                    border: '1.5px solid #ff444466',
                    color: '#ffb3b3',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 0 10px rgba(255, 68, 68, 0.22)',
                  }}
                >
                  X
                </button>
              )}
               
              {/* Broadcast Button ── */}
              <button
                onClick={() => broadcast()}
                disabled={!hasDraft || busy}
                style={{
                  width: 40, height: 40,
                  background: hasDraft ? 'linear-gradient(135deg, rgba(255, 102, 0, 0.18), rgba(255, 68, 68, 0.08))' : 'transparent',
                  border: `1.5px solid ${hasDraft ? '#ff664450' : '#ff222220'}`,
                  color: hasDraft ? '#ffaa44' : '#ff664440',
                  borderRadius: 6, cursor: hasDraft ? 'pointer' : 'default',
                  fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: hasDraft ? '0 0 10px #ff664420' : 'none',
                }}
              >📡</button>
            </div>
            <div style={{ minHeight: 12, fontSize: 8, letterSpacing: 2, color: '#10ff4460', textAlign: 'right', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ opacity: busy ? 1 : 0, transition: 'opacity 0.16s ease', color: '#ffb3b3' }}>
                UI BUTTON TO STOP {AGENT_COLORS[processingAgent].label}
              </span>
              <span style={{ opacity: autoSendActive ? 1 : 0, transition: 'opacity 0.16s ease' }}>
                AUTO-SEND {autoSendSeconds}s
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #00ff2220; border-radius: 2px; }
      `}</style>
    </div>
  );
}
