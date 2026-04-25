import { useCallback, useState, useRef } from 'react';
import type { Socket } from 'socket.io-client';

interface CommandRoute {
  targetSessions: string[];
  command: string;
  broadcast: boolean;
  originalTranscript: string;
  confirmationMessage: string;
}

interface VoiceRoutingInfo {
  transcript: string;
  confidence: number;
  timestamp: number;
  sessionId?: string;
  routing?: CommandRoute;
}

interface SessionRouterOptions {
  onRouted?: (route: CommandRoute) => void;
  onSessionSwitched?: (sessionId: string) => void;
}

export const useSessionRouter = (options: SessionRouterOptions = {}) => {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [availableSessions, setAvailableSessions] = useState<string[]>([]);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [routeHistory, setRouteHistory] = useState<CommandRoute[]>([]);

  const currentSessionRef = useRef<string | null>(null);
  const lastSessionRef = useRef<string | null>(null);
  const sessionCacheRef = useRef<Map<string, number>>(new Map());

  // Parse command to extract session routing
  const parseCommand = useCallback((transcript: string): CommandRoute => {
    const lowerTranscript = transcript.toLowerCase().trim();
    
    // Check for broadcast pattern: "broadcast: ..." or "broadcast to all ..."
    const broadcastMatch = lowerTranscript.match(/^broadcast\s*(?:to all)?\s*:?\s*(.+)$/i);
    if (broadcastMatch) {
      return {
        targetSessions: availableSessions,
        command: broadcastMatch[1].trim(),
        broadcast: true,
        originalTranscript: transcript,
        confirmationMessage: `Broadcasting to all ${availableSessions.length} sessions: "${broadcastMatch[1].trim()}"`
      };
    }

    // Check for switch pattern: "switch to SESSION_NAME"
    const switchMatch = lowerTranscript.match(/^switch\s+to\s+([a-z0-9\-_]+)$/i);
    if (switchMatch) {
      const sessionName = switchMatch[1];
      if (availableSessions.includes(sessionName)) {
        return {
          targetSessions: [sessionName],
          command: 'switch-session',
          broadcast: false,
          originalTranscript: transcript,
          confirmationMessage: `Switching to session: ${sessionName}`
        };
      }
    }

    // Check for pause pattern: "pause SESSION_NAME"
    const pauseMatch = lowerTranscript.match(/^pause\s+([a-z0-9\-_]+)$/i);
    if (pauseMatch) {
      const sessionName = pauseMatch[1];
      if (availableSessions.includes(sessionName)) {
        return {
          targetSessions: [sessionName],
          command: 'pause-session',
          broadcast: false,
          originalTranscript: transcript,
          confirmationMessage: `Pausing session: ${sessionName}`
        };
      }
    }

    // Check for resume pattern: "resume SESSION_NAME"
    const resumeMatch = lowerTranscript.match(/^resume\s+([a-z0-9\-_]+)$/i);
    if (resumeMatch) {
      const sessionName = resumeMatch[1];
      if (availableSessions.includes(sessionName)) {
        return {
          targetSessions: [sessionName],
          command: 'resume-session',
          broadcast: false,
          originalTranscript: transcript,
          confirmationMessage: `Resuming session: ${sessionName}`
        };
      }
    }

    // Check for "tell SESSION_NAME to ..." pattern
    const tellMatch = lowerTranscript.match(/^tell\s+([a-z0-9\-_]+)\s+to\s+(.+)$/i);
    if (tellMatch) {
      const sessionName = tellMatch[1];
      const command = tellMatch[2];
      if (availableSessions.includes(sessionName)) {
        return {
          targetSessions: [sessionName],
          command: command.trim(),
          broadcast: false,
          originalTranscript: transcript,
          confirmationMessage: `Routing to ${sessionName}: "${command.trim()}"`
        };
      }
    }

    // Check for "send SESSION_NAME ..." or "route to SESSION_NAME ..."
    const routeMatch = lowerTranscript.match(/^(?:send|route)\s+(?:to\s+)?([a-z0-9\-_]+)\s+(.+)$/i);
    if (routeMatch) {
      const sessionName = routeMatch[1];
      const command = routeMatch[2];
      if (availableSessions.includes(sessionName)) {
        return {
          targetSessions: [sessionName],
          command: command.trim(),
          broadcast: false,
          originalTranscript: transcript,
          confirmationMessage: `Routing to ${sessionName}: "${command.trim()}"`
        };
      }
    }

    // Default: send to currently active session
    const targetSession = currentSessionRef.current || lastSessionRef.current;
    if (targetSession) {
      return {
        targetSessions: [targetSession],
        command: transcript,
        broadcast: false,
        originalTranscript: transcript,
        confirmationMessage: `Sending to active session: "${transcript}"`
      };
    }

    // If no active session, broadcast to all
    return {
      targetSessions: availableSessions,
      command: transcript,
      broadcast: true,
      originalTranscript: transcript,
      confirmationMessage: `No active session. Broadcasting to all: "${transcript}"`
    };
  }, [availableSessions]);

  // Remember the last active session
  const rememberSession = useCallback((sessionId: string) => {
    setLastSessionId(sessionId);
    lastSessionRef.current = sessionId;
    currentSessionRef.current = sessionId;
    sessionCacheRef.current.set(sessionId, Date.now());
    options.onSessionSwitched?.(sessionId);
  }, [options]);

  // Get the last active session
  const getLastSession = useCallback((): string | null => {
    if (lastSessionRef.current) {
      return lastSessionRef.current;
    }

    // Find the most recently used session
    let mostRecentSession: string | null = null;
    let mostRecentTime = 0;

    for (const [sessionId, timestamp] of sessionCacheRef.current) {
      if (timestamp > mostRecentTime) {
        mostRecentTime = timestamp;
        mostRecentSession = sessionId;
      }
    }

    if (mostRecentSession) {
      lastSessionRef.current = mostRecentSession;
      return mostRecentSession;
    }

    return null;
  }, []);

  // Set current active session
  const setActiveSession = useCallback((sessionId: string | null) => {
    setCurrentSessionId(sessionId);
    currentSessionRef.current = sessionId;
    if (sessionId) {
      rememberSession(sessionId);
    }
  }, [rememberSession]);

  // Update available sessions
  const updateAvailableSessions = useCallback((sessions: string[]) => {
    setAvailableSessions(sessions);
  }, []);

  // Route command to session(s)
  const routeToSession = useCallback(
    async (command: string, sessionId: string, socket?: Socket) => {
      const route: CommandRoute = {
        targetSessions: [sessionId],
        command,
        broadcast: false,
        originalTranscript: command,
        confirmationMessage: `Routing to ${sessionId}: "${command}"`
      };

      setRouteHistory((prev) => [...prev, route]);
      options.onRouted?.(route);

      if (socket && socket.connected) {
        socket.emit('voice:routing', {
          transcript: command,
          confidence: 1.0,
          timestamp: Date.now(),
          sessionId,
          routing: route
        } as VoiceRoutingInfo);
      }
    },
    [options]
  );

  // Broadcast command to all sessions
  const broadcastToAll = useCallback(
    async (command: string, socket?: Socket) => {
      const route: CommandRoute = {
        targetSessions: availableSessions,
        command,
        broadcast: true,
        originalTranscript: command,
        confirmationMessage: `Broadcasting to all sessions: "${command}"`
      };

      setRouteHistory((prev) => [...prev, route]);
      options.onRouted?.(route);

      if (socket && socket.connected) {
        socket.emit('voice:routing', {
          transcript: command,
          confidence: 1.0,
          timestamp: Date.now(),
          routing: route
        } as VoiceRoutingInfo);
      }
    },
    [availableSessions, options]
  );

  // Execute route based on parsed command
  const executeRoute = useCallback(
    async (route: CommandRoute, socket?: Socket) => {
      // Handle special commands
      if (route.command === 'switch-session') {
        const targetSession = route.targetSessions[0];
        setActiveSession(targetSession);
        if (socket && socket.connected) {
          socket.emit('session:switch', {
            toSessionId: targetSession,
            timestamp: Date.now()
          });
        }
        return;
      }

      if (route.command === 'pause-session') {
        if (socket && socket.connected) {
          socket.emit('session:pause', {
            sessionId: route.targetSessions[0],
            timestamp: Date.now()
          });
        }
        return;
      }

      if (route.command === 'resume-session') {
        if (socket && socket.connected) {
          socket.emit('session:resume', {
            sessionId: route.targetSessions[0],
            timestamp: Date.now()
          });
        }
        return;
      }

      // Regular command routing
      if (route.broadcast) {
        await broadcastToAll(route.command, socket);
      } else {
        const targetSession = route.targetSessions[0];
        await routeToSession(route.command, targetSession, socket);
      }
    },
    [setActiveSession, broadcastToAll, routeToSession]
  );

  // Get session routing info for display
  const getSessionInfo = useCallback(() => {
    return {
      currentSessionId,
      lastSessionId,
      availableSessions,
      routeHistory
    };
  }, [currentSessionId, lastSessionId, availableSessions, routeHistory]);

  // Clear route history
  const clearRouteHistory = useCallback(() => {
    setRouteHistory([]);
  }, []);

  return {
    // Command parsing
    parseCommand,

    // Session management
    rememberSession,
    getLastSession,
    setActiveSession,
    updateAvailableSessions,

    // Command routing
    routeToSession,
    broadcastToAll,
    executeRoute,

    // Query methods
    getSessionInfo,
    clearRouteHistory,

    // State
    currentSessionId,
    lastSessionId,
    availableSessions,
    routeHistory
  };
};
