import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function AudioSphere({ muted, audioLevel, audioFrequencies, speechVelocity }: { listening: boolean; muted: boolean; audioLevel: number; audioFrequencies?: Uint8Array; speechVelocity: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const t = useRef(0);
  const originalPositionsRef = useRef<Float32Array | null>(null);

  const { geometry, material } = useMemo(() => {
    const count = 3000;
    const positions = new Float32Array(count * 3);
    
    // Create dots arranged in a sphere
    for (let i = 0; i < count; i++) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      const r = 2 + Math.random() * 0.3; // Tight sphere
      
      positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = r * Math.cos(theta);
    }
    
    originalPositionsRef.current = new Float32Array(positions);
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const mat = new THREE.PointsMaterial({
      color: muted ? 0x404040 : 0x10ff50,
      size: 0.06,
      transparent: true,
      opacity: muted ? 0.4 : 0.85,
      sizeAttenuation: true,
    });
    
    return { geometry: geo, material: mat };
  }, [muted]);

  useFrame((_, delta) => {
    t.current += delta;
    if (!pointsRef.current || !originalPositionsRef.current) return;

    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const origPositions = originalPositionsRef.current;

    // Deform dots based on audio frequencies + speech velocity
    for (let i = 0; i < positions.length; i += 3) {
      const x = origPositions[i];
      const y = origPositions[i + 1];
      const z = origPositions[i + 2];

      // Get direction from center
      const length = Math.sqrt(x * x + y * y + z * z);
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      // Map to frequency based on position angle
      const phi = Math.atan2(z, x);
      
      const freqIdx = Math.floor(((phi + Math.PI) / (Math.PI * 2)) * (audioFrequencies?.length || 128));
      const maxFreqIdx = Math.max(0, Math.min((audioFrequencies?.length || 128) - 1, freqIdx));
      
      const freqSample = audioFrequencies ? audioFrequencies[maxFreqIdx] : audioLevel * 255;
      const freqNorm = Math.min(1, freqSample / 255);

      // Vibration: deform based on frequency + speech velocity (slowdown detection)
      // Speech velocity > 0.05 means user is slowing down = more aggressive deformation
      const velocityMultiplier = 1 + Math.max(0, speechVelocity) * 2;
      const vibration = 1 + freqNorm * 0.5 * velocityMultiplier + Math.sin(t.current * 3 + i * 0.0001) * audioLevel * 0.2;
      const newLength = length * vibration;

      positions[i] = nx * newLength;
      positions[i + 1] = ny * newLength;
      positions[i + 2] = nz * newLength;
    }

    posAttr.needsUpdate = true;

    // Rotate sphere - faster when speech is fast
    const rotationBoost = 1 + Math.max(0, speechVelocity) * 5;
    pointsRef.current.rotation.x += delta * 0.01 * rotationBoost;
    pointsRef.current.rotation.y += delta * 0.02 * rotationBoost;
    pointsRef.current.rotation.z += delta * 0.005 * rotationBoost;

    // Update material based on audio + velocity
    material.opacity = muted ? 0.3 : 0.7 + audioLevel * 0.25 + Math.max(0, speechVelocity) * 0.1;
    material.size = 0.04 + audioLevel * 0.08 + Math.max(0, speechVelocity) * 0.02;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}

export default function RealisticSphere({ listening, muted, audioLevel = 0, audioFrequencies, speechVelocity = 0 }: { listening: boolean; muted: boolean; audioLevel?: number; audioFrequencies?: Uint8Array; speechVelocity?: number }) {
  return (
    <Canvas camera={{ position: [0, 0, 5.2], fov: 46 }} style={{ background: 'transparent', width: '100%', height: '100%' }} gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}>
      <ambientLight intensity={0.3 + audioLevel * 0.15} color={muted ? 0x404040 : 0x10ff50} />
      <pointLight position={[5, 5, 5]} intensity={2 + audioLevel * 1.2} color={muted ? 0x404040 : 0x10ff50} />
      <pointLight position={[-5, -5, -5]} intensity={1 + audioLevel * 0.6} color={0x083020} />
      <spotLight position={[0, 8, 3]} intensity={1.5 + audioLevel * 0.8} color={muted ? 0x404040 : 0x10ff50} angle={1} penumbra={1} />
      <AudioSphere listening={listening} muted={muted} audioLevel={audioLevel} audioFrequencies={audioFrequencies} speechVelocity={speechVelocity} />
    </Canvas>
  );
}
