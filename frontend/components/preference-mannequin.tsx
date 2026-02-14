"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useMemo } from "react";
import * as THREE from "three";

// ── Types ────────────────────────────────────────────────────────────────────

interface BodyParams {
  heightCm: number;
  weightKg: number;
  gender: "male" | "female" | "non-binary" | null;
  fitPreference: "slim" | "regular" | "relaxed" | "oversized" | null;
}

// ── Model ────────────────────────────────────────────────────────────────────

function PreferenceModel({ heightCm, weightKg, gender, fitPreference }: BodyParams) {
  const groupRef = useRef<THREE.Group>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mannequinRef = useRef<any>(null);
  const [mannequin, setMannequin] = useState<THREE.Object3D | null>(null);
  const prevGenderRef = useRef<string | null>(null);

  const baseMaterials = useMemo(
    () => ({
      skin: new THREE.MeshStandardMaterial({ color: "#d4a574", roughness: 0.6, metalness: 0.05 }),
      shirt: new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.7, metalness: 0 }),
      pants: new THREE.MeshStandardMaterial({ color: "#2d2d3d", roughness: 0.7, metalness: 0 }),
      shoes: new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.6, metalness: 0.05 }),
      joints: new THREE.MeshStandardMaterial({ color: "#444444", roughness: 0.7, metalness: 0 }),
    }),
    []
  );

  // Rebuild mannequin when gender changes
  const effectiveGender = gender ?? "male";

  useEffect(() => {
    let cancelled = false;

    import("mannequin-js/src/mannequin.js").then((mod) => {
      if (cancelled) return;
      const { Male, Female, getStage } = mod;

      const isFemale = effectiveGender === "female";
      const man = isFemale ? new Female() : new Male();

      man.recolor("#d4a574", "#111111", "#2d2d3d", "#444444", "#d4a574", "#1a1a1a", "#c4956a");

      // Hair
      man.head.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.name === "HeadShape") {
          child.material = baseMaterials.skin;

          const bbox = new THREE.Box3().setFromObject(child);
          const headSize = new THREE.Vector3();
          bbox.getSize(headSize);
          const headCenter = new THREE.Vector3();
          bbox.getCenter(headCenter);

          const hairMat = new THREE.MeshStandardMaterial({ color: "#1a1209", roughness: 0.9, metalness: 0 });

          if (isFemale) {
            // Longer hair for female
            const hairGeo = new THREE.SphereGeometry(headSize.x * 0.58, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
            const pos = hairGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
              const noise = 1 + Math.sin(x * 15) * Math.cos(z * 15) * 0.04;
              pos.setXYZ(i, x * noise, y * noise, z * noise);
            }
            hairGeo.computeVertexNormals();

            const hairMesh = new THREE.Mesh(hairGeo, hairMat);
            child.getWorldPosition(headCenter);
            child.parent?.worldToLocal(headCenter);
            hairMesh.position.copy(headCenter);
            hairMesh.position.y += headSize.y * 0.05;

            // Side/back hair (longer)
            const sideGeo = new THREE.SphereGeometry(headSize.x * 0.59, 24, 16, Math.PI * 0.5, Math.PI * 1.6, Math.PI * 0.2, Math.PI * 0.6);
            const sideMesh = new THREE.Mesh(sideGeo, hairMat);
            sideMesh.position.copy(hairMesh.position);
            sideMesh.position.y -= headSize.y * 0.15;

            if (child.parent) {
              child.parent.add(hairMesh);
              child.parent.add(sideMesh);
            }
          } else {
            // Short hair for male
            const hairGeo = new THREE.SphereGeometry(headSize.x * 0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
            const pos = hairGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
              const noise = 1 + Math.sin(x * 20) * Math.cos(z * 20) * 0.03;
              pos.setXYZ(i, x * noise, y * noise, z * noise);
            }
            hairGeo.computeVertexNormals();

            const hairMesh = new THREE.Mesh(hairGeo, hairMat);
            child.getWorldPosition(headCenter);
            child.parent?.worldToLocal(headCenter);
            hairMesh.position.copy(headCenter);
            hairMesh.position.y += headSize.y * 0.07;

            const sideGeo = new THREE.SphereGeometry(headSize.x * 0.56, 24, 12, Math.PI * 0.6, Math.PI * 1.5, Math.PI * 0.25, Math.PI * 0.45);
            const sideMesh = new THREE.Mesh(sideGeo, hairMat);
            sideMesh.position.copy(hairMesh.position);
            sideMesh.position.y -= headSize.y * 0.05;

            if (child.parent) {
              child.parent.add(hairMesh);
              child.parent.add(sideMesh);
            }
          }
        }
      });

      // Natural pose
      man.torso.bend = 2;
      man.head.nod = -5;
      man.l_arm.raise = -5;
      man.r_arm.raise = -5;
      man.l_arm.straddle = 8;
      man.r_arm.straddle = 8;
      man.l_elbow.bend = 15;
      man.r_elbow.bend = 15;

      man.removeFromParent();

      const stage = getStage();
      if (stage?.renderer) {
        stage.renderer.setAnimationLoop(null);
        stage.renderer.dispose();
        if (stage.renderer.domElement?.parentNode) stage.renderer.domElement.remove();
      }

      mannequinRef.current = man;
      prevGenderRef.current = effectiveGender;
      setMannequin(man);
    });

    return () => { cancelled = true; };
  }, [effectiveGender, baseMaterials]);

  // Apply body scaling reactively when height/weight/fit changes
  useEffect(() => {
    if (!groupRef.current) return;

    // Height: 170cm = 1.0 baseline scale
    const heightScale = heightCm / 170;

    // Weight: 70kg = 1.0 baseline. Maps to body width scaling.
    // Clamp widening to reasonable range (0.85 – 1.35)
    const weightRatio = weightKg / 70;
    const bodyWidth = 0.85 + (weightRatio - 0.57) * 0.65; // maps 40kg→0.85, 70kg→1.0, 150kg→1.35

    // Fit preference adjusts clothing volume
    const fitMultiplier =
      fitPreference === "slim" ? 0.95 :
      fitPreference === "relaxed" ? 1.05 :
      fitPreference === "oversized" ? 1.12 :
      1.0;

    const finalWidth = Math.max(0.8, Math.min(1.4, bodyWidth * fitMultiplier));

    groupRef.current.scale.set(
      1.1 * finalWidth,
      1.1 * heightScale,
      1.1 * finalWidth
    );
  }, [heightCm, weightKg, fitPreference]);

  // Gentle sway
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.15;
    }
  });

  if (!mannequin) return null;

  return (
    <group ref={groupRef} scale={[1.1, 1.1, 1.1]}>
      <primitive object={mannequin} />
    </group>
  );
}

// ── Scene ────────────────────────────────────────────────────────────────────

function Scene(props: BodyParams) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.4} />
      <pointLight position={[0, 6, 3]} intensity={0.8} />
      <hemisphereLight args={["#ffffff", "#444444", 0.6]} />

      <PreferenceModel {...props} />

      <ContactShadows position={[0, -0.71, 0]} opacity={0.4} scale={8} blur={2} far={4} />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.8}
        autoRotate
        autoRotateSpeed={0.8}
      />
    </>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export interface PreferenceMannequinProps {
  heightCm: number;
  weightKg: number;
  gender: "male" | "female" | "non-binary" | null;
  fitPreference: "slim" | "regular" | "relaxed" | "oversized" | null;
}

export function PreferenceMannequin(props: PreferenceMannequinProps) {
  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0.8, 4.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene {...props} />
        </Suspense>
      </Canvas>
    </div>
  );
}
