import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Message } from '../types';

interface ConversationPanelProps {
  messages: Message[];
  isConnected: boolean;
  suggestedPrompts: string[];
  onSelectPrompt: (prompt: string) => void;
}

export const ConversationPanel: React.FC<ConversationPanelProps> = ({
  messages,
  isConnected,
  suggestedPrompts,
  onSelectPrompt
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  return (
    <div className="glass-panel p-6 h-full flex flex-col overflow-hidden">
      <motion.div 
        className="flex items-center justify-between mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-2xl font-bold neon-text">Conversation</h2>
        <motion.span 
          className="text-xs font-mono text-neon-cyan/70 px-3 py-1 rounded-full border border-neon-cyan/30 bg-neon-cyan/5"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </motion.span>
      </motion.div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, x: message.role === 'user' ? 20 : -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
              className={`p-4 rounded-xl border transition-all ${
                message.role === 'user'
                  ? 'bg-gradient-to-br from-neon-cyan/15 to-neon-cyan/5 border-neon-cyan/40 ml-6 shadow-lg shadow-neon-cyan/10'
                  : message.role === 'assistant'
                    ? 'bg-gradient-to-br from-neon-purple/15 to-neon-purple/5 border-neon-purple/40 mr-6 shadow-lg shadow-neon-purple/10'
                    : 'bg-white/5 border-white/15'
              }`}
              whileHover={{ scale: 1.02, y: -2 }}
            >
              <div className="flex items-start gap-3">
                <motion.div 
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
                    message.role === 'user'
                      ? 'bg-neon-cyan/20 border border-neon-cyan/40'
                      : message.role === 'assistant'
                        ? 'bg-neon-purple/20 border border-neon-purple/40'
                        : 'bg-white/10 border border-white/20'
                  }`}
                >
                  {message.role === 'user' ? '👤' : message.role === 'assistant' ? '🤖' : 'ℹ️'}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <p className="text-sm font-semibold capitalize text-white/90">{message.role}</p>
                    <p className="text-xs text-white/40 whitespace-nowrap font-mono">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="text-white/85 whitespace-pre-wrap break-words leading-relaxed text-sm">
                    {message.content}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {messages.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center text-white/60 mt-12 border-2 border-dashed border-neon-cyan/30 rounded-xl p-8 bg-gradient-to-br from-neon-cyan/5 to-neon-purple/5"
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <p className="text-lg font-semibold text-white mb-2">No conversation yet</p>
              <p className="text-sm text-white/70 max-w-xl mx-auto mb-8">
                Start with voice or run one of the quick prompts below to begin exploring JARVIS.
              </p>
            </motion.div>

            <div className="grid gap-3 mt-6 sm:grid-cols-2 text-left">
              {suggestedPrompts.map((prompt, idx) => (
                <motion.button
                  key={prompt}
                  type="button"
                  onClick={() => onSelectPrompt(prompt)}
                  disabled={!isConnected}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  whileHover={{ scale: isConnected ? 1.05 : 1, translateY: -2 }}
                  whileTap={{ scale: isConnected ? 0.98 : 1 }}
                  className="rounded-lg border-2 border-neon-cyan/40 bg-gradient-to-br from-neon-cyan/10 to-neon-cyan/5 px-4 py-3 text-sm font-medium text-neon-cyan/90 hover:border-neon-cyan/70 hover:bg-neon-cyan/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-neon-cyan/10 hover:shadow-neon-cyan/30"
                >
                  {prompt}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
