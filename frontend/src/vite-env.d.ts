declare module '*.css';

interface Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
  lexoire?: {
    platform?: string;
    speak?: (payload: string | { text: string; mode?: 'hifi' | 'classic'; voiceName?: string }) => Promise<boolean>;
    stopSpeech?: () => Promise<void>;
    requestMic?: () => Promise<boolean>;
    getMicStatus?: () => Promise<'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'>;
    openMicSettings?: () => Promise<boolean>;
    openWindow?: () => Promise<boolean>;
    startSpeech?: () => Promise<void>;
    stopSpeechRecognition?: () => Promise<void>;
    getVoiceCapabilities?: () => Promise<{
      platform: string;
      nativeSpeechRecognition: boolean;
      nativeTtsFallback: boolean;
    }>;
    onSpeech?: (callback: (event: { type: string; text?: string }) => void) => void;
  };
}
