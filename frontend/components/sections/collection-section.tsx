"use client";

import { FadeImage } from "@/components/fade-image";

const collections = [
  {
    id: 1,
    name: "Streetwear",
    description: "Bold fits for the everyday. Curated by your preferences.",
    price: "From $45",
    image: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=600&h=900&fit=crop",
  },
  {
    id: 2,
    name: "Essentials",
    description: "Timeless basics that anchor any wardrobe.",
    price: "From $30",
    image: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=600&h=900&fit=crop",
  },
  {
    id: 3,
    name: "Evening",
    description: "Statement pieces for when the occasion calls.",
    price: "From $120",
    image: "https://images.unsplash.com/photo-1518622358385-8ea7d0794bf6?w=600&h=900&fit=crop",
  },
];

export function CollectionSection() {
  return (
    <section id="accessories" className="bg-background">
      {/* Section Title */}
      <div className="px-6 py-20 md:px-12 lg:px-20 md:py-10">
        <h2 className="text-3xl font-medium tracking-tight text-foreground md:text-4xl">
          Collections
        </h2>
      </div>

      {/* Collections Grid/Carousel */}
      <div className="pb-24">
        {/* Mobile: Horizontal Carousel */}
        <div className="flex gap-6 overflow-x-auto px-6 pb-4 md:hidden snap-x snap-mandatory scrollbar-hide">
          {collections.map((item) => (
            <div key={item.id} className="group flex-shrink-0 w-[75vw] snap-center">
              {/* Image */}
              <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-secondary">
                <FadeImage
                  src={item.image || "/placeholder.svg"}
                  alt={item.name}
                  fill
                  className="object-cover group-hover:scale-105"
                />
              </div>

              {/* Content */}
              <div className="py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium leading-snug text-foreground">
                      {item.name}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <span className="text-lg font-medium text-foreground">
                    {item.price}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: Grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-8 md:px-12 lg:px-20">
          {collections.map((item) => (
            <div key={item.id} className="group">
              {/* Image */}
              <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-secondary">
                <FadeImage
                  src={item.image || "/placeholder.svg"}
                  alt={item.name}
                  fill
                  className="object-cover group-hover:scale-105"
                />
              </div>

              {/* Content */}
              <div className="py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium leading-snug text-foreground">
                      {item.name}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <span className="font-medium text-foreground text-2xl">
                    {item.price}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
