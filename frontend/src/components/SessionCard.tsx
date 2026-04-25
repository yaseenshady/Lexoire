import React from 'react';
import { motion } from 'framer-motion';
import type { Session } from '../types';

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onClick: (sessionId: string) => void;
  onClose?: (sessionId: string) => void;
  compact?: boolean;
}

const getStatusColors = (status: string) => {
  switch (status) {
    case 'active':
      return {
        bg: 'from-neon-cyan/20 to-neon-cyan/10',
        border: 'border-neon-cyan/50',
        text: 'text-neon-cyan',
        indicator: 'bg-neon-cyan',
        glow: 'shadow-lg shadow-neon-cyan/40'
      };
    case 'thinking':
      return {
        bg: 'from-neon-purple/20 to-neon-purple/10',
        border: 'border-neon-purple/50',
        text: 'text-neon-purple',
        indicator: 'bg-neon-purple',
        glow: 'shadow-lg shadow-neon-purple/40'
      };
    case 'paused':
      return {
        bg: 'from-orange-500/20 to-orange-500/10',
        border: 'border-orange-500/50',
        text: 'text-orange-300',
        indicator: 'bg-orange-500',
        glow: 'shadow-lg shadow-orange-500/30'
      };
    case 'completed':
      return {
        bg: 'from-green-500/20 to-green-500/10',
        border: 'border-green-500/50',
        text: 'text-green-300',
        indicator: 'bg-green-500',
        glow: 'shadow-lg shadow-green-500/30'
      };
    default:
      return {
        bg: 'from-white/10 to-white/5',
        border: 'border-white/20',
        text: 'text-white/70',
        indicator: 'bg-white/40',
        glow: ''
      };
  }
};

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isActive,
  onClick,
  onClose,
  compact = false
}) => {
  const colors = getStatusColors(session.status);

  const statusIcons = {
    idle: '⏸️',
    thinking: '🤔',
    active: '⚡',
    paused: '⏸️',
    completed: '✅'
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose?.(session.id);
  };

  return (
    <motion.button
      onClick={() => onClick(session.id)}
      whileHover={{ scale: 1.02, translateY: -2 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={`relative w-full text-left rounded-xl border-2 transition-all ${
        isActive
          ? `bg-gradient-to-r ${colors.bg} ${colors.border} ${colors.glow}`
          : 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30'
      } ${compact ? 'p-3' : 'p-4'}`}
    >
      {/* Active indicator dot */}
      {isActive && (
        <motion.div
          className={`absolute top-3 right-3 w-2 h-2 rounded-full ${colors.indicator}`}
          animate={{
            boxShadow: [
              `0 0 8px ${colors.indicator.split('-')[1]}`,
              `0 0 16px ${colors.indicator.split('-')[1]}`
            ]
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}

      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {/* Header with name and status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold truncate ${
              isActive ? colors.text : 'text-white/90'
            } ${compact ? 'text-sm' : 'text-base'}`}>
              {session.name}
            </h3>
            {!compact && (
              <p className={`text-xs mt-0.5 ${
                isActive ? `${colors.text}/70` : 'text-white/50'
              }`}>
                {statusIcons[session.status]} {session.status}
              </p>
            )}
          </div>

          {compact && (
            <span className={`text-xs flex-shrink-0 ${
              isActive ? colors.text : 'text-white/50'
            }`}>
              {statusIcons[session.status]}
            </span>
          )}
        </div>

        {/* Last command */}
        {!compact && session.lastCommand && (
          <p className={`text-xs truncate ${
            isActive ? `${colors.text}/60` : 'text-white/40'
          }`}>
            {session.lastCommand}
          </p>
        )}

        {/* Footer info */}
        {!compact && (
          <div className="flex items-center justify-between text-xs text-white/50 mt-2 pt-2 border-t border-white/10">
            <span>{session.commandHistory?.length || 0} command{session.commandHistory?.length === 1 ? '' : 's'}</span>
            {session.createdAt && (
              <span>{new Date(session.createdAt).toLocaleDateString()}</span>
            )}
          </div>
        )}
      </div>

      {/* Close button */}
      {onClose && !compact && (
        <motion.button
          onClick={handleClose}
          whileHover={{ scale: 1.2, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          className="absolute top-2 right-2 text-white/40 hover:text-white/80 transition-colors"
          title="Close session"
        >
          ✕
        </motion.button>
      )}
    </motion.button>
  );
};
