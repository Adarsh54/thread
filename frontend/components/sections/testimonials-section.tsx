"use client";

import Image from "next/image";

export function TestimonialsSection() {
  return (
    <section id="about" className="bg-background">
      {/* About Image with Text Overlay */}
      <div className="relative aspect-[16/9] w-full">
        <Image
          src="https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1600&h=900&fit=crop"
          alt="Curated fashion retail experience"
          fill
          className="object-cover"
        />
        {/* Fade gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        {/* Text Overlay */}
        <div className="absolute inset-0 flex items-end justify-center px-6 pb-16 md:px-12 md:pb-24 lg:px-20 lg:pb-32">
          <p className="mx-auto max-w-5xl text-2xl leading-relaxed text-white md:text-3xl lg:text-[2.5rem] lg:leading-snug text-center">
            Your AI agent learns your style, tracks drops, compares prices, and shops for you —
            so you spend less time browsing and more time wearing what you love.
          </p>
        </div>
      </div>
    </section>
  );
}
