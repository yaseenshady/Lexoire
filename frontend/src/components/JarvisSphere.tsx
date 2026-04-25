import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

interface JarvisSphereProps {
  state?: 'idle' | 'thinking' | 'success' | 'error';
  size?: number;
  accent?: 'cyan' | 'blue' | 'violet' | 'amber';
  className?: string;
}

const JarvisSphere: React.FC<JarvisSphereProps> = ({
  state = 'idle',
  size = 240,
  accent = 'cyan',
  className = '',
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Accent color mappings
  const accentColors = {
    cyan: { glow: '#00ffff', dark: '#0088ff', shadow: '#0099ff' },
    blue: { glow: '#00bbff', dark: '#0066ff', shadow: '#0055ff' },
    violet: { glow: '#bf00ff', dark: '#7700ff', shadow: '#6600cc' },
    amber: { glow: '#ffaa00', dark: '#ff8800', shadow: '#ff6600' },
  };

  const colors = accentColors[accent];

  // Generate particle positions
  const particles = useMemo(() => {
    const count = state === 'thinking' ? 24 : 16;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (i / count) * Math.PI * 2,
      radius: 50 + Math.sin(i * 0.5) * 15,
      speed: 2 + (i % 3),
    }));
  }, [state]);

  // Generate orbital rings
  const rings = useMemo(
    () => [
      {
        radius: 60,
        tilt: 20,
        speed: 8,
        width: 1.5,
        opacity: 0.6,
      },
      {
        radius: 75,
        tilt: -35,
        speed: -6,
        width: 1,
        opacity: 0.4,
      },
      {
        radius: 90,
        tilt: 0,
        speed: 10,
        width: 1,
        opacity: 0.3,
      },
    ],
    []
  );

  // Animation configurations based on state
  const animationConfig = {
    idle: {
      pulse: 1,
      glowOpacity: 0.5,
      particleSpeed: 1,
      lineOpacity: 0.7,
      rotation: 360,
    },
    thinking: {
      pulse: 1.2,
      glowOpacity: 0.9,
      particleSpeed: 1.5,
      lineOpacity: 0.9,
      rotation: 360,
    },
    success: {
      pulse: 0.9,
      glowOpacity: 0.7,
      particleSpeed: 0.5,
      lineOpacity: 0.8,
      rotation: 180,
    },
    error: {
      pulse: 1.1,
      glowOpacity: 0.8,
      particleSpeed: 1.2,
      lineOpacity: 0.8,
      rotation: 360,
    },
  };

  const config = animationConfig[state];
  const duration = prefersReducedMotion ? 0.001 : state === 'thinking' || isHovering ? 4 : 8;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => !prefersReducedMotion && setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Outer glow layer */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: `0 0 ${size * 0.3}px ${colors.glow}44, inset 0 0 ${size * 0.2}px ${colors.glow}22`,
        }}
        animate={{
          boxShadow: [
            `0 0 ${size * 0.3}px ${colors.glow}44, inset 0 0 ${size * 0.2}px ${colors.glow}22`,
            `0 0 ${size * 0.4}px ${colors.glow}66, inset 0 0 ${size * 0.25}px ${colors.glow}33`,
            `0 0 ${size * 0.3}px ${colors.glow}44, inset 0 0 ${size * 0.2}px ${colors.glow}22`,
          ],
        }}
        transition={{
          duration: prefersReducedMotion ? 0.001 : 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Core radial gradient background */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ filter: 'drop-shadow(0 0 8px rgba(0, 0, 0, 0.5))' }}
      >
        <defs>
          {/* Radial gradient for core */}
          <radialGradient id={`coreGradient-${accent}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.glow} stopOpacity={config.glowOpacity * 0.8} />
            <stop offset="40%" stopColor={colors.dark} stopOpacity={config.glowOpacity * 0.5} />
            <stop offset="100%" stopColor={colors.glow} stopOpacity={0} />
          </radialGradient>

          {/* Radial gradient for glow */}
          <radialGradient id={`glowGradient-${accent}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={colors.glow} stopOpacity={0} />
            <stop offset="70%" stopColor={colors.glow} stopOpacity={config.glowOpacity * 0.3} />
            <stop offset="100%" stopColor={colors.glow} stopOpacity={0} />
          </radialGradient>

          {/* Filter for scanlines */}
          <filter id={`scanlines-${accent}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.8"
              numOctaves="4"
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
          </filter>
        </defs>

        {/* Core sphere */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.12}
          fill={`url(#coreGradient-${accent})`}
          animate={{
            r: [size * 0.12, size * 0.14, size * 0.12],
          }}
          transition={{
            duration: prefersReducedMotion ? 0.001 : 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Glow halo */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.25}
          fill={`url(#glowGradient-${accent})`}
          opacity={config.glowOpacity}
        />

        {/* Latitude lines */}
        <motion.g
          opacity={config.lineOpacity}
          animate={{
            rotate: [0, config.rotation, 0],
          }}
          transition={{
            duration: prefersReducedMotion ? 0.001 : duration,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          {[0, 30, 60, 90, 120, 150].map((latOffset) => (
            <motion.circle
              key={`lat-${latOffset}`}
              cx={size / 2}
              cy={size / 2}
              r={size * 0.18 * Math.cos((latOffset * Math.PI) / 180)}
              fill="none"
              stroke={colors.glow}
              strokeWidth={1}
              opacity={config.lineOpacity * (0.5 + Math.random() * 0.5)}
              animate={{
                strokeOpacity: [config.lineOpacity * 0.5, config.lineOpacity, config.lineOpacity * 0.5],
              }}
              transition={{
                duration: prefersReducedMotion ? 0.001 : 4 + latOffset / 60,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.g>

        {/* Longitude lines */}
        <motion.g
          opacity={config.lineOpacity}
          animate={{
            rotate: [0, -config.rotation, 0],
          }}
          transition={{
            duration: prefersReducedMotion ? 0.001 : duration,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          {[0, 45, 90, 135, 180, 225, 270, 315].map((lonOffset) => {
            const rad = (lonOffset * Math.PI) / 180;
            const startX = size / 2 + size * 0.18 * Math.cos(rad);
            const startY = size / 2 + size * 0.18 * Math.sin(rad);
            const endX = size / 2 - size * 0.18 * Math.cos(rad);
            const endY = size / 2 - size * 0.18 * Math.sin(rad);

            return (
              <motion.line
                key={`lon-${lonOffset}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={colors.glow}
                strokeWidth={0.8}
                opacity={config.lineOpacity * 0.6}
                animate={{
                  strokeOpacity: [config.lineOpacity * 0.3, config.lineOpacity * 0.6, config.lineOpacity * 0.3],
                }}
                transition={{
                  duration: prefersReducedMotion ? 0.001 : 3 + lonOffset / 120,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            );
          })}
        </motion.g>

        {/* Orbiting rings */}
        {rings.map((ring, ringIdx) => (
          <motion.g
            key={`ring-${ringIdx}`}
            animate={{
              rotate: [0, ring.speed * (state === 'thinking' ? 1.5 : 1) * 360, 0],
            }}
            transition={{
              duration: prefersReducedMotion ? 0.001 : 20 / Math.abs(ring.speed),
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
          >
            <ellipse
              cx={size / 2}
              cy={size / 2}
              rx={ring.radius}
              ry={ring.radius * 0.6}
              fill="none"
              stroke={colors.glow}
              strokeWidth={ring.width}
              opacity={ring.opacity * config.glowOpacity}
              style={{
                transform: `rotateX(${ring.tilt}deg)`,
                transformOrigin: `${size / 2}px ${size / 2}px`,
              }}
            />
          </motion.g>
        ))}

        {/* Data packet particles */}
        {particles.map((particle) => {
          const trailCount = 3;
          return (
            <motion.g key={`particle-${particle.id}`}>
              {/* Particle trail */}
              {Array.from({ length: trailCount }).map((_, trailIdx) => (
                <motion.circle
                  key={`trail-${particle.id}-${trailIdx}`}
                  r={1.5 - trailIdx * 0.4}
                  fill={colors.glow}
                  opacity={(0.4 * (trailCount - trailIdx)) / trailCount}
                  animate={{
                    cx: [
                      size / 2 + particle.radius * Math.cos(particle.angle),
                      size / 2 + particle.radius * Math.cos(particle.angle + Math.PI * 2),
                    ],
                    cy: [
                      size / 2 + particle.radius * Math.sin(particle.angle),
                      size / 2 + particle.radius * Math.sin(particle.angle + Math.PI * 2),
                    ],
                  }}
                  transition={{
                    duration: prefersReducedMotion ? 0.001 : (20 / particle.speed) * (1 + trailIdx * 0.1),
                    repeat: Infinity,
                    ease: 'linear',
                    delay: (trailIdx * 0.1) / (1 + trailIdx),
                  }}
                />
              ))}

              {/* Main particle */}
              <motion.circle
                r={2.5}
                fill={colors.glow}
                opacity={config.glowOpacity}
                animate={{
                  cx: [
                    size / 2 + particle.radius * Math.cos(particle.angle),
                    size / 2 + particle.radius * Math.cos(particle.angle + Math.PI * 2),
                  ],
                  cy: [
                    size / 2 + particle.radius * Math.sin(particle.angle),
                    size / 2 + particle.radius * Math.sin(particle.angle + Math.PI * 2),
                  ],
                  r: [2.5, 3.5, 2.5],
                }}
                transition={{
                  duration: prefersReducedMotion ? 0.001 : 20 / particle.speed,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            </motion.g>
          );
        })}

        {/* Scanline shimmer */}
        <motion.g opacity={0.08} animate={{ opacity: [0.05, 0.15, 0.05] }} transition={{ duration: prefersReducedMotion ? 0.001 : 2.5, repeat: Infinity }}>
          <line x1={size / 4} y1={size / 2} x2={(size * 3) / 4} y2={size / 2} stroke={colors.glow} strokeWidth={0.5} />
          <line x1={size / 3} y1={(size * 2) / 5} x2={(size * 2) / 3} y2={(size * 2) / 5} stroke={colors.glow} strokeWidth={0.3} />
          <line x1={size / 3} y1={(size * 3) / 5} x2={(size * 2) / 3} y2={(size * 3) / 5} stroke={colors.glow} strokeWidth={0.3} />
        </motion.g>

        {/* Micro-dots and connection lines */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const distance = size * 0.22;
          const x = size / 2 + distance * Math.cos(angle);
          const y = size / 2 + distance * Math.sin(angle);

          return (
            <motion.g key={`cluster-${i}`}>
              <motion.circle
                cx={x}
                cy={y}
                r={1.2}
                fill={colors.glow}
                opacity={config.glowOpacity * 0.6}
                animate={{
                  r: [1.2, 1.8, 1.2],
                  opacity: [config.glowOpacity * 0.4, config.glowOpacity * 0.8, config.glowOpacity * 0.4],
                }}
                transition={{
                  duration: prefersReducedMotion ? 0.001 : 1.5 + i * 0.15,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              {/* Connection lines to center */}
              <motion.line
                x1={size / 2}
                y1={size / 2}
                x2={x}
                y2={y}
                stroke={colors.glow}
                strokeWidth={0.5}
                opacity={config.glowOpacity * 0.3}
                animate={{
                  opacity: [
                    config.glowOpacity * 0.1,
                    config.glowOpacity * 0.4,
                    config.glowOpacity * 0.1,
                  ],
                }}
                transition={{
                  duration: prefersReducedMotion ? 0.001 : 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.1,
                }}
              />
            </motion.g>
          );
        })}
      </svg>

      {/* HUD label annotation */}
      <motion.div
        className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs font-mono tracking-wider"
        style={{ color: colors.glow }}
        animate={{
          opacity: [0.6, 1, 0.6],
        }}
        transition={{
          duration: prefersReducedMotion ? 0.001 : 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {state === 'thinking' ? '◆ PROCESSING' : state === 'success' ? '✓ READY' : state === 'error' ? '✗ ERROR' : '• IDLE'}
      </motion.div>
    </div>
  );
};

export default JarvisSphere;
