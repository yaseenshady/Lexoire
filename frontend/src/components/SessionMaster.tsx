import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Session, SessionStatus } from '../types';
import { useSocket } from '../hooks/useSocket';

interface SessionMasterProps {
  sessions?: Session[];
  currentSessionId?: string;
  onSwitchSession?: (id: string) => void;
  onCreateSession?: () => void;
  onPauseSession?: (id: string) => void;
  onResumeSession?: (id: string) => void;
  isListening?: boolean;
}

interface SessionDetail extends Session {
  isActive: boolean;
  isCurrentListener: boolean;
}

export const SessionMaster: React.FC<SessionMasterProps> = ({
  sessions: initialSessions = [],
  currentSessionId = '',
  onSwitchSession = () => {},
  onCreateSession = () => {},
  onPauseSession = () => {},
  onResumeSession = () => {},
  isListening = false
}) => {
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [masterPaused, setMasterPaused] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState(0);
  const { socket } = useSocket();

  useEffect(() => {
    const enhancedSessions = initialSessions.map(s => ({
      ...s,
      isActive: s.id === currentSessionId,
      isCurrentListener: s.isListening
    }));
    setSessions(enhancedSessions);
    if (enhancedSessions.length > 0 && !selectedSession) {
      setSelectedSession(enhancedSessions[0]);
    }
  }, [initialSessions, currentSessionId, selectedSession]);

  useEffect(() => {
    if (!socket) return;

    const handleStatusChanged = (data: { sessionId: string; status: SessionStatus }) => {
      setSessions(prev =>
        prev.map(s =>
          s.id === data.sessionId
            ? { ...s, status: data.status, updatedAt: Date.now() }
            : s
        )
      );
    };

    const handleSessionUpdated = (session: Session) => {
      setSessions(prev =>
        prev.map(s =>
          s.id === session.id
            ? { ...session, isActive: s.isActive, isCurrentListener: session.isListening }
            : s
        )
      );
      if (selectedSession?.id === session.id) {
        setSelectedSession(prev => prev ? { ...session, isActive: prev.isActive, isCurrentListener: session.isListening } : null);
      }
    };

    const handleSessionCreated = (session: Session) => {
      setSessions(prev => [...prev, { ...session, isActive: false, isCurrentListener: false }]);
    };

    const handleSessionListening = (sessionId: string) => {
      setSessions(prev =>
        prev.map(s => ({
          ...s,
          isCurrentListener: s.id === sessionId
        }))
      );
    };

    socket.on('session:status-changed', handleStatusChanged);
    socket.on('session:updated', handleSessionUpdated);
    socket.on('session:created', handleSessionCreated);
    socket.on('session:listening', handleSessionListening);

    return () => {
      socket.off('session:status-changed', handleStatusChanged);
      socket.off('session:updated', handleSessionUpdated);
      socket.off('session:created', handleSessionCreated);
      socket.off('session:listening', handleSessionListening);
    };
  }, [socket, selectedSession]);

  const handleCreateSession = useCallback(() => {
    onCreateSession();
  }, [onCreateSession]);

  const handleSwitchSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setSelectedSession({ ...session, isActive: true });
      onSwitchSession(sessionId);
      socket?.emit('session:switch', { toSessionId: sessionId, timestamp: Date.now() });
    }
  }, [sessions, onSwitchSession, socket]);

  const handlePauseSession = useCallback((sessionId: string) => {
    onPauseSession(sessionId);
    socket?.emit('session:pause', { sessionId, timestamp: Date.now() });
  }, [onPauseSession, socket]);

  const handleResumeSession = useCallback((sessionId: string) => {
    onResumeSession(sessionId);
    socket?.emit('session:resume', { sessionId, timestamp: Date.now() });
  }, [onResumeSession, socket]);

  const handleBroadcastMessage = useCallback(() => {
    if (broadcastMessage.trim()) {
      socket?.emit('session:broadcast', { message: broadcastMessage, timestamp: Date.now() });
      setBroadcastMessage('');
    }
  }, [broadcastMessage, socket]);

  const getStatusColor = (status: SessionStatus): string => {
    switch (status) {
      case 'idle':
        return 'from-gray-500 to-gray-600';
      case 'thinking':
        return 'from-yellow-500 to-yellow-600';
      case 'active':
        return 'from-green-500 to-green-600';
      case 'paused':
        return 'from-red-500 to-red-600';
      case 'completed':
        return 'from-blue-500 to-blue-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getStatusBg = (status: SessionStatus): string => {
    switch (status) {
      case 'idle':
        return 'bg-gray-500/20 border-gray-500/40';
      case 'thinking':
        return 'bg-yellow-500/20 border-yellow-500/40';
      case 'active':
        return 'bg-green-500/20 border-green-500/40';
      case 'paused':
        return 'bg-red-500/20 border-red-500/40';
      case 'completed':
        return 'bg-blue-500/20 border-blue-500/40';
      default:
        return 'bg-gray-500/20 border-gray-500/40';
    }
  };

  const filteredSessions = sessions.filter(s => s.priority >= priorityFilter);

  return (
    <div className="w-full h-full flex flex-col gap-6 p-6">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-4">
          <h1 className="text-4xl font-bold neon-text">Session Master</h1>
          <motion.div
            className="flex items-center gap-2 px-3 py-1 rounded-full border border-neon-cyan/40 bg-neon-cyan/10"
            animate={isListening ? { scale: [0.95, 1.05, 0.95] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <motion.div
              className={`w-2 h-2 rounded-full ${isListening ? 'bg-neon-cyan' : 'bg-gray-500'}`}
              animate={isListening ? { scale: [1, 1.3, 1] } : {}}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <span className="text-xs font-mono text-white/70">
              {isListening ? 'LISTENING' : 'IDLE'}
            </span>
          </motion.div>
        </div>
        <motion.button
          onClick={handleCreateSession}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-neon-cyan/80 to-neon-cyan/60 hover:from-neon-cyan to-neon-cyan/80 text-black font-semibold transition-all duration-300 hover:shadow-lg hover:shadow-neon-cyan/50"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          + New Session
        </motion.button>
      </motion.div>

      {/* Master Controls */}
      <motion.div
        className="glass-panel p-6 space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-xl font-semibold text-white/90">Master Controls</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.button
            onClick={() => setMasterPaused(!masterPaused)}
            className={`px-4 py-3 rounded-lg font-semibold transition-all ${
              masterPaused
                ? 'bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30'
                : 'bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {masterPaused ? '▶ Resume All' : '⏸ Pause All'}
          </motion.button>

          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10">
            <span className="text-sm font-mono text-white/70">Priority:</span>
            <input
              type="range"
              min="0"
              max="10"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(Number(e.target.value))}
              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, rgba(0, 255, 255, 0.6) 0%, rgba(0, 255, 255, 0.6) ${(priorityFilter / 10) * 100}%, rgba(255, 255, 255, 0.1) ${(priorityFilter / 10) * 100}%, rgba(255, 255, 255, 0.1) 100%)`
              }}
            />
            <span className="text-sm font-mono text-neon-cyan">{priorityFilter}</span>
          </div>

          <motion.button
            onClick={() => socket?.emit('session:broadcast', { message: `Priority filter at level ${priorityFilter}`, timestamp: Date.now() })}
            className="px-4 py-3 rounded-lg bg-neon-purple/20 border border-neon-purple/40 text-neon-purple hover:bg-neon-purple/30 font-semibold transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            📢 Broadcast
          </motion.button>
        </div>

        {/* Broadcast Message Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleBroadcastMessage()}
            placeholder="Broadcast message to all sessions..."
            className="flex-1 px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-neon-cyan/60 focus:bg-white/10 transition-all"
          />
          <motion.button
            onClick={handleBroadcastMessage}
            disabled={!broadcastMessage.trim()}
            className="px-4 py-2 rounded-lg bg-neon-cyan/20 border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Send
          </motion.button>
        </div>
      </motion.div>

      {/* Session Grid */}
      <motion.div
        className="flex-1 flex flex-col"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-xl font-semibold text-white/90 mb-4">
          Sessions ({filteredSessions.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto pr-2">
          <AnimatePresence mode="popLayout">
            {filteredSessions.map((session, index) => (
              <motion.div
                key={session.id}
                layout
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: -20 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                onClick={() => setSelectedSession(session)}
                className={`glass-panel p-4 cursor-pointer transition-all duration-300 ${
                  selectedSession?.id === session.id
                    ? 'ring-2 ring-neon-cyan shadow-lg shadow-neon-cyan/30'
                    : 'hover:border-neon-cyan/60'
                }`}
                whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0, 255, 255, 0.2)' }}
              >
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg font-bold text-white truncate">{session.name}</h4>
                      <p className="text-xs text-white/50 font-mono">
                        ID: {session.id.substring(0, 8)}...
                      </p>
                    </div>
                    {session.isCurrentListener && (
                      <motion.div
                        className="flex-shrink-0"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        title="Currently listening"
                      >
                        🎙️
                      </motion.div>
                    )}
                  </div>

                  {/* Status Badge */}
                  <motion.div
                    className={`inline-block px-3 py-1 rounded-full border text-xs font-semibold ${getStatusBg(
                      session.status
                    )}`}
                    animate={
                      session.status === 'thinking'
                        ? { scale: [1, 1.05, 1] }
                        : session.status === 'active'
                          ? { opacity: [0.8, 1, 0.8] }
                          : {}
                    }
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <span className={`bg-gradient-to-r ${getStatusColor(session.status)} bg-clip-text text-transparent`}>
                      {session.status.toUpperCase()}
                    </span>
                  </motion.div>

                  {/* Activity Indicator */}
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full bg-gradient-to-r ${getStatusColor(session.status)}`}
                        initial={{ width: 0 }}
                        animate={{ width: session.status === 'active' ? '100%' : '30%' }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span className="text-xs text-white/50 font-mono">
                      {session.priority}/10
                    </span>
                  </div>

                  {/* Last Command */}
                  {session.lastCommand && (
                    <div className="text-xs bg-black/30 rounded p-2 border border-white/10 text-white/70 truncate">
                      <span className="text-neon-cyan/80">$</span> {session.lastCommand}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2">
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSwitchSession(session.id);
                      }}
                      className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold transition-all ${
                        session.isActive
                          ? 'bg-neon-cyan/30 border border-neon-cyan/60 text-neon-cyan'
                          : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {session.isActive ? '✓ Active' : 'Switch'}
                    </motion.button>

                    {session.status === 'paused' ? (
                      <motion.button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleResumeSession(session.id);
                        }}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-semibold bg-green-500/20 border border-green-500/40 text-green-300 hover:bg-green-500/30 transition-all"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        ▶ Resume
                      </motion.button>
                    ) : (
                      <motion.button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePauseSession(session.id);
                        }}
                        className="flex-1 px-2 py-1.5 rounded text-xs font-semibold bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-all"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        ⏸ Pause
                      </motion.button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Session Details Panel */}
      <AnimatePresence>
        {selectedSession && (
          <motion.div
            className="glass-panel p-6 max-h-64 overflow-y-auto"
            initial={{ opacity: 0, y: 20, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 20, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white mb-2">{selectedSession.name}</h3>
                  {selectedSession.objective && (
                    <p className="text-sm text-white/70 mb-3">
                      <span className="text-neon-cyan font-semibold">Objective:</span> {selectedSession.objective}
                    </p>
                  )}
                </div>
                <motion.button
                  onClick={() => setSelectedSession(null)}
                  className="px-3 py-1 rounded text-xs text-white/50 hover:text-white/80 transition-colors"
                  whileHover={{ scale: 1.1 }}
                >
                  ✕
                </motion.button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                {selectedSession.repo && (
                  <div className="px-3 py-2 bg-white/5 rounded border border-white/10">
                    <p className="text-white/50 mb-1">Repository</p>
                    <p className="text-white font-mono truncate">{selectedSession.repo}</p>
                  </div>
                )}
                {selectedSession.branch && (
                  <div className="px-3 py-2 bg-white/5 rounded border border-white/10">
                    <p className="text-white/50 mb-1">Branch</p>
                    <p className="text-neon-cyan font-mono truncate">{selectedSession.branch}</p>
                  </div>
                )}
                <div className="px-3 py-2 bg-white/5 rounded border border-white/10">
                  <p className="text-white/50 mb-1">Status</p>
                  <p className={`font-semibold ${selectedSession.status === 'active' ? 'text-green-400' : 'text-white/80'}`}>
                    {selectedSession.status}
                  </p>
                </div>
                <div className="px-3 py-2 bg-white/5 rounded border border-white/10">
                  <p className="text-white/50 mb-1">Commands</p>
                  <p className="text-white font-mono">{selectedSession.commandHistory.length}</p>
                </div>
              </div>

              {selectedSession.lastSummary && (
                <div className="px-4 py-3 bg-neon-cyan/10 border border-neon-cyan/30 rounded-lg">
                  <p className="text-xs text-neon-cyan/70 mb-2">Last Summary:</p>
                  <p className="text-sm text-white/80">{selectedSession.lastSummary}</p>
                </div>
              )}

              {/* Command History */}
              {selectedSession.commandHistory.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-white/80 mb-2">Recent Commands:</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {selectedSession.commandHistory.slice(-3).map((cmd, idx) => (
                      <div key={idx} className="text-xs bg-black/40 rounded p-2 border border-white/10 font-mono text-white/70">
                        <p className="text-neon-cyan/80 mb-1">
                          {new Date(cmd.timestamp).toLocaleTimeString()}
                        </p>
                        <p className="text-white/60 truncate">$ {cmd.command}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {filteredSessions.length === 0 && (
        <motion.div
          className="flex-1 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="text-center text-white/50 space-y-4">
            <p className="text-lg">No sessions found</p>
            <motion.button
              onClick={handleCreateSession}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-neon-cyan/60 to-neon-purple/60 text-white font-semibold hover:from-neon-cyan/80 hover:to-neon-purple/80 transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Create your first session
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
