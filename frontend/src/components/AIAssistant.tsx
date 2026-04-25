import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import NeuralGraphSphere from './NeuralGraphSphere';

interface AIAssistantProps {
  isListening?: boolean;
  isProcessing?: boolean;
  hasError?: boolean;
  accentColor?: 'cyan' | 'blue' | 'violet' | 'amber';
  onSpeak?: (text: string) => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({
  isListening = false,
  isProcessing = false,
  hasError = false,
  accentColor = 'cyan',
}) => {
  const [sphereState, setSphereState] = useState<'idle' | 'thinking' | 'success' | 'error'>('idle');

  useEffect(() => {
    if (hasError) {
      setSphereState('error');
    } else if (isProcessing || isListening) {
      setSphereState('thinking');
    } else {
      setSphereState('idle');
    }
  }, [isProcessing, isListening, hasError]);

  return (
    <div className="relative w-full h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 opacity-30">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={`bg-particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-cyan-400"
            animate={{
              x: [Math.random() * window.innerWidth, Math.random() * window.innerWidth],
              y: [Math.random() * window.innerHeight, Math.random() * window.innerHeight],
              opacity: [0, 0.5, 0],
            }}
            transition={{
              duration: 5 + Math.random() * 5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
          />
        ))}
      </div>

      {/* Main content container */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center gap-8">
        {/* Title */}
        <motion.div
          className="text-center"
          animate={{ opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
            JARVIS
          </h1>
          <p className="text-sm md:text-base text-cyan-300/70 font-mono tracking-widest">
            AI SESSION ORCHESTRATOR
          </p>
        </motion.div>

        {/* AI Core Sphere */}
        <div className="relative">
          <NeuralGraphSphere
            state={sphereState}
            size={280}
            accent={accentColor}
            className="drop-shadow-2xl"
          />

          {/* Surrounding holographic rings (decorative) */}
          <motion.div
            className="absolute inset-0 border-2 border-cyan-500/30 rounded-full"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          />
          <motion.div
            className="absolute inset-4 border border-purple-500/20 rounded-full"
            animate={{ rotate: [360, 0] }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        {/* Status panel */}
        <motion.div
          className="mt-8 px-8 py-4 rounded-lg backdrop-blur-md bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30"
          animate={{ boxShadow: ['0 0 20px rgba(0, 255, 255, 0.1)', '0 0 40px rgba(0, 255, 255, 0.3)', '0 0 20px rgba(0, 255, 255, 0.1)'] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="flex items-center gap-3 text-center">
            <motion.div
              className="w-2 h-2 rounded-full bg-cyan-400"
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <p className="text-sm md:text-base text-cyan-300 font-mono">
              {sphereState === 'thinking'
                ? '⟳ Processing request...'
                : sphereState === 'success'
                  ? '✓ Ready for command'
                  : sphereState === 'error'
                    ? '✗ Error detected'
                    : '◆ Awaiting input'}
            </p>
          </div>
        </motion.div>

        {/* Action hints */}
        <motion.div
          className="absolute bottom-12 text-center text-cyan-400/50 text-xs md:text-sm font-mono"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, delay: 1 }}
        >
          <p>Press CTRL + SPACE to start listening</p>
          <p>or speak a command naturally</p>
        </motion.div>
      </div>

      {/* Corner HUD elements */}
      <div className="absolute top-6 right-6 text-right text-xs text-cyan-400/60 font-mono space-y-1 z-20">
        <div>STATUS: {sphereState.toUpperCase()}</div>
        <div>MODE: VOICE</div>
        <div>SESSION: ACTIVE</div>
      </div>

      {/* Bottom connection indicator */}
      <motion.div
        className="absolute bottom-6 left-6 flex items-center gap-2 text-xs text-cyan-400/60 font-mono z-20"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <motion.div
          className="w-2 h-2 rounded-full bg-cyan-400"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <span>CONNECTED</span>
      </motion.div>
    </div>
  );
};

export default AIAssistant;
