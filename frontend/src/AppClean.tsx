import { useState, useEffect, useRef, memo } from 'react';
import { io } from 'socket.io-client';
import RealisticSphere from './components/RealisticSphere';

const SILENCE_MS = 1200; // Shorter window for faster response

interface Msg { id: number; role: 'user' | 'jarvis'; text: string; }

function BlinkCursor() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn(v => !v), 500); return () => clearInterval(t); }, []);
  return <span style={{ opacity: on ? 1 : 0, color: '#10ff50' }}>▌</span>;
}

function ThinkingDots() {
  const [dots, setDots] = useState('.');
  useEffect(() => { const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 400); return () => clearInterval(t); }, []);
  return <span>processing{dots}</span>;
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

export default function App() {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'jarvis', text: 'System online. Awaiting input.' }]);
  const [interim, setInterim] = useState('');
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [silencePct, setSilencePct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioFrequencies, setAudioFrequencies] = useState<Uint8Array | undefined>(undefined);

  const socketRef = useRef<any>(null);
  const mutedRef = useRef(false);
  const draftRef = useRef('');
  const silenceTimer = useRef<any>(null);
  const silenceTick = useRef<any>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const microphone = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationId = useRef<number | null>(null);
  const lastFrequenciesRef = useRef<Uint8Array | null>(null);
  const audioLevelHistoryRef = useRef<number[]>([]);
  const speechVelocityRef = useRef<number>(0);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, interim]);

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
    }
  };

  // ── Socket ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const url = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
    const sock = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = sock;
    
    sock.on('connect', () => {
      console.log('Connected to backend');
    });
    
    sock.on('error', (err) => {
      console.error('[SOCKET] Connection error:', err);
      addMsg('jarvis', `[ERROR] Socket connection failed: ${err}`);
    });
    
    sock.on('disconnect', (reason) => {
      console.warn('[SOCKET] Disconnected:', reason);
    });
    
    sock.on('connect_error', (err) => {
      console.error('[SOCKET] Connection error:', err);
    });
    
    sock.on('command:chunk', (data: any) => {
      if (data.chunk) {
        // Stream chunks in real-time as they arrive
        setMsgs(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'jarvis') {
            return [...prev.slice(0, -1), { ...last, text: last.text + data.chunk }];
          }
          return prev;
        });
      }
    });
    
    sock.on('command:response', () => {
      // Message already streamed via chunks, just mark as done
      // Don't speak "(no output)" - the actual content was already streamed and displayed
      setBusy(false);
    });
    
    return () => { sock.disconnect(); clearSilenceTimer(); };
  }, []);

  // ── Native speech (Swift SFSpeechRecognizer) ─────────────────────────────
  useEffect(() => {
    const jarvis = (window as any).jarvis;
    if (!jarvis?.startSpeech) return;

    jarvis.onSpeech((ev: { type: string; text?: string }) => {
      console.log('[SPEECH]', ev.type, ev.text?.slice(0, 50));
      if (mutedRef.current && ev.type !== 'error') return;
      if (ev.type === 'ready') {
        console.log('[SPEECH] Listening started');
        setListening(true);
        initAudioContext();
      } else if (ev.type === 'interim' && ev.text) {
        setInterim(ev.text);
        console.log('[SPEECH] Interim:', ev.text.slice(0, 30));
      } else if (ev.type === 'final' && ev.text) {
        console.log('[SPEECH] Final event fired with:', ev.text);
        const txt = ev.text.trim();
        if (!txt) {
          console.log('[SPEECH] Final text empty, still triggering timer');
          // Even if final text is empty, trigger the timer for any interim text
          jarvis.stopSpeechRecognition?.();
          setListening(false);
          startSilenceTimer();
          return;
        }
        const n = draftRef.current ? draftRef.current + ' ' + txt : txt;
        setDraft(n);
        draftRef.current = n;
        setInterim('');
        console.log('[SPEECH] Updated draft to:', n.slice(0, 50));
        // Stop listening and start auto-send countdown
        jarvis.stopSpeechRecognition?.();
        setListening(false);
        startSilenceTimer();
      } else if (ev.type === 'error') {
        console.error('[SPEECH] Error:', ev.text);
        addMsg('jarvis', `[ERROR] ${ev.text}`);
      }
    });
    jarvis.startSpeech().then(() => setListening(true)).catch(() => {});
    return () => { jarvis.stopSpeechRecognition?.(); };
  }, []);

  const addMsg = (role: 'user' | 'jarvis', text: string) => {
    setMsgs(prev => [...prev, { id: nextId.current++, role, text }]);
  };

  const clearSilenceTimer = () => {
    clearTimeout(silenceTimer.current);
    clearInterval(silenceTick.current);
    setSilencePct(0);
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
      const text = draftRef.current.trim();
      console.log('[SILENCE] Timeout fired, text:', text);
      if (text) {
        console.log('[SILENCE] Calling send()');
        send(text);
      }
    }, SILENCE_MS);
  };

  const send = (text?: string) => {
    clearSilenceTimer();
    const cmd = (text ?? draftRef.current).trim();
    console.log('[SEND] Called with text:', text, 'busy:', busy, 'cmd:', cmd);
    if (!cmd) {
      console.log('[SEND] Skipping: no command text');
      return;
    }
    if (busy) {
      console.log('[SEND] Skipping: already busy');
      return;
    }
    console.log('[SEND] Proceeding with command:', cmd.slice(0, 50));
    setDraft('');
    draftRef.current = '';
    setInterim('');
    addMsg('user', cmd);
    setBusy(true);
    // Pre-create a jarvis message for streaming chunks to append to
    addMsg('jarvis', '');
    
    const lower = cmd.toLowerCase();
    if (lower.includes('list sessions'))    socketRef.current?.emit('db:command', { type: 'list_sessions' });
    else if (lower.includes('new session')) socketRef.current?.emit('db:command', { type: 'new_session' });
    else if (lower.includes('status'))      socketRef.current?.emit('db:command', { type: 'status' });
    else                                    socketRef.current?.emit('copilot:prompt', { prompt: cmd });
    
    // Restart listening immediately
    const jarvis = (window as any).jarvis;
    if (jarvis?.startSpeech) {
      jarvis.startSpeech().then(() => setListening(true)).catch(() => {});
    }
  };

  const broadcast = (text?: string) => {
    clearSilenceTimer();
    const cmd = (text ?? draftRef.current).trim();
    if (!cmd || busy) return;
    setDraft('');
    draftRef.current = '';
    setInterim('');
    addMsg('user', `BROADCAST: ${cmd}`);
    setBusy(true);
    // Broadcast to all agent sessions
    socketRef.current?.emit('broadcast:prompt', { prompt: cmd });
    
    // Restart listening immediately
    const jarvis = (window as any).jarvis;
    if (jarvis?.startSpeech) {
      jarvis.startSpeech().then(() => setListening(true)).catch(() => {});
    }
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    clearSilenceTimer();
    if (next) setInterim('');
  };

  const clearChat = () => {
    setMsgs([{ id: nextId.current++, role: 'jarvis', text: 'Chat cleared.' }]);
  };

  // ── TTS: Use Web Audio API for more natural voice control ─────────────────
  // (Kept for future use - may call on certain responses)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _speak = (text: string) => {
    if (!text || text.length < 2) return;
    if (!window.speechSynthesis) return; // Safety check
    
    const clean = text.replace(/[▶◀◉⚠]/g, '').trim().substring(0, 400);
    const jarvis = (window as any).jarvis;
    if (jarvis?.speak) {
      jarvis.speak(clean);
      return;
    }
    
    // Browser fallback: use neural voices for natural sounding output
    const utter = () => {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = 0.9; // Slightly slower for clarity
      u.pitch = 1.0;
      u.volume = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // Prefer natural neural voices: Victoria (US), Ava (US), Moira (Irish), Zira (US)
        const naturalVoiceNames = ['Victoria', 'Ava', 'Moira', 'Zira', 'Samantha'];
        let preferred = null;
        for (const name of naturalVoiceNames) {
          preferred = voices.find(v => v.name.includes(name));
          if (preferred) break;
        }
        if (preferred) u.voice = preferred;
        else u.voice = voices[0];
      }
      
      window.speechSynthesis.speak(u);
    };
    
    // Retry logic for voice loading race condition
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      utter();
    } else {
      // Voices not loaded yet, wait for voiceschanged event
      const handler = () => {
        utter();
        window.speechSynthesis.removeEventListener('voiceschanged', handler);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handler);
      
      // Fallback: if voices never load, speak anyway after 500ms
      setTimeout(() => {
        if (!window.speechSynthesis.speaking) utter();
      }, 500);
    }
  };

  const hasDraft = draft.trim().length > 0 || interim.trim().length > 0;

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #071a0e 0%, #040a06 55%, #020504 100%)',
      color: '#c8ffd4', fontFamily: '"SF Mono", "Fira Code", "Courier New", monospace',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      userSelect: 'none',
    }}>
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {busy && <span style={{ fontSize: 10, letterSpacing: 2, color: '#10ff50', animation: 'pulse 1s infinite', textTransform: 'uppercase' }}>PROCESSING</span>}
          <span style={{ fontSize: 10, letterSpacing: 2, color: muted ? '#ff4444' : listening ? '#10ff50' : '#10ff5040', textTransform: 'uppercase' }}>
            {muted ? 'MUTED' : listening ? 'LIVE' : 'IDLE'}
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
        </div>
      </div>

      {/* ── Body: full horizontal layout (sphere left, chat right, edge-to-edge) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', gap: 0 }}>
        {/* ── Sphere: full height, takes remaining space ── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', 
          background: 'linear-gradient(135deg, #030806 0%, #05140a 100%)',
          position: 'relative',
          padding: 0,
          margin: 0,
        }}>
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sphere listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocityRef.current} />
          </div>
          
          {/* Transcription overlay at bottom ── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '16px 20px', textAlign: 'center',
            background: 'linear-gradient(180deg, transparent 0%, rgba(3, 8, 6, 0.8) 100%)',
          }}>
            {draft && <div style={{ fontSize: 14, color: '#10ff50', marginBottom: 8, fontWeight: 600, letterSpacing: 1 }}>{draft}</div>}
            <div style={{ fontSize: 12, color: muted ? '#ff444466' : '#10ff4499', fontStyle: 'italic', letterSpacing: 0.5 }}>
              {muted ? '[ muted ]' : interim ? interim : listening ? <BlinkCursor /> : '[ standby ]'}
            </div>
          </div>
        </div>

        {/* ── Chat + input: sidebar right, edge-to-edge ── */}
        <div style={{ width: 380, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '1px solid #10ff5015', background: 'linear-gradient(90deg, #030806, #05140a)', padding: 0, margin: 0 }}>
          {/* Messages ── */}
          <div style={{
            flex: 1, overflow: 'auto', padding: '20px 16px',
            display: 'flex', flexDirection: 'column', gap: 12,
            scrollbarWidth: 'thin',
          }}>
            {msgs.filter(m => m.text.trim()).map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '12px 14px',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: m.role === 'user'
                    ? 'linear-gradient(135deg, #10ff2222 0%, #10cc5514 100%)'
                    : 'linear-gradient(135deg, #0a1a0e 0%, #061008 100%)',
                  border: m.role === 'user' ? '1px solid #10ff4430' : '1px solid #10ff2218',
                  color: m.role === 'user' ? '#d4ffe0' : '#a8e0b8',
                  fontSize: 12, lineHeight: 1.6, letterSpacing: 0.2,
                  boxShadow: m.role === 'user' ? '0 2px 10px #10ff2210' : '0 2px 6px #00000040',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {busy && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '12px 14px', borderRadius: '12px 12px 12px 2px', background: '#0a1a0e', border: '1px solid #10ff2218', fontSize: 11, color: '#10ff4466', letterSpacing: 0.3 }}>
                  <ThinkingDots />
                </div>
              </div>
            )}
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
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
                placeholder={muted ? 'Type…' : listening ? 'Speaking…' : 'Speak…'}
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
                  style={{
                    width: 40, height: 40,
                    background: hasDraft ? 'linear-gradient(135deg, #10ff4420, #10dd8814)' : 'transparent',
                    border: `1.5px solid ${hasDraft ? '#10ff4450' : '#10ff2220'}`,
                    color: hasDraft ? '#10ff50' : '#10ff2240',
                    borderRadius: 6, cursor: hasDraft ? 'pointer' : 'default',
                    fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    backdropFilter: 'blur(8px)',
                    boxShadow: hasDraft ? '0 0 10px #10ff4420' : 'none',
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
                  border: `1.5px solid ${hasDraft ? '#ff6644 50' : '#ff222220'}`,
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
