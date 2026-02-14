"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { useRef, useEffect, useState, Suspense, useMemo } from "react";
import * as THREE from "three";
import type { Product } from "@/types/product";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Classify product category into body zone */
function classifyZone(
  category: string | null | undefined
): "top" | "bottom" | "shoes" | "full" | "none" {
  const c = (category ?? "").toLowerCase();
  if (/dress|gown|jumpsuit|romper|onesie|bodysuit/i.test(c)) return "full";
  if (/shoe|sneaker|boot|sandal|slipper|clog|flat|heel|loafer|mule|footwear/i.test(c)) return "shoes";
  if (/pant|jean|trouser|short|legging|jogger|skirt|bottom/i.test(c)) return "bottom";
  if (/top|shirt|tee|blouse|sweater|hoodie|jacket|coat|vest|tank|polo|knit|pullover|crew|henley|cardigan|fleece|sweatshirt|longsleeve|shortsleeve/i.test(c)) return "top";
  return "none";
}

/** Load an image URL and extract dominant color via a small canvas sample */
function extractDominantColor(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 32; // sample at small size for speed
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Skip very light (background) and very dark pixels
        const brightness = data[i] + data[i + 1] + data[i + 2];
        if (brightness > 60 && brightness < 700) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }

      if (count === 0) {
        resolve("#444444");
        return;
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      resolve(`#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`);
    };
    img.onerror = () => resolve("#444444");
    img.src = url;
  });
}

/** Load product image as a Three.js texture */
function loadTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      reject
    );
  });
}

// ── Body part traversal ──────────────────────────────────────────────────────

function applyMaterialToPart(part: THREE.Object3D, material: THREE.Material) {
  part.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
    }
  });
}

// ── MannequinModel ───────────────────────────────────────────────────────────

interface MannequinModelProps {
  product?: Product | null;
}

function MannequinModel({ product }: MannequinModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mannequinRef = useRef<any>(null);
  const [mannequin, setMannequin] = useState<THREE.Object3D | null>(null);

  // Base materials (cached)
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

  // Create mannequin once
  useEffect(() => {
    let cancelled = false;

    import("mannequin-js/src/mannequin.js").then((mod) => {
      if (cancelled) return;
      const { Male, getStage } = mod;
      const man = new Male();

      man.recolor("#d4a574", "#111111", "#2d2d3d", "#444444", "#d4a574", "#1a1a1a", "#c4956a");

      // Smooth head
      man.head.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh && child.name === "HeadShape") {
          child.material = baseMaterials.skin;

          // Hair
          const bbox = new THREE.Box3().setFromObject(child);
          const headSize = new THREE.Vector3();
          bbox.getSize(headSize);
          const headCenter = new THREE.Vector3();
          bbox.getCenter(headCenter);

          const hairMat = new THREE.MeshStandardMaterial({ color: "#1a1209", roughness: 0.9, metalness: 0 });
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
      setMannequin(man);
    });

    return () => { cancelled = true; };
  }, [baseMaterials]);

  // Apply product clothing to mannequin
  useEffect(() => {
    const man = mannequinRef.current;
    if (!man) return;

    // Reset to defaults first
    applyMaterialToPart(man.torso, baseMaterials.shirt);
    applyMaterialToPart(man.pelvis, baseMaterials.pants);
    applyMaterialToPart(man.l_leg, baseMaterials.pants);
    applyMaterialToPart(man.r_leg, baseMaterials.pants);
    applyMaterialToPart(man.l_ankle, baseMaterials.shoes);
    applyMaterialToPart(man.r_ankle, baseMaterials.shoes);

    if (!product?.image_url || !product.category) return;

    const zone = classifyZone(product.category);
    if (zone === "none") return;

    // Extract color and optionally load texture
    (async () => {
      const color = await extractDominantColor(product.image_url!);
      let texture: THREE.Texture | null = null;
      try {
        texture = await loadTexture(product.image_url!);
      } catch { /* fall back to color only */ }

      const clothingMat = new THREE.MeshStandardMaterial({
        color,
        map: texture,
        roughness: 0.75,
        metalness: 0,
      });

      // Apply to the right body parts
      if (zone === "top" || zone === "full") {
        applyMaterialToPart(man.torso, clothingMat);
        // Slightly tint the upper arms to match
        const sleeveMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 });
        applyMaterialToPart(man.l_arm, sleeveMat);
        applyMaterialToPart(man.r_arm, sleeveMat);
      }

      if (zone === "bottom" || zone === "full") {
        const bottomMat = texture
          ? new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.75, metalness: 0 })
          : new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 });
        applyMaterialToPart(man.pelvis, bottomMat);
        applyMaterialToPart(man.l_leg, bottomMat);
        applyMaterialToPart(man.r_leg, bottomMat);
        applyMaterialToPart(man.l_knee, bottomMat);
        applyMaterialToPart(man.r_knee, bottomMat);
      }

      if (zone === "shoes") {
        const shoeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 });
        applyMaterialToPart(man.l_ankle, shoeMat);
        applyMaterialToPart(man.r_ankle, shoeMat);
      }
    })();
  }, [product, baseMaterials]);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
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

function Scene({ product }: { product?: Product | null }) {
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
      <directionalLight position={[-3, 4, -2]} intensity={0.4} />
      <pointLight position={[0, 6, 3]} intensity={0.8} />
      <hemisphereLight args={["#ffffff", "#444444", 0.6]} />

      <MannequinModel product={product} />

      <ContactShadows position={[0, -0.71, 0]} opacity={0.4} scale={8} blur={2} far={4} />

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

// ── Exported component ───────────────────────────────────────────────────────

interface MannequinViewerProps {
  product?: Product | null;
}

export function MannequinViewer({ product }: MannequinViewerProps) {
  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0.8, 3], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={null}>
          <Scene product={product} />
        </Suspense>
      </Canvas>
    </div>
  );
}
