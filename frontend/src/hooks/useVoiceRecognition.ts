import { useState, useEffect, useRef, useCallback } from 'react';

interface VoiceRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  silenceTimeoutMs?: number;
  onSilenceTranscript?: (transcript: string) => void;
}

export const useVoiceRecognition = (options: VoiceRecognitionOptions = {}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [isSilent, setIsSilent] = useState(false);
  const [hasSpokenText, setHasSpokenText] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const isListeningRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const emitTranscriptOnEndRef = useRef(false);
  const onSilenceTranscriptRef = useRef<VoiceRecognitionOptions['onSilenceTranscript']>(options.onSilenceTranscript);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    onSilenceTranscriptRef.current = options.onSilenceTranscript;
  }, [options.onSilenceTranscript]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Speech recognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = options.continuous ?? true;
    recognition.interimResults = options.interimResults ?? true;
    recognition.lang = options.lang ?? 'en-US';

    const scheduleSilenceTimer = () => {
      clearSilenceTimer();
      setIsSilent(false);

      silenceTimerRef.current = window.setTimeout(() => {
        emitTranscriptOnEndRef.current = true;
        setIsSilent(true);
        if (isListeningRef.current) {
          recognition.stop();
        }
      }, options.silenceTimeoutMs ?? 1400);
    };

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setError(null);
      setConfidence(0);
      setIsSilent(false);
      setHasSpokenText(false);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      let confidenceSum = 0;
      let resultCount = 0;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0].transcript;
        const conf = result[0].confidence || 0;

        if (result.isFinal) {
          final += text;
          confidenceSum += conf;
          resultCount += 1;
        } else {
          interim += text;
          confidenceSum += conf;
          resultCount += 1;
        }
      }

      if (final) {
        setTranscript((prev) => {
          const nextTranscript = [prev, final].map((value) => value.trim()).filter(Boolean).join(' ');
          transcriptRef.current = nextTranscript;
          return nextTranscript;
        });
        setHasSpokenText(true);
      }
      
      setInterimTranscript(interim);
      
      if (resultCount > 0) {
        const avgConfidence = confidenceSum / resultCount;
        setConfidence(avgConfidence);
      }

      if ((final || interim) && isListeningRef.current) {
        setIsSilent(false);
        scheduleSilenceTimer();
      }
    };

    recognition.onerror = (event: any) => {
      clearSilenceTimer();
      isListeningRef.current = false;
      setIsListening(false);

      if (event.error !== 'aborted') {
        setError(event.error);
      }
    };

    recognition.onend = () => {
      clearSilenceTimer();
      isListeningRef.current = false;
      setIsListening(false);

      if (emitTranscriptOnEndRef.current) {
        emitTranscriptOnEndRef.current = false;
        const finalTranscript = transcriptRef.current.trim();

        if (finalTranscript) {
          onSilenceTranscriptRef.current?.(finalTranscript);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      clearSilenceTimer();
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      isListeningRef.current = false;
      setIsListening(false);
    };
  }, [clearSilenceTimer, options.continuous, options.interimResults, options.lang, options.silenceTimeoutMs]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListeningRef.current) return;

    setError(null);
    setTranscript('');
    setInterimTranscript('');
    transcriptRef.current = '';
    emitTranscriptOnEndRef.current = false;

    try {
      isListeningRef.current = true;
      recognitionRef.current.start();
    } catch (err: any) {
      isListeningRef.current = false;
      setError(err.message);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (!isListeningRef.current) return;

    try {
      emitTranscriptOnEndRef.current = false;
      clearSilenceTimer();
      recognitionRef.current.stop();
    } catch (err: any) {
      isListeningRef.current = false;
      setError(err.message);
      setIsListening(false);
    }
  }, [clearSilenceTimer]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setConfidence(0);
    setIsSilent(false);
    setHasSpokenText(false);
    transcriptRef.current = '';
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    confidence,
    isSilent,
    hasSpokenText,
    error,
    isSupported,
    startListening,
    stopListening,
    resetTranscript
  };
};
