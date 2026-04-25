import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceStatusProps {
  state: 'idle' | 'listening' | 'processing' | 'speaking';
  transcript: string;
  interimTranscript: string;
  confidence: number;
  hasSpokenText: boolean;
}

export const VoiceStatus: React.FC<VoiceStatusProps> = ({
  state,
  transcript,
  interimTranscript,
  confidence,
  hasSpokenText
}) => {
  if (state === 'idle') {
    return null;
  }

  const displayText = transcript + interimTranscript;
  const hasText = displayText.length > 0;
  const confidencePercentage = Math.round(confidence * 100);

  const getConfidenceColor = () => {
    if (confidencePercentage < 50) return 'text-red-400';
    if (confidencePercentage < 75) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getWaveformBars = () => {
    const barCount = 8;
    const bars = [];
    for (let i = 0; i < barCount; i++) {
      const height = Math.sin(Date.now() / 100 + i * 0.5) * 20 + 30;
      bars.push(height);
    }
    return bars;
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="glass p-4 rounded-lg border border-neon-cyan/30 mb-4"
      >
        <div className="space-y-3">
          {state === 'listening' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs font-semibold text-neon-cyan uppercase">Listening</span>
                {hasText && (
                  <div className="flex items-center gap-1 flex-1 ml-2">
                    {getWaveformBars().map((height, i) => (
                      <div
                        key={i}
                        className="bg-gradient-to-t from-neon-cyan to-neon-purple rounded-sm"
                        style={{
                          width: '4px',
                          height: `${height}px`,
                          animation: `pulse 0.5s ease-in-out infinite`,
                          animationDelay: `${i * 50}ms`
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
              {hasSpokenText && (
                <div className={`text-sm font-semibold ${getConfidenceColor()}`}>
                  {confidencePercentage}%
                </div>
              )}
            </div>
          )}

          {hasText && (
            <div className="space-y-2">
              {transcript && (
                <div className="p-3 bg-neon-cyan/10 rounded border border-neon-cyan/20">
                  <p className="text-sm text-white font-medium">{transcript}</p>
                </div>
              )}
              {interimTranscript && (
                <div className="p-3 bg-white/5 rounded border border-white/10">
                  <p className="text-sm text-white/60 italic">{interimTranscript}</p>
                </div>
              )}
            </div>
          )}

          {state === 'processing' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-yellow-400 uppercase">Processing</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 bg-yellow-400 rounded-full"
                    style={{
                      animation: `bounce 1.4s ease-in-out infinite`,
                      animationDelay: `${i * 0.2}s`
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {state === 'speaking' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-green-400 uppercase">Speaking</span>
              <div className="flex gap-1">
                {getWaveformBars().map((_, i) => (
                  <div
                    key={i}
                    className="bg-gradient-to-t from-green-400 to-green-500 rounded-sm"
                    style={{
                      width: '4px',
                      height: '24px',
                      animation: `pulse 0.3s ease-in-out infinite`,
                      animationDelay: `${i * 40}ms`
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.4; transform: scaleY(0.5); }
            50% { opacity: 1; transform: scaleY(1); }
          }
          @keyframes bounce {
            0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
            40% { opacity: 1; transform: translateY(-8px); }
          }
        `}</style>
      </motion.div>
    </AnimatePresence>
  );
};
