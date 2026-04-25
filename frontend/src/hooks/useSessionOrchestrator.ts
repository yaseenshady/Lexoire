import { useCallback, useRef, useState, useEffect } from 'react';
import { useVoiceRecognition } from './useVoiceRecognition';
import { useSessionRouter } from './useSessionRouter';
import type { Socket } from 'socket.io-client';

interface OrchestratorCommand {
  type: 'switch' | 'tell' | 'broadcast' | 'pause' | 'resume' | 'context' | 'unknown';
  targetSession?: string;
  targetSessions?: string[];
  command: string;
  originalTranscript: string;
  isBroadcast: boolean;
}

interface ExecutionContext {
  commandId: string;
  sessionId?: string;
  timestamp: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

interface UseSessionOrchestratorOptions {
  socket?: Socket;
  onCommandParsed?: (command: OrchestratorCommand) => void;
  onCommandExecuted?: (context: ExecutionContext) => void;
  onSessionSwitched?: (sessionId: string) => void;
  onBroadcast?: (command: string, sessionIds: string[]) => void;
  autoExecute?: boolean;
  confirmationTimeoutMs?: number;
}

interface VoiceCommandPattern {
  pattern: RegExp;
  parse: (match: RegExpMatchArray, transcript: string) => OrchestratorCommand | null;
}

export const useSessionOrchestrator = (options: UseSessionOrchestratorOptions = {}) => {
  const {
    socket,
    onCommandParsed,
    onCommandExecuted,
    onSessionSwitched,
    onBroadcast,
    autoExecute = true,
    confirmationTimeoutMs = 500
  } = options;

  const [parsedCommands, setParsedCommands] = useState<OrchestratorCommand[]>([]);
  const [executionHistory, setExecutionHistory] = useState<ExecutionContext[]>([]);
  const [isAwaiting, setIsAwaiting] = useState(false);
  const [lastExecutedCommand, setLastExecutedCommand] = useState<OrchestratorCommand | null>(null);
  const [contextStack, setContextStack] = useState<string[]>([]);

  const commandIdRef = useRef(0);
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextStackRef = useRef<string[]>([]);

  const sessionRouter = useSessionRouter({
    onSessionSwitched
  });

  // Forward declare handleVoiceCommand
  const handleVoiceCommandRef = useRef<(transcript: string) => void>(null);

  const voiceRecognition = useVoiceRecognition({
    continuous: true,
    interimResults: true,
    lang: 'en-US',
    silenceTimeoutMs: 1400,
    onSilenceTranscript: (transcript) => {
      handleVoiceCommandRef.current?.(transcript);
    }
  });

  // Define command parsing patterns
  const commandPatterns: VoiceCommandPattern[] = [
    // Switch pattern: "switch to SESSION_NAME"
    {
      pattern: /^switch\s+to\s+([a-z0-9\-_]+)$/i,
      parse: (match, transcript) => ({
        type: 'switch',
        targetSession: match[1],
        command: 'switch-session',
        originalTranscript: transcript,
        isBroadcast: false
      })
    },
    // Tell pattern: "tell SESSION_NAME to COMMAND"
    {
      pattern: /^tell\s+([a-z0-9\-_]+)\s+to\s+(.+)$/i,
      parse: (match, transcript) => ({
        type: 'tell',
        targetSession: match[1],
        command: match[2].trim(),
        originalTranscript: transcript,
        isBroadcast: false
      })
    },
    // Broadcast pattern: "broadcast: COMMAND" or "broadcast to all: COMMAND"
    {
      pattern: /^broadcast\s*(?:to\s+all)?\s*:\s*(.+)$/i,
      parse: (match, transcript) => ({
        type: 'broadcast',
        command: match[1].trim(),
        targetSessions: sessionRouter.availableSessions,
        originalTranscript: transcript,
        isBroadcast: true
      })
    },
    // Pause pattern: "pause SESSION_NAME"
    {
      pattern: /^pause\s+([a-z0-9\-_]+)$/i,
      parse: (match, transcript) => ({
        type: 'pause',
        targetSession: match[1],
        command: `pause-session`,
        originalTranscript: transcript,
        isBroadcast: false
      })
    },
    // Resume pattern: "resume SESSION_NAME"
    {
      pattern: /^resume\s+([a-z0-9\-_]+)$/i,
      parse: (match, transcript) => ({
        type: 'resume',
        targetSession: match[1],
        command: `resume-session`,
        originalTranscript: transcript,
        isBroadcast: false
      })
    },
    // Context pattern: "context SESSION_NAME" - push to context stack
    {
      pattern: /^context\s+([a-z0-9\-_]+)$/i,
      parse: (match, transcript) => ({
        type: 'context',
        targetSession: match[1],
        command: 'set-context',
        originalTranscript: transcript,
        isBroadcast: false
      })
    }
  ];

  // Parse voice command to extract routing information
  const parseCommand = useCallback(
    (transcript: string): OrchestratorCommand => {
      const lowerTranscript = transcript.toLowerCase().trim();

      // Try each pattern
      for (const { pattern, parse } of commandPatterns) {
        const match = lowerTranscript.match(pattern);
        if (match) {
          const cmd = parse(match, transcript);
          if (cmd) {
            return cmd;
          }
        }
      }

      // If no pattern matched, treat as unknown (default to current session)
      return {
        type: 'unknown',
        targetSession: sessionRouter.currentSessionId || sessionRouter.lastSessionId || undefined,
        targetSessions: sessionRouter.currentSessionId
          ? [sessionRouter.currentSessionId]
          : sessionRouter.lastSessionId
            ? [sessionRouter.lastSessionId]
            : [],
        command: transcript,
        originalTranscript: transcript,
        isBroadcast: false
      };
    },
    [sessionRouter.availableSessions, sessionRouter.currentSessionId, sessionRouter.lastSessionId]
  );

  // Validate if session exists
  const isValidSession = useCallback(
    (sessionId: string): boolean => {
      return sessionRouter.availableSessions.includes(sessionId);
    },
    [sessionRouter.availableSessions]
  );

  // Execute a parsed command
  const executeCommand = useCallback(
    async (cmd: OrchestratorCommand) => {
      const executionId = `exec-${++commandIdRef.current}`;
      const context: ExecutionContext = {
        commandId: executionId,
        timestamp: Date.now(),
        status: 'pending'
      };

      // Validate target sessions
      if (cmd.targetSession && !isValidSession(cmd.targetSession)) {
        context.status = 'failed';
        context.error = `Session not found: ${cmd.targetSession}`;
        setExecutionHistory((prev) => [...prev, context]);
        onCommandExecuted?.(context);
        return context;
      }

      context.status = 'executing';
      context.sessionId = cmd.targetSession;

      try {
        // Handle special command types
        if (cmd.type === 'switch') {
          sessionRouter.setActiveSession(cmd.targetSession || null);
          if (socket?.connected) {
            socket.emit('session:switch', {
              toSessionId: cmd.targetSession,
              timestamp: Date.now()
            });
          }
          context.status = 'completed';
          context.result = `Switched to session: ${cmd.targetSession}`;
        } else if (cmd.type === 'pause') {
          if (socket?.connected) {
            socket.emit('session:pause', {
              sessionId: cmd.targetSession,
              timestamp: Date.now()
            });
          }
          context.status = 'completed';
          context.result = `Paused session: ${cmd.targetSession}`;
        } else if (cmd.type === 'resume') {
          if (socket?.connected) {
            socket.emit('session:resume', {
              sessionId: cmd.targetSession,
              timestamp: Date.now()
            });
          }
          context.status = 'completed';
          context.result = `Resumed session: ${cmd.targetSession}`;
        } else if (cmd.type === 'context') {
          contextStackRef.current = [...contextStackRef.current, cmd.targetSession || ''];
          setContextStack([...contextStackRef.current]);
          context.status = 'completed';
          context.result = `Context set to: ${cmd.targetSession}`;
        } else if (cmd.isBroadcast) {
          onBroadcast?.(cmd.command, cmd.targetSessions || []);
          if (socket?.connected) {
            socket.emit('session:broadcast', {
              message: cmd.command,
              timestamp: Date.now()
            });
          }
          context.status = 'completed';
          context.result = `Broadcast to ${cmd.targetSessions?.length || 0} sessions`;
        } else {
          // Regular command routing
          const targetSession = cmd.targetSession || sessionRouter.currentSessionId;
          if (targetSession) {
            await sessionRouter.routeToSession(cmd.command, targetSession, socket);
            context.sessionId = targetSession;
            context.status = 'completed';
            context.result = `Command routed to ${targetSession}`;
          } else {
            await sessionRouter.broadcastToAll(cmd.command, socket);
            context.status = 'completed';
            context.result = `Command broadcast to all sessions`;
          }
        }
      } catch (error) {
        context.status = 'failed';
        context.error = error instanceof Error ? error.message : 'Unknown error';
      }

      setExecutionHistory((prev) => [...prev, context]);
      onCommandExecuted?.(context);
      return context;
    },
    [isValidSession, sessionRouter, socket, onBroadcast, onCommandExecuted]
  );

  // Handle voice command
  const handleVoiceCommand = useCallback(
    (transcript: string) => {
      const cmd = parseCommand(transcript);
      setParsedCommands((prev) => [...prev, cmd]);
      onCommandParsed?.(cmd);

      setIsAwaiting(true);
      setLastExecutedCommand(cmd);

      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
      }

      if (autoExecute) {
        confirmationTimerRef.current = setTimeout(async () => {
          await executeCommand(cmd);
          setIsAwaiting(false);
        }, confirmationTimeoutMs);
      }
    },
    [parseCommand, onCommandParsed, autoExecute, confirmationTimeoutMs, executeCommand]
  );

  // Update ref when handleVoiceCommand changes
  useEffect(() => {
    handleVoiceCommandRef.current = handleVoiceCommand;
  }, [handleVoiceCommand]);

  // Manually execute a command without voice
  const manualExecute = useCallback(
    async (command: string, targetSession?: string) => {
      const cmd: OrchestratorCommand = {
        type: 'unknown',
        targetSession,
        command,
        originalTranscript: command,
        isBroadcast: false
      };
      return executeCommand(cmd);
    },
    [executeCommand]
  );

  // Cancel pending execution
  const cancelPendingExecution = useCallback(() => {
    if (confirmationTimerRef.current) {
      clearTimeout(confirmationTimerRef.current);
      confirmationTimerRef.current = null;
    }
    setIsAwaiting(false);
  }, []);

  // Force execute last parsed command
  const forceExecute = useCallback(async () => {
    if (lastExecutedCommand) {
      cancelPendingExecution();
      await executeCommand(lastExecutedCommand);
    }
  }, [lastExecutedCommand, executeCommand, cancelPendingExecution]);

  // Get context or default to current session
  const getContext = useCallback((): string | null => {
    if (contextStackRef.current.length > 0) {
      return contextStackRef.current[contextStackRef.current.length - 1];
    }
    return sessionRouter.currentSessionId || sessionRouter.lastSessionId || null;
  }, [sessionRouter.currentSessionId, sessionRouter.lastSessionId]);

  // Pop context from stack
  const popContext = useCallback(() => {
    if (contextStackRef.current.length > 0) {
      contextStackRef.current.pop();
      setContextStack([...contextStackRef.current]);
    }
  }, []);

  // Get orchestration info for display
  const getOrchestratorInfo = useCallback(() => {
    return {
      parsedCommandCount: parsedCommands.length,
      executionHistoryCount: executionHistory.length,
      isAwaitingConfirmation: isAwaiting,
      lastCommand: lastExecutedCommand,
      currentContext: getContext(),
      contextStack: contextStackRef.current,
      availableSessions: sessionRouter.availableSessions,
      currentSessionId: sessionRouter.currentSessionId,
      lastSessionId: sessionRouter.lastSessionId
    };
  }, [
    parsedCommands,
    executionHistory,
    isAwaiting,
    lastExecutedCommand,
    getContext,
    sessionRouter.availableSessions,
    sessionRouter.currentSessionId,
    sessionRouter.lastSessionId
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (confirmationTimerRef.current) {
        clearTimeout(confirmationTimerRef.current);
      }
    };
  }, []);

  return {
    // Voice recognition from underlying hook
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

    // Command parsing and execution
    parseCommand,
    executeCommand,
    manualExecute,
    forceExecute,
    cancelPendingExecution,

    // Session management
    setActiveSession: sessionRouter.setActiveSession,
    updateAvailableSessions: sessionRouter.updateAvailableSessions,
    rememberSession: sessionRouter.rememberSession,
    getLastSession: sessionRouter.getLastSession,

    // Context management
    getContext,
    popContext,

    // State and history
    parsedCommands,
    executionHistory,
    isAwaitingConfirmation: isAwaiting,
    lastExecutedCommand,
    contextStack,

    // Info and utilities
    getOrchestratorInfo,
    isValidSession,

    // Session routing info
    currentSessionId: sessionRouter.currentSessionId,
    lastSessionId: sessionRouter.lastSessionId,
    availableSessions: sessionRouter.availableSessions,
    routeHistory: sessionRouter.routeHistory
  };
};
