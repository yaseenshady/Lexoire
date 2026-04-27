import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

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
}: {
  listening: boolean;
  muted: boolean;
  audioLevel: number;
  audioFrequencies?: Uint8Array;
  speechVelocity: number;
}) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const { geometry, material, positionsBase, phaseOffsets, shellWeights, latitudes } = useMemo(() => {
    const count = 5200;
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
  }, []);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (!pointsRef.current) return;

    const bass = sampleBand(audioFrequencies, 0, 0.14);
    const mids = sampleBand(audioFrequencies, 0.14, 0.48);
    const treble = sampleBand(audioFrequencies, 0.48, 1);
    const speechDrive = Math.max(0, speechVelocity);
    const idlePulse = listening ? 0.02 + Math.sin(timeRef.current * 1.8) * 0.025 : 0.015;
    const globalEnergy = clamp01(audioLevel * 1.15 + bass * 0.45 + mids * 0.35);

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
      const breathing = Math.sin(timeRef.current * (2.4 + shellWeight) + phase + phiNorm * 9) * (0.035 + globalEnergy * 0.08);
      const ridgeWave = Math.cos(timeRef.current * 4.2 + thetaNorm * 18 + phase) * (0.025 + mids * 0.09);
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
      const swirlAmplitude = (treble * 0.18 + speechDrive * 0.08 + mappedEnergy * 0.05) * Math.sin(timeRef.current * 5.5 + phase * 2);

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

    pointsRef.current.rotation.x += delta * (0.04 + mids * 0.18 + speechDrive * 0.2);
    pointsRef.current.rotation.y += delta * (0.08 + bass * 0.35 + speechDrive * 0.15);
    pointsRef.current.rotation.z += delta * (0.03 + treble * 0.24);

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
}: {
  listening: boolean;
  muted: boolean;
  audioLevel: number;
  audioFrequencies?: Uint8Array;
  speechVelocity: number;
}) {
  const shellRef = useRef<THREE.Mesh>(null);
  const auraRef = useRef<THREE.Mesh>(null);
  const ringARef = useRef<THREE.Mesh>(null);
  const ringBRef = useRef<THREE.Mesh>(null);
  const ringCRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    const bass = sampleBand(audioFrequencies, 0, 0.14);
    const mids = sampleBand(audioFrequencies, 0.14, 0.48);
    const treble = sampleBand(audioFrequencies, 0.48, 1);
    const speechDrive = Math.max(0, speechVelocity);
    const pulse = 1 + audioLevel * 0.18 + bass * 0.22 + speechDrive * 0.08 + (listening ? Math.sin(performance.now() * 0.002) * 0.015 : 0);

    if (shellRef.current) {
      shellRef.current.scale.setScalar(pulse);
      shellRef.current.rotation.x += delta * (0.1 + mids * 0.3);
      shellRef.current.rotation.y += delta * (0.16 + bass * 0.45);
    }

    if (auraRef.current) {
      auraRef.current.scale.setScalar(1.02 + audioLevel * 0.35 + treble * 0.12);
      auraRef.current.rotation.y -= delta * (0.08 + treble * 0.2);
    }

    if (ringARef.current) {
      ringARef.current.rotation.z += delta * (0.32 + speechDrive * 0.4);
      ringARef.current.scale.setScalar(1 + bass * 0.16);
    }
    if (ringBRef.current) {
      ringBRef.current.rotation.y -= delta * (0.24 + mids * 0.34);
      ringBRef.current.scale.setScalar(1 + mids * 0.14);
    }
    if (ringCRef.current) {
      ringCRef.current.rotation.x += delta * (0.28 + treble * 0.5);
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
  const primaryColor = muted ? 0x4e5657 : 0x2df7a3;
  const accentColor = muted ? 0x596162 : 0x66f7ff;

  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 42 }}
      style={{ background: 'transparent', width: '100%', height: '100%' }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
    >
      <fog attach="fog" args={['#04110a', 5.6, 8.8]} />
      <ambientLight intensity={0.35 + audioLevel * 0.28} color={primaryColor} />
      <pointLight position={[0, 0, 4.8]} intensity={2.4 + audioLevel * 1.8} color={accentColor} />
      <pointLight position={[4.8, 3.8, 3]} intensity={1.6 + audioLevel * 1.2} color={primaryColor} />
      <pointLight position={[-5, -4, -3.5]} intensity={1.2 + audioLevel * 0.9} color={accentColor} />
      <spotLight position={[0, 7, 3]} intensity={1.8 + audioLevel * 1.2} color={primaryColor} angle={0.95} penumbra={1} />
      <ReactiveShell listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocity} />
      <AudioSphere listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocity} />
    </Canvas>
  );
}
