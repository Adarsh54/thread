"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { useRef, useMemo, Suspense } from "react";
import * as THREE from "three";

function Mannequin() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.15;
    }
  });

  const skinMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#d4a574",
    roughness: 0.7,
    metalness: 0.05,
  }), []);

  const shirtMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#1a1a1a",
    roughness: 0.8,
    metalness: 0.0,
  }), []);

  const pantsMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#2d2d3d",
    roughness: 0.85,
    metalness: 0.0,
  }), []);

  const shoeMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#111111",
    roughness: 0.4,
    metalness: 0.1,
  }), []);

  return (
    <group ref={groupRef} position={[0, -2.8, 0]}>
      {/* Head */}
      <mesh position={[0, 4.55, 0]} material={skinMaterial}>
        <sphereGeometry args={[0.28, 32, 32]} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 4.2, 0]} material={skinMaterial}>
        <cylinderGeometry args={[0.1, 0.12, 0.15, 16]} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 3.55, 0]} material={shirtMaterial}>
        <capsuleGeometry args={[0.35, 0.9, 8, 16]} />
      </mesh>

      {/* Shoulders */}
      <mesh position={[0, 3.95, 0]} material={shirtMaterial}>
        <capsuleGeometry args={[0.15, 0.55, 8, 16]} />
      </mesh>

      {/* Left Upper Arm */}
      <mesh position={[-0.47, 3.42, 0]} rotation={[0, 0, 0.15]} material={shirtMaterial}>
        <capsuleGeometry args={[0.11, 0.55, 8, 16]} />
      </mesh>

      {/* Left Forearm - overlaps with upper arm at elbow */}
      <mesh position={[-0.53, 2.88, 0]} rotation={[0, 0, 0.08]} material={skinMaterial}>
        <capsuleGeometry args={[0.09, 0.45, 8, 16]} />
      </mesh>

      {/* Left Hand */}
      <mesh position={[-0.56, 2.53, 0]} material={skinMaterial}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>

      {/* Right Upper Arm */}
      <mesh position={[0.47, 3.42, 0]} rotation={[0, 0, -0.15]} material={shirtMaterial}>
        <capsuleGeometry args={[0.11, 0.55, 8, 16]} />
      </mesh>

      {/* Right Forearm - overlaps with upper arm at elbow */}
      <mesh position={[0.53, 2.88, 0]} rotation={[0, 0, -0.08]} material={skinMaterial}>
        <capsuleGeometry args={[0.09, 0.45, 8, 16]} />
      </mesh>

      {/* Right Hand */}
      <mesh position={[0.56, 2.53, 0]} material={skinMaterial}>
        <sphereGeometry args={[0.08, 16, 16]} />
      </mesh>

      {/* Hips */}
      <mesh position={[0, 2.85, 0]} material={pantsMaterial}>
        <capsuleGeometry args={[0.3, 0.15, 8, 16]} />
      </mesh>

      {/* Left Upper Leg */}
      <mesh position={[-0.18, 2.25, 0]} material={pantsMaterial}>
        <capsuleGeometry args={[0.13, 0.55, 8, 16]} />
      </mesh>

      {/* Left Lower Leg */}
      <mesh position={[-0.18, 1.5, 0]} material={pantsMaterial}>
        <capsuleGeometry args={[0.1, 0.55, 8, 16]} />
      </mesh>

      {/* Right Upper Leg */}
      <mesh position={[0.18, 2.25, 0]} material={pantsMaterial}>
        <capsuleGeometry args={[0.13, 0.55, 8, 16]} />
      </mesh>

      {/* Right Lower Leg */}
      <mesh position={[0.18, 1.5, 0]} material={pantsMaterial}>
        <capsuleGeometry args={[0.1, 0.55, 8, 16]} />
      </mesh>

      {/* Left Shoe */}
      <mesh position={[-0.18, 1.05, 0.06]} material={shoeMaterial}>
        <boxGeometry args={[0.18, 0.12, 0.32]} />
      </mesh>

      {/* Right Shoe */}
      <mesh position={[0.18, 1.05, 0.06]} material={shoeMaterial}>
        <boxGeometry args={[0.18, 0.12, 0.32]} />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <directionalLight position={[-3, 4, -2]} intensity={0.4} />
      <pointLight position={[0, 6, 3]} intensity={0.8} />
      <hemisphereLight args={["#ffffff", "#444444", 0.5]} />

      <Mannequin />

      <ContactShadows
        position={[0, -2.8, 0]}
        opacity={0.4}
        scale={8}
        blur={2}
        far={4}
      />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.8}
        autoRotate
        autoRotateSpeed={1}
      />
    </>
  );
}

export function MannequinViewer() {
  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0.5, 5.5], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
