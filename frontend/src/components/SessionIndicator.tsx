import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { SessionStatus } from '../types';

interface SessionIndicatorProps {
  status: SessionStatus;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

interface StatusConfig {
  color: string;
  glowColor: string;
  darkColor: string;
  label: string;
  animation: string;
}

const statusConfigs: Record<SessionStatus, StatusConfig> = {
  idle: {
    color: '#9CA3AF',
    glowColor: 'rgba(156, 163, 175, 0.4)',
    darkColor: '#6B7280',
    label: 'Idle',
    animation: 'fade'
  },
  thinking: {
    color: '#FBBF24',
    glowColor: 'rgba(251, 191, 36, 0.6)',
    darkColor: '#F59E0B',
    label: 'Thinking',
    animation: 'pulse-glow'
  },
  active: {
    color: '#06B6D4',
    glowColor: 'rgba(6, 182, 212, 0.7)',
    darkColor: '#0891B2',
    label: 'Active',
    animation: 'active-glow'
  },
  paused: {
    color: '#EF4444',
    glowColor: 'rgba(239, 68, 68, 0.5)',
    darkColor: '#DC2626',
    label: 'Paused',
    animation: 'blink'
  },
  completed: {
    color: '#F3F4F6',
    glowColor: 'rgba(243, 244, 246, 0.3)',
    darkColor: '#D1D5DB',
    label: 'Completed',
    animation: 'fade'
  }
};

const sizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4'
};

const SparkleParticle: React.FC<{ delay: number; color: string }> = ({ delay, color }) => (
  <motion.div
    className="absolute w-1 h-1 rounded-full"
    style={{ backgroundColor: color }}
    animate={{
      x: [0, (Math.random() - 0.5) * 40],
      y: [0, (Math.random() - 0.5) * 40],
      opacity: [1, 0]
    }}
    transition={{
      duration: 1.5,
      delay,
      repeat: Infinity,
      repeatDelay: 2
    }}
  />
);

export const SessionIndicator: React.FC<SessionIndicatorProps> = ({
  status,
  size = 'md',
  showLabel = false
}) => {
  const config = statusConfigs[status];

  const particles = useMemo(() => {
    if (status === 'active') {
      return Array.from({ length: 4 }, (_, i) => i);
    }
    return [];
  }, [status]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative inline-block">
        {/* Main dot */}
        <motion.div
          className={`${sizeClasses[size]} rounded-full`}
          style={{ backgroundColor: config.color }}
          animate={
            status === 'thinking'
              ? {
                  boxShadow: [
                    `0 0 8px ${config.glowColor}`,
                    `0 0 16px ${config.glowColor}`,
                    `0 0 8px ${config.glowColor}`
                  ]
                }
              : status === 'paused'
              ? {
                  opacity: [1, 0.4, 1]
                }
              : status === 'active'
              ? {
                  boxShadow: [
                    `0 0 12px ${config.glowColor}`,
                    `0 0 20px ${config.glowColor}`,
                    `0 0 12px ${config.glowColor}`
                  ]
                }
              : {}
          }
          transition={
            status === 'thinking'
              ? {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }
              : status === 'paused'
              ? {
                  duration: 1,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }
              : status === 'active'
              ? {
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }
              : {}
          }
        />

        {/* Glow background ring (for active and thinking) */}
        {(status === 'active' || status === 'thinking') && (
          <motion.div
            className={`absolute inset -2 rounded-full border`}
            style={{
              borderColor: config.color,
              opacity: 0.3
            }}
            animate={{
              scale: [1, 1.4],
              opacity: [0.5, 0]
            }}
            transition={{
              duration: 2,
              repeat: Infinity
            }}
          />
        )}

        {/* Sparkle particles for active sessions */}
        {particles.map((i) => (
          <SparkleParticle key={i} delay={i * 0.3} color={config.color} />
        ))}
      </div>

      {showLabel && (
        <span
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      )}
    </div>
  );
};

export default SessionIndicator;
