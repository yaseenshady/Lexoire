import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SessionCard } from './SessionCard';
import type { Session } from '../types';

interface SessionTabsProps {
  sessions: Session[];
  activeSessionId: string;
  onSessionSelect: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  onNewSession?: () => void;
  compact?: boolean;
}

export const SessionTabs: React.FC<SessionTabsProps> = ({
  sessions,
  activeSessionId,
  onSessionSelect,
  onSessionClose,
  onNewSession,
  compact = false
}) => {
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const scroll = (direction: 'up' | 'down') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 200;
    const newPosition = scrollPosition + (direction === 'down' ? scrollAmount : -scrollAmount);
    scrollContainerRef.current.scrollTop = newPosition;
    setScrollPosition(newPosition);
  };

  const canScrollUp = scrollPosition > 0;
  const canScrollDown = scrollContainerRef.current
    ? scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight > scrollPosition
    : false;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={`glass-panel ${
        compact 
          ? 'p-3 rounded-lg border border-white/20' 
          : 'p-4 rounded-xl border-2 border-neon-cyan/20'
      } h-full flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className={`font-bold ${
          compact ? 'text-sm' : 'text-lg'
        } neon-text`}>
          Sessions
        </h2>
        <motion.span
          className={`${
            compact ? 'text-xs' : 'text-sm'
          } px-2 py-1 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan/70 font-mono`}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {sessions.length}
        </motion.span>
      </div>

      {/* Sessions list */}
      <div className="flex-1 min-h-0 relative">
        {/* Scroll up button */}
        <AnimatePresence>
          {canScrollUp && !compact && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={() => scroll('up')}
              className="absolute top-0 left-0 right-0 z-10 py-2 text-center text-white/50 hover:text-white/80 transition-colors"
              title="Scroll up"
            >
              ↑
            </motion.button>
          )}
        </AnimatePresence>

        {/* Sessions scroll container */}
        <div
          ref={scrollContainerRef}
          className={`overflow-y-auto space-y-2 ${
            canScrollUp && !compact ? 'pt-8' : ''
          } ${
            canScrollDown && !compact ? 'pb-8' : ''
          } scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent`}
          onScroll={(e) => setScrollPosition(e.currentTarget.scrollTop)}
        >
          {sessions.length > 0 ? (
            <motion.div className="space-y-2">
              {sessions.map((session, index) => (
                <motion.div
                  key={session.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <SessionCard
                    session={session}
                    isActive={session.id === activeSessionId}
                    onClick={onSessionSelect}
                    onClose={onSessionClose}
                    compact={compact}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center h-full text-white/50 text-sm"
            >
              <span className="text-center">No sessions yet</span>
            </motion.div>
          )}
        </div>

        {/* Scroll down button */}
        <AnimatePresence>
          {canScrollDown && !compact && (
            <motion.button
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onClick={() => scroll('down')}
              className="absolute bottom-0 left-0 right-0 z-10 py-2 text-center text-white/50 hover:text-white/80 transition-colors"
              title="Scroll down"
            >
              ↓
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* New session button */}
      {onNewSession && (
        <motion.button
          onClick={onNewSession}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`mt-4 w-full rounded-lg border-2 border-dashed border-neon-cyan/40 bg-neon-cyan/5 text-neon-cyan/80 font-semibold hover:border-neon-cyan/70 hover:bg-neon-cyan/10 transition-all ${
            compact ? 'py-2 text-sm' : 'py-3'
          }`}
        >
          + New Session
        </motion.button>
      )}
    </motion.div>
  );
};
