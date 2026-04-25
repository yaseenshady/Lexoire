import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Preload } from '@react-three/drei';
import * as THREE from 'three';

interface NeuralGlobeProps {
  state?: 'idle' | 'thinking' | 'success' | 'error';
  size?: number;
  accentColor?: 'cyan' | 'blue' | 'violet' | 'amber';
  className?: string;
}

interface Node {
  position: THREE.Vector3;
  originalPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  pulsePhase: number;
  pulseSpeed: number;
  layer: number;
}

const accentColorMap = {
  cyan: { 
    primary: [0, 1, 1], 
    secondary: [0, 0.55, 1], 
    dark: [0, 0.33, 1],
    primaryHex: '#00ffff',
    secondaryHex: '#0088ff',
    darkHex: '#0055ff'
  },
  blue: { 
    primary: [0, 0.73, 1], 
    secondary: [0, 0.4, 1], 
    dark: [0, 0.27, 1],
    primaryHex: '#00bbff',
    secondaryHex: '#0066ff',
    darkHex: '#0044ff'
  },
  violet: { 
    primary: [0.75, 0, 1], 
    secondary: [0.47, 0, 1], 
    dark: [0.27, 0, 0.67],
    primaryHex: '#bf00ff',
    secondaryHex: '#7700ff',
    darkHex: '#4400aa'
  },
  amber: { 
    primary: [1, 0.67, 0], 
    secondary: [1, 0.53, 0], 
    dark: [0.8, 0.4, 0],
    primaryHex: '#ffaa00',
    secondaryHex: '#ff8800',
    darkHex: '#cc6600'
  },
};

const NodesLayer: React.FC<{
  nodes: Node[];
  state: string;
  colors: { primary: number[]; secondary: number[]; dark: number[] };
}> = ({ nodes, state, colors }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const pulsePhaseRef = useRef<number[]>(nodes.map((n) => n.pulsePhase));
  const timeRef = useRef(0);

  useFrame(() => {
    if (!meshRef.current) return;

    timeRef.current += 0.016;
    const baseIntensity = state === 'thinking' ? 1.5 : 1;

    const matrix = new THREE.Matrix4();
    nodes.forEach((node, i) => {
      const phases = pulsePhaseRef.current;
      phases[i] += node.pulseSpeed * baseIntensity;

      const pulse =
        1 + Math.sin(phases[i]) * (state === 'thinking' ? 0.4 : 0.2);
      const scale = pulse;

      matrix.setPosition(node.position);
      matrix.scale(new THREE.Vector3(scale, scale, scale));
      meshRef.current?.setMatrixAt(i, matrix);
    });

    if (meshRef.current.instanceMatrix) {
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  const geometry = new THREE.IcosahedronGeometry(1.2, 2);
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...(colors.primary as [number, number, number])),
    emissive: new THREE.Color(
      ...(colors.primary as [number, number, number])
    ),
    emissiveIntensity: state === 'thinking' ? 1 : 0.6,
    roughness: 0.15,
    metalness: 0.9,
    toneMapped: false,
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, nodes.length]} />
  );
};

const ConnectionLines: React.FC<{
  nodes: Node[];
  state: string;
  colors: { primary: number[]; secondary: number[]; dark: number[] };
}> = ({ nodes, state, colors }) => {
  const linesRef = useRef<THREE.LineSegments>(null);
  const colorAttrRef = useRef<Float32Array | null>(null);

  const { geometry, initialColors } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const cols: number[] = [];
    const connections: number[] = [];

    // Create connections between nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < Math.min(i + 30, nodes.length); j++) {
        const dist = nodes[i].position.distanceTo(nodes[j].position);
        const layerMatch = nodes[i].layer === nodes[j].layer;
        const maxDist = layerMatch ? 50 : 70;

        if (dist < maxDist && Math.random() > 0.5) {
          positions.push(
            nodes[i].position.x,
            nodes[i].position.y,
            nodes[i].position.z,
            nodes[j].position.x,
            nodes[j].position.y,
            nodes[j].position.z
          );

          const alpha = Math.max(0.3, (1 - dist / maxDist) * 0.7);
          cols.push(...colors.primary, alpha);
          cols.push(...colors.primary, alpha);

          connections.push(i, j);
        }
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 4));

    return { geometry: geo, initialColors: cols };
  }, [nodes, colors]);

  useFrame(() => {
    if (!linesRef.current) return;

    if (state === 'thinking') {
      const colorAttr = geometry.getAttribute('color');
      if (colorAttr && !colorAttrRef.current) {
        colorAttrRef.current = colorAttr.array as Float32Array;
      }

      if (colorAttrRef.current) {
        for (let i = 3; i < colorAttrRef.current.length; i += 4) {
          colorAttrRef.current[i] = Math.min(
            colorAttrRef.current[i] + 0.015,
            0.9
          );
        }
        colorAttr.needsUpdate = true;
      }
    } else if (colorAttrRef.current) {
      for (let i = 3; i < colorAttrRef.current.length; i += 4) {
        colorAttrRef.current[i] = Math.max(
          colorAttrRef.current[i] - 0.01,
          initialColors[i]
        );
      }
      const colorAttr = geometry.getAttribute('color');
      if (colorAttr) {
        colorAttr.needsUpdate = true;
      }
    }
  });

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    linewidth: 1,
    transparent: true,
    fog: true,
  });

  return <primitive object={new THREE.LineSegments(geometry, material)} />;
};

const OrbitalRings: React.FC<{
  colors: { primary: number[]; secondary: number[]; dark: number[] };
}> = ({ colors }) => {
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!group.current) return;
    group.current.children.forEach((ring, i) => {
      ring.rotation.x += 0.0005 * (i % 2 === 0 ? 1 : -1);
      ring.rotation.z += 0.0003 * (i % 2 === 0 ? -1 : 1);
    });
  });

  const rings = [
    { radius: 80, color: colors.primary, opacity: 0.15 },
    { radius: 110, color: colors.secondary, opacity: 0.12 },
    { radius: 140, color: colors.dark, opacity: 0.1 },
  ];

  return (
    <group ref={group}>
      {rings.map((ring, i) => (
        <mesh key={i} rotation={[Math.random(), Math.random(), Math.random()]}>
          <torusGeometry args={[ring.radius, 1, 64, 8]} />
          <meshStandardMaterial
            color={new THREE.Color(...(ring.color as [number, number, number]))}
            emissive={new THREE.Color(...(ring.color as [number, number, number]))}
            emissiveIntensity={0.3}
            transparent
            opacity={ring.opacity}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
};

const GlowingCore: React.FC<{
  colors: { primary: number[]; secondary: number[]; dark: number[] };
  state: string;
}> = ({ colors, state }) => {
  const coreRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  useFrame(() => {
    if (!coreRef.current) return;
    timeRef.current += 0.016;

    const scale = 1 + Math.sin(timeRef.current * 2) * (state === 'thinking' ? 0.3 : 0.15);
    coreRef.current.scale.set(scale, scale, scale);

    const material = coreRef.current.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 0.8 + Math.sin(timeRef.current * 1.5) * 0.4;
  });

  return (
    <mesh ref={coreRef}>
      <sphereGeometry args={[15, 32, 32]} />
      <meshStandardMaterial
        color={new THREE.Color(...(colors.primary as [number, number, number]))}
        emissive={new THREE.Color(...(colors.secondary as [number, number, number]))}
        emissiveIntensity={1}
        transparent
        opacity={0.4}
        toneMapped={false}
      />
    </mesh>
  );
};

const SphereShell: React.FC<{
  colors: { primary: number[]; secondary: number[]; dark: number[] };
}> = ({ colors }) => {
  return (
    <mesh>
      <icosahedronGeometry args={[120, 4]} />
      <meshStandardMaterial
        color={new THREE.Color(...(colors.dark as [number, number, number]))}
        emissive={new THREE.Color(0, 0, 0)}
        transparent
        opacity={0.05}
        wireframe={false}
        toneMapped={false}
      />
    </mesh>
  );
};

const NeuralGlobeContent: React.FC<{
  state: string;
  colors: { primary: number[]; secondary: number[]; dark: number[] };
  prefersReducedMotion: boolean;
}> = ({ state, colors, prefersReducedMotion }) => {
  const { nodes } = useMemo(() => {
    const nodeList: Node[] = [];
    const layers = 3;
    const nodesPerLayer = 120 / layers;

    for (let layer = 0; layer < layers; layer++) {
      const radius = 35 + layer * 35;
      const count = Math.floor(nodesPerLayer * (layer + 1));

      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        const position = new THREE.Vector3(x, y, z);
        nodeList.push({
          position: position.clone(),
          originalPosition: position.clone(),
          velocity: new THREE.Vector3(0, 0, 0),
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.015 + Math.random() * 0.035,
          layer,
        });
      }
    }

    return { nodes: nodeList };
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  const rotationSpeedRef = useRef(0);

  useFrame(() => {
    if (!groupRef.current) return;

    const targetSpeed = prefersReducedMotion 
      ? 0 
      : state === 'thinking' ? 0.0015 : 0.0005;
    rotationSpeedRef.current +=
      (targetSpeed - rotationSpeedRef.current) * 0.05;

    groupRef.current.rotation.y += rotationSpeedRef.current;
    groupRef.current.rotation.x += rotationSpeedRef.current * 0.1;
  });

  return (
    <group ref={groupRef}>
      <OrbitalRings colors={colors} />
      <GlowingCore colors={colors} state={state} />
      <SphereShell colors={colors} />
      <NodesLayer nodes={nodes} state={state} colors={colors} />
      <ConnectionLines nodes={nodes} state={state} colors={colors} />
    </group>
  );
};

const EffectsLayer: React.FC = () => {
  // Simple layer for vignette effect using canvas fog
  return null;
};

const NeuralGlobe: React.FC<NeuralGlobeProps> = ({
  state = 'idle',
  size = 300,
  accentColor = 'cyan',
  className = '',
}) => {
  const colors = accentColorMap[accentColor];
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      className={`relative rounded-full overflow-hidden shadow-2xl ${className}`}
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.95) 100%)',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 200], fov: 60, near: 0.1, far: 1000 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          precision: 'highp',
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 100, 800]} />

        <ambientLight intensity={0.25} />
        <pointLight
          position={[100, 100, 100]}
          intensity={1.2}
          color={'#00ffff'}
          distance={500}
        />
        <pointLight
          position={[-100, -50, -100]}
          intensity={0.8}
          color={'#0088ff'}
          distance={500}
        />

        <NeuralGlobeContent state={state} colors={colors} prefersReducedMotion={prefersReducedMotion} />
        <EffectsLayer />

        <OrbitControls
          autoRotate={state === 'idle'}
          autoRotateSpeed={2}
          enablePan={false}
          enableZoom={true}
          minDistance={150}
          maxDistance={500}
        />
        <Preload all />
      </Canvas>

      {/* HUD Status Label */}
      <div
        className="absolute top-4 left-1/2 transform -translate-x-1/2 text-center pointer-events-none"
        style={{
          opacity: state === 'idle' ? 0.5 : 1,
          transition: 'opacity 0.3s ease',
        }}
      >
        <div
          className="text-xs font-mono uppercase tracking-wider"
          style={{
            color: colors.primaryHex,
            textShadow: `0 0 10px ${colors.primaryHex}`,
            filter: 'drop-shadow(0 0 5px rgba(0, 0, 0, 0.8))',
          }}
        >
          {state === 'thinking' ? 'PROCESSING' : state === 'success' ? 'SUCCESS' : state === 'error' ? 'ERROR' : 'IDLE'}
        </div>
      </div>
    </div>
  );
};

export default NeuralGlobe;
