import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars, Environment } from "@react-three/drei";
import * as THREE from "three";

function CloudElement({ position, color, opacity = 0.8, scale = 1 }: { position: [number, number, number], color: string, opacity?: number, scale?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += 0.002;
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.5}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial 
          color={color} 
          transparent 
          opacity={opacity} 
          roughness={0.1}
          metalness={0.1}
          envMapIntensity={1}
        />
      </mesh>
    </Float>
  );
}

function DataBlock({ position, color }: { position: [number, number, number], color: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x += 0.01;
    meshRef.current.rotation.y += 0.01;
  });

  return (
    <Float speed={2} rotationIntensity={2} floatIntensity={1}>
      <mesh ref={meshRef} position={position}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </Float>
  );
}

function ConnectionLines() {
   // Simplified visual connections
   return null;
}

function Scene() {
  return (
    <group rotation={[0, -Math.PI / 6, 0]}>
      {/* Main Cloud Composition */}
      <CloudElement position={[0, 0, 0]} color="#3b82f6" scale={1.4} /> {/* Blue Core */}
      <CloudElement position={[-1.2, 0.5, 0.5]} color="#60a5fa" scale={0.9} />
      <CloudElement position={[1.2, -0.2, 0.8]} color="#2563eb" scale={1.1} />
      <CloudElement position={[0.5, 1.2, -0.5]} color="#facc15" scale={0.7} /> {/* Gold Accent */}
      
      {/* Floating Data Blocks */}
      <DataBlock position={[-2, 2, 1]} color="#facc15" />
      <DataBlock position={[2, -1, 2]} color="#3b82f6" />
      <DataBlock position={[-1, -2, 1]} color="#60a5fa" />
      <DataBlock position={[2, 1.5, -1]} color="#ffffff" />

      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#3b82f6" />
      <pointLight position={[-10, -10, -10]} intensity={1} color="#facc15" />
      
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />
    </group>
  );
}

export default function CloudScene() {
  return (
    <div className="w-full h-full min-h-[500px]">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <Scene />
      </Canvas>
    </div>
  );
}