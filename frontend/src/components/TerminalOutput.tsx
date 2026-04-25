import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ConnectionState } from '../hooks/useSocket';

interface TerminalOutputProps {
  output: string[];
  isRunning: boolean;
  lastCommand: string | null;
  connectionState: ConnectionState;
  onClear: () => void;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  output,
  isRunning,
  lastCommand,
  connectionState,
  onClear
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="glass p-6 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold neon-text">Terminal Output</h2>
          <p className="text-xs text-white/45 mt-1">
            {lastCommand ? `Last command: ${lastCommand}` : 'Run a prompt to stream backend output here.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isRunning && (
            <motion.div
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="flex items-center gap-2 text-neon-cyan text-sm"
            >
              <div className="w-2 h-2 bg-neon-cyan rounded-full"></div>
              Running...
            </motion.div>
          )}

          <button
            type="button"
            onClick={onClear}
            disabled={output.length === 0 || isRunning}
            className="px-3 py-2 rounded-lg border border-white/15 text-xs text-white/70 hover:border-white/30 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 bg-black/50 rounded-lg p-4 font-mono text-sm overflow-y-auto border border-neon-cyan/20"
      >
        {output.length > 0 ? (
          output.map((line, index) => (
            <motion.pre
              key={`${index}-${line.slice(0, 16)}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`whitespace-pre-wrap break-words ${line.toLowerCase().includes('error') ? 'text-red-300' : 'text-green-400'}`}
            >
              {line}
            </motion.pre>
          ))
        ) : (
          <div className="text-white/35 text-center mt-10 max-w-md mx-auto">
            <p className="text-base text-white/60">Waiting for command execution…</p>
            <p className="text-sm mt-2">
              {connectionState === 'connected'
                ? 'Prompt output from the backend will stream here in real time.'
                : 'Terminal output will appear once the backend connection is available.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
