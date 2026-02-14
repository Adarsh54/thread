"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useCallback } from "react";

export function GallerySection() {
  const galleryRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  const images = [
    { src: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1200&h=800&fit=crop", alt: "Fashion editorial shoot" },
    { src: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=1200&h=800&fit=crop", alt: "Styled outfit lookbook" },
    { src: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&h=800&fit=crop", alt: "Runway collection" },
    { src: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200&h=800&fit=crop", alt: "Shopping experience" },
  ];

  const updateTransform = useCallback(() => {
    if (!galleryRef.current) return;

    const rect = galleryRef.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const sectionHeight = galleryRef.current.offsetHeight;

    const scrollableRange = sectionHeight - windowHeight;
    const scrolled = -rect.top;
    const progress = Math.max(0, Math.min(1, scrolled / scrollableRange));

    setScrollProgress(progress);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(updateTransform);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateTransform();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [updateTransform]);

  const isLastImage = images.length - 1;

  const fullscreenStartProgress = 0.6;
  const fullscreenProgress = Math.max(0, Math.min(1, (scrollProgress - fullscreenStartProgress) / (1 - fullscreenStartProgress)));

  const easedFullscreenProgress = 1 - Math.pow(1 - fullscreenProgress, 3);

  return (
    <section
      id="gallery"
      ref={galleryRef}
      className="relative bg-black"
      style={{ minHeight: `${(images.length + 1) * 100}vh` }}
    >
      {/* Sticky container */}
      <div className="sticky top-0 h-screen overflow-hidden flex items-center justify-center px-4">
        <div className="relative w-full max-w-5xl h-[70vh] md:h-[80vh]">
          {images.map((image, index) => {
            const isLast = index === isLastImage;

            const imageProgress = (scrollProgress * images.length) - index;
            const stackProgress = Math.max(0, Math.min(1, imageProgress));

            let translateY = (1 - stackProgress) * 100;
            let scale = 0.8 + (stackProgress * 0.2);
            let opacity = stackProgress;

            if (isLast) {
              const normalScale = 0.8 + (stackProgress * 0.2);
              const expandedScale = 1 + (easedFullscreenProgress * 0.8);
              scale = normalScale + (Math.max(0, stackProgress - 0.8) * 5) * (expandedScale - normalScale);
            }

            const zIndex = index;

            const borderRadius = isLast && easedFullscreenProgress > 0.3 ? (1 - easedFullscreenProgress) * 16 : undefined;

            return (
              <div
                key={index}
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  zIndex,
                  transform: `translate3d(0, ${translateY}%, 0) scale(${scale}) translateZ(0)`,
                  WebkitTransform: `translate3d(0, ${translateY}%, 0) scale(${scale}) translateZ(0)`,
                  opacity,
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  willChange: 'transform, opacity',
                  WebkitFontSmoothing: 'antialiased',
                }}
              >
                <div
                  className="relative w-full h-full overflow-hidden rounded-xl md:rounded-2xl"
                  style={{
                    borderRadius: borderRadius !== undefined ? `${borderRadius}px` : undefined,
                  }}
                >
                  <Image
                    src={image.src || "/placeholder.svg"}
                    alt={image.alt}
                    fill
                    className="object-cover"
                    priority={index < 3}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
