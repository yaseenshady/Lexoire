import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { Session } from '../types';
import { SessionIndicator } from './SessionIndicator';

interface SessionCardProps {
  session: Session;
  isActive: boolean;
  onClick: (sessionId: string) => void;
  onClose?: (sessionId: string) => void;
  compact?: boolean;
  focusLevel?: number;
}

const getStatusColors = (status: string) => {
  switch (status) {
    case 'active':
      return {
        bg: 'from-neon-cyan/20 to-neon-cyan/10',
        border: 'border-neon-cyan/50',
        text: 'text-neon-cyan',
        indicator: 'bg-neon-cyan',
        glow: 'shadow-lg shadow-neon-cyan/40',
        gradientFrom: 'rgba(6, 182, 212, 0.15)',
        gradientTo: 'rgba(6, 182, 212, 0.05)',
        glowColor: 'rgba(6, 182, 212, 0.5)'
      };
    case 'thinking':
      return {
        bg: 'from-neon-purple/20 to-neon-purple/10',
        border: 'border-neon-purple/50',
        text: 'text-neon-purple',
        indicator: 'bg-neon-purple',
        glow: 'shadow-lg shadow-neon-purple/40',
        gradientFrom: 'rgba(191, 0, 255, 0.15)',
        gradientTo: 'rgba(191, 0, 255, 0.05)',
        glowColor: 'rgba(251, 191, 36, 0.5)'
      };
    case 'paused':
      return {
        bg: 'from-orange-500/20 to-orange-500/10',
        border: 'border-orange-500/50',
        text: 'text-orange-300',
        indicator: 'bg-orange-500',
        glow: 'shadow-lg shadow-orange-500/30',
        gradientFrom: 'rgba(239, 68, 68, 0.15)',
        gradientTo: 'rgba(239, 68, 68, 0.05)',
        glowColor: 'rgba(239, 68, 68, 0.4)'
      };
    case 'completed':
      return {
        bg: 'from-green-500/20 to-green-500/10',
        border: 'border-green-500/50',
        text: 'text-green-300',
        indicator: 'bg-green-500',
        glow: 'shadow-lg shadow-green-500/30',
        gradientFrom: 'rgba(34, 197, 94, 0.15)',
        gradientTo: 'rgba(34, 197, 94, 0.05)',
        glowColor: 'rgba(34, 197, 94, 0.4)'
      };
    default:
      return {
        bg: 'from-white/10 to-white/5',
        border: 'border-white/20',
        text: 'text-white/70',
        indicator: 'bg-white/40',
        glow: '',
        gradientFrom: 'rgba(255, 255, 255, 0.1)',
        gradientTo: 'rgba(255, 255, 255, 0.05)',
        glowColor: 'rgba(255, 255, 255, 0.2)'
      };
  }
};

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  isActive,
  onClick,
  onClose,
  compact = false,
  focusLevel = 50
}) => {
  const colors = getStatusColors(session.status);
  const [showTooltip, setShowTooltip] = useState(false);

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
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      className={`relative w-full text-left rounded-xl border-2 transition-all overflow-hidden group ${
        isActive
          ? `bg-gradient-to-r ${colors.bg} ${colors.border} ${colors.glow}`
          : 'bg-white/5 border-white/20 hover:bg-white/10 hover:border-white/30'
      } ${compact ? 'p-3' : 'p-4'}`}
      style={
        isActive
          ? {
              background: `linear-gradient(135deg, ${colors.gradientFrom}, ${colors.gradientTo})`
            }
          : undefined
      }
    >
      {/* Animated border glow when active */}
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 pointer-events-none"
          style={{
            borderColor: colors.glowColor,
            opacity: 0.5
          }}
          animate={{
            boxShadow: [
              `inset 0 0 20px ${colors.glowColor}, 0 0 20px ${colors.glowColor}`,
              `inset 0 0 40px ${colors.glowColor}, 0 0 40px ${colors.glowColor}`,
              `inset 0 0 20px ${colors.glowColor}, 0 0 20px ${colors.glowColor}`
            ]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Active indicator dot with SessionIndicator component */}
      {isActive && (
        <div className="absolute top-3 right-3">
          <SessionIndicator status={session.status} size="md" />
        </div>
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

        {/* Focus level indicator */}
        {!compact && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Focus Level</span>
              <span className={isActive ? colors.text : 'text-white/50'}>
                {focusLevel}%
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-neon-cyan/60 to-neon-cyan/40"
                initial={{ width: 0 }}
                animate={{ width: `${focusLevel}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
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

      {/* Last command tooltip on hover */}
      {showTooltip && session.lastCommand && !compact && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 rounded-lg border border-white/20 text-xs text-white/90 whitespace-nowrap pointer-events-none z-50"
          style={{
            backdropFilter: 'blur(12px)',
            boxShadow: `0 8px 16px ${colors.glowColor}`
          }}
        >
          {session.lastCommand.substring(0, 50)}
          {session.lastCommand.length > 50 ? '...' : ''}
          <motion.div
            className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-black/90"
            style={{
              borderRight: `1px solid rgba(255, 255, 255, 0.2)`,
              borderBottom: `1px solid rgba(255, 255, 255, 0.2)`
            }}
          />
        </motion.div>
      )}
    </motion.button>
  );
};
