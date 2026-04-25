import React from 'react';
import { motion } from 'framer-motion';
import { ConnectionState } from '../hooks/useSocket';
import { RuntimeSummary } from '../types';

interface StatusBarProps {
  isConnected: boolean;
  isListening: boolean;
  connectionState: ConnectionState;
  endpoint: string;
  runtime: RuntimeSummary | null;
}

const connectionCopy: Record<ConnectionState, { label: string; color: string; glowColor: string }> = {
  connected: { label: 'Connected', color: '#00ffff', glowColor: 'rgba(0, 255, 255, 0.5)' },
  connecting: { label: 'Connecting', color: '#facc15', glowColor: 'rgba(250, 204, 21, 0.4)' },
  reconnecting: { label: 'Reconnecting', color: '#f97316', glowColor: 'rgba(249, 115, 22, 0.4)' },
  disconnected: { label: 'Disconnected', color: '#ef4444', glowColor: 'rgba(239, 68, 68, 0.4)' },
  error: { label: 'Connection error', color: '#ef4444', glowColor: 'rgba(239, 68, 68, 0.4)' }
};

export const StatusBar: React.FC<StatusBarProps> = ({ isConnected, isListening, connectionState, endpoint, runtime }) => {
  const connection = connectionCopy[connectionState];
  const runtimeCopy = runtime
    ? `${runtime.conversationCount} conversations • ${runtime.memoryCount} memories • ${runtime.projectPlanCount} plans`
    : 'Runtime summary unavailable until the backend responds.';

  return (
    <div className="glass px-6 py-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between border-t border-neon-cyan/20">
      <div className="flex flex-wrap items-center gap-5 xl:gap-8">
        {/* Connection status */}
        <motion.div 
          className="flex items-center gap-3"
          whileHover={{ scale: 1.05 }}
        >
          <motion.div
            animate={{
              scale: isConnected ? [1, 1.3, 1] : 1,
              boxShadow: [
                `0 0 8px ${connection.glowColor}`,
                `0 0 16px ${connection.glowColor}`,
                `0 0 8px ${connection.glowColor}`
              ]
            }}
            transition={{ duration: 1.5, repeat: isConnected ? Infinity : 0 }}
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: connection.color }}
          />
          <span className="text-sm font-medium text-white/80">{connection.label}</span>
        </motion.div>

        {/* Voice listening status */}
        <motion.div 
          className="flex items-center gap-3"
          whileHover={{ scale: 1.05 }}
        >
          <motion.div
            animate={{
              scale: isListening ? [1, 1.3, 1] : 1,
              boxShadow: isListening ? [
                '0 0 8px rgba(0, 255, 255, 0.6)',
                '0 0 16px rgba(0, 255, 255, 0.8)',
                '0 0 8px rgba(0, 255, 255, 0.6)'
              ] : 'none'
            }}
            transition={{ duration: 1, repeat: isListening ? Infinity : 0 }}
            className={`w-4 h-4 rounded-full transition-all ${isListening ? 'bg-neon-cyan' : 'bg-white/25'}`}
          />
          <span className={`text-sm font-medium transition-colors ${isListening ? 'text-neon-cyan' : 'text-white/60'}`}>
            {isListening ? 'Listening…' : 'Idle'}
          </span>
        </motion.div>

        {/* Endpoint */}
        <div className="text-xs text-white/50 px-3 py-1.5 rounded-lg bg-white/3 border border-white/10">
          Endpoint: <span className="text-neon-cyan/80 font-mono">{endpoint}</span>
        </div>
      </div>

      {/* Runtime info */}
      <div className="text-right space-y-1.5">
        <div className="text-sm text-white/60 leading-tight">{runtimeCopy}</div>
        {runtime && (
          <motion.div 
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={`text-xs font-mono transition-all ${runtime.copilotAvailable ? 'text-neon-cyan' : 'text-orange-300'}`}
          >
            {runtime.copilotAvailable
              ? `✓ CLI ready: ${runtime.copilotCommand}`
              : `⚠ CLI unavailable: ${runtime.copilotCommand}`}
          </motion.div>
        )}
      </div>
    </div>
  );
};
