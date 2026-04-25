import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface NeuralGraphSphereProps {
  state?: 'idle' | 'thinking' | 'success' | 'error';
  size?: number;
  accent?: 'cyan' | 'blue' | 'violet' | 'amber';
  className?: string;
}

interface Node {
  position: THREE.Vector3;
  originalPosition: THREE.Vector3;
  layer: number;
  pulsePhase: number;
  pulseSpeed: number;
}

const NeuralGraphSphere: React.FC<NeuralGraphSphereProps> = ({
  state = 'idle',
  size = 240,
  accent = 'cyan',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<THREE.LineSegments | null>(null);
  const nodeGeometriesRef = useRef<THREE.InstancedMesh | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const rotationRef = useRef({ x: 0, y: 0, z: 0 });
  const timeRef = useRef(0);

  // Color configuration
  const accentColors = {
    cyan: { primary: '#00ffff', secondary: '#0088ff', dark: '#0055ff', rgb: [0, 1, 1] },
    blue: { primary: '#00bbff', secondary: '#0066ff', dark: '#0044ff', rgb: [0, 0.73, 1] },
    violet: { primary: '#bf00ff', secondary: '#7700ff', dark: '#4400aa', rgb: [0.75, 0, 1] },
    amber: { primary: '#ffaa00', secondary: '#ff8800', dark: '#cc6600', rgb: [1, 0.67, 0] },
  };

  const colors = accentColors[accent];

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.003);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 150;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // Accent-colored point lights
    const rgbColor = new THREE.Color(...(colors.rgb as [number, number, number]));
    const light1 = new THREE.PointLight(rgbColor, 1.5, 300);
    light1.position.set(100, 50, 100);
    scene.add(light1);

    const invertedColor = new THREE.Color(
      1 - colors.rgb[0],
      1 - colors.rgb[1],
      1 - colors.rgb[2]
    );
    const light2 = new THREE.PointLight(invertedColor, 1, 300);
    light2.position.set(-100, -50, -100);
    scene.add(light2);

    // Create neural network graph
    const layers = 3;
    const nodesPerLayer = 80 / layers;
    const nodes: Node[] = [];

    for (let layer = 0; layer < layers; layer++) {
      const radius = 30 + layer * 40;
      const count = Math.floor(nodesPerLayer * (layer + 1));

      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;

        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        const position = new THREE.Vector3(x, y, z);
        nodes.push({
          position: position.clone(),
          originalPosition: position.clone(),
          layer,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.02 + Math.random() * 0.03,
        });
      }
    }

    nodesRef.current = nodes;

    // Create instanced nodes geometry
    const nodeGeometry = new THREE.IcosahedronGeometry(1.5, 2);
    const nodeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...(colors.rgb as [number, number, number])),
      emissive: new THREE.Color(...(colors.rgb as [number, number, number])),
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
    });

    const nodesMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, nodes.length);
    nodesMesh.castShadow = true;
    nodesMesh.receiveShadow = true;

    // Position instances
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < nodes.length; i++) {
      matrix.setPosition(nodes[i].position);
      nodesMesh.setMatrixAt(i, matrix);
    }
    nodesMesh.instanceMatrix.needsUpdate = true;
    scene.add(nodesMesh);
    nodeGeometriesRef.current = nodesMesh;

    // Create connection lines
    const connectionGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors_array: number[] = [];

    // Connect nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = nodes[i].position.distanceTo(nodes[j].position);
        const maxDist = nodes[i].layer === nodes[j].layer ? 60 : 80;

        if (dist < maxDist && Math.random() > 0.7) {
          positions.push(
            nodes[i].position.x,
            nodes[i].position.y,
            nodes[i].position.z,
            nodes[j].position.x,
            nodes[j].position.y,
            nodes[j].position.z
          );

          const alpha = (1 - dist / maxDist) * 0.6;
          colors_array.push(...(colors.rgb as [number, number, number]));
          colors_array.push(alpha);
          colors_array.push(...(colors.rgb as [number, number, number]));
          colors_array.push(alpha);
        }
      }
    }

    connectionGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    connectionGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(colors_array), 4)
    );

    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 1,
      transparent: true,
    });

    const edges = new THREE.LineSegments(connectionGeometry, edgeMaterial);
    scene.add(edges);
    edgesRef.current = edges;

    // Animation loop
    const animationLoop = () => {
      animationIdRef.current = requestAnimationFrame(animationLoop);
      timeRef.current += 0.016;

      // Update rotation based on state
      const rotationSpeed = state === 'thinking' ? 0.003 : 0.001;
      rotationRef.current.y += rotationSpeed;
      rotationRef.current.x += rotationSpeed * 0.3;

      if (nodesMesh) {
        nodesMesh.rotation.x = rotationRef.current.x;
        nodesMesh.rotation.y = rotationRef.current.y;
        nodesMesh.rotation.z = rotationRef.current.z;

        // Update node positions for pulsing effect
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          node.pulsePhase += node.pulseSpeed * (state === 'thinking' ? 1.5 : 1);

          const pulse = 1 + Math.sin(node.pulsePhase) * 0.3;
          const scale = pulse;

          matrix.setPosition(node.originalPosition);
          matrix.scale(new THREE.Vector3(scale, scale, scale));
          nodesMesh.setMatrixAt(i, matrix);
        }
        nodesMesh.instanceMatrix.needsUpdate = true;
      }

      if (edges && connectionGeometry) {
        edges.rotation.x = rotationRef.current.x;
        edges.rotation.y = rotationRef.current.y;
        edges.rotation.z = rotationRef.current.z;

        // Update connection line opacity based on state
        const colorAttribute = connectionGeometry.getAttribute('color');
        if (colorAttribute && state === 'thinking') {
          const colors_data = colorAttribute.array as Float32Array;
          for (let i = 3; i < colors_data.length; i += 4) {
            colors_data[i] = Math.min(colors_data[i] + 0.02, 0.8);
          }
          colorAttribute.needsUpdate = true;
        }
      }

      // Light animation
      light1.intensity = 1.5 + Math.sin(timeRef.current * 0.5) * 0.3;
      light2.intensity = 1 + Math.sin(timeRef.current * 0.7 + Math.PI) * 0.3;

      renderer.render(scene, camera);
    };

    animationLoop();

    // Handle resize
    const handleResize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth || size;
        const height = containerRef.current.clientHeight || size;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };

    window.addEventListener('resize', handleResize);

    // Handle reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      rotationRef.current.y = 0;
      rotationRef.current.x = 0;
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }

      // Cleanup Three.js resources
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      connectionGeometry.dispose();
      edgeMaterial.dispose();
      renderer.dispose();

      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [state, size, accent, colors]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'radial-gradient(circle, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.9) 100%)',
      }}
    />
  );
};

export default NeuralGraphSphere;
