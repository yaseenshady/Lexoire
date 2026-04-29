import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function canUseWebGL() {
  if (typeof window === 'undefined') return false;
  const canvas = document.createElement('canvas');
  try {
    return Boolean(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function getDeviceProfile() {
  if (typeof window === 'undefined') {
    return { particleBudget: 3800, dpr: [1, 1.35] as [number, number], reducedMotion: false, antialias: false };
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const narrowScreen = Math.min(window.innerWidth, window.innerHeight) < 760;
  const coreCount = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  const lowCoreCount = coreCount <= 4;
  const platform = typeof navigator !== 'undefined'
    ? `${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()
    : '';
  const isWindows = platform.includes('win');
  const constrained = coarsePointer || narrowScreen || lowCoreCount;
  const balanced = constrained || isWindows;

  return {
    particleBudget: reducedMotion ? 1400 : constrained ? 2400 : isWindows ? 3200 : 4200,
    dpr: balanced ? [1, 1.2] as [number, number] : [1, 1.4] as [number, number],
    reducedMotion,
    antialias: !balanced,
  };
}

function sampleFrequency(audioFrequencies: Uint8Array | undefined, normalizedIndex: number) {
  if (!audioFrequencies || audioFrequencies.length === 0) return 0;
  const wrapped = ((normalizedIndex % 1) + 1) % 1;
  const exactIndex = wrapped * (audioFrequencies.length - 1);
  const lowIndex = Math.floor(exactIndex);
  const highIndex = Math.min(audioFrequencies.length - 1, lowIndex + 1);
  const mix = exactIndex - lowIndex;
  const low = audioFrequencies[lowIndex] / 255;
  const high = audioFrequencies[highIndex] / 255;
  return low * (1 - mix) + high * mix;
}

function sampleBand(audioFrequencies: Uint8Array | undefined, start: number, end: number) {
  if (!audioFrequencies || audioFrequencies.length === 0) return 0;
  const from = Math.max(0, Math.floor(audioFrequencies.length * start));
  const to = Math.max(from + 1, Math.min(audioFrequencies.length, Math.ceil(audioFrequencies.length * end)));
  let total = 0;
  for (let index = from; index < to; index += 1) total += audioFrequencies[index];
  return total / (to - from) / 255;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function AudioSphere({
  listening,
  muted,
  audioLevel,
  audioFrequencies,
  speechVelocity,
  particleBudget,
  reducedMotion,
}: {
  listening: boolean;
  muted: boolean;
  audioLevel: number;
  audioFrequencies?: Uint8Array;
  speechVelocity: number;
  particleBudget: number;
  reducedMotion: boolean;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);
  const smoothedEnergyRef = useRef(0);

  const { geometry, material, positionsBase, phaseOffsets, shellWeights, latitudes } = useMemo(() => {
    const count = particleBudget;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const weights = new Float32Array(count);
    const bands = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      const latitude = theta / Math.PI;
      const shellRadius = 1.85 + Math.random() * 0.7 + Math.sin(latitude * Math.PI) * 0.12;

      const x = shellRadius * Math.sin(theta) * Math.cos(phi);
      const y = shellRadius * Math.cos(theta);
      const z = shellRadius * Math.sin(theta) * Math.sin(phi);

      positions[index * 3] = x;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = z;

      phases[index] = Math.random() * Math.PI * 2;
      weights[index] = 0.4 + Math.random() * 0.9;
      bands[index] = latitude;

      colors[index * 3] = 0.08;
      colors[index * 3 + 1] = 0.95;
      colors[index * 3 + 2] = 0.52;
    }

    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    nextGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const nextMaterial = new THREE.PointsMaterial({
      size: 0.05,
      transparent: true,
      opacity: 0.92,
      sizeAttenuation: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return {
      geometry: nextGeometry,
      material: nextMaterial,
      positionsBase: new Float32Array(positions),
      phaseOffsets: phases,
      shellWeights: weights,
      latitudes: bands,
    };
  }, [particleBudget]);

  useFrame((_, delta) => {
    const cappedDelta = Math.min(delta, 0.05);
    timeRef.current += cappedDelta;
    if (!pointsRef.current) return;

    const bass = sampleBand(audioFrequencies, 0, 0.14);
    const mids = sampleBand(audioFrequencies, 0.14, 0.48);
    const treble = sampleBand(audioFrequencies, 0.48, 1);
    const speechDrive = Math.max(0, speechVelocity);
    const idlePulse = listening ? 0.02 + Math.sin(timeRef.current * 1.8) * 0.025 : 0.015;
    const targetEnergy = clamp01(audioLevel * 1.15 + bass * 0.45 + mids * 0.35);
    smoothedEnergyRef.current += (targetEnergy - smoothedEnergyRef.current) * 0.18;
    const globalEnergy = smoothedEnergyRef.current;

    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = positionAttr.array as Float32Array;
    const colors = colorAttr.array as Float32Array;

    for (let index = 0; index < positions.length; index += 3) {
      const pointIndex = index / 3;
      const baseX = positionsBase[index];
      const baseY = positionsBase[index + 1];
      const baseZ = positionsBase[index + 2];

      const baseLength = Math.sqrt(baseX * baseX + baseY * baseY + baseZ * baseZ);
      const nx = baseX / baseLength;
      const ny = baseY / baseLength;
      const nz = baseZ / baseLength;

      const phiNorm = (Math.atan2(baseZ, baseX) + Math.PI) / (Math.PI * 2);
      const thetaNorm = latitudes[pointIndex];
      const phase = phaseOffsets[pointIndex];
      const shellWeight = shellWeights[pointIndex];

      const polarSample = sampleFrequency(audioFrequencies, phiNorm);
      const verticalSample = sampleFrequency(audioFrequencies, thetaNorm);
      const swirlSample = sampleFrequency(audioFrequencies, phiNorm * 0.62 + thetaNorm * 0.38 + timeRef.current * 0.025);

      const mappedEnergy = polarSample * 0.5 + verticalSample * 0.3 + swirlSample * 0.2;
      const bassPunch = bass * (0.35 + shellWeight * 0.45);
      const trebleSpark = treble * (0.22 + (1 - thetaNorm) * 0.26);
      const motionScale = reducedMotion ? 0.22 : 1;
      const breathing = Math.sin(timeRef.current * (2.4 + shellWeight) + phase + phiNorm * 9) * (0.035 + globalEnergy * 0.08) * motionScale;
      const ridgeWave = Math.cos(timeRef.current * 4.2 + thetaNorm * 18 + phase) * (0.025 + mids * 0.09) * motionScale;
      const expansion = 1
        + idlePulse
        + mappedEnergy * 0.55
        + bassPunch
        + trebleSpark * 0.35
        + speechDrive * 0.18
        + breathing
        + ridgeWave;

      const tangentX = -nz;
      const tangentY = Math.sin(phiNorm * Math.PI * 2);
      const tangentZ = nx;
      const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY + tangentZ * tangentZ) || 1;
      const swirlAmplitude = (treble * 0.18 + speechDrive * 0.08 + mappedEnergy * 0.05) * Math.sin(timeRef.current * 5.5 + phase * 2) * motionScale;

      positions[index] = nx * baseLength * expansion + (tangentX / tangentLength) * swirlAmplitude;
      positions[index + 1] = ny * baseLength * expansion + (tangentY / tangentLength) * swirlAmplitude * 0.75;
      positions[index + 2] = nz * baseLength * expansion + (tangentZ / tangentLength) * swirlAmplitude;

      const intensity = muted ? 0.28 : clamp01(0.25 + mappedEnergy * 0.75 + bassPunch * 0.25 + speechDrive * 0.18);
      const hotness = muted ? 0 : clamp01(treble * 0.85 + mappedEnergy * 0.35);

      colors[index] = muted ? 0.26 : 0.06 + intensity * 0.16 + hotness * 0.5;
      colors[index + 1] = muted ? 0.3 : 0.42 + intensity * 0.5;
      colors[index + 2] = muted ? 0.34 : 0.18 + intensity * 0.28 + hotness * 0.62;
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;

    const rotationScale = reducedMotion ? 0.12 : 1;
    pointsRef.current.rotation.x += cappedDelta * (0.04 + mids * 0.18 + speechDrive * 0.2) * rotationScale;
    pointsRef.current.rotation.y += cappedDelta * (0.08 + bass * 0.35 + speechDrive * 0.15) * rotationScale;
    pointsRef.current.rotation.z += cappedDelta * (0.03 + treble * 0.24) * rotationScale;

    material.opacity = muted ? 0.34 : 0.72 + globalEnergy * 0.28;
    material.size = 0.034 + bass * 0.06 + treble * 0.035 + speechDrive * 0.02;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

function ReactiveShell({
  listening,
  muted,
  audioLevel,
  audioFrequencies,
  speechVelocity,
  reducedMotion,
}: {
  listening: boolean;
  muted: boolean;
  audioLevel: number;
  audioFrequencies?: Uint8Array;
  speechVelocity: number;
  reducedMotion: boolean;
}) {
  const shellRef = useRef<THREE.Mesh>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const ringARef = useRef<THREE.Mesh>(null);
  const ringBRef = useRef<THREE.Mesh>(null);
  const ringCRef = useRef<THREE.Mesh>(null);

  const timeRef = useRef(0);

  useFrame((_, delta) => {
    const cappedDelta = Math.min(delta, 0.05);
    timeRef.current += cappedDelta;
    const bass = sampleBand(audioFrequencies, 0, 0.14);
    const mids = sampleBand(audioFrequencies, 0.14, 0.48);
    const treble = sampleBand(audioFrequencies, 0.48, 1);
    const speechDrive = Math.max(0, speechVelocity);
    const pulse = 1 + audioLevel * 0.18 + bass * 0.22 + speechDrive * 0.08 + (listening ? Math.sin(timeRef.current * 2) * 0.015 : 0);

    const motionScale = reducedMotion ? 0.18 : 1;

    if (shellRef.current) {
      shellRef.current.scale.setScalar(pulse);
      shellRef.current.rotation.x += cappedDelta * (0.1 + mids * 0.3) * motionScale;
      shellRef.current.rotation.y += cappedDelta * (0.16 + bass * 0.45) * motionScale;
    }

    if (auraRef.current) {
      auraRef.current.scale.setScalar(1.02 + audioLevel * 0.35 + treble * 0.12);
      auraRef.current.rotation.y -= cappedDelta * (0.08 + treble * 0.2) * motionScale;
    }

    if (ringARef.current) {
      ringARef.current.rotation.z += cappedDelta * (0.32 + speechDrive * 0.4) * motionScale;
      ringARef.current.scale.setScalar(1 + bass * 0.16);
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.y -= cappedDelta * (0.24 + mids * 0.34) * motionScale;
      ringBRef.current.scale.setScalar(1 + mids * 0.14);
    }
    if (ringCRef.current) {
      ringCRef.current.rotation.x += cappedDelta * (0.28 + treble * 0.5) * motionScale;
      ringCRef.current.scale.setScalar(1 + treble * 0.18);
    }
  });

  const shellColor = muted ? '#5d6768' : '#2df7a3';
  const auraColor = muted ? '#7a8388' : '#66f7ff';

  return (
    <group>
      <mesh ref={auraRef}>
        <icosahedronGeometry args={[1.48, 5]} />
        <meshBasicMaterial
          color={auraColor}
          transparent
          opacity={muted ? 0.08 : 0.13 + audioLevel * 0.08}
          wireframe
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={shellRef}>
        <icosahedronGeometry args={[1.34, 6]} />
        <meshStandardMaterial
          color={shellColor}
          emissive={shellColor}
          emissiveIntensity={muted ? 0.05 : 0.18 + audioLevel * 0.35}
          transparent
          opacity={muted ? 0.09 : 0.14}
          wireframe
        />
      </mesh>
      <mesh ref={ringARef} rotation={[Math.PI / 2.6, 0.1, 0]}>
        <torusGeometry args={[2.08, 0.028, 14, 160]} />
        <meshBasicMaterial color={shellColor} transparent opacity={muted ? 0.09 : 0.22} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ringBRef} rotation={[0.25, Math.PI / 2.4, 0.3]}>
        <torusGeometry args={[2.22, 0.022, 14, 160]} />
        <meshBasicMaterial color={auraColor} transparent opacity={muted ? 0.08 : 0.2} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ringCRef} rotation={[0.9, 0.35, Math.PI / 2.1]}>
        <torusGeometry args={[2.34, 0.018, 10, 120]} />
        <meshBasicMaterial color={muted ? '#6d7679' : '#9effd6'} transparent opacity={muted ? 0.06 : 0.14} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function CssParticleFallback({
  listening,
  muted,
  audioLevel,
}: {
  listening: boolean;
  muted: boolean;
  audioLevel: number;
}) {
  const particles = useMemo(() => {
    return Array.from({ length: 42 }, (_, index) => ({
      id: index,
      left: 12 + ((index * 37) % 76),
      top: 10 + ((index * 53) % 78),
      size: 2 + (index % 5),
      delay: -(index % 11) * 0.42,
      duration: 4.8 + (index % 7) * 0.55,
    }));
  }, []);

  const glow = muted ? 0.18 : 0.34 + audioLevel * 0.42;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: `radial-gradient(circle at 50% 48%, rgba(45, 247, 163, ${glow}), rgba(10, 30, 16, 0.34) 34%, rgba(2, 8, 5, 0.02) 68%)`,
      }}
    >
      <style>{`
        @keyframes lexoireFallbackOrbit {
          0% { transform: translate3d(-10px, 0, 0) scale(0.82); opacity: 0.25; }
          45% { transform: translate3d(14px, -22px, 0) scale(1.35); opacity: 0.95; }
          100% { transform: translate3d(-10px, 0, 0) scale(0.82); opacity: 0.25; }
        }
        @keyframes lexoireFallbackCore {
          0%, 100% { transform: translate(-50%, -50%) scale(0.94); filter: blur(0.2px); }
          50% { transform: translate(-50%, -50%) scale(1.07); filter: blur(0); }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 'min(42vw, 260px)',
          height: 'min(42vw, 260px)',
          borderRadius: '50%',
          border: `1px solid ${muted ? 'rgba(120, 135, 136, 0.35)' : 'rgba(45, 247, 163, 0.42)'}`,
          boxShadow: muted
            ? '0 0 42px rgba(120, 135, 136, 0.16), inset 0 0 42px rgba(120, 135, 136, 0.08)'
            : `0 0 ${56 + audioLevel * 90}px rgba(45, 247, 163, ${0.24 + audioLevel * 0.28}), inset 0 0 48px rgba(102, 247, 255, 0.15)`,
          animation: listening ? 'lexoireFallbackCore 2.2s ease-in-out infinite' : 'lexoireFallbackCore 4.8s ease-in-out infinite',
        }}
      />
      {particles.map((particle) => (
        <span
          key={particle.id}
          style={{
            position: 'absolute',
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            width: particle.size,
            height: particle.size,
            borderRadius: '50%',
            background: muted ? 'rgba(132, 148, 150, 0.8)' : 'rgba(84, 255, 186, 0.95)',
            boxShadow: muted ? '0 0 8px rgba(132, 148, 150, 0.35)' : '0 0 14px rgba(84, 255, 186, 0.78)',
            animation: `lexoireFallbackOrbit ${particle.duration}s ease-in-out ${particle.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function RealisticSphere({
  listening,
  muted,
  audioLevel = 0,
  audioFrequencies,
  speechVelocity = 0,
}: {
  listening: boolean;
  muted: boolean;
  audioLevel?: number;
  audioFrequencies?: Uint8Array;
  speechVelocity?: number;
}) {
  const [webglReady, setWebglReady] = useState(() => canUseWebGL());
  const [deviceProfile, setDeviceProfile] = useState(() => getDeviceProfile());
  const primaryColor = muted ? 0x4e5657 : 0x2df7a3;
  const accentColor = muted ? 0x596162 : 0x66f7ff;

  useEffect(() => {
    const refreshProfile = () => {
      setWebglReady(canUseWebGL());
      setDeviceProfile(getDeviceProfile());
    };
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', refreshProfile);
    motionQuery.addEventListener?.('change', refreshProfile);
    return () => {
      window.removeEventListener('resize', refreshProfile);
      motionQuery.removeEventListener?.('change', refreshProfile);
    };
  }, []);

  if (!webglReady) {
    return <CssParticleFallback listening={listening} muted={muted} audioLevel={audioLevel} />;
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 42 }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      frameloop="always"
      performance={{ min: 0.55 }}
      gl={{ alpha: true, antialias: deviceProfile.antialias, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false }}
      dpr={deviceProfile.dpr}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          setWebglReady(false);
        }, { once: true });
      }}
    >
      <fog attach="fog" args={['#04110a', 5.6, 8.8]} />
      <ambientLight intensity={0.35 + audioLevel * 0.28} color={primaryColor} />
      <pointLight position={[0, 0, 4.8]} intensity={2.4 + audioLevel * 1.8} color={accentColor} />
      <pointLight position={[4.8, 3.8, 3]} intensity={1.6 + audioLevel * 1.2} color={primaryColor} />
      <pointLight position={[-5, -4, -3.5]} intensity={1.2 + audioLevel * 0.9} color={accentColor} />
      <spotLight position={[0, 7, 3]} intensity={1.8 + audioLevel * 1.2} color={primaryColor} angle={0.95} penumbra={1} />
      <ReactiveShell listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocity} reducedMotion={deviceProfile.reducedMotion} />
      <AudioSphere listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocity} particleBudget={deviceProfile.particleBudget} reducedMotion={deviceProfile.reducedMotion} />
    </Canvas>
  );
}
