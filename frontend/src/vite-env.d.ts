declare module '*.css';

interface Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
  jarvis?: {
    platform?: string;
    speak?: (payload: unknown) => Promise<boolean>;
    stopSpeech?: () => Promise<void>;
    requestMic?: () => Promise<boolean>;
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
