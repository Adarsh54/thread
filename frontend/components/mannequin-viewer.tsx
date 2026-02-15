"use client";

import { useRef, useEffect, useState } from "react";
import type { OrbitControls as OrbitControlsType } from "three/examples/jsm/controls/OrbitControls.js";
import type { Product } from "@/types/product";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// Default colors
const DEFAULT_HEAD = "#d4a574";
const DEFAULT_TORSO = "#1a1a1a";
const DEFAULT_PELVIS = "#2d2d3d";
const DEFAULT_LIMBS = "#d4a574";
const DEFAULT_JOINTS = "#444444";
const DEFAULT_SHOES = "#111111";
const DEFAULT_NAILS = "#c4956a";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resetMannequin(man: any) {
  man.recolor(DEFAULT_HEAD, DEFAULT_SHOES, DEFAULT_PELVIS, DEFAULT_JOINTS, DEFAULT_LIMBS, DEFAULT_TORSO, DEFAULT_NAILS);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyClothing(man: any, product: Product | null | undefined, colorHex: string | null) {
  resetMannequin(man);

  if (!product?.category) return;

  const zone = classifyZone(product.category);
  if (zone === "none") return;

  const color = colorHex || "#666666";

  if (zone === "top" || zone === "full") {
    // Torso takes (color, jointColor)
    man.torso.recolor(color, color);
    man.l_arm.recolor(color, color);
    man.r_arm.recolor(color, color);
    man.l_elbow.recolor(color, color);
    man.r_elbow.recolor(color, color);
  }

  if (zone === "bottom" || zone === "full") {
    man.pelvis.recolor(color);
    man.l_leg.recolor(color, color);
    man.r_leg.recolor(color, color);
    man.l_knee.recolor(color, color);
    man.r_knee.recolor(color, color);
  }

  if (zone === "shoes") {
    man.l_ankle.recolor(color, color);
    man.r_ankle.recolor(color, color);
  }
}

// ── MannequinViewer ──────────────────────────────────────────────────────────

interface MannequinViewerProps {
  product?: Product | null;
  /** Hex color from AI analysis (e.g. "#2b4a8f"). More accurate than pixel sampling. */
  colorHex?: string | null;
}

export function MannequinViewer({ product, colorHex }: MannequinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mannequinRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stageRef = useRef<any>(null);
  const controlsRef = useRef<OrbitControlsType | null>(null);
  const initRef = useRef(false);
  const [ready, setReady] = useState(false);

  // Initialize mannequin-js once
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const container = containerRef.current;
    if (!container) return;

    import("mannequin-js/src/mannequin.js")
      .then((mod) => {
        const { Male, getStage } = mod;
        const stage = getStage();
        stageRef.current = stage;

        if (!stage?.renderer) return;

        // Move mannequin-js's canvas into our container
        const canvas = stage.renderer.domElement;
        canvas.style.cssText = "width:100%; height:100%; position:absolute; top:0; left:0; border-radius:inherit;";
        container.appendChild(canvas);

        // Transparent background
        stage.scene.background = null;
        stage.renderer.setClearColor(0x000000, 0);

        // Resize to container
        const rect = container.getBoundingClientRect();
        stage.renderer.setSize(rect.width, rect.height);
        stage.camera.aspect = rect.width / rect.height;
        stage.camera.position.set(0, 0, 4.5);
        stage.camera.updateProjectionMatrix();

        // Create mannequin
        const man = new Male();
        mannequinRef.current = man;

        // Hide ground plane if present
        if (stage.ground) stage.ground.visible = false;

        // Add OrbitControls for drag-to-rotate, scroll-to-zoom
        import("three/examples/jsm/controls/OrbitControls.js").then(({ OrbitControls }) => {
          const controls = new OrbitControls(stage.camera, canvas);
          controls.enableDamping = true;
          controls.dampingFactor = 0.08;
          controls.enablePan = true;
          controls.minDistance = 2;
          controls.maxDistance = 10;
          controls.target.set(0, 0, 0);
          controlsRef.current = controls;

          // Use mannequin-js's animation loop hook to update controls each frame
          stage.animationLoop = () => {
            controls.update();
          };
        });

        setReady(true);
      })
      .catch((err) => {
        console.error("[MannequinViewer] Failed to load mannequin-js:", err);
      });

    // Keep renderer sized to container
    const resizeObserver = new ResizeObserver((entries) => {
      const stage = stageRef.current;
      if (!stage?.renderer) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        stage.renderer.setSize(width, height);
        stage.camera.aspect = width / height;
        stage.camera.updateProjectionMatrix();
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (controlsRef.current) controlsRef.current.dispose();
    };
  }, []);

  // Apply clothing when product/color changes or mannequin becomes ready
  useEffect(() => {
    if (!ready) return;
    const man = mannequinRef.current;
    if (!man) return;
    applyClothing(man, product, colorHex ?? null);
  }, [product, colorHex, ready]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full relative overflow-hidden"
      style={{ minHeight: 300 }}
    />
  );
}
