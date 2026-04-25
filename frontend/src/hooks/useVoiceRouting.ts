import { useCallback, useState } from 'react';
import { useVoiceRecognition } from './useVoiceRecognition';
import { useSessionRouter } from './useSessionRouter';
import type { Socket } from 'socket.io-client';

interface UseVoiceRoutingOptions {
  socket?: Socket;
  enableRouting?: boolean;
  onRouteExecuted?: (route: any) => void;
  onSessionSwitched?: (sessionId: string) => void;
}

/**
 * Integration hook combining voice recognition with session routing
 * Enables voice commands to be routed to specific sessions
 */
export const useVoiceRouting = (options: UseVoiceRoutingOptions = {}) => {
  const {
    socket,
    enableRouting = true,
    onRouteExecuted,
    onSessionSwitched
  } = options;

  const [lastRoute, setLastRoute] = useState<any | null>(null);
  const [confirmedRoute, setConfirmedRoute] = useState<any | null>(null);
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);

  const sessionRouter = useSessionRouter({
    onRouted: (route) => {
      setLastRoute(route);
      onRouteExecuted?.(route);
    },
    onSessionSwitched
  });

  const voiceRecognition = useVoiceRecognition({
    continuous: true,
    interimResults: true,
    lang: 'en-US',
    silenceTimeoutMs: 1400,
    onSilenceTranscript: handleVoiceCommand
  });

  async function handleVoiceCommand(transcript: string) {
    if (!enableRouting) {
      return;
    }

    // Parse the voice command to determine routing
    const route = sessionRouter.parseCommand(transcript);

    // Show confirmation before executing
    setIsAwaitingConfirmation(true);
    setLastRoute(route);

    // Auto-execute after brief confirmation period
    // In a real app, you might show a UI element for user confirmation
    setTimeout(() => {
      sessionRouter.executeRoute(route, socket);
      setConfirmedRoute(route);
      setIsAwaitingConfirmation(false);
    }, 500);
  }

  const manuallyRouteCommand = useCallback(
    async (command: string, targetSession?: string) => {
      if (!enableRouting) return;

      if (targetSession) {
        await sessionRouter.routeToSession(command, targetSession, socket);
      } else {
        await sessionRouter.broadcastToAll(command, socket);
      }
    },
    [enableRouting, sessionRouter, socket]
  );

  return {
    // Voice recognition
    isListening: voiceRecognition.isListening,
    transcript: voiceRecognition.transcript,
    interimTranscript: voiceRecognition.interimTranscript,
    confidence: voiceRecognition.confidence,
    isSilent: voiceRecognition.isSilent,
    hasSpokenText: voiceRecognition.hasSpokenText,
    error: voiceRecognition.error,
    isSupported: voiceRecognition.isSupported,

    // Voice recognition controls
    startListening: voiceRecognition.startListening,
    stopListening: voiceRecognition.stopListening,
    resetTranscript: voiceRecognition.resetTranscript,

    // Session routing
    currentSessionId: sessionRouter.currentSessionId,
    lastSessionId: sessionRouter.lastSessionId,
    availableSessions: sessionRouter.availableSessions,
    routeHistory: sessionRouter.routeHistory,

    // Session routing controls
    setActiveSession: sessionRouter.setActiveSession,
    updateAvailableSessions: sessionRouter.updateAvailableSessions,
    rememberSession: sessionRouter.rememberSession,
    getLastSession: sessionRouter.getLastSession,

    // Route management
    lastRoute,
    confirmedRoute,
    isAwaitingConfirmation,
    manuallyRouteCommand,
    getSessionInfo: sessionRouter.getSessionInfo,
    clearRouteHistory: sessionRouter.clearRouteHistory
  };
};
