import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface SpeechSynthesisOptions {
  enabled: boolean;
  lang: string;
  voiceStyle?: 'natural' | 'clear' | 'default';
  rate?: number;
  fallbackEndpoint?: string;
}

const NATURAL_VOICE_KEYWORDS = ['premium', 'enhanced', 'natural', 'neural', 'flo', 'eddy', 'samantha', 'alex', 'daniel'];
const CLEAR_VOICE_KEYWORDS = ['alex', 'daniel', 'samantha', 'serena', 'allison'];

const scoreVoice = (
  voice: SpeechSynthesisVoice,
  lang: string,
  voiceStyle: 'natural' | 'clear' | 'default'
) => {
  const normalizedLang = lang.toLowerCase();
  const primaryLanguage = normalizedLang.split('-')[0];
  const normalizedVoiceName = voice.name.toLowerCase();
  const normalizedVoiceLang = voice.lang.toLowerCase();

  let score = 0;

  if (normalizedVoiceLang === normalizedLang) {
    score += 50;
  } else if (normalizedVoiceLang.startsWith(`${primaryLanguage}-`) || normalizedVoiceLang === primaryLanguage) {
    score += 25;
  }

  if (voice.localService) {
    score += 10;
  }

  const keywordPool = voiceStyle === 'clear' ? CLEAR_VOICE_KEYWORDS : NATURAL_VOICE_KEYWORDS;
  if (voiceStyle !== 'default' && keywordPool.some((keyword) => normalizedVoiceName.includes(keyword))) {
    score += 20;
  }

  if (voice.default) {
    score += 5;
  }

  return score;
};

const pickVoice = (
  voices: SpeechSynthesisVoice[],
  lang: string,
  voiceStyle: 'natural' | 'clear' | 'default'
) =>
  [...voices]
    .sort((left, right) => scoreVoice(right, lang, voiceStyle) - scoreVoice(left, lang, voiceStyle))[0]
  || null;

const pickFallbackVoice = (lang: string, voiceStyle: 'natural' | 'clear' | 'default') => {
  const normalizedLang = lang.toLowerCase();

  if (voiceStyle === 'default') {
    return undefined;
  }

  if (normalizedLang === 'en-gb') {
    return voiceStyle === 'clear' ? 'Daniel' : 'Flo (English (UK))';
  }

  if (normalizedLang.startsWith('en')) {
    return voiceStyle === 'clear' ? 'Alex' : 'Flo (English (US))';
  }

  return undefined;
};

export const useSpeechSynthesis = ({
  enabled,
  lang,
  voiceStyle = 'natural',
  rate = 0.92,
  fallbackEndpoint
}: SpeechSynthesisOptions) => {
  const [hasBrowserSupport, setHasBrowserSupport] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const playbackQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    setHasBrowserSupport(true);

    const updateVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const selectedVoice = useMemo(() => pickVoice(voices, lang, voiceStyle), [lang, voiceStyle, voices]);
  const fallbackVoice = useMemo(() => pickFallbackVoice(lang, voiceStyle), [lang, voiceStyle]);
  const isSupported = hasBrowserSupport || Boolean(fallbackEndpoint?.trim());

  const speak = useCallback((text: string) => {
    if (!enabled || !isSupported) {
      return Promise.resolve();
    }

    const spokenText = text.trim();
    if (!spokenText) {
      return Promise.resolve();
    }

    const runPlayback = async () => {
      if (hasBrowserSupport && typeof window !== 'undefined') {
        window.speechSynthesis.cancel();
        setIsSpeaking(true);

        await new Promise<void>((resolve) => {
          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.lang = lang;
          utterance.rate = rate;
          utterance.pitch = 1;

          if (selectedVoice) {
            utterance.voice = selectedVoice;
          }

          utterance.onend = () => {
            setIsSpeaking(false);
            resolve();
          };
          utterance.onerror = () => {
            setIsSpeaking(false);
            resolve();
          };
          window.speechSynthesis.speak(utterance);
        });
        return;
      }

      if (fallbackEndpoint) {
        setIsSpeaking(true);
        try {
          await fetch(`${fallbackEndpoint.replace(/\/$/, '')}/api/speak`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: spokenText,
              lang,
              voice: fallbackVoice,
              rate: Math.round(185 * rate)
            })
          });
        } finally {
          setIsSpeaking(false);
        }
      }
    };

    playbackQueueRef.current = playbackQueueRef.current
      .catch(() => undefined)
      .then(runPlayback);

    return playbackQueueRef.current;
  }, [enabled, fallbackEndpoint, fallbackVoice, hasBrowserSupport, isSupported, lang, rate, selectedVoice]);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    playbackQueueRef.current = Promise.resolve();
  }, []);

  return {
    isSupported,
    isSpeaking,
    speak,
    stop
  };
};
