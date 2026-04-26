import { useState, useEffect, useRef, memo } from 'react';
import { io } from 'socket.io-client';
import RealisticSphere from './components/RealisticSphere';

const SILENCE_MS = 2300; // 2.3 seconds without new words triggers auto-send

type Agent = 'copilot' | 'claude' | 'codex';
type VoiceMode = 'hifi' | 'classic';
interface Msg { id: number; role: 'user' | 'jarvis'; text: string; agent?: Agent; }
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
}
interface SessionDraft {
  name: string;
  repoPath: string;
  branch: string;
  objective: string;
  agent: Agent;
}

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

const AGENT_COLORS: Record<Agent, { border: string; bg: string; text: string; label: string }> = {
  copilot: { border: '#10ff4430', bg: 'linear-gradient(135deg, #0a1a0e 0%, #061008 100%)', text: '#a8e0b8', label: 'COPILOT' },
  claude:  { border: '#f5c842aa', bg: 'linear-gradient(135deg, #1a1400 0%, #100d00 100%)', text: '#f5e07a', label: 'CLAUDE'  },
  codex:   { border: '#4fa3ffaa', bg: 'linear-gradient(135deg, #001230 0%, #000c20 100%)', text: '#80c8ff', label: 'CODEX'   },
};

export default function App() {
  const [agent, setAgent] = useState<Agent>('copilot');
  const agentRef = useRef<Agent>('copilot');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'jarvis', text: 'System online. Awaiting input.', agent: 'copilot' }]);
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
  const [speechQueueCount, setSpeechQueueCount] = useState(0);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
  const [workspaceSessions, setWorkspaceSessions] = useState<WorkspaceSession[]>([]);
  const [activeWorkspaceSessionId, setActiveWorkspaceSessionId] = useState('');
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>({
    name: '',
    repoPath: '',
    branch: '',
    objective: '',
    agent: 'copilot',
  });
  const [sessionNotice, setSessionNotice] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioFrequencies, setAudioFrequencies] = useState<Uint8Array | undefined>(undefined);
  const [warnDismissed, setWarnDismissed] = useState(false);

  const socketRef = useRef<any>(null);
  const busyRef = useRef(false);
  const mutedRef = useRef(false);
  const voiceRepliesRef = useRef(true);
  const voiceModeRef = useRef<VoiceMode>('hifi');
  const micPermissionRef = useRef<'unknown' | 'granted' | 'denied'>('unknown');
  const micPermissionNoticeRef = useRef(false);
  const draftRef = useRef('');
  const interimRef = useRef('');
  const silenceTimer = useRef<any>(null);
  const silenceTick = useRef<any>(null);
  const listeningRestartTimer = useRef<number | null>(null);
  const responseTimer = useRef<any>(null);
  const promptQueueRef = useRef<string[]>([]);
  const speechQueueRef = useRef<string[]>([]);
  const streamedResponseRef = useRef('');
  const speechActiveRef = useRef(false);
  const browserRecognitionRef = useRef<any>(null);
  const browserSpeechFinalRef = useRef('');
  const suppressRecognitionResumeRef = useRef(false);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const microphone = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationId = useRef<number | null>(null);
  const lastFrequenciesRef = useRef<Uint8Array | null>(null);
  const audioLevelHistoryRef = useRef<number[]>([]);
  const speechVelocityRef = useRef<number>(0);

  const logDebug = (message: string) => {
    console.log('[JARVIS]', message);
  };

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { agentRef.current = agent; }, [agent]);
  useEffect(() => { voiceRepliesRef.current = voiceReplies; }, [voiceReplies]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { micPermissionRef.current = micPermission; }, [micPermission]);
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, interim]);
  useEffect(() => {
    if (sessionDropdownOpen) {
      refreshWorkspaceSessions();
    }
  }, [sessionDropdownOpen]);
  useEffect(() => () => {
    if (listeningRestartTimer.current !== null) {
      window.clearTimeout(listeningRestartTimer.current);
    }
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
    if (audioContextRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
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
        setListening(false);
        clearListeningRestartTimer();
        if (!micPermissionNoticeRef.current) {
          micPermissionNoticeRef.current = true;
          addMsg('jarvis', '[ERROR] Microphone permission is blocked. Enable Microphone and Speech Recognition in System Settings > Privacy & Security, then restart JARVIS.');
        }
      }
    }
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
      addMsg('jarvis', `[ERROR] Socket connection failed: ${err}`);
    });
    
    sock.on('disconnect', (reason) => {
      logDebug(`socket disconnected: ${reason}`);
      clearResponseTimer();
      busyRef.current = false;
      setBusy(false);
    });
    
    sock.on('connect_error', (err) => {
      console.error('[SOCKET] Connection error:', err);
      clearResponseTimer();
      setBusy(false);
    });
    
    const appendChunk = (chunk: string) => {
      busyRef.current = true;
      setBusy(true);
      streamedResponseRef.current += chunk;
      logDebug(`chunk ${chunk.length} chars`);
      setMsgs(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'jarvis') {
          return [...prev.slice(0, -1), { ...last, text: last.text + chunk }];
        }
        return prev;
      });
    };

    const handleResponse = (data: CommandResponsePayload, ag?: Agent) => {
      logDebug(`${(ag || agentRef.current).toUpperCase()} response complete`);
      clearResponseTimer();
      if (data.sessionId) setCurrentSessionId(data.sessionId);

      const fallbackText = data.result?.trim() || '';
      const safeFallback = fallbackText === '(no output)' ? '' : fallbackText;
      const finalFallback = safeFallback;
      let spokenText = streamedResponseRef.current.trim() || finalFallback;
      setMsgs(prev => {
        const last = prev[prev.length - 1];
        const finalText = last?.role === 'jarvis'
          ? last.text.trim() || finalFallback
          : finalFallback;
        spokenText = finalText || spokenText;

        if (last?.role === 'jarvis') {
          if (!finalText) return prev.slice(0, -1);
          return [...prev.slice(0, -1), { ...last, text: finalText, agent: ag ?? last.agent }];
        }
        return finalText ? [...prev, { id: nextId.current++, role: 'jarvis', text: finalText, agent: ag }] : prev;
      });

      if (data.cue === 'bubble') {
        playBubbleCue();
      } else if (spokenText && !data.suppressSpeech) {
        _speak(spokenText);
      } else if (!speechActiveRef.current) {
        scheduleListeningResume();
      }

      busyRef.current = false;
      setBusy(false);
      streamedResponseRef.current = '';
      processNextQueuedPrompt();
    };

    sock.on('command:chunk', (data: any) => { if (data.chunk) appendChunk(data.chunk); });
    sock.on('command:response', (data: CommandResponsePayload) => handleResponse(data, 'copilot'));
    sock.on('claude:chunk',    (data: any) => { if (data.chunk) appendChunk(data.chunk); });
    sock.on('claude:response', (data: CommandResponsePayload) => handleResponse(data, 'claude'));
    sock.on('codex:chunk',     (data: any) => { if (data.chunk) appendChunk(data.chunk); });
    sock.on('codex:response',  (data: CommandResponsePayload) => handleResponse(data, 'codex'));
    sock.on('agent:status', (data: any) => {
      const provider = String(data?.provider || 'agent').toUpperCase();
      const phase = String(data?.phase || 'status');
      const detail = data?.detail ? ` ${data.detail}` : '';
      logDebug(`${provider} ${phase}${detail}`);
      if (phase === 'start' || phase === 'chunk') {
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
    const jarvis = (window as any).jarvis;
    jarvis?.onSpeech?.((ev: { type: string; text?: string }) => {
      console.log('[SPEECH]', ev.type, ev.text?.slice(0, 50));
      if (mutedRef.current && ev.type !== 'error') return;
      if (speechActiveRef.current && ev.type !== 'error') {
        if (ev.type === 'ready') {
          stopListening();
        }
        return;
      }
      if (ev.type === 'ready') {
        console.log('[SPEECH] Listening started');
        setListening(true);
        initAudioContext();
      } else if (ev.type === 'interim' && ev.text) {
        const txt = ev.text.trim();
        if (!txt) return;
        setInterim(txt);
        interimRef.current = txt;
        console.log('[SPEECH] Interim:', txt.slice(0, 30));
        startSilenceTimer();
      } else if (ev.type === 'final' && ev.text) {
        console.log('[SPEECH] Final event fired with:', ev.text);
        const txt = ev.text.trim();
        if (!txt) {
          console.log('[SPEECH] Final text empty, still triggering timer');
          // Even if final text is empty, trigger the timer for any interim text
          stopListening();
          startSilenceTimer();
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
        console.error('[SPEECH] Error:', ev.text);
        const errorText = ev.text || 'Speech recognition failed';
        const permissionDenied = /denied|notdetermined|restricted|permission|privacy/i.test(errorText);
        if (permissionDenied) {
          micPermissionRef.current = 'denied';
          setMicPermission('denied');
          setListening(false);
          clearListeningRestartTimer();
          if (!micPermissionNoticeRef.current) {
            micPermissionNoticeRef.current = true;
            addMsg('jarvis', '[ERROR] Microphone or Speech Recognition permission is blocked. Enable both in System Settings > Privacy & Security, then restart JARVIS.');
          }
          return;
        }
        addMsg('jarvis', `[ERROR] ${errorText}`);
        scheduleListeningResume(600);
      }
    });
    startListening();
    return () => { stopListening(); };
  }, []);

  const addMsg = (role: 'user' | 'jarvis', text: string, ag?: Agent) => {
    setMsgs(prev => [...prev, { id: nextId.current++, role, text, agent: ag ?? agentRef.current }]);
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

  const startResponseTimer = (provider: Agent) => {
    clearResponseTimer();
    responseTimer.current = window.setTimeout(() => {
      responseTimer.current = null;
      busyRef.current = false;
      setBusy(false);
      setMsgs(prev => {
        const last = prev[prev.length - 1];
        const message = `[ERROR] ${AGENT_COLORS[provider].label} did not respond. Check the provider CLI or try another provider for this session.`;
        if (last?.role === 'jarvis' && !last.text.trim()) {
          return [...prev.slice(0, -1), { ...last, text: message, agent: provider }];
        }
        return [...prev, { id: nextId.current++, role: 'jarvis', text: message, agent: provider }];
      });
      scheduleListeningResume(400);
    }, 45000);
  };

  const clearListeningRestartTimer = () => {
    if (listeningRestartTimer.current !== null) {
      window.clearTimeout(listeningRestartTimer.current);
      listeningRestartTimer.current = null;
    }
  };

  const stopListening = () => {
    clearListeningRestartTimer();
    suppressRecognitionResumeRef.current = true;
    if (browserRecognitionRef.current) {
      try { browserRecognitionRef.current.stop(); } catch {}
    }
    const jarvis = (window as any).jarvis;
    jarvis?.stopSpeechRecognition?.();
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
      micPermissionRef.current = 'granted';
      setMicPermission('granted');
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

      if (finalText.trim()) {
        browserSpeechFinalRef.current = [browserSpeechFinalRef.current, finalText.trim()].filter(Boolean).join(' ');
        const nextDraft = draftRef.current ? `${draftRef.current} ${finalText.trim()}` : finalText.trim();
        setDraft(nextDraft);
        draftRef.current = nextDraft;
        setInterim('');
        interimRef.current = '';
      } else if (interimText.trim()) {
        setInterim(interimText.trim());
        interimRef.current = interimText.trim();
      }
      if (finalText.trim() || interimText.trim()) startSilenceTimer();
    };

    recognition.onerror = (event: any) => {
      const error = String(event?.error || 'speech recognition failed');
      if (browserRecognitionRef.current === recognition) {
        browserRecognitionRef.current = null;
      }
      setListening(false);
      if (/not-allowed|service-not-allowed|permission|denied/i.test(error)) {
        micPermissionRef.current = 'denied';
        setMicPermission('denied');
        clearListeningRestartTimer();
        if (!micPermissionNoticeRef.current) {
          micPermissionNoticeRef.current = true;
          addMsg('jarvis', '[ERROR] Microphone permission is blocked. Enable microphone access for JARVIS, then restart the app.');
        }
      }
    };

    recognition.onend = () => {
      const shouldResume = !suppressRecognitionResumeRef.current;
      suppressRecognitionResumeRef.current = false;
      if (browserRecognitionRef.current === recognition) {
        browserRecognitionRef.current = null;
      }
      setListening(false);
      if (shouldResume && !mutedRef.current && !speechActiveRef.current && micPermissionRef.current !== 'denied') {
        scheduleListeningResume(300);
      }
    };

    browserRecognitionRef.current = recognition;
    recognition.start();
    return true;
  };

  const startListening = () => {
    if (mutedRef.current || speechActiveRef.current || micPermissionRef.current === 'denied') return;
    suppressRecognitionResumeRef.current = false;
    if (startBrowserSpeech()) return;

    const jarvis = (window as any).jarvis;
    if (!jarvis?.startSpeech) return;
    jarvis.requestMic?.()
      .then((allowed: boolean) => {
        if (!allowed) {
          micPermissionRef.current = 'denied';
          setMicPermission('denied');
          setListening(false);
          clearListeningRestartTimer();
          if (!micPermissionNoticeRef.current) {
            micPermissionNoticeRef.current = true;
            addMsg('jarvis', '[ERROR] Microphone permission is blocked. Enable Microphone and Speech Recognition in System Settings > Privacy & Security, then restart JARVIS.');
          }
          return;
        }
        micPermissionRef.current = 'granted';
        setMicPermission('granted');
        jarvis.startSpeech().catch((err: unknown) => {
          addMsg('jarvis', `[ERROR] Failed to start speech recognition: ${err instanceof Error ? err.message : String(err)}`);
        });
      })
      .catch((err: unknown) => {
        micPermissionRef.current = 'denied';
        setMicPermission('denied');
        setListening(false);
        clearListeningRestartTimer();
        if (!micPermissionNoticeRef.current) {
          micPermissionNoticeRef.current = true;
          addMsg('jarvis', `[ERROR] Unable to request microphone permission: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
  };

  const scheduleListeningResume = (delay = 220) => {
    clearListeningRestartTimer();
    if (mutedRef.current || speechActiveRef.current || micPermissionRef.current === 'denied') return;
    listeningRestartTimer.current = window.setTimeout(() => {
      listeningRestartTimer.current = null;
      if (!mutedRef.current && !speechActiveRef.current) {
        startListening();
      }
    }, delay);
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
    if (mutedRef.current) {
      scheduleListeningResume();
      return;
    }

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
        scheduleListeningResume(700);
      }, 460);
    }
  };

  const playSendCue = async () => {
    if (mutedRef.current) return;
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
      }));
      setSessionNotice(`Session "${name}" is ready.`);
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
    if (!window.confirm(`Delete session "${session?.name || id}"? This removes it from JARVIS session management.`)) return;
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

  const processNextQueuedPrompt = () => {
    if (busyRef.current) return;
    const nextPrompt = promptQueueRef.current.shift();
    setQueuedPromptCount(promptQueueRef.current.length);
    if (nextPrompt) {
      window.setTimeout(() => dispatchPrompt(nextPrompt, true), 120);
    }
  };

  const getLocalResponse = (cmd: string) => {
    const normalized = cmd
      .toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (/^(yo|hey|hi|hello|sup|what's up|whats up|jarvis|hey jarvis|yo jarvis)$/.test(normalized)) {
      return 'I hear you.';
    }

    return '';
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

  const dispatchPrompt = (cmd: string, userBubbleAlreadyExists = false) => {
    if (!socketRef.current?.connected) {
      console.warn('[SEND] Skipping: socket disconnected');
      if (!userBubbleAlreadyExists) addMsg('user', cmd);
      setMsgs(prev => [...prev, { id: nextId.current++, role: 'jarvis', text: '[ERROR] Backend disconnected. Relaunch JARVIS.' }]);
      socketRef.current?.connect?.();
      return;
    }

    console.log('[SEND] Proceeding with command:', cmd.slice(0, 50));
    logDebug(`send ${agentRef.current.toUpperCase()}: ${cmd.slice(0, 80)}`);
    if (!userBubbleAlreadyExists) addMsg('user', cmd);
    busyRef.current = true;
    setBusy(true);
    streamedResponseRef.current = '';
    const provider = agentRef.current;
    // Add placeholder bubble tagged with current agent
    setMsgs(prev => [...prev, { id: nextId.current++, role: 'jarvis', text: '', agent: provider }]);
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
      const ev = agentRef.current === 'claude' ? 'claude:prompt'
               : agentRef.current === 'codex'  ? 'codex:prompt'
               : 'copilot:prompt';
      socketRef.current?.emit(ev, { prompt: cmd, sessionId: activeWorkspaceSessionId || undefined });
    }

    startResponseTimer(provider);
  };

  const send = (text?: string) => {
    clearSilenceTimer();
    const cmd = (text ?? draftRef.current).trim();
    console.log('[SEND] Called with text:', text, 'busy:', busy, 'cmd:', cmd);
    if (!cmd) {
      console.log('[SEND] Skipping: no command text');
      return;
    }
    stopListening();
    setDraft('');
    draftRef.current = '';
    setInterim('');
    interimRef.current = '';

    if (busyRef.current) {
      console.log('[SEND] Queueing: already busy');
      addMsg('user', cmd);
      promptQueueRef.current.push(cmd);
      setQueuedPromptCount(promptQueueRef.current.length);
      scheduleListeningResume(180);
      return;
    }

    const localResponse = getLocalResponse(cmd);
    if (localResponse) {
      addMsg('user', cmd);
      addMsg('jarvis', localResponse);
      _speak(localResponse);
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
    clearSilenceTimer();
    if (next) {
      stopListening();
      setInterim('');
      setDraft('');
      draftRef.current = '';
      speechQueueRef.current = [];
      setSpeechQueueCount(0);
      speechActiveRef.current = false;
      setIsSpeaking(false);
      window.speechSynthesis?.cancel?.();
      (window as any).jarvis?.stopSpeech?.();
      return;
    }
    scheduleListeningResume(120);
  };

  const clearChat = () => {
    setMsgs([{ id: nextId.current++, role: 'jarvis', text: 'Chat cleared.' }]);
  };

  const playNextSpeech = () => {
    const next = speechQueueRef.current.shift();
    setSpeechQueueCount(speechQueueRef.current.length);
    if (!next) {
      speechActiveRef.current = false;
      setIsSpeaking(false);
      scheduleListeningResume();
      return;
    }

    speechActiveRef.current = true;
    setIsSpeaking(true);
    setInterim('');
    interimRef.current = '';
    stopListening();

    const finish = () => {
      speechActiveRef.current = false;
      setIsSpeaking(false);
      if (speechQueueRef.current.length > 0) {
        playNextSpeech();
        return;
      }
      scheduleListeningResume(700); // delay lets speaker audio dissipate before mic reopens
    };

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(next);
      utterance.rate = voiceModeRef.current === 'classic' ? 0.78 : 0.92;
      utterance.pitch = voiceModeRef.current === 'classic' ? 0.72 : 0.98;
      utterance.volume = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferredVoiceNames = voiceModeRef.current === 'classic'
        ? ['Fred', 'Ralph', 'Albert', 'Microsoft David', 'Microsoft Mark']
        : ['Microsoft Aria', 'Microsoft Jenny', 'Google US English', 'Google UK English Female', 'Samantha', 'Eddy', 'Reed', 'Flo', 'Ava', 'Allison'];
      const preferredVoice = preferredVoiceNames
        .map((name) => voices.find((voice) => voice.name.includes(name)))
        .find(Boolean);

      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
      return;
    }

    const jarvis = (window as any).jarvis;
    if (jarvis?.speak) {
      Promise.resolve(jarvis.speak({ text: next, mode: voiceModeRef.current })).then(finish).catch(finish);
      return;
    }

    finish();
  };

  const _speak = (text: string) => {
    if (mutedRef.current || !voiceRepliesRef.current) return;
    const clean = stripSpeechMarkup(text).replace(/[▶◀◉⚠]/g, '').trim().substring(0, 400);
    if (!clean) return;
    speechQueueRef.current.push(clean);
    setSpeechQueueCount(speechQueueRef.current.length);
    if (!speechActiveRef.current) playNextSpeech();
  };

  const shortSessionId = currentSessionId ? `${currentSessionId.slice(0, 8)}…${currentSessionId.slice(-4)}` : 'NEW';
  const hasDraft = draft.trim().length > 0 || interim.trim().length > 0;
  const liveLabel = micPermission === 'denied' ? 'NO MIC' : muted ? 'MUTED' : isSpeaking ? 'SPEAKING' : listening ? 'LIVE' : 'IDLE';
  const liveColor = micPermission === 'denied' ? '#ff9650' : muted ? '#ff4444' : isSpeaking ? '#7ad7ff' : listening ? '#10ff50' : '#10ff5040';

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
        display: 'flex', alignItems: 'center', gap: 16,
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      } as any}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 8, color: '#10ff50', textTransform: 'uppercase' }}>JARVIS</span>
        <span style={{ fontSize: 10, letterSpacing: 4, color: '#10ff5060', textTransform: 'uppercase' }}>AI ORCHESTRATOR</span>

        {/* ── Agent selector ── */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 20, background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 3, border: '1px solid #ffffff10' }}>
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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <button onClick={() => setSessionDropdownOpen(v => !v)} style={{
            background: 'linear-gradient(135deg, rgba(16, 255, 80, 0.12), rgba(0, 204, 120, 0.05))',
            border: '1px solid #10ff5030',
            color: '#afffc5',
            fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 1.4,
            padding: '7px 12px', cursor: 'pointer', borderRadius: 6,
            textTransform: 'uppercase',
          }}>
            Sessions {shortSessionId} {sessionDropdownOpen ? '▴' : '▾'}
          </button>
          {queuedPromptCount > 0 && <span style={{ fontSize: 10, letterSpacing: 1.6, color: '#ffd36a', textTransform: 'uppercase' }}>Queue {queuedPromptCount}</span>}
          {speechQueueCount > 0 && <span style={{ fontSize: 10, letterSpacing: 1.6, color: '#7ad7ff', textTransform: 'uppercase' }}>Voice {speechQueueCount}</span>}
          {busy && <span style={{ fontSize: 10, letterSpacing: 2, color: AGENT_COLORS[agent].text, animation: 'pulse 1s infinite', textTransform: 'uppercase' }}>{AGENT_COLORS[agent].label} PROCESSING</span>}
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
              speechQueueRef.current = [];
              setSpeechQueueCount(0);
              window.speechSynthesis?.cancel?.();
              (window as any).jarvis?.stopSpeech?.();
              speechActiveRef.current = false;
              setIsSpeaking(false);
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
            window.speechSynthesis?.cancel?.();
            (window as any).jarvis?.stopSpeech?.();
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
          {sessionDropdownOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 520,
              maxWidth: 'calc(100vw - 28px)',
              padding: 14,
              borderRadius: 12,
              border: '1px solid #10ff5022',
              background: 'linear-gradient(180deg, rgba(4, 18, 9, 0.96), rgba(3, 10, 6, 0.96))',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(18px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: '#10ff5080', textTransform: 'uppercase' }}>Session Router</div>
                <div style={{ fontSize: 9, letterSpacing: 1.4, color: AGENT_COLORS[agent].text, textTransform: 'uppercase' }}>Provider: {AGENT_COLORS[agent].label}</div>
              </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, maxHeight: 300, overflow: 'auto', marginBottom: 12 }}>
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ── Sphere (top center, fixed height) ── */}
        <div style={{
          flexShrink: 0, height: 320,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(180deg, #040c06 0%, #030806 100%)',
          borderBottom: '1px solid #10ff5012',
          position: 'relative',
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(180deg, #030806, #05140a)' }}>
          {/* Messages ── */}
          <div style={{
            flex: 1, overflow: 'auto', padding: '20px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
            scrollbarWidth: 'thin',
          }}>
            {msgs.filter(m => m.text.trim() || (busy && m.role === 'jarvis')).map(m => {
              const ac = m.agent ? AGENT_COLORS[m.agent] : AGENT_COLORS.copilot;
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 3 }}>
                  {m.role === 'jarvis' && m.agent && (
                    <span style={{ fontSize: 8, letterSpacing: 2, color: ac.text + '99', textTransform: 'uppercase', paddingLeft: 4 }}>{ac.label}</span>
                  )}
                  <div style={{
                    maxWidth: '85%',
                    padding: '12px 14px',
                    borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: m.role === 'user'
                      ? 'linear-gradient(135deg, #10ff2222 0%, #10cc5514 100%)'
                      : ac.bg,
                    border: m.role === 'user' ? '1px solid #10ff4430' : `1px solid ${ac.border}`,
                    color: m.role === 'user' ? '#d4ffe0' : ac.text,
                    fontSize: 12, lineHeight: 1.6, letterSpacing: 0.2,
                    boxShadow: m.role === 'user' ? '0 2px 10px #10ff2210' : '0 2px 6px #00000040',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {m.text.trim() ? renderMessageText(m.text) : <ThinkingDots />}
                  </div>
                </div>
              );
            })}
            <div ref={msgsEndRef} />
          </div>

          {/* Input bar ── */}
          <div style={{ padding: '12px 12px', borderTop: '1px solid #10ff5015', background: 'linear-gradient(0deg, #030806 0%, transparent 100%)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            {silencePct > 0 && (
              <div style={{ height: 2, background: '#10ff2215', borderRadius: 1, overflow: 'hidden', margin: '0 -12px 0 -12px', width: 'calc(100% + 24px)' }}>
                <div style={{
                  height: '100%', width: `${silencePct}%`,
                  background: 'linear-gradient(90deg, #10ff50, #10ffaa)',
                  transition: 'width 0.1s linear',
                  boxShadow: '0 0 6px #10ff50',
                }} />
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
                placeholder={muted ? 'Type…' : isSpeaking ? 'Jarvis is speaking…' : listening ? 'Listening…' : 'Speak…'}
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
                {silencePct > 0 && <CountdownRing pct={silencePct} />}
                <button
                  onClick={() => send()}
                  disabled={!hasDraft || busy}
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
            {silencePct > 0 && <div style={{ fontSize: 8, letterSpacing: 2, color: '#10ff4460', textAlign: 'right', textTransform: 'uppercase' }}>
              AUTO-SEND {((SILENCE_MS * (1 - silencePct / 100)) / 1000).toFixed(1)}s
            </div>}
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
