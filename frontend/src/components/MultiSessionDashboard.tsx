import React, { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SessionTabs } from './SessionTabs';
import { SessionMaster } from './SessionMaster';
import type { Session } from '../types';

interface MultiSessionDashboardProps {
  sessions: Session[];
  activeSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onNewSession?: () => void;
  onSettings?: () => void;
  onStatusClick?: () => void;
  isConnected: boolean;
  isExecuting: boolean;
  children?: ReactNode;
  voiceOrbElement?: ReactNode;
  compactMode?: boolean;
  showMaster?: boolean;
  showTabs?: boolean;
}

export const MultiSessionDashboard: React.FC<MultiSessionDashboardProps> = ({
  sessions,
  activeSessionId,
  onSessionSelect,
  onSessionClose,
  onNewSession,
  onSettings,
  onStatusClick,
  isConnected,
  isExecuting,
  children,
  voiceOrbElement,
  compactMode = false,
  showMaster = true,
  showTabs = true
}) => {
  const activeSession = sessions.find(s => s.id === activeSessionId);
  const activeSessions = sessions.filter(s => s.status !== 'idle').length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="w-full h-full flex flex-col gap-4"
    >
      {/* Session Master (Top Bar) */}
      <AnimatePresence>
        {showMaster && (
          <SessionMaster
            activeSessionName={activeSession?.name || 'No session'}
            isConnected={isConnected}
            isExecuting={isExecuting}
            totalSessions={sessions.length}
            activeSessions={activeSessions}
            onSettings={onSettings}
            onStatusClick={onStatusClick}
            voiceOrbElement={voiceOrbElement}
            compactMode={compactMode}
          />
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className={`flex-1 flex gap-4 min-h-0 ${
        compactMode ? 'flex-col' : ''
      }`}>
        {/* Session Tabs (Left Sidebar) */}
        <AnimatePresence>
          {showTabs && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`${
                compactMode
                  ? 'w-full'
                  : 'w-64 flex-shrink-0'
              }`}
            >
              <SessionTabs
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSessionSelect={onSessionSelect}
                onSessionClose={onSessionClose}
                onNewSession={onNewSession}
                compact={compactMode}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content panel (Current Session Output) */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex-1 min-w-0 min-h-0"
        >
          <AnimatePresence mode="wait">
            {children ? (
              <motion.div
                key={activeSessionId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="w-full h-full"
              >
                {children}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-panel p-8 rounded-xl border-2 border-white/20 flex items-center justify-center h-full"
              >
                <div className="text-center text-white/50">
                  <div className="text-4xl mb-4">📭</div>
                  <p className="text-sm">
                    {sessions.length === 0
                      ? 'No sessions created yet'
                      : 'Select or create a session to begin'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Export individual components for flexibility
export { SessionTabs, SessionMaster };
