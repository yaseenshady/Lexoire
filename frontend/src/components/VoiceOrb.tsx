import React, { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface VoiceOrbProps {
  state: 'idle' | 'listening' | 'processing' | 'speaking';
  confidence?: number;
  hasSpokenText?: boolean;
  isSilent?: boolean;
  amplitude?: number;
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({ 
  state = 'idle', 
  confidence = 0,
  hasSpokenText = false,
  isSilent: _isSilent = false,
  amplitude = 0.5 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      if (state === 'listening') {
        time += 0.05;

        for (let i = 0; i < 3; i++) {
          const radius = 80 + i * 30 + Math.sin(time + i) * 20 * amplitude;
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
          
          const colors = [
            ['rgba(0, 255, 255, 0.8)', 'rgba(0, 255, 255, 0)'],
            ['rgba(191, 0, 255, 0.6)', 'rgba(191, 0, 255, 0)'],
            ['rgba(255, 0, 255, 0.4)', 'rgba(255, 0, 255, 0)']
          ];

          gradient.addColorStop(0, colors[i][0]);
          gradient.addColorStop(1, colors[i][1]);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (state === 'processing') {
        time += 0.08;
        const rotationSpeed = time;

        for (let i = 0; i < 2; i++) {
          const radius = 85 + i * 35;
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
          
          gradient.addColorStop(0, `rgba(255, 165, 0, ${0.6 - i * 0.2})`);
          gradient.addColorStop(1, `rgba(255, 165, 0, 0)`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(
          centerX + Math.cos(rotationSpeed) * 60,
          centerY + Math.sin(rotationSpeed) * 60,
          15,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      } else if (state === 'speaking') {
        time += 0.06;

        for (let i = 0; i < 4; i++) {
          const waveHeight = 15 + Math.sin(time + i * 0.5) * 10;
          const radius = 70 + i * 25 + waveHeight;
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
          
          const greenIntensity = 0.8 - i * 0.15;
          gradient.addColorStop(0, `rgba(0, 255, 100, ${greenIntensity})`);
          gradient.addColorStop(1, `rgba(0, 255, 100, 0)`);

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const radius = 100;
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [state, amplitude]);

  const getStateLabel = () => {
    if (state === 'listening') return hasSpokenText ? 'Still listening…' : 'Listening…';
    if (state === 'processing') return 'Processing…';
    if (state === 'speaking') return 'Speaking…';
    return 'Awaiting command';
  };

  const getConfidenceLabel = () => {
    if (state !== 'listening' || !hasSpokenText) return null;
    const percentage = Math.round(confidence * 100);
    if (percentage < 50) return `Confidence: ${percentage}% ⚠️`;
    if (percentage < 75) return `Confidence: ${percentage}%`;
    return `Confidence: ${percentage}% ✓`;
  };

  const getBorderColor = () => {
    if (state === 'speaking') return 'border-green-400 animate-glow';
    if (state === 'processing') return 'border-yellow-400 animate-glow';
    if (state === 'listening') return 'border-neon-cyan animate-glow';
    return 'border-white/30';
  };

  const getIconColor = () => {
    if (state === 'speaking') return 'text-green-400';
    if (state === 'processing') return 'text-yellow-400';
    if (state === 'listening') return 'text-neon-cyan';
    return 'text-white/50';
  };

  return (
    <motion.div
      className="relative flex items-center justify-center"
      animate={{
        scale: (state === 'listening' || state === 'processing') ? [1, 1.05, 1] : 1,
      }}
      transition={{
        duration: 2,
        repeat: (state === 'listening' || state === 'processing') ? Infinity : 0,
        ease: "easeInOut"
      }}
    >
      <div className={`absolute inset-8 rounded-full bg-neon-cyan/10 blur-3xl transition-colors ${
        state === 'speaking' ? 'bg-green-500/10' : 
        state === 'processing' ? 'bg-yellow-500/10' : 
        'bg-neon-cyan/10'
      }`} />
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="w-full h-full"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`w-24 h-24 rounded-full border-4 ${getBorderColor()} flex items-center justify-center backdrop-blur-sm bg-white/5 shadow-[0_0_80px_rgba(34,211,238,0.18)] transition-colors`}>
          {state === 'speaking' ? (
            <svg
              className={`w-12 h-12 ${getIconColor()}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          ) : state === 'processing' ? (
            <svg
              className={`w-12 h-12 ${getIconColor()} animate-spin`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" opacity="0.25" />
              <path d="M12 2A10 10 0 0 1 12 22" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              className={`w-12 h-12 ${getIconColor()}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          )}
        </div>
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <span className="control-pill">{getStateLabel()}</span>
        {getConfidenceLabel() && (
          <span className="text-xs text-neon-cyan/80">{getConfidenceLabel()}</span>
        )}
      </div>
    </motion.div>
  );
};
