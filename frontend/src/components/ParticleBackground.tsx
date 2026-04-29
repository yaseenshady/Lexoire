import React, { useRef, useEffect } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  hueShift: number;
}

export const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 700;
    const dpr = Math.min(window.devicePixelRatio || 1, coarsePointer || smallScreen ? 1.5 : 2);
    const particleCount = reducedMotion ? 18 : coarsePointer || smallScreen ? 34 : 62;
    const resizeCanvas = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * (coarsePointer ? 0.26 : 0.42),
        vy: (Math.random() - 0.5) * (coarsePointer ? 0.26 : 0.42),
        radius: Math.random() * (coarsePointer ? 1.6 : 2.2) + 0.8,
        opacity: Math.random() * 0.36 + 0.16,
        hueShift: Math.random()
      });
    }

    let animationId: number;
    let visible = !document.hidden;

    const handleVisibility = () => {
      visible = !document.hidden;
      if (visible) animationId = requestAnimationFrame(animate);
    };

    const animate = () => {
      if (!visible) return;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const time = performance.now() * 0.001;

      particles.forEach((particle) => {
        if (!reducedMotion) {
          particle.x += particle.vx;
          particle.y += particle.vy;
        }

        if (particle.x < 0 || particle.x > window.innerWidth) particle.vx *= -1;
        if (particle.y < 0 || particle.y > window.innerHeight) particle.vy *= -1;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        const pulse = reducedMotion ? 0.65 : 0.72 + Math.sin(time * 1.7 + particle.hueShift * 8) * 0.28;
        ctx.fillStyle = `rgba(${Math.round(35 + particle.hueShift * 45)}, 255, ${Math.round(145 + particle.hueShift * 90)}, ${particle.opacity * pulse})`;
        ctx.fill();
      });

      const linkDistance = coarsePointer || smallScreen ? 118 : 152;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < linkDistance) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(24, 255, 170, ${0.16 * (1 - distance / linkDistance)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.22,
      }}
    />
  );
};
